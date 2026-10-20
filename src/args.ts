import { parseArgs } from 'node:util';

import { GROUP_OPTIONS, GROUPS } from './commands/specs/index.js';
import { CliError, ExitCode } from './errors.js';
import type { MessageKey } from './i18n/index.js';

/**
 * An option a command group adds (src/commands/specs/): how it is parsed and
 * how the help writes and explains it.
 */
export interface OptionDef {
  type: 'boolean' | 'string';
  short?: string;
  /** Can be given more than once; the command receives every value. */
  multiple?: boolean;
  syntax: string;
  key: MessageKey;
}

const BASE_OPTIONS = {
  json: { type: 'boolean' },
  'api-url': { type: 'string' },
  lang: { type: 'string' },
  debug: { type: 'boolean' },
  verbose: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  token: { type: 'string' },
  'no-browser': { type: 'boolean' },
  plan: { type: 'string' },
  location: { type: 'string' },
  domain: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  'no-wait': { type: 'boolean' },
  watch: { type: 'boolean', short: 'w' },
  reason: { type: 'string' },
  currency: { type: 'string' },
  all: { type: 'boolean', short: 'a' },
  check: { type: 'boolean' },
  prices: { type: 'boolean' },
  // Shared by the command groups (filters, pages, bodies, waiting).
  status: { type: 'string' },
  limit: { type: 'string' },
  page: { type: 'string' },
  'external-id': { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  url: { type: 'string' },
  event: { type: 'string', multiple: true },
  option: { type: 'string', multiple: true },
  wait: { type: 'boolean' },
} as const;

export type OptionName = keyof typeof BASE_OPTIONS | keyof typeof GROUP_OPTIONS;
export type OptionValues = Partial<Record<OptionName, string | boolean | string[]>>;

/** Every option, as `util.parseArgs` reads them. */
export const OPTIONS: Record<
  OptionName,
  { type: 'boolean' | 'string'; short?: string; multiple?: boolean }
> = {
  ...BASE_OPTIONS,
  ...Object.fromEntries(
    Object.entries(GROUP_OPTIONS as Record<string, OptionDef>).map(([name, def]) => [
      name,
      {
        type: def.type,
        ...(def.short ? { short: def.short } : {}),
        ...(def.multiple ? { multiple: true } : {}),
      },
    ]),
  ),
} as Record<OptionName, { type: 'boolean' | 'string'; short?: string; multiple?: boolean }>;

export const GLOBAL_OPTIONS: readonly OptionName[] = [
  'json',
  'api-url',
  'lang',
  'debug',
  'verbose',
  'help',
  'version',
];

/** The commands of the first versions; the groups added later use plain string IDs. */
export type BaseCommandId =
  | 'login'
  | 'logout'
  | 'whoami'
  | 'servers.list'
  | 'servers.show'
  | 'destinations.list'
  | 'analyze'
  | 'migrate'
  | 'migrations.list'
  | 'migrations.status'
  | 'migrations.review'
  | 'migrations.approve'
  | 'migrations.cancel'
  | 'migrations.retry'
  | 'update'
  | 'config.list'
  | 'config.get'
  | 'config.set';

export type CommandId = BaseCommandId | (string & {});

export type HelpGroup =
  | 'account'
  | 'servers'
  | 'sites'
  | 'migrations'
  | 'partner'
  | 'automation'
  | 'cli';

/** Sections of `bladecp --help`, in order. */
export const HELP_GROUPS: readonly HelpGroup[] = [
  'account',
  'servers',
  'sites',
  'migrations',
  'partner',
  'automation',
  'cli',
];

export interface CommandSpec {
  id: CommandId;
  path: readonly string[];
  args: readonly string[];
  /** How many of the last `args` may be left out. */
  optionalArgs?: number;
  options: readonly OptionName[];
  usage: string;
  summary: MessageKey;
  /** Section of `bladecp --help` the command is listed in. */
  group: HelpGroup;
  /** Commands that run without a key. */
  public?: boolean;
  /** Commands for BladeCP partners (keys with the partner:read scope). */
  partner?: boolean;
  /** What an option means for this command, when it differs from the shared text. */
  optionHelp?: Partial<Record<OptionName, MessageKey>>;
}

/**
 * A group of commands shown as one line in the help of its parent (for
 * example `domains` in `bladecp --help`, or `partner servers` in
 * `bladecp partner --help`), with its own help listing the commands.
 */
export interface Topic {
  path: readonly string[];
  summary: MessageKey;
  group: HelpGroup;
  partner?: boolean;
}

/** Help text beyond the usage line: a longer description, notes, examples. */
export interface HelpExtras {
  desc?: MessageKey;
  args?: [string, MessageKey][];
  flow?: MessageKey[];
  examples?: [string, MessageKey][];
  exits?: [number, MessageKey][];
  notes?: MessageKey[];
  seeAlso?: string[];
}

/** One command group of src/commands/specs/: its commands, topics and help. */
export interface GroupSpec {
  commands: CommandSpec[];
  topics?: Topic[];
  extras?: Record<string, HelpExtras>;
  /** `bladecp <group>` alone runs this command (key: the group path with spaces). */
  defaults?: Record<string, string>;
}

const BASE_COMMANDS: CommandSpec[] = [
  {
    id: 'login',
    path: ['login'],
    args: [],
    options: ['token', 'no-browser'],
    usage: 'bladecp login [--token <key>] [--no-browser]',
    summary: 'help.login',
    group: 'account',
    public: true,
  },
  {
    id: 'logout',
    path: ['logout'],
    args: [],
    options: [],
    usage: 'bladecp logout',
    summary: 'help.logout',
    group: 'account',
    public: true,
  },
  {
    id: 'whoami',
    path: ['whoami'],
    args: [],
    options: [],
    usage: 'bladecp whoami',
    summary: 'help.whoami',
    group: 'account',
  },
  {
    id: 'servers.list',
    path: ['servers', 'list'],
    args: [],
    options: ['all'],
    usage: 'bladecp servers list [--all]',
    summary: 'help.serversList',
    group: 'servers',
  },
  {
    id: 'servers.show',
    path: ['servers', 'show'],
    args: ['uuid'],
    options: [],
    usage: 'bladecp servers show <uuid>',
    summary: 'help.serversShow',
    group: 'servers',
  },
  {
    id: 'destinations.list',
    path: ['destinations', 'list'],
    args: [],
    options: ['currency'],
    usage: 'bladecp destinations list [--currency <code>]',
    summary: 'help.destinationsList',
    group: 'servers',
  },
  {
    id: 'analyze',
    path: ['analyze'],
    args: ['backup'],
    options: ['prices', 'currency'],
    usage: 'bladecp analyze <backup.tar.gz> [--prices [--currency <code>]]',
    summary: 'help.analyze',
    group: 'migrations',
    public: true,
  },
  {
    id: 'migrate',
    path: ['migrate'],
    args: ['backup'],
    options: ['plan', 'location', 'domain', 'yes', 'no-wait'],
    usage:
      'bladecp migrate <backup.tar.gz> [--plan <id> --location <id>] [--domain <host>] [--yes] [--no-wait]',
    summary: 'help.migrate',
    group: 'migrations',
  },
  {
    id: 'migrations.list',
    path: ['migrations', 'list'],
    args: [],
    options: [],
    usage: 'bladecp migrations list',
    summary: 'help.migrationsList',
    group: 'migrations',
  },
  {
    id: 'migrations.status',
    path: ['migrations', 'status'],
    args: ['uuid'],
    options: ['watch'],
    usage: 'bladecp migrations status <uuid> [--watch]',
    summary: 'help.migrationsStatus',
    group: 'migrations',
  },
  {
    id: 'migrations.review',
    path: ['migrations', 'review'],
    args: ['uuid'],
    options: ['domain'],
    usage: 'bladecp migrations review <uuid> --domain <host>',
    summary: 'help.migrationsReview',
    group: 'migrations',
  },
  {
    id: 'migrations.approve',
    path: ['migrations', 'approve'],
    args: ['uuid'],
    options: ['yes'],
    usage: 'bladecp migrations approve <uuid> [--yes]',
    summary: 'help.migrationsApprove',
    group: 'migrations',
  },
  {
    id: 'migrations.cancel',
    path: ['migrations', 'cancel'],
    args: ['uuid'],
    options: ['reason', 'yes'],
    usage: 'bladecp migrations cancel <uuid> [--reason <text>] [--yes]',
    summary: 'help.migrationsCancel',
    group: 'migrations',
  },
  {
    id: 'migrations.retry',
    path: ['migrations', 'retry'],
    args: ['uuid'],
    options: [],
    usage: 'bladecp migrations retry <uuid>',
    summary: 'help.migrationsRetry',
    group: 'migrations',
  },
  {
    id: 'update',
    path: ['update'],
    args: [],
    options: ['check', 'yes'],
    usage: 'bladecp update [--check] [--yes]',
    summary: 'help.update',
    group: 'cli',
    public: true,
  },
  {
    id: 'config.list',
    path: ['config', 'list'],
    args: [],
    options: [],
    usage: 'bladecp config list',
    summary: 'help.configList',
    group: 'cli',
    public: true,
  },
  {
    id: 'config.get',
    path: ['config', 'get'],
    args: ['key'],
    options: [],
    usage: 'bladecp config get <key>',
    summary: 'help.configGet',
    group: 'cli',
    public: true,
  },
  {
    id: 'config.set',
    path: ['config', 'set'],
    args: ['key', 'value'],
    options: [],
    usage: 'bladecp config set <key> <value>',
    summary: 'help.configSet',
    group: 'cli',
    public: true,
  },
];

export const COMMANDS: CommandSpec[] = [
  ...BASE_COMMANDS,
  ...GROUPS.flatMap((group) => group.commands),
];

export const TOPICS: Topic[] = GROUPS.flatMap((group) => group.topics ?? []);

export const GROUP_EXTRAS: Record<string, HelpExtras> = Object.assign(
  {},
  ...GROUPS.map((group) => group.extras ?? {}),
);

/** `bladecp servers` alone means `bladecp servers list`. */
export const GROUP_DEFAULTS: Record<string, CommandId> = {
  servers: 'servers.list',
  destinations: 'destinations.list',
  migrations: 'migrations.list',
  config: 'config.list',
  ...Object.assign({}, ...GROUPS.map((group) => group.defaults ?? {})),
};

/** How a positional argument is written in help and usage lines. */
export function argumentSyntax(name: string): string {
  return name === 'backup' ? '<backup.tar.gz>' : `<${name}>`;
}

/** The arguments of a command as the help writes them (`[<name>]` when optional). */
export function argumentsSyntax(spec: CommandSpec): string[] {
  const optional = spec.optionalArgs ?? 0;
  return spec.args.map((name, i) =>
    i >= spec.args.length - optional ? `[${argumentSyntax(name)}]` : argumentSyntax(name),
  );
}

const BASE_OPTION_HELP: Record<keyof typeof BASE_OPTIONS, { syntax: string; key: MessageKey }> = {
  json: { syntax: '--json', key: 'option.json' },
  'api-url': { syntax: '--api-url <url>', key: 'option.apiUrl' },
  lang: { syntax: '--lang <en|pt-BR|es>', key: 'option.lang' },
  debug: { syntax: '--debug', key: 'option.debug' },
  verbose: { syntax: '--verbose', key: 'option.verbose' },
  help: { syntax: '-h, --help', key: 'option.help' },
  version: { syntax: '-v, --version', key: 'option.version' },
  token: { syntax: '--token <key>', key: 'option.token' },
  'no-browser': { syntax: '--no-browser', key: 'option.noBrowser' },
  plan: { syntax: '--plan <id>', key: 'option.plan' },
  location: { syntax: '--location <id>', key: 'option.location' },
  domain: { syntax: '--domain <host>', key: 'option.domain' },
  yes: { syntax: '-y, --yes', key: 'option.yes' },
  'no-wait': { syntax: '--no-wait', key: 'option.noWait' },
  watch: { syntax: '-w, --watch', key: 'option.watch' },
  reason: { syntax: '--reason <text>', key: 'option.reason' },
  currency: { syntax: '--currency <code>', key: 'option.currency' },
  all: { syntax: '-a, --all', key: 'option.all' },
  check: { syntax: '--check', key: 'option.check' },
  prices: { syntax: '--prices', key: 'option.prices' },
  status: { syntax: '--status <status>', key: 'option.status' },
  limit: { syntax: '--limit <n>', key: 'option.limit' },
  page: { syntax: '--page <n>', key: 'option.page' },
  'external-id': { syntax: '--external-id <id>', key: 'option.externalId' },
  name: { syntax: '--name <name>', key: 'option.name' },
  email: { syntax: '--email <email>', key: 'option.email' },
  url: { syntax: '--url <url>', key: 'option.url' },
  event: { syntax: '--event <type>', key: 'option.event' },
  option: { syntax: '--option <id>=<value>', key: 'option.option' },
  wait: { syntax: '--wait', key: 'option.wait' },
};

export const OPTION_HELP: Record<OptionName, { syntax: string; key: MessageKey }> = {
  ...BASE_OPTION_HELP,
  ...Object.fromEntries(
    Object.entries(GROUP_OPTIONS as Record<string, OptionDef>).map(([name, def]) => [
      name,
      { syntax: def.syntax, key: def.key },
    ]),
  ),
} as Record<OptionName, { syntax: string; key: MessageKey }>;

/** `--yes` means something a little different on each command. */
export const YES_HELP: Partial<Record<BaseCommandId, MessageKey>> = {
  'migrations.approve': 'option.yesConfirm',
  'migrations.cancel': 'option.yesConfirm',
  update: 'option.yesUpdate',
};

export interface ParsedArgs {
  values: OptionValues;
  positionals: string[];
  /** Options given more than once (the last value wins). */
  repeated: { option: string; value: string }[];
}

/** Reads `--json`, `--lang` and `--debug` before full parsing so errors are localized. */
export function prescan(argv: string[]): { json: boolean; lang?: string; debug: boolean } {
  let json = false;
  let debug = false;
  let lang: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') break;
    if (arg === '--json') json = true;
    else if (arg === '--debug' || arg === '--verbose') debug = true;
    else if (arg === '--lang') lang = argv[i + 1];
    else if (arg.startsWith('--lang=')) lang = arg.slice('--lang='.length);
  }
  return lang === undefined ? { json, debug } : { json, debug, lang };
}

const usage = (messageKey: MessageKey, vars: Record<string, string>) =>
  new CliError(messageKey, vars, { exitCode: ExitCode.USAGE, code: 'usage' });

export function parseCli(argv: string[]): ParsedArgs {
  let parsed: {
    values: Record<string, unknown>;
    positionals: string[];
    tokens: { kind: string; name?: string }[];
  };
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
      tokens: true,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : '';
    const option = /'(-[^' ]+)/.exec(message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      throw usage('error.unknownOption', { option });
    }
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      if (/does not take an argument/.test(message)) {
        throw usage('error.optionTakesNoValue', { option: option.replace(/=.*$/, '') });
      }
      if (/ambiguous/.test(message)) {
        // `--plan -1`: the value starts with a dash.
        const value = argv[argv.indexOf(option) + 1] ?? '';
        if (option === '--plan' || option === '--location') {
          throw usage('error.invalidNumber', { option, value });
        }
        throw usage('error.optionValueDash', { option, value });
      }
      throw usage('error.optionNeedsValue', { option });
    }
    throw new CliError('error.invalidArguments', {}, { exitCode: ExitCode.USAGE, code: 'usage' });
  }
  const seen = new Map<string, number>();
  const repeated: ParsedArgs['repeated'] = [];
  for (const token of parsed.tokens) {
    if (token.kind !== 'option' || !token.name) continue;
    if (OPTIONS[token.name as OptionName]?.multiple) continue;
    const count = (seen.get(token.name) ?? 0) + 1;
    seen.set(token.name, count);
    if (count === 2) {
      const value = parsed.values[token.name as OptionName];
      repeated.push({ option: `--${token.name}`, value: typeof value === 'string' ? value : '' });
    }
  }
  return { values: parsed.values as OptionValues, positionals: parsed.positionals, repeated };
}

export type Resolved =
  | { kind: 'help'; topic?: CommandSpec | undefined; group?: string | undefined }
  | { kind: 'command'; spec: CommandSpec; args: string[] };

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.length <= path.length && prefix.every((segment, i) => path[i] === segment);

/**
 * A group is a path that longer commands start with: `servers`, `partner`,
 * `partner servers`, `wordpress update`. Takes the path as words or as one
 * string with spaces.
 */
export function isGroup(path: string | readonly string[] | undefined): boolean {
  if (path === undefined) return false;
  const words = typeof path === 'string' ? path.split(' ') : path;
  if (words.length === 0 || words.some((word) => !word)) return false;
  return COMMANDS.some((spec) => spec.path.length > words.length && startsWith(spec.path, words));
}

export function resolveCommand(positionals: string[]): Resolved {
  if (positionals.length === 0) return { kind: 'help' };
  if (positionals[0] === 'help') {
    const rest = positionals.slice(1);
    if (rest.length === 0) return { kind: 'help' };
    // `bladecp help migrations` is the help of the whole group (unless the
    // words are also a command of their own, as `bladecp api` is).
    const exact = COMMANDS.some((spec) => spec.path.join(' ') === rest.join(' '));
    if (isGroup(rest) && !exact) return { kind: 'help', group: rest.join(' ') };
    const inner = resolveCommand(rest);
    if (inner.kind === 'command') return { kind: 'help', topic: inner.spec };
    return inner;
  }
  // The longest command whose words start the line, and the longest group.
  let best: CommandSpec | undefined;
  for (const spec of COMMANDS) {
    if (startsWith(positionals, spec.path) && (!best || spec.path.length > best.path.length))
      best = spec;
  }
  let groupLength = 0;
  for (let n = 1; n <= positionals.length; n += 1) {
    if (isGroup(positionals.slice(0, n))) groupLength = n;
  }
  if (best && best.path.length >= groupLength) {
    return { kind: 'command', spec: best, args: positionals.slice(best.path.length) };
  }
  if (groupLength === 0) {
    throw new CliError(
      'error.unknownCommand',
      { command: positionals[0] ?? '' },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  const group = positionals.slice(0, groupLength).join(' ');
  if (positionals.length === groupLength) {
    const fallback = GROUP_DEFAULTS[group];
    const spec = COMMANDS.find((s) => s.id === fallback);
    if (spec) return { kind: 'command', spec, args: [] };
    return { kind: 'help', group };
  }
  throw new CliError(
    'error.unknownCommand',
    { command: positionals.slice(0, groupLength + 1).join(' ') },
    { exitCode: ExitCode.USAGE, code: 'usage' },
  );
}

/** Rejects options that do not belong to the command and wrong argument counts. */
export function validateInvocation(spec: CommandSpec, values: OptionValues, args: string[]): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const option = name as OptionName;
    if (!GLOBAL_OPTIONS.includes(option) && !spec.options.includes(option)) {
      throw new CliError(
        'error.optionNotForCommand',
        { option: `--${option}`, command: `bladecp ${spec.path.join(' ')}` },
        {
          exitCode: ExitCode.USAGE,
          code: 'usage',
          hint: { key: 'hint.usage', vars: { usage: spec.usage } },
        },
      );
    }
  }
  if (args.length < spec.args.length - (spec.optionalArgs ?? 0)) {
    throw new CliError(
      'error.missingArgument',
      { argument: `<${spec.args[args.length]}>` },
      {
        exitCode: ExitCode.USAGE,
        code: 'usage',
        hint: { key: 'hint.usage', vars: { usage: spec.usage } },
      },
    );
  }
  if (args.length > spec.args.length) {
    throw new CliError(
      'error.extraArgument',
      { argument: args[spec.args.length] ?? '' },
      {
        exitCode: ExitCode.USAGE,
        code: 'usage',
        hint: { key: 'hint.usage', vars: { usage: spec.usage } },
      },
    );
  }
}

/** A BladeCP ID, or the first characters of one (at least 4). */
const UUID_LIKE = /^[0-9A-Za-z][0-9A-Za-z-]{3,63}$/;

export function assertUuidArg(value: string): string {
  const trimmed = value.trim();
  if (!UUID_LIKE.test(trimmed)) {
    throw new CliError('error.invalidUuid', { value }, { exitCode: ExitCode.USAGE, code: 'usage' });
  }
  return trimmed;
}
