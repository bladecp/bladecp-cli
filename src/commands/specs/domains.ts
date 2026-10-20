import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {} as const satisfies Record<string, OptionDef>;

const SERVER_ARG: [string, 'domains.help.serverArg'] = ['<server>', 'domains.help.serverArg'];
const HOST_ARG: [string, 'domains.help.hostArg'] = ['<host>', 'domains.help.hostArg'];

export const group: GroupSpec = {
  topics: [{ path: ['domains'], summary: 'domains.help.topic', group: 'sites' }],
  commands: [
    {
      id: 'domains.list',
      path: ['domains', 'list'],
      args: ['server'],
      options: [],
      usage: 'bladecp domains list <server>',
      summary: 'domains.help.list',
      group: 'sites',
    },
    {
      id: 'domains.add',
      path: ['domains', 'add'],
      args: ['server', 'host'],
      options: [],
      usage: 'bladecp domains add <server> <host>',
      summary: 'domains.help.add',
      group: 'sites',
    },
    {
      id: 'domains.remove',
      path: ['domains', 'remove'],
      args: ['server', 'host'],
      options: ['yes'],
      usage: 'bladecp domains remove <server> <host> [--yes]',
      summary: 'domains.help.remove',
      group: 'sites',
      optionHelp: { yes: 'domains.option.yesRemove' },
    },
    {
      id: 'domains.check',
      path: ['domains', 'check'],
      args: ['host'],
      options: [],
      usage: 'bladecp domains check <host>',
      summary: 'domains.help.check',
      group: 'sites',
    },
  ],
  extras: {
    'domains.list': {
      desc: 'domains.help.listDesc',
      args: [SERVER_ARG],
      examples: [['bladecp domains list 0197a1c4', 'domains.ex.list']],
      seeAlso: ['bladecp servers'],
    },
    'domains.add': {
      desc: 'domains.help.addDesc',
      args: [SERVER_ARG, HOST_ARG],
      examples: [
        ['bladecp domains check blog.example.com', 'domains.ex.check'],
        ['bladecp domains add 0197a1c4 blog.example.com', 'domains.ex.add'],
      ],
      seeAlso: ['bladecp domains list <server>'],
    },
    'domains.remove': {
      desc: 'domains.help.removeDesc',
      args: [SERVER_ARG, HOST_ARG],
      examples: [['bladecp domains remove 0197a1c4 blog.example.com --yes', 'domains.ex.remove']],
      seeAlso: ['bladecp domains list <server>'],
    },
    'domains.check': {
      desc: 'domains.help.checkDesc',
      args: [HOST_ARG],
      examples: [['bladecp domains check blog.example.com', 'domains.ex.check']],
      seeAlso: ['bladecp domains add <server> <host>'],
    },
  },
};
