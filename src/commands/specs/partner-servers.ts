import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {
  component: {
    type: 'string',
    multiple: true,
    syntax: '--component <slug>[@<version>]',
    key: 'partnerServers.option.component',
  },
  contract: {
    type: 'string',
    syntax: '--contract <months>',
    key: 'partnerServers.option.contract',
  },
  now: { type: 'boolean', syntax: '--now', key: 'partnerServers.option.now' },
  'reason-category': {
    type: 'string',
    syntax: '--reason-category <category>',
    key: 'partnerServers.option.reasonCategory',
  },
} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  topics: [
    {
      path: ['partner', 'servers'],
      summary: 'partnerServers.help.topic',
      group: 'partner',
      partner: true,
    },
  ],
  commands: [
    {
      id: 'partner.servers.list',
      path: ['partner', 'servers', 'list'],
      args: [],
      options: ['status', 'domain', 'external-id', 'page', 'limit'],
      usage:
        'bladecp partner servers list [--status <status>] [--domain <host>] [--external-id <id>] [--page <n>] [--limit <n>]',
      summary: 'partnerServers.help.list',
      group: 'partner',
      partner: true,
      optionHelp: {
        domain: 'partnerServers.option.domainFilter',
        'external-id': 'partnerServers.option.externalIdFilter',
        limit: 'partnerServers.option.limit',
      },
    },
    {
      id: 'partner.servers.create',
      path: ['partner', 'servers', 'create'],
      args: [],
      options: [
        'plan',
        'location',
        'domain',
        'email',
        'name',
        'external-id',
        'option',
        'component',
        'contract',
        'yes',
      ],
      usage:
        'bladecp partner servers create --plan <id> --location <id> --domain <host> --email <email> --name <name> [--external-id <id>] [--option <id>=<value>]... [--component <slug>]... [--contract <months>] [--yes]',
      summary: 'partnerServers.help.create',
      group: 'partner',
      partner: true,
      optionHelp: {
        plan: 'partnerServers.option.plan',
        location: 'partnerServers.option.location',
        domain: 'partnerServers.option.domain',
        email: 'partnerServers.option.email',
        name: 'partnerServers.option.name',
        'external-id': 'partnerServers.option.externalId',
        option: 'partnerServers.option.option',
        yes: 'option.yesConfirm',
      },
    },
    {
      id: 'partner.servers.plan',
      path: ['partner', 'servers', 'plan'],
      args: ['server', 'plan'],
      options: ['yes'],
      usage: 'bladecp partner servers plan <server> <plan> [--yes]',
      summary: 'partnerServers.help.plan',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.options',
      path: ['partner', 'servers', 'options'],
      args: ['server'],
      options: ['option', 'yes'],
      usage: 'bladecp partner servers options <server> --option <id>=<value>... [--yes]',
      summary: 'partnerServers.help.options',
      group: 'partner',
      partner: true,
      optionHelp: { option: 'partnerServers.option.option', yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.suspend',
      path: ['partner', 'servers', 'suspend'],
      args: ['server'],
      options: ['yes'],
      usage: 'bladecp partner servers suspend <server> [--yes]',
      summary: 'partnerServers.help.suspend',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.unsuspend',
      path: ['partner', 'servers', 'unsuspend'],
      args: ['server'],
      options: ['yes'],
      usage: 'bladecp partner servers unsuspend <server> [--yes]',
      summary: 'partnerServers.help.unsuspend',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.cancel',
      path: ['partner', 'servers', 'cancel'],
      args: ['server'],
      options: ['now', 'reason', 'reason-category', 'yes'],
      usage:
        'bladecp partner servers cancel <server> [--now] [--reason <text>] [--reason-category <category>] [--yes]',
      summary: 'partnerServers.help.cancel',
      group: 'partner',
      partner: true,
      optionHelp: { reason: 'partnerServers.option.reason', yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.delete',
      path: ['partner', 'servers', 'delete'],
      args: ['server'],
      options: ['yes'],
      usage: 'bladecp partner servers delete <server> [--yes]',
      summary: 'partnerServers.help.delete',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    {
      id: 'partner.servers.open',
      path: ['partner', 'servers', 'open'],
      args: ['server'],
      options: [],
      usage: 'bladecp partner servers open <server>',
      summary: 'partnerServers.help.open',
      group: 'partner',
      partner: true,
    },
  ],
  extras: {
    'partner.servers.list': {
      desc: 'partnerServers.help.listDesc',
      examples: [
        ['bladecp partner servers', 'partnerServers.ex.list'],
        ['bladecp partner servers list --external-id 1042', 'partnerServers.ex.listExternal'],
        [
          'bladecp partner servers list --status suspended --limit 50',
          'partnerServers.ex.listStatus',
        ],
      ],
      seeAlso: ['bladecp servers show <uuid>'],
    },
    'partner.servers.create': {
      desc: 'partnerServers.help.createDesc',
      examples: [
        [
          'bladecp partner servers create --plan 12 --location 3 --domain example.com --email owner@example.com --name "Example Shop" --external-id 1042',
          'partnerServers.ex.create',
        ],
        [
          'bladecp partner servers create --plan 12 --location 3 --domain example.com --email owner@example.com --name "Example Shop" --option memory=4 --component php',
          'partnerServers.ex.createOptions',
        ],
      ],
      notes: ['partnerServers.help.createNote', 'partnerServers.help.componentNote'],
      seeAlso: ['bladecp partner plans', 'bladecp partner locations', 'bladecp partner options'],
    },
    'partner.servers.plan': {
      desc: 'partnerServers.help.planDesc',
      args: [
        ['<server>', 'partnerServers.help.serverArg'],
        ['<plan>', 'partnerServers.help.planArg'],
      ],
      examples: [['bladecp partner servers plan 0197a1c4 21', 'partnerServers.ex.plan']],
      seeAlso: ['bladecp partner plans'],
    },
    'partner.servers.options': {
      desc: 'partnerServers.help.optionsDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [
        [
          'bladecp partner servers options 0197a1c4 --option memory=8 --option backups=daily',
          'partnerServers.ex.options',
        ],
        [
          'bladecp partner servers options 0197a1c4 --option memory=2',
          'partnerServers.ex.optionsReset',
        ],
      ],
      notes: ['partnerServers.help.optionsNote'],
      seeAlso: ['bladecp partner options'],
    },
    'partner.servers.suspend': {
      desc: 'partnerServers.help.suspendDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [['bladecp partner servers suspend 0197a1c4', 'partnerServers.ex.suspend']],
      seeAlso: ['bladecp partner servers unsuspend <server>'],
    },
    'partner.servers.unsuspend': {
      desc: 'partnerServers.help.unsuspendDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [['bladecp partner servers unsuspend 0197a1c4', 'partnerServers.ex.unsuspend']],
    },
    'partner.servers.cancel': {
      desc: 'partnerServers.help.cancelDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [
        ['bladecp partner servers cancel 0197a1c4', 'partnerServers.ex.cancel'],
        [
          'bladecp partner servers cancel 0197a1c4 --now --reason-category too-expensive --reason "The customer closed the online store"',
          'partnerServers.ex.cancelNow',
        ],
      ],
      notes: ['partnerServers.help.cancelNote'],
      seeAlso: ['bladecp partner servers delete <server>'],
    },
    'partner.servers.delete': {
      desc: 'partnerServers.help.deleteDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [['bladecp partner servers delete 0197a1c4', 'partnerServers.ex.delete']],
      seeAlso: ['bladecp partner servers cancel <server>'],
    },
    'partner.servers.open': {
      desc: 'partnerServers.help.openDesc',
      args: [['<server>', 'partnerServers.help.serverArg']],
      examples: [
        ['bladecp partner servers open 0197a1c4', 'partnerServers.ex.open'],
        ['bladecp partner servers open 0197a1c4 --json', 'partnerServers.ex.openJson'],
      ],
    },
  },
  // i18n-exempt: the words of a command group, as people type them
  defaults: { 'partner servers': 'partner.servers.list' },
};
