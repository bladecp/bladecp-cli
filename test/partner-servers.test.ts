// `bladecp partner servers ...` against the simulated API: the request sent
// (method, path, query, body, Idempotency-Key), the --json envelope, the
// screen basics, confirmation, partner-only keys, short IDs and usage errors.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OPTION_BACKUPS,
  OPTION_EXTRA_IP,
  OPTION_MEMORY,
  VALUE_BACKUPS_DAILY,
  VALUE_EXTRA_IP,
  VALUE_MEMORY_4,
  VALUE_MEMORY_8,
} from './helpers/mock/partner.js';
import { addCustomerServer, partnerServersState } from './helpers/mock/partner-servers.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

const STORE = '0197d1c4-0000-7000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  api.setPartner();
  addCustomerServer(
    api,
    {
      uuid: STORE,
      status: 'active',
      primary_domain: 'store.example.com',
      product_type: 'stack-container',
      activation_mode: 'auto',
    },
    '1042',
  );
  dir = tempDir();
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

const writes = () => api.requests.filter((r) => r.method !== 'GET');
const lastWrite = () => writes().at(-1);
const CREATE = [
  'partner',
  'servers',
  'create',
  '--plan',
  '12',
  '--location',
  '3',
  '--domain',
  'New.Example.com',
  '--email',
  'owner@example.com',
  '--name',
  'Example Shop',
  '--component',
  'php',
];

describe('bladecp partner servers list', () => {
  it('without filters lists every server the key sees, also with "partner servers" alone', async () => {
    const result = await cli(['partner', 'servers', 'list']);
    expect(result.code).toBe(0);
    expect(api.requests.at(-1)).toMatchObject({ path: '/api/v1/customer/provisions', search: '' });
    expect(result.stdout).toContain('store.example.com');
    const alone = await cli(['partner', 'servers']);
    expect(alone.stdout).toBe(result.stdout);
  });

  it('filters by the service ID of the billing system and pages', async () => {
    const one = await cli(['partner', 'servers', 'list', '--external-id', '1042', '--json']);
    expect(api.requests.at(-1)).toMatchObject({ search: '?external_service_id=1042' });
    expect(parseJson(one.stdout).data).toEqual({
      servers: [expect.objectContaining({ uuid: STORE, primary_domain: 'store.example.com' })],
      meta: { page: 1, limit: 50, hasMore: false },
    });

    const paged = await cli(['partner', 'servers', 'list', '--status', 'active', '--limit', '1']);
    expect(api.requests.at(-1)).toMatchObject({ search: '?status=active&limit=1' });
    expect(paged.stdout).toContain(
      'bladecp partner servers list --status active --limit 1 --page 2',
    );
  });

  it('says when nothing matches the filters', async () => {
    const result = await cli(['partner', 'servers', 'list', '--domain', 'nope.example.net']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No server matches these filters.');
  });

  it('a page or limit out of range is a usage error, before any request', async () => {
    for (const argv of [
      ['--limit', '200'],
      ['--limit', '0'],
      ['--page', '0'],
      ['--page', 'two'],
    ]) {
      const result = await cli(['partner', 'servers', 'list', ...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner servers create', () => {
  it('sends the plan, location, domain, owner, options, components and contract', async () => {
    const result = await cli([
      ...CREATE,
      '--external-id',
      '2001',
      '--option',
      'memory=4',
      '--option',
      'extra-ip=2',
      '--option',
      'backups=weekly',
      '--contract',
      '12',
      '--json',
    ]);
    expect(result.code).toBe(0);
    expect(api.requests.at(-2)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/partner/option-groups',
      search: '?plan=12',
    });
    const request = lastWrite()!;
    expect(request).toMatchObject({ method: 'POST', path: '/api/v1/customer/provisions/simple' });
    expect(request.body).toEqual({
      partner_plan_id: 12,
      location_id: 3,
      domain: 'new.example.com',
      owner: { email: 'owner@example.com', name: 'Example Shop' },
      external_service_id: '2001',
      // The default value (weekly backups) is the plan base: nothing to send.
      options: [
        { option_id: OPTION_MEMORY, option_value_id: VALUE_MEMORY_4, quantity: 1 },
        { option_id: OPTION_EXTRA_IP, option_value_id: VALUE_EXTRA_IP, quantity: 2 },
      ],
      components: [{ slug: 'php' }],
      contract_term_months: 12,
      contract_accepted: true,
    });
    expect(request.headers['idempotency-key']).toMatch(UUID);
    const data = parseJson(result.stdout).data as Record<string, unknown>;
    expect(data).toMatchObject({ status: 'pending', primary_domain: 'new.example.com' });
    expect(partnerServersState(api).externalIds.get(String(data.uuid))).toBe('2001');
  });

  it('shows the new server and how to follow it', async () => {
    const result = await cli([...CREATE, '--component', 'mysql@8']);
    expect(result.code).toBe(0);
    expect((lastWrite()!.body as { components: unknown }).components).toEqual([
      { slug: 'php' },
      { slug: 'mysql', component_version: 8 },
    ]);
    expect(result.stdout).toContain('new.example.com');
    expect(result.stdout).toContain('Example Shop (owner@example.com)');
    expect(result.stdout).toMatch(/bladecp servers show 0197c0a1-0000-7000-8000-000000000001/);
    expect(result.stdout).toMatch(/bladecp partner servers open 0197c0a1/);
  });

  it('asks first on a terminal (Enter creates) and sends nothing on no', async () => {
    const declined = await cli(CREATE, { tty: true, answers: ['n'] });
    expect(declined.code).toBe(0);
    expect(api.requests).toHaveLength(0);
    expect(declined.stdout).toContain('Nothing was changed.');
    const accepted = await cli(CREATE, { tty: true, answers: [''] });
    expect(accepted.code).toBe(0);
    expect(lastWrite()).toMatchObject({ path: '/api/v1/customer/provisions/simple' });
    await cli([...CREATE, '--yes'], { tty: true });
    expect(writes()).toHaveLength(2);
  });

  it('checks every option before asking or sending', async () => {
    const cases: [string[], RegExp][] = [
      [['--option', 'disk=100'], /Plan 12 has no option "disk"/],
      [['--option', 'memory=16'], /memory has no value "16". Use one of: 2, 4, 8/],
      [['--option', 'extra-ip=9'], /extra-ip takes a quantity from 1 to 4/],
      [['--option', 'memory=4', '--option', 'Memory=8'], /given more than once/],
    ];
    for (const [extra, message] of cases) {
      const result = await cli([...CREATE, ...extra]);
      expect(result.code, extra.join(' ')).toBe(2);
      expect(result.stderr).toMatch(message);
    }
    expect(writes()).toHaveLength(0);
  });

  it('takes an option and its value by ID or label', async () => {
    await cli([
      ...CREATE,
      '--option',
      `${OPTION_MEMORY}=${VALUE_MEMORY_8}`,
      '--option',
      'backups=Daily',
    ]);
    expect((lastWrite()!.body as { options: unknown }).options).toEqual([
      { option_id: OPTION_MEMORY, option_value_id: VALUE_MEMORY_8, quantity: 1 },
      { option_id: OPTION_BACKUPS, option_value_id: VALUE_BACKUPS_DAILY, quantity: 1 },
    ]);
  });

  it('invalid values are usage errors, with nothing sent', async () => {
    const without = (name: string) => {
      const argv = [...CREATE];
      argv.splice(argv.indexOf(name), 2);
      return argv;
    };
    const cases: string[][] = [
      without('--plan'),
      without('--email'),
      without('--domain'),
      [...without('--plan'), '--plan', 'start'],
      [...without('--domain'), '--domain', 'not a domain'],
      [...without('--email'), '--email', 'owner'],
      [...CREATE, '--contract', '6'],
      [...CREATE, '--component', 'php@0'],
      [...CREATE, '--component', 'php@7', '--component', 'php@8'],
      [...CREATE, '--option', 'memory'],
      [...CREATE, '--external-id', ' '],
    ];
    for (const argv of cases) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe('usage');
    }
    expect(api.requests).toHaveLength(0);
  });

  it('a Stack Container plan without components stops before sending, saying why', async () => {
    const argv = CREATE.slice(0, -2);
    const result = await cli([...argv, '--json']);
    expect(result.code).toBe(2);
    const error = parseJson(result.stdout).error;
    expect(error).toMatchObject({ code: 'usage' });
    expect(error?.message).toContain('--component');
    expect(writes()).toHaveLength(0);
  });

  it('a catalog refusal of the API keeps its exit code and says what to check', async () => {
    api.failures.push({
      method: 'POST',
      path: /\/customer\/provisions\/simple$/,
      status: 422,
      body: {
        error: true,
        code: 'COMPONENT_NOT_FOUND',
        message: 'The selected catalog configuration is not available.',
      },
      times: 1,
    });
    const result = await cli([...CREATE, '--json']);
    expect(result.code).toBe(6);
    const error = parseJson(result.stdout).error;
    expect(error).toMatchObject({
      code: 'unprocessable',
      status: 422,
      apiCode: 'COMPONENT_NOT_FOUND',
    });
    expect(error?.hint).toContain('bladecp components list');
  });
});

describe('bladecp partner servers plan', () => {
  it('changes the plan of a server found by a short ID', async () => {
    const result = await cli(['partner', 'servers', 'plan', '0197d1c4', '21', '--json']);
    expect(result.code).toBe(0);
    expect(lastWrite()).toMatchObject({
      method: 'PATCH',
      path: `/api/v1/customer/provisions/${STORE}`,
      body: { partnerPlanId: 21 },
    });
    expect(lastWrite()!.headers['idempotency-key']).toMatch(UUID);
    expect(parseJson(result.stdout).data).toMatchObject({
      uuid: STORE,
      product_type: 'edge-cloud',
    });
  });

  it('says what changed, and asks first on a terminal', async () => {
    const human = await cli(['partner', 'servers', 'plan', STORE, '21']);
    expect(human.stdout).toContain('store.example.com is on plan 21 now.');
    expect(human.stdout).toContain('bladecp partner options --plan 21');
    await cli(['partner', 'servers', 'plan', STORE, '12'], { tty: true, answers: ['n'] });
    expect(writes()).toHaveLength(1);
  });

  it('a plan that is not a number is a usage error', async () => {
    const result = await cli(['partner', 'servers', 'plan', STORE, 'business']);
    expect(result.code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner servers options', () => {
  it('replaces the whole set and reports the charge', async () => {
    const result = await cli([
      'partner',
      'servers',
      'options',
      STORE,
      '--option',
      'memory=8',
      '--option',
      'backups=daily',
    ]);
    expect(result.code).toBe(0);
    expect(api.requests.some((r) => r.path === '/api/v1/customer/partner/option-groups')).toBe(
      true,
    );
    expect(lastWrite()).toMatchObject({
      method: 'PATCH',
      path: `/api/v1/customer/provisions/${STORE}/options`,
      body: {
        options: [
          { optionUuid: OPTION_MEMORY, optionValueUuid: VALUE_MEMORY_8, quantity: 1 },
          { optionUuid: OPTION_BACKUPS, optionValueUuid: VALUE_BACKUPS_DAILY, quantity: 1 },
        ],
      },
    });
    expect(result.stdout).toContain('Options of store.example.com replaced.');
    expect(result.stdout).toContain('R$25.00 is charged for the rest of the billing cycle.');
  });

  it('default values clear the options; the question says the set is replaced', async () => {
    const declined = await cli(['partner', 'servers', 'options', STORE, '--option', 'memory=8'], {
      tty: true,
      answers: [''],
    });
    expect(declined.stdout + declined.stderr).toContain('replaces every option of the server');
    expect(writes()).toHaveLength(0);
    const cleared = await cli([
      'partner',
      'servers',
      'options',
      STORE,
      '--option',
      'memory=2',
      '--json',
    ]);
    expect(lastWrite()).toMatchObject({ body: { options: [] } });
    expect(parseJson(cleared.stdout).data).toEqual({
      uuid: STORE,
      prorationAmountCents: 0,
      currency: 'BRL',
    });
  });

  it('needs at least one --option', async () => {
    const result = await cli(['partner', 'servers', 'options', STORE]);
    expect(result.code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner servers suspend and unsuspend', () => {
  it('suspend asks first (Enter keeps it running) and then suspends', async () => {
    const declined = await cli(['partner', 'servers', 'suspend', STORE], {
      tty: true,
      answers: [''],
    });
    expect(declined.code).toBe(0);
    expect(writes()).toHaveLength(0);
    const result = await cli(['partner', 'servers', 'suspend', STORE, '--json']);
    expect(lastWrite()).toMatchObject({
      method: 'POST',
      path: `/api/v1/customer/provisions/${STORE}/suspend`,
      body: null,
    });
    expect(lastWrite()!.headers['idempotency-key']).toMatch(UUID);
    expect(parseJson(result.stdout).data).toMatchObject({ uuid: STORE, status: 'suspended' });
  });

  it('unsuspend: Enter brings it back', async () => {
    const result = await cli(['partner', 'servers', 'unsuspend', '0197d1c4'], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(lastWrite()).toMatchObject({ path: `/api/v1/customer/provisions/${STORE}/unsuspend` });
    expect(result.stdout).toContain('store.example.com is back.');
  });
});

describe('bladecp partner servers cancel', () => {
  it('cancels at the end of the cycle with the default reason', async () => {
    const result = await cli(['partner', 'servers', 'cancel', STORE]);
    expect(result.code).toBe(0);
    expect(lastWrite()).toMatchObject({
      method: 'POST',
      path: `/api/v1/customer/provisions/${STORE}/cancel`,
      body: {
        when: 'cycle_end',
        reasonCategory: 'other',
        reasonText: 'Cancellation requested by the partner with the BladeCP CLI.',
      },
    });
    expect(result.stdout).toContain('will be cancelled at the end of the billing cycle');
    expect(result.stdout).toContain('ticket 4521');
  });

  it('--now with a category and a reason, and the early termination fee', async () => {
    partnerServersState(api).penalty = { amount: 12000, currency: 'BRL', remainingMonths: 6 };
    const reason = 'The customer closed the online store';
    const result = await cli([
      'partner',
      'servers',
      'cancel',
      STORE,
      '--now',
      '--reason-category',
      'too-expensive',
      '--reason',
      reason,
    ]);
    expect(lastWrite()).toMatchObject({
      body: { when: 'now', reasonCategory: 'too_expensive', reasonText: reason },
    });
    expect(result.stdout).toContain('is cancelled and suspended');
    expect(result.stdout).toContain('R$120.00, with 6 months left');
    expect(result.stdout).toContain(`bladecp partner servers unsuspend ${STORE}`);
  });

  it('asks first on a terminal (Enter keeps it), and a second request is a conflict', async () => {
    await cli(['partner', 'servers', 'cancel', STORE], { tty: true, answers: [''] });
    expect(writes()).toHaveLength(0);
    await cli(['partner', 'servers', 'cancel', STORE, '--yes'], { tty: true });
    const again = await cli(['partner', 'servers', 'cancel', STORE, '--json']);
    expect(again.code).toBe(6);
    expect(parseJson(again.stdout).error).toMatchObject({ code: 'conflict' });
  });

  it('a short reason or an unknown category is a usage error', async () => {
    for (const extra of [
      ['--reason', 'too short'],
      ['--reason-category', 'bored'],
    ]) {
      const result = await cli(['partner', 'servers', 'cancel', STORE, ...extra, '--json']);
      expect(result.code).toBe(2);
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner servers delete', () => {
  it('asks first (Enter keeps it), then deletes with an Idempotency-Key', async () => {
    const declined = await cli(['partner', 'servers', 'delete', STORE], {
      tty: true,
      answers: [''],
    });
    expect(declined.stdout + declined.stderr).toContain('This cannot be undone.');
    expect(writes()).toHaveLength(0);
    const result = await cli(['partner', 'servers', 'delete', STORE]);
    expect(lastWrite()).toMatchObject({
      method: 'DELETE',
      path: `/api/v1/customer/provisions/${STORE}`,
    });
    expect(lastWrite()!.headers['idempotency-key']).toMatch(UUID);
    expect(result.stdout).toContain('store.example.com is being deleted.');
    const again = await cli(['partner', 'servers', 'delete', STORE, '--json']);
    expect(parseJson(again.stdout).data).toMatchObject({ targetStatus: 'deleting', reused: true });
  });
});

describe('bladecp partner servers open', () => {
  const URL_PREFIX = 'https://panel.example.com/sso/';

  it('without a terminal prints the link alone on stdout', async () => {
    const result = await cli(['partner', 'servers', 'open', STORE]);
    expect(result.code).toBe(0);
    expect(lastWrite()).toMatchObject({
      method: 'POST',
      path: `/api/v1/customer/provisions/${STORE}/sso-link`,
      body: { ttl_seconds: 300 },
    });
    expect(result.stdout.trim()).toMatch(new RegExp(`^${URL_PREFIX}\\S+$`));
    expect(result.stderr).toContain('works once and lasts 5 minutes');
    expect(result.opened).toEqual([]);
  });

  it('on a terminal opens it and says so; when the browser fails, shows it', async () => {
    const opened = await cli(['partner', 'servers', 'open', '0197d1c4'], {
      tty: true,
      openUrl: async () => true,
    });
    expect(opened.opened).toEqual([expect.stringMatching(URL_PREFIX)]);
    expect(opened.stdout).toContain('The panel of store.example.com opened in your browser.');
    expect(opened.stdout).not.toContain(URL_PREFIX);
    const failed = await cli(['partner', 'servers', 'open', STORE], { tty: true });
    expect(failed.stdout).toContain(URL_PREFIX);
  });

  it('--json returns the link in data', async () => {
    const result = await cli(['partner', 'servers', 'open', STORE, '--json']);
    expect(parseJson(result.stdout)).toEqual({
      ok: true,
      data: { uuid: STORE, url: `${URL_PREFIX}0197d1c4t0k3n`, expiresInSeconds: 300 },
    });
  });

  it('an address that is not https is never opened', async () => {
    api.fail({
      method: 'POST',
      path: /sso-link$/,
      status: 200,
      body: { data: { url: 'javascript:alert(1)' } },
    });
    const result = await cli(['partner', 'servers', 'open', STORE, '--json'], {
      tty: true,
      openUrl: async () => true,
    });
    expect(result.code).toBe(1);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'invalid_response' });
    expect(result.opened).toEqual([]);
  });
});

describe('every partner server command', () => {
  const actions: string[][] = [
    [...CREATE],
    ['partner', 'servers', 'plan', STORE, '21'],
    ['partner', 'servers', 'options', STORE, '--option', 'memory=4'],
    ['partner', 'servers', 'suspend', STORE],
    ['partner', 'servers', 'unsuspend', STORE],
    ['partner', 'servers', 'cancel', STORE],
    ['partner', 'servers', 'delete', STORE],
    ['partner', 'servers', 'open', STORE],
  ];

  it('a customer key gets partner_only (exit 4) and nothing changes', async () => {
    api.setPartner(false);
    for (const argv of actions) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(4);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe('partner_only');
    }
    expect(api.provisions.find((p) => p.uuid === STORE)?.status).toBe('active');
  });

  it('an argument that is not an ID is a usage error, with nothing sent', async () => {
    for (const verb of ['suspend', 'unsuspend', 'cancel', 'delete', 'open']) {
      const result = await cli(['partner', 'servers', verb, '../../etc/passwd', '--json']);
      expect(result.code, verb).toBe(2);
    }
    expect(api.requests).toHaveLength(0);
  });

  it('an unknown server is not found (exit 5)', async () => {
    const result = await cli(['partner', 'servers', 'suspend', 'ffff0000', '--json']);
    expect(result.code).toBe(5);
  });

  it('the key never reaches the output', async () => {
    const outputs: string[] = [];
    for (const argv of [...actions, ['partner', 'servers', 'list', '--debug']]) {
      const result = await cli([...argv, '--debug']);
      outputs.push(result.stdout, result.stderr);
    }
    api.setPartner(false);
    const denied = await cli(['partner', 'servers', 'open', STORE]);
    outputs.push(denied.stdout, denied.stderr);
    expect(outputs.join('\n')).not.toContain(LIVE_KEY);
  });

  it('--debug never shows the sign-in link', async () => {
    const result = await cli(['partner', 'servers', 'open', STORE, '--json', '--debug']);
    expect(result.stderr).not.toContain('panel.example.com');
  });
});

describe('conflicts of the lifecycle', () => {
  it('a pending server that the API will not delete gets a hint that says why', async () => {
    api.failures.push({
      method: 'DELETE',
      path: /\/customer\/provisions\/[^/]+$/,
      status: 409,
      body: { error: true, message: "Provision in status 'pending' cannot be deleted" },
      times: 1,
    });
    const pending = api.provisions.find((p) => p.status === 'pending');
    expect(pending, 'the simulated API has a pending server').toBeDefined();
    const result = await cli(['partner', 'servers', 'delete', pending!.uuid, '--yes', '--json']);
    expect(result.code).not.toBe(0);
    expect(parseJson(result.stdout).error?.hint).toContain('pending');
  });
});
