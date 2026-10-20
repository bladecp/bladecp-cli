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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXPIRED_KEY, LIVE_KEY } from './helpers/mock-api.js';
import { DONE, FAILED, HUB, READY, type Scenario, SLOW, screenSuite } from './helpers/screens.js';

const SCENARIOS: Scenario[] = [
  { name: 'help', argv: () => ['--help'], signedOut: true },
  { name: 'help migrate', argv: () => ['migrate', '--help'], signedOut: true },
  { name: 'help migrations', argv: () => ['migrations', '--help'], signedOut: true },
  { name: 'home', argv: () => [] },
  { name: 'home signed out', argv: () => [], signedOut: true },
  {
    name: 'home partner',
    argv: () => [],
    setup: ({ api }) => {
      api.setPartner();
    },
  },
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
  { name: 'help analyze', argv: () => ['analyze', '--help'], signedOut: true },
  {
    name: 'analyze',
    // Relative paths, so the photo is the same on every machine.
    argv: () => ['analyze', 'test/fixtures/analyzer/cpmove-demo.tar.gz'],
    signedOut: true,
  },
  {
    name: 'analyze blocked',
    argv: () => ['analyze', 'test/fixtures/analyzer/cpmove-multisite.tar.gz'],
    signedOut: true,
  },
  {
    name: 'analyze notes',
    argv: () => ['analyze', 'test/fixtures/analyzer/cpmove-notes.tar.gz'],
    signedOut: true,
  },
  {
    name: 'analyze prices',
    argv: () => ['analyze', 'test/fixtures/analyzer/cpmove-demo.tar.gz', '--prices'],
  },
  {
    name: 'analyze prices signed out',
    argv: () => ['analyze', 'test/fixtures/analyzer/cpmove-demo.tar.gz', '--prices'],
    signedOut: true,
  },
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
        JSON.stringify({ checkedAt: new Date().toISOString(), latest: '0.5.0' }),
      );
    },
  },
];

screenSuite(SCENARIOS);
