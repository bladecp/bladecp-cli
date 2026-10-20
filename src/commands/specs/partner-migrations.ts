import type { GroupSpec, OptionDef } from '../../args.js';

/**
 * Options only this group uses. Every Fast Deploy request of a partner
 * belongs to one WHMCS installation and one client of it, so the requests
 * are always named with both.
 */
export const options = {
  installation: {
    type: 'string',
    syntax: '--installation <id>',
    key: 'partnerMigrations.option.installation',
  },
  client: { type: 'string', syntax: '--client <id>', key: 'partnerMigrations.option.client' },
  company: {
    type: 'string',
    syntax: '--company <name>',
    key: 'partnerMigrations.option.company',
  },
} as const satisfies Record<string, OptionDef>;

const SCOPE = '--installation <id> --client <id>';
const EXAMPLE_SCOPE = '--installation 01980000-0000-7000-8000-0000000000a1 --client 42';
const EXAMPLE_REQUEST = '01979f2c-0000-7000-8000-000000000002';

export const group: GroupSpec = {
  topics: [
    {
      path: ['partner', 'migrations'],
      summary: 'partnerMigrations.help.topic',
      group: 'partner',
      partner: true,
    },
  ],
  commands: [
    {
      id: 'partner.migrations.list',
      path: ['partner', 'migrations', 'list'],
      args: [],
      options: ['installation', 'client', 'limit', 'all'],
      usage:
        'bladecp partner migrations list --installation <id> [--client <id>] [--limit <n>] [--all]',
      summary: 'partnerMigrations.help.list',
      group: 'partner',
      partner: true,
      optionHelp: {
        client: 'partnerMigrations.option.clientFilter',
        limit: 'partnerMigrations.option.limit',
        all: 'partnerMigrations.option.all',
      },
    },
    {
      id: 'partner.migrations.show',
      path: ['partner', 'migrations', 'show'],
      args: ['request'],
      options: ['installation', 'client', 'watch'],
      usage: `bladecp partner migrations show <request> ${SCOPE} [--watch]`,
      summary: 'partnerMigrations.help.show',
      group: 'partner',
      partner: true,
      optionHelp: { watch: 'partnerMigrations.option.watch' },
    },
    {
      id: 'partner.migrations.review',
      path: ['partner', 'migrations', 'review'],
      args: ['request'],
      options: ['installation', 'client', 'domain'],
      usage: `bladecp partner migrations review <request> ${SCOPE} --domain <host>`,
      summary: 'partnerMigrations.help.review',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.migrations.approve',
      path: ['partner', 'migrations', 'approve'],
      args: ['request'],
      options: ['installation', 'client', 'yes'],
      usage: `bladecp partner migrations approve <request> ${SCOPE} [--yes]`,
      summary: 'partnerMigrations.help.approve',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.migrations.cancel',
      path: ['partner', 'migrations', 'cancel'],
      args: ['request'],
      options: ['installation', 'client', 'reason', 'yes'],
      usage: `bladecp partner migrations cancel <request> ${SCOPE} [--reason <text>] [--yes]`,
      summary: 'partnerMigrations.help.cancel',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.migrations.retry',
      path: ['partner', 'migrations', 'retry'],
      args: ['request'],
      options: ['installation', 'client'],
      usage: `bladecp partner migrations retry <request> ${SCOPE}`,
      summary: 'partnerMigrations.help.retry',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.migrations.billing-queue',
      path: ['partner', 'migrations', 'billing-queue'],
      args: [],
      options: ['limit', 'all'],
      usage: 'bladecp partner migrations billing-queue [--limit <n>] [--all]',
      summary: 'partnerMigrations.help.queue',
      group: 'partner',
      partner: true,
      optionHelp: {
        limit: 'partnerMigrations.option.limit',
        all: 'partnerMigrations.option.all',
      },
    },
    {
      id: 'partner.migrations.billing-link',
      path: ['partner', 'migrations', 'billing-link'],
      args: ['request'],
      options: ['installation', 'client', 'external-id', 'email', 'name', 'company', 'yes'],
      usage:
        'bladecp partner migrations billing-link <request> --installation <id> --client <id> --external-id <id> --email <email> --name <name> [--company <name>] [--yes]',
      summary: 'partnerMigrations.help.link',
      group: 'partner',
      partner: true,
      optionHelp: {
        installation: 'partnerMigrations.option.billingInstallation',
        client: 'partnerMigrations.option.billingClient',
        'external-id': 'partnerMigrations.option.service',
        email: 'partnerMigrations.option.ownerEmail',
        name: 'partnerMigrations.option.ownerName',
        yes: 'option.yesConfirm',
      },
    },
    {
      id: 'partner.migrations.claim-url',
      path: ['partner', 'migrations', 'claim-url'],
      args: ['request'],
      options: ['installation', 'client'],
      usage: `bladecp partner migrations claim-url <request> ${SCOPE}`,
      summary: 'partnerMigrations.help.claim',
      group: 'partner',
      partner: true,
    },
  ],
  extras: {
    'partner.migrations.list': {
      desc: 'partnerMigrations.help.listDesc',
      examples: [
        [`bladecp partner migrations list ${EXAMPLE_SCOPE}`, 'partnerMigrations.ex.list'],
        [
          'bladecp partner migrations list --installation 01980000-0000-7000-8000-0000000000a1 --all --json',
          'partnerMigrations.ex.listAll',
        ],
      ],
      notes: ['partnerMigrations.help.scopeNote'],
      seeAlso: ['bladecp partner migrations billing-queue'],
    },
    'partner.migrations.show': {
      desc: 'partnerMigrations.help.showDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations show ${EXAMPLE_REQUEST} ${EXAMPLE_SCOPE}`,
          'partnerMigrations.ex.show',
        ],
        [
          `bladecp partner migrations show 01979f2c ${EXAMPLE_SCOPE} --watch`,
          'partnerMigrations.ex.watch',
        ],
      ],
      exits: [
        [0, 'partnerMigrations.exit.ok'],
        [9, 'partnerMigrations.exit.failed'],
        [10, 'partnerMigrations.exit.action'],
      ],
      notes: ['partnerMigrations.help.scopeNote'],
    },
    'partner.migrations.review': {
      desc: 'partnerMigrations.help.reviewDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations review 01979f2c ${EXAMPLE_SCOPE} --domain example.com`,
          'partnerMigrations.ex.review',
        ],
      ],
    },
    'partner.migrations.approve': {
      desc: 'partnerMigrations.help.approveDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations approve 01979f2c ${EXAMPLE_SCOPE}`,
          'partnerMigrations.ex.approve',
        ],
      ],
      notes: ['partnerMigrations.help.approveNote'],
    },
    'partner.migrations.cancel': {
      desc: 'partnerMigrations.help.cancelDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations cancel 01979f2c ${EXAMPLE_SCOPE} --yes`,
          'partnerMigrations.ex.cancel',
        ],
      ],
    },
    'partner.migrations.retry': {
      desc: 'partnerMigrations.help.retryDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations retry 01979f2c ${EXAMPLE_SCOPE}`,
          'partnerMigrations.ex.retry',
        ],
      ],
    },
    'partner.migrations.billing-queue': {
      desc: 'partnerMigrations.help.queueDesc',
      examples: [
        ['bladecp partner migrations billing-queue', 'partnerMigrations.ex.queue'],
        ['bladecp partner migrations billing-queue --all --json', 'partnerMigrations.ex.queueJson'],
      ],
      seeAlso: ['bladecp partner migrations billing-link <request>'],
    },
    'partner.migrations.billing-link': {
      desc: 'partnerMigrations.help.linkDesc',
      args: [['<request>', 'partnerMigrations.help.queueArg']],
      examples: [
        [
          `bladecp partner migrations billing-link 01979f2c ${EXAMPLE_SCOPE} --external-id 4242 --email owner@example.com --name "Ana Souza"`,
          'partnerMigrations.ex.link',
        ],
      ],
      notes: ['partnerMigrations.help.linkNote'],
      seeAlso: ['bladecp partner migrations billing-queue'],
    },
    'partner.migrations.claim-url': {
      desc: 'partnerMigrations.help.claimDesc',
      args: [['<request>', 'partnerMigrations.help.requestArg']],
      examples: [
        [
          `bladecp partner migrations claim-url 01979f2c ${EXAMPLE_SCOPE}`,
          'partnerMigrations.ex.claim',
        ],
      ],
      notes: ['partnerMigrations.help.claimNote'],
    },
  },
};
