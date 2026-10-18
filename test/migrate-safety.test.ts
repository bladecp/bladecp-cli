import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type PutPart, putPart } from '../src/upload/put.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;
let backup: string;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  backup = join(dir.path, 'cpmove-owner.tar.gz');
  writeFileSync(backup, gzipSync(randomBytes(640), { level: 0 }));
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

const configDir = () => join(dir.path, 'config');

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: configDir(),
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

const DESTINATION = ['--plan', '12', '--location', '3'];

/** A sparse file that starts with the gzip magic bytes. */
function sparseGzip(path: string, size: number): void {
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, Buffer.from([0x1f, 0x8b, 0x08, 0x00]), 0, 4, 0);
    ftruncateSync(fd, size);
  } finally {
    closeSync(fd);
  }
}

async function expectRefused(file: string, code: string): Promise<void> {
  const result = await cli(['migrate', file, ...DESTINATION, '--json']);
  expect(result.code).toBe(2);
  expect(parseJson(result.stdout).error?.code).toBe(code);
  // The file is checked before anything is created on BladeCP.
  expect(api.apiCalls('POST')).toHaveLength(0);
}

describe('the backup file is checked before anything is created', () => {
  it('a directory is not a file', async () => {
    const folder = join(dir.path, 'folder.tar.gz');
    mkdirSync(folder);
    await expectRefused(folder, 'not_a_file');
  });

  it('a dangling symbolic link is a missing file', async () => {
    const link = join(dir.path, 'dangling.tar.gz');
    symlinkSync(join(dir.path, 'missing.tar.gz'), link);
    await expectRefused(link, 'file_not_found');
  });

  it('a loop of symbolic links is a missing file', async () => {
    const a = join(dir.path, 'a.tar.gz');
    const b = join(dir.path, 'b.tar.gz');
    symlinkSync(b, a);
    symlinkSync(a, b);
    await expectRefused(a, 'file_not_found');
  });

  it('an unreadable file is reported as such', async (ctx) => {
    if (process.getuid?.() === 0) ctx.skip();
    chmodSync(backup, 0o000);
    try {
      await expectRefused(backup, 'file_unreadable');
    } finally {
      chmodSync(backup, 0o600);
    }
  });

  it('a file just over 50 GiB is too large; exactly 50 GiB passes the local check', async (ctx) => {
    const over = join(dir.path, 'over.tar.gz');
    const exact = join(dir.path, 'exact.tar.gz');
    try {
      sparseGzip(over, 50 * 1024 ** 3 + 1);
      sparseGzip(exact, 50 * 1024 ** 3);
    } catch {
      ctx.skip(); // file system without sparse files
    }
    await expectRefused(over, 'file_too_large');
    const result = await cli(['migrate', exact, ...DESTINATION, '--json'], {
      env: { BLADECP_API_KEY: undefined },
    });
    // Past the size check, the next stop is the missing sign-in.
    expect(parseJson(result.stdout).error?.code).toBe('not_signed_in');
  });

  it('a symbolic link to a backup is followed and named after its target', async () => {
    const link = join(dir.path, 'latest.tar.gz');
    symlinkSync(backup, link);
    const result = await cli(['migrate', link, ...DESTINATION, '--no-wait', '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({
      file: { name: 'cpmove-owner.tar.gz' },
    });
  });
});

describe('Ctrl+C during the upload', () => {
  it('pauses with exit 130, keeps private progress and the same command resumes', async () => {
    const controller = new AbortController();
    let calls = 0;
    const interrupting: PutPart = (input) => {
      calls += 1;
      if (calls === 4) controller.abort();
      return putPart(input);
    };
    const first = await cli(['migrate', backup, ...DESTINATION, '--no-wait', '--json'], {
      signal: controller.signal,
      upload: { putPart: interrupting, concurrency: 1 },
    });
    expect(first.code).toBe(130);
    expect(parseJson(first.stdout).error).toMatchObject({ code: 'interrupted', exitCode: 130 });

    const uploads = join(configDir(), 'uploads');
    const [stateName] = readdirSync(uploads);
    const statePath = join(uploads, stateName!);
    expect(statSync(uploads).mode & 0o777).toBe(0o700);
    expect(statSync(statePath).mode & 0o777).toBe(0o600);
    const saved = readFileSync(statePath, 'utf8');
    expect(saved).not.toContain('bcp_');
    expect(JSON.parse(saved).parts.length).toBeGreaterThanOrEqual(3);

    const second = await cli(['migrate', backup, ...DESTINATION, '--no-wait']);
    expect(second.code).toBe(0);
    const parts = Math.ceil(statSync(backup).size / 64);
    expect(second.stderr).toMatch(new RegExp(`Resuming the upload: \\d+ of ${parts} parts`));
    expect(api.apiCalls('POST', /\/customer\/me\/migrations$/)).toHaveLength(1);
  });

  it('a human run says the upload was paused and how to continue', async () => {
    const controller = new AbortController();
    const interrupting: PutPart = (input) => {
      controller.abort();
      return putPart(input);
    };
    const result = await cli(['migrate', backup, ...DESTINATION, '--no-wait'], {
      signal: controller.signal,
      upload: { putPart: interrupting },
    });
    expect(result.code).toBe(130);
    expect(result.stderr).toContain('Upload paused. Your progress was saved.');
    expect(result.stderr).toContain('Run the same command again to continue');
  });
});

describe('approving stays with the person', () => {
  it('migrate --yes --json and status --watch never call approve', async () => {
    api.destinations = api.destinations.slice(0, 1);
    const migrate = await cli(['migrate', backup, '--yes', '--json']);
    expect(migrate.code).toBe(0);
    const data = parseJson(migrate.stdout).data as { phase: string; migrationUuid: string };
    expect(data.phase).toBe('awaiting_approval');

    const watch = await cli(['migrations', 'status', data.migrationUuid, '--watch', '--json']);
    expect(watch.code).toBe(0);
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(0);
  });
});

describe('colors follow the terminal and the environment', () => {
  const ansi = /\u001b\[\d+m/;
  const whoami = (env: Record<string, string | undefined>, argv: string[] = []) =>
    cli(['whoami', ...argv], {
      tty: true,
      env: { BLADECP_API_KEY: LIVE_KEY, NO_COLOR: undefined, ...env },
    });

  it('a terminal gets colors by default', async () => {
    expect((await whoami({})).stdout).toMatch(ansi);
  });

  it('NO_COLOR, FORCE_COLOR=0 and TERM=dumb turn them off', async () => {
    for (const env of [{ NO_COLOR: '1' }, { FORCE_COLOR: '0' }, { TERM: 'dumb' }]) {
      expect((await whoami(env)).stdout).not.toMatch(ansi);
    }
  });

  it('--json never has colors', async () => {
    const result = await whoami({}, ['--json']);
    expect(result.stdout).not.toMatch(ansi);
    expect(parseJson(result.stdout).ok).toBe(true);
  });
});
