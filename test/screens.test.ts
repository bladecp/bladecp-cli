// Photos of every screen: each command, in 40, 80 and 120 columns, in the
// three languages, without color and with color. A photo is the final screen
// a person sees (text, plus the style of every run of cells in color), so any
// visual change shows up in review. Updating the photos is an explicit act:
//
//   pnpm vitest run test/screens.test.ts -u
//
// Every photo also checks that nothing is written past the last column
// (except long addresses, which a terminal wraps and still lets you copy).

process.env.TZ = 'UTC';

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { LANGS, type Lang } from '../src/i18n/index.js';
import { EXPIRED_KEY, LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { type RunOptions, runCli, tempDir } from './helpers/run.js';
import { renderScreen } from './helpers/vt.js';

const OFFICIAL = 'https://api.bladecp.com';
const HUB = 'https://hub.bladecp.com';
const WIDTHS = [40, 80, 120] as const;
const MODES = ['plain', 'color'] as const;

const SERVER = '0197a1c4-0000-7000-8000-000000000001';
const READY = '01979f2c-0000-7000-8000-000000000002';
const FAILED = '01979e11-0000-7000-8000-000000000003';
const DONE = '01979d00-0000-7000-8000-000000000004';
const SLOW = '01979c00-0000-7000-8000-000000000005';

const CHANGELOG = `# Changelog

## [0.3.0] - 2026-11-20

### Added

- \`bladecp servers\` shows the disk of each server.
- Faster uploads on slow links.

## [0.2.0] - 2026-10-17
`;

interface Env {
  api: MockApi;
  dir: string;
  backup: string;
}

interface Scenario {
  name: string;
  argv: (env: Env) => string[];
  setup?: (env: Env) => void | Promise<void>;
  options?: (env: Env) => Partial<RunOptions>;
  /** Without a key (signed out). */
  signedOut?: boolean;
  /** Another key than the valid one (an expired key, for example). */
  apiKey?: string;
}

function seed(api: MockApi): void {
  api.provisions = [
    {
      uuid: SERVER,
      status: 'active',
      primary_domain: 'example.com',
      product_type: 'stack-container',
    },
    {
      uuid: '0197a2b9-0000-7000-8000-000000000006',
      status: 'pending',
      primaryDomain: 'shop.example.org',
      product_type: 'edge-cloud',
    },
    {
      uuid: '01969f10-0000-7000-8000-000000000007',
      status: 'deleted',
      primary_domain: 'old.example.net',
      product_type: 'stack-container',
    },
  ];
  api.usage[SERVER] = {
    provisionUuid: SERVER,
    plan: { diskGb: 20, bandwidthGbMonth: null, emailAccounts: 10, sqlDatabases: 5 },
    usage: { diskGb: 16.4, bandwidthGbMonth: 41.7, emailAccounts: null, sqlDatabases: 2 },
    status: 'healthy',
    asOf: '2026-10-17T12:00:00.000Z',
  };
  api.destinations.push({
    partnerUuid: 'p2',
    partnerName: 'BladeCP',
    partnerPlanId: 21,
    planName: 'Edge Cloud 2',
    diskGb: 60,
    prices: [
      { currency: 'BRL', priceMonthly: 129 },
      { currency: 'USD', priceMonthly: 24 },
    ],
    locations: [{ locationId: 8, name: 'Frankfurt', countryCode: 'DE' }],
  });
  api.addMigration({
    uuid: READY,
    phase: 'awaiting_approval',
    primaryDomain: 'shop.example.org',
    sourcePrimaryDomain: 'shop.example.org',
    stagingUrl: 'https://01979f2c.preview.example.net',
    components: [
      { name: 'files', status: 'completed' },
      { name: 'database', status: 'completed' },
    ],
    createdAt: '2026-10-16T18:20:00.000Z',
  });
}

const SCENARIOS: Scenario[] = [
  { name: 'help', argv: () => ['--help'], signedOut: true },
  { name: 'help migrate', argv: () => ['migrate', '--help'], signedOut: true },
  { name: 'help migrations', argv: () => ['migrations', '--help'], signedOut: true },
  { name: 'home', argv: () => [] },
  { name: 'home signed out', argv: () => [], signedOut: true },
  {
    name: 'login',
    argv: () => ['login'],
    signedOut: true,
    options: ({ api }) => ({
      openUrl: async (url) => {
        await (await fetch(url.replace(HUB, api.baseUrl))).text();
        return true;
      },
    }),
  },
  { name: 'login token', argv: () => ['login', '--token', LIVE_KEY], signedOut: true },
  { name: 'whoami', argv: () => ['whoami'] },
  { name: 'servers', argv: () => ['servers'] },
  { name: 'servers all', argv: () => ['servers', '--all'] },
  { name: 'servers show', argv: () => ['servers', 'show', '0197a1c4'] },
  { name: 'destinations', argv: () => ['destinations'] },
  {
    name: 'migrate',
    argv: ({ backup }) => ['migrate', backup],
    setup: ({ api }) => {
      api.phaseScript = [...api.phaseScript, 'syncing', 'cutover_pending'];
    },
    // First destination, start, keep the domain found, approve.
    options: () => ({ answers: ['', '', '', 'a'] }),
  },
  {
    name: 'migrate yes',
    argv: ({ backup }) => ['migrate', backup, '--plan', '12', '--location', '3', '--yes'],
  },
  { name: 'migrations', argv: () => ['migrations'] },
  { name: 'status ready', argv: () => ['migrations', 'status', '01979f2c'] },
  {
    name: 'status failed',
    argv: () => ['migrations', 'status', FAILED],
    setup: ({ api }) => {
      api.addMigration({
        uuid: FAILED,
        phase: 'failed',
        primaryDomain: 'blog.example.com',
        message: '',
        reason: 'permanent',
        discovery: { emailAccountCount: 0, emailHistoryBytes: 0 },
        components: [
          { name: 'files', status: 'completed' },
          { name: 'database', status: 'running' },
          { name: 'email_accounts', status: 'pending' },
        ],
      });
    },
  },
  {
    name: 'status complete',
    argv: () => ['migrations', 'status', DONE],
    setup: ({ api }) => {
      api.addMigration({
        uuid: DONE,
        phase: 'cutover_pending',
        primaryDomain: 'example.com',
        cutoverTarget: '203.0.113.10',
      });
    },
  },
  {
    name: 'status slow',
    argv: () => ['migrations', 'status', SLOW],
    setup: ({ api }) => {
      api.addMigration({
        uuid: SLOW,
        phase: 'provisioning',
        primaryDomain: 'example.com',
        // Past the end of the script: the mock keeps it in this phase.
        scriptIndex: 99,
        timing: {
          executionMs: 2_700_000,
          waitingMs: 0,
          state: 'running',
          phaseEnteredAt: new Date(Date.now() - 45 * 60_000 - 200).toISOString(),
        },
      });
    },
  },
  {
    name: 'watch',
    argv: () => ['migrations', 'status', SLOW, '--watch'],
    setup: ({ api }) => {
      api.addMigration({
        uuid: SLOW,
        phase: 'queued',
        primaryDomain: 'example.com',
        scriptIndex: 2,
      });
    },
  },
  {
    name: 'approve',
    argv: () => ['migrations', 'approve', READY],
    options: () => ({ answers: [''] }),
  },
  {
    name: 'cancel',
    argv: () => ['migrations', 'cancel', READY],
    options: () => ({ answers: ['y'] }),
  },
  {
    name: 'retry refused',
    argv: () => ['migrations', 'retry', FAILED],
    setup: ({ api }) => {
      api.addMigration({ uuid: FAILED, phase: 'cancelled', primaryDomain: 'blog.example.com' });
    },
  },
  { name: 'update check', argv: () => ['update', '--check'], signedOut: true },
  { name: 'update', argv: () => ['update'], signedOut: true, options: () => ({ answers: [''] }) },
  {
    name: 'update permission',
    argv: () => ['update', '--yes'],
    signedOut: true,
    options: () => ({
      runProcess: () => ({
        code: 243,
        output:
          'npm error code EACCES\nnpm error syscall mkdir\nnpm error path /usr/local/lib/node_modules/@bladecp\n',
      }),
    }),
  },
  { name: 'config', argv: () => ['config'], signedOut: true },
  { name: 'config set', argv: () => ['config', 'set', 'auto-update', 'on'], signedOut: true },
  { name: 'error not signed in', argv: () => ['servers'], signedOut: true },
  { name: 'error key expired', argv: () => ['whoami'], apiKey: EXPIRED_KEY },
  {
    name: 'error not gzip',
    // A path relative to the repository, so the photo is the same on every machine.
    argv: () => ['migrate', 'test/fixtures/site-old.zip'],
  },
  {
    name: 'error network',
    argv: () => ['whoami'],
    options: () => ({
      fetch: async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        });
      },
    }),
  },
  {
    name: 'update notice',
    argv: () => ['whoami'],
    setup: ({ dir }) => {
      const config = join(dir, 'config');
      mkdirSync(config, { recursive: true });
      writeFileSync(
        join(config, 'update-check.json'),
        JSON.stringify({ checkedAt: new Date().toISOString(), latest: '0.3.0' }),
      );
    },
  },
];

/** The network of a photo: the official addresses answered by the mock. */
function network(api: MockApi): RunOptions['fetch'] {
  return async (input, init) => {
    if (input.startsWith('https://registry.npmjs.org/')) {
      return new Response(JSON.stringify({ 'dist-tags': { latest: '0.3.0' } }), { status: 200 });
    }
    if (input.startsWith('https://raw.githubusercontent.com/')) {
      return new Response(CHANGELOG, { status: 200 });
    }
    return fetch(input.replace(OFFICIAL, api.baseUrl).replace(HUB, api.baseUrl), init);
  };
}

async function photo(scenario: Scenario, lang: Lang, width: number, mode: (typeof MODES)[number]) {
  const api = await startMockApi();
  const dir = tempDir('bladecp-photo-');
  try {
    seed(api);
    const backup = join(dir.path, 'cpmove-site.tar.gz');
    writeFileSync(backup, gzipSync(randomBytes(640), { level: 0 }));
    const env: Env = { api, dir: dir.path, backup };
    await scenario.setup?.(env);
    let screen = '';
    const extra = scenario.options?.(env) ?? {};
    const result = await runCli(scenario.argv(env), {
      configDir: join(dir.path, 'config'),
      apiUrl: OFFICIAL,
      tty: true,
      columns: width,
      rows: 40,
      fetch: network(api),
      env: {
        BLADECP_API_KEY: scenario.signedOut ? undefined : (scenario.apiKey ?? LIVE_KEY),
        BLADECP_HUB_URL: undefined,
        LANG: lang === 'pt-BR' ? 'pt_BR.UTF-8' : lang === 'es' ? 'es_ES.UTF-8' : 'en_US.UTF-8',
        ...(mode === 'plain'
          ? { NO_COLOR: '1' }
          : { NO_COLOR: undefined, COLORTERM: 'truecolor', FORCE_HYPERLINK: '1' }),
      },
      screen: (chunk) => {
        screen += chunk;
      },
      ...extra,
    });
    // The callback port of the sign-in address changes on every run.
    const stable = screen
      .replace(/127\.0\.0\.1%3A\d+/g, '127.0.0.1%3A50505')
      .replace(/state=[A-Za-z0-9_-]{43}/g, `state=${'S'.repeat(43)}`)
      .replace(/code_challenge=[A-Za-z0-9_-]{43}/g, `code_challenge=${'C'.repeat(43)}`);
    const view = renderScreen(stable, width);
    return { result, view };
  } finally {
    await api.stop();
    dir.cleanup();
  }
}

describe.each(SCENARIOS)('screen: $name', (scenario) => {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      for (const mode of MODES) {
        it(`${lang} ${width} ${mode}`, async () => {
          const { view } = await photo(scenario, lang, width, mode);
          expect(view.unknown, 'sequences the CLI should not write').toEqual([]);
          // Only a word longer than the line (an address, a path) may run past
          // the last column; a terminal wraps it and it can still be copied.
          for (const row of view.overflow) expect(row, `wider than ${width}`).toMatch(/\S{16,}$/);
          expect(
            mode === 'plain' ? view.text : `${view.text}\n\n--- styles ---\n${view.styles}`,
          ).toMatchSnapshot();
        });
      }
    }
  }
});
