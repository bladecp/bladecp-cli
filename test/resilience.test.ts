import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

/** A fetch that answers every request with the same raw response. */
const answer =
  (body: string, init: ResponseInit): RunOptions['fetch'] =>
  async () =>
    new Response(body, init);

async function listen(handler: Parameters<typeof createServer>[1]): Promise<{
  server: Server;
  url: string;
  hits: string[];
}> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url} auth=${req.headers.authorization ? 'yes' : 'no'}`);
    handler!(req, res);
  });
  await new Promise<void>((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, hits };
}

describe('rate limits (429)', () => {
  it('waits until a Retry-After given as an HTTP date', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, message: 'slow down' },
      headers: { 'Retry-After': new Date(Date.now() + 4000).toUTCString() },
    });
    const result = await cli(['whoami']);
    expect(result.code).toBe(0);
    const wait = result.sleeps[0]!;
    expect(wait).toBeGreaterThanOrEqual(2000);
    expect(wait).toBeLessThanOrEqual(5000);
    expect(result.stderr).toMatch(/BladeCP asked to slow down\. Waiting \d s/);
  });

  it('uses 5 seconds when the answer has no Retry-After at all', async () => {
    api.fail({ path: /customer\/me$/, status: 429, body: { error: true, message: 'x' } });
    const result = await cli(['whoami']);
    expect(result.code).toBe(0);
    expect(result.sleeps).toEqual([5000]);
  });

  it('gives up at once when Retry-After is longer than two minutes', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, message: 'x' },
      headers: { 'Retry-After': '300' },
    });
    const result = await cli(['whoami', '--json']);
    expect(result.code).toBe(7);
    expect(result.sleeps).toEqual([]);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'rate_limited', exitCode: 7 });
    expect(parseJson(result.stdout).error?.message).toContain('300 seconds');
  });

  it('waits silently with --json', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, message: 'x' },
      headers: { 'Retry-After': '1' },
    });
    const result = await cli(['whoami', '--json']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(parseJson(result.stdout).ok).toBe(true);
  });
});

describe('transport failures', () => {
  it('a read that keeps timing out is retried three times, then exit 8', async () => {
    let calls = 0;
    const result = await cli(['whoami', '--json'], {
      fetch: async () => {
        calls += 1;
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    });
    expect(calls).toBe(4);
    expect(result.sleeps).toEqual([1000, 2000, 4000]);
    expect(result.code).toBe(8);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'network_error' });
  });

  it('never follows a redirect, so the key never reaches another host', async () => {
    const elsewhere = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"data":{}}');
    });
    const redirector = await listen((_req, res) => {
      res.writeHead(302, { Location: `${elsewhere.url}/api/v1/customer/me` });
      res.end();
    });
    try {
      const result = await runCli(['whoami', '--json'], {
        configDir: dir.path,
        apiUrl: redirector.url,
        env: { BLADECP_API_KEY: LIVE_KEY },
      });
      expect(result.code).toBe(8);
      expect(redirector.hits.length).toBeGreaterThan(0);
      expect(elsewhere.hits).toEqual([]);
    } finally {
      redirector.server.close();
      elsewhere.server.close();
    }
  });
});

describe('answers that do not follow the contract', () => {
  it('an HTML page with status 200 is an error, not a success', async () => {
    const result = await cli(['whoami', '--json'], {
      fetch: answer('<html><body>maintenance</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    });
    expect(result.code).not.toBe(0);
    expect(parseJson(result.stdout).ok).toBe(false);
  });

  it('a truncated JSON body is an error, not a success', async () => {
    const result = await cli(['servers', '--json'], {
      fetch: answer('{"data": [{"uuid": "a', { status: 200 }),
    });
    expect(result.code).not.toBe(0);
    expect(parseJson(result.stdout).ok).toBe(false);
  });

  it('a 5xx HTML page from a proxy keeps its status in --json', async () => {
    const result = await cli(['whoami', '--json'], {
      fetch: answer('<html>502 Bad Gateway</html>', { status: 502 }),
    });
    expect(result.code).toBe(8);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'server_error', status: 502 });
    // A read is retried before giving up.
    expect(result.sleeps).toEqual([1000, 2000, 4000]);
  });

  it('a 404 HTML page is not_found (exit 5)', async () => {
    const result = await cli(['whoami', '--json'], {
      fetch: answer('<html>Not Found</html>', { status: 404 }),
    });
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'not_found' });
  });
});
