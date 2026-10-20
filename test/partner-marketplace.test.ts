// `bladecp partner marketplace`: the requests each command sends, the JSON
// envelope, the human output, usage errors and the partner-only gate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { marketplace, seedMarketplace } from './helpers/mock/partner-marketplace.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  api.setPartner();
  seedMarketplace(api);
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: dir.path,
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

const market = () => api.requests.filter((r) => r.path.startsWith('/api/v1/customer/marketplace'));

describe('bladecp partner marketplace summary', () => {
  it('reads the summary; the group alone runs it', async () => {
    const summary = await cli(['partner', 'marketplace', 'summary']);
    expect(summary.code).toBe(0);
    expect(market().at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/marketplace/summary',
    });
    const alone = await cli(['partner', 'marketplace']);
    expect(alone.code).toBe(0);
    expect(alone.stdout).toBe(summary.stdout);
  });

  it('--json is the API data, amounts in cents', async () => {
    const result = await cli(['partner', 'marketplace', 'summary', '--json']);
    expect(parseJson(result.stdout)).toEqual({ ok: true, data: marketplace(api).summary });
  });

  it('shows earnings per currency in the language of the person', async () => {
    const en = await cli(['partner', 'marketplace', 'summary']);
    expect(en.stdout).toContain('Plans listed');
    expect(en.stdout).toContain('Earnings in BRL');
    expect(en.stdout).toContain('R$1,247.50');
    expect(en.stdout).toContain('Earnings in USD');
    expect(en.stdout).toContain('$36.00');
    expect(en.stdout).toContain('Monthly rent');
    expect(en.stderr).toContain('About 2 more sales cover your base server rent.');
    const pt = await cli(['partner', 'marketplace', 'summary', '--lang', 'pt-BR']);
    expect(pt.stdout).toMatch(/R\$\s1\.247,50/);
    expect(pt.stdout).toContain('Ganhos em BRL');
  });

  it('says when there are no earnings yet and when the base server is covered', async () => {
    const data = marketplace(api);
    data.summary = {
      currencies: [],
      substrateCoverage: {
        substrateMonthlyCents: 19900,
        coveredCents: 19900,
        remainingCents: 0,
        breakEvenSalesRemaining: 0,
      },
      activeListings: 0,
      soldSubscriptions: 0,
    };
    const result = await cli(['partner', 'marketplace', 'summary'], { tty: true });
    expect(result.stdout).toContain('No marketplace earnings yet');
    expect(result.stdout).toContain('already cover your base server rent');
  });
});

describe('bladecp partner marketplace orders', () => {
  it('sends the filters as page, pageSize and status', async () => {
    const result = await cli([
      'partner',
      'marketplace',
      'orders',
      '--status',
      'active',
      '--page',
      '2',
      '--limit',
      '1',
    ]);
    expect(result.code).toBe(0);
    expect(market().at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/marketplace/orders',
      search: '?page=2&pageSize=1&status=active',
    });
  });

  it('lists the sales with what you receive, and the next page', async () => {
    const result = await cli(['partner', 'marketplace', 'orders', '--limit', '2'], { tty: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Aurora Store');
    expect(result.stdout).toContain('hello@example.org');
    expect(result.stdout).toContain('R$39.92');
    expect(result.stdout).toContain('3 sales · page 1 of 2');
    expect(result.stdout).toContain('bladecp partner marketplace orders --limit 2 --page 2');
  });

  it('--json keeps the page of the API', async () => {
    const result = await cli(['partner', 'marketplace', 'orders', '--json']);
    const data = parseJson(result.stdout).data as { items: unknown[]; total: number };
    expect(data.total).toBe(3);
    expect(data.items).toHaveLength(3);
  });

  it('an empty list says why', async () => {
    marketplace(api).orders = [];
    const plain = await cli(['partner', 'marketplace', 'orders']);
    expect(plain.stdout).toContain('No sales yet');
    const filtered = await cli(['partner', 'marketplace', 'orders', '--status', 'churned']);
    expect(filtered.stdout).toContain('No sales with status "churned".');
  });

  it('refuses a bad page or limit before any request', async () => {
    for (const extra of [
      ['--limit', '0'],
      ['--limit', '101'],
      ['--limit', 'many'],
      ['--page', '0'],
      ['--page', '-1'],
    ]) {
      const result = await cli(['partner', 'marketplace', 'orders', ...extra, '--json']);
      expect(result.code, extra.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(market()).toHaveLength(0);
  });
});

describe('bladecp partner marketplace commissions', () => {
  it('reads the ledger with the status filter', async () => {
    const result = await cli(['partner', 'marketplace', 'commissions', '--status', 'pending']);
    expect(result.code).toBe(0);
    expect(market().at(-1)).toMatchObject({
      path: '/api/v1/customer/marketplace/commission-lines',
      search: '?status=pending',
    });
    expect(result.stdout).toContain('First sale');
    expect(result.stdout).toContain('Pending');
    expect(result.stdout).not.toContain('Renewal');
  });

  it('names each kind of line and status', async () => {
    const result = await cli(['partner', 'marketplace', 'commissions'], { tty: true });
    for (const word of ['Renewal', 'Plan change', 'Confirmed', 'Cleared', 'Reversed', '4 lines']) {
      expect(result.stdout).toContain(word);
    }
    expect(result.stdout).toContain('-R$12.00');
  });
});

describe('bladecp partner marketplace statements', () => {
  it('lists the statements with who pays the balance', async () => {
    const result = await cli(['partner', 'marketplace', 'statements'], { tty: true });
    expect(result.code).toBe(0);
    expect(market().at(-1)).toMatchObject({ path: '/api/v1/customer/marketplace/statements' });
    expect(result.stdout).toContain('R$1,036.52 to you');
    expect(result.stdout).toContain('R$127.08 to BladeCP');
    expect(result.stdout).toContain('Sep 2026');
    expect(result.stdout).toContain('bladecp partner marketplace statement 12');
  });

  it('--json is the API data', async () => {
    const result = await cli(['partner', 'marketplace', 'statements', '--json']);
    expect(parseJson(result.stdout).data).toMatchObject({ total: 2 });
  });
});

describe('bladecp partner marketplace statement <statement>', () => {
  it('shows the totals, the payment and the lines', async () => {
    const result = await cli(['partner', 'marketplace', 'statement', '12'], { tty: true });
    expect(result.code).toBe(0);
    expect(market().at(-1)).toMatchObject({ path: '/api/v1/customer/marketplace/statements/12' });
    for (const text of [
      'Statement 12',
      'Paid',
      'September 2026',
      'Adjustment from earlier statements',
      '-R$12.00',
      'Base server rent',
      'R$1,036.52 to you',
      'PIX',
      '2 lines',
    ]) {
      expect(result.stdout).toContain(text);
    }
    // No tax was withheld: the row is left out.
    expect(result.stdout).not.toContain('Tax withheld');
  });

  it('a statement without lines says so; --json has statement and lines', async () => {
    const human = await cli(['partner', 'marketplace', 'statement', '9']);
    expect(human.stdout).toContain('No commission lines in this statement.');
    expect(human.stdout).toContain('Credit on your base server invoice');
    const json = await cli(['partner', 'marketplace', 'statement', '9', '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({ statement: { id: 9 }, lines: [] });
  });

  it('the statement is a number', async () => {
    for (const value of ['abc', '0', '12a', '-3']) {
      const result = await cli(['partner', 'marketplace', 'statement', value, '--json']);
      expect(result.code, value).toBe(2);
    }
    expect(market()).toHaveLength(0);
  });

  it('an unknown statement is not found (exit 5)', async () => {
    const result = await cli(['partner', 'marketplace', 'statement', '99', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'not_found' });
  });
});

describe('bladecp partner marketplace invoices', () => {
  it('lists the open invoices of the base server', async () => {
    const result = await cli(['partner', 'marketplace', 'invoices'], { tty: true });
    expect(result.code).toBe(0);
    expect(market().at(-1)).toMatchObject({
      path: '/api/v1/customer/marketplace/substrate-invoices',
    });
    for (const text of [
      'INV-2026-0931',
      'Overdue',
      'Unpaid',
      '2 open invoices · R$398.00 in total',
      'Base server: Stack Container XL · active',
    ]) {
      expect(result.stdout).toContain(text);
    }
  });

  it('says when no server is marked as the base server', async () => {
    const data = marketplace(api);
    data.invoices = { ...data.invoices, explicit: false, subscriptionLabel: null };
    const result = await cli(['partner', 'marketplace', 'invoices']);
    expect(result.stderr).toContain('No server on your account is marked as the base server');
  });

  it('an account with nothing open', async () => {
    const data = marketplace(api);
    data.invoices = { ...data.invoices, items: [], totalCents: 0, subscriptionLabel: null };
    const result = await cli(['partner', 'marketplace', 'invoices']);
    expect(result.stdout).toContain('No open invoices for your base server.');
  });
});

describe('partner only', () => {
  const commands = [
    ['partner', 'marketplace', 'summary'],
    ['partner', 'marketplace', 'orders'],
    ['partner', 'marketplace', 'commissions'],
    ['partner', 'marketplace', 'statements'],
    ['partner', 'marketplace', 'statement', '12'],
    ['partner', 'marketplace', 'invoices'],
  ];

  it('a customer key gets partner_only (exit 4)', async () => {
    api.setPartner(false);
    for (const argv of commands) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(4);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe('partner_only');
    }
  });

  it('the key never reaches the output', async () => {
    const outputs: string[] = [];
    for (const argv of commands) {
      for (const extra of [[], ['--json']]) {
        const result = await cli([...argv, ...extra, '--debug']);
        outputs.push(result.stdout, result.stderr);
      }
    }
    expect(outputs.join('\n')).not.toContain(LIVE_KEY);
  });

  it('values from the API never reach the terminal raw', async () => {
    marketplace(api).orders[0]!.customerName = 'Evil\u001b[31m\u009b31mName';
    for (const tty of [false, true]) {
      const result = await cli(['partner', 'marketplace', 'orders'], { tty });
      expect(result.stdout).not.toMatch(/\u001b\[31m|\u009b/);
    }
  });
});
