// What the backup holds beyond what the engine parser reads: every site and
// its document root, other WordPress installs, every database, email per
// domain, the DNS zones, cron, SSL, FTP. It never decides whether the engine
// accepts the backup, and it keeps only names that are safe to show (domains,
// database names, folders) and counts: never a password, a hash, a key, the
// text of a DNS record or the command of a cron job.

import { binary } from './binary.js';
import { cut, fields, trimChars, trimSpace } from './go.js';
import type { TarReader } from './tar.js';

const MiB = 1024 * 1024;
const MAX_TRACKED = 5000;
const VERSION_READ_CAP = 64 * 1024;
const RR_TYPES = new Set([
  'A',
  'AAAA',
  'AFSDB',
  'ALIAS',
  'CAA',
  'CERT',
  'CNAME',
  'DNAME',
  'DNSKEY',
  'DS',
  'HINFO',
  'HTTPS',
  'LOC',
  'MX',
  'NAPTR',
  'NS',
  'PTR',
  'RP',
  'SOA',
  'SPF',
  'SRV',
  'SSHFP',
  'SVCB',
  'TLSA',
  'TXT',
  'URI',
]);
const CLASSES = new Set(['IN', 'CH', 'HS', 'CS']);
const reWpVersion = /\$wp_version[\t\n\f\r ]*=[\t\n\f\r ]*['"]([0-9][0-9A-Za-z.-]{0,31})['"]/;

export interface Totals {
  bytes: number;
  files: number;
}

/** Record counts by type, from a BIND zone file (cPanel dnszones/<zone>.db). */
export function countZone(content: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const records: string[] = [];
  let current = '';
  let depth = 0;
  for (const raw of content.split('\n')) {
    // Drop the comment (a ';' outside quotes) and follow parentheses.
    let line = '';
    let quoted = false;
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i]!;
      if (ch === '"') quoted = !quoted;
      if (ch === ';' && !quoted) break;
      if (!quoted && ch === '(') {
        depth += 1;
        line += ' ';
        continue;
      }
      if (!quoted && ch === ')') {
        depth = Math.max(0, depth - 1);
        line += ' ';
        continue;
      }
      line += ch;
    }
    current = current === '' ? line : `${current} ${line.trim()}`;
    if (depth === 0) {
      records.push(current);
      current = '';
    }
  }
  if (current !== '') records.push(current);
  for (const record of records) {
    if (record.trim() === '' || record.trimStart().startsWith('$')) continue;
    const tokens = fields(record);
    // Without leading space the first token is the owner name.
    let i = /^[\t ]/.test(record) ? 0 : 1;
    while (i < tokens.length) {
      const token = tokens[i]!.toUpperCase();
      if (/^[0-9]+[SMHDW]?$/i.test(token) || CLASSES.has(token)) i += 1;
      else break;
    }
    const type = tokens[i]?.toUpperCase();
    if (!type) continue;
    const key = RR_TYPES.has(type) ? type : 'OTHER';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Cron jobs in a crontab: lines that are not empty, a comment or a variable. */
export function countCron(content: string): number {
  let jobs = 0;
  for (const raw of content.split('\n')) {
    const line = trimSpace(raw);
    if (line === '' || line.startsWith('#')) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*[\t ]*=/.test(line)) continue;
    jobs += 1;
  }
  return jobs;
}

/** The values of a top-level list or map in cPanel's userdata/main. */
export function yamlEntries(
  yaml: string,
  key: string,
): { list: string[]; map: [string, string][] } {
  const list: string[] = [];
  const map: [string, string][] = [];
  const lines = yaml.split('\n');
  const at = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (at < 0) return { list, map };
  const inline = trimSpace(lines[at]!.slice(key.length + 1));
  if (inline !== '') {
    // Flow style: [a, b] or {a: b}.
    const body = inline.replace(/^[[{]|[\]}]$/g, '');
    for (const part of body.split(',')) {
      const item = trimChars(trimSpace(part), `'"`);
      if (item === '') continue;
      const [k, v, pair] = cut(item, ':');
      if (pair && inline.startsWith('{'))
        map.push([trimChars(trimSpace(k), `'"`), trimChars(trimSpace(v), `'"`)]);
      else list.push(item);
    }
    return { list, map };
  }
  for (let j = at + 1; j < lines.length; j += 1) {
    const line = lines[j]!;
    if (line.trim() === '') continue;
    if (!/^[\t -]/.test(line)) break;
    const item = /^[\t ]*-[\t ]*(.*)$/.exec(line);
    if (item) {
      const value = trimChars(trimSpace(item[1]!), `'"`);
      if (value !== '') list.push(value);
      continue;
    }
    const pair = /^[\t ]+([^:\t ][^:]*):[\t ]*(.*)$/.exec(line);
    if (pair)
      map.push([trimChars(trimSpace(pair[1]!), `'"`), trimChars(trimSpace(pair[2]!), `'"`)]);
  }
  return { list, map };
}

export class Inventory {
  entries = 0;
  regularFiles = 0;
  firstEntryName: string | null = null;
  readonly roots = new Set<string>();
  outsideRoot = 0;
  unsafeNames = 0;
  /** Regular files under homedir/, Maildir excluded. */
  readonly home: Totals = { bytes: 0, files: 0 };
  /** Regular files under homedir/mail/. */
  readonly mail: Totals = { bytes: 0, files: 0 };
  /** homedir/<a>/ and homedir/<a>/<b>/ folders. */
  readonly folders = new Map<string, Totals>();
  readonly wpConfigDirs = new Set<string>();
  readonly wpVersions = new Map<string, string>();
  readonly dnsZones = new Map<string, Record<string, number>>();
  homePath = '';
  cronJobs: number | null = null;
  readonly sslCertificates = new Set<string>();
  sslPrivateKeys = 0;
  ftpAccounts: number | null = null;
  postgresDumps = 0;
  accountShadow = false;

  /** Every entry, before the parser sees it. */
  observe(name: string, type: string): void {
    if (type === 'g') return;
    this.entries += 1;
    if (this.firstEntryName === null) this.firstEntryName = name;
    if (name.startsWith('/') || name.split('/').includes('..')) this.unsafeNames += 1;
  }

  /**
   * A regular file. `root` is the account root (or null outside one); `read`
   * says whether the parser already read the data. Returns after reading the
   * few small files it counts (never when the parser did, never a sparse file).
   */
  async regular(
    tr: TarReader,
    root: { user: string; rel: string; root: string } | null,
    size: number,
    read: boolean,
    sparse: boolean,
  ): Promise<void> {
    this.regularFiles += 1;
    if (!root) {
      this.outsideRoot += 1;
      return;
    }
    this.roots.add(root.root);
    const { rel, user } = root;
    if (rel.startsWith('homedir/')) {
      const inner = rel.slice(8);
      if (inner.startsWith('mail/')) {
        this.mail.bytes += size;
        this.mail.files += 1;
      } else {
        this.home.bytes += size;
        this.home.files += 1;
        const parts = inner.split('/');
        if (parts.length >= 2) this.addFolder(parts[0]!, size);
        if (parts.length >= 3) this.addFolder(`${parts[0]}/${parts[1]}`, size);
        if (inner.endsWith('/wp-config.php') || inner === 'wp-config.php') {
          if (this.wpConfigDirs.size < MAX_TRACKED)
            this.wpConfigDirs.add(inner.slice(0, -'/wp-config.php'.length));
        }
        if (
          !read &&
          !sparse &&
          inner.endsWith('/wp-includes/version.php') &&
          this.wpVersions.size < MAX_TRACKED
        ) {
          const content = binary(await tr.readCapped(VERSION_READ_CAP));
          const version = reWpVersion.exec(content)?.[1];
          if (version)
            this.wpVersions.set(inner.slice(0, -'/wp-includes/version.php'.length), version);
        }
      }
      return;
    }
    if (read || sparse) return;
    if (rel.startsWith('dnszones/') && rel.endsWith('.db') && this.dnsZones.size < MAX_TRACKED) {
      const zone = rel.slice(9, rel.length - 3);
      this.dnsZones.set(zone, countZone(binary(await tr.readCapped(MiB))));
    } else if (rel === `cron/${user}`) {
      this.cronJobs = countCron(binary(await tr.readCapped(MiB)));
    } else if (rel === 'proftpdpasswd') {
      // Lines with a colon; the password field is never parsed.
      const content = binary(await tr.readCapped(MiB));
      this.ftpAccounts = content.split('\n').filter((line) => line.includes(':')).length;
    } else if (rel === 'homedir_paths') {
      this.homePath = trimSpace(binary(await tr.readCapped(4096)).split('\n')[0] ?? '');
    } else if (rel.startsWith('apache_tls/')) {
      this.sslCertificates.add(rel.slice(11));
      this.sslPrivateKeys += 1;
    } else if (rel.startsWith('sslcerts/') || rel.startsWith('ssl/')) {
      if (/\.(crt|pem)$/.test(rel)) this.sslCertificates.add(rel.slice(rel.lastIndexOf('/') + 1));
    } else if (rel.startsWith('sslkeys/')) {
      this.sslPrivateKeys += 1;
    } else if (rel.startsWith('psql/')) {
      this.postgresDumps += 1;
    } else if (rel === 'shadow') {
      this.accountShadow = true;
    }
  }

  private addFolder(key: string, size: number): void {
    const known = this.folders.get(key);
    if (known) {
      known.bytes += size;
      known.files += 1;
    } else if (this.folders.size < MAX_TRACKED) {
      this.folders.set(key, { bytes: size, files: 1 });
    }
  }
}
