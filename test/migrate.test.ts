import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;
let backup: string;
let backupSize: number;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  backup = join(dir.path, 'cpmove-owner.tar.gz');
  const data = gzipSync(randomBytes(300), { level: 0 });
  writeFileSync(backup, data);
  backupSize = data.length;
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

const partsFor = (size: number) => Math.ceil(size / 64);

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: join(dir.path, 'config'),
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

function stateFiles(): string[] {
  try {
    return readdirSync(join(dir.path, 'config', 'uploads'));
  } catch {
    return [];
  }
}

describe('migrate happy path', () => {
  it('creates, uploads, confirms and follows to the preview', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--yes']);
    expect(result.code).toBe(0);

    const [create] = api.apiCalls('POST', /\/customer\/me\/migrations$/);
    expect(create!.body).toEqual({ sourcePanel: 'cpanel', partnerPlanId: 12, locationId: 3 });
    expect(create!.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);

    const [uploadUrl] = api.apiCalls('POST', /upload-url$/);
    expect(uploadUrl!.body).toEqual({
      sizeBytes: backupSize,
      filename: 'cpmove-owner.tar.gz',
      resume: true,
    });
    expect(api.partPuts()).toHaveLength(partsFor(backupSize));

    const [complete] = api.apiCalls('POST', /complete-upload$/);
    const parts = (complete!.body as { parts: { partNumber: number; etag: string }[] }).parts;
    expect(parts.map((p) => p.partNumber)).toEqual(
      Array.from({ length: partsFor(backupSize) }, (_, i) => i + 1),
    );
    expect(parts.every((p) => /^".+"$/.test(p.etag))).toBe(true);
    expect(api.apiCalls('POST', /confirm-upload$/)).toHaveLength(1);

    // --yes accepted the domain found in the backup.
    expect(api.apiCalls('POST', /discovery-review$/)[0]!.body).toEqual({
      primaryDomain: 'old-site.example.com',
    });
    expect(result.stdout).toContain('Your site is ready for review.');
    expect(result.stdout).toMatch(/Preview: https:\/\/.+\.preview\.example\.net\//);
    expect(result.stdout).toMatch(/bladecp migrations approve [0-9a-f-]+/);
  });

  it('sends --domain at creation and never asks for it again', async () => {
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--location',
      '3',
      '--domain',
      'new.example.com',
    ]);
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)[0]!.body).toMatchObject({
      primaryDomain: 'new.example.com',
    });
    expect(api.apiCalls('POST', /discovery-review$/)).toHaveLength(0);
  });

  it('waits for BladeCP when the engine pauses on a domain given at creation', async () => {
    api.pauseWithDomain = true;
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--location',
      '3',
      '--domain',
      'new.example.com',
    ]);
    expect(result.code).toBe(0);
    // The API refuses a review for such a migration (409); the CLI must not send one.
    expect(api.apiCalls('POST', /discovery-review$/)).toHaveLength(0);
    expect(result.stderr).toContain(
      'Domain new.example.com is confirmed. Waiting for BladeCP to continue',
    );
    expect(result.stdout).toContain('Your site is ready for review.');
  });

  it('after answering the domain, keeps waiting while the phase is still discovery_review', async () => {
    api.reviewResumeAfterPolls = 4;
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--yes']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /discovery-review$/)).toHaveLength(1);
    expect(result.stderr).toContain('Domain confirmed, waiting for BladeCP to continue');
    expect(result.stdout).not.toContain('bladecp migrations review');
  });

  it('sends the same domain again when the API could not pass it on (503 pending)', async () => {
    // The client retries a 503 three times on its own; the fourth failure
    // reaches the follow loop, which republishes on the next poll.
    api.reviewPublishFailures = 4;
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--yes']);
    expect(result.code).toBe(0);
    const reviews = api.apiCalls('POST', /discovery-review$/);
    expect(reviews.length).toBe(5);
    expect(new Set(reviews.map((r) => JSON.stringify(r.body)))).toEqual(
      new Set([JSON.stringify({ primaryDomain: 'old-site.example.com' })]),
    );
    expect(result.stderr).toContain('BladeCP saved the domain but has not passed it on yet');
  });

  it('without a terminal, --yes selects the only destination', async () => {
    const result = await cli(['migrate', backup, '--yes', '--no-wait']);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('Destination: Stack Container S (BladeCP), 20 GB, ');
    expect(result.stderr).toContain('$9.00/month');
    expect(result.stderr).toContain('Sao Paulo (BR)');
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)[0]!.body).toMatchObject({
      partnerPlanId: 12,
      locationId: 3,
    });
  });

  it('--no-wait stops after the backup is confirmed', async () => {
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--location',
      '3',
      '--no-wait',
      '--json',
    ]);
    expect(result.code).toBe(0);
    const out = parseJson(result.stdout);
    expect(out.data).toMatchObject({ phase: 'queued', nextAction: { type: 'watch' } });
    expect(api.apiCalls('POST', /discovery-review$/)).toHaveLength(0);
    expect(result.stderr).toBe('');
  });

  it('without a terminal and without --yes, stops at the domain review with exit 10', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--json']);
    expect(result.code).toBe(10);
    const out = parseJson(result.stdout);
    expect(out.ok).toBe(true);
    expect(out.data).toMatchObject({
      phase: 'discovery_review',
      nextAction: {
        type: 'review',
        command: expect.stringContaining('--domain old-site.example.com'),
      },
    });
  });

  it('asks for the destination, confirmation and domain on a terminal', async () => {
    api.destinations.push({
      partnerUuid: 'p2',
      partnerName: 'BladeCP',
      partnerPlanId: 20,
      planName: 'Edge Cloud M',
      locations: [
        { locationId: 3, name: 'Sao Paulo', countryCode: 'BR' },
        { locationId: 7, name: 'Miami', countryCode: 'US' },
      ],
    });
    // Choose option 3 (Edge Cloud M in Miami), confirm with Enter, accept the
    // found domain, then decide later at the approval question.
    const result = await cli(['migrate', backup], { tty: true, answers: ['3', '', '', 'd'] });
    expect(result.code).toBe(0);
    expect(result.prompts[0]).toContain('Where should the site go? (1-3)');
    expect(result.prompts[1]).toContain('Start the migration?');
    expect(result.prompts[1]).toContain('cpmove-owner.tar.gz');
    expect(result.prompts[2]).toContain('[old-site.example.com]');
    expect(result.prompts[3]).toContain('Approve the migration?');
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)[0]!.body).toMatchObject({
      partnerPlanId: 20,
      locationId: 7,
    });
    // Deciding later never approves.
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(0);
    expect(result.stdout).toMatch(/bladecp migrations approve [0-9a-f-]+/);
  });

  it('on a terminal, the key "a" approves and the migration is followed to the end', async () => {
    api.phaseScript = [...api.phaseScript, 'syncing', 'cutover_pending'];
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3'], {
      tty: true,
      answers: ['', '', 'a'],
    });
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(1);
    expect(result.stdout).toContain('Migration complete. Your site is ready on BladeCP.');
  });

  it('--yes on a terminal never asks to approve and never approves', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--yes'], {
      tty: true,
    });
    expect(result.code).toBe(0);
    expect(result.prompts).toEqual([]);
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(0);
  });

  it('declining the confirmation changes nothing', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3'], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Nothing was changed.');
    expect(api.apiCalls('POST')).toHaveLength(0);
  });

  it('without a terminal and without --yes, never picks a destination, even the only one', async () => {
    const result = await cli(['migrate', backup, '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'destination_required' });
    expect(api.requests).toHaveLength(0);
  });

  it('several destinations without a terminal need --plan and --location, even with --yes', async () => {
    api.destinations.push({ ...api.destinations[0]!, partnerPlanId: 99 });
    const result = await cli(['migrate', backup, '--yes', '--json']);
    expect(result.code).toBe(2);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({ code: 'destination_required' });
    expect(String(error.hint)).toContain('bladecp destinations list');
    expect(api.apiCalls('POST')).toHaveLength(0);
  });

  it('a destination the account does not offer is refused (422, exit 6)', async () => {
    const result = await cli(['migrate', backup, '--plan', '99', '--location', '3', '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'destination_unavailable',
      apiCode: 'MIGRATION_DESTINATION_UNAVAILABLE',
      status: 422,
    });
    expect(api.apiCalls('POST', /upload-url$/)).toHaveLength(0);
  });

  it('reports a failed migration with exit 9 and the retry command', async () => {
    api.phaseScript = ['parsing', 'failed'];
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--json']);
    expect(result.code).toBe(9);
    const out = parseJson(result.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toMatchObject({ code: 'migration_failed', exitCode: 9 });
    expect(out.data).toMatchObject({ phase: 'failed', nextAction: { type: 'retry' } });
    expect(stateFiles()).toHaveLength(0);
  });

  it('an already approved migration ends as complete with how to point the domain', async () => {
    api.phaseScript = ['parsing', 'cutover_pending'];
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--json']);
    expect(result.code).toBe(0);
    const out = parseJson(result.stdout);
    expect(out.ok).toBe(true);
    expect(out.error).toBeUndefined();
    expect(out.data).toMatchObject({
      phase: 'cutover_pending',
      nextAction: null,
      domainPointing: { optional: true, nameservers: [], aRecord: '203.0.113.10' },
    });
  });

  it('domainPointing is null while the migration is not complete', async () => {
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--location',
      '3',
      '--yes',
      '--json',
    ]);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({
      phase: 'awaiting_approval',
      domainPointing: null,
    });
  });

  it('COMMERCE_RESTRICTED at creation (exit 4)', async () => {
    api.fail({
      method: 'POST',
      path: /\/customer\/me\/migrations$/,
      status: 403,
      body: { error: true, code: 'COMMERCE_RESTRICTED' },
    });
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--json']);
    expect(result.code).toBe(4);
    expect(parseJson(result.stdout).error?.code).toBe('commerce_restricted');
  });
});

describe('backup validation', () => {
  it('refuses a missing file, an empty file and a non gzip file', async () => {
    expect(
      (await cli(['migrate', join(dir.path, 'missing.tar.gz'), '--plan', '1', '--location', '1']))
        .code,
    ).toBe(2);
    const empty = join(dir.path, 'empty.tar.gz');
    writeFileSync(empty, '');
    expect((await cli(['migrate', empty, '--plan', '1', '--location', '1'])).code).toBe(2);
    const text = join(dir.path, 'notes.tar.gz');
    writeFileSync(text, 'hello world');
    const result = await cli(['migrate', text, '--plan', '1', '--location', '1']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('This is not a .tar.gz backup');
    expect(api.requests).toHaveLength(0);
  });

  it('needs --plan and --location together and as numbers', async () => {
    expect((await cli(['migrate', backup, '--plan', '12'])).code).toBe(2);
    expect((await cli(['migrate', backup, '--plan', 'abc', '--location', '3'])).code).toBe(2);
    expect(
      (await cli(['migrate', backup, '--plan', '12', '--location', '3', '--domain', 'bad domain']))
        .code,
    ).toBe(2);
    expect(api.requests).toHaveLength(0);
  });
});

describe('upload resilience', () => {
  it('retries a part that fails with 5xx, with backoff', async () => {
    api.partFailures.set(2, [500, 503]);
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(result.code).toBe(0);
    expect(api.partPuts().length).toBe(partsFor(backupSize) + 2);
    // Exponential backoff (10 ms, 20 ms) with jitter between 50% and 100%.
    expect(result.sleeps).toEqual([8, 15]);
    expect(result.stderr).toContain('Part 2 failed, trying again');
  });

  it('renews expired part URLs through the API', async () => {
    api.partFailures.set(1, [403]);
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /upload-url$/)).toHaveLength(2);
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)).toHaveLength(1);
  });

  it('a rerun resumes the same migration and only sends the missing parts', async () => {
    // Part 3 keeps failing: the first run gives up after its attempts.
    api.partFailures.set(3, [500, 500, 500]);
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'], {
      upload: { maxAttempts: 3, concurrency: 1 },
    });
    expect(first.code).toBe(8);
    expect(first.stderr).toContain('Run the same command again to continue');
    expect(stateFiles()).toHaveLength(1);
    const state = JSON.parse(
      readFileSync(join(dir.path, 'config', 'uploads', stateFiles()[0]!), 'utf8'),
    );
    expect(state.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2]);
    expect(JSON.stringify(state)).not.toContain(LIVE_KEY);

    const putsBefore = api.partPuts().length;
    const second = await cli(['migrate', backup, '--no-wait']);
    expect(second.code).toBe(0);
    expect(second.stderr).toContain('Continuing migration');
    expect(second.stderr).toContain(`Resuming the upload: 2 of ${partsFor(backupSize)} parts`);
    // One create only, reused upload, and only parts 3.. were sent again.
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)).toHaveLength(1);
    expect(api.partPuts().length - putsBefore).toBe(partsFor(backupSize) - 2);
    expect(
      api.apiCalls('POST', /upload-url$/).every((r) => (r.body as { resume: boolean }).resume),
    ).toBe(true);
  });

  it('starts the parts over when the API opened a new upload', async () => {
    api.supportsResume = false;
    api.partFailures.set(3, [500, 500]);
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'], {
      upload: { maxAttempts: 2, concurrency: 1 },
    });
    expect(first.code).toBe(8);
    const putsBefore = api.partPuts().length;
    const second = await cli(['migrate', backup, '--no-wait']);
    expect(second.code).toBe(0);
    expect(api.partPuts().length - putsBefore).toBe(partsFor(backupSize));
  });

  it('a rerun after the backup was confirmed just follows the migration', async () => {
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(first.code).toBe(0);
    const putsBefore = api.partPuts().length;
    const second = await cli(['migrate', backup, '--yes']);
    expect(second.code).toBe(0);
    expect(api.partPuts().length).toBe(putsBefore);
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)).toHaveLength(1);
    expect(second.stdout).toContain('Your site is ready for review.');
  });

  it('a rerun after the migration failed starts a new one', async () => {
    api.phaseScript = ['parsing', 'failed'];
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(first.code).toBe(0);
    // Move the first migration to failed.
    for (const m of api.migrations.values()) m.phase = 'failed';
    api.phaseScript = ['parsing', 'awaiting_approval'];
    const second = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(second.code).toBe(0);
    expect(second.stderr).toContain('ended as "Failed"');
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)).toHaveLength(2);
  });

  it('skips the upload when the API already holds the whole backup (backupReady)', async () => {
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(first.code).toBe(0);
    // Simulate a run whose complete-upload answer was lost: the API has the
    // backup, the local state does not know it, and nothing was confirmed.
    const [m] = [...api.migrations.values()];
    m!.phase = 'uploading';
    const file = join(dir.path, 'config', 'uploads', stateFiles()[0]!);
    const state = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...state, uploadCompleted: false, confirmed: false }));
    const putsBefore = api.partPuts().length;
    const second = await cli(['migrate', backup, '--no-wait']);
    expect(second.code).toBe(0);
    expect(api.partPuts().length).toBe(putsBefore);
    expect(api.apiCalls('POST', /confirm-upload$/)).toHaveLength(2);
  });

  it('a lost create response is recovered with the same idempotency key', async () => {
    api.fail({ method: 'POST', path: /\/customer\/me\/migrations$/, status: 502 });
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(result.code).toBe(0);
    const creates = api.apiCalls('POST', /\/customer\/me\/migrations$/);
    expect(creates).toHaveLength(2);
    expect(creates[0]!.headers['idempotency-key']).toBe(creates[1]!.headers['idempotency-key']);
    expect(api.migrations.size).toBe(1);
  });
});
