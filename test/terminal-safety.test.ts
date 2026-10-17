import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { safeJson, safeLines, safeText } from '../src/sanitize.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const C1_CSI = String.fromCharCode(0x9b);
const C1_OSC = String.fromCharCode(0x9d);
const RLO = String.fromCharCode(0x202e);
const LRI = String.fromCharCode(0x2066);
const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);

/** Hostile payloads, each tagged so a test can find where it landed. */
const PAYLOADS = {
  clear: `${ESC}[2J${ESC}[H`,
  link: `${ESC}]8;;https://evil.example/${ESC}\\click${ESC}]8;;${ESC}\\`,
  clipboard: `${ESC}]52;c;ZXZpbA==${BEL}`,
  title: `${ESC}]0;pwned${BEL}`,
  bell: BEL,
  c1: `${C1_CSI}2J${C1_OSC}0;t${BEL}`,
  bidi: `${RLO}moc.elpmaxe${LRI}`,
  newline: '\nFAKE: migration approved',
  forgedStyle: `${MARK_OPEN}0000000000000000bold+${MARK_CLOSE}`,
};
const HOSTILE = Object.values(PAYLOADS).join('|');

/** Our own ANSI output: colors plus the live-line clear. Nothing else is allowed. */
const ALLOWED_SEQUENCES = new Set([
  '[1m',
  '[22m',
  '[2m',
  '[31m',
  '[32m',
  '[33m',
  '[36m',
  '[39m',
  '[2K',
]);

function expectTerminalSafe(text: string): void {
  for (const sequence of text.split(ESC).slice(1)) {
    const csi = /^\[[0-9;]*[A-Za-z]/.exec(sequence)?.[0];
    expect(
      csi && ALLOWED_SEQUENCES.has(csi),
      `escape sequence ${JSON.stringify(sequence.slice(0, 12))}`,
    ).toBe(true);
  }
  expect(text).not.toContain(BEL);
  expect(/[\u0080-\u009f\u202a-\u202e\u2066-\u2069\ue000\ue001]/.test(text)).toBe(false);
  expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/.test(text)).toBe(false);
  expect(text).not.toMatch(/^FAKE: migration approved/m);
}

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

/** Terminal on both ends with colors on, to prove our own styles survive. */
const colorTerminal: Partial<RunOptions> = {
  tty: true,
  env: { BLADECP_API_KEY: LIVE_KEY, NO_COLOR: undefined },
};

describe('sanitizer', () => {
  it('escapes every hostile payload visibly', () => {
    const out = safeText(HOSTILE);
    expectTerminalSafe(out);
    expect(out).toContain('\\x1b[2J');
    expect(out).toContain('\\x1b]8;;https://evil.example/');
    expect(out).toContain('\\x1b]52;c;');
    expect(out).toContain('\\x07');
    expect(out).toContain('\\x9b2J');
    expect(out).toContain('\\u202e');
    expect(out).toContain('\\u2066');
    expect(out).toContain('\\x0aFAKE');
    expect(out).toContain('\\ue000');
  });

  it('keeps line breaks only for composed lines and is idempotent', () => {
    expect(safeLines(`a\nb${ESC}[2J`)).toBe('a\nb\\x1b[2J');
    expect(safeText(safeText(HOSTILE))).toBe(safeText(HOSTILE));
    expect(safeText('Sao Paulo, ação, 東京')).toBe('Sao Paulo, ação, 東京');
  });

  it('JSON keeps the same value but no raw C1 or bidi characters', () => {
    const value = { name: HOSTILE };
    const json = safeJson(JSON.stringify(value));
    expectTerminalSafe(json);
    expect(JSON.parse(json)).toEqual(value);
  });
});

describe('hostile API values never reach the terminal raw', () => {
  it('tables (servers list) in plain and color mode', async () => {
    api.provisions[0] = {
      ...api.provisions[0]!,
      primary_domain: `example.com${PAYLOADS.clear}${PAYLOADS.link}`,
      status: `active${PAYLOADS.c1}`,
      product_type: `x${PAYLOADS.bidi}`,
    };
    for (const extra of [{}, colorTerminal]) {
      const result = await cli(['servers', 'list'], extra);
      expect(result.code).toBe(0);
      expectTerminalSafe(result.stdout + result.stderr);
      expect(result.stdout).toContain('example.com\\x1b[2J');
    }
  });

  it('server details and usage', async () => {
    api.provisions[0] = { ...api.provisions[0]!, primary_domain: HOSTILE, status: HOSTILE };
    const result = await cli(
      ['servers', 'show', '01970000-0000-7000-8000-00000000s001'],
      colorTerminal,
    );
    expect(result.code).toBe(0);
    expectTerminalSafe(result.stdout + result.stderr);
  });

  it('error messages from the API, human and JSON', async () => {
    api.addMigration({ uuid: 'mig-0000-0300', phase: 'awaiting_approval' });
    api.fail({
      method: 'POST',
      path: /approve$/,
      status: 409,
      body: { error: true, message: HOSTILE },
      times: 2,
    });
    const human = await cli(['migrations', 'approve', 'mig-0000-0300'], colorTerminal);
    expect(human.code).toBe(6);
    expectTerminalSafe(human.stdout + human.stderr);
    expect(human.stderr).toContain('\\x1b]52;c;');
    // Our own red "Error:" label still works on a color terminal.
    expect(human.stderr).toContain(`${ESC}[31m`);

    const json = await cli(['migrations', 'approve', 'mig-0000-0300', '--json']);
    expect(json.code).toBe(6);
    expectTerminalSafe(json.stdout + json.stderr);
    expect(parseJson(json.stdout).ok).toBe(false);
  });

  it('migration status, list and watch', async () => {
    api.addMigration({
      uuid: 'mig-0000-0301',
      phase: 'failed',
      primaryDomain: `shop.example.com${PAYLOADS.title}`,
      stagingUrl: `https://preview.example.net/${PAYLOADS.link}`,
      message: `Import failed${PAYLOADS.newline}${PAYLOADS.clipboard}`,
      components: [
        { name: `files${PAYLOADS.clear}`, status: `done${PAYLOADS.bidi}` },
        { name: 'database', status: 'failed' },
      ],
    });
    api.addMigration({
      uuid: 'mig-0000-0302',
      phase: `importing${PAYLOADS.c1}`,
      primaryDomain: HOSTILE,
    });
    for (const argv of [
      ['migrations', 'status', 'mig-0000-0301'],
      ['migrations', 'status', 'mig-0000-0301', '--watch'],
      ['migrations', 'list'],
      ['migrations', 'status', 'mig-0000-0302'],
    ]) {
      const result = await cli(argv, colorTerminal);
      expectTerminalSafe(result.stdout + result.stderr);
    }
    const watchJson = await cli(['migrations', 'status', 'mig-0000-0301', '--watch', '--json']);
    expectTerminalSafe(watchJson.stdout + watchJson.stderr);
    expect(JSON.parse(watchJson.stdout.trim()).data.message).toBe(
      `Import failed${PAYLOADS.newline}${PAYLOADS.clipboard}`,
    );
  });

  it('destinations, the interactive picker and its prompts', async () => {
    api.destinations = [
      {
        partnerUuid: 'p1',
        partnerName: `Partner${PAYLOADS.link}`,
        partnerPlanId: 12,
        planName: `Plan${PAYLOADS.clear}`,
        diskGb: 20,
        prices: [{ currency: `US${PAYLOADS.bell}`, priceMonthly: 9 }],
        locations: [
          {
            locationId: 3,
            name: `City${PAYLOADS.bidi}`,
            countryCode: 'BR',
            city: null,
            region: null,
          },
          {
            locationId: 4,
            name: 'Miami',
            countryCode: `U${PAYLOADS.c1}`,
            city: null,
            region: null,
          },
        ],
      },
    ];
    const list = await cli(['destinations', 'list'], colorTerminal);
    expect(list.code).toBe(0);
    expectTerminalSafe(list.stdout + list.stderr);

    const backup = join(dir.path, 'site.tar.gz');
    writeFileSync(backup, gzipSync(randomBytes(100), { level: 0 }));
    const migrate = await cli(['migrate', backup, '--no-wait'], {
      ...colorTerminal,
      answers: ['1', 'n'],
    });
    expect(migrate.code).toBe(0);
    expectTerminalSafe(migrate.stdout + migrate.stderr + migrate.prompts.join('\n'));
  });

  it.skipIf(process.platform === 'win32')(
    'a hostile local file name in prompts and progress',
    async () => {
      const backup = join(dir.path, `site${ESC}]0;x${BEL}${RLO}.tar.gz`);
      writeFileSync(backup, gzipSync(randomBytes(100), { level: 0 }));
      const result = await cli(
        ['migrate', backup, '--plan', '12', '--location', '3', '--no-wait'],
        {
          ...colorTerminal,
          answers: [''],
        },
      );
      expect(result.code).toBe(0);
      expectTerminalSafe(result.stdout + result.stderr + result.prompts.join('\n'));
      expect(result.prompts[0]).toContain('\\x1b]0;x\\x07\\u202e');
    },
  );

  it('a forged style marker in an API value does not become a color', async () => {
    api.provisions[0] = { ...api.provisions[0]!, primary_domain: `a${PAYLOADS.forgedStyle}b` };
    const result = await cli(['servers', 'list'], colorTerminal);
    expect(result.stdout).toContain('a\\ue0000000000000000000bold+\\ue001b');
    expect(result.stdout).not.toContain(`${ESC}[1m`);
  });
});
