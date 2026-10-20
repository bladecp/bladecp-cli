import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  topics: [
    {
      path: ['partner', 'marketplace'],
      summary: 'partnerMarket.help.topic',
      group: 'partner',
      partner: true,
    },
  ],
  commands: [
    {
      id: 'partner.marketplace.summary',
      path: ['partner', 'marketplace', 'summary'],
      args: [],
      options: [],
      usage: 'bladecp partner marketplace summary',
      summary: 'partnerMarket.help.summary',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.marketplace.orders',
      path: ['partner', 'marketplace', 'orders'],
      args: [],
      options: ['status', 'page', 'limit'],
      usage: 'bladecp partner marketplace orders [--status <status>] [--page <n>] [--limit <n>]',
      summary: 'partnerMarket.help.orders',
      group: 'partner',
      partner: true,
      optionHelp: {
        status: 'partnerMarket.option.orderStatus',
        limit: 'partnerMarket.option.limit',
      },
    },
    {
      id: 'partner.marketplace.commissions',
      path: ['partner', 'marketplace', 'commissions'],
      args: [],
      options: ['status', 'page', 'limit'],
      usage:
        'bladecp partner marketplace commissions [--status <status>] [--page <n>] [--limit <n>]',
      summary: 'partnerMarket.help.commissions',
      group: 'partner',
      partner: true,
      optionHelp: {
        status: 'partnerMarket.option.lineStatus',
        limit: 'partnerMarket.option.limit',
      },
    },
    {
      id: 'partner.marketplace.statements',
      path: ['partner', 'marketplace', 'statements'],
      args: [],
      options: [],
      usage: 'bladecp partner marketplace statements',
      summary: 'partnerMarket.help.statements',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.marketplace.statement',
      path: ['partner', 'marketplace', 'statement'],
      args: ['statement'],
      options: [],
      usage: 'bladecp partner marketplace statement <statement>',
      summary: 'partnerMarket.help.statement',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.marketplace.invoices',
      path: ['partner', 'marketplace', 'invoices'],
      args: [],
      options: [],
      usage: 'bladecp partner marketplace invoices',
      summary: 'partnerMarket.help.invoices',
      group: 'partner',
      partner: true,
    },
  ],
  extras: {
    'partner.marketplace.summary': {
      desc: 'partnerMarket.help.summaryDesc',
      notes: ['partnerMarket.help.stages'],
      examples: [
        ['bladecp partner marketplace', 'partnerMarket.ex.summary'],
        ['bladecp partner marketplace summary --json', 'partnerMarket.ex.json'],
      ],
      seeAlso: ['bladecp partner marketplace orders', 'bladecp partner marketplace statements'],
    },
    'partner.marketplace.orders': {
      desc: 'partnerMarket.help.ordersDesc',
      examples: [
        ['bladecp partner marketplace orders', 'partnerMarket.ex.orders'],
        ['bladecp partner marketplace orders --page 2 --limit 50', 'partnerMarket.ex.ordersPage'],
      ],
      seeAlso: ['bladecp partner marketplace commissions'],
    },
    'partner.marketplace.commissions': {
      desc: 'partnerMarket.help.commissionsDesc',
      notes: ['partnerMarket.help.stages'],
      examples: [
        [
          'bladecp partner marketplace commissions --status pending',
          'partnerMarket.ex.commissions',
        ],
      ],
      seeAlso: ['bladecp partner marketplace statements'],
    },
    'partner.marketplace.statements': {
      desc: 'partnerMarket.help.statementsDesc',
      examples: [['bladecp partner marketplace statements', 'partnerMarket.ex.statements']],
      seeAlso: ['bladecp partner marketplace statement <statement>'],
    },
    'partner.marketplace.statement': {
      desc: 'partnerMarket.help.statementDesc',
      args: [['<statement>', 'partnerMarket.help.statementArg']],
      examples: [['bladecp partner marketplace statement 12', 'partnerMarket.ex.statement']],
      seeAlso: ['bladecp partner marketplace statements'],
    },
    'partner.marketplace.invoices': {
      desc: 'partnerMarket.help.invoicesDesc',
      examples: [['bladecp partner marketplace invoices', 'partnerMarket.ex.invoices']],
      seeAlso: ['bladecp partner marketplace statements'],
    },
  },
  // i18n-exempt: the words of a command group, not text for people.
  defaults: { 'partner marketplace': 'partner.marketplace.summary' },
};
