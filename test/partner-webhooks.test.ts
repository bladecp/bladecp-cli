// `bladecp partner webhooks`: the requests each command sends, the JSON
// envelope, the human output, the questions, short IDs, the signing secret
// shown once, usage errors and the partner-only gate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEAD_DELIVERY,
  ENDPOINT,
  EVENT_ID,
  FAILED_DELIVERY,
  PAUSED_ENDPOINT,
  seedWebhooks,
  webhooks,
} from './helpers/mock/partner-webhooks.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  api.setPartner();
  seedWebhooks(api);
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

const hooks = () => api.requests.filter((r) => /^\/api\/v1\/customer\/webhook-/.test(r.path));
const writes = () => hooks().filter((r) => r.method !== 'GET');

describe('bladecp partner webhooks list', () => {
  it('lists the endpoints; the group alone runs it', async () => {
    const list = await cli(['partner', 'webhooks', 'list'], { tty: true });
    expect(list.code).toBe(0);
    expect(hooks().at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/v1/customer/webhook-endpoints',
    });
    for (const text of ['0198c2a0', 'https://billing.example.com/bladecp', 'Active', 'Paused']) {
      expect(list.stdout).toContain(text);
    }
    expect(list.stdout).toContain('2 endpoints');
    const alone = await cli(['partner', 'webhooks'], { tty: true });
    expect(alone.stdout).toBe(list.stdout);
  });

  it('plain output has the whole IDs; --json is the API data without secrets', async () => {
    const plain = await cli(['partner', 'webhooks', 'list']);
    expect(plain.stdout).toContain(ENDPOINT);
    const json = await cli(['partner', 'webhooks', 'list', '--json']);
    const data = parseJson(json.stdout).data as Record<string, unknown>[];
    expect(data.map((e) => e.uuid)).toEqual([ENDPOINT, PAUSED_ENDPOINT]);
    expect(json.stdout).not.toContain('whsec_');
  });

  it('with no endpoints, shows how to add one', async () => {
    webhooks(api).endpoints = [];
    const result = await cli(['partner', 'webhooks', 'list'], { tty: true });
    expect(result.stdout).toContain('No webhook endpoints yet.');
    expect(result.stdout).toContain('bladecp partner webhooks create --url');
  });
});

describe('bladecp partner webhooks show', () => {
  it('accepts a short ID, resolved against the list', async () => {
    const result = await cli(['partner', 'webhooks', 'show', '0198c2a0'], { tty: true });
    expect(result.code).toBe(0);
    expect(hooks().map((r) => r.path)).toEqual(['/api/v1/customer/webhook-endpoints']);
    for (const text of [
      'Production WHMCS',
      ENDPOINT,
      'invoice.paid, provision.created',
      'Active',
    ]) {
      expect(result.stdout).toContain(text);
    }
    expect(result.stdout).toContain('bladecp partner webhooks deliveries --endpoint 0198c2a0');
  });

  it('a whole ID is read directly', async () => {
    const result = await cli(['partner', 'webhooks', 'show', PAUSED_ENDPOINT, '--json']);
    expect(hooks().at(-1)?.path).toBe(`/api/v1/customer/webhook-endpoints/${PAUSED_ENDPOINT}`);
    expect(parseJson(result.stdout).data).toMatchObject({ uuid: PAUSED_ENDPOINT, active: false });
  });

  it('an unknown ID is not found; a malformed one is a usage error', async () => {
    const unknown = await cli(['partner', 'webhooks', 'show', 'ffff0000', '--json']);
    expect(unknown.code).toBe(5);
    const before = api.requests.length;
    const bad = await cli(['partner', 'webhooks', 'show', 'a/b', '--json']);
    expect(bad.code).toBe(2);
    expect(api.requests.length).toBe(before);
  });
});

describe('bladecp partner webhooks create', () => {
  it('sends the body with an idempotency key and shows the secret once', async () => {
    const result = await cli(
      [
        'partner',
        'webhooks',
        'create',
        '--url',
        'https://crm.example.com/hooks',
        '--event',
        'invoice.paid,provision.created',
        '--event',
        'invoice.paid',
        '--name',
        'CRM',
      ],
      { tty: true },
    );
    expect(result.code).toBe(0);
    const request = writes().at(-1)!;
    expect(request).toMatchObject({
      method: 'POST',
      path: '/api/v1/customer/webhook-endpoints',
      body: {
        url: 'https://crm.example.com/hooks',
        events: ['invoice.paid', 'provision.created'],
        description: 'CRM',
      },
    });
    expect(request.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    const secret = webhooks(api).endpoints.at(-1)!.secret;
    expect(result.stdout).toContain('Endpoint created: https://crm.example.com/hooks');
    expect(result.stdout).toContain('Signing secret');
    expect(result.stdout).toContain(secret);
    expect(result.stdout).toContain('This secret shows only now');
  });

  it('without a terminal, stdout is the secret alone', async () => {
    const result = await cli([
      'partner',
      'webhooks',
      'create',
      '--url',
      'https://crm.example.com/hooks',
      '--event',
      'invoice.paid',
    ]);
    const endpoint = webhooks(api).endpoints.at(-1)!;
    expect(result.stdout).toBe(`${endpoint.secret}\n`);
    expect(result.stderr).toContain(`Endpoint ${endpoint.uuid} created`);
    expect(writes().at(-1)?.body).toEqual({
      url: 'https://crm.example.com/hooks',
      events: ['invoice.paid'],
    });
  });

  it('--json has the secret in data; --debug never logs it', async () => {
    const json = await cli([
      'partner',
      'webhooks',
      'create',
      '--url',
      'https://crm.example.com/hooks',
      '--event',
      'invoice.paid',
      '--json',
      '--debug',
    ]);
    const data = parseJson(json.stdout).data as Record<string, unknown>;
    expect(data.secret).toBe(webhooks(api).endpoints.at(-1)!.secret);
    expect(data).toHaveProperty('warning');
    expect(json.stderr).not.toContain('whsec_');
  });

  it('checks the address, the events and the name before sending', async () => {
    const cases = [
      ['--event', 'invoice.paid'],
      ['--url', 'https://crm.example.com/hooks'],
      ['--url', 'http://crm.example.com/hooks', '--event', 'invoice.paid'],
      ['--url', 'crm.example.com', '--event', 'invoice.paid'],
      ['--url', 'https://crm.example.com/hooks', '--event', 'Invoice Paid'],
      ['--url', 'https://crm.example.com/hooks', '--event', ','],
      [
        '--url',
        'https://crm.example.com/hooks',
        '--event',
        'invoice.paid',
        '--name',
        'x'.repeat(256),
      ],
    ];
    for (const extra of cases) {
      const result = await cli(['partner', 'webhooks', 'create', ...extra, '--json']);
      expect(result.code, extra.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(hooks()).toHaveLength(0);
  });

  it('an event the API does not know is reported by the API', async () => {
    const result = await cli([
      'partner',
      'webhooks',
      'create',
      '--url',
      'https://crm.example.com/hooks',
      '--event',
      'order.shipped',
      '--json',
    ]);
    expect(result.code).not.toBe(0);
    expect(parseJson(result.stdout).error?.status).toBe(400);
  });
});

describe('bladecp partner webhooks update', () => {
  it('sends only the fields given, after asking (Enter says yes)', async () => {
    const result = await cli(
      ['partner', 'webhooks', 'update', '0198c2a0', '--url', 'https://new.example.com/hooks'],
      { tty: true, answers: [''] },
    );
    expect(result.code).toBe(0);
    expect(writes().at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/api/v1/customer/webhook-endpoints/${ENDPOINT}`,
      body: { url: 'https://new.example.com/hooks' },
    });
    expect(writes().at(-1)?.headers['idempotency-key']).toBeTruthy();
    expect(result.prompts.join(' ')).toContain(
      'Change the endpoint https://billing.example.com/bladecp?',
    );
    expect(result.stdout).toContain('Endpoint updated: https://new.example.com/hooks');
  });

  it('declined on a terminal, nothing is sent', async () => {
    const result = await cli(
      ['partner', 'webhooks', 'update', '0198c2a0', '--event', 'invoice.failed'],
      { tty: true, answers: ['n'] },
    );
    expect(result.code).toBe(0);
    expect(writes()).toHaveLength(0);
    expect(result.stdout).toContain('Nothing changed.');
  });

  it('--event replaces the list; --name "" removes the name; --yes skips the question', async () => {
    await cli(
      [
        'partner',
        'webhooks',
        'update',
        ENDPOINT,
        '--event',
        'invoice.failed',
        '--name',
        '',
        '--yes',
      ],
      { tty: true },
    );
    expect(writes().at(-1)?.body).toEqual({ events: ['invoice.failed'], description: '' });
  });

  it('with nothing to change, nothing is sent', async () => {
    const result = await cli(['partner', 'webhooks', 'update', ENDPOINT, '--json']);
    expect(result.code).toBe(2);
    expect(hooks()).toHaveLength(0);
  });

  it('--json is the updated endpoint', async () => {
    const result = await cli([
      'partner',
      'webhooks',
      'update',
      ENDPOINT,
      '--name',
      'Billing',
      '--json',
    ]);
    expect(parseJson(result.stdout).data).toMatchObject({ uuid: ENDPOINT, description: 'Billing' });
  });
});

describe('bladecp partner webhooks pause and resume', () => {
  it('pause asks with no as the default and sends active: false', async () => {
    const declined = await cli(['partner', 'webhooks', 'pause', '0198c2a0'], {
      tty: true,
      answers: [''],
    });
    expect(declined.code).toBe(0);
    expect(writes()).toHaveLength(0);
    expect(declined.prompts.join(' ')).toContain(
      'Events that happen while it is paused are not sent',
    );
    const paused = await cli(['partner', 'webhooks', 'pause', '0198c2a0', '--yes'], { tty: true });
    expect(writes().at(-1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect(paused.stdout).toContain('Endpoint paused');
    expect(paused.stdout).toContain('bladecp partner webhooks resume 0198c2a0');
  });

  it('resume asks with yes as the default and sends active: true', async () => {
    const result = await cli(['partner', 'webhooks', 'resume', '0198b7e5'], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(writes().at(-1)).toMatchObject({
      path: `/api/v1/customer/webhook-endpoints/${PAUSED_ENDPOINT}`,
      body: { active: true },
    });
    const json = await cli(['partner', 'webhooks', 'resume', PAUSED_ENDPOINT, '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({ active: true });
  });
});

describe('bladecp partner webhooks delete', () => {
  it('asks with no as the default; --yes or no terminal deletes', async () => {
    const declined = await cli(['partner', 'webhooks', 'delete', '0198c2a0'], {
      tty: true,
      answers: [''],
    });
    expect(declined.code).toBe(0);
    expect(writes()).toHaveLength(0);
    expect(declined.prompts.join(' ')).toContain('This cannot be undone.');
    const done = await cli(['partner', 'webhooks', 'delete', '0198c2a0', '--yes'], { tty: true });
    expect(writes().at(-1)).toMatchObject({
      method: 'DELETE',
      path: `/api/v1/customer/webhook-endpoints/${ENDPOINT}`,
    });
    expect(done.stdout).toContain('Endpoint deleted: https://billing.example.com/bladecp');
    const json = await cli(['partner', 'webhooks', 'delete', PAUSED_ENDPOINT, '--json']);
    expect(parseJson(json.stdout).data).toEqual({ uuid: PAUSED_ENDPOINT, deleted: true });
  });
});

describe('bladecp partner webhooks rotate-secret', () => {
  it('asks with no as the default, says the old secret stops working', async () => {
    const result = await cli(['partner', 'webhooks', 'rotate-secret', '0198c2a0'], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(writes()).toHaveLength(0);
    expect(result.prompts.join(' ')).toContain('The current secret stops working right away.');
  });

  it('shows the new secret once; --json has it in data', async () => {
    const result = await cli(['partner', 'webhooks', 'rotate-secret', '0198c2a0', '--yes'], {
      tty: true,
    });
    expect(writes().at(-1)).toMatchObject({
      method: 'POST',
      path: `/api/v1/customer/webhook-endpoints/${ENDPOINT}/rotate-secret`,
    });
    expect(writes().at(-1)?.headers['idempotency-key']).toBeTruthy();
    const secret = webhooks(api).endpoints[0]!.secret;
    expect(result.stdout).toContain(secret);
    expect(result.stdout).toContain('the old one no longer works');
    const plain = await cli(['partner', 'webhooks', 'rotate-secret', ENDPOINT]);
    expect(plain.stdout).toBe(`${webhooks(api).endpoints[0]!.secret}\n`);
    const json = await cli(['partner', 'webhooks', 'rotate-secret', ENDPOINT, '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({
      uuid: ENDPOINT,
      secret: webhooks(api).endpoints[0]!.secret,
    });
  });
});

describe('bladecp partner webhooks deliveries', () => {
  it('lists the deliveries with their state and the next step', async () => {
    const result = await cli(['partner', 'webhooks', 'deliveries'], { tty: true });
    expect(result.code).toBe(0);
    expect(hooks().at(-1)).toMatchObject({
      path: '/api/v1/customer/webhook-deliveries',
      search: '',
    });
    for (const text of ['Delivered', 'Failed', 'Given up', 'Queued', '503', '4 deliveries']) {
      expect(result.stdout).toContain(text);
    }
    expect(result.stdout).toContain('bladecp partner webhooks replay 0198d3a7');
  });

  it('sends the filters; a short endpoint ID is resolved first', async () => {
    const result = await cli([
      'partner',
      'webhooks',
      'deliveries',
      '--endpoint',
      '0198c2a0',
      '--status',
      'FAILED',
      '--page',
      '1',
      '--limit',
      '1',
    ]);
    expect(result.code).toBe(0);
    expect(hooks().at(-1)).toMatchObject({
      path: '/api/v1/customer/webhook-deliveries',
      search: `?endpoint_id=${ENDPOINT}&status=failed&page=1&limit=1`,
    });
    expect(result.stdout).toContain(FAILED_DELIVERY);
  });

  it('shows the next page with the same filters', async () => {
    const result = await cli(['partner', 'webhooks', 'deliveries', '--limit', '2'], { tty: true });
    expect(result.stdout).toContain('4 deliveries · page 1 of 2');
    expect(result.stdout).toContain('bladecp partner webhooks deliveries --limit 2 --page 2');
  });

  it('--json has the items and the pagination', async () => {
    const result = await cli(['partner', 'webhooks', 'deliveries', '--json']);
    const data = parseJson(result.stdout).data as { items: unknown[]; meta: unknown };
    expect(data.items).toHaveLength(4);
    expect(data.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
  });

  it('an unknown state or a bad page is a usage error', async () => {
    for (const extra of [
      ['--status', 'lost'],
      ['--limit', '500'],
      ['--page', '0'],
      ['--endpoint', 'x'],
    ]) {
      const result = await cli(['partner', 'webhooks', 'deliveries', ...extra, '--json']);
      expect(result.code, extra.join(' ')).toBe(2);
    }
    expect(hooks()).toHaveLength(0);
  });

  it('empty lists', async () => {
    webhooks(api).deliveries = [];
    const all = await cli(['partner', 'webhooks', 'deliveries']);
    expect(all.stdout).toContain('No deliveries yet.');
    const filtered = await cli(['partner', 'webhooks', 'deliveries', '--status', 'dead']);
    expect(filtered.stdout).toContain('No deliveries match.');
  });
});

describe('bladecp partner webhooks replay', () => {
  it('asks naming the event (Enter says yes) and keeps the event ID', async () => {
    const result = await cli(['partner', 'webhooks', 'replay', '0198d3a7'], {
      tty: true,
      answers: [''],
    });
    expect(result.code).toBe(0);
    expect(writes().at(-1)).toMatchObject({
      method: 'POST',
      path: `/api/v1/customer/webhook-deliveries/${FAILED_DELIVERY}/replay`,
    });
    expect(writes().at(-1)?.headers['idempotency-key']).toBeTruthy();
    expect(result.prompts.join(' ')).toContain('Event provision.created, with the same event ID');
    expect(result.stdout).toContain(`same event ID ${EVENT_ID.slice(0, 8)}`);
  });

  it('declined, nothing is sent; --json is the new delivery', async () => {
    await cli(['partner', 'webhooks', 'replay', DEAD_DELIVERY], { tty: true, answers: ['n'] });
    expect(writes()).toHaveLength(0);
    const json = await cli(['partner', 'webhooks', 'replay', DEAD_DELIVERY, '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({
      status: 'pending',
      replayOf: DEAD_DELIVERY,
    });
  });

  it('an unknown delivery is not found', async () => {
    const result = await cli(['partner', 'webhooks', 'replay', 'ffff0000', '--json']);
    expect(result.code).toBe(5);
    expect(writes()).toHaveLength(0);
  });
});

describe('partner only', () => {
  const commands = [
    ['partner', 'webhooks', 'list'],
    ['partner', 'webhooks', 'show', ENDPOINT],
    [
      'partner',
      'webhooks',
      'create',
      '--url',
      'https://crm.example.com/h',
      '--event',
      'invoice.paid',
    ],
    ['partner', 'webhooks', 'update', ENDPOINT, '--name', 'x'],
    ['partner', 'webhooks', 'pause', ENDPOINT],
    ['partner', 'webhooks', 'resume', ENDPOINT],
    ['partner', 'webhooks', 'delete', ENDPOINT],
    ['partner', 'webhooks', 'rotate-secret', ENDPOINT],
    ['partner', 'webhooks', 'deliveries'],
    ['partner', 'webhooks', 'replay', FAILED_DELIVERY],
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
      for (const extra of [['--yes'], ['--json']]) {
        const yes =
          argv[2] === 'list' ||
          argv[2] === 'show' ||
          argv[2] === 'create' ||
          argv[2] === 'deliveries';
        const result = await cli([
          ...argv,
          ...(yes && extra[0] === '--yes' ? [] : extra),
          '--debug',
        ]);
        outputs.push(result.stdout, result.stderr);
      }
    }
    expect(outputs.join('\n')).not.toContain(LIVE_KEY);
  });

  it('values from the API never reach the terminal raw', async () => {
    webhooks(api).endpoints[0]!.url = 'https://evil.example.com/\u001b]8;;x\u0007a';
    webhooks(api).deliveries[1]!.lastError = 'boom\u001b[2J\u009b';
    for (const tty of [false, true]) {
      for (const argv of [
        ['partner', 'webhooks', 'list'],
        ['partner', 'webhooks', 'deliveries'],
      ]) {
        const result = await cli(argv, { tty, columns: 200 });
        expect(result.stdout).not.toMatch(/\u001b\]8;;x|\u001b\[2J|\u009b/);
      }
    }
  });
});

describe('webhook signing unavailable on the BladeCP side', () => {
  it('create says so instead of "try again", and nothing is kept', async () => {
    api.setPartner();
    api.failures.push({
      method: 'POST',
      path: /\/customer\/webhook-endpoints$/,
      status: 503,
      body: {
        error: true,
        code: 'webhook_secrets_unavailable',
        message: 'Webhook signing is not available right now.',
      },
      times: 4,
    });
    const result = await runCli(
      [
        'partner',
        'webhooks',
        'create',
        '--url',
        'https://example.com/hook',
        '--event',
        'provision.created',
        '--json',
      ],
      { configDir: dir.path, apiUrl: api.baseUrl, env: { BLADECP_API_KEY: LIVE_KEY } },
    );
    expect(result.code).not.toBe(0);
    const error = parseJson(result.stdout).error;
    expect(error?.apiCode).toBe('webhook_secrets_unavailable');
    expect(error?.hint).toContain('support');
  });
});
