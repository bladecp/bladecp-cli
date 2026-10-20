import type { GroupSpec, HelpExtras, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {} as const satisfies Record<string, OptionDef>;

const SERVER_ARG: [string, 'domains.help.serverArg'] = ['<server>', 'domains.help.serverArg'];
const NOTES: HelpExtras['notes'] = ['wordpress.help.externalNote'];
const EXITS: HelpExtras['exits'] = [
  [0, 'wordpress.exit.ok'],
  [1, 'wordpress.exit.failed'],
];

export const group: GroupSpec = {
  topics: [{ path: ['wordpress'], summary: 'wordpress.help.topic', group: 'sites' }],
  commands: [
    {
      id: 'wordpress.status',
      path: ['wordpress', 'status'],
      args: ['server'],
      options: ['external-id'],
      usage: 'bladecp wordpress status <server> [--external-id <id>]',
      summary: 'wordpress.help.status',
      group: 'sites',
      optionHelp: { 'external-id': 'wordpress.option.externalId' },
    },
    {
      id: 'wordpress.dashboard',
      path: ['wordpress', 'dashboard'],
      args: ['server'],
      options: ['external-id', 'wait'],
      usage: 'bladecp wordpress dashboard <server> [--external-id <id>] [--wait]',
      summary: 'wordpress.help.dashboard',
      group: 'sites',
      optionHelp: {
        'external-id': 'wordpress.option.externalId',
        wait: 'wordpress.option.waitDashboard',
      },
    },
    {
      id: 'wordpress.update.core',
      path: ['wordpress', 'update', 'core'],
      args: ['server'],
      options: ['external-id', 'wait', 'yes'],
      usage: 'bladecp wordpress update core <server> [--external-id <id>] [--wait] [--yes]',
      summary: 'wordpress.help.updateCore',
      group: 'sites',
      optionHelp: {
        'external-id': 'wordpress.option.externalId',
        wait: 'wordpress.option.waitUpdate',
        yes: 'wordpress.option.yesUpdate',
      },
    },
    {
      id: 'wordpress.update.plugin',
      path: ['wordpress', 'update', 'plugin'],
      args: ['server', 'plugin'],
      options: ['external-id', 'wait', 'yes'],
      usage:
        'bladecp wordpress update plugin <server> <plugin> [--external-id <id>] [--wait] [--yes]',
      summary: 'wordpress.help.updatePlugin',
      group: 'sites',
      optionHelp: {
        'external-id': 'wordpress.option.externalId',
        wait: 'wordpress.option.waitUpdate',
        yes: 'wordpress.option.yesUpdate',
      },
    },
    {
      id: 'wordpress.update.theme',
      path: ['wordpress', 'update', 'theme'],
      args: ['server', 'theme'],
      options: ['external-id', 'wait', 'yes'],
      usage:
        'bladecp wordpress update theme <server> <theme> [--external-id <id>] [--wait] [--yes]',
      summary: 'wordpress.help.updateTheme',
      group: 'sites',
      optionHelp: {
        'external-id': 'wordpress.option.externalId',
        wait: 'wordpress.option.waitUpdate',
        yes: 'wordpress.option.yesUpdate',
      },
    },
    {
      id: 'wordpress.task',
      path: ['wordpress', 'task'],
      args: ['server', 'task'],
      options: ['external-id', 'wait'],
      usage: 'bladecp wordpress task <server> <task> [--external-id <id>] [--wait]',
      summary: 'wordpress.help.task',
      group: 'sites',
      optionHelp: {
        'external-id': 'wordpress.option.externalId',
        wait: 'wordpress.option.waitTask',
      },
    },
  ],
  extras: {
    'wordpress.status': {
      desc: 'wordpress.help.statusDesc',
      args: [SERVER_ARG],
      notes: NOTES,
      examples: [
        ['bladecp wordpress status 0197a1c4', 'wordpress.ex.status'],
        ['bladecp wordpress status 0197a1c4 --external-id 1042', 'wordpress.ex.statusPartner'],
      ],
      seeAlso: ['bladecp wordpress dashboard <server>'],
    },
    'wordpress.dashboard': {
      desc: 'wordpress.help.dashboardDesc',
      args: [SERVER_ARG],
      notes: NOTES,
      examples: [['bladecp wordpress dashboard 0197a1c4 --wait', 'wordpress.ex.dashboard']],
      exits: EXITS,
      seeAlso: ['bladecp wordpress task <server> <task>'],
    },
    'wordpress.update.core': {
      desc: 'wordpress.help.updateCoreDesc',
      args: [SERVER_ARG],
      notes: NOTES,
      examples: [['bladecp wordpress update core 0197a1c4 --wait', 'wordpress.ex.updateCore']],
      exits: EXITS,
      seeAlso: ['bladecp wordpress dashboard <server>'],
    },
    'wordpress.update.plugin': {
      desc: 'wordpress.help.updatePluginDesc',
      args: [SERVER_ARG, ['<plugin>', 'wordpress.help.pluginArg']],
      notes: NOTES,
      examples: [
        ['bladecp wordpress update plugin 0197a1c4 akismet --yes', 'wordpress.ex.updatePlugin'],
      ],
      exits: EXITS,
      seeAlso: ['bladecp wordpress dashboard <server>'],
    },
    'wordpress.update.theme': {
      desc: 'wordpress.help.updateThemeDesc',
      args: [SERVER_ARG, ['<theme>', 'wordpress.help.themeArg']],
      notes: NOTES,
      examples: [
        ['bladecp wordpress update theme 0197a1c4 twentytwentyfour', 'wordpress.ex.updateTheme'],
      ],
      exits: EXITS,
      seeAlso: ['bladecp wordpress dashboard <server>'],
    },
    'wordpress.task': {
      desc: 'wordpress.help.taskDesc',
      args: [SERVER_ARG, ['<task>', 'wordpress.help.taskArg']],
      notes: NOTES,
      examples: [['bladecp wordpress task 0197a1c4 <task> --wait', 'wordpress.ex.task']],
      exits: EXITS,
    },
  },
};
