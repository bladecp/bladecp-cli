// Photos of the `bladecp partner marketplace` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner-marketplace.test.ts -u

process.env.TZ = 'UTC';

import { marketplace, seedMarketplace } from './helpers/mock/partner-marketplace.js';
import { type Env, type Scenario, screenSuite } from './helpers/screens.js';

const partner = ({ api }: Env) => {
  api.setPartner();
  seedMarketplace(api);
};

const SCENARIOS: Scenario[] = [
  {
    name: 'help partner marketplace',
    argv: () => ['partner', 'marketplace', '--help'],
    signedOut: true,
  },
  { name: 'marketplace summary', argv: () => ['partner', 'marketplace'], setup: partner },
  {
    name: 'marketplace summary empty',
    argv: () => ['partner', 'marketplace', 'summary'],
    setup: ({ api }) => api.setPartner(),
  },
  {
    name: 'marketplace orders',
    argv: () => ['partner', 'marketplace', 'orders', '--limit', '2'],
    setup: partner,
  },
  {
    name: 'marketplace orders empty',
    argv: () => ['partner', 'marketplace', 'orders'],
    setup: ({ api }) => api.setPartner(),
  },
  {
    name: 'marketplace commissions',
    argv: () => ['partner', 'marketplace', 'commissions'],
    setup: partner,
  },
  {
    name: 'marketplace statements',
    argv: () => ['partner', 'marketplace', 'statements'],
    setup: partner,
  },
  {
    name: 'marketplace statement',
    argv: () => ['partner', 'marketplace', 'statement', '12'],
    setup: partner,
  },
  {
    name: 'marketplace statement without lines',
    argv: () => ['partner', 'marketplace', 'statement', '9'],
    setup: partner,
  },
  {
    name: 'marketplace invoices',
    argv: () => ['partner', 'marketplace', 'invoices'],
    setup: partner,
  },
  {
    name: 'marketplace invoices not marked',
    argv: () => ['partner', 'marketplace', 'invoices'],
    setup: (env) => {
      partner(env);
      const data = marketplace(env.api);
      data.invoices = { ...data.invoices, explicit: false, subscriptionLabel: null };
    },
  },
  {
    name: 'marketplace for a customer key',
    argv: () => ['partner', 'marketplace', 'summary'],
  },
];

screenSuite(SCENARIOS);
