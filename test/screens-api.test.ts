// Photos of the `bladecp api` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-api.test.ts -u

process.env.TZ = 'UTC';

import { type Scenario, screenSuite } from './helpers/screens.js';

const SCENARIOS: Scenario[] = [
  { name: 'help api', argv: () => ['api', '--help'], signedOut: true },
  { name: 'api get', argv: () => ['api', '/customer/me'] },
  { name: 'api list', argv: () => ['api', 'list'], signedOut: true },
  {
    name: 'api delete declined',
    argv: () => ['api', '-X', 'DELETE', '/customer/webhook-endpoints/w1'],
    options: () => ({ answers: [''] }),
  },
  { name: 'api bad path', argv: () => ['api', 'https://example.com/customer/me'] },
];

screenSuite(SCENARIOS);
