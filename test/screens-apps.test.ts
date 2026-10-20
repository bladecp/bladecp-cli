// Photos of the `bladecp apps` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-apps.test.ts -u

process.env.TZ = 'UTC';

import { appsState, seedApps } from './helpers/mock/apps.js';
import { seedDomains } from './helpers/mock/domains.js';
import { type Scenario, SERVER, screenSuite } from './helpers/screens.js';

const SETTINGS = [
  '--option',
  'admin_user=maria',
  '--option',
  'site_title=Maria blog',
  '--option',
  'admin_email=maria@example.com',
];

const SCENARIOS: Scenario[] = [
  { name: 'help apps', argv: () => ['apps', '--help'], signedOut: true },
  { name: 'help apps install', argv: () => ['apps', 'install', '--help'], signedOut: true },
  { name: 'apps list', argv: () => ['apps'] },
  { name: 'apps list empty', argv: () => ['apps'], setup: ({ api }) => seedApps(api, []) },
  { name: 'apps show', argv: () => ['apps', 'show', 'wordpress'] },
  { name: 'apps show coming soon', argv: () => ['apps', 'show', 'joomla'] },
  {
    name: 'apps install asks',
    argv: () => ['apps', 'install', '0197a1c4', 'wordpress'],
    setup: ({ api }) => seedDomains(api, SERVER, ['blog.example.com']),
    options: () => ({ answers: ['2', 'Maria blog', 'maria', ''] }),
  },
  {
    name: 'apps install declined',
    argv: () => ['apps', 'install', '0197a1c4', 'wordpress', ...SETTINGS],
    options: () => ({ answers: ['n'] }),
  },
  {
    name: 'apps install',
    argv: () => ['apps', 'install', '0197a1c4', 'wordpress', ...SETTINGS, '--yes'],
  },
  {
    name: 'apps install busy domain',
    argv: () => ['apps', 'install', '0197a1c4', 'wordpress', ...SETTINGS, '--yes'],
    setup: ({ api }) => {
      appsState(api).installs.push({
        appInstallUuid: '01970000-0000-7000-8000-0000000b0099',
        provisionUuid: SERVER,
        host: 'example.com',
        slug: 'wordpress',
        status: 'active',
      });
    },
  },
];

screenSuite(SCENARIOS);
