// Photos of the `bladecp partner migrations` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-partner-migrations.test.ts -u

process.env.TZ = 'UTC';

import {
  addPartnerRequest,
  BILLING_INSTALLATION,
  CLIENT,
  INSTALLATION,
  partnerMigrations,
} from './helpers/mock/partner-migrations.js';
import type { MockApi } from './helpers/mock-api.js';
import { type Scenario, screenSuite } from './helpers/screens.js';

const READY = '01979f2c-0000-7000-8000-000000000002';
const IMPORTING = '01979e11-0000-7000-8000-000000000003';
const FAILED = '01979d00-0000-7000-8000-000000000004';
const DONE = '01979c00-0000-7000-8000-000000000005';
const QUEUED = '0197a100-0000-7000-8000-000000000006';
const QUEUED_TRIAL = '0197a101-0000-7000-8000-000000000007';
const CLAIM = '0197a200-0000-7000-8000-000000000008';
const SCOPE = ['--installation', INSTALLATION, '--client', CLIENT];

function seed(api: MockApi): void {
  api.setPartner();
  addPartnerRequest(api, {
    requestUuid: READY,
    phase: 'awaiting_approval',
    primaryDomain: 'shop.example.org',
    sourcePrimaryDomain: 'shop.example.org',
    stagingUrl: 'https://01979f2c.preview.example.net',
    components: [
      { name: 'files', status: 'completed' },
      { name: 'database', status: 'completed' },
    ],
    externalServiceId: '4242',
    createdAt: '2026-10-16T18:20:00.000Z',
  });
  addPartnerRequest(api, {
    requestUuid: IMPORTING,
    phase: 'importing',
    primaryDomain: 'blog.example.com',
    components: [
      { name: 'files', status: 'running' },
      { name: 'database', status: 'pending' },
    ],
    mode: 'trial',
    state: 'trial_active',
    createdAt: '2026-10-15T09:00:00.000Z',
  });
  addPartnerRequest(api, {
    requestUuid: FAILED,
    phase: 'failed',
    primaryDomain: 'old.example.net',
    retryReason: 'backup_unavailable',
    createdAt: '2026-10-12T14:45:00.000Z',
  });
}

function seedQueue(api: MockApi): void {
  api.setPartner();
  addPartnerRequest(api, {
    requestUuid: QUEUED,
    phase: 'uploading',
    billingLink: 'pending',
    state: 'awaiting_payment',
    createdAt: '2026-10-17T08:10:00.000Z',
    source: {
      kind: 'cpanel',
      server_hostname: 'server1.host.example.com',
      username: 'alice',
      owner: 'root',
      domain: 'alice.example.com',
      initiated_by: 'root',
    },
  });
  addPartnerRequest(api, {
    requestUuid: QUEUED_TRIAL,
    phase: 'draft',
    billingLink: 'pending',
    mode: 'trial',
    state: 'ready',
    createdAt: '2026-10-17T09:30:00.000Z',
    source: {
      kind: 'cpanel',
      server_hostname: 'server2.host.example.com',
      username: 'bruno',
      owner: 'reseller1',
      domain: 'bruno-store.example.org',
      initiated_by: 'reseller',
    },
  });
}

const LINK = [
  '--installation',
  BILLING_INSTALLATION,
  '--client',
  '42',
  '--external-id',
  '4242',
  '--email',
  'owner@example.com',
  '--name',
  'Ana Souza',
];

const SCENARIOS: Scenario[] = [
  {
    name: 'help partner migrations',
    argv: () => ['partner', 'migrations', '--help'],
    signedOut: true,
  },
  {
    name: 'help partner migrations show',
    argv: () => ['partner', 'migrations', 'show', '--help'],
    signedOut: true,
  },
  {
    name: 'partner migrations list',
    argv: () => ['partner', 'migrations', 'list', ...SCOPE],
    setup: ({ api }) => seed(api),
  },
  {
    name: 'partner migrations list installation',
    argv: () => ['partner', 'migrations', 'list', '--installation', INSTALLATION],
    setup: ({ api }) => {
      seed(api);
      addPartnerRequest(api, {
        requestUuid: CLAIM,
        externalClientId: '7',
        phase: 'uploading',
        billingLink: 'claim_required',
        createdAt: '2026-10-17T11:00:00.000Z',
      });
    },
  },
  {
    name: 'partner migrations list empty',
    argv: () => ['partner', 'migrations', 'list', '--installation', INSTALLATION, '--client', '7'],
    setup: ({ api }) => seed(api),
  },
  {
    name: 'partner migrations show',
    argv: () => ['partner', 'migrations', 'show', '01979f2c', ...SCOPE],
    setup: ({ api }) => seed(api),
  },
  {
    name: 'partner migrations show complete',
    argv: () => ['partner', 'migrations', 'show', DONE, ...SCOPE],
    setup: ({ api }) => {
      seed(api);
      addPartnerRequest(api, {
        requestUuid: DONE,
        phase: 'cutover_pending',
        primaryDomain: 'shop.example.org',
        stagingUrl: 'https://01979c00.preview.example.net',
        cutoverTarget: '203.0.113.10',
        components: [
          { name: 'files', status: 'completed' },
          { name: 'database', status: 'completed' },
        ],
        externalServiceId: '4242',
        dueAt: '2026-11-16T00:00:00.000Z',
      });
    },
  },
  {
    name: 'partner migrations show claim',
    argv: () => ['partner', 'migrations', 'show', CLAIM, ...SCOPE],
    setup: ({ api }) => {
      seed(api);
      addPartnerRequest(api, {
        requestUuid: CLAIM,
        phase: 'uploading',
        billingLink: 'claim_required',
        state: 'awaiting_payment',
        clientAreaUrl: 'https://clients.example.com',
        sourcePrimaryDomain: 'alice.example.com',
      });
    },
  },
  {
    name: 'partner migrations show failed',
    argv: () => ['partner', 'migrations', 'show', FAILED, ...SCOPE],
    setup: ({ api }) => seed(api),
  },
  {
    name: 'partner migrations show watch',
    argv: () => ['partner', 'migrations', 'show', IMPORTING, ...SCOPE, '--watch'],
    setup: ({ api }) => {
      seed(api);
      partnerMigrations(api).requests.get(IMPORTING)!.script = [
        'importing',
        'validating',
        'awaiting_approval',
      ];
    },
  },
  {
    name: 'partner migrations review',
    argv: () => [
      'partner',
      'migrations',
      'review',
      IMPORTING,
      ...SCOPE,
      '--domain',
      'blog.example.com',
    ],
    setup: ({ api }) => {
      seed(api);
      const request = partnerMigrations(api).requests.get(IMPORTING)!;
      request.migration.phase = 'discovery_review';
      request.migration.primaryDomain = null;
    },
  },
  {
    name: 'partner migrations approve question',
    argv: () => ['partner', 'migrations', 'approve', READY, ...SCOPE],
    setup: ({ api }) => seed(api),
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner migrations cancel declined',
    argv: () => ['partner', 'migrations', 'cancel', IMPORTING, ...SCOPE],
    setup: ({ api }) => seed(api),
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner migrations retry',
    argv: () => ['partner', 'migrations', 'retry', FAILED, ...SCOPE],
    setup: ({ api }) => {
      seed(api);
      partnerMigrations(api).requests.get(FAILED)!.retryReason = null;
    },
  },
  {
    name: 'partner migrations retry refused',
    argv: () => ['partner', 'migrations', 'retry', FAILED, ...SCOPE],
    setup: ({ api }) => seed(api),
  },
  {
    name: 'partner migrations billing-queue',
    argv: () => ['partner', 'migrations', 'billing-queue'],
    setup: ({ api }) => seedQueue(api),
  },
  {
    name: 'partner migrations billing-queue empty',
    argv: () => ['partner', 'migrations', 'billing-queue'],
    setup: ({ api }) => api.setPartner(),
  },
  {
    name: 'partner migrations billing-link question',
    argv: () => ['partner', 'migrations', 'billing-link', '0197a100', ...LINK],
    setup: ({ api }) => seedQueue(api),
    options: () => ({ answers: [''] }),
  },
  {
    name: 'partner migrations billing-link done',
    argv: () => ['partner', 'migrations', 'billing-link', QUEUED, ...LINK, '--yes'],
    setup: ({ api }) => seedQueue(api),
  },
  {
    name: 'partner migrations claim-url',
    argv: () => ['partner', 'migrations', 'claim-url', CLAIM, ...SCOPE],
    setup: ({ api }) => {
      api.setPartner();
      addPartnerRequest(api, {
        requestUuid: CLAIM,
        phase: 'uploading',
        billingLink: 'claim_required',
        clientAreaUrl: 'https://clients.example.com',
      });
    },
  },
  {
    name: 'partner migrations customer key',
    argv: () => ['partner', 'migrations', 'list', ...SCOPE],
  },
];

screenSuite(SCENARIOS);
