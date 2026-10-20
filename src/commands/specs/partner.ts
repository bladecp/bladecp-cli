import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  topics: [{ path: ['partner'], summary: 'partner.help.topic', group: 'partner', partner: true }],
  commands: [
    {
      id: 'partner.plans',
      path: ['partner', 'plans'],
      args: [],
      options: ['currency'],
      usage: 'bladecp partner plans [--currency <code>]',
      summary: 'partner.help.plans',
      group: 'partner',
      partner: true,
      optionHelp: { currency: 'partner.option.currency' },
    },
    {
      id: 'partner.locations',
      path: ['partner', 'locations'],
      args: [],
      options: ['plan'],
      usage: 'bladecp partner locations [--plan <id>]',
      summary: 'partner.help.locations',
      group: 'partner',
      partner: true,
      optionHelp: { plan: 'partner.option.locationsPlan' },
    },
    {
      id: 'partner.options',
      path: ['partner', 'options'],
      args: [],
      options: ['plan', 'currency'],
      usage: 'bladecp partner options [--plan <id>] [--currency <code>]',
      summary: 'partner.help.options',
      group: 'partner',
      partner: true,
      optionHelp: { plan: 'partner.option.optionsPlan', currency: 'partner.option.currency' },
    },
    {
      id: 'partner.branding',
      path: ['partner', 'branding'],
      args: [],
      options: [],
      usage: 'bladecp partner branding',
      summary: 'partner.help.branding',
      group: 'partner',
      partner: true,
    },
  ],
  extras: {
    'partner.plans': {
      desc: 'partner.help.plansDesc',
      examples: [
        ['bladecp partner plans', 'partner.ex.plans'],
        ['bladecp partner plans --currency BRL', 'partner.ex.plansCurrency'],
      ],
      notes: ['partner.help.plansNote'],
      seeAlso: ['bladecp partner locations', 'bladecp partner options'],
    },
    'partner.locations': {
      desc: 'partner.help.locationsDesc',
      examples: [
        ['bladecp partner locations', 'partner.ex.locations'],
        ['bladecp partner locations --plan 12', 'partner.ex.locationsPlan'],
      ],
      seeAlso: ['bladecp partner plans', 'bladecp partner servers create'],
    },
    'partner.options': {
      desc: 'partner.help.optionsDesc',
      examples: [
        ['bladecp partner options', 'partner.ex.options'],
        ['bladecp partner options --plan 12 --currency BRL', 'partner.ex.optionsPlan'],
      ],
      notes: ['partner.help.optionsNote'],
      seeAlso: ['bladecp partner servers create', 'bladecp partner servers options'],
    },
    'partner.branding': {
      desc: 'partner.help.brandingDesc',
      examples: [['bladecp partner branding --json', 'partner.ex.brandingJson']],
    },
  },
};
