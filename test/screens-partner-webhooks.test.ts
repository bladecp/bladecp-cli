// Photos of the `bladecp partner webhooks` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner-webhooks.test.ts -u

process.env.TZ = 'UTC';

import { seedWebhooks, webhooks } from './helpers/mock/partner-webhooks.js';
import { type Env, type Scenario, screenSuite } from './helpers/screens.js';

const partner = ({ api }: Env) => {
  api.setPartner();
  seedWebhooks(api);
};

const enter = () => ({ answers: [''] });

const SCENARIOS: Scenario[] = [
  { name: 'help partner webhooks', argv: () => ['partner', 'webhooks', '--help'], signedOut: true },
  {
    name: 'help partner webhooks create',
    argv: () => ['partner', 'webhooks', 'create', '--help'],
    signedOut: true,
  },
  { name: 'webhooks list', argv: () => ['partner', 'webhooks'], setup: partner },
  {
    name: 'webhooks list empty',
    argv: () => ['partner', 'webhooks', 'list'],
    setup: ({ api }) => api.setPartner(),
  },
  {
    name: 'webhooks show',
    argv: () => ['partner', 'webhooks', 'show', '0198c2a0'],
    setup: partner,
  },
  {
    name: 'webhooks create',
    argv: () => [
      'partner',
      'webhooks',
      'create',
      '--url',
      'https://crm.example.com/hooks',
      '--event',
      'invoice.paid,provision.created',
      '--name',
      'CRM',
    ],
    setup: partner,
  },
  {
    name: 'webhooks update',
    argv: () => [
      'partner',
      'webhooks',
      'update',
      '0198c2a0',
      '--url',
      'https://new.example.com/hooks',
      '--event',
      'invoice.paid',
    ],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks pause declined',
    argv: () => ['partner', 'webhooks', 'pause', '0198c2a0'],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks pause',
    argv: () => ['partner', 'webhooks', 'pause', '0198c2a0', '--yes'],
    setup: partner,
  },
  {
    name: 'webhooks resume',
    argv: () => ['partner', 'webhooks', 'resume', '0198b7e5'],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks delete declined',
    argv: () => ['partner', 'webhooks', 'delete', '0198c2a0'],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks delete',
    argv: () => ['partner', 'webhooks', 'delete', '0198c2a0', '--yes'],
    setup: partner,
  },
  {
    name: 'webhooks rotate-secret declined',
    argv: () => ['partner', 'webhooks', 'rotate-secret', '0198c2a0'],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks rotate-secret',
    argv: () => ['partner', 'webhooks', 'rotate-secret', '0198c2a0', '--yes'],
    setup: partner,
  },
  {
    name: 'webhooks deliveries',
    argv: () => ['partner', 'webhooks', 'deliveries'],
    setup: partner,
  },
  {
    name: 'webhooks deliveries empty',
    argv: () => ['partner', 'webhooks', 'deliveries', '--status', 'dead'],
    setup: (env) => {
      partner(env);
      webhooks(env.api).deliveries = [];
    },
  },
  {
    name: 'webhooks replay',
    argv: () => ['partner', 'webhooks', 'replay', '0198d3a7'],
    setup: partner,
    options: enter,
  },
  {
    name: 'webhooks bad address',
    argv: () => [
      'partner',
      'webhooks',
      'create',
      '--url',
      'http://crm.example.com',
      '--event',
      'invoice.paid',
    ],
    setup: partner,
  },
  { name: 'webhooks for a customer key', argv: () => ['partner', 'webhooks', 'list'] },
];

screenSuite(SCENARIOS);
