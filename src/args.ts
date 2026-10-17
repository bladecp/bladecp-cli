import { parseArgs } from 'node:util';

import { CliError, ExitCode } from './errors.js';
import type { MessageKey } from './i18n/index.js';

export const OPTIONS = {
  json: { type: 'boolean' },
  'api-url': { type: 'string' },
  lang: { type: 'string' },
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
} as const;

export type OptionName = keyof typeof OPTIONS;
export type OptionValues = Partial<Record<OptionName, string | boolean>>;

export const GLOBAL_OPTIONS: readonly OptionName[] = ['json', 'api-url', 'lang', 'help', 'version'];

export type CommandId =
  | 'login'
  | 'logout'
  | 'whoami'
  | 'servers.list'
  | 'servers.show'
  | 'destinations.list'
  | 'migrate'
  | 'migrations.list'
  | 'migrations.status'
  | 'migrations.review'
  | 'migrations.approve'
  | 'migrations.cancel'
  | 'migrations.retry';

export interface CommandSpec {
  id: CommandId;
  path: string[];
  args: string[];
  options: OptionName[];
  usage: string;
  summary: MessageKey;
  /** Commands that run without a key. */
  public?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  {
    id: 'login',
    path: ['login'],
    args: [],
    options: ['token', 'no-browser'],
    usage: 'bladecp login [--token <key>] [--no-browser]',
    summary: 'help.login',
    public: true,
  },
  {
    id: 'logout',
    path: ['logout'],
    args: [],
    options: [],
    usage: 'bladecp logout',
    summary: 'help.logout',
    public: true,
  },
  {
    id: 'whoami',
    path: ['whoami'],
    args: [],
    options: [],
    usage: 'bladecp whoami',
    summary: 'help.whoami',
  },
  {
    id: 'servers.list',
    path: ['servers', 'list'],
    args: [],
    options: [],
    usage: 'bladecp servers list',
    summary: 'help.serversList',
  },
  {
    id: 'servers.show',
    path: ['servers', 'show'],
    args: ['uuid'],
    options: [],
    usage: 'bladecp servers show <uuid>',
    summary: 'help.serversShow',
  },
  {
    id: 'destinations.list',
    path: ['destinations', 'list'],
    args: [],
    options: ['currency'],
    usage: 'bladecp destinations list [--currency <code>]',
    summary: 'help.destinationsList',
  },
  {
    id: 'migrate',
    path: ['migrate'],
    args: ['backup'],
    options: ['plan', 'location', 'domain', 'yes', 'no-wait'],
    usage:
      'bladecp migrate <backup.tar.gz> [--plan <id> --location <id>] [--domain <host>] [--yes] [--no-wait]',
    summary: 'help.migrate',
  },
  {
    id: 'migrations.list',
    path: ['migrations', 'list'],
    args: [],
    options: [],
    usage: 'bladecp migrations list',
    summary: 'help.migrationsList',
  },
  {
    id: 'migrations.status',
    path: ['migrations', 'status'],
    args: ['uuid'],
    options: ['watch'],
    usage: 'bladecp migrations status <uuid> [--watch]',
    summary: 'help.migrationsStatus',
  },
  {
    id: 'migrations.review',
    path: ['migrations', 'review'],
    args: ['uuid'],
    options: ['domain'],
    usage: 'bladecp migrations review <uuid> --domain <host>',
    summary: 'help.migrationsReview',
  },
  {
    id: 'migrations.approve',
    path: ['migrations', 'approve'],
    args: ['uuid'],
    options: [],
    usage: 'bladecp migrations approve <uuid>',
    summary: 'help.migrationsApprove',
  },
  {
    id: 'migrations.cancel',
    path: ['migrations', 'cancel'],
    args: ['uuid'],
    options: ['reason'],
    usage: 'bladecp migrations cancel <uuid> [--reason <text>]',
    summary: 'help.migrationsCancel',
  },
  {
    id: 'migrations.retry',
    path: ['migrations', 'retry'],
    args: ['uuid'],
    options: [],
    usage: 'bladecp migrations retry <uuid>',
    summary: 'help.migrationsRetry',
  },
];

/** `bladecp servers` alone means `bladecp servers list`. */
export const GROUP_DEFAULTS: Record<string, CommandId> = {
  servers: 'servers.list',
  destinations: 'destinations.list',
  migrations: 'migrations.list',
};

/** How a positional argument is written in help and usage lines. */
export function argumentSyntax(name: string): string {
  return name === 'backup' ? '<backup.tar.gz>' : `<${name}>`;
}

export const OPTION_HELP: Record<OptionName, { syntax: string; key: MessageKey }> = {
  json: { syntax: '--json', key: 'option.json' },
  'api-url': { syntax: '--api-url <url>', key: 'option.apiUrl' },
  lang: { syntax: '--lang <en|pt-BR|es>', key: 'option.lang' },
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
};

export interface ParsedArgs {
  values: OptionValues;
  positionals: string[];
}

/** Reads `--json` and `--lang` before full parsing so errors are localized. */
export function prescan(argv: string[]): { json: boolean; lang?: string } {
  let json = false;
  let lang: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') break;
    if (arg === '--json') json = true;
    else if (arg === '--lang') lang = argv[i + 1];
    else if (arg.startsWith('--lang=')) lang = arg.slice('--lang='.length);
  }
  return lang === undefined ? { json } : { json, lang };
}

export function parseCli(argv: string[]): ParsedArgs {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    return { values: values as OptionValues, positionals };
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : '';
    const option = /'(-[^' ]+)/.exec(message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      throw new CliError(
        'error.unknownOption',
        { option },
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      throw new CliError(
        'error.optionNeedsValue',
        { option },
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    throw new CliError('error.invalidArguments', {}, { exitCode: ExitCode.USAGE, code: 'usage' });
  }
}

export type Resolved =
  | { kind: 'help'; topic?: CommandSpec | undefined; group?: string | undefined }
  | { kind: 'command'; spec: CommandSpec; args: string[] };

export function resolveCommand(positionals: string[]): Resolved {
  if (positionals.length === 0) return { kind: 'help' };
  const [first, second] = positionals;
  if (first === 'help') {
    const rest = positionals.slice(1);
    if (rest.length === 0) return { kind: 'help' };
    const inner = resolveCommand(rest);
    if (inner.kind === 'command') return { kind: 'help', topic: inner.spec };
    return inner;
  }
  const specs = COMMANDS.filter((spec) => spec.path[0] === first);
  if (specs.length === 0) {
    throw new CliError(
      'error.unknownCommand',
      { command: first ?? '' },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  const single = specs.find((spec) => spec.path.length === 1);
  if (single) return { kind: 'command', spec: single, args: positionals.slice(1) };
  if (second === undefined) {
    const fallback = GROUP_DEFAULTS[first!];
    const spec = COMMANDS.find((s) => s.id === fallback);
    if (spec) return { kind: 'command', spec, args: [] };
    return { kind: 'help', group: first };
  }
  const spec = specs.find((s) => s.path[1] === second);
  if (!spec) {
    throw new CliError(
      'error.unknownCommand',
      { command: `${first} ${second}` },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  return { kind: 'command', spec, args: positionals.slice(2) };
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
  if (args.length < spec.args.length) {
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

const UUID_LIKE = /^[0-9A-Za-z][0-9A-Za-z-]{7,63}$/;

export function assertUuidArg(value: string): string {
  const trimmed = value.trim();
  if (!UUID_LIKE.test(trimmed)) {
    throw new CliError('error.invalidUuid', { value }, { exitCode: ExitCode.USAGE, code: 'usage' });
  }
  return trimmed;
}
