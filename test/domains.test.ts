import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeHost } from '../src/commands/domains.js';
import { domainsState, seedDomains } from './helpers/mock/domains.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

/** The first server of the simulated account (example.com). */
const SERVER = '01970000-0000-7000-8000-00000000s001';
/** A server whose ID starts with characters no other one has. */
const SHORT = '0197a1c4-0000-7000-8000-000000000001';

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

const writes = () => api.apiCalls().filter((r) => r.method !== 'GET');

describe('normalizeHost', () => {
  it('reads a domain the way the API does', () => {
    expect(normalizeHost(' Blog.Example.COM ')).toBe('blog.example.com');
    expect(normalizeHost('https://blog.example.com/path?x=1')).toBe('blog.example.com');
    expect(normalizeHost('blog.example.com.')).toBe('blog.example.com');
    expect(normalizeHost('ação.example.com')).toBe(new URL('http://ação.example.com').hostname);
    for (const bad of [
      'localhost',
      '203.0.113.10',
      'a b.com',
      'user@example.com',
      'x.com:8080',
      '',
    ])
      expect(normalizeHost(bad), bad).toBeNull();
  });
});

describe('bladecp domains list', () => {
  it('lists the main domain, the additional ones and the preview address', async () => {
    seedDomains(api, SERVER, ['blog.example.com', 'shop.example.net']);
    const result = await cli(['domains', 'list', SERVER]);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /\/domains$/).at(-1)?.path).toBe(
      `/api/v1/customer/provisions/${SERVER}/domains`,
    );
    const lines = result.stdout.split('\n');
    expect(lines[0]).toMatch(/^DOMAIN\s+TYPE$/);
    expect(result.stdout).toMatch(/example\.com\s+main/);
    expect(result.stdout).toMatch(/blog\.example\.com\s+additional/);
    expect(result.stdout).toMatch(/01970000\.preview\.example\.net\s+preview/);
    expect(result.stdout).toContain(`bladecp domains add ${SERVER} <host>`);
  });

  it('--json is the data of the API', async () => {
    seedDomains(api, SERVER, ['blog.example.com']);
    const result = await cli(['domains', 'list', SERVER, '--json']);
    expect(parseJson(result.stdout)).toEqual({
      ok: true,
      data: {
        primary: 'example.com',
        additional: ['blog.example.com'],
        preview: '01970000.preview.example.net',
      },
    });
  });

  it('takes the first characters of a server ID', async () => {
    api.provisions.push({
      uuid: SHORT,
      status: 'active',
      primary_domain: 'site.example.net',
      product_type: 'stack-container',
    });
    const result = await cli(['domains', 'list', '0197a1c4', '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({ primary: 'site.example.net' });
    expect(api.apiCalls('GET', /\/domains$/).at(-1)?.path).toContain(SHORT);
  });

  it('an unknown server is not found (exit 5)', async () => {
    const result = await cli(['domains', 'list', 'ffff0000-0000-7000-8000-000000000000', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'not_found' });
  });
});

describe('bladecp domains add', () => {
  it('sends the domain as the API reads it, with an idempotency key', async () => {
    const result = await cli(['domains', 'add', SERVER, 'HTTPS://Blog.Example.com/', '--json']);
    expect(result.code).toBe(0);
    const post = api.apiCalls('POST').at(-1)!;
    expect(post).toMatchObject({
      path: `/api/v1/customer/provisions/${SERVER}/domains`,
      body: { host: 'blog.example.com' },
    });
    expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(parseJson(result.stdout)).toEqual({
      ok: true,
      data: {
        host: 'blog.example.com',
        primary: 'example.com',
        additional: ['blog.example.com'],
        preview: '01970000.preview.example.net',
      },
    });
  });

  it('says it was added and how to see the domains', async () => {
    const result = await cli(['domains', 'add', SERVER, 'blog.example.com']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('blog.example.com was added to the server.');
    expect(result.stdout).toContain(`bladecp domains list ${SERVER}`);
  });

  it('a domain already in use says how to find out why', async () => {
    domainsState(api).taken.add('blog.example.com');
    const result = await cli(['domains', 'add', SERVER, 'blog.example.com', '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'conflict',
      status: 409,
      hint: expect.stringContaining('bladecp domains check blog.example.com'),
    });
  });

  it('a domain of another account points to support', async () => {
    domainsState(api).otherZones.add('example.org');
    const result = await cli(['domains', 'add', SERVER, 'blog.example.org', '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({
      apiCode: 'zone_owned_by_other',
      hint: expect.stringContaining('/support'),
    });
  });

  it('the limit of additional domains is explained', async () => {
    domainsState(api).limit = 0;
    const result = await cli(['domains', 'add', SERVER, 'blog.example.com', '--json']);
    expect(result.code).toBe(4);
    expect(parseJson(result.stdout).error).toMatchObject({
      apiCode: 'addon_domain_limit',
      hint: expect.stringContaining('limit of additional domains'),
    });
  });

  it('something that is not a domain is a usage error, before any request', async () => {
    for (const host of ['localhost', '203.0.113.10', 'not a domain']) {
      const result = await cli(['domains', 'add', SERVER, host, '--json']);
      expect(result.code, host).toBe(2);
      expect(parseJson(result.stdout).error?.code).toBe('usage');
    }
    expect(api.apiCalls()).toHaveLength(0);
  });
});

describe('bladecp domains remove', () => {
  beforeEach(() => seedDomains(api, SERVER, ['blog.example.com']));

  it('asks first on a terminal; no (and Enter) sends nothing', async () => {
    for (const answer of ['n', '']) {
      const result = await cli(['domains', 'remove', SERVER, 'blog.example.com'], {
        tty: true,
        answers: [answer],
      });
      expect(result.code).toBe(0);
      expect(result.prompts.at(-1)).toContain('Remove blog.example.com?');
      expect(result.prompts.at(-1)).toContain('The site of example.com stops answering');
      expect(result.stdout).toContain('Nothing was changed.');
    }
    expect(writes()).toHaveLength(0);
  });

  it('yes on the terminal, --yes, or no terminal at all removes it', async () => {
    const asked = await cli(['domains', 'remove', SERVER, 'blog.example.com'], {
      tty: true,
      answers: ['y'],
    });
    expect(asked.code).toBe(0);
    expect(asked.stdout).toContain('blog.example.com was removed from the server.');
    const del = api.apiCalls('DELETE').at(-1)!;
    expect(del.path).toBe(`/api/v1/customer/provisions/${SERVER}/domains/blog.example.com`);
    expect(del.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);

    seedDomains(api, SERVER, ['blog.example.com']);
    await cli(['domains', 'remove', SERVER, 'blog.example.com', '--yes'], { tty: true });
    seedDomains(api, SERVER, ['blog.example.com']);
    const script = await cli(['domains', 'remove', SERVER, 'blog.example.com', '--json']);
    expect(api.apiCalls('DELETE')).toHaveLength(3);
    expect(parseJson(script.stdout)).toEqual({
      ok: true,
      data: {
        host: 'blog.example.com',
        primary: 'example.com',
        additional: [],
        preview: '01970000.preview.example.net',
      },
    });
  });

  it('the main domain stays: a usage error, nothing removed', async () => {
    const result = await cli(['domains', 'remove', SERVER, 'example.com', '--yes', '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error?.message).toContain('main domain');
    expect(writes()).toHaveLength(0);
  });

  it('a domain the server does not have is not found, with the list to check', async () => {
    const result = await cli(['domains', 'remove', SERVER, 'other.example.com', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error?.hint).toContain(`bladecp domains list ${SERVER}`);
  });
});

describe('bladecp domains check', () => {
  it('a free domain can be added', async () => {
    const result = await cli(['domains', 'check', 'https://New.Example.com/']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /availability$/).at(-1)).toMatchObject({
      path: '/api/v1/customer/provisions/domains/availability',
      search: '?host=new.example.com',
    });
    expect(result.stdout).toContain('new.example.com is free to use.');
    expect(result.stdout).toContain('bladecp domains add <server> new.example.com');
    const json = await cli(['domains', 'check', 'new.example.com', '--json']);
    expect(parseJson(json.stdout)).toEqual({
      ok: true,
      data: { host: 'new.example.com', available: true },
    });
  });

  it('says why a domain cannot be used', async () => {
    const taken = await cli(['domains', 'check', 'shop.example.org']);
    expect(taken.code).toBe(0);
    expect(taken.stdout).toContain('shop.example.org cannot be used.');
    expect(taken.stdout).toContain('already on a BladeCP server');
    expect(taken.stdout).toContain('bladecp servers');

    domainsState(api).otherZones.add('example.info');
    const other = await cli(['domains', 'check', 'www.example.info', '--json']);
    expect(parseJson(other.stdout).data).toEqual({
      host: 'www.example.info',
      available: false,
      reason: 'zone_owned_by_other',
    });
    const human = await cli(['domains', 'check', 'www.example.info']);
    expect(human.stdout).toContain('belongs to another BladeCP account');
  });

  it('something that is not a domain is a usage error, before any request', async () => {
    const result = await cli(['domains', 'check', 'example', '--json']);
    expect(result.code).toBe(2);
    expect(api.apiCalls()).toHaveLength(0);
  });
});

describe('the domains commands', () => {
  it('never show the key', async () => {
    seedDomains(api, SERVER, ['blog.example.com']);
    const runs = [
      ['domains', 'list', SERVER],
      ['domains', 'add', SERVER, 'new.example.com'],
      ['domains', 'remove', SERVER, 'blog.example.com', '--yes'],
      ['domains', 'check', 'free.example.com', '--json'],
      ['domains', 'remove', SERVER, 'gone.example.com', '--json'],
    ];
    for (const argv of runs) {
      const result = await cli(argv);
      expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
    }
  });
});
