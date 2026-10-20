// Photos of the `bladecp partner` catalog screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner.test.ts -u

process.env.TZ = 'UTC';

import { partnerCatalog } from './helpers/mock/partner.js';
import { type Scenario, screenSuite } from './helpers/screens.js';

const partner: Scenario['setup'] = ({ api }) => api.setPartner();

const SCENARIOS: Scenario[] = [
  { name: 'help partner', argv: () => ['partner', '--help'], signedOut: true },
  { name: 'help partner options', argv: () => ['partner', 'options', '--help'], signedOut: true },
  { name: 'partner plans', argv: () => ['partner', 'plans'], setup: partner },
  {
    name: 'partner plans in one currency',
    argv: () => ['partner', 'plans', '--currency', 'BRL'],
    setup: partner,
  },
  {
    name: 'partner plans empty',
    argv: () => ['partner', 'plans'],
    setup: ({ api }) => {
      api.setPartner();
      partnerCatalog(api).plans = [];
    },
  },
  { name: 'partner locations', argv: () => ['partner', 'locations'], setup: partner },
  {
    name: 'partner locations of a plan without any',
    argv: () => ['partner', 'locations', '--plan', '30'],
    setup: partner,
  },
  { name: 'partner options', argv: () => ['partner', 'options'], setup: partner },
  {
    name: 'partner options of a plan without any',
    argv: () => ['partner', 'options', '--plan', '30'],
    setup: partner,
  },
  { name: 'partner branding', argv: () => ['partner', 'branding'], setup: partner },
  { name: 'partner plans with a customer key', argv: () => ['partner', 'plans'] },
];

screenSuite(SCENARIOS);
