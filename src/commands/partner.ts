// `bladecp partner plans | locations | options | branding`: the catalog a
// BladeCP partner sells from (plans and their prices, the locations of each
// plan, the configurable options) and the brand its customers see.

import { dataList, dataObject, invalidResponse, isRecord, type Json } from '../api.js';
import type { Ctx } from '../context.js';
import { ExitCode } from '../errors.js';
import { productLabel } from '../format.js';
import type { Lang, MessageKey, Translator } from '../i18n/index.js';
import { type Column, showDetail, showList, statusColumn, type Tone } from '../ui/views.js';
import {
  emitData,
  type Handlers,
  optInteger,
  optString,
  partnerOnly,
  signedInApi,
  usageError,
} from './common.js';

const CURRENCY = /^[A-Za-z]{3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `--currency`, as an upper-case code, or a usage error. */
export function currencyOption(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!CURRENCY.test(value.trim())) throw usageError('error.invalidCurrency', { value });
  return value.trim().toUpperCase();
}

/** An amount in currency units ("R$ 49,00"); an unknown currency is written as code and number. */
export function money(amount: number, currency: string | null | undefined, lang: Lang): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency} ${amount}`;
    }
  }
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount,
  );
}

/** Billing periods of a price, the shortest first. */
const PERIODS: [field: string, key: MessageKey][] = [
  ['priceMonthly', 'partner.price.monthly'],
  ['priceQuarterly', 'partner.price.quarterly'],
  ['priceHalfYearly', 'partner.price.halfYearly'],
  ['priceYearly', 'partner.price.yearly'],
  ['priceTwoYears', 'partner.price.twoYears'],
  ['priceThreeYears', 'partner.price.threeYears'],
];

/** The prices of one currency (an item of `currencies`), as its shortest period. */
function periodPrice(entry: Json, t: Translator, lang: Lang): string | null {
  const currency = typeof entry.currency === 'string' ? entry.currency : null;
  for (const [field, key] of PERIODS) {
    const amount = entry[field];
    if (typeof amount !== 'number') continue;
    if (amount === 0) return t('partner.price.free');
    return t(key, { price: money(amount, currency, lang) });
  }
  return null;
}

function currencies(item: Json): Json[] {
  return Array.isArray(item.currencies) ? item.currencies.filter(isRecord) : [];
}

/** The currency to show: the one asked for, else the person's usual one when offered, else the first. */
function pickCurrency(list: Json[], wanted: string | undefined, lang: Lang): Json | undefined {
  const code = (entry: Json) => String(entry.currency ?? '').toUpperCase();
  if (wanted) return list.find((entry) => code(entry) === wanted);
  const usual = lang === 'pt-BR' ? 'BRL' : 'USD';
  return list.find((entry) => code(entry) === usual) ?? list[0];
}

/** The currencies shown, when they are all the same one ("Prices in BRL"). */
function onlyCurrency(shown: (Json | undefined)[]): string | null {
  const codes = new Set(
    shown.filter((entry): entry is Json => entry !== undefined).map((e) => String(e.currency)),
  );
  return codes.size === 1 ? [...codes][0]! : null;
}

/** Keeps only the prices in `currency` (what `--currency` asks for, also in --json). */
function narrowCurrencies<T extends Json>(item: T, currency: string | undefined): T {
  if (!currency) return item;
  return {
    ...item,
    currencies: currencies(item).filter((e) => String(e.currency).toUpperCase() === currency),
  };
}

// ------------------------------------------------------------------- plans

function checkPlan(plan: Json): Json {
  if (typeof plan.id !== 'number' || typeof plan.name !== 'string') throw invalidResponse();
  return plan;
}

/** Whether the plan can be sold and set up from the API: ready, delivered by hand, or not ready. */
export function planAvailability(plan: Json, t: Translator): { label: string; tone: Tone } {
  const availability = isRecord(plan.availability) ? plan.availability : null;
  const manual = plan.activationMode === 'manual';
  const ready = () =>
    manual
      ? { label: t('partner.sale.manual'), tone: 'violet' as const }
      : { label: t('partner.sale.ready'), tone: 'ok' as const };
  if (availability && typeof availability.readiness === 'string') {
    switch (availability.readiness) {
      case 'ready':
        return availability.salesEligible === false
          ? { label: t('partner.sale.notReady'), tone: 'warn' }
          : ready();
      case 'not_ready':
        return { label: t('partner.sale.notReady'), tone: 'warn' };
      case 'blocked':
        return { label: t('partner.sale.blocked'), tone: 'err' };
      default:
        return { label: t('partner.sale.unknown'), tone: 'faint' };
    }
  }
  if (availability && typeof availability.status === 'string') {
    switch (availability.status) {
      case 'ready':
        return ready();
      case 'disabled':
        return { label: t('partner.sale.disabled'), tone: 'faint' };
      case 'draft':
        return { label: t('partner.sale.draft'), tone: 'faint' };
      default:
        return { label: t('partner.sale.notReady'), tone: 'warn' };
    }
  }
  if (plan.customerApiProvisioningSupported === false)
    return { label: t('partner.sale.notReady'), tone: 'warn' };
  return ready();
}

function planProduct(plan: Json, t: Translator): string {
  if (typeof plan.customerApiProductType === 'string')
    return productLabel(plan.customerApiProductType, t);
  return typeof plan.productName === 'string' && plan.productName ? plan.productName : '-';
}

async function plansCommand(ctx: Ctx, currencyArg: string | undefined): Promise<number> {
  const currency = currencyOption(currencyArg);
  const api = await signedInApi(ctx);
  const plans = await partnerOnly(api, async () =>
    dataList(await api.request('getPartnerPlans')).map(checkPlan),
  );
  const shown = plans.map((plan) => narrowCurrencies(plan, currency));
  if (ctx.json) return emitData(ctx, shown);
  const t = ctx.out.t;
  const prices = new Map(
    shown.map((plan) => [plan, pickCurrency(currencies(plan), currency, ctx.lang)]),
  );
  const columns: Column<Json>[] = [
    {
      header: t('column.id'),
      value: (plan) => String(plan.id),
      paint: (k, text) => k.violet(text),
      priority: 5,
    },
    {
      header: t('column.plan'),
      value: (plan) => String(plan.name),
      priority: 4,
      flex: true,
      min: 10,
    },
    {
      header: t('column.product'),
      value: (plan) => planProduct(plan, t),
      paint: (k, text) => k.muted(text),
      priority: 1,
      flex: true,
      min: 8,
    },
    {
      header: t('column.price'),
      value: (plan) => {
        const entry = prices.get(plan);
        return (entry && periodPrice(entry, t, ctx.lang)) ?? '-';
      },
      priority: 3,
    },
    statusColumn(
      t('column.status'),
      (plan) => planAvailability(plan, t).label,
      (plan) => planAvailability(plan, t).tone,
      2,
    ),
  ];
  const only = currency ?? onlyCurrency([...prices.values()]);
  const summary = [
    t(shown.length === 1 ? 'partner.plans.countOne' : 'partner.plans.count', {
      count: shown.length,
    }),
    ...(only && shown.length > 0 ? [t('partner.pricesIn', { currency: only })] : []),
  ].join(' · ');
  const first = shown[0];
  const notReady = shown.some((plan) => {
    const tone = planAvailability(plan, t).tone;
    return tone === 'warn' || tone === 'err';
  });
  showList(ctx.out, {
    items: shown,
    columns,
    empty: t('partner.plans.empty'),
    summary,
    ...(notReady ? { notes: [t('partner.plans.notReadyNote')] } : {}),
    ...(first
      ? {
          next: [
            {
              text: t('partner.plans.next'),
              command: `bladecp partner locations --plan ${first.id}`,
            },
          ],
        }
      : {}),
  });
  return ExitCode.OK;
}

// --------------------------------------------------------------- locations

function checkLocation(location: Json): Json {
  if (typeof location.id !== 'number') throw invalidResponse();
  return location;
}

function locationText(location: Json): string {
  const city = typeof location.city === 'string' ? location.city : '';
  const country = typeof location.countryCode === 'string' ? location.countryCode : '';
  if (city && country) return `${city}, ${country}`;
  return city || country || '-';
}

async function locationsCommand(ctx: Ctx, planId: number | undefined): Promise<number> {
  const api = await signedInApi(ctx);
  const locations = await partnerOnly(api, async () =>
    dataList(await api.request('getPartnerLocations', { query: { plan_id: planId } })).map(
      checkLocation,
    ),
  );
  if (ctx.json) return emitData(ctx, locations);
  const t = ctx.out.t;
  const first = locations[0];
  showList(ctx.out, {
    items: locations,
    columns: [
      {
        header: t('column.id'),
        value: (l) => String(l.id),
        paint: (k, text) => k.violet(text),
        priority: 5,
      },
      // Wide enough for "Sao Paulo, BR": the region leaves before the place is cut.
      { header: t('column.location'), value: locationText, priority: 4, flex: true, min: 14 },
      {
        header: t('column.plan'),
        value: (l) => (typeof l.planId === 'number' ? String(l.planId) : '-'),
        paint: (k, text) => k.violet(text),
        priority: 3,
      },
      {
        header: t('partner.column.region'),
        value: (l) => (typeof l.region === 'string' && l.region ? l.region : '-'),
        paint: (k, text) => k.muted(text),
        priority: 1,
      },
    ],
    empty:
      planId === undefined
        ? t('partner.locations.empty')
        : t('partner.locations.emptyPlan', { plan: planId }),
    summary: t(locations.length === 1 ? 'partner.locations.countOne' : 'partner.locations.count', {
      count: locations.length,
    }),
    ...(first
      ? {
          next: [
            {
              text: t('partner.locations.next'),
              command: `bladecp partner servers create --plan ${typeof first.planId === 'number' ? first.planId : '<id>'} --location ${first.id} --domain <host> --email <email> --name <name>`,
            },
          ],
        }
      : {}),
  });
  return ExitCode.OK;
}

// ----------------------------------------------------------------- options

/** The option groups of an answer, checked: each with its options and their values. */
export function checkOptionGroups(body: unknown): Json[] {
  const groups = dataList(body);
  for (const group of groups) {
    if (typeof group.uuid !== 'string' || !Array.isArray(group.options)) throw invalidResponse();
    for (const option of group.options) {
      if (!isRecord(option) || typeof option.uuid !== 'string' || typeof option.slug !== 'string')
        throw invalidResponse();
      if (!Array.isArray(option.values) || !option.values.every(isRecord)) throw invalidResponse();
      for (const value of option.values as Json[]) {
        if (typeof value.uuid !== 'string') throw invalidResponse();
      }
    }
  }
  return groups;
}

const byOrder = (a: Json, b: Json) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0);

/** Options of every group, in the order the API sets. */
export function allOptions(groups: Json[]): Json[] {
  return [...groups].sort(byOrder).flatMap((group) => [...(group.options as Json[])].sort(byOrder));
}

export function optionValues(option: Json): Json[] {
  return [...(option.values as Json[])].sort(byOrder);
}

/** What to type after `<option>=` for a value: its value, else its ID. */
export function valueWord(value: Json): string {
  return typeof value.value === 'string' && value.value.trim() !== '' && !/\s/.test(value.value)
    ? value.value
    : String(value.uuid);
}

/** The value a quantity option counts (the first that is not the default). */
export function unitValue(option: Json): Json | undefined {
  const values = optionValues(option);
  return values.find((value) => value.isDefault !== true) ?? values[0];
}

interface OptionRow {
  option: Json;
  /** Typed after `<option>=`. */
  word: string;
  label: string;
  price: string;
  isDefault: boolean;
  first: boolean;
  currency: Json | undefined;
}

function optionRows(
  groups: Json[],
  currency: string | undefined,
  t: Translator,
  lang: Lang,
): OptionRow[] {
  const rows: OptionRow[] = [];
  for (const option of allOptions(groups)) {
    const priced = (value: Json) => {
      const entry = pickCurrency(currencies(value), currency, lang);
      return { entry, text: (entry && periodPrice(entry, t, lang)) ?? '-' };
    };
    if (option.inputType === 'quantity') {
      const unit = unitValue(option);
      if (!unit) continue;
      const min = typeof option.minQty === 'number' ? option.minQty : null;
      const max = typeof option.maxQty === 'number' ? option.maxQty : null;
      const { entry, text } = priced(unit);
      rows.push({
        option,
        word: min !== null && max !== null ? `${min}-${max}` : max !== null ? `1-${max}` : '<n>',
        label: typeof unit.label === 'string' ? unit.label : String(option.unit ?? '-'),
        price: text === '-' ? text : t('partner.price.each', { price: text }),
        isDefault: false,
        first: true,
        currency: entry,
      });
      continue;
    }
    optionValues(option).forEach((value, index) => {
      const { entry, text } = priced(value);
      rows.push({
        option,
        word: valueWord(value),
        label: typeof value.label === 'string' ? value.label : '-',
        price: value.isDefault === true ? t('partner.options.default') : text,
        isDefault: value.isDefault === true,
        first: index === 0,
        currency: value.isDefault === true ? undefined : entry,
      });
    });
  }
  return rows;
}

/** `--plan` of `partner options`: the numeric plan ID or the plan UUID. */
function planFilter(raw: string | undefined): { id?: number; uuid?: string } {
  if (raw === undefined) return {};
  const value = raw.trim();
  if (/^\d{1,9}$/.test(value) && Number(value) > 0) return { id: Number(value) };
  if (UUID.test(value)) return { uuid: value };
  throw usageError('partner.error.plan', { value: raw });
}

async function optionsCommand(
  ctx: Ctx,
  planArg: string | undefined,
  currencyArg: string | undefined,
): Promise<number> {
  const plan = planFilter(planArg);
  const currency = currencyOption(currencyArg);
  const api = await signedInApi(ctx);
  const groups = await partnerOnly(api, async () =>
    checkOptionGroups(
      plan.uuid
        ? await api.request('getPartnerPlansByPlanUuidOption-groups', {
            params: { planUuid: plan.uuid },
            query: { currency },
          })
        : await api.request('getPartnerOption-groups', { query: { plan: plan.id, currency } }),
    ),
  );
  if (ctx.json) return emitData(ctx, groups);
  const t = ctx.out.t;
  const rows = optionRows(groups, currency, t, ctx.lang);
  const optionCount = allOptions(groups).length;
  const only = currency ?? onlyCurrency(rows.map((row) => row.currency));
  const summary = [
    t(optionCount === 1 ? 'partner.options.countOne' : 'partner.options.count', {
      count: optionCount,
    }),
    ...(only && rows.length > 0 ? [t('partner.pricesIn', { currency: only })] : []),
  ].join(' · ');
  const sample = rows.find((row) => !row.isDefault);
  const word = (row: OptionRow) =>
    row.option.inputType === 'quantity' ? String(row.option.minQty ?? 1) : row.word;
  showList(ctx.out, {
    items: rows,
    columns: [
      {
        header: t('partner.column.option'),
        // On a terminal the option is written once, on its first value.
        value: (row) => (row.first ? String(row.option.slug) : ''),
        plain: (row) => String(row.option.slug),
        paint: (k, text) => k.violet(text),
        priority: 5,
      },
      {
        header: t('partner.column.value'),
        value: (row) => row.word,
        paint: (k, text) => k.accent(text),
        priority: 4,
      },
      {
        header: t('partner.column.label'),
        value: (row) => row.label,
        priority: 1,
        flex: true,
        min: 6,
      },
      {
        header: t('column.price'),
        value: (row) => row.price,
        paint: (k, text, row) => (row.isDefault ? k.faint(text) : text),
        priority: 3,
      },
    ],
    empty:
      plan.id !== undefined || plan.uuid !== undefined
        ? t('partner.options.emptyPlan')
        : t('partner.options.empty'),
    summary,
    ...(sample
      ? {
          next: [
            {
              text: t('partner.options.next'),
              command: `bladecp partner servers options <server> --option ${String(sample.option.slug)}=${word(sample)}`,
            },
          ],
        }
      : {}),
  });
  return ExitCode.OK;
}

// ---------------------------------------------------------------- branding

async function brandingCommand(ctx: Ctx): Promise<number> {
  const api = await signedInApi(ctx);
  const data = await partnerOnly(api, async () =>
    dataObject(await api.request('getBrandingAssets')),
  );
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const url = (field: string) =>
    typeof data[field] === 'string' && data[field] !== ''
      ? String(data[field])
      : t('partner.branding.none');
  showDetail(ctx.out, {
    title: t('partner.branding.title'),
    rows: [
      [t('partner.branding.name'), typeof data.publicName === 'string' ? data.publicName : '-'],
      [t('partner.branding.logo'), url('logoUrl')],
      [t('partner.branding.logoDark'), url('logoDarkUrl')],
      [t('partner.branding.favicon'), url('faviconUrl')],
    ],
  });
  return ExitCode.OK;
}

export const handlers: Handlers = {
  'partner.plans': (ctx, { values }) => plansCommand(ctx, optString(values, 'currency')),
  'partner.locations': (ctx, { values }) => locationsCommand(ctx, optInteger(values, 'plan')),
  'partner.options': (ctx, { values }) =>
    optionsCommand(ctx, optString(values, 'plan'), optString(values, 'currency')),
  'partner.branding': (ctx) => brandingCommand(ctx),
};
