// The cPanel backup parser of the migration engine, ported one to one: the
// collector of the single streaming pass (what it reads, how much, what it
// charges against the 64 MiB metadata budget), the assembly of the Spec
// (WordPress detection, primary domain, PHP version, the WordPress database,
// email of the primary domain, the multisite network) and the strict
// validation gate. Every value from the backup is a binary string (bytes, as
// Go keeps them); see binary.ts and go.ts.

import { binary } from './binary.js';
import { AnalyzerError, capError } from './errors.js';
import {
  cut,
  equalFoldAscii,
  fields,
  keyValue,
  quoteMeta,
  trimChars,
  trimSpace,
  WS,
  yamlScalar,
} from './go.js';
import { DumpScanner, MAX_NETWORK_SITES_NFR, type PrefixScan } from './networkscan.js';
import { computePreviewSlugs } from './slugs.js';
import type { TarReader } from './tar.js';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
export const PER_MAILBOX_CAP = 5 * GiB;
export const TOTAL_MAILBOX_CAP = 25 * GiB;
export const METADATA_READ_CAP = MiB;
export const SQL_HEADER_READ_CAP = 8 * 1024;
export const MAX_METADATA_BYTES = 64 * MiB;
export const MAX_DOMAINS = 500;
export const MAX_MAIL_ACCOUNTS = 5000;
export const MAX_DB_DUMPS = 500;
export const DEFAULT_MAX_NETWORK_SITES = 20;

/** cPanel EasyApache PHP identifiers the engine maps to a version. */
export const PHP_VERSION_MAP: Readonly<Record<string, string>> = {
  'ea-php74': '7.4',
  'ea-php80': '8.0',
  'ea-php81': '8.1',
  'ea-php82': '8.2',
  'ea-php83': '8.3',
};

const ROOT_DIRS = new Set(['cp', 'userdata', 'homedir', 'mysql', 'meta', 'mm', 'psql', 'va']);

export interface DumpInfo {
  relPath: string;
  bytes: number;
  header: string;
}

export interface EmailAccountSpec {
  localPart: string;
  maildirBytes: number;
  skipHistory: boolean;
}

export interface NetworkSiteSpec {
  blogId: bigint;
  domain: string;
  path: string;
  public: number;
  archived: number;
  spam: number;
  deleted: number;
  wwwAlias: boolean;
  previewSlug: string;
}

export interface NetworkSpec {
  subdomainInstall: boolean;
  domain: string;
  path: string;
  sites: NetworkSiteSpec[];
}

/** The engine's Spec, values as binary strings. Local parts never leave the core. */
export interface EngineSpec {
  primaryDomain: string;
  files: { docRootPath: string; totalBytes: number; fileCount: number };
  database: { name: string; dumpPath: string; dumpBytes: number; engine: string; version: string };
  webConfig: { phpVersion: string };
  wordpress: {
    tablePrefix: string;
    legacyUrl: string;
    dbCharset: string;
    dbCollate: string;
    multisite: boolean;
  };
  email: { domain: string; accounts: EmailAccountSpec[] }[];
  network: NetworkSpec | null;
}

/** splitRoot: the account root of an entry name, or null. */
export function splitRoot(name: string): { user: string; rel: string; root: string } | null {
  const trimmed = name.startsWith('./') ? name.slice(2) : name;
  const [first, rest, found] = cut(trimmed, '/');
  if (!found || rest === '') return null;
  if (first.startsWith('cpmove-')) return { user: first.slice(7), rel: rest, root: first };
  const [top] = cut(rest, '/');
  if (ROOT_DIRS.has(top)) return { user: first, rel: rest, root: first };
  return null;
}

/** isVHostFile: a userdata/<x> per-domain file (not main, scope, cache.json, _SSL, subfolders). */
export function isVHostFile(rel: string): boolean {
  const name = rel.startsWith('userdata/') ? rel.slice(9) : rel;
  if (name === 'main' || name === 'scope' || name === 'cache.json') return false;
  return !name.endsWith('_SSL') && !name.includes('/');
}

const reTablePrefix = new RegExp(`\\$table_prefix${WS}*=${WS}*['"]([^'"]*)['"]`);
const reMultisite = new RegExp(
  `define\\(${WS}*['"](MULTISITE|WP_ALLOW_MULTISITE)['"]${WS}*,${WS}*true`,
);
const reSunrise = new RegExp(`define\\(${WS}*['"]SUNRISE['"]`);
// i18n-exempt: the header text of mysqldump, matched as it is
const reServerVer = new RegExp(`Server version${WS}+(\\d+\\.\\d+)`);
const reDistribVer = new RegExp(`Distrib${WS}+(\\d+\\.\\d+)`);
const reHostLabel = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const reDBIdentifier = /^[A-Za-z0-9_$]+$/;
const reSQLWord = /^[A-Za-z0-9_]+$/;
const reEmailLocal = /^[A-Za-z0-9._%+-]+$/;
const rePath = /^\/$|^\/[a-z0-9_-]{1,64}\/$/;
const MAX_IDENTIFIER_LEN = 64;

const defineCache = new Map<string, { quoted: RegExp; raw: RegExp }>();
function definePatterns(name: string) {
  let found = defineCache.get(name);
  if (!found) {
    const head = `define\\(${WS}*['"]${quoteMeta(name)}['"]${WS}*,${WS}*`;
    found = {
      quoted: new RegExp(`${head}['"]([^'"]*)['"]`),
      raw: new RegExp(`${head}([^)\\t\\n\\f\\r ]+)${WS}*\\)`),
    };
    defineCache.set(name, found);
  }
  return found;
}

/** extractDefine: the value of define('NAME', 'value'); the first match wins, even in a comment. */
export function extractDefine(wp: string, name: string): string {
  return definePatterns(name).quoted.exec(wp)?.[1] ?? '';
}

/** extractDefineRaw: the raw token of define('NAME', token), quotes stripped. */
export function extractDefineRaw(wp: string, name: string): string {
  const m = definePatterns(name).raw.exec(wp);
  return m ? trimChars(m[1]!, `'"`) : '';
}

export function extractTablePrefix(wp: string): string {
  return reTablePrefix.exec(wp)?.[1] ?? '';
}

/** The multisite constant the wp-config.php sets (MULTISITE or WP_ALLOW_MULTISITE), or null. */
export function multisiteConstant(wp: string): string | null {
  return reMultisite.exec(wp)?.[1] ?? null;
}

export function parseDumpHeader(header: string): { engine: string; version: string } {
  const engine = header.includes('MariaDB') ? 'mariadb' : 'mysql';
  const version = (reServerVer.exec(header) ?? reDistribVer.exec(header))?.[1] ?? '';
  return { engine, version };
}

export function parsePasswdLocalParts(content: string): string[] {
  const out: string[] = [];
  for (const raw of content.split('\n')) {
    const line = trimSpace(raw);
    if (line === '' || line.startsWith('#')) continue;
    const [local, , ok] = cut(line, ':');
    if (ok && local !== '') out.push(local);
  }
  return out;
}

const phpDefineBool = (token: string) => equalFoldAscii(token, 'true') || token === '1';

const multisiteReject = (reason: string, params: Record<string, string | number> = {}) =>
  new AnalyzerError('multisite_unsupported', reason, params);

/** validateHostname: lowercase RFC 1123 labels, at most 63 bytes (a Kubernetes label value). */
function hostnameProblem(domain: string): string | null {
  if (domain === '') return 'empty';
  if (domain.length > 63) return 'too_long';
  for (const label of domain.split('.')) if (!reHostLabel.test(label)) return 'bad_label';
  return null;
}

export class Collector {
  /** The account user of the first recognized entry. */
  user = '';
  cpMeta = '';
  mainYAML = '';
  wpConfig = '';
  hasWpConfig = false;
  readonly userdata = new Map<string, string>();
  readonly dbDumps = new Map<string, DumpInfo>();
  readonly netScans = new Map<string, Map<string, PrefixScan>>();
  readonly passwd = new Map<string, string>();
  /** Sizes only: the hashes of the shadow file are never kept. */
  readonly shadow = new Map<string, number>();
  readonly quota = new Map<string, number>();
  /** "<domain>/<account>" -> Maildir bytes. */
  readonly mailBytes = new Map<string, number>();
  docrootBytes = 0;
  docrootFiles = 0;
  metaBytes = 0;
  sunrisePHP = false;
  blogsDir = false;

  constructor(private readonly maxNetworkSites = DEFAULT_MAX_NETWORK_SITES) {}

  charge(n: number): void {
    this.metaBytes += n;
    if (this.metaBytes > MAX_METADATA_BYTES) {
      throw capError('metadata_budget', { limitMiB: MAX_METADATA_BYTES / MiB });
    }
  }

  private async bufferMeta(tr: TarReader, limit: number): Promise<string> {
    const b = await tr.readCapped(limit);
    this.charge(b.length);
    return binary(b);
  }

  /**
   * consume: one regular entry. Returns true when it read the entry's data
   * (the caller must not read it again).
   */
  async consume(tr: TarReader, name: string, size: number): Promise<boolean> {
    const root = splitRoot(name);
    if (!root) return false;
    const { user, rel } = root;
    if (this.user === '') this.user = user;

    if (rel.startsWith('homedir/public_html/')) {
      this.docrootBytes += size;
      this.docrootFiles += 1;
      if (rel === 'homedir/public_html/wp-content/sunrise.php') this.sunrisePHP = true;
      else if (rel.startsWith('homedir/public_html/wp-content/blogs.dir/')) this.blogsDir = true;
    }

    if (rel === `cp/${user}`) {
      this.cpMeta = await this.bufferMeta(tr, METADATA_READ_CAP);
      return true;
    }
    if (rel === 'userdata/main') {
      this.mainYAML = await this.bufferMeta(tr, METADATA_READ_CAP);
      return true;
    }
    if (rel === 'homedir/public_html/wp-config.php') {
      this.wpConfig = await this.bufferMeta(tr, METADATA_READ_CAP);
      this.hasWpConfig = this.wpConfig.length > 0;
      return true;
    }
    if (rel.startsWith('userdata/') && isVHostFile(rel)) {
      const domain = rel.slice(9);
      this.charge(domain.length);
      this.userdata.set(domain, await this.bufferMeta(tr, METADATA_READ_CAP));
      if (this.userdata.size > MAX_DOMAINS) throw capError('domains', { limit: MAX_DOMAINS });
      return true;
    }
    if (rel.startsWith('mysql/') && rel.endsWith('.sql') && rel !== 'mysql.sql') {
      const dump = rel.slice(6, rel.length - 4);
      this.charge(dump.length + rel.length);
      const head = await tr.readCapped(SQL_HEADER_READ_CAP);
      this.charge(head.length);
      this.dbDumps.set(dump, { relPath: rel, bytes: size, header: binary(head) });
      if (this.dbDumps.size > MAX_DB_DUMPS) throw capError('dumps', { limit: MAX_DB_DUMPS });
      // Every dump is scanned for the multisite tables, in the same pass.
      const scanner = new DumpScanner((n) => this.charge(n));
      scanner.push(head);
      await tr.readAll((chunk) => scanner.push(chunk));
      scanner.end();
      this.netScans.set(dump, scanner.prefixes);
      return true;
    }
    if (rel.startsWith('homedir/etc/')) {
      const parts = rel.split('/');
      if (parts.length !== 4) return false;
      const domain = parts[2]!;
      const file = parts[3]!;
      if (file !== 'passwd' && file !== 'shadow' && file !== 'quota') return false;
      const b = await tr.readCapped(METADATA_READ_CAP);
      this.charge(domain.length + b.length);
      if (file === 'passwd') this.passwd.set(domain, binary(b));
      else if (file === 'shadow') this.shadow.set(domain, b.length);
      else this.quota.set(domain, b.length);
      if (
        this.passwd.size > MAX_DOMAINS ||
        this.shadow.size > MAX_DOMAINS ||
        this.quota.size > MAX_DOMAINS
      ) {
        throw capError('mail_domains', { limit: MAX_DOMAINS });
      }
      return true;
    }
    if (rel.startsWith('homedir/mail/')) {
      const parts = rel.split('/');
      if (parts.length < 5) return false;
      const key = `${parts[2]}/${parts[3]}`;
      if (!this.mailBytes.has(key)) this.charge(key.length);
      this.mailBytes.set(key, (this.mailBytes.get(key) ?? 0) + size);
      if (this.mailBytes.size > MAX_MAIL_ACCOUNTS) {
        throw capError('mail_accounts', { limit: MAX_MAIL_ACCOUNTS });
      }
    }
    return false;
  }

  /** primaryDomain: main_domain of userdata/main, else DNS= of cp/<user>. */
  cpanelPrimaryDomain(): string {
    return yamlScalar(this.mainYAML, 'main_domain') || keyValue(this.cpMeta, 'DNS');
  }

  /** selectDump: the dump named by DB_NAME, else the largest one. */
  selectDump(dbName: string): { dump: DumpInfo | null; key: string } {
    const named = this.dbDumps.get(dbName);
    if (named) return { dump: named, key: dbName };
    let largest: DumpInfo | null = null;
    for (const d of this.dbDumps.values()) if (!largest || d.bytes > largest.bytes) largest = d;
    if (!largest) return { dump: null, key: dbName };
    return { dump: largest, key: largest.relPath.slice(6, largest.relPath.length - 4) };
  }

  /** assemble: the Spec, or the refusal of the engine. */
  assemble(): EngineSpec {
    if (this.user === '') throw new AnalyzerError('unrecognized_layout');
    if (!this.hasWpConfig) throw new AnalyzerError('not_wordpress');
    const wp = this.wpConfig;
    const constant = multisiteConstant(wp);
    const multisite = constant !== null;
    let primaryDomain = this.cpanelPrimaryDomain();
    let network: NetworkSpec | null = null;
    if (multisite) {
      network = this.networkSpec(wp, constant);
      primaryDomain = network.domain;
    }
    if (primaryDomain === '') throw new AnalyzerError('no_primary_domain');

    const dbName = extractDefine(wp, 'DB_NAME');
    const { dump } = this.selectDump(dbName);
    const database = { name: dbName, dumpPath: '', dumpBytes: 0, engine: '', version: '' };
    if (dump) {
      const { engine, version } = parseDumpHeader(dump.header);
      database.name = dbName || dump.relPath.slice(6, dump.relPath.length - 4);
      database.dumpPath = dump.relPath;
      database.dumpBytes = dump.bytes;
      database.engine = engine;
      database.version = version;
    }
    const spec: EngineSpec = {
      primaryDomain,
      files: {
        docRootPath: 'homedir/public_html',
        totalBytes: this.docrootBytes,
        fileCount: this.docrootFiles,
      },
      webConfig: {
        phpVersion:
          PHP_VERSION_MAP[yamlScalar(this.userdata.get(primaryDomain) ?? '', 'phpversion')] ?? '',
      },
      wordpress: {
        tablePrefix: extractTablePrefix(wp),
        legacyUrl: extractDefine(wp, 'WP_HOME'),
        dbCharset: extractDefine(wp, 'DB_CHARSET'),
        dbCollate: extractDefine(wp, 'DB_COLLATE'),
        multisite,
      },
      database,
      email: this.emailSpec(primaryDomain),
      network,
    };
    validateSpec(spec);
    return spec;
  }

  /** emailSpec: the accounts of the primary mail domain, with the history caps. */
  private emailSpec(domain: string): EngineSpec['email'] {
    const passwd = this.passwd.get(domain);
    if (!passwd) return [];
    const accounts = mailboxes(parsePasswdLocalParts(passwd), domain, this.mailBytes, {
      total: 0,
    });
    return accounts.length === 0 ? [] : [{ domain, accounts }];
  }

  // ------------------------------------------------------------- multisite

  private networkSpec(wp: string, constant: string): NetworkSpec {
    if (reSunrise.test(wp) || this.sunrisePHP) throw multisiteReject('sunrise', { constant });
    if (this.blogsDir) throw multisiteReject('blogs_dir', { constant });
    for (const name of ['BLOG_ID_CURRENT_SITE', 'SITE_ID_CURRENT_SITE']) {
      const raw = extractDefineRaw(wp, name);
      const n = /^[+-]?[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
      if (n !== 1) throw multisiteReject('not_default_network', { constant, define: name });
    }
    const netDomain = extractDefine(wp, 'DOMAIN_CURRENT_SITE');
    if (netDomain === '') throw multisiteReject('missing_domain_current_site', { constant });
    const netPath = extractDefine(wp, 'PATH_CURRENT_SITE');
    if (netPath === '') throw multisiteReject('missing_path_current_site', { constant });
    const subdomainInstall = phpDefineBool(extractDefineRaw(wp, 'SUBDOMAIN_INSTALL'));

    const prefix = extractTablePrefix(wp);
    const { key } = this.selectDump(extractDefine(wp, 'DB_NAME'));
    const ps = this.netScans.get(key)?.get(prefix);
    if (!ps || ps.blogs.length === 0) {
      throw multisiteReject('no_readable_blogs', {
        constant,
        ...(ps?.note ? { detail: ps.note.reason } : {}),
      });
    }
    if (ps.note) throw multisiteReject('unreadable_blogs', { constant, detail: ps.note.reason });
    if (ps.domainMapping) throw multisiteReject('domain_mapping', { constant });
    if (ps.siteRows > 1)
      throw multisiteReject('multi_network', { constant, networks: ps.siteRows });
    if (ps.truncated || ps.blogs.length > MAX_NETWORK_SITES_NFR) {
      throw capError('network_sites', { limit: MAX_NETWORK_SITES_NFR });
    }
    if (ps.blogs.length > this.maxNetworkSites) {
      throw multisiteReject('too_many_sites', {
        constant,
        sites: ps.blogs.length,
        limit: this.maxNetworkSites,
      });
    }
    const sites = this.networkSites(ps, netDomain, netPath, subdomainInstall, constant);
    return { subdomainInstall, domain: netDomain, path: netPath, sites };
  }

  private networkSites(
    ps: PrefixScan,
    netDomain: string,
    netPath: string,
    subdomainInstall: boolean,
    constant: string,
  ): NetworkSiteSpec[] {
    const rows = [...ps.blogs].sort((a, b) =>
      a.blogId < b.blogId ? -1 : a.blogId > b.blogId ? 1 : 0,
    );
    const seenId = new Set<bigint>();
    const seenDomainPath = new Set<string>();
    let hasPrimary = false;
    const aliases = this.serverAliases();
    const sites: NetworkSiteSpec[] = [];
    const invalid = (reason: string) => multisiteReject(reason, { constant });
    for (const r of rows) {
      if (r.blogId <= 0n) throw invalid('invalid_site_blog_id');
      if (seenId.has(r.blogId)) throw invalid('duplicate_site_blog_id');
      seenId.add(r.blogId);
      if (hostnameProblem(r.domain)) throw invalid('invalid_site_domain');
      if (!rePath.test(r.path)) throw invalid('invalid_site_path');
      const dp = `${r.domain}\0${r.path}`;
      if (seenDomainPath.has(dp)) throw invalid('duplicate_site');
      seenDomainPath.add(dp);
      if (subdomainInstall && r.path !== '/') throw invalid('subdomain_install_path');
      if (r.domain === netDomain && r.path === netPath) hasPrimary = true;
      sites.push({
        blogId: r.blogId,
        domain: r.domain,
        path: r.path,
        public: r.public,
        archived: r.archived,
        spam: r.spam,
        deleted: r.deleted,
        wwwAlias: aliases.has(`www.${r.domain}`),
        previewSlug: '',
      });
    }
    if (!hasPrimary) throw invalid('no_primary_site');
    const slugs = computePreviewSlugs(sites, netDomain);
    if (!slugs) throw invalid('preview_slug');
    for (const site of sites) site.previewSlug = slugs.get(site.blogId) ?? '';
    return sites;
  }

  /** serverAliases: every serveralias token across the vhost files. */
  serverAliases(): Set<string> {
    const out = new Set<string>();
    for (const content of this.userdata.values()) {
      for (const line of content.split('\n')) {
        const trimmed = trimSpace(line);
        if (trimmed.startsWith('serveralias:')) {
          for (const token of fields(trimmed.slice('serveralias:'.length))) out.add(token);
        }
      }
    }
    return out;
  }
}

/**
 * The mailboxes of one domain with the history caps (5 GiB per mailbox, then
 * 25 GiB in total across the calls that share `history`).
 */
export function mailboxes(
  locals: string[],
  domain: string,
  mailBytes: Map<string, number>,
  history: { total: number },
): EmailAccountSpec[] {
  const out: EmailAccountSpec[] = [];
  for (const localPart of locals) {
    const maildirBytes = mailBytes.get(`${domain}/${localPart}`) ?? 0;
    let skipHistory = maildirBytes > PER_MAILBOX_CAP;
    if (!skipHistory && history.total + maildirBytes > TOTAL_MAILBOX_CAP) skipHistory = true;
    if (!skipHistory) history.total += maildirBytes;
    out.push({ localPart, maildirBytes, skipHistory });
  }
  return out;
}

/** validateSpec: the allowlists of every untrusted value, in the engine's order. */
function validateSpec(spec: EngineSpec): void {
  const domainProblem = hostnameProblem(spec.primaryDomain);
  if (domainProblem) {
    throw new AnalyzerError('invalid_primary_domain', domainProblem, {
      domain: spec.primaryDomain,
      length: spec.primaryDomain.length,
    });
  }
  const optional = (
    code:
      | 'invalid_database_name'
      | 'invalid_table_prefix'
      | 'invalid_db_charset'
      | 'invalid_db_collation',
    value: string,
    re: RegExp,
  ) => {
    if (value !== '' && (value.length > MAX_IDENTIFIER_LEN || !re.test(value))) {
      throw new AnalyzerError(code, value.length > MAX_IDENTIFIER_LEN ? 'too_long' : 'characters');
    }
  };
  optional('invalid_database_name', spec.database.name, reDBIdentifier);
  optional('invalid_table_prefix', spec.wordpress.tablePrefix, reSQLWord);
  optional('invalid_db_charset', spec.wordpress.dbCharset, reSQLWord);
  optional('invalid_db_collation', spec.wordpress.dbCollate, reSQLWord);
  for (const d of spec.email) {
    if (hostnameProblem(d.domain)) throw new AnalyzerError('invalid_primary_domain', 'mail_domain');
    for (const account of d.accounts) {
      if (account.localPart.length > MAX_IDENTIFIER_LEN || !reEmailLocal.test(account.localPart)) {
        throw new AnalyzerError('invalid_email_local_part', null, { domain: d.domain });
      }
    }
  }
}
