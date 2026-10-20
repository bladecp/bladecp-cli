import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeApiPath } from '../src/commands/api.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
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

describe('bladecp api <path>', () => {
  it('GET prints the answer as JSON, with the key in use', async () => {
    const result = await cli(['api', '/customer/me']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: api.me });
    expect(api.requests.at(-1)).toMatchObject({ method: 'GET', path: '/api/v1/customer/me' });
    expect(api.requests.at(-1)?.headers.authorization).toBe(`Bearer ${LIVE_KEY}`);
    expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
  });

  it('accepts the /api/v1 prefix and a query string', async () => {
    const result = await cli(['api', '/api/v1/customer/provisions?status=active&limit=5']);
    expect(result.code).toBe(0);
    expect(api.requests.at(-1)).toMatchObject({
      path: '/api/v1/customer/provisions',
      search: '?status=active&limit=5',
    });
  });

  it('--json wraps the answer in the envelope', async () => {
    const result = await cli(['api', '/customer/me', '--json']);
    expect(parseJson(result.stdout)).toEqual({ ok: true, data: { data: api.me } });
  });

  it('a body makes it a POST; --data and --input send JSON', async () => {
    await cli(['api', '/customer/me/migrations', '--data', '{"sourcePanel":"cpanel"}']);
    expect(api.requests.at(-1)).toMatchObject({
      method: 'POST',
      body: { sourcePanel: 'cpanel' },
    });
    const file = join(dir.path, 'body.json');
    writeFileSync(file, '{"reason":"test"}');
    await cli(['api', '-X', 'post', '/customer/me/migrations/abc/cancel', '--input', file]);
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', body: { reason: 'test' } });
    await cli(['api', '/customer/me/migrations/abc/cancel', '--input', '-'], {
      stdin: '{"reason":"stdin"}',
    });
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', body: { reason: 'stdin' } });
  });

  it('an API error keeps its exit code and code', async () => {
    const result = await cli(['api', '/customer/provisions/nope', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('DELETE asks first on a terminal and sends nothing on no', async () => {
    const before = api.requests.length;
    const result = await cli(['api', '-X', 'DELETE', '/customer/webhook-endpoints/w1'], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(api.requests.length).toBe(before);
  });

  it('DELETE with --yes, or without a terminal, is sent', async () => {
    await cli(['api', '-X', 'DELETE', '/customer/webhook-endpoints/w1', '--yes'], { tty: true });
    expect(api.requests.at(-1)).toMatchObject({ method: 'DELETE' });
    await cli(['api', '-X', 'DELETE', '/customer/webhook-endpoints/w2']);
    expect(api.requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/api/v1/customer/webhook-endpoints/w2',
    });
  });

  it('the connectivity check runs signed out', async () => {
    const result = await cli(['api', '/customer/health'], { env: { BLADECP_API_KEY: undefined } });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: { status: 'ok' } });
  });

  it('refuses what is not a Customer API route, before any request', async () => {
    for (const path of [
      'https://example.com/customer/me',
      '//example.com/customer/me',
      '/customer/../hub/me',
      '/hub/me',
      'customer/me',
      '/customer/%2e%2e/admin',
    ]) {
      const result = await cli(['api', path, '--json']);
      expect(result.code, path).toBe(2);
      expect(parseJson(result.stdout).error?.code, path).toBe('usage');
    }
    expect(api.requests).toHaveLength(0);
  });

  it('refuses a bad method, bad JSON, two bodies and a body on GET', async () => {
    const cases = [
      ['api', '/customer/me', '-X', 'TRACE'],
      ['api', '/customer/me/migrations', '--data', '{bad'],
      ['api', '/customer/me/migrations', '--data', '{}', '--input', 'x.json'],
      ['api', '/customer/me', '-X', 'GET', '--data', '{}'],
    ];
    for (const argv of cases) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe('normalizeApiPath', () => {
  it('keeps Customer API routes and drops the /api/v1 prefix', () => {
    expect(normalizeApiPath('/customer/me')).toBe('/customer/me');
    expect(normalizeApiPath('/api/v1/customer/me?x=1')).toBe('/customer/me?x=1');
    expect(normalizeApiPath('/customer/provisions/abc/domains/a.example.com')).toBe(
      '/customer/provisions/abc/domains/a.example.com',
    );
  });
});

describe('bladecp api list', () => {
  it('lists every route with the command that covers it', async () => {
    const result = await cli(['api', 'list', '--json'], { env: { BLADECP_API_KEY: undefined } });
    expect(result.code).toBe(0);
    const routes = parseJson(result.stdout).data as {
      operationId: string;
      method: string;
      path: string;
      command: string | null;
      apiOnly?: string;
    }[];
    expect(routes.length).toBe(101);
    expect(routes.find((r) => r.path === '/customer/me')?.command).toBe('bladecp whoami');
    expect(routes.find((r) => r.path === '/customer/health')).toMatchObject({
      command: null,
      apiOnly: 'probe',
    });
    // Help and the route table never need the API.
    expect(api.requests).toHaveLength(0);
  });
});
