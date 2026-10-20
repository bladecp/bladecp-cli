import type { GroupSpec, OptionDef } from '../../args.js';

/** Options only this group uses (reuse the shared ones when the meaning is the same). */
export const options = {
  method: {
    type: 'string',
    short: 'X',
    syntax: '-X, --method <method>',
    key: 'api.option.method',
  },
  data: { type: 'string', syntax: '--data <json>', key: 'api.option.data' },
  input: { type: 'string', syntax: '--input <file>', key: 'api.option.input' },
} as const satisfies Record<string, OptionDef>;

export const group: GroupSpec = {
  commands: [
    {
      id: 'api',
      path: ['api'],
      args: ['path'],
      options: ['method', 'data', 'input', 'yes'],
      usage: 'bladecp api <path> [-X <method>] [--data <json> | --input <file>] [--yes]',
      summary: 'api.help.call',
      group: 'automation',
      optionHelp: { yes: 'api.option.yes' },
    },
    {
      id: 'api.list',
      path: ['api', 'list'],
      args: [],
      options: [],
      usage: 'bladecp api list',
      summary: 'api.help.list',
      group: 'automation',
      public: true,
    },
  ],
  extras: {
    api: {
      desc: 'api.help.desc',
      args: [['<path>', 'api.help.pathArg']],
      examples: [
        ['bladecp api /customer/me', 'api.ex.me'],
        ['bladecp api "/customer/provisions?status=active"', 'api.ex.query'],
        [
          'bladecp api -X POST /customer/provisions/<uuid>/domains --data \'{"domain":"blog.example.com"}\'',
          'api.ex.post',
        ],
        [
          'bladecp api -X PATCH /customer/webhook-endpoints/<id> --input endpoint.json',
          'api.ex.input',
        ],
      ],
      notes: ['api.help.note'],
      seeAlso: ['bladecp api list'],
    },
    'api.list': {
      desc: 'api.help.listDesc',
      examples: [['bladecp api list --json', 'api.ex.listJson']],
      seeAlso: ['bladecp api <path>'],
    },
  },
};
