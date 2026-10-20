// Photos of the `bladecp components` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-components.test.ts -u

process.env.TZ = 'UTC';

import { COMPONENTS, seedComponents } from './helpers/mock/components.js';
import { type Scenario, screenSuite } from './helpers/screens.js';

const SCENARIOS: Scenario[] = [
  { name: 'help components', argv: () => ['components', '--help'], signedOut: true },
  { name: 'components list', argv: () => ['components'] },
  {
    name: 'components list outside the plan',
    argv: () => ['components', 'list'],
    setup: ({ api }) =>
      seedComponents(
        api,
        COMPONENTS.map((c) => (c.slug === 'redis' ? { ...c, allowed_for_tier: false } : c)),
      ),
  },
  {
    name: 'components list empty',
    argv: () => ['components'],
    setup: ({ api }) => seedComponents(api, []),
  },
];

screenSuite(SCENARIOS);
