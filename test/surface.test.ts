import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMMANDS, OPTION_HELP } from '../src/args.js';
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

describe('help for every command', () => {
  for (const spec of COMMANDS) {
    const path = spec.path.join(' ');
    it(`"${path} --help" and "help ${path}" print the same usage and options`, async () => {
      const flag = await cli([...spec.path, '--help']);
      const word = await cli(['help', ...spec.path]);
      expect(flag.code).toBe(0);
      expect(word.code).toBe(0);
      expect(flag.stdout).toBe(word.stdout);
      expect(flag.stdout).toContain(spec.usage);
      for (const option of spec.options) expect(flag.stdout).toContain(OPTION_HELP[option].syntax);
      // Help never needs the API.
      expect(api.requests).toHaveLength(0);
    });
  }

  it('the global help lists every command and the exit codes', async () => {
    const result = await cli(['--help']);
    expect(result.code).toBe(0);
    for (const spec of COMMANDS) expect(result.stdout).toContain(spec.path.join(' '));
    expect(result.stdout).toContain('130 interrupted');
  });

  it('--version, -v and --version --json', async () => {
    const long = await cli(['--version']);
    const short = await cli(['-v']);
    const json = await cli(['--version', '--json']);
    expect(long.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(short.stdout).toBe(long.stdout);
    expect(parseJson(json.stdout)).toEqual({ ok: true, data: { version: long.stdout.trim() } });
  });
});

describe('invalid invocations are usage errors (exit 2)', () => {
  const cases: [string, string[], RegExp][] = [
    ['unknown command', ['foo'], /Unknown command "foo"/],
    ['unknown subcommand', ['servers', 'foo'], /Unknown command "servers foo"/],
    ['unknown option', ['whoami', '--bogus'], /Unknown option --bogus/],
    ['option without its value', ['servers', 'show', '--lang'], /--lang needs a value/],
    ['option of another command', ['whoami', '--yes'], /does not apply to "bladecp whoami"/],
    ['missing argument', ['servers', 'show'], /Missing argument <uuid>/],
    ['extra argument', ['whoami', 'extra'], /Unexpected argument "extra"/],
    ['path instead of an ID', ['servers', 'show', '../../etc/passwd'], /does not look like/],
    ['review without --domain', ['migrations', 'review', 'mig-0000-0001'], /Missing option/],
    ['currency that is not a code', ['destinations', '--currency', 'US'], /Invalid currency/],
    ['plain HTTP outside this computer', ['whoami', '--api-url', 'http://example.com'], /HTTP/],
    ['API address with credentials', ['whoami', '--api-url', 'https://u:p@example.com'], /Invalid/],
  ];
  for (const [name, argv, message] of cases) {
    it(name, async () => {
      const human = await cli(argv);
      expect(human.code).toBe(2);
      expect(human.stderr).toMatch(message);
      expect(human.stdout).toBe('');

      const json = await cli([...argv, '--json']);
      expect(json.code).toBe(2);
      expect(json.stderr).toBe('');
      const envelope = parseJson(json.stdout);
      expect(envelope.ok).toBe(false);
      expect(envelope.error?.exitCode).toBe(2);
      // Nothing reaches the API on a usage error.
      expect(api.requests).toHaveLength(0);
    });
  }

  it('a value after -- is a positional argument, never an option', async () => {
    const result = await cli(['servers', 'show', '--', '-abcdefgh']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('does not look like a BladeCP ID');
  });
});

describe('group shortcuts', () => {
  it('a group alone runs its list command', async () => {
    for (const group of ['servers', 'destinations', 'migrations']) {
      const alone = await cli([group]);
      const list = await cli([group, 'list']);
      expect(alone.code).toBe(0);
      expect(alone.stdout).toBe(list.stdout);
    }
  });
});
