import { open, realpath, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type {
  BLOCKER_CODES,
  CountItem,
  DatabaseItem,
  DnsItem,
  EmailItem,
  Finding,
  PhpItem,
  PlanChoice,
  Recommendation,
  Report,
  SiteItem,
  WARNING_CODES,
} from '../analyzer/index.js';
import { analyzeFile, recommend } from '../analyzer/node.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode, NetworkError } from '../errors.js';
import { formatBytes, formatDuration } from '../format.js';
import type { MessageKey, Vars } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { type Kit, kit } from '../ui/kit.js';
import { twoColumns } from '../ui/layout.js';

export interface AnalyzeFlags {
  prices: boolean;
  currency?: string | undefined;
}

/** Below this size the reading is over before a progress bar would help. */
const PROGRESS_FROM_BYTES = 16 * 1024 * 1024;
const CURRENCY = /^[A-Za-z]{3}$/;

interface BackupFile {
  path: string;
  name: string;
  size: number;
}

async function inspect(arg: string): Promise<BackupFile> {
  const path = resolve(arg);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    throw new CliError(
      'migrate.fileNotFound',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'file_not_found' },
    );
  }
  if (!info.isFile()) {
    throw new CliError(
      'migrate.notAFile',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'not_a_file' },
    );
  }
  if (info.size === 0) {
    throw new CliError(
      'migrate.emptyFile',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'empty_file' },
    );
  }
  try {
    const handle = await open(path, 'r');
    await handle.close();
  } catch {
    throw new CliError(
      'migrate.fileUnreadable',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'file_unreadable' },
    );
  }
  const real = await realpath(path);
  return { path: real, name: basename(real), size: info.size };
}

/** The backup as the person typed it, quoted for a shell when it needs to be. */
function shellArg(value: string): string {
  return /^[A-Za-z0-9._/~@%+=:,-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

// ---------------------------------------------------------------- messages

/** The sentences of each blocker code (what happened, what to do). */
export const BLOCK_KEYS: Record<
  (typeof BLOCKER_CODES)[number],
  { what: MessageKey; fix?: MessageKey }
> = {
  archive_invalid: { what: 'analyze.block.archive_invalid', fix: 'analyze.fix.archive_invalid' },
  archive_truncated: {
    what: 'analyze.block.archive_truncated',
    fix: 'analyze.fix.archive_truncated',
  },
  parse_cap_exceeded: {
    what: 'analyze.block.parse_cap_exceeded',
    fix: 'analyze.fix.parse_cap_exceeded',
  },
  unrecognized_layout: {
    what: 'analyze.block.unrecognized_layout',
    fix: 'analyze.fix.unrecognized_layout',
  },
  not_wordpress: { what: 'analyze.block.not_wordpress', fix: 'analyze.fix.not_wordpress' },
  multisite_unsupported: {
    what: 'analyze.block.multisite_unsupported',
    fix: 'analyze.fix.multisite',
  },
  multisite_disabled: { what: 'analyze.block.multisite_disabled', fix: 'analyze.fix.multisite' },
  no_primary_domain: { what: 'analyze.block.no_primary_domain', fix: 'analyze.fix.regenerate' },
  invalid_primary_domain: { what: 'analyze.block.invalid_primary_domain' },
  invalid_database_name: {
    what: 'analyze.block.invalid_database_name',
    fix: 'analyze.fix.wpconfig',
  },
  invalid_table_prefix: { what: 'analyze.block.invalid_table_prefix', fix: 'analyze.fix.wpconfig' },
  invalid_db_charset: { what: 'analyze.block.invalid_db_charset', fix: 'analyze.fix.wpconfig' },
  invalid_db_collation: { what: 'analyze.block.invalid_db_collation', fix: 'analyze.fix.wpconfig' },
  invalid_email_local_part: {
    what: 'analyze.block.invalid_email_local_part',
    fix: 'analyze.fix.email_local_part',
  },
  backup_too_large: { what: 'analyze.block.backup_too_large', fix: 'analyze.fix.backup_too_large' },
  no_sql_dump: { what: 'analyze.block.no_sql_dump', fix: 'analyze.fix.regenerate' },
  plain_tar: { what: 'analyze.block.plain_tar', fix: 'analyze.fix.plain_tar' },
  dot_slash_root: { what: 'analyze.block.dot_slash_root', fix: 'analyze.fix.regenerate' },
  archive_root_mismatch: {
    what: 'analyze.block.archive_root_mismatch',
    fix: 'analyze.fix.regenerate',
  },
};

/** The sentence of each warning code. */
export const WARN_KEYS: Record<(typeof WARNING_CODES)[number], MessageKey> = {
  php_version_not_mapped: 'analyze.warn.php_version_not_mapped',
  table_prefix_unreadable: 'analyze.warn.table_prefix_unreadable',
  db_name_mismatch: 'analyze.warn.db_name_mismatch',
  primary_docroot_not_public_html: 'analyze.warn.primary_docroot_not_public_html',
  unsafe_entry_names: 'analyze.warn.unsafe_entry_names',
  entries_outside_account_root: 'analyze.warn.entries_outside_account_root',
  multi_account_archive: 'analyze.warn.multi_account_archive',
  mailbox_history_over_cap: 'analyze.warn.mailbox_history_over_cap',
  work_volume_tight: 'analyze.warn.work_volume_tight',
};

function findingVars(ctx: Ctx, f: Finding): Vars {
  const vars: Vars = { ...(f.params ?? {}) };
  if (typeof vars.bytes === 'number') vars.size = formatBytes(vars.bytes, ctx.lang);
  if (typeof vars.limit === 'number' && f.code === 'backup_too_large') {
    vars.limit = formatBytes(vars.limit, ctx.lang);
  }
  return vars;
}

function blockText(ctx: Ctx, f: Finding, report: Report): { what: string; fix: string | null } {
  const t = ctx.out.t;
  // A file with no tar entry at all is simply not an archive (a zip, a text).
  if (
    (f.code === 'archive_invalid' || f.code === 'archive_truncated') &&
    report.file.entries === 0
  ) {
    return { what: t('analyze.block.not_an_archive'), fix: t('analyze.fix.unrecognized_layout') };
  }
  const keys = BLOCK_KEYS[f.code as keyof typeof BLOCK_KEYS];
  if (!keys) return { what: t('analyze.block.other', { code: f.code }), fix: null };
  const vars = findingVars(ctx, f);
  let what = t(keys.what, vars);
  if (f.code === 'multisite_unsupported' || f.code === 'multisite_disabled') {
    what = t(keys.what, { constant: String(vars.constant ?? 'MULTISITE'), ...vars });
  }
  return {
    what,
    fix: keys.fix ? t(keys.fix, { constant: String(vars.constant ?? 'MULTISITE') }) : null,
  };
}

function warnText(ctx: Ctx, f: Finding): string {
  const key = WARN_KEYS[f.code as keyof typeof WARN_KEYS];
  return key
    ? ctx.out.t(key, findingVars(ctx, f))
    : ctx.out.t('analyze.warn.other', { code: f.code });
}

// ---------------------------------------------------------------- prices

async function livePrices(
  ctx: Ctx,
  report: Report,
  currency: string | undefined,
): Promise<Recommendation> {
  if (!report.requirements) return { mode: 'offline' };
  let apiKey: string | undefined;
  try {
    apiKey = (await resolveAuth(ctx)).apiKey;
  } catch (error) {
    if (error instanceof CliError && error.code === 'not_signed_in') return { mode: 'signed_out' };
    throw error;
  }
  const wanted = currency ?? (ctx.lang === 'pt-BR' ? 'BRL' : 'USD');
  try {
    const destinations = await createApi(ctx, apiKey).listDestinations(currency);
    return recommend(report.requirements, destinations, wanted);
  } catch (error) {
    if (error instanceof NetworkError) return { mode: 'unavailable', reason: 'network_error' };
    if (error instanceof ApiError) {
      return {
        mode: 'unavailable',
        reason: error.status === 401 ? 'unauthorized' : `http_${error.status}`,
      };
    }
    throw error;
  }
}

function money(ctx: Ctx, price: { currency: string; priceMonthly: number }): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat(ctx.lang, {
      style: 'currency',
      currency: price.currency,
    }).format(price.priceMonthly);
  } catch {
    amount = safeText(`${price.currency} ${price.priceMonthly}`);
  }
  return ctx.out.t('destinations.perMonth', { price: amount });
}

function planLine(ctx: Ctx, choice: PlanChoice): string {
  const where = choice.locations
    .map((l) => safeText(`${l.name}${l.countryCode ? ` (${l.countryCode})` : ''}`))
    .join(', ');
  return [
    choice.diskGb !== null ? `${choice.diskGb} GB` : ctx.out.t('analyze.plan.diskUnknown'),
    choice.price ? money(ctx, choice.price) : '-',
    where,
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

// ---------------------------------------------------------------- views

interface Line {
  /** ok, warn or ring (stays behind). */
  tone: 'ok' | 'warn' | 'ring';
  label: string;
  detail: string;
}

const number = (ctx: Ctx, n: number) => new Intl.NumberFormat(ctx.lang).format(n);

function count(ctx: Ctx, n: number, one: MessageKey, many: MessageKey, vars: Vars = {}): string {
  return ctx.out.t(n === 1 ? one : many, { count: number(ctx, n), ...vars });
}

function list(ctx: Ctx, parts: string[]): string {
  return new Intl.ListFormat(ctx.lang, { type: 'conjunction' }).format(parts);
}

const engineName = (engine: string) => (engine === 'mariadb' ? 'MariaDB' : 'MySQL');

function dbLabel(db: DatabaseItem): string {
  return `${engineName(db.engine)}${db.version ? ` ${db.version}` : ''}`;
}

function sitesOf(report: Report) {
  const sites = report.items.filter((i): i is SiteItem => i.kind === 'site');
  const php = new Map(
    report.items.filter((i): i is PhpItem => i.kind === 'php').map((p) => [p.id, p] as const),
  );
  const databases = report.items.filter((i): i is DatabaseItem => i.kind === 'database');
  const mail = report.items.filter((i): i is EmailItem => i.kind === 'email_domain');
  const zones = report.items.filter((i): i is DnsItem => i.kind === 'dns_zone');
  const counted = (kind: CountItem['kind']) =>
    report.items.find((i): i is CountItem => i.kind === kind) ?? null;
  return { sites, php, databases, mail, zones, counted };
}

function phpText(ctx: Ctx, p: PhpItem | undefined): string {
  if (!p) return '';
  if (p.version) return `PHP ${p.version}`;
  return p.label ? `PHP ${safeText(p.label)}` : ctx.out.t('analyze.detail.phpDefault');
}

function siteDetail(ctx: Ctx, site: SiteItem, php: PhpItem | undefined): string {
  const t = ctx.out.t;
  const parts = [
    site.app === 'wordpress'
      ? site.wordpressVersion
        ? `WordPress ${safeText(site.wordpressVersion)}`
        : 'WordPress'
      : t('analyze.detail.otherApp'),
    phpText(ctx, php),
  ];
  if (site.bytes !== null && site.files !== null) {
    parts.push(
      count(ctx, site.files, 'analyze.value.filesOne', 'analyze.value.files', {
        size: formatBytes(site.bytes, ctx.lang),
      }),
    );
  }
  if (site.aliases.length > 0) {
    parts.push(t('analyze.detail.aliases', { domains: site.aliases.map(safeText).join(', ') }));
  }
  return parts.filter((p) => p !== '').join(' · ');
}

const SITE_ROLE: Record<SiteItem['role'], MessageKey> = {
  primary: 'analyze.item.sitePrimary',
  addon: 'analyze.item.siteAddon',
  subdomain: 'analyze.item.siteSub',
};

/** What comes to BladeCP and what stays behind, as lines. */
function itemLines(ctx: Ctx, report: Report): { comes: Line[]; stays: Line[] } {
  const t = ctx.out.t;
  const { sites, php, databases, mail, zones, counted } = sitesOf(report);
  const comes: Line[] = [];
  const stays: Line[] = [];
  const place = (status: string, line: Omit<Line, 'tone'>, why: string) => {
    if (status === 'not_migrated') stays.push({ tone: 'ring', label: line.label, detail: why });
    else comes.push({ tone: status === 'supported' ? 'ok' : 'warn', ...line });
  };
  const notYet = t('analyze.stay.notYet');
  for (const site of sites) {
    const p = php.get(site.id);
    const tone =
      site.status === 'supported' && p?.status === 'supported_with_warnings'
        ? 'supported_with_warnings'
        : site.status;
    place(
      tone,
      {
        label: t(SITE_ROLE[site.role], { domain: safeText(site.id) }),
        detail: siteDetail(ctx, site, p),
      },
      notYet,
    );
  }
  for (const db of databases) {
    place(
      db.status,
      {
        label: t('analyze.item.database', { name: safeText(db.id) }),
        detail: `${dbLabel(db)} · ${formatBytes(db.bytes, ctx.lang)}`,
      },
      notYet,
    );
  }
  for (const m of mail) {
    if (m.accounts === 0 && m.maildirBytes === 0) continue;
    const parts = [count(ctx, m.accounts, 'analyze.value.mailboxesOne', 'analyze.value.mailboxes')];
    if (m.maildirBytes > 0) parts.push(formatBytes(m.maildirBytes, ctx.lang));
    if (m.notes.includes('mx_preserved')) parts.push(t('analyze.detail.mx'));
    place(
      m.status,
      {
        label: t('analyze.item.mailDomain', { domain: safeText(m.id) }),
        detail: parts.join(' · '),
      },
      notYet,
    );
  }
  for (const z of zones) {
    const types = Object.keys(z.records).sort().join(', ');
    place(
      z.status,
      {
        label: t('analyze.item.dnsZone', { domain: safeText(z.id) }),
        detail: `${count(ctx, z.total, 'analyze.value.recordsOne', 'analyze.value.records')}${types ? ` (${types})` : ''}`,
      },
      notYet,
    );
  }
  const cron = counted('cron');
  if (cron) {
    place(
      cron.status,
      {
        label: t('analyze.item.cron'),
        detail: count(ctx, cron.count, 'analyze.value.cronOne', 'analyze.value.cron'),
      },
      notYet,
    );
  }
  const stay = (kind: CountItem['kind'], label: MessageKey, why: MessageKey) => {
    const item = counted(kind);
    if (!item) return;
    stays.push({
      tone: 'ring',
      label: t(label, { count: number(ctx, item.count) }),
      detail: t(why),
    });
  };
  stay('ssl', 'analyze.stay.ssl', 'analyze.stay.sslWhy');
  stay('panel_password', 'analyze.stay.password', 'analyze.stay.passwordWhy');
  stay('ftp', 'analyze.stay.ftp', 'analyze.stay.ftpWhy');
  stay('postgresql', 'analyze.stay.postgres', 'analyze.stay.postgresWhy');
  return { comes, stays };
}

/** "1 WordPress site, 1 MariaDB 10.11 database and the DNS zone". */
function comesSummary(ctx: Ctx, report: Report): string {
  const t = ctx.out.t;
  const { sites, databases, mail, zones, counted } = sitesOf(report);
  const moving = sites.filter((s) => s.status !== 'not_migrated');
  const wp = moving.filter((s) => s.app === 'wordpress').length;
  const parts: string[] = [];
  if (moving.length > 0) {
    parts.push(
      wp === moving.length
        ? count(ctx, wp, 'analyze.count.wpSitesOne', 'analyze.count.wpSites')
        : count(ctx, moving.length, 'analyze.count.sitesOne', 'analyze.count.sites'),
    );
  }
  const dbs = databases.filter((d) => d.status !== 'not_migrated');
  if (dbs.length === 1) parts.push(t('analyze.count.databaseOne', { engine: dbLabel(dbs[0]!) }));
  else if (dbs.length > 1)
    parts.push(count(ctx, dbs.length, 'analyze.count.databaseOne', 'analyze.count.databases'));
  const boxes = mail
    .filter((m) => m.status !== 'not_migrated')
    .reduce((sum, m) => sum + m.accounts, 0);
  if (boxes > 0)
    parts.push(count(ctx, boxes, 'analyze.count.mailboxesOne', 'analyze.count.mailboxes'));
  const zoneCount = zones.filter((z) => z.status !== 'not_migrated').length;
  if (zoneCount === 1) parts.push(t('analyze.count.zone'));
  else if (zoneCount > 1)
    parts.push(count(ctx, zoneCount, 'analyze.count.zone', 'analyze.count.zones'));
  const cron = counted('cron');
  if (cron && cron.status !== 'not_migrated') {
    parts.push(count(ctx, cron.count, 'analyze.count.cronOne', 'analyze.count.cron'));
  }
  return parts.length > 0 ? list(ctx, parts) : t('analyze.count.nothing');
}

function contentRows(ctx: Ctx, report: Report): [string, string][] {
  const t = ctx.out.t;
  const s = report.summary!;
  const { sites, databases, php } = sitesOf(report);
  const none = t('analyze.value.none');
  const rows: [string, string][] = [];
  if (report.account) {
    rows.push([
      t('analyze.label.account'),
      t('analyze.value.account', { user: report.account.user }),
    ]);
    if (report.account.primaryDomain) {
      rows.push([t('analyze.label.domain'), safeText(report.account.primaryDomain)]);
    }
  }
  rows.push([
    t('analyze.label.sites'),
    s.sites === 0
      ? none
      : s.wordpressSites === s.sites
        ? count(ctx, s.sites, 'analyze.count.wpSitesOne', 'analyze.count.wpSites')
        : t('analyze.value.sitesMixed', {
            sites: count(ctx, s.sites, 'analyze.count.sitesOne', 'analyze.count.sites'),
            wordpress: number(ctx, s.wordpressSites),
          }),
  ]);
  const versions = [
    ...new Set([...php.values()].map((p) => p.version ?? p.label).filter((v): v is string => !!v)),
  ].sort();
  if (sites.length > 0)
    rows.push([
      'PHP',
      versions.length > 0 ? versions.map(safeText).join(', ') : t('analyze.detail.phpDefault'),
    ]);
  const engines = [...new Set(databases.map(dbLabel))];
  const dbBytes = databases.reduce((sum, d) => sum + d.bytes, 0);
  rows.push([
    t('analyze.label.databases'),
    databases.length === 0
      ? none
      : `${number(ctx, databases.length)} · ${engines.join(', ')} · ${formatBytes(dbBytes, ctx.lang)}`,
  ]);
  rows.push([
    t('analyze.label.email'),
    s.emailDomains === 0
      ? none
      : t('analyze.value.mail', {
          domains: count(
            ctx,
            s.emailDomains,
            'analyze.value.mailDomainsOne',
            'analyze.value.mailDomains',
          ),
          boxes:
            s.emailAccounts === 0
              ? t('analyze.value.mailboxesNone')
              : count(
                  ctx,
                  s.emailAccounts,
                  'analyze.value.mailboxesOne',
                  'analyze.value.mailboxes',
                ),
        }),
  ]);
  rows.push([
    t('analyze.label.dns'),
    s.dnsZones === 0
      ? none
      : t('analyze.value.dns', {
          zones: count(ctx, s.dnsZones, 'analyze.value.zonesOne', 'analyze.value.zones'),
          records: count(ctx, s.dnsRecords, 'analyze.value.recordsOne', 'analyze.value.records'),
        }),
  ]);
  rows.push([
    t('analyze.label.cron'),
    s.cronJobs === 0 ? none : count(ctx, s.cronJobs, 'analyze.value.cronOne', 'analyze.value.cron'),
  ]);
  rows.push([
    t('analyze.label.files'),
    count(ctx, s.homeFiles, 'analyze.value.filesOne', 'analyze.value.files', {
      size: formatBytes(s.homeBytes, ctx.lang),
    }),
  ]);
  return rows;
}

function planRows(
  ctx: Ctx,
  report: Report,
  fileArg: string,
): { rows: [string, string][]; command: string } {
  const t = ctx.out.t;
  const need = report.requirements!;
  const rec = report.recommendation;
  const base = `bladecp migrate ${shellArg(fileArg)}`;
  const rows: [string, string][] = [[t('analyze.plan.disk'), `${need.diskGb} GB`]];
  if (need.databases > 0) {
    const engines = [
      ...new Set(
        report.items
          .filter((item): item is DatabaseItem => item.kind === 'database')
          .map((db) => engineName(db.engine)),
      ),
    ];
    rows.push([
      t('analyze.plan.databases'),
      engines.length > 0
        ? t('analyze.plan.databasesValue', {
            count: number(ctx, need.databases),
            engine: engines.join(', '),
          })
        : number(ctx, need.databases),
    ]);
  }
  if (rec.mode === 'offline') {
    rows.push([t('analyze.plan.prices'), t('analyze.plan.pricesHint')]);
  } else if (
    rec.mode === 'signed_out' ||
    (rec.mode === 'unavailable' && rec.reason === 'unauthorized')
  ) {
    rows.push([t('analyze.plan.prices'), t('analyze.plan.signIn')]);
  } else if (rec.mode === 'unavailable') {
    rows.push([t('analyze.plan.prices'), t('analyze.plan.unavailable')]);
  } else if (!rec.best) {
    rows.push([t('analyze.plan.prices'), t('analyze.plan.none')]);
  } else {
    rows.push([safeText(rec.best.planName), planLine(ctx, rec.best)]);
    if (rec.alternatives.length > 0) {
      rows.push([
        t('analyze.plan.alsoFits'),
        rec.alternatives
          .map((c) => `${safeText(c.planName)} (${planLine(ctx, { ...c, locations: [] })})`)
          .join(', '),
      ]);
    }
    rows.push([t('analyze.plan.pricesNow'), t('analyze.plan.priceNote')]);
    const location = rec.best.locations[0];
    if (location) {
      return {
        rows,
        command: `${base} --plan ${rec.best.partnerPlanId} --location ${location.locationId}`,
      };
    }
  }
  return { rows, command: base };
}

function sensitiveNote(ctx: Ctx, report: Report): string | null {
  const kinds = report.privacy.sensitive;
  if (kinds.length === 0) return null;
  return ctx.out.t(
    kinds.includes('private_keys') ? 'analyze.privacy.keys' : 'analyze.privacy.passwords',
  );
}

function fileMeta(ctx: Ctx, report: Report): string {
  const t = ctx.out.t;
  const f = report.file;
  const parts = [
    t(f.compression === 'gzip' ? 'analyze.kind.gzip' : 'analyze.kind.tar'),
    formatBytes(f.bytes, ctx.lang),
  ];
  if (f.uncompressedBytes > 0 && f.compression === 'gzip') {
    parts.push(t('analyze.uncompressed', { size: formatBytes(f.uncompressedBytes, ctx.lang) }));
  }
  if (f.entries > 0) parts.push(count(ctx, f.entries, 'analyze.entriesOne', 'analyze.entries'));
  return parts.join(' · ');
}

const VERDICT: Record<Report['verdict'], MessageKey> = {
  supported: 'analyze.verdict.supported',
  supported_with_warnings: 'analyze.verdict.warnings',
  blocked: 'analyze.verdict.blocked',
};

function richScreen(ctx: Ctx, k: Kit, report: Report, fileArg: string, tookMs: number): string[] {
  const t = ctx.out.t;
  const width = Math.min(k.width, 78);
  const railWrap = (text: string, paint: (s: string) => string = (s) => s) =>
    k.wrap(text, width - 3, '').map((line) => k.railLine(paint(line)));
  const lines = [
    '',
    `  ${k.rail(k.glyph.open)}  ${k.bold(t('analyze.title'))}`,
    k.railLine(),
    `  ${k.ok(k.glyph.done)}  ${safeText(report.file.name)}`,
    ...railWrap(
      `${fileMeta(ctx, report)}${tookMs >= 1000 ? ` · ${formatDuration(tookMs)}` : ''}`,
      k.muted,
    ),
    k.railLine(),
  ];
  if (report.verdict === 'blocked') {
    lines.push(`  ${k.err(k.glyph.cross)}  ${k.bold(t(VERDICT.blocked))}`);
    report.blockers.forEach((b, i) => {
      const { what, fix } = blockText(ctx, b, report);
      if (i > 0) lines.push(k.railLine());
      lines.push(...railWrap(what));
      if (fix) lines.push(...railWrap(fix, k.muted));
    });
  } else {
    const glyph = report.verdict === 'supported' ? k.ok(k.glyph.done) : k.warn(k.glyph.done);
    lines.push(
      `  ${glyph}  ${k.bold(t(VERDICT[report.verdict]))}`,
      ...railWrap(comesSummary(ctx, report)),
    );
  }
  lines.push(`  ${k.rail(k.glyph.end)}  ${k.muted(t('analyze.local'))}`);

  const section = (title: MessageKey) =>
    lines.push('', `  ${k.ruler(t(title), Math.min(44, width))}`);
  const items = (entries: Line[]) =>
    twoColumns(
      ctx.out,
      entries.map((e) => {
        const glyph =
          e.tone === 'ok'
            ? k.ok(k.glyph.check)
            : e.tone === 'warn'
              ? k.warn(k.glyph.warning)
              : k.faint(k.glyph.ring);
        return [`${glyph}  ${e.label}`, e.detail];
      }),
      { width, paintRight: k.muted, wrap: (text, w) => k.wrap(text, w, '') },
    );

  if (report.summary) {
    section('analyze.section.contents');
    lines.push(...k.rows(contentRows(ctx, report), { width }));
  }
  if (report.verdict !== 'blocked' && report.summary) {
    const { comes, stays } = itemLines(ctx, report);
    if (comes.length > 0) {
      section('analyze.section.comes');
      lines.push(...items(comes));
    }
    if (stays.length > 0) {
      section('analyze.section.stays');
      lines.push(...items(stays));
    }
  }
  if (report.warnings.length > 0) {
    section('analyze.section.warnings');
    for (const w of report.warnings) {
      k.wrap(warnText(ctx, w), width - 5, '').forEach((line, i) => {
        lines.push(i === 0 ? `  ${k.warn(k.glyph.warning)}  ${line}` : `     ${line}`);
      });
    }
  }
  if (report.verdict !== 'blocked' && report.requirements) {
    const plan = planRows(ctx, report, fileArg);
    section(
      report.recommendation.mode === 'live' && report.recommendation.best
        ? 'analyze.section.recommended'
        : 'analyze.section.plan',
    );
    lines.push(...k.rows(plan.rows, { width }));
    const note = sensitiveNote(ctx, report);
    lines.push('');
    if (note) lines.push(...k.wrap(note, width - 2).map((line) => k.faint(line)));
    lines.push(
      `  ${k.muted(t('analyze.next'))}`,
      `  ${k.violet(k.glyph.arrow)} ${k.accent(plan.command)}`,
    );
  } else if (report.verdict === 'blocked') {
    lines.push(
      '',
      `  ${k.muted(t('analyze.again'))}`,
      `  ${k.violet(k.glyph.arrow)} ${k.accent(`bladecp analyze ${shellArg(fileArg)}`)}`,
    );
  }
  return lines;
}

function plainScreen(ctx: Ctx, report: Report, fileArg: string): string[] {
  const t = ctx.out.t;
  const k = kit(ctx.out, 'out');
  const lines = [
    `${safeText(report.file.name)}: ${t(VERDICT[report.verdict])}`,
    fileMeta(ctx, report),
  ];
  for (const b of report.blockers) {
    const { what, fix } = blockText(ctx, b, report);
    lines.push(`  ${what}`);
    if (fix) lines.push(`  ${fix}`);
  }
  if (report.summary) {
    lines.push('', ...k.plainRows(contentRows(ctx, report)));
  }
  if (report.verdict !== 'blocked' && report.summary) {
    const { comes, stays } = itemLines(ctx, report);
    if (comes.length > 0) {
      lines.push(
        '',
        `${t('analyze.section.comes')}:`,
        ...comes.map((e) => `  ${e.label}: ${e.detail}`),
      );
    }
    if (stays.length > 0) {
      lines.push(
        '',
        `${t('analyze.section.stays')}:`,
        ...stays.map((e) => `  ${e.label}: ${e.detail}`),
      );
    }
  }
  if (report.warnings.length > 0) {
    lines.push(
      '',
      `${t('analyze.section.warnings')}:`,
      ...report.warnings.map((w) => `  ${warnText(ctx, w)}`),
    );
  }
  if (report.verdict !== 'blocked' && report.requirements) {
    const plan = planRows(ctx, report, fileArg);
    lines.push(
      '',
      `${t('analyze.section.plan')}:`,
      ...k.plainRows(plan.rows, 2),
      '',
      `${t('analyze.next')} ${plan.command}`,
    );
  }
  lines.push('', t('analyze.local'));
  return lines;
}

/** The report for `--json`: the core report plus the sentences, in the language of the run. */
function jsonReport(ctx: Ctx, report: Report): unknown {
  return {
    ...report,
    blockers: report.blockers.map((b) => {
      const { what, fix } = blockText(ctx, b, report);
      return { ...b, message: what, ...(fix ? { fix } : {}) };
    }),
    warnings: report.warnings.map((w) => ({ ...w, message: warnText(ctx, w) })),
  };
}

// ------------------------------------------------------------------ progress

function progressLines(
  ctx: Ctx,
  k: Kit,
  view: { name: string; read: number; total: number; rate: number; frame: number },
): string[] {
  const t = ctx.out.t;
  const fraction = view.total > 0 ? Math.min(1, view.read / view.total) : 1;
  const percent = `${Math.floor(fraction * 100)}%`.padStart(4);
  const width = Math.min(k.width, 76);
  const barWidth = Math.max(8, Math.min(54, width - 12));
  const stats = [
    t('analyze.progress', {
      read: formatBytes(view.read, ctx.lang),
      total: formatBytes(view.total, ctx.lang),
    }),
    ...(view.rate > 0 ? [`${formatBytes(view.rate, ctx.lang)}/s`] : []),
    ...(view.rate > 0 && view.read < view.total
      ? [t('upload.eta', { time: formatDuration(((view.total - view.read) / view.rate) * 1000) })]
      : []),
  ];
  let statsLine = '';
  for (const part of stats) {
    const next = statsLine ? `${statsLine}  ${k.muted('·')}  ${part}` : part;
    if (ctx.out.width(next) + 5 > width && statsLine) break;
    statsLine = next;
  }
  return [
    `  ${k.accent(k.spin[view.frame % k.spin.length]!)}  ${k.shimmer(t('analyze.reading', { file: view.name }), view.frame * 90)} ${k.muted(`· ${t('analyze.readingNote')}`)}`,
    k.railLine(`${k.lightBar(fraction, barWidth)}  ${k.bold(percent)}`),
    k.railLine(statsLine),
  ];
}

// ------------------------------------------------------------------- command

export async function analyzeCommand(
  ctx: Ctx,
  fileArg: string,
  flags: AnalyzeFlags,
): Promise<number> {
  let currency: string | undefined;
  if (flags.currency !== undefined) {
    if (!CURRENCY.test(flags.currency.trim())) {
      throw new CliError(
        'error.invalidCurrency',
        { value: flags.currency },
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    if (!flags.prices) {
      throw new CliError(
        'analyze.currencyNeedsPrices',
        {},
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    currency = flags.currency.trim().toUpperCase();
  }
  const file = await inspect(fileArg);
  const k = !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr ? kit(ctx.out, 'err') : null;
  const started = ctx.now();
  let lastDraw = 0;
  let frame = 0;
  const draw = (read: number, done = false) => {
    if (!k || file.size < PROGRESS_FROM_BYTES) return;
    const now = ctx.now();
    if (!done && now - lastDraw < 100) return;
    lastDraw = now;
    const elapsed = Math.max(1, now - started);
    ctx.out.live(
      progressLines(ctx, k, {
        name: safeText(file.name),
        read,
        total: file.size,
        rate: elapsed >= 500 ? (read / elapsed) * 1000 : 0,
        frame: frame++,
      }),
    );
    ctx.out.progress(Math.floor((read / Math.max(1, file.size)) * 100));
  };
  let report: Report;
  try {
    report = await analyzeFile(file.path, {
      signal: ctx.signal,
      onProgress: (p) => draw(p.readBytes),
    });
  } finally {
    ctx.out.progress(null);
    ctx.out.clearLiveLine();
  }
  const took = ctx.now() - started;
  if (flags.prices) {
    const recommendation = await livePrices(ctx, report, currency);
    report = {
      ...report,
      recommendation,
      privacy: {
        ...report.privacy,
        network: recommendation.mode !== 'offline' && recommendation.mode !== 'signed_out',
      },
    };
  }
  const code = report.verdict === 'blocked' ? ExitCode.REJECTED : ExitCode.OK;
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: jsonReport(ctx, report) });
    return code;
  }
  if (!ctx.out.rich) {
    ctx.out.lines(plainScreen(ctx, report, fileArg));
    return code;
  }
  ctx.out.lines(richScreen(ctx, kit(ctx.out, 'out'), report, fileArg, took));
  return code;
}
