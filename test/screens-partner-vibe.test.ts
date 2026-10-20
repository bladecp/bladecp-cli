// Photos of the `bladecp partner vibe` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner-vibe.test.ts -u

process.env.TZ = 'UTC';

import {
  seedVibe,
  VIBE_ACCOUNT,
  VIBE_PRO_PLAN,
  VIBE_SUSPENDED,
  VIBE_TERMINATED,
} from './helpers/mock/partner-vibe.js';
import { type Env, type Scenario, screenSuite } from './helpers/screens.js';

/** A partner key with an active Pro account, a suspended Free one and a terminated one. */
const partner = ({ api }: Env) => {
  api.setPartner();
  seedVibe(api);
};
const vibe = (...words: string[]) => ['partner', 'vibe', ...words];
const enter = () => ({ answers: [''] });

const SCENARIOS: Scenario[] = [
  { name: 'help partner vibe', argv: () => vibe('--help'), signedOut: true },
  { name: 'help partner vibe create', argv: () => vibe('create', '--help'), signedOut: true },
  { name: 'partner vibe find', argv: () => vibe('find', '4821'), setup: partner },
  { name: 'partner vibe find none', argv: () => vibe('find', '9999'), setup: partner },
  { name: 'partner vibe show suspended', argv: () => vibe('show', VIBE_SUSPENDED), setup: partner },
  {
    name: 'partner vibe show terminated',
    argv: () => vibe('show', VIBE_TERMINATED),
    setup: partner,
  },
  {
    name: 'partner vibe create',
    argv: () =>
      vibe(
        'create',
        '--external-id',
        '5001',
        '--plan',
        VIBE_PRO_PLAN,
        '--email',
        'owner@example.com',
        '--name',
        'Store Owner',
      ),
    setup: partner,
    options: enter,
  },
  {
    name: 'partner vibe plan',
    argv: () => vibe('plan', VIBE_SUSPENDED, VIBE_PRO_PLAN),
    setup: partner,
    options: enter,
  },
  {
    name: 'partner vibe suspend declined',
    argv: () => vibe('suspend', VIBE_ACCOUNT),
    setup: partner,
    options: enter,
  },
  {
    name: 'partner vibe suspend',
    argv: () => vibe('suspend', VIBE_ACCOUNT, '--yes'),
    setup: partner,
  },
  {
    name: 'partner vibe reactivate',
    argv: () => vibe('reactivate', VIBE_SUSPENDED, '--yes'),
    setup: partner,
  },
  {
    name: 'partner vibe resume',
    argv: () => vibe('resume', VIBE_ACCOUNT, '--yes'),
    setup: partner,
  },
  {
    name: 'partner vibe terminate declined',
    argv: () => vibe('terminate', VIBE_ACCOUNT),
    setup: partner,
    options: enter,
  },
  {
    name: 'partner vibe terminate',
    argv: () => vibe('terminate', VIBE_ACCOUNT, '--yes'),
    setup: partner,
  },
  {
    name: 'partner vibe unchanged',
    argv: () => vibe('suspend', VIBE_TERMINATED, '--yes'),
    setup: partner,
  },
  {
    name: 'partner vibe open',
    argv: () => vibe('open', VIBE_ACCOUNT),
    setup: partner,
    options: () => ({ openUrl: async () => true }),
  },
  {
    name: 'partner vibe open link',
    argv: () => vibe('open', VIBE_ACCOUNT, '--no-browser'),
    setup: partner,
  },
  { name: 'partner vibe bad id', argv: () => vibe('show', '0197c3a0'), setup: partner },
  {
    name: 'partner vibe customer key',
    argv: () => vibe('show', VIBE_ACCOUNT),
    setup: ({ api }) => seedVibe(api),
  },
];

screenSuite(SCENARIOS);
