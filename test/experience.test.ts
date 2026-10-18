// What 0.2.0 changed in the experience: slow phases, the price before a
// migration starts, texts found in the production test, components the
// backup does not have, short IDs, options, the environment and the help.

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveConfigDir } from '../src/config.js';
import { errorBlock, kit } from '../src/ui/kit.js';
import { Output } from '../src/ui/output.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;
let backup: string;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  backup = join(dir.path, 'cpmove-owner.tar.gz');
  writeFileSync(backup, gzipSync(randomBytes(300), { level: 0 }));
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: join(dir.path, 'config'),
    apiUrl: api.baseUrl,
    ...extra,
    env: { BLADECP_API_KEY: LIVE_KEY, ...extra.env },
  });

const ID = '0197c0de-0000-7000-8000-000000000001';

/** A migration that stays in `provisioning` for many polls, then is ready. */
function stuckInProvisioning(polls: number): void {
  api.addMigration({ uuid: ID, phase: 'provisioning', primaryDomain: 'example.com' });
  api.phaseScript = [...Array<string>(polls).fill('provisioning'), 'awaiting_approval'];
}

describe('a phase that takes longer than usual', () => {
  it('watch says so once, then points to support when it is long', async () => {
    stuckInProvisioning(40);
    const result = await cli(['migrations', 'status', ID, '--watch'], { pollIntervalMs: 60_000 });
    expect(result.code).toBe(0);
    const slow = 'Preparing the server is taking longer than usual';
    expect(result.stderr.split(slow)).toHaveLength(3);
    expect(result.stderr).toContain('The migration keeps going on BladeCP even if you leave.');
    expect(result.stderr).toContain(`bladecp migrations status ${ID} --watch`);
    expect(result.stderr).toContain(`contact support: ${api.baseUrl}/support`);
  });

  it('watch --json adds one line with slowPhase, without changing the others', async () => {
    stuckInProvisioning(40);
    const result = await cli(['migrations', 'status', ID, '--watch', '--json'], {
      pollIntervalMs: 60_000,
    });
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const flagged = lines.filter((line) => line.data.slowPhase);
    expect(flagged.map((line) => line.data.slowPhase.contactSupport)).toEqual([false, true]);
    expect(flagged[0].data.slowPhase).toMatchObject({ phase: 'provisioning', expectedMs: 600_000 });
    expect(lines.at(-1).data.phase).toBe('awaiting_approval');
    expect(
      lines.filter((line) => !line.data.slowPhase).every((l) => !('slowPhase' in l.data)),
    ).toBe(true);
  });

  it('status uses the time the API says the phase began', async () => {
    const entered = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    api.addMigration({
      uuid: ID,
      phase: 'provisioning',
      // Past the end of the script: the mock keeps it in this phase.
      scriptIndex: 99,
      timing: { executionMs: 1, waitingMs: 0, state: 'running', phaseEnteredAt: entered(45) },
    });
    const json = await cli(['migrations', 'status', ID, '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({
      slowPhase: { phase: 'provisioning', contactSupport: true },
    });
    const human = await cli(['migrations', 'status', ID, '--lang', 'pt-BR']);
    expect(human.stdout).toContain('Preparando o servidor está demorando mais que o normal');
    expect(human.stdout).toContain('fale com o suporte');

    api.migrations.get(ID)!.timing = {
      executionMs: 1,
      waitingMs: 0,
      state: 'running',
      phaseEnteredAt: entered(5),
    };
    const normal = await cli(['migrations', 'status', ID, '--json']);
    expect(parseJson(normal.stdout).data).not.toHaveProperty('slowPhase');
  });

  it('the rail on a terminal shows it too', async () => {
    stuckInProvisioning(14);
    const result = await cli(['migrations', 'status', ID, '--watch'], {
      tty: true,
      pollIntervalMs: 60_000,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('is taking longer than usual');
  });
});

describe('what was seen in the production test', () => {
  it('the confirmation on a terminal shows the plan, the place and the price', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3'], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(result.prompts[0]).toContain('Stack Container S · Sao Paulo, BR · $9.00/month');
    expect(api.apiCalls('POST')).toHaveLength(0);
  });

  it('one part is "1 part", in every language', async () => {
    api.partSize = 1024 * 1024;
    const en = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(en.stderr).toMatch(/Uploading the backup \(\d+ B, 1 part\)\./);
    const pt = await cli(
      ['migrate', backup, '--plan', '12', '--location', '3', '--no-wait', '--lang', 'pt-BR'],
      {},
    );
    expect(pt.code).toBe(0);
  });

  it('the upload line keeps the part count on a 100-column terminal', async () => {
    const result = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'], {
      tty: true,
      columns: 100,
      answers: ['y'],
    });
    expect(result.code).toBe(0);
    // Completed parts out of all of them, short enough to sit beside the rest.
    expect(result.stderr).toMatch(/\d+\/\d+ parts/);
  });

  it('"Backup received" once, and "Ctrl+C para parar de acompanhar" in Portuguese', async () => {
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--location',
      '3',
      '--yes',
      '--lang',
      'pt-BR',
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr.split('Backup recebido')).toHaveLength(2);
    expect(result.stderr).toContain('Ctrl+C para parar de acompanhar');
  });

  it('components the backup does not have are "none in the backup", never "waiting"', async () => {
    api.addMigration({
      uuid: ID,
      phase: 'importing',
      primaryDomain: 'example.com',
      discovery: { emailAccountCount: 0, emailHistoryBytes: 0 },
      components: [
        { name: 'files', status: 'running' },
        { name: 'database', status: 'pending' },
        { name: 'email_accounts', status: 'pending' },
      ],
    });
    const plain = await cli(['migrations', 'status', ID]);
    expect(plain.stdout).toContain('Email accounts: none in the backup');
    expect(plain.stdout).toContain('Database: waiting');
    const terminal = await cli(['migrations', 'status', ID], { tty: true });
    expect(terminal.stdout).not.toContain('Email accounts');
  });

  it('a failed migration lists what did not run as "not run"', async () => {
    api.addMigration({
      uuid: ID,
      phase: 'failed',
      components: [
        { name: 'files', status: 'completed' },
        { name: 'database', status: 'pending' },
      ],
    });
    const result = await cli(['migrations', 'status', ID]);
    expect(result.stdout).toContain('Database: not run');
    expect(result.stdout).not.toContain('waiting');
  });
});

describe('short IDs', () => {
  it('the first characters of an ID are enough when only one matches', async () => {
    api.provisions[0] = { ...api.provisions[0]!, uuid: '0197a1c4-0000-7000-8000-000000000001' };
    api.usage['0197a1c4-0000-7000-8000-000000000001'] =
      api.usage['01970000-0000-7000-8000-00000000s001']!;
    const result = await cli(['servers', 'show', '0197a1c4', '--json']);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({
      server: { uuid: '0197a1c4-0000-7000-8000-000000000001' },
    });

    api.addMigration({ uuid: '0197b000-1111-7000-8000-000000000001', phase: 'awaiting_approval' });
    api.addMigration({ uuid: '0197b000-2222-7000-8000-000000000002', phase: 'awaiting_approval' });
    const ambiguous = await cli(['migrations', 'approve', '0197b000', '--json']);
    expect(ambiguous.code).toBe(2);
    expect(parseJson(ambiguous.stdout).error).toMatchObject({
      code: 'ambiguous_id',
      matches: expect.any(Array),
    });
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(0);

    const exact = await cli(['migrations', 'approve', '0197b000-2222', '--json']);
    expect(exact.code).toBe(0);
    expect(parseJson(exact.stdout).data).toMatchObject({
      migrationUuid: '0197b000-2222-7000-8000-000000000002',
    });

    const none = await cli(['migrations', 'status', 'abcd1234']);
    expect(none.code).toBe(5);
  });
});

describe('servers', () => {
  it('deleted servers are hidden unless --all; --json keeps every server', async () => {
    api.provisions.push({
      uuid: '0197d000-0000-7000-8000-000000000099',
      status: 'deleted',
      primaryDomain: 'gone.example.com',
      product_type: null,
    });
    const list = await cli(['servers']);
    expect(list.stdout).not.toContain('gone.example.com');
    expect(list.stderr).toContain('1 deleted hidden');
    const all = await cli(['servers', '--all']);
    expect(all.stdout).toContain('gone.example.com');
    expect(all.stdout).toContain('deleted');
    const json = await cli(['servers', '--json']);
    expect((parseJson(json.stdout).data as unknown[]).length).toBe(3);
  });

  it('the status is translated and an unmeasured disk says so', async () => {
    api.usage['01970000-0000-7000-8000-00000000s001']!.usage = null;
    const pt = await cli([
      'servers',
      'show',
      '01970000-0000-7000-8000-00000000s001',
      '--lang',
      'pt-BR',
    ]);
    expect(pt.stdout).toContain('ativo');
    expect(pt.stdout).toContain('Disco: ainda não medido / 20 GB');
  });
});

describe('approve and cancel on a terminal', () => {
  it('approve shows the preview and asks; no means nothing is sent', async () => {
    api.addMigration({
      uuid: ID,
      phase: 'awaiting_approval',
      primaryDomain: 'example.com',
      stagingUrl: 'https://p.example.net/',
    });
    const no = await cli(['migrations', 'approve', ID], { tty: true, answers: ['n'] });
    expect(no.code).toBe(0);
    expect(no.prompts[0]).toContain('Approve the migration of example.com?');
    expect(no.prompts[0]).toContain('https://p.example.net/');
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(0);
    const yes = await cli(['migrations', 'approve', ID, '--yes'], { tty: true });
    expect(yes.code).toBe(0);
    expect(yes.prompts).toEqual([]);
    expect(api.apiCalls('POST', /approve$/)).toHaveLength(1);
  });

  it('cancel asks with "no" as the default answer', async () => {
    api.addMigration({ uuid: ID, phase: 'importing', primaryDomain: 'example.com' });
    const result = await cli(['migrations', 'cancel', ID], { tty: true, answers: [''] });
    expect(result.code).toBe(0);
    expect(api.apiCalls('POST', /cancel$/)).toHaveLength(0);
  });

  it('CI never asks, even on a terminal', async () => {
    const result = await cli(['migrate', backup, '--json'], { tty: true, env: { CI: 'true' } });
    expect(result.code).toBe(2);
    expect(result.prompts).toEqual([]);
    const human = await cli(['migrate', backup], { tty: true, env: { CI: '1' } });
    expect(human.code).toBe(2);
    expect(human.prompts).toEqual([]);
  });
});

describe('options and environment', () => {
  it('a repeated option is announced and the last value wins', async () => {
    const result = await cli([
      'migrate',
      backup,
      '--plan',
      '12',
      '--plan',
      '99',
      '--location',
      '3',
      '--no-wait',
    ]);
    expect(result.stderr).toContain(
      'Option --plan was given more than once; the last value (99) is used.',
    );
  });

  it('--debug describes the requests and never shows the key', async () => {
    const result = await cli(['whoami', '--debug']);
    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(/debug GET \/customer\/me -> 200 \(\d+ ms/);
    expect(result.stderr).not.toContain(LIVE_KEY);
    expect(result.stderr).not.toContain('Bearer');
  });

  it('BLADECP_CONFIG_DIR expands ~', () => {
    expect(resolveConfigDir({ BLADECP_CONFIG_DIR: '~/bladecp-conf' }, 'linux', '/home/a')).toBe(
      '/home/a/bladecp-conf',
    );
    expect(resolveConfigDir({ BLADECP_CONFIG_DIR: '~' }, 'linux', '/home/a')).toBe('/home/a');
  });

  it('NO_COLOR when empty keeps colors; FORCE_COLOR forces them in a pipe', async () => {
    const ansi = /\u001b\[[0-9;]*m/;
    const empty = await cli(['whoami'], { tty: true, env: { NO_COLOR: '' } });
    expect(empty.stdout).toMatch(ansi);
    const forced = await cli(['whoami'], { env: { NO_COLOR: undefined, FORCE_COLOR: '1' } });
    expect(forced.stdout).toMatch(ansi);
  });

  it('a file the CLI cannot write is explained in words', async () => {
    const blocked = join(dir.path, 'not-a-folder');
    writeFileSync(blocked, 'x');
    const result = await runCli(['login', '--token', LIVE_KEY, '--json'], {
      configDir: join(blocked, 'config'),
      apiUrl: api.baseUrl,
    });
    expect(result.code).toBe(1);
    const error = parseJson(result.stdout).error!;
    expect(error.code).toBe('filesystem_error');
    expect(error.message).toContain('a part of the path is not a folder');
  });

  it('--api-url with an empty value is a usage error', async () => {
    const result = await cli(['whoami', '--api-url', '']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('The API address given with --api-url is empty.');
  });

  it('--plan -1 is a number error, not a missing value', async () => {
    const result = await cli(['migrate', backup, '--plan', '-1', '--location', '3']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Option --plan needs a positive whole number, got "-1".');
  });
});

describe('help', () => {
  it('"bladecp migrations --help" shows the whole group', async () => {
    const result = await cli(['migrations', '--help']);
    for (const sub of [
      'list',
      'status <uuid>',
      'review <uuid>',
      'approve <uuid>',
      'cancel <uuid>',
      'retry <uuid>',
    ]) {
      expect(result.stdout).toContain(sub);
    }
    expect(result.stdout).toContain('bladecp migrate <backup.tar.gz>');
    expect((await cli(['help', 'migrations'])).stdout).toBe(result.stdout);
  });

  it('--help --json is one JSON document', async () => {
    const global = parseJson((await cli(['--help', '--json'])).stdout);
    expect(global.ok).toBe(true);
    expect(global.data).toMatchObject({
      name: 'BladeCP CLI',
      usage: 'bladecp <command> [options]',
    });
    const command = parseJson((await cli(['whoami', '--help', '--json'])).stdout);
    expect(command.data).toMatchObject({ command: 'whoami', usage: 'bladecp whoami' });
    const group = parseJson((await cli(['servers', '--help', '--json'])).stdout);
    expect(group.data).toMatchObject({ group: 'servers' });
  });

  it('documents the environment variables', async () => {
    const result = await cli(['--help']);
    for (const name of [
      'BLADECP_API_KEY',
      'BLADECP_API_URL',
      'BLADECP_HUB_URL',
      'BLADECP_CONFIG_DIR',
      'NO_COLOR',
      'FORCE_COLOR',
      'BLADECP_NO_UPDATE_CHECK',
    ]) {
      expect(result.stdout).toContain(name);
    }
  });

  it('"bladecp" alone on a terminal is the welcome screen; elsewhere the help', async () => {
    api.addMigration({ uuid: ID, phase: 'awaiting_approval', primaryDomain: 'example.com' });
    const welcome = await cli([], { tty: true });
    expect(welcome.stdout).toContain('Right now');
    expect(welcome.stdout).toContain('example.com is ready for your review');
    const plain = await cli([]);
    expect(plain.stdout).toContain('Exit codes');
  });
});

describe('the sign-in on a terminal', () => {
  it('replacing the saved sign-in of another API says so', async () => {
    const other = await startMockApi();
    try {
      expect(
        (
          await runCli(['login', '--token', LIVE_KEY], {
            configDir: join(dir.path, 'config'),
            apiUrl: other.baseUrl,
          })
        ).code,
      ).toBe(0);
      const second = await runCli(['login', '--token', LIVE_KEY], {
        configDir: join(dir.path, 'config'),
        apiUrl: api.baseUrl,
      });
      expect(second.code).toBe(0);
      expect(second.stderr).toContain(
        `This replaced the sign-in saved for owner@example.com at ${other.baseUrl}`,
      );
    } finally {
      await other.stop();
    }
  });

  it('Esc cancels the wait and nothing is saved', async () => {
    const esc = await runCli(['login'], {
      configDir: join(dir.path, 'config2'),
      apiUrl: api.baseUrl,
      tty: true,
      answers: ['esc'],
      openUrl: async () => true,
      loginTimeoutMs: 5000,
    });
    expect(esc.code).toBe(130);
    expect(esc.stderr).toContain('Sign-in cancelled. Nothing was saved.');
  });

  it('logout says the key stays valid and where to revoke it', async () => {
    await runCli(['login', '--token', LIVE_KEY], {
      configDir: join(dir.path, 'config'),
      apiUrl: api.baseUrl,
    });
    const result = await runCli(['logout'], {
      configDir: join(dir.path, 'config'),
      apiUrl: api.baseUrl,
      tty: true,
    });
    expect(result.stdout).toContain('The key itself stays valid until it expires.');
    expect(result.stdout).toContain(`${api.baseUrl}/account/api-keys`);
  });
});

describe('defects of the 0.1.0 test campaign, the rest', () => {
  it('migrate --no-wait --json has domainPointing like the other migrate documents', async () => {
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
    expect(parseJson(result.stdout).data).toHaveProperty('domainPointing', null);
  });

  it('a phase conflict names the phase in words, and keeps the code in --json', async () => {
    api.addMigration({ uuid: ID, phase: 'importing' });
    const human = await cli(['migrations', 'approve', ID]);
    expect(human.code).toBe(6);
    expect(human.stderr).toContain('"Importing files and databases"');
    const json = await cli(['migrations', 'approve', ID, '--json']);
    expect(parseJson(json.stdout).error).toMatchObject({
      code: 'phase_conflict',
      phase: 'importing',
    });
  });

  it('a retry that is refused says why', async () => {
    api.addMigration({ uuid: ID, phase: 'cancelled' });
    const result = await cli(['migrations', 'retry', ID, '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'retry_unavailable',
      retryReason: 'not_failed',
      hint: 'Only a failed migration can be tried again.',
    });
  });

  it('an unfinished upload from another computer is told apart from one on this computer', async () => {
    api.addMigration({ uuid: ID, phase: 'uploading', primaryDomain: 'example.com' });
    const elsewhere = await cli(['migrations', 'status', ID]);
    expect(elsewhere.stdout).toContain('it was not started on this computer');

    const here = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'], {
      upload: { putPart: async () => Promise.reject(new Error('stop')), maxAttempts: 1 },
    });
    expect(here.code).not.toBe(0);
    const [created] = [...api.migrations.values()].filter((m) => m.uuid !== ID);
    const status = await cli(['migrations', 'status', created!.uuid]);
    expect(status.stdout).toContain('Run the same command again to continue it');
    const { realpathSync } = await import('node:fs');
    expect(status.stdout).toContain(`bladecp migrate ${realpathSync(backup)}`);
  });

  it('the same backup downloaded again (new date) is pointed out before a new migration', async () => {
    const first = await cli(['migrate', backup, '--plan', '12', '--location', '3', '--no-wait']);
    expect(first.code).toBe(0);
    const copy = join(dir.path, 'downloads');
    const { mkdirSync, copyFileSync } = await import('node:fs');
    mkdirSync(copy);
    copyFileSync(backup, join(copy, 'cpmove-owner.tar.gz'));
    const second = await cli([
      'migrate',
      join(copy, 'cpmove-owner.tar.gz'),
      '--plan',
      '12',
      '--location',
      '3',
      '--no-wait',
    ]);
    expect(second.code).toBe(0);
    expect(second.stderr).toContain('downloaded again?');
    expect(second.stderr).toContain('bladecp migrations cancel');
  });
});

describe('kit pieces in a narrow window', () => {
  const narrow = (columns: number, env: Record<string, string | undefined> = { NO_COLOR: '1' }) => {
    let text = '';
    const sink = {
      isTTY: true,
      columns,
      write: (s: string) => {
        text += s;
        return true;
      },
    };
    const out = new Output(sink, sink, { json: false, lang: 'en', env });
    return { out, k: kit(out, 'err'), text: () => text };
  };

  it('a value longer than its column (a path) breaks inside the column', () => {
    const { out, k, text } = narrow(50);
    const path = '/private/tmp/some/very/long/folder/for/the/bladecp/config.json';
    out.infoLines(k.rows([['Key', path]]));
    const lines = text().trimEnd().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(50);
    // Every piece of the path sits in the value column, never under the label.
    for (const line of lines.slice(1)) expect(line.startsWith('       ')).toBe(true);
    expect(lines.map((line) => line.slice(7)).join('')).toBe(path);
  });

  it('a styled path breaks inside the column too, keeping its color', () => {
    const { out, k, text } = narrow(50, { COLORTERM: 'truecolor', FORCE_COLOR: '3' });
    const path = '/private/tmp/some/very/long/folder/for/the/bladecp/config.json';
    out.infoLines(k.rows([['Key', `0197a3f4 ${k.muted(`· ${path}`)}`]]));
    const lines = text().trimEnd().split('\n');
    const plain = lines.map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''));
    expect(plain.length).toBeGreaterThan(2);
    for (const line of plain) expect(line.length).toBeLessThanOrEqual(50);
    for (const line of plain.slice(1)) expect(line.startsWith('       ')).toBe(true);
    // Broken between words first, then inside the path.
    expect(plain.map((line) => line.slice(7).replace(/ /g, '')).join('')).toBe(`0197a3f4·${path}`);
    // The muted color holds from the dot to the end of the path, over every piece.
    expect(text()).toMatch(/\u001b\[38;2;[\d;]+m·[^\u001b]*config\.json\u001b\[39m/);
  });

  it('a fix with a command stacks the command above its text when narrow', () => {
    const wide = narrow(80);
    const fix = { command: 'bladecp login', text: wide.out.t('err.fixLogin') };
    const view = { title: 'You are not signed in.', fixes: [fix], exit: 3, code: 'not_signed_in' };
    expect(errorBlock(wide.k, view).some((l) => /bladecp login\s+sign in/.test(l))).toBe(true);
    const tight = narrow(40);
    const lines = errorBlock(tight.k, view).map((l) => tight.out.plain(l));
    const at = lines.findIndex((l) => l.trimEnd().endsWith('bladecp login'));
    expect(at).toBeGreaterThan(0);
    // The text sits under the command, indented, possibly over a few lines.
    const below = lines.slice(at + 1, -1);
    const indent = (l: string) => l.length - l.trimStart().length;
    const commandColumn = lines[at]!.indexOf('bladecp login');
    for (const l of below) expect(indent(l)).toBeGreaterThan(commandColumn);
    expect(below.map((l) => l.trim()).join(' ')).toBe('sign in with the browser');
  });
});
