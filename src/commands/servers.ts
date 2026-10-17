import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode } from '../errors.js';
import { formatDate, productLabel, table } from '../format.js';
import { safeText } from '../sanitize.js';
import type { Destination, DestinationLocation, DestinationPrice, UsageData } from '../types.js';

export async function serversListCommand(ctx: Ctx): Promise<number> {
  const auth = await resolveAuth(ctx);
  const servers = await createApi(ctx, auth.apiKey).listProvisions();
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: servers });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  if (servers.length === 0) {
    ctx.out.say('servers.empty');
    return ExitCode.OK;
  }
  ctx.out.print(
    table(
      [t('column.uuid'), t('column.domain'), t('column.product'), t('column.status')],
      servers.map((s) => [s.uuid, s.primary_domain ?? '-', productLabel(s.product_type), s.status]),
    ),
  );
  return ExitCode.OK;
}

const USAGE_ROWS: {
  metric: string;
  unit: 'gb' | 'count';
  label: Parameters<Ctx['out']['t']>[0];
}[] = [
  { metric: 'diskGb', unit: 'gb', label: 'usage.disk' },
  { metric: 'bandwidthGbMonth', unit: 'gb', label: 'usage.bandwidth' },
  { metric: 'emailAccounts', unit: 'count', label: 'usage.emailAccounts' },
  { metric: 'sqlDatabases', unit: 'count', label: 'usage.databases' },
  { metric: 'ftpAccounts', unit: 'count', label: 'usage.ftpAccounts' },
  { metric: 'subdomains', unit: 'count', label: 'usage.subdomains' },
  { metric: 'addonDomains', unit: 'count', label: 'usage.addonDomains' },
];

function usageLines(ctx: Ctx, usage: UsageData): string[] {
  const t = ctx.out.t;
  const number = new Intl.NumberFormat(ctx.lang, { maximumFractionDigits: 2 });
  const lines: string[] = [];
  for (const row of USAGE_ROWS) {
    const used = usage.usage?.[row.metric];
    const limit = usage.plan?.[row.metric];
    if (used == null && limit == null) continue;
    const suffix = row.unit === 'gb' ? ' GB' : '';
    const usedText = used == null ? '-' : `${number.format(used)}${suffix}`;
    const limitText = limit == null ? t('usage.unlimited') : `${number.format(limit)}${suffix}`;
    lines.push(`${t(row.label)}: ${usedText} / ${limitText}`);
  }
  return lines;
}

export async function serversShowCommand(ctx: Ctx, uuid: string): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
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
  const rows: [string, string][] = [
    [t('label.uuid'), server.uuid],
    [t('label.domain'), server.primary_domain ?? '-'],
    [t('label.product'), productLabel(server.product_type)],
    [t('label.status'), server.status],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows)
    ctx.out.print(`${ctx.out.style('dim', label.padEnd(width))}  ${safeText(value)}`);
  if (usage) {
    const lines = usageLines(ctx, usage);
    if (lines.length > 0) {
      ctx.out.print();
      ctx.out.print(
        ctx.out.style(
          'bold',
          usage.asOf
            ? t('usage.titleAsOf', { date: formatDate(usage.asOf, ctx.lang) })
            : t('usage.title'),
        ),
      );
      for (const line of lines) ctx.out.print(`  ${line}`);
    }
  }
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
  const auth = await resolveAuth(ctx);
  const destinations = await createApi(ctx, auth.apiKey).listDestinations(
    currency?.trim().toUpperCase(),
  );
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { destinations } });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
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
    table(
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
  const first = destinations[0];
  const firstLocation = first?.locations[0];
  if (first && firstLocation) {
    ctx.out.print(
      `  bladecp migrate backup.tar.gz --plan ${first.partnerPlanId} --location ${firstLocation.locationId}`,
    );
  }
  return ExitCode.OK;
}
