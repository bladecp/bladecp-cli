import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveCommand } from '../src/args.js';
import { ApiError, describeApiError } from '../src/errors.js';
import { EXPIRED_KEY, LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, runCli, tempDir } from './helpers/run.js';

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

const cli = (
  argv: string[],
  extra: Parameters<typeof runCli>[1] extends infer O ? Partial<O> : never = {},
) =>
  runCli(argv, {
    configDir: dir.path,
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

describe('read commands', () => {
  it('whoami shows the account', async () => {
    const result = await cli(['whoami']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Signed in as owner@example.com');
    expect(result.stdout).toContain('60 requests per minute');
  });

  it('servers list prints a table', async () => {
    const result = await cli(['servers', 'list']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/UUID\s+DOMAIN\s+PRODUCT\s+STATUS/);
    expect(result.stdout).toContain('Stack Container');
    expect(result.stdout).toContain('shop.example.org');
  });

  it('"bladecp servers" alone lists servers', async () => {
    const result = await cli(['servers']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('example.com');
  });

  it('servers show includes usage when available', async () => {
    const result = await cli(['servers', 'show', '01970000-0000-7000-8000-00000000s001']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Disk: 3.25 GB / 20 GB');
    expect(result.stdout).toContain('Monthly bandwidth: 12.5 GB / unlimited');
    expect(api.apiCalls('GET', /\/usage$/)).toHaveLength(1);
  });

  it('servers show still works when usage is not available', async () => {
    const result = await cli(['servers', 'show', '01970000-0000-7000-8000-00000000s002', '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({
      usage: null,
      server: { primary_domain: 'shop.example.org' },
    });
  });

  it('destinations list shows plan and location IDs, disk, prices and an example', async () => {
    const result = await cli(['destinations', 'list']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(
      /PLAN ID\s+PLAN\s+DISK\s+PRICE\s+PROVIDER\s+LOCATION ID\s+LOCATION/,
    );
    expect(result.stdout).toContain('Stack Container S');
    expect(result.stdout).toContain('20 GB');
    expect(result.stdout).toContain('R$49.00/month, $9.00/month');
    expect(result.stdout).toContain('bladecp migrate backup.tar.gz --plan 12 --location 3');
  });

  it('destinations list --currency narrows prices and validates the code', async () => {
    const brl = await cli(['destinations', 'list', '--currency', 'brl', '--json']);
    expect(brl.code).toBe(0);
    expect(api.apiCalls('GET', /migration-destinations$/)[0]!.search).toBe('?currency=BRL');
    const data = parseJson(brl.stdout).data as { destinations: { prices: unknown[] }[] };
    expect(data.destinations[0]!.prices).toEqual([{ currency: 'BRL', priceMonthly: 49 }]);
    const before = api.requests.length;
    const bad = await cli(['destinations', 'list', '--currency', 'reais']);
    expect(bad.code).toBe(2);
    expect(api.requests.length).toBe(before);
  });

  it('migrations list and status', async () => {
    api.addMigration({
      uuid: 'mig-0000-0001',
      phase: 'awaiting_approval',
      primaryDomain: 'example.com',
      stagingUrl: 'https://p.example.net/',
    });
    const list = await cli(['migrations', 'list']);
    expect(list.code).toBe(0);
    expect(list.stdout).toContain('Ready for your review');
    const status = await cli(['migrations', 'status', 'mig-0000-0001']);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain('https://p.example.net/');
    expect(status.stdout).toContain('bladecp migrations approve mig-0000-0001');
  });
});

describe('migration actions', () => {
  it('review sends the domain', async () => {
    api.addMigration({
      uuid: 'mig-0000-0002',
      phase: 'discovery_review',
      sourcePrimaryDomain: 'old.example.com',
    });
    const result = await cli([
      'migrations',
      'review',
      'mig-0000-0002',
      '--domain',
      'New.Example.com',
    ]);
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /discovery-review$/)[0]!.body).toEqual({
      primaryDomain: 'new.example.com',
    });
  });

  it('review requires a valid --domain', async () => {
    api.addMigration({ uuid: 'mig-0000-0002', phase: 'discovery_review' });
    expect((await cli(['migrations', 'review', 'mig-0000-0002'])).code).toBe(2);
    expect(
      (await cli(['migrations', 'review', 'mig-0000-0002', '--domain', 'not a domain'])).code,
    ).toBe(2);
    expect(api.apiCalls('POST')).toHaveLength(0);
  });

  it('approve, cancel and retry', async () => {
    api.addMigration({ uuid: 'mig-0000-0003', phase: 'awaiting_approval' });
    const approve = await cli(['migrations', 'approve', 'mig-0000-0003']);
    expect(approve.code).toBe(0);
    expect(approve.stdout).toContain('Migration approved');

    api.addMigration({ uuid: 'mig-0000-0004', phase: 'importing' });
    const cancel = await cli(['migrations', 'cancel', 'mig-0000-0004', '--reason', 'wrong backup']);
    expect(cancel.code).toBe(0);
    expect(api.apiCalls('POST', /cancel$/)[0]!.body).toEqual({ reason: 'wrong backup' });

    api.addMigration({ uuid: 'mig-0000-0005', phase: 'failed' });
    const retry = await cli(['migrations', 'retry', 'mig-0000-0005', '--json']);
    expect(retry.code).toBe(0);
    expect(parseJson(retry.stdout).data).toMatchObject({
      retryOf: 'mig-0000-0005',
      phase: 'queued',
    });
  });

  it('status --watch follows until the migration needs approval', async () => {
    api.addMigration({ uuid: 'mig-0000-0006', phase: 'queued' });
    api.phaseScript = ['parsing', 'provisioning', 'importing', 'validating', 'awaiting_approval'];
    const result = await cli(['migrations', 'status', 'mig-0000-0006', '--watch']);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('Importing files and databases');
    expect(result.stdout).toContain('bladecp migrations approve mig-0000-0006');
  });

  it('status --watch --json prints one JSON line per change', async () => {
    api.addMigration({ uuid: 'mig-0000-0007', phase: 'queued' });
    api.phaseScript = ['parsing', 'awaiting_approval'];
    const result = await cli(['migrations', 'status', 'mig-0000-0007', '--watch', '--json']);
    expect(result.code).toBe(0);
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines.map((l) => l.data.phase)).toEqual(['parsing', 'awaiting_approval']);
    expect(result.stderr).toBe('');
  });

  it('status --watch stops with exit 10 when the domain must be confirmed', async () => {
    api.addMigration({
      uuid: 'mig-0000-0008',
      phase: 'discovery_review',
      sourcePrimaryDomain: 'old.example.com',
    });
    const result = await cli(['migrations', 'status', 'mig-0000-0008', '--watch']);
    expect(result.code).toBe(10);
    expect(result.stdout).toContain(
      'bladecp migrations review mig-0000-0008 --domain old.example.com',
    );
  });

  it('status --watch keeps waiting when the domain was already answered', async () => {
    api.addMigration({
      uuid: 'mig-0000-0020',
      phase: 'discovery_review',
      sourcePrimaryDomain: 'old.example.com',
      primaryDomain: 'old.example.com',
      scriptIndex: 2,
    });
    api.reviewResumeAfterPolls = 3;
    const result = await cli(['migrations', 'status', 'mig-0000-0020', '--watch']);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      'Domain old.example.com is confirmed. Waiting for BladeCP to continue',
    );
    expect(result.stdout).toContain('bladecp migrations approve mig-0000-0020');
    expect(result.stdout).not.toContain('migrations review');
  });

  it('review followed by status --watch waits instead of asking again (no exit 10)', async () => {
    api.addMigration({
      uuid: 'mig-0000-0021',
      phase: 'discovery_review',
      sourcePrimaryDomain: 'old.example.com',
      scriptIndex: 2,
    });
    const review = await cli([
      'migrations',
      'review',
      'mig-0000-0021',
      '--domain',
      'new.example.com',
    ]);
    expect(review.code).toBe(0);
    const status = await cli(['migrations', 'status', 'mig-0000-0021']);
    expect(status.stdout).toContain('Domain confirmed, waiting for BladeCP to continue');
    expect(status.stdout).toContain('bladecp migrations status mig-0000-0021 --watch');
    const watch = await cli(['migrations', 'status', 'mig-0000-0021', '--watch', '--json']);
    expect(watch.code).toBe(0);
    const phases = watch.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).data.phase);
    expect(phases[0]).toBe('discovery_review');
    expect(phases.at(-1)).toBe('awaiting_approval');
  });

  it('a long wait for BladeCP mentions that resending the same domain is safe', async () => {
    api.addMigration({
      uuid: 'mig-0000-0022',
      phase: 'discovery_review',
      sourcePrimaryDomain: 'old.example.com',
      primaryDomain: 'old.example.com',
      scriptIndex: 2,
    });
    api.reviewResumeAfterPolls = 15;
    const result = await cli(['migrations', 'status', 'mig-0000-0022', '--watch'], {
      pollIntervalMs: 60_000,
    });
    expect(result.code).toBe(0);
    const hint =
      'Sending the same domain again is safe: bladecp migrations review mig-0000-0022 --domain old.example.com';
    expect(result.stderr.split(hint)).toHaveLength(2);
  });

  it('status --watch ends with exit 0 once the migration is complete (domain optional)', async () => {
    api.addMigration({ uuid: 'mig-0000-0030', phase: 'syncing', primaryDomain: 'example.com' });
    api.phaseScript = ['syncing', 'cutover_pending'];
    const result = await cli(['migrations', 'status', 'mig-0000-0030', '--watch']);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('Migration complete, pointing the domain is optional');
    expect(result.stdout).toContain('Migration complete. Your site is ready on BladeCP.');
    expect(result.stdout).toContain('Point the domain whenever you want. It is optional');
    // No nameservers are known for an API address other than the official one.
    expect(result.stdout).not.toContain('nameservers');
    expect(result.stdout).toContain(
      'At the provider of the domain, point its A record to 203.0.113.10.',
    );
    expect(result.stdout).not.toContain('--watch');
  });

  it('a stalled domain check is still a complete migration (exit 0, never 9)', async () => {
    api.addMigration({ uuid: 'mig-0000-0031', phase: 'syncing', primaryDomain: 'example.com' });
    api.phaseScript = ['syncing', 'cutover_stalled'];
    const result = await cli(['migrations', 'status', 'mig-0000-0031', '--watch', '--json']);
    expect(result.code).toBe(0);
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines.at(-1)).toMatchObject({
      ok: true,
      data: {
        phase: 'cutover_stalled',
        cutoverTarget: '203.0.113.10',
        domainPointing: { optional: true, nameservers: [], aRecord: '203.0.113.10' },
      },
    });
    // Lines before completion are the API object unchanged.
    expect(lines[0].data.domainPointing).toBeUndefined();

    const human = await cli(['migrations', 'status', 'mig-0000-0031']);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain('Migration complete, automatic domain check ended');
    expect(human.stdout).toContain('This does not affect the migration.');
    expect(human.stdout).not.toContain('--watch');
  });

  it('shows the official nameservers and the A record for the official API', async () => {
    api.addMigration({
      uuid: 'mig-0000-0032',
      phase: 'cutover_pending',
      primaryDomain: 'example.com',
      cutoverTarget: '203.0.113.10',
    });
    const official = 'https://api.bladecp.com';
    const result = await cli(['migrations', 'status', 'mig-0000-0032', '--watch'], {
      apiUrl: official,
      fetch: (input, init) => fetch(input.replace(official, api.baseUrl), init),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      'At the provider where you registered the domain, use these nameservers:\n  kant.ns.bladecp.com\n  hegel.ns.bladecp.com\n',
    );
    expect(result.stdout).toContain('Or point the A record of the domain to 203.0.113.10.');

    const json = await cli(['migrations', 'status', 'mig-0000-0032', '--json'], {
      apiUrl: official,
      fetch: (input, init) => fetch(input.replace(official, api.baseUrl), init),
    });
    expect(parseJson(json.stdout).data).toMatchObject({
      phase: 'cutover_pending',
      domainPointing: {
        optional: true,
        nameservers: ['kant.ns.bladecp.com', 'hegel.ns.bladecp.com'],
        aRecord: '203.0.113.10',
      },
    });
  });

  it('without an A record address, only the nameservers are shown', async () => {
    api.addMigration({
      uuid: 'mig-0000-0033',
      phase: 'cutover_pending',
      primaryDomain: 'example.com',
      cutoverTarget: null,
    });
    const official = 'https://api.bladecp.com';
    const result = await cli(['migrations', 'status', 'mig-0000-0033', '--lang', 'pt-BR'], {
      apiUrl: official,
      fetch: (input, init) => fetch(input.replace(official, api.baseUrl), init),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Migração concluída, apontar o domínio é opcional');
    expect(result.stdout).toContain('kant.ns.bladecp.com');
    expect(result.stdout).not.toContain('registro A');
  });

  it('status --watch exits 9 when the migration fails', async () => {
    api.addMigration({ uuid: 'mig-0000-0009', phase: 'queued' });
    api.phaseScript = ['parsing', 'failed'];
    const result = await cli(['migrations', 'status', 'mig-0000-0009', '--watch']);
    expect(result.code).toBe(9);
    expect(result.stdout).toContain('Backup could not be imported');
    expect(result.stdout).toContain('bladecp migrations retry mig-0000-0009');
  });
});

describe('API errors', () => {
  it('401 api_key_expired points to the Hub API keys page (exit 3)', async () => {
    const result = await cli(['whoami', '--json'], { env: { BLADECP_API_KEY: EXPIRED_KEY } });
    expect(result.code).toBe(3);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({
      code: 'api_key_expired',
      status: 401,
      apiCode: 'api_key_expired',
    });
    expect(error.hint).toContain(`${api.baseUrl}/account/api-keys`);
  });

  it('429 daily_quota_exceeded fails at once without waiting (exit 7)', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, code: 'daily_quota_exceeded', daily_limit: 1000 },
    });
    const result = await cli(['whoami', '--json']);
    expect(result.code).toBe(7);
    expect(parseJson(result.stdout).error?.code).toBe('daily_quota_exceeded');
    expect(result.sleeps).toEqual([]);
  });

  it('401 asks to sign in again (exit 3)', async () => {
    const result = await cli(['whoami', '--json'], {
      env: { BLADECP_API_KEY: 'bcp_live_EXPIRED0000000000' },
    });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'unauthorized', status: 401 });
  });

  it('403 COMMERCE_RESTRICTED (exit 4)', async () => {
    api.addMigration({ uuid: 'mig-0000-0010', phase: 'awaiting_approval' });
    api.fail({
      method: 'POST',
      path: /approve$/,
      status: 403,
      body: { error: true, code: 'COMMERCE_RESTRICTED' },
    });
    const result = await cli(['migrations', 'approve', 'mig-0000-0010', '--json']);
    expect(result.code).toBe(4);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'commerce_restricted',
      apiCode: 'COMMERCE_RESTRICTED',
    });
  });

  it('403 restricted scope (exit 4)', async () => {
    api.fail({
      path: /provisions$/,
      status: 403,
      body: { error: true, message: 'Forbidden', code: 'restricted_scope' },
    });
    const result = await cli(['servers', 'list']);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('does not have the permission');
  });

  it('403 key bound to one migration (exit 4)', async () => {
    api.fail({
      path: /migrations$/,
      status: 403,
      body: { error: true, code: 'KEY_BOUND_TO_MIGRATION' },
    });
    const result = await cli(['migrations', 'list', '--json']);
    expect(result.code).toBe(4);
    expect(parseJson(result.stdout).error?.code).toBe('key_bound_to_migration');
  });

  it('404 (exit 5)', async () => {
    const result = await cli(['migrations', 'status', 'mig-unknown-01']);
    expect(result.code).toBe(5);
    expect(result.stderr).toContain('Not found');
  });

  it('409 phase conflict (exit 6)', async () => {
    api.addMigration({ uuid: 'mig-0000-0011', phase: 'importing' });
    const result = await cli(['migrations', 'approve', 'mig-0000-0011', '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'phase_conflict', status: 409 });
  });

  it('409 with a stable code in the message', async () => {
    api.addMigration({ uuid: 'mig-0000-0012', phase: 'importing' });
    const result = await cli([
      'migrations',
      'review',
      'mig-0000-0012',
      '--domain',
      'example.com',
      '--json',
    ]);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'review_unavailable' });
  });

  it('429 waits for Retry-After and then succeeds', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, code: 'rate_limited' },
      headers: { 'Retry-After': '2' },
    });
    const result = await cli(['whoami']);
    expect(result.code).toBe(0);
    expect(result.sleeps).toContain(2000);
    expect(result.stderr).toContain('Waiting 2 s');
  });

  it('429 that does not clear gives exit 7', async () => {
    api.fail({
      path: /customer\/me$/,
      status: 429,
      body: { error: true, code: 'rate_limited', retry_after_seconds: 30 },
      headers: { 'Retry-After': '30' },
      times: 10,
    });
    const result = await cli(['whoami', '--json']);
    expect(result.code).toBe(7);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'rate_limited' });
    expect(result.sleeps.filter((ms) => ms === 30_000)).toHaveLength(3);
  });

  it('5xx on a read is retried', async () => {
    api.fail({ path: /customer\/me$/, status: 503, times: 2 });
    const result = await cli(['whoami']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /customer\/me$/)).toHaveLength(3);
  });

  it('5xx on approve is not repeated automatically (exit 8)', async () => {
    api.addMigration({ uuid: 'mig-0000-0013', phase: 'awaiting_approval' });
    api.fail({ method: 'POST', path: /approve$/, status: 502 });
    const result = await cli(['migrations', 'approve', 'mig-0000-0013']);
    expect(result.code).toBe(8);
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(1);
  });

  it('network failure (exit 8)', async () => {
    const result = await runCli(['whoami'], {
      configDir: dir.path,
      apiUrl: 'http://127.0.0.1:9',
      env: { BLADECP_API_KEY: LIVE_KEY },
    });
    expect(result.code).toBe(8);
    expect(result.stderr).toContain('Could not reach 127.0.0.1:9');
  });
});

describe('error mapping', () => {
  it('keeps stable codes for the token and destination errors', () => {
    expect(describeApiError(new ApiError(400, 'invalid_request', 'Invalid request'))).toMatchObject(
      {
        code: 'invalid_request',
        exitCode: 6,
      },
    );
    expect(describeApiError(new ApiError(400, 'invalid_grant', undefined))).toMatchObject({
      code: 'invalid_grant',
      exitCode: 3,
    });
    expect(describeApiError(new ApiError(409, 'api_key_cap_reached', undefined))).toMatchObject({
      code: 'api_key_cap_reached',
      exitCode: 3,
    });
    expect(
      describeApiError(new ApiError(422, 'MIGRATION_DESTINATION_UNAVAILABLE', undefined)),
    ).toMatchObject({ code: 'destination_unavailable', exitCode: 6 });
    expect(
      describeApiError(new ApiError(409, 'MIGRATION_DOMAIN_UNAVAILABLE', undefined)),
    ).toMatchObject({
      code: 'domain_unavailable',
      exitCode: 6,
    });
    expect(describeApiError(new ApiError(403, 'KEY_BOUND_TO_MIGRATION', undefined))).toMatchObject({
      code: 'key_bound_to_migration',
      exitCode: 4,
    });
  });
});

describe('usage errors', () => {
  it('unknown command, unknown option, wrong option, missing argument', async () => {
    expect((await cli(['frobnicate'])).code).toBe(2);
    expect((await cli(['whoami', '--bogus'])).code).toBe(2);
    expect((await cli(['servers', 'list', '--watch'])).code).toBe(2);
    expect((await cli(['servers', 'show'])).code).toBe(2);
    expect((await cli(['migrate'])).code).toBe(2);
    expect((await cli(['servers', 'show', 'a', 'b'])).code).toBe(2);
    expect((await cli(['servers', 'show', '../../etc'])).code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });

  it('help and version', async () => {
    const help = await cli(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Exit codes:');
    const commandHelp = await cli(['migrate', '--help']);
    expect(commandHelp.stdout).toContain('--no-wait');
    const version = await cli(['--version']);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(resolveCommand(['help', 'migrations', 'status'])).toMatchObject({ kind: 'help' });
  });
});
