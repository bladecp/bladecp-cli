import type { CommandSpec, GroupSpec, OptionDef } from '../../args.js';
import type { MessageKey } from '../../i18n/index.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {
  'email-verification': {
    type: 'string',
    syntax: '--email-verification <verified|not-required>',
    key: 'partnerVibe.option.emailVerification',
  },
} as const satisfies Record<string, OptionDef>;

/** A lifecycle action on one account: `bladecp partner vibe <word> <account> [--yes]`. */
function lifecycle(id: string, word: string, summary: MessageKey): CommandSpec {
  return {
    id,
    path: ['partner', 'vibe', word],
    args: ['account'],
    options: ['yes'],
    usage: `bladecp partner vibe ${word} <account> [--yes]`,
    summary,
    group: 'partner',
    partner: true,
    optionHelp: { yes: 'option.yesConfirm' },
  };
}

const ACCOUNT_ARG: [string, MessageKey] = ['<account>', 'partnerVibe.help.accountArg'];
const EXAMPLE_ACCOUNT = '01970000-0000-7000-8000-00000000c3a0';

export const group: GroupSpec = {
  topics: [
    {
      path: ['partner', 'vibe'],
      summary: 'partnerVibe.help.topic',
      group: 'partner',
      partner: true,
    },
  ],
  commands: [
    {
      id: 'partner.vibe.find',
      path: ['partner', 'vibe', 'find'],
      args: ['external-id'],
      options: [],
      usage: 'bladecp partner vibe find <external-id>',
      summary: 'partnerVibe.help.find',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.vibe.show',
      path: ['partner', 'vibe', 'show'],
      args: ['account'],
      options: [],
      usage: 'bladecp partner vibe show <account>',
      summary: 'partnerVibe.help.show',
      group: 'partner',
      partner: true,
    },
    {
      id: 'partner.vibe.create',
      path: ['partner', 'vibe', 'create'],
      args: [],
      options: ['external-id', 'plan', 'email', 'name', 'email-verification', 'yes'],
      usage:
        'bladecp partner vibe create --external-id <id> --plan <id> --email <email> --name <name> [--email-verification <verified|not-required>] [--yes]',
      summary: 'partnerVibe.help.create',
      group: 'partner',
      partner: true,
      optionHelp: {
        'external-id': 'partnerVibe.option.externalId',
        plan: 'partnerVibe.option.plan',
        email: 'partnerVibe.option.email',
        name: 'partnerVibe.option.name',
        yes: 'option.yesConfirm',
      },
    },
    {
      id: 'partner.vibe.plan',
      path: ['partner', 'vibe', 'plan'],
      args: ['account', 'plan'],
      options: ['yes'],
      usage: 'bladecp partner vibe plan <account> <plan> [--yes]',
      summary: 'partnerVibe.help.plan',
      group: 'partner',
      partner: true,
      optionHelp: { yes: 'option.yesConfirm' },
    },
    lifecycle('partner.vibe.suspend', 'suspend', 'partnerVibe.help.suspend'),
    lifecycle('partner.vibe.reactivate', 'reactivate', 'partnerVibe.help.reactivate'),
    lifecycle('partner.vibe.resume', 'resume', 'partnerVibe.help.resume'),
    lifecycle('partner.vibe.terminate', 'terminate', 'partnerVibe.help.terminate'),
    {
      id: 'partner.vibe.open',
      path: ['partner', 'vibe', 'open'],
      args: ['account'],
      options: ['no-browser'],
      usage: 'bladecp partner vibe open <account> [--no-browser]',
      summary: 'partnerVibe.help.open',
      group: 'partner',
      partner: true,
      optionHelp: { 'no-browser': 'partnerVibe.option.noBrowser' },
    },
  ],
  extras: {
    'partner.vibe.find': {
      desc: 'partnerVibe.help.findDesc',
      args: [['<external-id>', 'partnerVibe.help.externalArg']],
      examples: [
        ['bladecp partner vibe find 4821', 'partnerVibe.ex.find'],
        ['bladecp partner vibe find 4821 --json', 'partnerVibe.ex.findJson'],
      ],
      notes: ['partnerVibe.help.findNote'],
      seeAlso: ['bladecp partner vibe show <account>', 'bladecp partner vibe create'],
    },
    'partner.vibe.show': {
      desc: 'partnerVibe.help.showDesc',
      args: [ACCOUNT_ARG],
      examples: [[`bladecp partner vibe show ${EXAMPLE_ACCOUNT}`, 'partnerVibe.ex.show']],
      notes: ['partnerVibe.help.accountNote'],
      seeAlso: ['bladecp partner vibe find <external-id>'],
    },
    'partner.vibe.create': {
      desc: 'partnerVibe.help.createDesc',
      examples: [
        [
          'bladecp partner vibe create --external-id 4821 --plan <plan-uuid> --email owner@example.com --name "Store Owner"',
          'partnerVibe.ex.create',
        ],
        [
          'bladecp partner vibe create --external-id 4822 --plan <plan-uuid> --email owner@example.com --name "Store Owner" --email-verification verified',
          'partnerVibe.ex.createFree',
        ],
      ],
      notes: [
        'partnerVibe.help.createPlanNote',
        'partnerVibe.help.createFreeNote',
        'partnerVibe.help.createLinkNote',
        'partnerVibe.help.createAskNote',
      ],
      seeAlso: ['bladecp partner plans', 'bladecp partner vibe find <external-id>'],
    },
    'partner.vibe.plan': {
      desc: 'partnerVibe.help.planDesc',
      args: [ACCOUNT_ARG, ['<plan>', 'partnerVibe.help.planArg']],
      examples: [['bladecp partner vibe plan <account> <plan-uuid>', 'partnerVibe.ex.plan']],
      notes: ['partnerVibe.help.planNote'],
      seeAlso: ['bladecp partner plans'],
    },
    'partner.vibe.suspend': {
      desc: 'partnerVibe.help.suspendDesc',
      args: [ACCOUNT_ARG],
      examples: [['bladecp partner vibe suspend <account> --yes', 'partnerVibe.ex.suspend']],
      notes: ['partnerVibe.help.suspendNote'],
      seeAlso: ['bladecp partner vibe reactivate <account>'],
    },
    'partner.vibe.reactivate': {
      desc: 'partnerVibe.help.reactivateDesc',
      args: [ACCOUNT_ARG],
      examples: [['bladecp partner vibe reactivate <account>', 'partnerVibe.ex.reactivate']],
      notes: ['partnerVibe.help.repeatNote'],
      seeAlso: ['bladecp partner vibe suspend <account>'],
    },
    'partner.vibe.resume': {
      desc: 'partnerVibe.help.resumeDesc',
      args: [ACCOUNT_ARG],
      examples: [['bladecp partner vibe resume <account>', 'partnerVibe.ex.resume']],
      notes: ['partnerVibe.help.resumeNote'],
      seeAlso: ['bladecp partner vibe reactivate <account>'],
    },
    'partner.vibe.terminate': {
      desc: 'partnerVibe.help.terminateDesc',
      args: [ACCOUNT_ARG],
      examples: [['bladecp partner vibe terminate <account>', 'partnerVibe.ex.terminate']],
      notes: ['partnerVibe.help.terminateNote'],
      seeAlso: ['bladecp partner vibe suspend <account>'],
    },
    'partner.vibe.open': {
      desc: 'partnerVibe.help.openDesc',
      args: [ACCOUNT_ARG],
      examples: [
        [`bladecp partner vibe open ${EXAMPLE_ACCOUNT}`, 'partnerVibe.ex.open'],
        [`bladecp partner vibe open ${EXAMPLE_ACCOUNT} --json`, 'partnerVibe.ex.openJson'],
      ],
      notes: ['partnerVibe.help.openNote'],
    },
  },
};
