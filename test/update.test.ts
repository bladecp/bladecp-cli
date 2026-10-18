// Keeping the CLI current: the daily check (registry simulated), the quiet
// notice, `bladecp update`, the optional automatic update and the minimum
// version the API can ask for.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIN_VERSION_HEADER } from '../src/api.js';
import { cachePath, checkIsDue, registryUrl, runUpdateCheck } from '../src/update/check.js';
import { detectInstall } from '../src/update/install.js';
import { changesBetween } from '../src/update/notes.js';
import { cliVersion, isNewerVersion } from '../src/version.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;
let registryCalls: { url: string; accept: string | null }[];

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  registryCalls = [];
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

const configDir = () => join(dir.path, 'config');

/** The npm registry and GitHub, simulated; the rest goes to the mock API. */
function network(latest = '9.9.9', registryDown = false): RunOptions['fetch'] {
  return async (input, init) => {
    if (input.startsWith('https://registry.npmjs.org/')) {
      registryCalls.push({ url: input, accept: new Headers(init.headers).get('accept') });
      if (registryDown) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ 'dist-tags': { latest } }), { status: 200 });
    }
    if (input.startsWith('https://raw.githubusercontent.com/')) {
      return new Response(
        `## [${latest}] - 2026-11-20\n\n### Added\n\n- A faster upload.\n\n## [0.2.0] - 2026-10-17\n`,
        { status: 200 },
      );
    }
    return fetch(input, init);
  };
}

/** An interactive terminal with colors, where the notice may appear. */
const terminal = (env: Record<string, string | undefined> = {}): Partial<RunOptions> => ({
  tty: true,
  env: { BLADECP_API_KEY: LIVE_KEY, NO_COLOR: undefined, COLORTERM: 'truecolor', ...env },
});

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: configDir(),
    apiUrl: api.baseUrl,
    fetch: network(),
    ...extra,
    env: { BLADECP_API_KEY: LIVE_KEY, ...extra.env },
  });

function seedCache(latest: string | null, checkedAt = new Date().toISOString()): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(cachePath(configDir()), JSON.stringify({ checkedAt, latest }));
}

describe('versions', () => {
  it('compares semantic versions', () => {
    expect(isNewerVersion('0.3.0', '0.2.0')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.2.0', '0.10.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
    expect(isNewerVersion('1.0.0-rc.2', '1.0.0-rc.10')).toBe(false);
    expect(isNewerVersion('garbage', '0.1.0')).toBe(false);
  });

  it('reads what changed between two versions from the CHANGELOG', () => {
    const changelog = [
      '## [Unreleased]',
      '## [0.4.0] - 2026-12-01',
      '### Added',
      '- `bladecp foo` lists **things**. More words after.',
      '## [0.3.0] - 2026-11-01',
      '- A fix in the upload.',
      '## [0.2.0] - 2026-10-17',
      '- Old news.',
    ].join('\n');
    expect(changesBetween(changelog, '0.2.0', '0.4.0')).toEqual([
      'bladecp foo lists things.',
      'A fix in the upload.',
    ]);
  });
});

describe('the daily check and the notice', () => {
  it('a terminal run starts one check in the background, at most once a day', async () => {
    const first = await cli(['whoami'], { ...terminal(), runUpdateCheck: true });
    expect(first.code).toBe(0);
    expect(first.updateChecks).toHaveLength(1);
    expect(registryCalls).toHaveLength(1);
    // Only what npm itself asks for: the abbreviated document.
    expect(registryCalls[0]!.accept).toBe('application/vnd.npm.install-v1+json');
    const cache = JSON.parse(readFileSync(cachePath(configDir()), 'utf8'));
    expect(cache.latest).toBe('9.9.9');
    if (process.platform !== 'win32') {
      expect(statSync(cachePath(configDir())).mode & 0o777).toBe(0o600);
    }
    // The notice shows from the next run on, and no new check is started.
    const second = await cli(['whoami'], { ...terminal(), runUpdateCheck: true });
    expect(second.updateChecks).toHaveLength(0);
    expect(second.stderr).toContain(`New version 9.9.9 available (you have ${cliVersion()})`);
    expect(second.stderr).toContain('bladecp update');
  });

  it('checks again after 24 hours', () => {
    const now = Date.now();
    expect(checkIsDue(null, now)).toBe(true);
    expect(
      checkIsDue({ checkedAt: new Date(now - 23 * 3600_000).toISOString(), latest: null }, now),
    ).toBe(false);
    expect(
      checkIsDue({ checkedAt: new Date(now - 25 * 3600_000).toISOString(), latest: null }, now),
    ).toBe(true);
  });

  it('without a network the check fails silently', async () => {
    const job = { configDir: configDir(), registryUrl: registryUrl({}), current: '0.2.0' };
    await runUpdateCheck(job, network('9.9.9', true)!, Date.now());
    const cache = JSON.parse(readFileSync(cachePath(configDir()), 'utf8'));
    expect(cache.latest).toBeNull();
    const result = await cli(['whoami'], { ...terminal(), fetch: network('9.9.9', true) });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('New version');
  });

  it('honors a custom npm registry', () => {
    expect(registryUrl({ npm_config_registry: 'https://npm.example.com/' })).toBe(
      'https://npm.example.com/@bladecp%2fcli',
    );
  });

  it('never in --json, a pipe, CI, without color or when turned off', async () => {
    seedCache('9.9.9');
    const cases: [string, Partial<RunOptions>, string[]][] = [
      ['json', terminal(), ['whoami', '--json']],
      ['pipe', { env: { BLADECP_API_KEY: LIVE_KEY, NO_COLOR: undefined } }, ['whoami']],
      ['ci', terminal({ CI: 'true' }), ['whoami']],
      ['no color', terminal({ NO_COLOR: '1' }), ['whoami']],
      ['env off', terminal({ BLADECP_NO_UPDATE_CHECK: '1' }), ['whoami']],
      ['notifier off', terminal({ NO_UPDATE_NOTIFIER: '1' }), ['whoami']],
    ];
    for (const [name, extra, argv] of cases) {
      const result = await cli(argv, extra);
      expect(result.stderr, name).not.toContain('9.9.9');
      expect(result.stdout, name).not.toContain('9.9.9');
      expect(result.updateChecks, name).toHaveLength(0);
    }
    const off = await cli(['config', 'set', 'update-check', 'off']);
    expect(off.code).toBe(0);
    expect((await cli(['whoami'], terminal())).stderr).not.toContain('9.9.9');
  });
});

describe('how the CLI was installed', () => {
  const cases: [string, string, string | null][] = [
    [
      '/usr/local/lib/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'npm install --global @bladecp/cli@latest',
    ],
    [
      'C:/Users/a/AppData/Roaming/npm/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'npm install --global @bladecp/cli@latest',
    ],
    [
      '/Users/a/.local/share/fnm/node-versions/v24/installation/lib/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'npm install --global @bladecp/cli@latest',
    ],
    [
      '/Users/a/Library/pnpm/global/5/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'pnpm add --global @bladecp/cli@latest',
    ],
    [
      '/Users/a/.config/yarn/global/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'yarn global add @bladecp/cli@latest',
    ],
    [
      '/Users/a/.bun/install/global/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'bun add --global @bladecp/cli@latest',
    ],
    [
      '/Users/a/.volta/tools/image/packages/@bladecp/cli/lib/node_modules/@bladecp/cli/dist/bin.js',
      'global',
      'volta install @bladecp/cli@latest',
    ],
    ['/Users/a/.npm/_npx/1a2b3c/node_modules/@bladecp/cli/dist/bin.js', 'temporary', null],
    [
      '/Users/a/Library/Caches/pnpm/dlx/abc/node_modules/@bladecp/cli/dist/bin.js',
      'temporary',
      null,
    ],
    ['/Users/a/site/node_modules/@bladecp/cli/dist/bin.js', 'project', null],
    ['/Users/a/src/bladecp-cli/dist/bin.js', 'unknown', null],
  ];
  for (const [path, kind, command] of cases) {
    it(`${kind}: ${path}`, () => {
      const install = detectInstall(path);
      expect(install.kind).toBe(kind);
      expect(
        install.command ? [install.command.program, ...install.command.args].join(' ') : null,
      ).toBe(command);
    });
  }
});

describe('bladecp update', () => {
  it('--check --json returns the versions and installs nothing', async () => {
    const result = await cli(['update', '--check', '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toEqual({
      current: cliVersion(),
      latest: '9.9.9',
      updateAvailable: true,
      install: 'global',
      manager: 'npm',
      command: 'npm install --global @bladecp/cli@latest',
      updated: false,
    });
    expect(result.processes).toEqual([]);
  });

  it('asks on a terminal, shows what changed and runs the right command', async () => {
    const result = await cli(['update'], { ...terminal(), answers: [''] });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('A faster upload.');
    expect(result.prompts[0]).toContain('Update to 9.9.9?');
    expect(result.processes).toEqual(['npm install --global @bladecp/cli@latest']);
    expect(result.stdout).toContain('Updated to 9.9.9.');
  });

  it('pnpm, yarn and bun installs are updated with their own manager', async () => {
    const result = await cli(['update', '--yes', '--json'], {
      binPath: '/Users/a/Library/pnpm/global/5/node_modules/@bladecp/cli/dist/bin.js',
    });
    expect(result.code).toBe(0);
    expect(result.processes).toEqual(['pnpm add --global @bladecp/cli@latest']);
    expect(parseJson(result.stdout).data).toMatchObject({ updated: true, manager: 'pnpm' });
  });

  it('without a terminal it needs --yes', async () => {
    const result = await cli(['update', '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'confirmation_required' });
    expect(result.processes).toEqual([]);
  });

  it('a permission error is explained without sending the person to sudo', async () => {
    const result = await cli(['update', '--yes', '--json'], {
      runProcess: () => ({
        code: 243,
        output: 'npm error code EACCES\nnpm error path /usr/local/lib/node_modules/@bladecp\n',
      }),
    });
    expect(result.code).toBe(1);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({ code: 'update_failed', exitCode: 1 });
    expect(error.message).toContain('/usr/local/lib/node_modules/@bladecp');
    expect(error.message).toContain('permission denied');
    expect(error.hint).toContain('npm config set prefix ~/.npm-global');
    expect(error.hint).toContain('Do not use sudo');
  });

  it('a copy run by npx has nothing to update', async () => {
    const result = await cli(['update'], {
      binPath: '/Users/a/.npm/_npx/1a2b3c/node_modules/@bladecp/cli/dist/bin.js',
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('temporary folder');
    expect(result.processes).toEqual([]);
  });

  it('says so when the CLI is already the latest', async () => {
    const result = await cli(['update'], { fetch: network(cliVersion()) });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('You have the latest version.');
  });

  it('a registry it cannot reach is a network error (exit 8)', async () => {
    const result = await cli(['update', '--check', '--json'], { fetch: network('9.9.9', true) });
    expect(result.code).toBe(8);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'network_error' });
  });
});

describe('automatic update (off by default)', () => {
  it('off: nothing is installed on its own', async () => {
    seedCache('9.9.9');
    const result = await cli(['whoami'], terminal());
    expect(result.processes).toEqual([]);
    expect(result.reruns).toEqual([]);
  });

  it('on: updates before the command, then runs it on the new version', async () => {
    seedCache('9.9.9');
    expect((await cli(['config', 'set', 'auto-update', 'on'])).code).toBe(0);
    const result = await cli(['whoami'], terminal());
    expect(result.processes).toEqual(['npm install --global @bladecp/cli@latest']);
    expect(result.reruns).toEqual([['whoami']]);
    expect(result.stderr).toContain('Updating the BladeCP CLI');
  });

  it('on, but never in CI, with --json or after the update already ran', async () => {
    seedCache('9.9.9');
    await cli(['config', 'set', 'auto-update', 'on']);
    for (const extra of [terminal({ CI: '1' }), terminal({ BLADECP_AUTO_UPDATED: '1' })]) {
      const result = await cli(['whoami'], extra);
      expect(result.processes).toEqual([]);
    }
    const json = await cli(['whoami', '--json'], terminal());
    expect(json.processes).toEqual([]);
  });

  it('a failed automatic update runs the command on the current version', async () => {
    seedCache('9.9.9');
    await cli(['config', 'set', 'auto-update', 'on']);
    const result = await cli(['whoami'], {
      ...terminal(),
      runProcess: () => ({ code: 1, output: 'npm error network\n' }),
    });
    expect(result.code).toBe(0);
    expect(result.reruns).toEqual([]);
    expect(result.stdout).toContain('owner@example.com');
  });
});

describe('a minimum version from the API', () => {
  it('426 asks to update (exit 11, update_required)', async () => {
    const result = await cli(['whoami', '--json'], {
      fetch: async () =>
        new Response('{"error":true}', { status: 426, headers: { [MIN_VERSION_HEADER]: '9.0.0' } }),
    });
    expect(result.code).toBe(11);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'update_required',
      exitCode: 11,
      hint: 'Run "bladecp update".',
    });
    expect(String(parseJson(result.stdout).error?.message)).toContain('9.0.0');
  });

  it('the header on any answer stops an older CLI; an older minimum changes nothing', async () => {
    const answer =
      (minimum: string): RunOptions['fetch'] =>
      async (input, init) => {
        const response = await fetch(input, init);
        const headers = new Headers(response.headers);
        headers.set(MIN_VERSION_HEADER, minimum);
        return new Response(await response.text(), { status: response.status, headers });
      };
    const blocked = await cli(['whoami'], { fetch: answer('99.0.0') });
    expect(blocked.code).toBe(11);
    expect(blocked.stderr).toContain('bladecp update');
    const fine = await cli(['whoami'], { fetch: answer('0.0.1') });
    expect(fine.code).toBe(0);
  });
});
