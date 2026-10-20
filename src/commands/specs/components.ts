import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  topics: [{ path: ['components'], summary: 'components.help.topic', group: 'sites' }],
  commands: [
    {
      id: 'components.list',
      path: ['components', 'list'],
      args: [],
      options: [],
      usage: 'bladecp components list',
      summary: 'components.help.list',
      group: 'sites',
    },
  ],
  extras: {
    'components.list': {
      desc: 'components.help.listDesc',
      examples: [
        ['bladecp components', 'components.ex.list'],
        ['bladecp components list --json', 'components.ex.json'],
      ],
    },
  },
  defaults: { components: 'components.list' },
};
