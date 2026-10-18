// Defects found in the 0.1.0 test campaign, written as the behavior the CLI
// must have. They were pinned with `it.fails` until 0.2.0 fixed them; each is
// now a regular test so the defect cannot come back.

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../src/reference.js';
import type { Provision } from '../src/types.js';
import { type PutPart, putPart } from '../src/upload/put.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { type RunOptions, runCli, tempDir } from './helpers/run.js';

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
    configDir: join(dir.path, 'config'),
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

/** Answers one route with a custom body and lets everything else reach the mock. */
const override =
  (route: RegExp, body: unknown): RunOptions['fetch'] =>
  async (input, init) =>
    route.test(new URL(input).pathname)
      ? new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : fetch(input, init);

const RAW_JS_ERROR = /Cannot read properties|is not iterable|is not a function|undefined/;

describe('server list and details', () => {
  it('show the domain the API returns as primaryDomain', async () => {
    // The production API answers `primaryDomain`; the CLI only reads `primary_domain`.
    api.provisions = [
      {
        uuid: '01970000-0000-7000-8000-00000000s009',
        status: 'active',
        primaryDomain: 'live.example.com',
        product_type: 'stack-container',
      } as unknown as Provision,
    ];
    const list = await cli(['servers']);
    expect(list.stdout).toContain('live.example.com');
  });
});

describe('answers that do not follow the contract', () => {
  it('data: null never surfaces a raw JavaScript error', async () => {
    const result = await cli(['whoami'], { fetch: override(/customer\/me$/, { data: null }) });
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toMatch(RAW_JS_ERROR);
  });

  it('a missing list field never surfaces a raw JavaScript error', async () => {
    const result = await cli(['whoami'], {
      fetch: override(/customer\/me$/, {
        data: { customer_uuid: 'u', customer_email: 'e@example.com', api_key_uuid: 'k' },
      }),
    });
    expect(result.stderr).not.toMatch(RAW_JS_ERROR);
  });

  it('a destination without locations never surfaces a raw JavaScript error', async () => {
    const result = await cli(['destinations'], {
      fetch: override(/migration-destinations$/, {
        data: { destinations: [{ partnerPlanId: 1, planName: 'S', partnerName: 'BladeCP' }] },
      }),
    });
    expect(result.stderr).not.toMatch(RAW_JS_ERROR);
  });

  it('an unreadable 200 answer is not reported as "an error (HTTP 200)"', async () => {
    const result = await cli(['whoami'], {
      fetch: async () => new Response('<html>maintenance</html>', { status: 200 }),
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toContain('HTTP 200');
  });
});

describe('usage messages', () => {
  it('a value given to an on/off option is not called a missing value', async () => {
    const result = await cli(['whoami', '--json=true']);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toContain('needs a value');
  });
});

describe('machine contract', () => {
  it('every error code migrate --json can print is in the reference table', () => {
    const codes = ERROR_CODES.map((spec) => spec.code);
    expect(codes).toContain('migration_failed');
    expect(codes).toContain('migration_cancelled');
  });

  it('status --watch --json keeps one JSON document per line, errors included', async () => {
    api.addMigration({ uuid: 'mig-0000-0901', phase: 'queued' });
    let reads = 0;
    const result = await cli(['migrations', 'status', 'mig-0000-0901', '--watch', '--json'], {
      fetch: async (input, init) => {
        if (/mig-0000-0901$/.test(new URL(input).pathname) && ++reads > 1) {
          return new Response('{"error":true,"message":"gone"}', { status: 404 });
        }
        return fetch(input, init);
      },
    });
    expect(result.code).toBe(5);
    for (const line of result.stdout.trim().split('\n'))
      expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('resuming a migration', () => {
  it('a rerun with another destination does not silently keep the earlier one', async () => {
    const backup = join(dir.path, 'cpmove-owner.tar.gz');
    writeFileSync(backup, gzipSync(randomBytes(640), { level: 0 }));
    api.destinations.push({
      ...api.destinations[0]!,
      partnerPlanId: 14,
      locations: [{ locationId: 5, name: 'Miami', countryCode: 'US' }],
    });
    const controller = new AbortController();
    let calls = 0;
    const interrupting: PutPart = (input) => {
      if (++calls === 3) controller.abort();
      return putPart(input);
    };
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'], {
      signal: controller.signal,
      upload: { putPart: interrupting, concurrency: 1 },
    });
    expect(first.code).toBe(130);

    const second = await cli(['migrate', backup, '--plan', '14', '--location', '5', '--no-wait']);
    const created = api.apiCalls('POST', /\/customer\/me\/migrations$/).length;
    expect(created === 2 || /destination|plan/i.test(second.stderr)).toBe(true);
  });
});

describe('migration details', () => {
  it('a failed migration with an empty message still shows a reason', async () => {
    api.addMigration({ uuid: 'mig-0000-0902', phase: 'failed', message: '', reason: 'permanent' });
    const result = await cli(['migrations', 'status', 'mig-0000-0902']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Reason[ \t]+\S/m);
  });
});
