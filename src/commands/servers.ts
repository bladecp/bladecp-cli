import { provisionDomain, provisionProduct } from '../api.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode } from '../errors.js';
import {
  formatDate,
  isGoneServer,
  productLabel,
  serverStatusCount,
  serverStatusLabel,
  serverTone,
  shortIds,
  type Tone,
} from '../format.js';
import type { MessageKey } from '../i18n/index.js';
import { resolveId } from '../ids.js';
import { safeText } from '../sanitize.js';
import type {
  Destination,
  DestinationLocation,
  DestinationPrice,
  Provision,
  UsageData,
} from '../types.js';
import { fitTable, type Kit, kit } from '../ui/kit.js';

export function paintTone(k: Kit, tone: Tone, text: string): string {
  return tone === 'ok'
    ? k.ok(text)
    : tone === 'warn'
      ? k.warn(text)
      : tone === 'err'
        ? k.err(text)
        : tone === 'violet'
          ? k.violet(text)
          : k.faint(text);
}

function statusGlyph(k: Kit, status: string): string {
  const tone = serverTone(status);
  const glyph =
    tone === 'ok'
      ? k.glyph.bullet
      : tone === 'err'
        ? k.glyph.cross
        : tone === 'faint'
          ? k.glyph.ring
          : k.glyph.pending;
  return paintTone(k, tone, glyph);
}

/** "3 servers · 2 active · 1 pending" */
function serversSummary(ctx: Ctx, servers: Provision[]): string {
  const t = ctx.out.t;
  const counts = new Map<string, number>();
  for (const s of servers) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  const parts = [
    t(servers.length === 1 ? 'servers.countOne' : 'servers.countMany', { count: servers.length }),
    ...[...counts.entries()].map(([status, count]) => serverStatusCount(status, count, t)),
  ];
  return parts.join(' · ');
}

export async function serversListCommand(ctx: Ctx, all: boolean): Promise<number> {
  const auth = await resolveAuth(ctx);
  const servers = await createApi(ctx, auth.apiKey).listProvisions();
  if (ctx.json) {
    // The machine contract keeps every server, as in 0.1.0.
    ctx.out.emitJson({ ok: true, data: servers });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  const visible = all ? servers : servers.filter((s) => !isGoneServer(s.status));
  const hidden = servers.length - visible.length;
  if (!ctx.out.rich) {
    if (visible.length === 0) ctx.out.say('servers.empty');
    else {
      ctx.out.print(
        kit(ctx.out, 'out').plainTable(
          [t('column.uuid'), t('column.domain'), t('column.product'), t('column.status')],
          visible.map((s) => [
            s.uuid,
            provisionDomain(s) ?? '-',
            productLabel(provisionProduct(s), t),
            serverStatusLabel(s.status, t),
          ]),
        ),
      );
    }
    if (hidden > 0)
      ctx.out.info(t(hidden === 1 ? 'servers.hiddenOne' : 'servers.hidden', { count: hidden }));
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  if (visible.length === 0) {
    ctx.out.lines([
      '',
      `  ${k.faint(k.glyph.ring)}  ${t('servers.empty')}`,
      ...(hidden > 0
        ? [
            `  ${k.muted(t(hidden === 1 ? 'servers.hiddenOne' : 'servers.hidden', { count: hidden }))}`,
          ]
        : []),
    ]);
    return ExitCode.OK;
  }
  const ids = shortIds(visible.map((s) => s.uuid));
  const { header, body, width } = fitTable(
    k,
    [
      { header: t('column.id'), priority: 5 },
      { header: t('column.domain'), priority: 4, flex: true, min: 12 },
      { header: t('column.product'), priority: 1, flex: true, min: 8 },
      { header: t('column.status'), priority: 3 },
    ],
    visible.map((s) => {
      const status = serverStatusLabel(s.status, t);
      return [
        { text: safeText(ids.get(s.uuid) ?? s.uuid), paint: k.violet },
        { text: safeText(provisionDomain(s) ?? '-') },
        { text: productLabel(provisionProduct(s), t), paint: k.muted },
        {
          text: `${k.unicode ? '● ' : '* '}${status}`,
          paint: (text) => `${statusGlyph(k, s.status)}${text.slice(1)}`,
        },
      ];
    }),
  );
  ctx.out.lines([
    '',
    header,
    ` ${k.horizon(Math.min(width + 1, k.columns - 1), { at: 0.08, spread: 0.85, power: 1.2 })}`,
    ...body,
    '',
    `  ${k.muted(serversSummary(ctx, visible))}`,
    ...(hidden > 0
      ? [
          `  ${k.muted(t(hidden === 1 ? 'servers.hiddenOne' : 'servers.hidden', { count: hidden }))}`,
        ]
      : []),
    `  ${k.muted(t('servers.hint'))}`,
  ]);
  return ExitCode.OK;
}

const USAGE_ROWS: {
  metric: string;
  unit: 'gb' | 'count';
  label: MessageKey;
}[] = [
  { metric: 'diskGb', unit: 'gb', label: 'usage.disk' },
  { metric: 'bandwidthGbMonth', unit: 'gb', label: 'usage.bandwidth' },
  { metric: 'emailAccounts', unit: 'count', label: 'usage.emailAccounts' },
  { metric: 'sqlDatabases', unit: 'count', label: 'usage.databases' },
  { metric: 'ftpAccounts', unit: 'count', label: 'usage.ftpAccounts' },
  { metric: 'subdomains', unit: 'count', label: 'usage.subdomains' },
  { metric: 'addonDomains', unit: 'count', label: 'usage.addonDomains' },
];

interface UsageRow {
  label: string;
  used: string;
  limit: string;
  fraction: number | null;
}

function usageRows(ctx: Ctx, usage: UsageData): UsageRow[] {
  const t = ctx.out.t;
  const number = new Intl.NumberFormat(ctx.lang, { maximumFractionDigits: 2 });
  const rows: UsageRow[] = [];
  for (const row of USAGE_ROWS) {
    const used = usage.usage?.[row.metric];
    const limit = usage.plan?.[row.metric];
    if (used == null && limit == null) continue;
    const suffix = row.unit === 'gb' ? ' GB' : '';
    rows.push({
      label: t(row.label),
      used: used == null ? t('usage.notMeasured') : `${number.format(used)}${suffix}`,
      limit: limit == null ? t('usage.unlimited') : `${number.format(limit)}${suffix}`,
      fraction: used != null && limit != null && limit > 0 ? used / limit : null,
    });
  }
  return rows;
}

/** A small usage bar: green, then yellow from 75 %, red from 90 %. */
function usageBar(k: Kit, fraction: number): string {
  const n = 12;
  const filled = Math.max(0, Math.min(n, Math.round(fraction * n)));
  const tone: Tone = fraction >= 0.9 ? 'err' : fraction >= 0.75 ? 'warn' : 'ok';
  const full = k.unicode ? '━' : '=';
  const empty = k.unicode ? '─' : '-';
  return `${paintTone(k, tone, full.repeat(filled))}${k.faint(empty.repeat(n - filled))} ${k.muted(`${Math.round(fraction * 100)}%`)}`;
}

export async function serversShowCommand(ctx: Ctx, idArg: string): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  const uuid = await resolveId(idArg, () => api.listProvisions());
  const server = await api.getProvision(uuid);
  let usage: UsageData | null = null;
  try {
    usage = await api.getProvisionUsage(uuid);
  } catch (error) {
    // Usage is optional: some products are not metered, and an older key may
    // lack the scope. The server details are still useful on their own.
    if (!(error instanceof ApiError) || error.status === 401) throw error;
  }
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { server, usage } });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  const domain = provisionDomain(server);
  const status = serverStatusLabel(server.status, t);
  const rows = usage ? usageRows(ctx, usage) : [];
  const title = usage?.asOf
    ? t('usage.titleAsOf', { date: formatDate(usage.asOf, ctx.lang) })
    : t('usage.title');
  if (!ctx.out.rich) {
    const details: [string, string][] = [
      [t('label.uuid'), server.uuid],
      [t('label.domain'), domain ?? '-'],
      [t('label.product'), productLabel(provisionProduct(server), t)],
      [t('label.status'), status],
    ];
    ctx.out.lines(kit(ctx.out, 'out').plainRows(details));
    if (rows.length > 0) {
      ctx.out.print();
      ctx.out.print(title);
      for (const row of rows) ctx.out.print(`  ${row.label}: ${row.used} / ${row.limit}`);
    }
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  const lines = [
    '',
    `  ${k.bold(safeText(domain ?? server.uuid))}   ${statusGlyph(k, server.status)} ${status}`,
    ` ${k.horizon(k.width, { at: 0.1, spread: 0.6 })}`,
    ...k.rows([
      [t('label.id'), safeText(server.uuid)],
      [t('label.product'), productLabel(provisionProduct(server), t)],
    ]),
  ];
  if (rows.length > 0) {
    const labelWidth = Math.max(...rows.map((row) => ctx.out.width(row.label)));
    const valueWidth = Math.max(...rows.map((row) => ctx.out.width(`${row.used} / ${row.limit}`)));
    lines.push('', `  ${k.ruler(title)}`);
    for (const row of rows) {
      const value = `${row.used} ${k.muted('/')} ${row.limit}`;
      const pad = ' '.repeat(Math.max(0, valueWidth - ctx.out.width(`${row.used} / ${row.limit}`)));
      const bar = row.fraction !== null && k.width >= 56 ? `   ${usageBar(k, row.fraction)}` : '';
      lines.push(`  ${k.muted(row.label.padEnd(labelWidth))}  ${value}${pad}${bar}`);
    }
  } else if (usage === null || usage.status === 'metering_pending') {
    lines.push('', `  ${k.muted(t('usage.noData'))}`);
  }
  ctx.out.lines(lines);
  return ExitCode.OK;
}

function locationText(location: DestinationLocation | undefined): string {
  if (!location) return '-';
  return safeText(`${location.name}${location.countryCode ? ` (${location.countryCode})` : ''}`);
}

function money(price: DestinationPrice, lang: Ctx['lang']): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: price.currency }).format(
      price.priceMonthly,
    );
  } catch {
    return safeText(`${price.currency} ${price.priceMonthly}`);
  }
}

/** Monthly prices as "US$ 9.00/month", one per currency the API returned. */
export function pricesText(ctx: Ctx, prices: DestinationPrice[] | undefined): string {
  if (!prices || prices.length === 0) return '-';
  return prices
    .map((price) => ctx.out.t('destinations.perMonth', { price: money(price, ctx.lang) }))
    .join(', ');
}

/** The price to show when there is room for one: the person's currency when offered. */
export function preferredPrice(
  ctx: Ctx,
  prices: DestinationPrice[] | undefined,
  currency?: string,
): DestinationPrice | null {
  if (!prices || prices.length === 0) return null;
  const wanted = currency ?? (ctx.lang === 'pt-BR' ? 'BRL' : 'USD');
  return prices.find((p) => p.currency === wanted) ?? prices[0]!;
}

export function priceText(ctx: Ctx, price: DestinationPrice | null): string {
  return price ? ctx.out.t('destinations.perMonth', { price: money(price, ctx.lang) }) : '-';
}

function diskText(diskGb: number | null | undefined): string {
  return typeof diskGb === 'number' ? `${diskGb} GB` : '-';
}

export function destinationLabel(d: Destination, locationIndex: number, ctx: Ctx): string {
  const parts = [safeText(`${d.planName} (${d.partnerName})`)];
  if (typeof d.diskGb === 'number') parts.push(diskText(d.diskGb));
  if (d.prices && d.prices.length > 0) parts.push(pricesText(ctx, d.prices));
  parts.push(locationText(d.locations[locationIndex]));
  return parts.join(', ');
}

const CURRENCY = /^[A-Za-z]{3}$/;

export async function destinationsListCommand(
  ctx: Ctx,
  currency: string | undefined,
): Promise<number> {
  if (currency !== undefined && !CURRENCY.test(currency.trim())) {
    throw new CliError(
      'error.invalidCurrency',
      { value: currency },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  const code = currency?.trim().toUpperCase();
  const auth = await resolveAuth(ctx);
  const destinations = await createApi(ctx, auth.apiKey).listDestinations(code);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { destinations } });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  const example = (() => {
    const first = destinations.find((d) => d.locations.length > 0);
    return first
      ? `bladecp migrate backup.tar.gz --plan ${first.partnerPlanId} --location ${first.locations[0]!.locationId}`
      : null;
  })();
  if (!ctx.out.rich) {
    if (destinations.length === 0) {
      ctx.out.say('destinations.empty');
      return ExitCode.OK;
    }
    const rows: string[][] = [];
    for (const d of destinations) {
      for (const location of d.locations) {
        rows.push([
          String(d.partnerPlanId),
          d.planName,
          diskText(d.diskGb),
          pricesText(ctx, d.prices),
          d.partnerName,
          String(location.locationId),
          locationText(location),
        ]);
      }
    }
    ctx.out.print(
      kit(ctx.out, 'out').plainTable(
        [
          t('column.planId'),
          t('column.plan'),
          t('column.disk'),
          t('column.price'),
          t('column.provider'),
          t('column.locationId'),
          t('column.location'),
        ],
        rows,
      ),
    );
    ctx.out.print();
    ctx.out.print(t('destinations.useHint'));
    if (example) ctx.out.print(`  ${example}`);
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  if (destinations.length === 0) {
    ctx.out.lines(['', `  ${k.faint(k.glyph.ring)}  ${t('destinations.empty')}`]);
    return ExitCode.OK;
  }
  const currencies = new Set<string>();
  const rows = destinations.flatMap((d) =>
    d.locations.map((location) => {
      const price = preferredPrice(ctx, d.prices, code);
      if (price) currencies.add(price.currency);
      return [
        {
          text: `${d.partnerPlanId}  ${safeText(d.planName)}`,
          paint: (s: string) => paintPlan(k, s),
        },
        { text: diskText(d.diskGb) },
        { text: priceText(ctx, price) },
        {
          text: `${location.locationId}  ${locationText(location)}`,
          paint: (s: string) => paintPlan(k, s),
        },
        { text: safeText(d.partnerName), paint: k.muted },
      ];
    }),
  );
  const { header, body, width } = fitTable(
    k,
    [
      { header: t('column.plan'), priority: 5, flex: true, min: 12 },
      { header: t('column.disk'), priority: 2 },
      { header: t('column.price'), priority: 3 },
      { header: t('column.location'), priority: 4, flex: true, min: 10 },
      { header: t('column.provider'), priority: 1 },
    ],
    rows,
  );
  const locations = new Set(destinations.flatMap((d) => d.locations.map((l) => l.locationId)));
  const lines = [
    '',
    header,
    ` ${k.horizon(Math.min(width + 1, k.columns - 1), { at: 0.08, spread: 0.85, power: 1.2 })}`,
    ...body,
    '',
    `  ${k.muted(t('destinations.summary', { plans: destinations.length, locations: locations.size }))}`,
  ];
  if (currencies.size === 1) {
    const [only] = [...currencies];
    lines.push(`  ${k.muted(t('destinations.pricesIn', { currency: only! }))}`);
  }
  if (example) {
    lines.push(
      '',
      `  ${k.muted(t('destinations.useHint'))}`,
      `  ${k.violet(k.glyph.arrow)} ${k.accent(example)}`,
    );
  }
  ctx.out.lines(lines);
  return ExitCode.OK;
}

/** "12  Stack Container S": the ID in violet, the name plain. */
function paintPlan(k: Kit, text: string): string {
  const match = /^(\d+)( {2})(.*)$/.exec(text);
  return match ? `${k.violet(match[1]!)}${match[2]}${match[3]}` : text;
}
