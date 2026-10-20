// Photos of the `bladecp partner servers` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner-servers.test.ts -u

process.env.TZ = 'UTC';

import { partnerServersState } from './helpers/mock/partner-servers.js';
import { type Env, type Scenario, SERVER, screenSuite } from './helpers/screens.js';

const partner = ({ api }: Env) => {
  api.setPartner();
  partnerServersState(api).externalIds.set(SERVER, '1042');
};

const CREATE = [
  'partner',
  'servers',
  'create',
  '--plan',
  '12',
  '--location',
  '3',
  '--domain',
  'store.example.com',
  '--email',
  'owner@example.com',
  '--name',
  'Example Shop',
  '--component',
  'php',
  '--option',
  'memory=4',
  '--external-id',
  '2001',
];

const SCENARIOS: Scenario[] = [
  { name: 'help partner servers', argv: () => ['partner', 'servers', '--help'], signedOut: true },
  {
    name: 'help partner servers create',
    argv: () => ['partner', 'servers', 'create', '--help'],
    signedOut: true,
  },
  { name: 'partner servers list', argv: () => ['partner', 'servers', 'list'], setup: partner },
  {
    name: 'partner servers list with more pages',
    argv: () => ['partner', 'servers', 'list', '--limit', '2'],
    setup: partner,
  },
  {
    name: 'partner servers list without a match',
    argv: () => ['partner', 'servers', 'list', '--external-id', '9999'],
    setup: partner,
  },
  {
    name: 'partner servers create',
    argv: () => CREATE,
    setup: partner,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner servers create declined',
    argv: () => CREATE,
    setup: partner,
    options: () => ({ answers: ['n'] }),
  },
  {
    name: 'partner servers create with an unknown value',
    argv: () => [...CREATE, '--option', 'backups=hourly'],
    setup: partner,
  },
  {
    name: 'partner servers plan',
    argv: () => ['partner', 'servers', 'plan', '0197a1c4', '21'],
    setup: partner,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner servers options',
    argv: () => [
      'partner',
      'servers',
      'options',
      '0197a1c4',
      '--option',
      'memory=8',
      '--option',
      'backups=daily',
    ],
    setup: partner,
    options: () => ({ answers: ['y'] }),
  },
  {
    name: 'partner servers options declined',
    argv: () => ['partner', 'servers', 'options', '0197a1c4', '--option', 'memory=2'],
    setup: partner,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner servers suspend',
    argv: () => ['partner', 'servers', 'suspend', '0197a1c4'],
    setup: partner,
    options: () => ({ answers: ['y'] }),
  },
  {
    name: 'partner servers suspend declined',
    argv: () => ['partner', 'servers', 'suspend', '0197a1c4'],
    setup: partner,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner servers unsuspend',
    argv: () => ['partner', 'servers', 'unsuspend', '0197a1c4', '--yes'],
    setup: partner,
  },
  {
    name: 'partner servers cancel now',
    argv: () => [
      'partner',
      'servers',
      'cancel',
      '0197a1c4',
      '--now',
      '--reason',
      'The customer closed the online store',
    ],
    setup: (env) => {
      partner(env);
      partnerServersState(env.api).penalty = { amount: 12000, currency: 'BRL', remainingMonths: 6 };
    },
    options: () => ({ answers: ['y'] }),
  },
  {
    name: 'partner servers cancel at the end of the cycle',
    argv: () => ['partner', 'servers', 'cancel', '0197a1c4', '--yes'],
    setup: partner,
  },
  {
    name: 'partner servers delete',
    argv: () => ['partner', 'servers', 'delete', '0197a1c4'],
    setup: partner,
    options: () => ({ answers: ['y'] }),
  },
  {
    name: 'partner servers delete declined',
    argv: () => ['partner', 'servers', 'delete', '0197a1c4'],
    setup: partner,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner servers open in the browser',
    argv: () => ['partner', 'servers', 'open', '0197a1c4'],
    setup: partner,
    options: () => ({ openUrl: async () => true }),
  },
  {
    name: 'partner servers open without a browser',
    argv: () => ['partner', 'servers', 'open', '0197a1c4'],
    setup: partner,
  },
  {
    name: 'partner servers suspend with a customer key',
    argv: () => ['partner', 'servers', 'suspend', '0197a1c4', '--yes'],
  },
];

screenSuite(SCENARIOS);
