// analyze(): one streaming pass over a backup, then the report. The platform
// (Node or a browser) only hands in the raw bytes and a gunzip; nothing here
// touches the network, the file system or Node.

import { CAPABILITIES, type Capabilities } from '../capabilities.js';
import { text } from './binary.js';
import { AnalyzerError } from './errors.js';
import { yamlScalar } from './go.js';
import { Inventory, yamlEntries } from './inventory.js';
import {
  Collector,
  type EngineSpec,
  extractDefine,
  mailboxes,
  PHP_VERSION_MAP,
  parseDumpHeader,
  parsePasswdLocalParts,
  splitRoot,
} from './parser.js';
import { requirements } from './recommend.js';
import {
  type EngineResult,
  type Finding,
  REPORT_SCHEMA,
  type Report,
  type ReportItem,
  type SiteItem,
} from './report.js';
import { Bytes, type StreamFailure } from './source.js';
import { TarReader } from './tar.js';

/** The engine rules this analyzer follows, and when they were read. */
export const RULES = { parserRevision: '7ce27af', readOn: '2026-10-17' } as const;

/** 50 GiB: the largest backup a migration accepts. */
export const MAX_BACKUP_BYTES = 50 * 1024 ** 3;
/** The work volume of the site import: the backup and the SQL dump side by side. */
export const SITE_WORK_VOLUME_BYTES = 75 * 1024 ** 3;

export interface AnalyzeSource {
  /** File name, only to show. */
  name: string;
  /** Size of the file in bytes (compressed). */
  size: number;
  /** The raw bytes of the file, in order. */
  open(): AsyncIterable<Uint8Array>;
  /** Decompresses gzip (every member, like Go's reader). */
  gunzip(raw: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array>;
  /** Tells a truncated stream from a corrupt one, for errors of `gunzip`. */
  classifyError(error: unknown): StreamFailure | null;
}

export interface AnalyzeProgress {
  /** Bytes of the file read so far. */
  readBytes: number;
  totalBytes: number;
  uncompressedBytes: number;
  entries: number;
}

export interface AnalyzeOptions {
  onProgress?: (progress: AnalyzeProgress) => void;
  signal?: AbortSignal;
  capabilities?: Capabilities;
  /** The operational cap on multisite sites (20 by default). */
  maxNetworkSites?: number;
  /** Multisite migrations are off in production; true only to study a network. */
  multisiteEnabled?: boolean;
}

/** The raw bytes, counted for the progress, with the first two kept to sniff gzip. */
async function sniff(
  raw: AsyncIterable<Uint8Array>,
  onRead: (n: number) => void,
): Promise<{ gzip: boolean; stream: AsyncIterable<Uint8Array>; close: () => Promise<void> }> {
  const it = raw[Symbol.asyncIterator]();
  const head: Uint8Array[] = [];
  let have = 0;
  let done = false;
  while (have < 2) {
    const r = await it.next();
    if (r.done) {
      done = true;
      break;
    }
    if (r.value.length === 0) continue;
    head.push(r.value);
    have += r.value.length;
    onRead(r.value.length);
  }
  const first = head[0];
  const second = first && first.length > 1 ? first[1] : head[1]?.[0];
  const gzip = first !== undefined && first[0] === 0x1f && second === 0x8b;
  async function* replay(): AsyncGenerator<Uint8Array> {
    for (const chunk of head) yield chunk;
    if (done) return;
    for (;;) {
      const r = await it.next();
      if (r.done) return;
      onRead(r.value.length);
      yield r.value;
    }
  }
  return {
    gzip,
    stream: replay(),
    close: async () => {
      try {
        await it.return?.();
      } catch {
        // Already closed.
      }
    },
  };
}

export async function analyze(
  source: AnalyzeSource,
  options: AnalyzeOptions = {},
): Promise<Report> {
  const capabilities = options.capabilities ?? CAPABILITIES;
  const collector = new Collector(options.maxNetworkSites);
  const inventory = new Inventory();
  let readBytes = 0;
  let bytes: Bytes | null = null;
  const progress = () =>
    options.onProgress?.({
      readBytes,
      totalBytes: source.size,
      uncompressedBytes: bytes?.delivered ?? 0,
      entries: inventory.entries,
    });
  const raw = await sniff(source.open(), (n) => {
    readBytes += n;
    progress();
  });
  const decompressed = raw.gzip ? source.gunzip(raw.stream) : raw.stream;
  bytes = new Bytes(decompressed[Symbol.asyncIterator](), source.classifyError, options.signal);
  const tr = new TarReader(bytes);
  let error: AnalyzerError | null = null;
  let complete = true;
  try {
    for (;;) {
      const entry = await tr.next();
      if (!entry) break;
      inventory.observe(entry.name, entry.type);
      // The parser only looks at regular files (TypeReg).
      if (entry.type !== '0') continue;
      const read = await collector.consume(tr, entry.name, entry.size);
      await inventory.regular(tr, splitRoot(entry.name), entry.size, read, entry.sparse);
    }
  } catch (caught) {
    if (!(caught instanceof AnalyzerError)) throw caught;
    error = caught;
    complete = false;
  } finally {
    await bytes.close();
    await raw.close();
  }
  progress();
  let spec: EngineSpec | null = null;
  if (!error) {
    try {
      spec = collector.assemble();
    } catch (caught) {
      if (!(caught instanceof AnalyzerError)) throw caught;
      error = caught;
    }
  }
  return buildReport({
    name: source.name,
    size: source.size,
    gzip: raw.gzip,
    complete,
    uncompressedBytes: bytes.delivered,
    collector,
    inventory,
    spec,
    error,
    capabilities,
    multisiteEnabled: options.multisiteEnabled ?? false,
  });
}

// ------------------------------------------------------------------ report

interface BuildInput {
  name: string;
  size: number;
  gzip: boolean;
  complete: boolean;
  uncompressedBytes: number;
  collector: Collector;
  inventory: Inventory;
  spec: EngineSpec | null;
  error: AnalyzerError | null;
  capabilities: Capabilities;
  multisiteEnabled: boolean;
}

/** ea-php82 (or alt-php82) as 8.2; null for the server default or a label it cannot read. */
export function phpVersionOf(label: string): string | null {
  const m = /^(?:ea|alt)-php([0-9])([0-9]+)$/.exec(label);
  return m ? `${m[1]}.${m[2]}` : null;
}

function safeParams(params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'string' ? text(value) : value;
  }
  return out;
}

interface SiteDraft {
  domain: string;
  role: SiteItem['role'];
  vhost: string;
  aliases: string[];
}

function siteDrafts(collector: Collector, primary: string): SiteDraft[] {
  const main = collector.mainYAML;
  const drafts: SiteDraft[] = [];
  const used = new Set<string>();
  const vhostOf = (name: string) => collector.userdata.get(name) ?? '';
  if (primary !== '') {
    drafts.push({
      domain: primary,
      role: 'primary',
      vhost: vhostOf(primary),
      aliases: yamlEntries(main, 'parked_domains').list,
    });
    used.add(primary);
  }
  for (const [addon, sub] of yamlEntries(main, 'addon_domains').map) {
    if (used.has(addon)) continue;
    drafts.push({
      domain: addon,
      role: 'addon',
      vhost: vhostOf(sub) || vhostOf(addon),
      aliases: [],
    });
    used.add(addon);
    used.add(sub);
  }
  for (const sub of yamlEntries(main, 'sub_domains').list) {
    if (used.has(sub)) continue;
    drafts.push({ domain: sub, role: 'subdomain', vhost: vhostOf(sub), aliases: [] });
    used.add(sub);
  }
  // Without the lists of userdata/main, the vhost files still name the sites.
  if (main === '') {
    for (const [name, vhost] of collector.userdata) {
      if (used.has(name) || name.endsWith('.cache') || !name.includes('.')) continue;
      const role = primary !== '' && name.endsWith(`.${primary}`) ? 'subdomain' : 'addon';
      drafts.push({ domain: name, role, vhost, aliases: [] });
      used.add(name);
    }
  }
  return drafts;
}

function docrootOf(vhost: string, user: string, homePath: string): string | null {
  const root = yamlScalar(vhost, 'documentroot');
  if (root === '') return null;
  const homes = [yamlScalar(vhost, 'homedir'), homePath, `/home/${user}`].filter((h) => h !== '');
  for (const home of homes) {
    if (root === home) return '';
    if (root.startsWith(`${home}/`)) return root.slice(home.length + 1).replace(/\/+$/, '');
  }
  return null;
}

export function buildReport(input: BuildInput): Report {
  const { collector, inventory, spec, error, capabilities: caps } = input;
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const archiveError = error !== null && !input.complete;
  const recognized = collector.user !== '';

  if (error) {
    blockers.push({
      code: error.code,
      ...(error.reason ? { reason: error.reason } : {}),
      ...(Object.keys(error.params).length > 0 ? { params: safeParams(error.params) } : {}),
    });
  }
  if (input.size > MAX_BACKUP_BYTES) {
    blockers.push({
      code: 'backup_too_large',
      params: { bytes: input.size, limit: MAX_BACKUP_BYTES },
    });
  }
  if (spec?.network && !input.multisiteEnabled) {
    blockers.push({ code: 'multisite_disabled', params: { sites: spec.network.sites.length } });
  }
  if (spec && spec.database.dumpPath === '') blockers.push({ code: 'no_sql_dump' });
  if (!archiveError && recognized) {
    if (!input.gzip) blockers.push({ code: 'plain_tar' });
    const first = (inventory.firstEntryName ?? '').split('/')[0] ?? '';
    const accountRoot = [...inventory.roots][0] ?? '';
    if (first === '.') blockers.push({ code: 'dot_slash_root' });
    else if (accountRoot !== '' && first !== accountRoot) {
      blockers.push({ code: 'archive_root_mismatch' });
    }
  }

  const primaryRaw = spec?.primaryDomain ?? collector.cpanelPrimaryDomain();
  const items: ReportItem[] = [];
  let summary: Report['summary'] = null;
  let need: Report['requirements'] = null;

  if (recognized && !archiveError) {
    // Sites
    const drafts = siteDrafts(collector, primaryRaw);
    const sites: SiteItem[] = [];
    for (const draft of drafts) {
      const docroot = docrootOf(draft.vhost, collector.user, inventory.homePath);
      let totals = docroot === null ? undefined : inventory.folders.get(docroot);
      if (draft.role === 'primary' && (docroot === 'public_html' || docroot === null)) {
        totals = { bytes: collector.docrootBytes, files: collector.docrootFiles };
      }
      const wpDir = draft.role === 'primary' && docroot === null ? 'public_html' : docroot;
      const wordpress =
        wpDir !== null && (inventory.wpConfigDirs.has(wpDir) || inventory.wpVersions.has(wpDir));
      const allowed = caps.sites[draft.role];
      const site: SiteItem = {
        kind: 'site',
        id: text(draft.domain),
        role: draft.role,
        app: wordpress ? 'wordpress' : 'other',
        wordpressVersion:
          wpDir !== null ? text(inventory.wpVersions.get(wpDir) ?? '') || null : null,
        docroot: docroot === null ? null : text(docroot),
        bytes: totals?.bytes ?? null,
        files: totals?.files ?? null,
        aliases: caps.sites.parkedAliases ? draft.aliases.map(text) : [],
        status: allowed && caps.files ? 'supported' : 'not_migrated',
        notes: allowed ? [] : ['not_in_migration'],
      };
      sites.push(site);
      items.push(site);
      if (draft.role === 'primary' && docroot !== null && docroot !== 'public_html') {
        warnings.push({
          code: 'primary_docroot_not_public_html',
          params: { docroot: text(docroot) },
        });
      }
      // PHP
      const label = yamlScalar(draft.vhost, 'phpversion');
      const version = phpVersionOf(label);
      const known = version !== null && caps.phpVersions.includes(version);
      const followsDefault = label === '' || label === 'inherit';
      items.push({
        kind: 'php',
        id: text(draft.domain),
        version,
        label: label === '' ? null : text(label),
        status: !caps.phpPerSite
          ? 'not_migrated'
          : known || followsDefault
            ? 'supported'
            : 'supported_with_warnings',
        notes: followsDefault ? ['server_default'] : known ? [] : ['php_version_not_mapped'],
      });
      if (caps.phpPerSite && !known && !followsDefault && site.status === 'supported') {
        warnings.push({
          code: 'php_version_not_mapped',
          params: { domain: text(draft.domain), version: version ?? text(label) },
        });
      }
    }

    // Databases
    let databaseBytes = 0;
    let firstEngine: 'mysql' | 'mariadb' | null = null;
    for (const [name, dump] of collector.dbDumps) {
      const { engine, version } = parseDumpHeader(dump.header);
      const kind = engine === 'mariadb' ? 'mariadb' : 'mysql';
      firstEngine ??= kind;
      databaseBytes += dump.bytes;
      const allowed = caps.databaseEngines.includes(kind);
      items.push({
        kind: 'database',
        id: text(name),
        engine: kind,
        version: version === '' ? null : version,
        bytes: dump.bytes,
        selected: spec?.database.dumpPath === dump.relPath,
        status: allowed ? 'supported' : 'not_migrated',
        notes: allowed ? [] : ['not_in_migration'],
      });
    }
    if (inventory.postgresDumps > 0) {
      items.push({
        kind: 'postgresql',
        count: inventory.postgresDumps,
        status: 'not_migrated',
        notes: [caps.staysBehind.postgresql],
      });
    }

    // Email, per domain: the accounts of passwd, the Maildir bytes, the history caps.
    const mailDomains = new Set<string>(collector.passwd.keys());
    for (const key of collector.mailBytes.keys()) mailDomains.add(key.slice(0, key.indexOf('/')));
    const history = { total: 0 };
    let emailAccounts = 0;
    let overCap = 0;
    const zonesWithMx = new Set(
      [...inventory.dnsZones].filter(([, counts]) => (counts.MX ?? 0) > 0).map(([zone]) => zone),
    );
    for (const domain of [...mailDomains].sort()) {
      const accounts = mailboxes(
        parsePasswdLocalParts(collector.passwd.get(domain) ?? ''),
        domain,
        collector.mailBytes,
        history,
      );
      let maildirBytes = 0;
      for (const [key, value] of collector.mailBytes)
        if (key.startsWith(`${domain}/`)) maildirBytes += value;
      const skipped = accounts.filter((a) => a.skipHistory).length;
      emailAccounts += accounts.length;
      overCap += skipped;
      const notes: string[] = [];
      if (caps.email.mailboxes && caps.email.mxPreserved && zonesWithMx.has(domain))
        notes.push('mx_preserved');
      if (skipped > 0) notes.push('history_over_cap');
      items.push({
        kind: 'email_domain',
        id: text(domain),
        accounts: accounts.length,
        maildirBytes,
        status: caps.email.mailboxes
          ? skipped > 0
            ? 'supported_with_warnings'
            : 'supported'
          : 'not_migrated',
        notes: caps.email.mailboxes ? notes : ['not_in_migration'],
      });
    }
    if (overCap > 0 && caps.email.mailboxes) {
      warnings.push({ code: 'mailbox_history_over_cap', params: { count: overCap } });
    }

    // DNS
    let dnsRecords = 0;
    for (const [zone, records] of [...inventory.dnsZones].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const total = Object.values(records).reduce((sum, n) => sum + n, 0);
      dnsRecords += total;
      items.push({
        kind: 'dns_zone',
        id: text(zone),
        records,
        total,
        status: caps.dnsZone ? 'supported' : 'not_migrated',
        notes: caps.dnsZone
          ? (records.MX ?? 0) > 0 && caps.email.mxPreserved
            ? ['mx_preserved']
            : []
          : ['not_in_migration'],
      });
    }

    // Cron, SSL, FTP, the panel password
    const cronJobs = inventory.cronJobs ?? 0;
    if (cronJobs > 0) {
      items.push({
        kind: 'cron',
        count: cronJobs,
        status: caps.cron ? 'supported' : 'not_migrated',
        notes: caps.cron ? [] : ['not_in_migration'],
      });
    }
    if (inventory.sslCertificates.size > 0) {
      items.push({
        kind: 'ssl',
        count: inventory.sslCertificates.size,
        status: 'not_migrated',
        notes: [caps.staysBehind.sslCertificates],
      });
    }
    if ((inventory.ftpAccounts ?? 0) > 0) {
      items.push({
        kind: 'ftp',
        count: inventory.ftpAccounts ?? 0,
        status: 'not_migrated',
        notes: [caps.staysBehind.ftpAccounts],
      });
    }
    items.push({
      kind: 'panel_password',
      count: 1,
      status: 'not_migrated',
      notes: [caps.staysBehind.panelPassword],
    });

    // Warnings from the archive and the engine Spec
    if (inventory.unsafeNames > 0)
      warnings.push({ code: 'unsafe_entry_names', params: { count: inventory.unsafeNames } });
    if (inventory.outsideRoot > 0) {
      warnings.push({
        code: 'entries_outside_account_root',
        params: { count: inventory.outsideRoot },
      });
    }
    // A root made of dots ("..") is an unsafe name, already reported above.
    const accountRoots = [...inventory.roots].filter((r) => !/^\.*$/.test(r));
    if (accountRoots.length > 1) {
      warnings.push({ code: 'multi_account_archive', params: { count: accountRoots.length } });
    }
    if (spec) {
      if (spec.wordpress.tablePrefix === '') warnings.push({ code: 'table_prefix_unreadable' });
      const defined = extractDefine(collector.wpConfig, 'DB_NAME');
      if (defined !== '' && !collector.dbDumps.has(defined) && spec.database.dumpPath !== '') {
        warnings.push({
          code: 'db_name_mismatch',
          params: {
            defined: text(defined),
            used: text(spec.database.dumpPath.slice(6, spec.database.dumpPath.length - 4)),
          },
        });
      }
      if (input.size + spec.database.dumpBytes > SITE_WORK_VOLUME_BYTES * 0.9) {
        warnings.push({ code: 'work_volume_tight' });
      }
    }

    const selectedEngine =
      spec?.database.engine === 'mariadb'
        ? 'mariadb'
        : spec?.database.engine === 'mysql'
          ? 'mysql'
          : null;
    summary = {
      sites: sites.length,
      wordpressSites: sites.filter((s) => s.app === 'wordpress').length,
      databases: collector.dbDumps.size,
      emailDomains: mailDomains.size,
      emailAccounts,
      dnsZones: inventory.dnsZones.size,
      dnsRecords,
      cronJobs,
      homeFiles: inventory.home.files,
      homeBytes: inventory.home.bytes,
      mailBytes: inventory.mail.bytes,
    };
    need = requirements({
      homeBytes: inventory.home.bytes,
      mailBytes: caps.email.mailboxes ? inventory.mail.bytes : 0,
      databaseBytes,
      databases: collector.dbDumps.size,
      databaseEngine: selectedEngine ?? firstEngine,
      sites: sites.filter((s) => s.status === 'supported').length,
      emailAccounts: caps.email.mailboxes ? emailAccounts : 0,
    });
  }

  const engine: EngineResult = spec
    ? { ok: true, ...engineView(spec) }
    : { ok: false, code: error?.code ?? 'unrecognized_layout', reason: error?.reason ?? null };

  const sensitive: Report['privacy']['sensitive'] = [];
  if (collector.hasWpConfig || inventory.wpConfigDirs.size > 0)
    sensitive.push('database_credentials');
  if (
    [...collector.shadow.values()].some((n) => n > 0) ||
    inventory.accountShadow ||
    (inventory.ftpAccounts ?? 0) > 0
  ) {
    sensitive.push('password_hashes');
  }
  if (inventory.sslPrivateKeys > 0) sensitive.push('private_keys');

  return {
    schema: REPORT_SCHEMA,
    rules: { ...RULES, capabilities: caps.decidedOn },
    file: {
      name: input.name,
      bytes: input.size,
      compression: input.gzip ? 'gzip' : 'none',
      uncompressedBytes: input.uncompressedBytes,
      entries: inventory.entries,
      complete: input.complete,
    },
    account: recognized
      ? {
          panel: 'cpanel',
          user: text(collector.user),
          primaryDomain: primaryRaw === '' ? null : text(primaryRaw),
        }
      : null,
    verdict:
      blockers.length > 0
        ? 'blocked'
        : warnings.length > 0
          ? 'supported_with_warnings'
          : 'supported',
    blockers,
    warnings,
    summary,
    items,
    engine,
    requirements: need,
    recommendation: { mode: 'offline' },
    privacy: { network: false, sensitive },
  };
}

/** The engine's view: what it sends to the API (discovery) and the Spec without secrets. */
function engineView(spec: EngineSpec) {
  const email = spec.email.map((d) => ({
    domain: text(d.domain),
    accounts: d.accounts.length,
    maildirBytes: d.accounts.reduce((sum, a) => sum + a.maildirBytes, 0),
    skipHistory: d.accounts.filter((a) => a.skipHistory).length,
  }));
  const network = spec.network
    ? {
        subdomainInstall: spec.network.subdomainInstall,
        domain: text(spec.network.domain),
        path: text(spec.network.path),
        sites: spec.network.sites.map((s) => ({
          blogId: s.blogId.toString(),
          domain: text(s.domain),
          path: text(s.path),
          public: s.public,
          archived: s.archived,
          spam: s.spam,
          deleted: s.deleted,
          wwwAlias: s.wwwAlias,
          previewSlug: text(s.previewSlug),
        })),
      }
    : null;
  return {
    discovery: {
      phpVersion: spec.webConfig.phpVersion,
      databaseEngine: spec.database.engine,
      databaseVersion: spec.database.version,
      fileCount: spec.files.fileCount,
      fileBytes: spec.files.totalBytes,
      emailAccountCount: email.reduce((sum, d) => sum + d.accounts, 0),
      emailHistoryBytes: email.reduce((sum, d) => sum + d.maildirBytes, 0),
      ...(network
        ? { networkDomains: [...new Set(network.sites.map((s) => s.domain))].sort() }
        : {}),
    },
    spec: {
      primaryDomain: text(spec.primaryDomain),
      files: spec.files,
      database: {
        name: text(spec.database.name),
        dumpPath: text(spec.database.dumpPath),
        dumpBytes: spec.database.dumpBytes,
        engine: spec.database.engine,
        version: spec.database.version,
      },
      webConfig: spec.webConfig,
      wordpress: {
        tablePrefix: text(spec.wordpress.tablePrefix),
        legacyUrl: text(spec.wordpress.legacyUrl),
        dbCharset: text(spec.wordpress.dbCharset),
        dbCollate: text(spec.wordpress.dbCollate),
        multisite: spec.wordpress.multisite,
      },
      email: { domains: email },
      network,
    },
  };
}

export { PHP_VERSION_MAP };
