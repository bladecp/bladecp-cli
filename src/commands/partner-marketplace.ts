// `bladecp partner marketplace`: what BladeCP sold of the partner's plans on
// its marketplace, the commission ledger, the monthly statements and the open
// invoices of the base server (the server the partner rents to resell).
// Read-only. Amounts arrive in cents and are shown in the language of the
// person and the currency of each record; `--json` keeps the cents.

import { dataObject, invalidResponse, isRecord, type Json } from '../api.js';
import type { OptionValues } from '../args.js';
import type { Ctx } from '../context.js';
import { ExitCode } from '../errors.js';
import type { Lang, MessageKey, Translator } from '../i18n/index.js';
import {
  type Column,
  type DetailRow,
  type Next,
  showDetail,
  showList,
  statusColumn,
  statusTone,
  type Tone,
} from '../ui/views.js';
import {
  emitData,
  type Handlers,
  optInteger,
  optString,
  partnerOnly,
  signedInApi,
  usageError,
} from './common.js';

// ------------------------------------------------------------------ values

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** An amount in cents, in the language of the person and the currency of the record. */
export function money(lang: Lang, cents: number | null, currency: string | null): string {
  if (cents === null) return '-';
  if (currency) {
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(cents / 100);
    } catch {
      // A code Intl does not know: the number with the code in front.
      return `${currency} ${(cents / 100).toFixed(2)}`;
    }
  }
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    cents / 100,
  );
}

function count(lang: Lang, value: unknown): string {
  const n = amount(value);
  return n === null ? '-' : new Intl.NumberFormat(lang).format(n);
}

/** A day ("Oct 3, 2026"). */
function day(lang: Lang, value: unknown): string {
  const raw = text(value);
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
}

/** The month of a statement ("Oct 2026", or "October 2026"); periods start at midnight UTC. */
function month(lang: Lang, value: unknown, long = false): string {
  const raw = text(value);
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(lang, {
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Flexible columns give up width before low-priority columns leave, so a
 * wide terminal keeps more of the names before it drops an amount.
 */
const wide = (ctx: Ctx) => ctx.out.columns >= 80;

// ---------------------------------------------------------------- statuses

type Labels = Record<string, [MessageKey, Tone]>;

const ORDER: Labels = {
  active: ['partnerMarket.order.active', 'ok'],
  churned: ['partnerMarket.order.churned', 'faint'],
};

const LINE: Labels = {
  pending: ['partnerMarket.line.pending', 'warn'],
  confirmed: ['partnerMarket.line.confirmed', 'violet'],
  cleared: ['partnerMarket.line.cleared', 'ok'],
  reversed: ['partnerMarket.line.reversed', 'faint'],
  rejected: ['partnerMarket.line.rejected', 'err'],
};

const STATEMENT: Labels = {
  open: ['partnerMarket.statement.open', 'violet'],
  closed: ['partnerMarket.statement.closed', 'warn'],
  requested: ['partnerMarket.statement.requested', 'warn'],
  approved: ['partnerMarket.statement.approved', 'warn'],
  paid: ['partnerMarket.statement.paid', 'ok'],
  rejected: ['partnerMarket.statement.rejected', 'err'],
  failed: ['partnerMarket.statement.failed', 'err'],
};

const INVOICE: Labels = {
  pending: ['partnerMarket.invoice.pending', 'warn'],
  unpaid: ['partnerMarket.invoice.unpaid', 'warn'],
  overdue: ['partnerMarket.invoice.overdue', 'err'],
  paid: ['partnerMarket.invoice.paid', 'ok'],
  cancelled: ['partnerMarket.invoice.cancelled', 'faint'],
  canceled: ['partnerMarket.invoice.cancelled', 'faint'],
};

const SOURCE: Record<string, MessageKey> = {
  first_sale: 'partnerMarket.source.firstSale',
  renewal: 'partnerMarket.source.renewal',
  proration: 'partnerMarket.source.proration',
};

const METHOD: Record<string, MessageKey> = {
  credit: 'partnerMarket.method.credit',
  pix: 'partnerMarket.method.pix',
  manual: 'partnerMarket.method.manual',
  foreign_rail: 'partnerMarket.method.foreignRail',
};

/** The word for a status the CLI knows, or the status as the API wrote it. */
function statusLabel(labels: Labels, t: Translator, status: unknown): string {
  const value = text(status) ?? '';
  const known = labels[value];
  return known ? t(known[0]) : value || '-';
}

function toneOf(labels: Labels, status: unknown): Tone {
  const value = text(status) ?? '';
  return labels[value]?.[1] ?? statusTone(value);
}

function word(keys: Record<string, MessageKey>, t: Translator, value: unknown): string {
  const raw = text(value);
  if (!raw) return '-';
  const key = keys[raw];
  return key ? t(key) : raw;
}

// ------------------------------------------------------------------- pages

/** `--page` and `--limit` (sent as pageSize, which the API caps at 100). */
function paging(values: OptionValues): { page?: number; limit?: number } {
  const page = optInteger(values, 'page');
  if (page !== undefined && page < 1) {
    throw usageError('partnerMarket.error.page', { value: optString(values, 'page') ?? '' });
  }
  const limit = optInteger(values, 'limit');
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw usageError('partnerMarket.error.limit', { value: optString(values, 'limit') ?? '' });
  }
  return {
    ...(page !== undefined ? { page } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

interface Page {
  data: Json;
  items: Json[];
  total: number;
  page: number;
  pages: number;
}

/** `{ items, total, page, pageSize }`, the paginated answers of the marketplace. */
function readPage(body: unknown): Page {
  const data = dataObject(body);
  const items = data.items;
  if (!Array.isArray(items) || !items.every(isRecord)) throw invalidResponse();
  const total = amount(data.total) ?? items.length;
  const page = amount(data.page) ?? 1;
  const size = amount(data.pageSize) ?? items.length;
  const pages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  return { data, items: items as Json[], total, page, pages };
}

function countLine(t: Translator, keys: [MessageKey, MessageKey], page: Page): string {
  const counted = t(page.total === 1 ? keys[0] : keys[1], { count: page.total });
  return page.pages > 1
    ? `${counted} · ${t('partnerMarket.page', { page: page.page, pages: page.pages })}`
    : counted;
}

const shellWord = (value: string) =>
  /^[\w.@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;

/** The command of the next page, with the same filters. */
function nextPage(t: Translator, words: string, page: Page, values: OptionValues): Next[] {
  if (page.page >= page.pages) return [];
  const parts = [`bladecp partner marketplace ${words}`];
  const status = optString(values, 'status')?.trim();
  if (status) parts.push(`--status ${shellWord(status)}`);
  const limit = optString(values, 'limit')?.trim();
  if (limit) parts.push(`--limit ${limit}`);
  parts.push(`--page ${page.page + 1}`);
  return [{ text: t('partnerMarket.next.page'), command: parts.join(' ') }];
}

// ---------------------------------------------------------------- commands

async function summaryCommand(ctx: Ctx): Promise<number> {
  const api = await signedInApi(ctx);
  const data = dataObject(await partnerOnly(api, () => api.request('getMarketplaceSummary')));
  if (!Array.isArray(data.currencies) || !data.currencies.every(isRecord)) throw invalidResponse();
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const lang = ctx.lang;
  const currencies = data.currencies as Json[];
  const sections = currencies.map((entry) => {
    const currency = text(entry.currency);
    const rows: DetailRow[] = [
      [t('partnerMarket.summary.pending'), money(lang, amount(entry.pendingCents), currency)],
      [t('partnerMarket.summary.confirmed'), money(lang, amount(entry.confirmedCents), currency)],
      [t('partnerMarket.summary.cleared'), money(lang, amount(entry.clearedCents), currency)],
      [
        t('partnerMarket.summary.total'),
        money(lang, amount(entry.lifetimeNetPayableCents), currency),
      ],
    ];
    return { title: t('partnerMarket.summary.earnings', { currency: currency ?? '-' }), rows };
  });
  const notes: string[] = [];
  if (currencies.length === 0) notes.push(t('partnerMarket.summary.empty'));
  const coverage = isRecord(data.substrateCoverage) ? data.substrateCoverage : null;
  if (coverage) {
    // The base server is invoiced in BRL (the API nets it only against BRL earnings).
    const currency = text(coverage.currency) ?? 'BRL';
    sections.push({
      title: t('partnerMarket.summary.coverage'),
      rows: [
        [
          t('partnerMarket.summary.rent'),
          money(lang, amount(coverage.substrateMonthlyCents), currency),
        ],
        [t('partnerMarket.summary.covered'), money(lang, amount(coverage.coveredCents), currency)],
        [
          t('partnerMarket.summary.remaining'),
          money(lang, amount(coverage.remainingCents), currency),
        ],
      ],
    });
    const remaining = amount(coverage.remainingCents) ?? 0;
    const sales = amount(coverage.breakEvenSalesRemaining) ?? 0;
    if (remaining <= 0) notes.push(t('partnerMarket.summary.coveredAll'));
    else if (sales > 0) {
      notes.push(
        t(sales === 1 ? 'partnerMarket.summary.salesOne' : 'partnerMarket.summary.salesMany', {
          count: sales,
        }),
      );
    }
  }
  showDetail(ctx.out, {
    title: t('partnerMarket.summary.title'),
    rows: [
      [t('partnerMarket.summary.listings'), count(lang, data.activeListings)],
      [t('partnerMarket.summary.sold'), count(lang, data.soldSubscriptions)],
    ],
    sections,
    notes,
    next: [
      { text: t('partnerMarket.next.orders'), command: 'bladecp partner marketplace orders' },
      {
        text: t('partnerMarket.next.statements'),
        command: 'bladecp partner marketplace statements',
      },
    ],
  });
  return ExitCode.OK;
}

async function ordersCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const { page, limit } = paging(values);
  const status = optString(values, 'status')?.trim() || undefined;
  const api = await signedInApi(ctx);
  const result = readPage(
    await partnerOnly(api, () =>
      api.request('getMarketplaceOrders', { query: { page, pageSize: limit, status } }),
    ),
  );
  if (ctx.json) return emitData(ctx, result.data);
  const t = ctx.out.t;
  const lang = ctx.lang;
  const columns: Column<Json>[] = [
    { header: t('partnerMarket.column.sold'), value: (o) => day(lang, o.soldAt), priority: 2 },
    {
      header: t('partnerMarket.column.customer'),
      value: (o) => text(o.customerName) ?? text(o.customerEmail) ?? '-',
      priority: 5,
      flex: true,
      min: wide(ctx) ? 16 : 10,
    },
    {
      header: t('partnerMarket.column.plan'),
      value: (o) => text(o.planName) ?? text(o.productName) ?? '-',
      priority: 2,
      flex: true,
      min: wide(ctx) ? 14 : 8,
    },
    {
      header: t('partnerMarket.column.price'),
      value: (o) => money(lang, amount(o.retailCents), text(o.currency)),
      priority: 1,
      align: 'right',
    },
    {
      header: t('partnerMarket.column.receive'),
      value: (o) => money(lang, amount(o.netCents), text(o.currency)),
      priority: 4,
      align: 'right',
    },
    statusColumn(
      t('column.status'),
      (o) => statusLabel(ORDER, t, o.status),
      (o) => toneOf(ORDER, o.status),
      3,
    ),
  ];
  showList(ctx.out, {
    items: result.items,
    columns,
    empty: status
      ? t('partnerMarket.orders.emptyStatus', { status })
      : t('partnerMarket.orders.empty'),
    summary: countLine(
      t,
      ['partnerMarket.orders.countOne', 'partnerMarket.orders.countMany'],
      result,
    ),
    next: nextPage(t, 'orders', result, values),
  });
  return ExitCode.OK;
}

/** The columns of a commission line, in the ledger and in a statement. */
function lineColumns(ctx: Ctx): Column<Json>[] {
  const t = ctx.out.t;
  const lang = ctx.lang;
  return [
    { header: t('partnerMarket.column.date'), value: (l) => day(lang, l.accruedAt), priority: 2 },
    {
      header: t('partnerMarket.column.product'),
      value: (l) => text(l.productName) ?? '-',
      priority: 5,
      flex: true,
      min: wide(ctx) ? 17 : 8,
    },
    {
      header: t('partnerMarket.column.type'),
      value: (l) => word(SOURCE, t, l.source),
      priority: 1,
    },
    {
      header: t('partnerMarket.column.sale'),
      value: (l) => money(lang, amount(l.grossCents), text(l.currency)),
      priority: 1,
      align: 'right',
    },
    {
      header: t('partnerMarket.column.commission'),
      value: (l) => money(lang, amount(l.commissionCents), text(l.currency)),
      priority: 2,
      align: 'right',
    },
    {
      header: t('partnerMarket.column.receive'),
      value: (l) => money(lang, amount(l.netPayableCents), text(l.currency)),
      priority: 4,
      align: 'right',
    },
    statusColumn(
      t('column.status'),
      (l) => statusLabel(LINE, t, l.status),
      (l) => toneOf(LINE, l.status),
      3,
    ),
  ];
}

async function commissionsCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const { page, limit } = paging(values);
  const status = optString(values, 'status')?.trim() || undefined;
  const api = await signedInApi(ctx);
  const result = readPage(
    await partnerOnly(api, () =>
      api.request('getMarketplaceCommission-lines', { query: { page, pageSize: limit, status } }),
    ),
  );
  if (ctx.json) return emitData(ctx, result.data);
  const t = ctx.out.t;
  showList(ctx.out, {
    items: result.items,
    columns: lineColumns(ctx),
    empty: status
      ? t('partnerMarket.commissions.emptyStatus', { status })
      : t('partnerMarket.commissions.empty'),
    summary: countLine(
      t,
      ['partnerMarket.commissions.countOne', 'partnerMarket.commissions.countMany'],
      result,
    ),
    next: nextPage(t, 'commissions', result, values),
  });
  return ExitCode.OK;
}

/** "R$ 120,00 to you" or "R$ 30,00 to BladeCP": who pays the balance of a statement. */
function balanceText(ctx: Ctx, statement: Json): string {
  const t = ctx.out.t;
  const cents = amount(statement.settlementNetCents);
  if (cents === null) return '-';
  const value = money(ctx.lang, Math.abs(cents), text(statement.currency));
  if (cents === 0) return value;
  const direction = text(statement.direction) ?? (cents > 0 ? 'bladecp_pays' : 'partner_pays');
  if (direction === 'bladecp_pays') return t('partnerMarket.settle.toYou', { amount: value });
  if (direction === 'partner_pays') return t('partnerMarket.settle.toBladecp', { amount: value });
  return value;
}

async function statementsCommand(ctx: Ctx): Promise<number> {
  const api = await signedInApi(ctx);
  const data = dataObject(await partnerOnly(api, () => api.request('getMarketplaceStatements')));
  if (!Array.isArray(data.items) || !data.items.every(isRecord)) throw invalidResponse();
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const lang = ctx.lang;
  const items = data.items as Json[];
  const total = amount(data.total) ?? items.length;
  const first = items[0]?.id;
  showList(ctx.out, {
    items,
    columns: [
      {
        header: t('column.id'),
        value: (s) => String(s.id ?? '-'),
        paint: (k, value) => k.violet(value),
        priority: 5,
      },
      {
        header: t('partnerMarket.column.period'),
        value: (s) => month(lang, s.periodStart),
        priority: 3,
      },
      {
        header: t('partnerMarket.column.earnings'),
        value: (s) => money(lang, amount(s.totalNetPayableCents), text(s.currency)),
        priority: 2,
        align: 'right',
      },
      {
        header: t('partnerMarket.column.baseServer'),
        value: (s) => money(lang, amount(s.substrateInvoiceCents), text(s.currency)),
        priority: 1,
        align: 'right',
      },
      {
        header: t('partnerMarket.column.settlement'),
        value: (s) => balanceText(ctx, s),
        priority: 4,
        flex: true,
        min: wide(ctx) ? 22 : 12,
      },
      statusColumn<Json>(
        t('column.status'),
        (s) => statusLabel(STATEMENT, t, s.status),
        (s) => toneOf(STATEMENT, s.status),
        3.5,
      ),
    ],
    empty: t('partnerMarket.statements.empty'),
    summary: t(
      total === 1 ? 'partnerMarket.statements.countOne' : 'partnerMarket.statements.countMany',
      { count: total },
    ),
    next:
      first !== undefined && first !== null
        ? [
            {
              text: t('partnerMarket.next.statement'),
              command: `bladecp partner marketplace statement ${String(first)}`,
            },
          ]
        : [],
  });
  return ExitCode.OK;
}

/** A statement number: the API keys statements by a positive whole number. */
function statementId(raw: string): number {
  const value = raw.trim();
  if (!/^\d{1,9}$/.test(value) || Number(value) < 1) {
    throw usageError('partnerMarket.error.statementId', { value: raw });
  }
  return Number(value);
}

async function statementCommand(ctx: Ctx, raw: string): Promise<number> {
  const id = statementId(raw);
  const api = await signedInApi(ctx);
  const data = dataObject(
    await partnerOnly(api, () => api.request('getMarketplaceStatementsById', { params: { id } })),
  );
  const statement = data.statement;
  if (!isRecord(statement) || !Array.isArray(data.lines) || !data.lines.every(isRecord)) {
    throw invalidResponse();
  }
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const lang = ctx.lang;
  const lines = data.lines as Json[];
  const currency = text(statement.currency);
  const cents = (field: string) => money(lang, amount(statement[field]), currency);
  const rows: DetailRow[] = [
    [t('partnerMarket.label.period'), month(lang, statement.periodStart, true)],
    [t('partnerMarket.label.currency'), currency ?? '-'],
    [t('partnerMarket.label.sales'), cents('totalGrossCents')],
    [t('partnerMarket.label.commission'), cents('totalCommissionCents')],
    [t('partnerMarket.label.net'), cents('totalNetCents')],
  ];
  if ((amount(statement.totalWithholdingCents) ?? 0) !== 0)
    rows.push([t('partnerMarket.label.withholding'), cents('totalWithholdingCents')]);
  rows.push([t('partnerMarket.label.earnings'), cents('totalNetPayableCents')]);
  if ((amount(statement.carryForwardCents) ?? 0) !== 0)
    rows.push([t('partnerMarket.label.carryForward'), cents('carryForwardCents')]);
  const payment: DetailRow[] = [
    [t('partnerMarket.label.baseServer'), cents('substrateInvoiceCents')],
    [t('partnerMarket.label.balance'), balanceText(ctx, statement)],
  ];
  if (text(statement.method))
    payment.push([t('partnerMarket.label.method'), word(METHOD, t, statement.method)]);
  if (text(statement.closedAt))
    payment.push([t('partnerMarket.label.closed'), day(lang, statement.closedAt)]);
  if (text(statement.paidAt))
    payment.push([t('partnerMarket.label.paid'), day(lang, statement.paidAt)]);
  showDetail(ctx.out, {
    title: t('partnerMarket.statement.title', { id: String(statement.id ?? id) }),
    status: {
      label: t('label.status'),
      text: statusLabel(STATEMENT, t, statement.status),
      tone: toneOf(STATEMENT, statement.status),
    },
    rows,
    sections: [{ title: t('partnerMarket.statement.payment'), rows: payment }],
  });
  if (!ctx.out.rich) ctx.out.print();
  showList(ctx.out, {
    items: lines,
    columns: lineColumns(ctx),
    empty: t('partnerMarket.statement.noLines'),
    summary: t(
      lines.length === 1
        ? 'partnerMarket.commissions.countOne'
        : 'partnerMarket.commissions.countMany',
      { count: lines.length },
    ),
  });
  return ExitCode.OK;
}

async function invoicesCommand(ctx: Ctx): Promise<number> {
  const api = await signedInApi(ctx);
  const data = dataObject(
    await partnerOnly(api, () => api.request('getMarketplaceSubstrate-invoices')),
  );
  if (!Array.isArray(data.items) || !data.items.every(isRecord)) throw invalidResponse();
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const lang = ctx.lang;
  const items = data.items as Json[];
  const currency = text(data.currency);
  const sum = items.reduce((total, item) => total + (amount(item.totalCents) ?? 0), 0);
  const total = money(lang, amount(data.totalCents) ?? sum, currency);
  const notes: string[] = [];
  const server = text(data.subscriptionLabel);
  if (server) notes.push(t('partnerMarket.invoices.server', { label: server }));
  if (data.explicit === false && items.length > 0)
    notes.push(t('partnerMarket.invoices.notMarked', { currency: currency ?? '-' }));
  showList(ctx.out, {
    items,
    columns: [
      {
        header: t('partnerMarket.column.invoice'),
        value: (i) => text(i.invoiceNumber) ?? String(i.invoiceId ?? '-'),
        paint: (k, value) => k.violet(value),
        priority: 5,
      },
      { header: t('partnerMarket.column.due'), value: (i) => day(lang, i.dueDate), priority: 3 },
      {
        header: t('partnerMarket.column.total'),
        value: (i) => money(lang, amount(i.totalCents), currency),
        priority: 3.5,
        align: 'right',
      },
      // On a narrow terminal the state (overdue) stays; the total is in the summary.
      statusColumn<Json>(
        t('column.status'),
        (i) => statusLabel(INVOICE, t, i.status),
        (i) => toneOf(INVOICE, i.status),
        4,
      ),
    ],
    empty: t('partnerMarket.invoices.empty'),
    summary: t(
      items.length === 1
        ? 'partnerMarket.invoices.summaryOne'
        : 'partnerMarket.invoices.summaryMany',
      { count: items.length, total },
    ),
    notes,
    next:
      items.length > 0
        ? [
            {
              text: t('partnerMarket.next.statements'),
              command: 'bladecp partner marketplace statements',
            },
          ]
        : [],
  });
  return ExitCode.OK;
}

export const handlers: Handlers = {
  'partner.marketplace.summary': (ctx) => summaryCommand(ctx),
  'partner.marketplace.orders': (ctx, { values }) => ordersCommand(ctx, values),
  'partner.marketplace.commissions': (ctx, { values }) => commissionsCommand(ctx, values),
  'partner.marketplace.statements': (ctx) => statementsCommand(ctx),
  'partner.marketplace.statement': (ctx, { args }) => statementCommand(ctx, args[0]!),
  'partner.marketplace.invoices': (ctx) => invoicesCommand(ctx),
};
