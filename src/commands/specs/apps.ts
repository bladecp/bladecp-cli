import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {
  // --version is the version of the CLI itself.
  'app-version': {
    type: 'string',
    syntax: '--app-version <version>',
    key: 'apps.option.appVersion',
  },
} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  topics: [{ path: ['apps'], summary: 'apps.help.topic', group: 'sites' }],
  commands: [
    {
      id: 'apps.list',
      path: ['apps', 'list'],
      args: [],
      options: [],
      usage: 'bladecp apps list',
      summary: 'apps.help.list',
      group: 'sites',
    },
    {
      id: 'apps.show',
      path: ['apps', 'show'],
      args: ['app'],
      options: [],
      usage: 'bladecp apps show <app>',
      summary: 'apps.help.show',
      group: 'sites',
    },
    {
      id: 'apps.install',
      path: ['apps', 'install'],
      args: ['server', 'app'],
      options: ['domain', 'app-version', 'option', 'yes'],
      usage:
        'bladecp apps install <server> <app> [--domain <host>] [--app-version <version>] [--option <id>=<value>]... [--yes]',
      summary: 'apps.help.install',
      group: 'sites',
      optionHelp: {
        domain: 'apps.option.domain',
        option: 'apps.option.setting',
        yes: 'apps.option.yes',
      },
    },
  ],
  extras: {
    'apps.list': {
      desc: 'apps.help.listDesc',
      examples: [['bladecp apps', 'apps.ex.list']],
      seeAlso: ['bladecp apps show <app>'],
    },
    'apps.show': {
      desc: 'apps.help.showDesc',
      args: [['<app>', 'apps.help.appArg']],
      examples: [['bladecp apps show wordpress', 'apps.ex.show']],
      seeAlso: ['bladecp apps install <server> <app>'],
    },
    'apps.install': {
      desc: 'apps.help.installDesc',
      args: [
        ['<server>', 'domains.help.serverArg'],
        ['<app>', 'apps.help.appArg'],
      ],
      notes: ['apps.help.installNote'],
      examples: [
        ['bladecp apps install 0197a1c4 wordpress', 'apps.ex.install'],
        [
          'bladecp apps install 0197a1c4 wordpress --domain blog.example.com --option admin_user=maria --option site_title="Maria\'s blog" --yes',
          'apps.ex.installScript',
        ],
      ],
      seeAlso: ['bladecp apps show <app>', 'bladecp domains add <server> <host>'],
    },
  },
  defaults: { apps: 'apps.list' },
};
