// `bladecp partner migrations ...`: Fast Deploy run by a partner through the
// routes of the BladeCP WHMCS module (requests of a WHMCS installation and
// client, the billing queue, the billing link and the account-claim address).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addPartnerRequest,
  BILLING_INSTALLATION,
  CLIENT,
  INSTALLATION,
  partnerMigrations,
} from './helpers/mock/partner-migrations.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

const READY = '01979f2c-0000-7000-8000-000000000002';
const IMPORTING = '01979e11-0000-7000-8000-000000000003';
const FAILED = '01979d00-0000-7000-8000-000000000004';
const QUEUED = '0197a100-0000-7000-8000-000000000005';
const CLAIM = '0197a200-0000-7000-8000-000000000006';
const SCOPE = ['--installation', INSTALLATION, '--client', CLIENT];

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  api.setPartner();
  addPartnerRequest(api, {
    requestUuid: READY,
    phase: 'awaiting_approval',
    primaryDomain: 'shop.example.org',
    sourcePrimaryDomain: 'shop.example.org',
    stagingUrl: 'https://01979f2c.preview.example.net',
    components: [
      { name: 'files', status: 'completed' },
      { name: 'database', status: 'completed' },
    ],
    externalServiceId: '4242',
  });
  addPartnerRequest(api, {
    requestUuid: IMPORTING,
    phase: 'importing',
    primaryDomain: 'blog.example.com',
    createdAt: '2026-10-15T09:00:00.000Z',
  });
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

const calls = (method?: string) =>
  api.apiCalls(method).filter((r) => r.path.startsWith('/api/v1/customer/migrations'));

describe('bladecp partner migrations list', () => {
  it('lists the requests of an installation and client', async () => {
    const result = await cli(['partner', 'migrations', 'list', ...SCOPE]);
    expect(result.code).toBe(0);
    expect(calls().at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/migrations',
      search: `?installation_id=${INSTALLATION}&external_client_id=${CLIENT}`,
    });
    expect(result.stdout).toContain(READY);
    expect(result.stdout).toContain('shop.example.org');
    expect(result.stdout).toContain('Ready for your review');
    expect(result.stdout).toContain('Importing files and databases');
    expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
  });

  it('--json is the API page: items and nextCursor', async () => {
    const result = await cli(['partner', 'migrations', 'list', ...SCOPE, '--json']);
    const envelope = parseJson(result.stdout);
    expect(envelope.ok).toBe(true);
    const data = envelope.data as { items: { requestUuid: string }[]; nextCursor: unknown };
    expect(data.items.map((r) => r.requestUuid)).toEqual([READY, IMPORTING]);
    expect(data.nextCursor).toBeNull();
  });

  it('--client is optional: the whole installation, with the client in a column', async () => {
    addPartnerRequest(api, { requestUuid: QUEUED, externalClientId: '7', phase: 'queued' });
    const result = await cli(['partner', 'migrations', 'list', '--installation', INSTALLATION], {
      tty: true,
      columns: 120,
      env: { BLADECP_API_KEY: LIVE_KEY, NO_COLOR: '1' },
    });
    expect(result.code).toBe(0);
    expect(calls().at(-1)?.search).toBe(`?installation_id=${INSTALLATION}`);
    expect(result.stdout).toContain('CLIENT');
    expect(result.stdout).toContain('3 requests');
    expect(result.stdout).toContain('1 waits for someone');
  });

  it('--all follows every page; --limit sets the page size', async () => {
    addPartnerRequest(api, { requestUuid: QUEUED, phase: 'queued' });
    const one = await cli(['partner', 'migrations', 'list', ...SCOPE, '--limit', '2', '--json']);
    expect((parseJson(one.stdout).data as { nextCursor: string }).nextCursor).toBe(READY);
    api.requests = [];
    const all = await cli([
      'partner',
      'migrations',
      'list',
      ...SCOPE,
      '--limit',
      '2',
      '--all',
      '--json',
    ]);
    const data = parseJson(all.stdout).data as { items: unknown[]; nextCursor: unknown };
    expect(data.items).toHaveLength(3);
    expect(data.nextCursor).toBeNull();
    expect(calls().map((r) => r.search)).toEqual([
      `?installation_id=${INSTALLATION}&external_client_id=${CLIENT}&limit=2`,
      `?installation_id=${INSTALLATION}&external_client_id=${CLIENT}&limit=2&after=${READY}`,
    ]);
  });

  it('says when there are more pages', async () => {
    const result = await cli(['partner', 'migrations', 'list', ...SCOPE, '--limit', '1']);
    expect(result.stderr).toContain('Add --all');
  });

  it('usage errors send nothing', async () => {
    for (const argv of [
      ['partner', 'migrations', 'list'],
      ['partner', 'migrations', 'list', '--installation', 'nope'],
      ['partner', 'migrations', 'list', '--installation', INSTALLATION, '--limit', '101'],
      ['partner', 'migrations', 'list', '--installation', INSTALLATION, '--client', ''],
    ]) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(calls()).toHaveLength(0);
  });

  it('"bladecp partner migrations" alone is the help of the group', async () => {
    const result = await cli(['partner', 'migrations']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('billing-queue');
    expect(result.stdout).toContain('claim-url');
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner migrations show', () => {
  it('reads the request with its installation and client', async () => {
    const result = await cli(['partner', 'migrations', 'show', READY, ...SCOPE]);
    expect(result.code).toBe(0);
    expect(calls().at(-1)).toMatchObject({
      method: 'GET',
      path: `/api/v1/customer/migrations/${READY}`,
      search: `?installation_id=${INSTALLATION}&external_client_id=${CLIENT}`,
    });
    expect(result.stdout).toContain('Ready for your review');
    expect(result.stdout).toContain('https://01979f2c.preview.example.net');
    expect(result.stdout).toContain('Files: done');
    expect(result.stdout).toContain('Paid');
    expect(result.stdout).toContain('4242');
    expect(result.stdout).toContain(
      `bladecp partner migrations approve ${READY} --installation ${INSTALLATION} --client 42`,
    );
  });

  it('--json is the request as the API answers it', async () => {
    const result = await cli(['partner', 'migrations', 'show', READY, ...SCOPE, '--json']);
    const data = parseJson(result.stdout).data as Record<string, unknown>;
    expect(data).toMatchObject({
      requestUuid: READY,
      installationId: INSTALLATION,
      externalClientId: CLIENT,
      migration: { phase: 'awaiting_approval', stagingUrl: 'https://01979f2c.preview.example.net' },
      actions: { approve: true },
    });
  });

  it('a short ID is found among the requests of the client', async () => {
    const result = await cli(['partner', 'migrations', 'show', '01979f2c', ...SCOPE, '--json']);
    expect(result.code).toBe(0);
    expect((parseJson(result.stdout).data as { requestUuid: string }).requestUuid).toBe(READY);
    expect(calls().map((r) => r.path)).toEqual([
      '/api/v1/customer/migrations',
      `/api/v1/customer/migrations/${READY}`,
    ]);
  });

  it('a short ID that matches nothing is not found; a non-ID is a usage error', async () => {
    const missing = await cli(['partner', 'migrations', 'show', 'ffff', ...SCOPE, '--json']);
    expect(missing.code).toBe(5);
    const bad = await cli(['partner', 'migrations', 'show', '../etc', ...SCOPE, '--json']);
    expect(bad.code).toBe(2);
    const missingScope = await cli(['partner', 'migrations', 'show', READY, '--json']);
    expect(missingScope.code).toBe(2);
  });

  it('another client of the installation does not see it, and the hint says why', async () => {
    const result = await cli([
      'partner',
      'migrations',
      'show',
      READY,
      '--installation',
      INSTALLATION,
      '--client',
      '7',
      '--json',
    ]);
    expect(result.code).toBe(5);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({ code: 'not_found', apiCode: 'MIGRATION_REQUEST_NOT_FOUND' });
    expect(String(error.hint)).toContain('--installation and --client');
  });

  it('a request held by the billing link says what it waits for', async () => {
    addPartnerRequest(api, {
      requestUuid: CLAIM,
      phase: 'uploading',
      billingLink: 'claim_required',
      clientAreaUrl: 'https://clients.example.com',
    });
    const result = await cli(['partner', 'migrations', 'show', CLAIM, ...SCOPE]);
    expect(result.stdout).toContain('Waiting for the account holder to confirm');
    expect(result.stdout).toContain(`bladecp partner migrations claim-url ${CLAIM}`);
  });

  it('--watch follows the phases with ctx.sleep and stops when it needs someone', async () => {
    partnerMigrations(api).requests.get(IMPORTING)!.script = [
      'importing',
      'validating',
      'awaiting_approval',
    ];
    const result = await cli(['partner', 'migrations', 'show', IMPORTING, ...SCOPE, '--watch']);
    expect(result.code).toBe(0);
    expect(result.sleeps).toHaveLength(2);
    expect(calls('GET')).toHaveLength(3);
    expect(result.stdout).toContain('Ready for your review');
    expect(result.stdout).toContain('bladecp partner migrations approve');
  });

  it('--watch --json is one document per change, and a failure exits 9', async () => {
    partnerMigrations(api).requests.get(IMPORTING)!.script = ['importing', 'validating', 'failed'];
    const result = await cli([
      'partner',
      'migrations',
      'show',
      IMPORTING,
      ...SCOPE,
      '--watch',
      '--json',
    ]);
    expect(result.code).toBe(9);
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { data: { migration: { phase: string } } });
    expect(lines.map((line) => line.data.migration.phase)).toEqual([
      'importing',
      'validating',
      'failed',
    ]);
  });

  it('--watch stops with 10 when the domain must be confirmed', async () => {
    partnerMigrations(api).requests.get(IMPORTING)!.script = ['discovery_review'];
    partnerMigrations(api).requests.get(IMPORTING)!.migration.primaryDomain = null;
    const result = await cli(['partner', 'migrations', 'show', IMPORTING, ...SCOPE, '--watch']);
    expect(result.code).toBe(10);
    expect(result.stdout).toContain(`bladecp partner migrations review ${IMPORTING}`);
  });
});

describe('bladecp partner migrations review', () => {
  it('sends the domain with the installation and client, once', async () => {
    const request = partnerMigrations(api).requests.get(IMPORTING)!;
    request.migration.phase = 'discovery_review';
    request.migration.primaryDomain = null;
    const result = await cli([
      'partner',
      'migrations',
      'review',
      IMPORTING,
      ...SCOPE,
      '--domain',
      'Blog.Example.com.',
      '--json',
    ]);
    expect(result.code).toBe(0);
    const sent = calls('POST').at(-1)!;
    expect(sent.path).toBe(`/api/v1/customer/migrations/${IMPORTING}/discovery-review`);
    expect(sent.body).toEqual({
      installation_id: INSTALLATION,
      external_client_id: CLIENT,
      primaryDomain: 'blog.example.com',
    });
    expect(sent.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(parseJson(result.stdout).data).toEqual({
      requestUuid: IMPORTING,
      phase: 'discovery_review',
      primaryDomain: 'blog.example.com',
    });
  });

  it('a missing or invalid domain is a usage error, nothing sent', async () => {
    const missing = await cli(['partner', 'migrations', 'review', IMPORTING, ...SCOPE, '--json']);
    expect(missing.code).toBe(2);
    const invalid = await cli([
      'partner',
      'migrations',
      'review',
      IMPORTING,
      ...SCOPE,
      '--domain',
      'not a domain',
      '--json',
    ]);
    expect(invalid.code).toBe(2);
    expect(parseJson(invalid.stdout).error?.code).toBe('invalid_domain');
    expect(calls()).toHaveLength(0);
  });
});

describe('bladecp partner migrations approve', () => {
  it('asks first on a terminal; no sends nothing', async () => {
    const result = await cli(['partner', 'migrations', 'approve', READY, ...SCOPE], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(result.stderr + result.stdout).toContain('Approve the migration of shop.example.org?');
    expect(calls('POST')).toHaveLength(0);
  });

  it('Enter approves (the default is yes)', async () => {
    const result = await cli(['partner', 'migrations', 'approve', READY, ...SCOPE], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(calls('POST')).toHaveLength(1);
  });

  it('--yes, or no terminal, approves', async () => {
    const result = await cli(['partner', 'migrations', 'approve', READY, ...SCOPE, '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toEqual({ requestUuid: READY, phase: 'syncing' });
    const sent = calls('POST').at(-1)!;
    expect(sent.path).toBe(`/api/v1/customer/migrations/${READY}/approve`);
    expect(sent.body).toEqual({ installation_id: INSTALLATION, external_client_id: CLIENT });
    expect(sent.headers['idempotency-key']).toBeTruthy();
  });

  it('an unpaid request is refused with what to do', async () => {
    partnerMigrations(api).requests.get(READY)!.commercial.state = 'awaiting_payment';
    const shown = await cli(['partner', 'migrations', 'show', READY, ...SCOPE]);
    expect(shown.stdout).toContain('waits for the payment');
    const result = await cli(['partner', 'migrations', 'approve', READY, ...SCOPE, '--json']);
    expect(result.code).toBe(6);
    const error = parseJson(result.stdout).error!;
    expect(error.apiCode).toBe('MIGRATION_PAYMENT_REQUIRED');
    expect(String(error.hint)).toContain('has not paid');
  });
});

describe('bladecp partner migrations cancel', () => {
  it('asks first with no as the default; Enter sends nothing', async () => {
    const result = await cli(['partner', 'migrations', 'cancel', IMPORTING, ...SCOPE], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(result.stderr + result.stdout).toContain('Cancel the migration of blog.example.com?');
    expect(calls('POST')).toHaveLength(0);
  });

  it('--yes cancels with the reason', async () => {
    const result = await cli(
      [
        'partner',
        'migrations',
        'cancel',
        IMPORTING,
        ...SCOPE,
        '--reason',
        'Client gave up',
        '--yes',
        '--json',
      ],
      { tty: true },
    );
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toEqual({ requestUuid: IMPORTING, phase: 'cancelled' });
    expect(calls('POST').at(-1)?.body).toEqual({
      installation_id: INSTALLATION,
      external_client_id: CLIENT,
      reason: 'Client gave up',
    });
  });

  it('a migration past the approval cannot be cancelled', async () => {
    partnerMigrations(api).requests.get(IMPORTING)!.migration.phase = 'live';
    const result = await cli(['partner', 'migrations', 'cancel', IMPORTING, ...SCOPE, '--json']);
    expect(result.code).toBe(6);
    expect(String(parseJson(result.stdout).error?.hint)).toContain('before it is approved');
  });
});

describe('bladecp partner migrations retry', () => {
  it('starts a new attempt of a failed migration', async () => {
    addPartnerRequest(api, { requestUuid: FAILED, phase: 'failed' });
    const result = await cli(['partner', 'migrations', 'retry', FAILED, ...SCOPE, '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toEqual({ requestUuid: FAILED, phase: 'queued' });
    expect(calls('POST').at(-1)).toMatchObject({
      path: `/api/v1/customer/migrations/${FAILED}/retry`,
      body: { installation_id: INSTALLATION, external_client_id: CLIENT },
    });
    const human = await cli(['partner', 'migrations', 'show', FAILED, ...SCOPE]);
    expect(human.stdout).toContain('Queued');
  });

  it('a refused retry says why', async () => {
    addPartnerRequest(api, {
      requestUuid: FAILED,
      phase: 'failed',
      retryReason: 'backup_unavailable',
    });
    const result = await cli(['partner', 'migrations', 'retry', FAILED, ...SCOPE, '--json']);
    expect(result.code).toBe(6);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({ code: 'retry_unavailable', retryReason: 'backup_unavailable' });
    expect(String(error.hint)).toContain('no longer stored');
  });
});

describe('the billing queue and the billing link', () => {
  beforeEach(() => {
    addPartnerRequest(api, {
      requestUuid: QUEUED,
      phase: 'uploading',
      billingLink: 'pending',
      mode: 'trial',
      state: 'ready',
      source: {
        kind: 'cpanel',
        server_hostname: 'server1.host.example.com',
        username: 'alice',
        owner: 'root',
        domain: 'alice.example.com',
        initiated_by: 'root',
      },
    });
  });

  it('billing-queue lists what waits for the billing WHMCS', async () => {
    const result = await cli(['partner', 'migrations', 'billing-queue']);
    expect(result.code).toBe(0);
    expect(calls().at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/migrations/billing-queue',
      search: '',
    });
    expect(result.stdout).toContain(QUEUED);
    expect(result.stdout).toContain('alice.example.com');
    expect(result.stdout).toContain('Trial of 14 days');
    const json = await cli(['partner', 'migrations', 'billing-queue', '--json']);
    const data = parseJson(json.stdout).data as { items: { request_uuid: string }[] };
    expect(data).toMatchObject({ next_cursor: null });
    expect(data.items.map((item) => item.request_uuid)).toEqual([QUEUED]);
  });

  it('an empty queue says so', async () => {
    partnerMigrations(api).requests.delete(QUEUED);
    const result = await cli(['partner', 'migrations', 'billing-queue']);
    expect(result.stdout).toContain('No request is waiting for the billing WHMCS.');
  });

  const link = [
    '--installation',
    BILLING_INSTALLATION,
    '--client',
    '42',
    '--external-id',
    '4242',
    '--email',
    'owner@example.com',
    '--name',
    'Ana Maria Souza',
  ];

  it('billing-link sends the client, the service and the contact', async () => {
    const result = await cli([
      'partner',
      'migrations',
      'billing-link',
      QUEUED,
      ...link,
      '--company',
      'Example Ltda',
      '--json',
    ]);
    expect(result.code).toBe(0);
    const sent = calls('POST').at(-1)!;
    expect(sent.path).toBe(`/api/v1/customer/migrations/${QUEUED}/billing-link`);
    expect(sent.body).toEqual({
      installation_id: BILLING_INSTALLATION,
      whmcs_client_id: '42',
      whmcs_service_id: '4242',
      owner: {
        email: 'owner@example.com',
        first_name: 'Ana',
        last_name: 'Maria Souza',
        company_name: 'Example Ltda',
      },
    });
    expect(sent.headers['idempotency-key']).toBeTruthy();
    expect(parseJson(result.stdout).data).toMatchObject({
      requestUuid: QUEUED,
      installationId: BILLING_INSTALLATION,
      externalClientId: '42',
      billing_link: { status: 'linked', whmcs_service_id: '4242' },
    });
  });

  it('a short ID is found in the billing queue; a terminal asks first (no by default)', async () => {
    const declined = await cli(['partner', 'migrations', 'billing-link', '0197a1', ...link], {
      tty: true,
      answers: [''],
    });
    expect(declined.code).toBe(0);
    expect(declined.stderr + declined.stdout).toContain(
      'Link the migration of alice.example.com to service 4242?',
    );
    expect(calls('POST')).toHaveLength(0);
    const done = await cli(['partner', 'migrations', 'billing-link', '0197a1', ...link, '--yes'], {
      tty: true,
    });
    expect(done.code).toBe(0);
    expect(done.stdout).toContain('Request linked to service 4242');
    // The terminal breaks the long command between words.
    expect(done.stdout.replace(/\s+/g, ' ')).toContain(
      `bladecp partner migrations show ${QUEUED} --installation ${BILLING_INSTALLATION} --client 42 --watch`,
    );
  });

  it('a linked request reads with the billing installation and client', async () => {
    await cli(['partner', 'migrations', 'billing-link', QUEUED, ...link]);
    const shown = await cli([
      'partner',
      'migrations',
      'show',
      QUEUED,
      '--installation',
      BILLING_INSTALLATION,
      '--client',
      '42',
    ]);
    expect(shown.code).toBe(0);
    expect(shown.stdout).toContain('Linked');
  });

  it('another link for a linked request is refused with what happened', async () => {
    await cli(['partner', 'migrations', 'billing-link', QUEUED, ...link]);
    const again = await cli([
      'partner',
      'migrations',
      'billing-link',
      QUEUED,
      ...link.slice(0, 5),
      '9999',
      ...link.slice(6),
      '--json',
    ]);
    expect(again.code).toBe(6);
    expect(parseJson(again.stdout).error?.apiCode).toBe('MIGRATION_BILLING_LINK_CONFLICT');
  });

  it('bad values are usage errors, nothing sent', async () => {
    for (const [option, value] of [
      ['--client', 'abc'],
      ['--external-id', '0'],
      ['--email', 'not-an-email'],
      ['--installation', 'nope'],
    ] as const) {
      const argv = [...link];
      argv[argv.indexOf(option) + 1] = value;
      const result = await cli([
        'partner',
        'migrations',
        'billing-link',
        QUEUED,
        ...argv,
        '--json',
      ]);
      expect(result.code, option).toBe(2);
    }
    const noName = await cli([
      'partner',
      'migrations',
      'billing-link',
      QUEUED,
      ...link.slice(0, -2),
      '--json',
    ]);
    expect(noName.code).toBe(2);
    expect(calls('POST')).toHaveLength(0);
  });
});

describe('bladecp partner migrations claim-url', () => {
  beforeEach(() => {
    addPartnerRequest(api, {
      requestUuid: CLAIM,
      phase: 'uploading',
      billingLink: 'claim_required',
      clientAreaUrl: 'https://clients.example.com',
    });
  });

  it('gets a new address each time and shows it', async () => {
    const result = await cli(['partner', 'migrations', 'claim-url', CLAIM, ...SCOPE]);
    expect(result.code).toBe(0);
    expect(calls('POST').at(-1)).toMatchObject({
      path: `/api/v1/customer/migrations/${CLAIM}/claim-url`,
      body: { installation_id: INSTALLATION, external_client_id: CLIENT },
    });
    expect(result.stdout.trim()).toMatch(
      /^https:\/\/clients\.example\.com\/index\.php\?m=bladecp&action=claim&token=c+1$/,
    );
    const json = await cli(['partner', 'migrations', 'claim-url', CLAIM, ...SCOPE, '--json']);
    expect(parseJson(json.stdout).data).toEqual({
      url: expect.stringMatching(/token=c+2$/),
      expires_at: '2026-10-18T12:00:00.000Z',
    });
  });

  it('a request that does not wait for the account holder is refused', async () => {
    const result = await cli(['partner', 'migrations', 'claim-url', READY, ...SCOPE, '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error?.apiCode).toBe('MIGRATION_CLAIM_NOT_REQUIRED');
  });
});

describe('partner only', () => {
  it('a customer key gets partner_only (exit 4) on every command', async () => {
    api.setPartner(false);
    addPartnerRequest(api, { requestUuid: QUEUED, billingLink: 'pending', phase: 'uploading' });
    const runs: string[][] = [
      ['partner', 'migrations', 'list', ...SCOPE],
      ['partner', 'migrations', 'show', READY, ...SCOPE],
      ['partner', 'migrations', 'review', READY, ...SCOPE, '--domain', 'example.com'],
      ['partner', 'migrations', 'approve', READY, ...SCOPE, '--yes'],
      ['partner', 'migrations', 'cancel', READY, ...SCOPE, '--yes'],
      ['partner', 'migrations', 'retry', READY, ...SCOPE],
      ['partner', 'migrations', 'billing-queue'],
      [
        'partner',
        'migrations',
        'billing-link',
        QUEUED,
        '--installation',
        BILLING_INSTALLATION,
        '--client',
        '42',
        '--external-id',
        '4242',
        '--email',
        'owner@example.com',
        '--name',
        'Ana',
        '--yes',
      ],
      ['partner', 'migrations', 'claim-url', READY, ...SCOPE],
    ];
    for (const argv of runs) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(4);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe('partner_only');
      expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
    }
  });
});
