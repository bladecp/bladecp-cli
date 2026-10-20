import { forbidden, type MockApi, type MockRequest, notFound } from '../mock-api.js';

// The marketplace of a partner as the Customer API answers it
// (/customer/marketplace/*): amounts in cents, shapes of openapi/customer-v1.json.

export interface MarketplaceData {
  summary: Record<string, unknown>;
  orders: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  statements: Record<string, unknown>[];
  /** Commission lines of each statement, by statement ID. */
  statementLines: Record<number, Record<string, unknown>[]>;
  invoices: Record<string, unknown>;
}

function empty(): MarketplaceData {
  return {
    summary: { currencies: [], substrateCoverage: null, activeListings: 0, soldSubscriptions: 0 },
    orders: [],
    lines: [],
    statements: [],
    statementLines: {},
    invoices: {
      currency: 'BRL',
      explicit: false,
      subscriptionLabel: null,
      totalCents: 0,
      items: [],
    },
  };
}

/** The marketplace data of the simulated API (empty until a test seeds it). */
export function marketplace(api: MockApi): MarketplaceData {
  return api.state('partner-marketplace', empty);
}

export const PROVISION = '0197b3e2-0000-7000-8000-000000000101';

function line(
  id: number,
  fields: Partial<Record<string, unknown>> & { grossCents: number; commissionCents: number },
): Record<string, unknown> {
  const net = fields.grossCents - fields.commissionCents;
  return {
    id,
    subscriptionId: 500 + id,
    provisionUuid: PROVISION,
    invoiceId: 9000 + id,
    productName: 'Stack Container S',
    currency: 'BRL',
    source: 'first_sale',
    netCents: net,
    netPayableCents: net,
    paymentMethod: 'pix',
    status: 'cleared',
    accruedAt: '2026-09-05T13:00:00.000Z',
    clearedAt: '2026-09-07T03:00:00.000Z',
    ...fields,
  };
}

/** A partner with sales in two currencies, statements and an open base server invoice. */
export function seedMarketplace(api: MockApi): MarketplaceData {
  const data = marketplace(api);
  data.summary = {
    currencies: [
      {
        currency: 'BRL',
        pendingCents: 4990,
        confirmedCents: 9980,
        clearedCents: 124750,
        lifetimeNetPayableCents: 139720,
      },
      {
        currency: 'USD',
        pendingCents: 0,
        confirmedCents: 1200,
        clearedCents: 3600,
        lifetimeNetPayableCents: 4800,
      },
    ],
    substrateCoverage: {
      substrateMonthlyCents: 19900,
      coveredCents: 12475,
      remainingCents: 7425,
      breakEvenSalesRemaining: 2,
    },
    activeListings: 4,
    soldSubscriptions: 12,
  };
  data.orders = [
    {
      subscriptionId: 512,
      provisionUuid: PROVISION,
      customerName: 'Aurora Store',
      customerEmail: 'owner@example.com',
      productName: 'Stack Container',
      planName: 'Stack Container S',
      currency: 'BRL',
      retailCents: 4990,
      commissionCents: 998,
      netCents: 3992,
      status: 'active',
      soldAt: '2026-10-12T14:30:00.000Z',
    },
    {
      subscriptionId: 511,
      provisionUuid: '0197b2a1-0000-7000-8000-000000000102',
      customerName: null,
      customerEmail: 'hello@example.org',
      productName: 'Edge Cloud',
      planName: 'Edge Cloud 2',
      currency: 'USD',
      retailCents: 2400,
      commissionCents: 480,
      netCents: 1920,
      status: 'active',
      soldAt: '2026-10-02T09:10:00.000Z',
    },
    {
      subscriptionId: 498,
      provisionUuid: null,
      customerName: 'Harbor Studio',
      customerEmail: 'it@example.net',
      productName: 'Stack Container',
      planName: 'Stack Container M',
      currency: 'BRL',
      retailCents: 8990,
      commissionCents: 1798,
      netCents: 7192,
      status: 'churned',
      soldAt: '2026-08-20T18:00:00.000Z',
    },
  ];
  data.lines = [
    line(31, {
      grossCents: 4990,
      commissionCents: 998,
      status: 'pending',
      accruedAt: '2026-10-12T14:31:00.000Z',
      clearedAt: null,
    }),
    line(30, {
      grossCents: 2400,
      commissionCents: 480,
      currency: 'USD',
      productName: 'Edge Cloud 2',
      paymentMethod: 'card',
      status: 'confirmed',
      accruedAt: '2026-10-02T09:11:00.000Z',
      clearedAt: null,
    }),
    line(29, {
      grossCents: 8990,
      commissionCents: 1798,
      source: 'renewal',
      productName: 'Stack Container M',
      accruedAt: '2026-09-20T18:00:00.000Z',
    }),
    line(28, {
      grossCents: -1500,
      commissionCents: -300,
      source: 'proration',
      productName: 'Stack Container M',
      status: 'reversed',
      invoiceId: 9028,
      accruedAt: '2026-09-10T10:00:00.000Z',
    }),
  ];
  data.statements = [
    {
      id: 12,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-30T23:59:59.000Z',
      currency: 'BRL',
      totalGrossCents: 155940,
      totalCommissionCents: 31188,
      totalNetCents: 124752,
      totalWithholdingCents: 0,
      totalNetPayableCents: 124752,
      carryForwardCents: -1200,
      substrateInvoiceCents: 19900,
      settlementNetCents: 103652,
      direction: 'bladecp_pays',
      status: 'paid',
      method: 'pix',
      closedAt: '2026-10-01T03:00:00.000Z',
      paidAt: '2026-10-05T15:00:00.000Z',
    },
    {
      id: 9,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-31T23:59:59.000Z',
      currency: 'BRL',
      totalGrossCents: 8990,
      totalCommissionCents: 1798,
      totalNetCents: 7192,
      totalWithholdingCents: 0,
      totalNetPayableCents: 7192,
      carryForwardCents: 0,
      substrateInvoiceCents: 19900,
      settlementNetCents: -12708,
      direction: 'partner_pays',
      status: 'closed',
      method: 'credit',
      closedAt: '2026-09-01T03:00:00.000Z',
      paidAt: null,
    },
  ];
  data.statementLines = { 12: [data.lines[2]!, data.lines[3]!], 9: [] };
  data.invoices = {
    currency: 'BRL',
    explicit: true,
    subscriptionLabel: 'Stack Container XL · active',
    totalCents: 39800,
    items: [
      {
        invoiceId: 7001,
        invoiceNumber: 'INV-2026-0931',
        subscriptionLabel: 'Stack Container XL · active',
        totalCents: 19900,
        status: 'overdue',
        dueDate: '2026-10-10T00:00:00.000Z',
      },
      {
        invoiceId: 7044,
        invoiceNumber: 'INV-2026-1018',
        subscriptionLabel: 'Stack Container XL · active',
        totalCents: 19900,
        status: 'unpaid',
        dueDate: '2026-11-10T00:00:00.000Z',
      },
    ],
  };
  return data;
}

/** page and pageSize as the API reads them (pageSize up to 100, 20 by default). */
function paginate(request: MockRequest, list: Record<string, unknown>[]) {
  const page = Math.max(1, Number(request.query.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(request.query.get('pageSize')) || 20));
  const status = request.query.get('status');
  const matching = status ? list.filter((item) => item.status === status) : list;
  return {
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageSize,
  };
}

/** Routes of the simulated API for the partner marketplace commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    if (request.method !== 'GET' || !request.path.startsWith('/customer/marketplace/')) {
      return undefined;
    }
    if (!api.partner) return forbidden();
    const data = marketplace(api);
    const route = request.path.slice('/customer/marketplace/'.length);
    if (route === 'summary') return { status: 200, body: { data: data.summary } };
    if (route === 'orders') return { status: 200, body: { data: paginate(request, data.orders) } };
    if (route === 'commission-lines') {
      return { status: 200, body: { data: paginate(request, data.lines) } };
    }
    if (route === 'statements') {
      return {
        status: 200,
        body: { data: { items: data.statements, total: data.statements.length } },
      };
    }
    if (route === 'substrate-invoices') return { status: 200, body: { data: data.invoices } };
    const one = /^statements\/(\d+)$/.exec(route);
    if (one) {
      const id = Number(one[1]);
      const statement = data.statements.find((s) => s.id === id);
      if (!statement) return notFound('Statement not found');
      return {
        status: 200,
        body: { data: { statement, lines: data.statementLines[id] ?? [] } },
      };
    }
    return notFound();
  });
}
