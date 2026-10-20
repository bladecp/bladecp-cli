// Photos of the `bladecp wordpress` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-wordpress.test.ts -u

process.env.TZ = 'UTC';

import { addTask, SNAPSHOT, snapshotResult, wordpressState } from './helpers/mock/wordpress.js';
import { type Scenario, SERVER, screenSuite } from './helpers/screens.js';

const EXT = ['--external-id', '1042'];
const TASK = '01979c4e-0000-7000-8000-0000000000aa';

const SCENARIOS: Scenario[] = [
  { name: 'help wordpress', argv: () => ['wordpress', '--help'], signedOut: true },
  { name: 'help wordpress update', argv: () => ['wordpress', 'update'], signedOut: true },
  {
    name: 'help wordpress update plugin',
    argv: () => ['wordpress', 'update', 'plugin', '--help'],
    signedOut: true,
  },
  { name: 'wordpress status', argv: () => ['wordpress', 'status', '0197a1c4', ...EXT] },
  {
    name: 'wordpress status unavailable',
    argv: () => ['wordpress', 'status', '0197a1c4', ...EXT],
    setup: ({ api }) => {
      wordpressState(api).unavailable.set(SERVER, 'toolkit_unavailable');
    },
  },
  { name: 'wordpress dashboard', argv: () => ['wordpress', 'dashboard', '0197a1c4', ...EXT] },
  {
    name: 'wordpress dashboard wait',
    argv: () => ['wordpress', 'dashboard', '0197a1c4', ...EXT, '--wait'],
  },
  {
    name: 'wordpress dashboard up to date',
    argv: () => ['wordpress', 'dashboard', '0197a1c4', ...EXT, '--wait'],
    setup: ({ api }) => {
      const current = (items: unknown) =>
        (items as Record<string, unknown>[]).map((item) => ({
          ...item,
          version: item.updateVersion ?? item.version,
          updateAvailable: false,
          updateVersion: null,
        }));
      wordpressState(api).snapshot = snapshotResult(
        {
          coreVersion: '6.6.2',
          plugins: current(SNAPSHOT.plugins),
          themes: current(SNAPSHOT.themes),
        },
        [],
      );
    },
  },
  {
    name: 'wordpress update plugin question',
    argv: () => ['wordpress', 'update', 'plugin', '0197a1c4', 'akismet', ...EXT],
    options: () => ({ answers: [''] }),
  },
  {
    name: 'wordpress update core declined',
    argv: () => ['wordpress', 'update', 'core', '0197a1c4', ...EXT],
    options: () => ({ answers: ['n'] }),
  },
  {
    name: 'wordpress update theme wait',
    argv: () => ['wordpress', 'update', 'theme', '0197a1c4', 'astra', ...EXT, '--wait', '--yes'],
  },
  {
    name: 'wordpress update unavailable',
    argv: () => ['wordpress', 'update', 'core', '0197a1c4', ...EXT, '--yes'],
    setup: ({ api }) => {
      wordpressState(api).unavailable.set(SERVER, 'docroot_unavailable');
    },
  },
  {
    name: 'wordpress task running',
    argv: () => ['wordpress', 'task', '0197a1c4', TASK, ...EXT],
    setup: ({ api }) =>
      addTask(api, { id: TASK, uuid: SERVER, command: 'core-update', script: ['running'] }),
  },
  {
    name: 'wordpress task failed',
    argv: () => ['wordpress', 'task', '0197a1c4', TASK, ...EXT],
    setup: ({ api }) =>
      addTask(api, { id: TASK, uuid: SERVER, command: 'plugin-update', script: ['failed'] }),
  },
  { name: 'wordpress own server', argv: () => ['wordpress', 'status', '0197a1c4'] },
  {
    name: 'wordpress partner without external id',
    argv: () => ['wordpress', 'status', '0197a1c4'],
    setup: ({ api }) => api.setPartner(),
  },
  {
    name: 'wordpress other service',
    argv: () => ['wordpress', 'status', '0197a1c4', '--external-id', '9999'],
  },
];

screenSuite(SCENARIOS);
