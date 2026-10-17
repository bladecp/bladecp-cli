import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { redact } from '../src/redact.js';
import { ISSUED_KEY, LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { runCli, tempDir } from './helpers/run.js';

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

describe('redact()', () => {
  it('hides anything shaped like a key and any registered secret', () => {
    expect(redact(`key=${LIVE_KEY}`)).toBe('key=bcp_live_[redacted]');
    expect(redact('bcp_sand_abcdefgh12345678')).toBe('bcp_sand_[redacted]');
    expect(redact('token: s3cr3t-value-123', ['s3cr3t-value-123'])).toBe('token: [redacted]');
  });
});

describe('the API key never reaches the output', () => {
  it('across every command, success and failure, human and JSON', async () => {
    const backup = join(dir.path, 'site.tar.gz');
    writeFileSync(backup, gzipSync(randomBytes(200), { level: 0 }));
    api.addMigration({ uuid: 'mig-0000-0100', phase: 'awaiting_approval' });
    // The API echoes the key back in error messages (worst case).
    api.fail({
      path: /provisions$/,
      status: 500,
      body: { error: true, message: `bad key ${LIVE_KEY}` },
      times: 4,
    });
    api.fail({
      method: 'POST',
      path: /approve$/,
      status: 409,
      body: { error: true, message: `conflict for ${LIVE_KEY}` },
    });

    const env = { BLADECP_API_KEY: LIVE_KEY };
    const base = { configDir: join(dir.path, 'config'), apiUrl: api.baseUrl, env };
    const outputs: string[] = [];
    const runs: string[][] = [
      ['whoami'],
      ['whoami', '--json'],
      ['servers', 'list'],
      ['servers', 'list', '--json'],
      ['servers', 'show', '01970000-0000-7000-8000-00000000s001', '--json'],
      ['destinations', 'list'],
      ['migrations', 'list', '--json'],
      ['migrations', 'status', 'mig-0000-0100'],
      ['migrations', 'approve', 'mig-0000-0100'],
      ['migrations', 'approve', 'mig-0000-0100', '--json'],
      ['migrate', backup, '--plan', '12', '--location', '3', '--yes'],
      ['login'],
      ['login', '--json'],
      ['logout'],
    ];
    for (const argv of runs) {
      const result = await runCli(argv, base);
      outputs.push(result.stdout, result.stderr);
    }
    // --token with the key on the command line, then an invalid value.
    for (const argv of [
      ['login', '--token', LIVE_KEY],
      ['login', '--token', LIVE_KEY, '--json'],
      ['whoami', '--token', LIVE_KEY],
    ]) {
      const result = await runCli(argv, {
        configDir: join(dir.path, 'config'),
        apiUrl: api.baseUrl,
      });
      outputs.push(result.stdout, result.stderr);
    }
    // Browser sign-in that receives a new key.
    const browser = await runCli(['login'], {
      configDir: join(dir.path, 'config2'),
      apiUrl: api.baseUrl,
      openUrl: async (url) => {
        await (await fetch(url)).text();
        return true;
      },
    });
    expect(browser.code).toBe(0);
    outputs.push(browser.stdout, browser.stderr);

    const all = outputs.join('\n');
    expect(all).not.toContain(LIVE_KEY);
    expect(all).not.toContain(ISSUED_KEY);
    expect(all).toContain('bcp_live_[redacted]');

    // Upload state files never store the key.
    const uploads = join(dir.path, 'config', 'uploads');
    for (const name of readdirSync(uploads)) {
      expect(readFileSync(join(uploads, name), 'utf8')).not.toContain(LIVE_KEY);
    }
  });
});
