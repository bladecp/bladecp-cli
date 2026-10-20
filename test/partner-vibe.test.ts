import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedVibe,
  VIBE_ACCOUNT,
  VIBE_FREE_PLAN,
  VIBE_PRO_PLAN,
  VIBE_SUSPENDED,
  VIBE_TERMINATED,
  vibeState,
} from './helpers/mock/partner-vibe.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  api.setPartner();
  seedVibe(api);
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

const BASE = '/api/v1/customer/vibe/accounts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vibeRequests = () => api.requests.filter((r) => r.path.startsWith(BASE));
const CREATE = [
  'partner',
  'vibe',
  'create',
  '--external-id',
  '5001',
  '--plan',
  VIBE_PRO_PLAN,
  '--email',
  'owner@example.com',
  '--name',
  'Store Owner',
];

describe('bladecp partner vibe find', () => {
  it('finds the account of a service by its ID', async () => {
    const result = await cli(['partner', 'vibe', 'find', '4821']);
    expect(result.code).toBe(0);
    expect(api.requests.at(-1)).toMatchObject({
      method: 'GET',
      path: `${BASE}/by-external-service/4821`,
    });
    expect(result.stdout).toContain(VIBE_ACCOUNT);
    expect(result.stdout).toContain('Active');
    expect(result.stdout).toContain('Pro');
    expect(result.stdout).toContain(`bladecp partner vibe open ${VIBE_ACCOUNT}`);
  });

  it('--json returns found and account as the API sends them', async () => {
    const result = await cli(['partner', 'vibe', 'find', '4821', '--json']);
    const envelope = parseJson(result.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      found: true,
      account: { accountId: VIBE_ACCOUNT, externalServiceId: '4821', status: 'active' },
    });
  });

  it('no account is a clear answer with exit 0', async () => {
    const human = await cli(['partner', 'vibe', 'find', '9999']);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain('No Vibe account for service 9999.');
    expect(human.stdout).toContain('bladecp partner vibe create --external-id 9999');
    const json = await cli(['partner', 'vibe', 'find', '9999', '--json']);
    expect(json.code).toBe(0);
    expect(parseJson(json.stdout)).toEqual({ ok: true, data: { found: false, account: null } });
  });

  it('sends the service ID as one path segment', async () => {
    await cli(['partner', 'vibe', 'find', 'svc/12 a']);
    expect(api.requests.at(-1)?.path).toBe(`${BASE}/by-external-service/svc%2F12%20a`);
  });

  it('an error is never taken as no account', async () => {
    api.fail({ path: /by-external-service/, status: 404, body: { error: true, message: 'Nope' } });
    const result = await cli(['partner', 'vibe', 'find', '4821', '--json']);
    expect(result.code).toBe(5);
    const envelope = parseJson(result.stdout);
    expect(envelope.error?.code).toBe('not_found');
    expect(envelope.data).toBeUndefined();
  });

  it('a broken answer is not absence either', async () => {
    api.routes.unshift((request) =>
      request.path.includes('by-external-service')
        ? { status: 200, body: { data: { found: false, account: { accountId: 'x' } } } }
        : undefined,
    );
    const result = await cli(['partner', 'vibe', 'find', '4821', '--json']);
    expect(result.code).toBe(1);
    expect(parseJson(result.stdout).error?.code).toBe('invalid_response');
  });

  it('refuses an empty or too long service ID before any request', async () => {
    for (const value of ['  ', 'x'.repeat(192)]) {
      const result = await cli(['partner', 'vibe', 'find', value, '--json']);
      expect(result.code).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(vibeRequests()).toHaveLength(0);
  });
});

describe('bladecp partner vibe show', () => {
  it('shows status, plan and AI', async () => {
    const result = await cli(['partner', 'vibe', 'show', VIBE_SUSPENDED]);
    expect(result.code).toBe(0);
    expect(api.requests.at(-1)).toMatchObject({ method: 'GET', path: `${BASE}/${VIBE_SUSPENDED}` });
    expect(result.stdout).toContain('Suspended');
    expect(result.stdout).toContain('Free');
    expect(result.stdout).toContain('Your own AI provider');
    expect(result.stdout).toContain(`bladecp partner vibe reactivate ${VIBE_SUSPENDED}`);
  });

  it('--json returns the account', async () => {
    const result = await cli(['partner', 'vibe', 'show', VIBE_ACCOUNT, '--json']);
    expect(parseJson(result.stdout)).toEqual({
      ok: true,
      data: expect.objectContaining({
        accountId: VIBE_ACCOUNT,
        planCode: 'pro',
        aiMode: 'managed_ai',
        status: 'active',
        resourceVersion: 1,
      }),
    });
  });

  it('a terminated account says it is final', async () => {
    const result = await cli(['partner', 'vibe', 'show', VIBE_TERMINATED]);
    expect(result.stdout).toContain('Terminated');
    // Notes go to stderr in the plain layout, so stdout stays the data.
    expect(result.stderr).toContain('Termination is final');
  });

  it('accepts the whole UUID in capitals and sends it in lower case', async () => {
    await cli(['partner', 'vibe', 'show', VIBE_ACCOUNT.toUpperCase()]);
    expect(api.requests.at(-1)?.path).toBe(`${BASE}/${VIBE_ACCOUNT}`);
  });

  it('a short or invalid ID is a usage error and sends nothing', async () => {
    for (const value of ['0197c3a0', '../../etc/passwd', `${VIBE_ACCOUNT}0`]) {
      const result = await cli(['partner', 'vibe', 'show', value]);
      expect(result.code, value).toBe(2);
      expect(result.stderr).toContain('Use the whole ID of the Vibe account');
    }
    expect(api.requests).toHaveLength(0);
  });

  it('an unknown account is not found (exit 5)', async () => {
    const result = await cli([
      'partner',
      'vibe',
      'show',
      '0197c3a0-0000-7000-8000-0000000000ff',
      '--json',
    ]);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'not_found',
      apiCode: 'account_not_found',
    });
  });
});

describe('bladecp partner vibe create', () => {
  it('sends the owner, plan and service with an idempotency key', async () => {
    const result = await cli([...CREATE, '--json']);
    expect(result.code).toBe(0);
    const request = api.requests.at(-1)!;
    expect(request).toMatchObject({ method: 'POST', path: BASE });
    expect(request.body).toEqual({
      owner: { email: 'owner@example.com', name: 'Store Owner' },
      planUuid: VIBE_PRO_PLAN,
      externalServiceId: '5001',
    });
    expect(String(request.headers['idempotency-key'])).toMatch(UUID);
    expect(parseJson(result.stdout).data).toMatchObject({ status: 'active', planCode: 'pro' });
  });

  it('a Free plan sends the statement about the owner email', async () => {
    const result = await cli([
      'partner',
      'vibe',
      'create',
      '--external-id',
      '5002',
      '--plan',
      VIBE_FREE_PLAN,
      '--email',
      'owner@example.com',
      '--name',
      'Store Owner',
      '--email-verification',
      'not-required',
    ]);
    expect(result.code).toBe(0);
    const body = api.requests.at(-1)!.body as { activationContext: Record<string, string> };
    expect(body.activationContext).toMatchObject({
      source: 'whmcs',
      externalServiceId: '5002',
      emailVerification: 'not_required',
    });
    expect(Number.isNaN(Date.parse(body.activationContext.assertedAt!))).toBe(false);
    expect(result.stdout).toMatch(/Plan\s+Free/);
    expect(result.stdout).toMatch(/Service\s+5002/);
  });

  it('a Free plan without the statement is refused by the API', async () => {
    const result = await cli([...CREATE.slice(0, 6), VIBE_FREE_PLAN, ...CREATE.slice(7), '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error?.apiCode).toBe('free_activation_context_invalid');
  });

  it('a service that has an account gets the same account back', async () => {
    const result = await cli([
      'partner',
      'vibe',
      'create',
      '--external-id',
      '4821',
      '--plan',
      VIBE_PRO_PLAN,
      '--email',
      'owner@example.com',
      '--name',
      'Store Owner',
      '--json',
    ]);
    expect(parseJson(result.stdout).data).toMatchObject({ accountId: VIBE_ACCOUNT });
    expect(vibeState(api).accounts.filter((a) => a.externalServiceId === '4821')).toHaveLength(1);
  });

  it('identity_link_required keeps its API code', async () => {
    vibeState(api).identityLinkRequired = true;
    const result = await cli([...CREATE, '--json']);
    expect(result.code).toBe(6);
    const error = parseJson(result.stdout).error;
    expect(error).toMatchObject({ code: 'conflict', apiCode: 'identity_link_required' });
    expect(error?.hint).toContain('identity link');
  });

  it('asks on a terminal: Enter creates, no sends nothing', async () => {
    const declined = await cli(CREATE, { tty: true, answers: ['n'] });
    expect(declined.code).toBe(0);
    expect(declined.stdout).toContain('Nothing was created.');
    expect(vibeRequests()).toHaveLength(0);
    const accepted = await cli(CREATE, { tty: true, answers: [''] });
    expect(accepted.code).toBe(0);
    expect(vibeRequests()).toHaveLength(1);
    expect(accepted.stdout).toContain('One account per service');
  });

  it('missing or invalid options are usage errors and send nothing', async () => {
    const cases: string[][] = [
      [
        'partner',
        'vibe',
        'create',
        '--plan',
        VIBE_PRO_PLAN,
        '--email',
        'a@example.com',
        '--name',
        'A',
      ],
      [
        'partner',
        'vibe',
        'create',
        '--external-id',
        '1',
        '--email',
        'a@example.com',
        '--name',
        'A',
      ],
      ['partner', 'vibe', 'create', '--external-id', '1', '--plan', VIBE_PRO_PLAN, '--name', 'A'],
      [
        'partner',
        'vibe',
        'create',
        '--external-id',
        '1',
        '--plan',
        VIBE_PRO_PLAN,
        '--email',
        'a@example.com',
      ],
      [...CREATE.slice(0, 6), '12', ...CREATE.slice(7)],
      [...CREATE.slice(0, 8), 'not-an-email', ...CREATE.slice(9)],
      [...CREATE, '--email-verification', 'maybe'],
    ];
    for (const argv of cases) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe('bladecp partner vibe plan', () => {
  it('sends the new plan with an idempotency key', async () => {
    const result = await cli(['partner', 'vibe', 'plan', VIBE_SUSPENDED, VIBE_PRO_PLAN]);
    expect(result.code).toBe(0);
    const request = api.requests.at(-1)!;
    expect(request).toMatchObject({
      method: 'PATCH',
      path: `${BASE}/${VIBE_SUSPENDED}`,
      body: { planUuid: VIBE_PRO_PLAN },
    });
    expect(String(request.headers['idempotency-key'])).toMatch(UUID);
    expect(result.stdout).toContain('Plan changed to Pro.');
  });

  it('--json returns the account on its new plan', async () => {
    const result = await cli(['partner', 'vibe', 'plan', VIBE_SUSPENDED, VIBE_PRO_PLAN, '--json']);
    expect(parseJson(result.stdout).data).toMatchObject({
      planUuid: VIBE_PRO_PLAN,
      planCode: 'pro',
    });
  });

  it('a Pro to Free move is refused by the API', async () => {
    const result = await cli(['partner', 'vibe', 'plan', VIBE_ACCOUNT, VIBE_FREE_PLAN, '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error?.apiCode).toBe('vibe_plan_downgrade_unavailable');
  });

  it('asks on a terminal and sends nothing on no', async () => {
    const result = await cli(['partner', 'vibe', 'plan', VIBE_SUSPENDED, VIBE_PRO_PLAN], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(vibeRequests()).toHaveLength(0);
  });

  it('the plan must be a UUID', async () => {
    const result = await cli(['partner', 'vibe', 'plan', VIBE_ACCOUNT, 'pro', '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error?.message).toContain('UUID of a Vibe plan');
    expect(api.requests).toHaveLength(0);
  });
});

describe('suspend, reactivate, resume and terminate', () => {
  const cases = [
    ['suspend', VIBE_ACCOUNT, 'POST', `/${VIBE_ACCOUNT}/suspend`, 'suspended'],
    ['reactivate', VIBE_SUSPENDED, 'POST', `/${VIBE_SUSPENDED}/reactivate`, 'active'],
    ['resume', VIBE_ACCOUNT, 'POST', `/${VIBE_ACCOUNT}/reactivate-serving`, 'active'],
    ['terminate', VIBE_ACCOUNT, 'DELETE', `/${VIBE_ACCOUNT}`, 'terminated'],
  ] as const;

  for (const [word, account, method, path, status] of cases) {
    it(`${word} sends ${method} ${path} with an idempotency key`, async () => {
      const result = await cli(['partner', 'vibe', word, account, '--json']);
      expect(result.code).toBe(0);
      const request = api.requests.at(-1)!;
      expect(request).toMatchObject({ method, path: `${BASE}${path}` });
      expect(String(request.headers['idempotency-key'])).toMatch(UUID);
      expect(parseJson(result.stdout)).toEqual({
        ok: true,
        data: expect.objectContaining({ accountId: account, status }),
      });
    });
  }

  it('suspend and terminate keep the account on Enter', async () => {
    for (const word of ['suspend', 'terminate']) {
      const result = await cli(['partner', 'vibe', word, VIBE_ACCOUNT], {
        tty: true,
        answers: [''],
      });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Nothing was changed.');
    }
    expect(vibeRequests()).toHaveLength(0);
  });

  it('reactivate and resume go on with Enter', async () => {
    await cli(['partner', 'vibe', 'reactivate', VIBE_SUSPENDED], { tty: true, answers: [''] });
    await cli(['partner', 'vibe', 'resume', VIBE_ACCOUNT], { tty: true, answers: [''] });
    expect(vibeRequests().map((r) => r.path)).toEqual([
      `${BASE}/${VIBE_SUSPENDED}/reactivate`,
      `${BASE}/${VIBE_ACCOUNT}/reactivate-serving`,
    ]);
  });

  it('--yes, y on a terminal, or no terminal at all sends the action', async () => {
    await cli(['partner', 'vibe', 'suspend', VIBE_ACCOUNT, '--yes'], { tty: true });
    await cli(['partner', 'vibe', 'terminate', VIBE_SUSPENDED], { tty: true, answers: ['y'] });
    await cli(['partner', 'vibe', 'terminate', VIBE_ACCOUNT]);
    expect(vibeRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST ${BASE}/${VIBE_ACCOUNT}/suspend`,
      `DELETE ${BASE}/${VIBE_SUSPENDED}`,
      `DELETE ${BASE}/${VIBE_ACCOUNT}`,
    ]);
  });

  it('says what happened, and what to do next', async () => {
    const suspended = await cli(['partner', 'vibe', 'suspend', VIBE_ACCOUNT]);
    expect(suspended.stdout).toContain('Vibe account suspended.');
    expect(suspended.stdout).toContain(`bladecp partner vibe reactivate ${VIBE_ACCOUNT}`);
    const terminated = await cli(['partner', 'vibe', 'terminate', VIBE_ACCOUNT]);
    expect(terminated.stdout).toContain('Vibe account terminated. This is final.');
  });

  it('an action on a terminated account says nothing changed', async () => {
    const result = await cli(['partner', 'vibe', 'suspend', VIBE_TERMINATED]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Nothing changed. Account status: Terminated.');
  });

  it('resume on an account that is not active is not found', async () => {
    const result = await cli(['partner', 'vibe', 'resume', VIBE_SUSPENDED, '--json']);
    expect(result.code).toBe(5);
  });
});

describe('bladecp partner vibe open', () => {
  it('opens the one-time link in the browser on a terminal', async () => {
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT], {
      tty: true,
      openUrl: async () => true,
    });
    expect(result.code).toBe(0);
    const request = api.requests.at(-1)!;
    expect(request).toMatchObject({
      method: 'POST',
      path: `${BASE}/${VIBE_ACCOUNT}/sso`,
      body: {},
    });
    expect(String(request.headers['idempotency-key'])).toMatch(UUID);
    expect(result.opened).toEqual([expect.stringMatching(/^https:\/\/vibe\.example\.com\/sso\//)]);
    expect(result.stdout).toContain('Vibe opened in your browser');
    expect(result.stdout + result.stderr).not.toContain(result.opened[0]);
  });

  it('shows the link when the browser does not open, or with --no-browser', async () => {
    const failed = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT], { tty: true });
    expect(failed.opened).toHaveLength(1);
    expect(failed.stdout).toContain('The browser did not open.');
    expect(failed.stdout).toContain(failed.opened[0]);
    const flag = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT, '--no-browser'], {
      tty: true,
      openUrl: async () => true,
    });
    expect(flag.opened).toHaveLength(0);
    expect(flag.stdout).toContain('https://vibe.example.com/sso/');
  });

  it('without a terminal prints only the link on stdout', async () => {
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT]);
    expect(result.code).toBe(0);
    expect(result.opened).toHaveLength(0);
    expect(result.stdout).toMatch(/^https:\/\/vibe\.example\.com\/sso\/\S+\n$/);
    expect(result.stderr).toContain('It works once');
  });

  it('--debug never writes the link anywhere but the result', async () => {
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT, '--debug']);
    expect(result.stderr).toContain('/sso');
    expect(result.stderr).not.toContain('ticket=');
    expect(result.stdout).toContain('ticket=');
  });

  it('--json returns the link and its expiry', async () => {
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT, '--json']);
    expect(result.opened).toHaveLength(0);
    expect(parseJson(result.stdout)).toEqual({
      ok: true,
      data: {
        url: expect.stringMatching(/^https:\/\/vibe\.example\.com\/sso\//),
        expiresAt: '2026-10-19T12:01:00.000Z',
      },
    });
  });

  it('never opens a link that is not a web address', async () => {
    api.routes.unshift((request) =>
      request.path.endsWith('/sso')
        ? {
            status: 200,
            body: { data: { url: 'file:///etc/passwd', expiresAt: '2026-10-19T12:01:00.000Z' } },
          }
        : undefined,
    );
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT], {
      tty: true,
      openUrl: async () => true,
    });
    expect(result.code).toBe(1);
    expect(result.opened).toHaveLength(0);
  });

  it('a federated account keeps the API code', async () => {
    vibeState(api).federated.add(VIBE_ACCOUNT);
    const result = await cli(['partner', 'vibe', 'open', VIBE_ACCOUNT, '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error?.apiCode).toBe('federation_required');
  });
});

describe('partner only', () => {
  const runs: string[][] = [
    ['partner', 'vibe', 'find', '4821'],
    ['partner', 'vibe', 'show', VIBE_ACCOUNT],
    CREATE,
    ['partner', 'vibe', 'plan', VIBE_ACCOUNT, VIBE_PRO_PLAN],
    ['partner', 'vibe', 'suspend', VIBE_ACCOUNT],
    ['partner', 'vibe', 'reactivate', VIBE_ACCOUNT],
    ['partner', 'vibe', 'resume', VIBE_ACCOUNT],
    ['partner', 'vibe', 'terminate', VIBE_ACCOUNT],
    ['partner', 'vibe', 'open', VIBE_ACCOUNT],
  ];

  it('a customer key gets partner_only (exit 4) on every command', async () => {
    api.setPartner(false);
    for (const argv of runs) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(4);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe('partner_only');
    }
    expect(vibeState(api).accounts.find((a) => a.accountId === VIBE_ACCOUNT)?.status).toBe(
      'active',
    );
  });

  it('the key never reaches the output', async () => {
    const outputs: string[] = [];
    for (const partner of [true, false]) {
      api.setPartner(partner);
      for (const argv of runs) {
        for (const json of [[], ['--json']]) {
          const result = await cli([...argv, ...json], { env: { BLADECP_API_KEY: LIVE_KEY } });
          outputs.push(result.stdout, result.stderr);
        }
      }
    }
    expect(outputs.join('\n')).not.toContain(LIVE_KEY);
    expect(outputs.join('\n')).not.toContain('TESTKEY');
  });
});

describe('terminal safety', () => {
  it('values from the API never reach the terminal raw', async () => {
    const ESC = String.fromCharCode(27);
    const BEL = String.fromCharCode(7);
    api.routes.unshift((request) =>
      request.method === 'GET' && request.path === `${BASE}/${VIBE_ACCOUNT}`
        ? {
            status: 200,
            body: {
              data: {
                accountId: VIBE_ACCOUNT,
                customerUuid: `${ESC}]8;;https://example.org${BEL}click${ESC}]8;;${BEL}`,
                planUuid: VIBE_PRO_PLAN,
                planCode: `pro${ESC}[2J`,
                aiMode: `ai${ESC}[31m`,
                status: `weird${ESC}[0m`,
                activationMode: 'automatic',
                resourceVersion: 1,
                entitlementVersion: 1,
              },
            },
          }
        : undefined,
    );
    for (const tty of [false, true]) {
      const result = await cli(['partner', 'vibe', 'show', VIBE_ACCOUNT], { tty });
      expect(result.code).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(`${ESC}]8`);
      expect(result.stdout + result.stderr).not.toContain(`${ESC}[2J`);
      expect(result.stdout + result.stderr).not.toContain(`${ESC}[31m`);
      expect(result.stdout + result.stderr).not.toContain(BEL);
    }
  });
});
