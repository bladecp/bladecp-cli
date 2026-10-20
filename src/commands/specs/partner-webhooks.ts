import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {
  endpoint: {
    type: 'string',
    syntax: '--endpoint <id>',
    key: 'partnerWebhooks.option.endpoint',
  },
} as const satisfies Record<string, OptionDef>;

const ENDPOINT_ARG: [string, 'partnerWebhooks.help.endpointArg'] = [
  '<endpoint>',
  'partnerWebhooks.help.endpointArg',
];

export const group: GroupSpec = {
  topics: [
    {
      path: ['partner', 'webhooks'],
      summary: 'partnerWebhooks.help.topic',
      group: 'partner',
      partner: true,
    },
  ],
  commands: [
    {
      id: 'partner.webhooks.list',
      path: ['partner', 'webhooks', 'list'],
      args: [],
      options: [],
      usage: 'bladecp partner webhooks list',
      summary: 'partnerWebhooks.help.list',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.webhooks.show',
      path: ['partner', 'webhooks', 'show'],
      args: ['endpoint'],
      options: [],
      usage: 'bladecp partner webhooks show <endpoint>',
      summary: 'partnerWebhooks.help.show',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.webhooks.create',
      path: ['partner', 'webhooks', 'create'],
      args: [],
      options: ['url', 'event', 'name'],
      usage: 'bladecp partner webhooks create --url <url> --event <type>... [--name <name>]',
      summary: 'partnerWebhooks.help.create',
      group: 'partner',
      partner: true,
      optionHelp: {
        url: 'partnerWebhooks.option.url',
        event: 'partnerWebhooks.option.event',
        name: 'partnerWebhooks.option.name',
      },
    },
    {
      id: 'partner.webhooks.update',
      path: ['partner', 'webhooks', 'update'],
      args: ['endpoint'],
      options: ['url', 'event', 'name', 'yes'],
      usage:
        'bladecp partner webhooks update <endpoint> [--url <url>] [--event <type>...] [--name <name>] [--yes]',
      summary: 'partnerWebhooks.help.update',
      group: 'partner',
      partner: true,
      optionHelp: {
        url: 'partnerWebhooks.option.url',
        event: 'partnerWebhooks.option.eventReplace',
        name: 'partnerWebhooks.option.nameUpdate',
        yes: 'partnerWebhooks.option.yesChange',
      },
    },
    {
      id: 'partner.webhooks.pause',
      path: ['partner', 'webhooks', 'pause'],
      args: ['endpoint'],
      options: ['yes'],
      usage: 'bladecp partner webhooks pause <endpoint> [--yes]',
      summary: 'partnerWebhooks.help.pause',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'partnerWebhooks.option.yesPause' },
    },
    {
      id: 'partner.webhooks.resume',
      path: ['partner', 'webhooks', 'resume'],
      args: ['endpoint'],
      options: ['yes'],
      usage: 'bladecp partner webhooks resume <endpoint> [--yes]',
      summary: 'partnerWebhooks.help.resume',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'partnerWebhooks.option.yesChange' },
    },
    {
      id: 'partner.webhooks.delete',
      path: ['partner', 'webhooks', 'delete'],
      args: ['endpoint'],
      options: ['yes'],
      usage: 'bladecp partner webhooks delete <endpoint> [--yes]',
      summary: 'partnerWebhooks.help.delete',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'partnerWebhooks.option.yesDelete' },
    },
    {
      id: 'partner.webhooks.rotate-secret',
      path: ['partner', 'webhooks', 'rotate-secret'],
      args: ['endpoint'],
      options: ['yes'],
      usage: 'bladecp partner webhooks rotate-secret <endpoint> [--yes]',
      summary: 'partnerWebhooks.help.rotate',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'partnerWebhooks.option.yesRotate' },
    },
    {
      id: 'partner.webhooks.deliveries',
      path: ['partner', 'webhooks', 'deliveries'],
      args: [],
      options: ['endpoint', 'status', 'page', 'limit'],
      usage:
        'bladecp partner webhooks deliveries [--endpoint <id>] [--status <status>] [--page <n>] [--limit <n>]',
      summary: 'partnerWebhooks.help.deliveries',
      group: 'partner',
      partner: true,
      optionHelp: {
        status: 'partnerWebhooks.option.status',
        limit: 'partnerWebhooks.option.limit',
      },
    },
    {
      id: 'partner.webhooks.replay',
      path: ['partner', 'webhooks', 'replay'],
      args: ['delivery'],
      options: ['yes'],
      usage: 'bladecp partner webhooks replay <delivery> [--yes]',
      summary: 'partnerWebhooks.help.replay',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'partnerWebhooks.option.yesChange' },
    },
  ],
  extras: {
    'partner.webhooks.list': {
      desc: 'partnerWebhooks.help.listDesc',
      examples: [['bladecp partner webhooks', 'partnerWebhooks.ex.list']],
      seeAlso: ['bladecp partner webhooks create', 'bladecp partner webhooks deliveries'],
    },
    'partner.webhooks.show': {
      args: [ENDPOINT_ARG],
      examples: [['bladecp partner webhooks show 0198c2a0', 'partnerWebhooks.ex.show']],
      seeAlso: ['bladecp partner webhooks deliveries --endpoint <id>'],
    },
    'partner.webhooks.create': {
      desc: 'partnerWebhooks.help.createDesc',
      notes: ['partnerWebhooks.help.events', 'partnerWebhooks.help.dedupe'],
      examples: [
        [
          'bladecp partner webhooks create --url https://billing.example.com/bladecp --event invoice.paid --event provision.created --name "Production WHMCS"',
          'partnerWebhooks.ex.create',
        ],
      ],
      seeAlso: ['bladecp partner webhooks rotate-secret <endpoint>'],
    },
    'partner.webhooks.update': {
      desc: 'partnerWebhooks.help.updateDesc',
      args: [ENDPOINT_ARG],
      notes: ['partnerWebhooks.help.events'],
      examples: [
        [
          'bladecp partner webhooks update 0198c2a0 --url https://hooks.example.com/bladecp',
          'partnerWebhooks.ex.update',
        ],
      ],
    },
    'partner.webhooks.pause': {
      desc: 'partnerWebhooks.help.pauseDesc',
      args: [ENDPOINT_ARG],
      examples: [['bladecp partner webhooks pause 0198c2a0', 'partnerWebhooks.ex.pause']],
      seeAlso: ['bladecp partner webhooks resume <endpoint>'],
    },
    'partner.webhooks.resume': {
      desc: 'partnerWebhooks.help.resumeDesc',
      args: [ENDPOINT_ARG],
      examples: [['bladecp partner webhooks resume 0198c2a0', 'partnerWebhooks.ex.resume']],
      seeAlso: ['bladecp partner webhooks pause <endpoint>'],
    },
    'partner.webhooks.delete': {
      desc: 'partnerWebhooks.help.deleteDesc',
      args: [ENDPOINT_ARG],
      examples: [['bladecp partner webhooks delete 0198c2a0 --yes', 'partnerWebhooks.ex.delete']],
      seeAlso: ['bladecp partner webhooks pause <endpoint>'],
    },
    'partner.webhooks.rotate-secret': {
      desc: 'partnerWebhooks.help.rotateDesc',
      args: [ENDPOINT_ARG],
      examples: [['bladecp partner webhooks rotate-secret 0198c2a0', 'partnerWebhooks.ex.rotate']],
    },
    'partner.webhooks.deliveries': {
      desc: 'partnerWebhooks.help.deliveriesDesc',
      examples: [
        ['bladecp partner webhooks deliveries', 'partnerWebhooks.ex.deliveries'],
        [
          'bladecp partner webhooks deliveries --endpoint 0198c2a0 --status failed',
          'partnerWebhooks.ex.deliveriesFailed',
        ],
      ],
      seeAlso: ['bladecp partner webhooks replay <delivery>'],
    },
    'partner.webhooks.replay': {
      desc: 'partnerWebhooks.help.replayDesc',
      args: [['<delivery>', 'partnerWebhooks.help.deliveryArg']],
      notes: ['partnerWebhooks.help.dedupe'],
      examples: [['bladecp partner webhooks replay 0198d4b1', 'partnerWebhooks.ex.replay']],
      seeAlso: ['bladecp partner webhooks deliveries'],
    },
  },
  // i18n-exempt: the words of a command group, not text for people.
  defaults: { 'partner webhooks': 'partner.webhooks.list' },
};
