// Machine-readable reference of the CLI: commands, options, aliases, exit
// codes and stable error codes, with the texts of the three catalogs. It is
// built from the same tables the parser and the help use, so it never drifts
// from the binary. `pnpm run export:reference` writes it to reference.json,
// which the BladeCP Developers site syncs (`pnpm run cli:sync`). This module is
// not part of the npm package (see "files" in package.json).
import {
  argumentSyntax,
  COMMANDS,
  GLOBAL_OPTIONS,
  GROUP_DEFAULTS,
  OPTION_HELP,
  OPTIONS,
  type OptionName,
} from './args.js';
import { ExitCode, type ExitCodeValue } from './errors.js';
import { catalogs, LANGS, type Lang, type MessageKey } from './i18n/index.js';
import { cliVersion } from './version.js';

/** Bumped only when the shape of reference.json changes. */
export const REFERENCE_FORMAT = 1;

export type Localized = Record<Lang, string>;

/**
 * One stable error `code` (the `error.code` of the `--json` envelope). The
 * message is the catalog entry shown for it (the most common one when several
 * messages share a code, as `usage` does); the hint is the follow-up line.
 * `api` errors come from an API answer (`describeApiError`), `cli` errors are
 * raised by the CLI itself. `test/reference.test.ts` checks this table against
 * the source, so a new code cannot ship without it.
 */
export interface ErrorCodeSpec {
  code: string;
  origin: 'cli' | 'api';
  exitCodes: readonly ExitCodeValue[];
  message: MessageKey;
  hint?: MessageKey;
}

const E = ExitCode;

export const ERROR_CODES: readonly ErrorCodeSpec[] = [
  { code: 'unexpected', origin: 'cli', exitCodes: [E.GENERAL], message: 'error.unexpected' },
  { code: 'config_invalid', origin: 'cli', exitCodes: [E.GENERAL], message: 'error.configInvalid' },
  {
    code: 'invalid_response',
    origin: 'cli',
    exitCodes: [E.GENERAL],
    message: 'error.invalidKeyFromApi',
  },
  { code: 'http_error', origin: 'api', exitCodes: [E.GENERAL], message: 'error.server' },
  { code: 'usage', origin: 'cli', exitCodes: [E.USAGE], message: 'error.invalidArguments' },
  { code: 'invalid_api_url', origin: 'cli', exitCodes: [E.USAGE], message: 'error.invalidApiUrl' },
  {
    code: 'insecure_api_url',
    origin: 'cli',
    exitCodes: [E.USAGE],
    message: 'error.insecureApiUrl',
  },
  {
    code: 'invalid_key_format',
    origin: 'cli',
    exitCodes: [E.USAGE, E.AUTH],
    message: 'error.invalidKeyFormat',
    hint: 'hint.login',
  },
  { code: 'file_not_found', origin: 'cli', exitCodes: [E.USAGE], message: 'migrate.fileNotFound' },
  { code: 'not_a_file', origin: 'cli', exitCodes: [E.USAGE], message: 'migrate.notAFile' },
  { code: 'empty_file', origin: 'cli', exitCodes: [E.USAGE], message: 'migrate.emptyFile' },
  { code: 'file_too_large', origin: 'cli', exitCodes: [E.USAGE], message: 'migrate.tooLarge' },
  {
    code: 'file_unreadable',
    origin: 'cli',
    exitCodes: [E.USAGE],
    message: 'migrate.fileUnreadable',
  },
  { code: 'not_gzip', origin: 'cli', exitCodes: [E.USAGE], message: 'migrate.notGzip' },
  {
    code: 'destination_required',
    origin: 'cli',
    exitCodes: [E.USAGE],
    message: 'migrate.destinationRequired',
    hint: 'hint.destinations',
  },
  { code: 'invalid_domain', origin: 'cli', exitCodes: [E.USAGE], message: 'review.invalidDomain' },
  {
    code: 'not_signed_in',
    origin: 'cli',
    exitCodes: [E.AUTH],
    message: 'error.notSignedIn',
    hint: 'hint.login',
  },
  {
    code: 'unauthorized',
    origin: 'api',
    exitCodes: [E.AUTH],
    message: 'error.unauthorized',
    hint: 'hint.newKey',
  },
  {
    code: 'api_key_expired',
    origin: 'api',
    exitCodes: [E.AUTH],
    message: 'error.keyExpired',
    hint: 'hint.newKey',
  },
  {
    code: 'api_key_cap_reached',
    origin: 'api',
    exitCodes: [E.AUTH],
    message: 'error.apiKeyCapReached',
  },
  { code: 'invalid_grant', origin: 'api', exitCodes: [E.AUTH], message: 'error.invalidGrant' },
  {
    code: 'state_mismatch',
    origin: 'cli',
    exitCodes: [E.AUTH],
    message: 'error.loginStateMismatch',
  },
  { code: 'access_denied', origin: 'cli', exitCodes: [E.AUTH], message: 'error.loginDenied' },
  { code: 'invalid_callback', origin: 'cli', exitCodes: [E.AUTH], message: 'error.loginNoCode' },
  { code: 'login_timeout', origin: 'cli', exitCodes: [E.AUTH], message: 'error.loginTimeout' },
  {
    code: 'commerce_restricted',
    origin: 'api',
    exitCodes: [E.FORBIDDEN],
    message: 'error.commerceRestricted',
  },
  {
    code: 'insufficient_scope',
    origin: 'api',
    exitCodes: [E.FORBIDDEN],
    message: 'error.insufficientScope',
    hint: 'hint.newKey',
  },
  {
    code: 'key_bound_to_migration',
    origin: 'api',
    exitCodes: [E.FORBIDDEN],
    message: 'error.keyBoundToMigration',
    hint: 'hint.newKey',
  },
  {
    code: 'environment_mismatch',
    origin: 'api',
    exitCodes: [E.FORBIDDEN],
    message: 'error.environmentMismatch',
  },
  { code: 'forbidden', origin: 'api', exitCodes: [E.FORBIDDEN], message: 'error.forbidden' },
  { code: 'not_found', origin: 'api', exitCodes: [E.NOT_FOUND], message: 'error.notFound' },
  {
    code: 'destination_unavailable',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.destinationUnavailable',
    hint: 'hint.destinations',
  },
  {
    code: 'no_destinations',
    origin: 'cli',
    exitCodes: [E.REJECTED],
    message: 'migrate.noDestinations',
  },
  {
    code: 'domain_unavailable',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.domainUnavailable',
  },
  {
    code: 'upload_not_allowed',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.uploadNotAllowed',
  },
  {
    code: 'review_unavailable',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.reviewUnavailable',
  },
  {
    code: 'review_conflict',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.reviewConflict',
  },
  {
    code: 'retry_unavailable',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.retryUnavailable',
  },
  {
    code: 'backup_unavailable',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.backupUnavailable',
  },
  {
    code: 'idempotency_conflict',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.idempotencyConflict',
  },
  {
    code: 'phase_conflict',
    origin: 'api',
    exitCodes: [E.REJECTED],
    message: 'error.phaseConflict',
  },
  { code: 'conflict', origin: 'api', exitCodes: [E.REJECTED], message: 'error.rejected' },
  { code: 'unprocessable', origin: 'api', exitCodes: [E.REJECTED], message: 'error.rejected' },
  { code: 'invalid_request', origin: 'api', exitCodes: [E.REJECTED], message: 'error.rejected' },
  {
    code: 'rate_limited',
    origin: 'api',
    exitCodes: [E.RATE_LIMITED],
    message: 'error.rateLimited',
  },
  {
    code: 'daily_quota_exceeded',
    origin: 'api',
    exitCodes: [E.RATE_LIMITED],
    message: 'error.dailyQuota',
  },
  { code: 'network_error', origin: 'cli', exitCodes: [E.NETWORK], message: 'error.network' },
  { code: 'server_error', origin: 'api', exitCodes: [E.NETWORK], message: 'error.server' },
  { code: 'try_again', origin: 'api', exitCodes: [E.NETWORK], message: 'error.tryAgainShortly' },
  {
    code: 'upload_failed',
    origin: 'cli',
    exitCodes: [E.NETWORK],
    message: 'upload.partFailed',
    hint: 'hint.rerunToResume',
  },
  {
    code: 'upload_restarted',
    origin: 'cli',
    exitCodes: [E.NETWORK],
    message: 'upload.restartLoop',
  },
  {
    code: 'upload_plan_inconsistent',
    origin: 'cli',
    exitCodes: [E.NETWORK],
    message: 'upload.planInconsistent',
  },
  {
    code: 'upload_complete_failed',
    origin: 'cli',
    exitCodes: [E.NETWORK],
    message: 'upload.completeFailed',
    hint: 'hint.rerunToResume',
  },
  {
    code: 'upload_size_mismatch',
    origin: 'cli',
    exitCodes: [E.NETWORK],
    message: 'upload.sizeMismatch',
    hint: 'hint.rerunToResume',
  },
  { code: 'interrupted', origin: 'cli', exitCodes: [E.INTERRUPTED], message: 'error.interrupted' },
];

/** Names of `ExitCode`, by value. */
const EXIT_NAMES = new Map<number, string>(
  Object.entries(ExitCode).map(([name, value]) => [value, name]),
);

function localized(key: MessageKey): Localized {
  return Object.fromEntries(LANGS.map((lang) => [lang, catalogs[lang][key]])) as Localized;
}

/**
 * Description of each exit code in one language, read from `help.exitCodes`
 * ("0 ok, 1 unexpected error, ..."), the line `bladecp --help` prints.
 */
export function exitCodeDescriptions(lang: Lang): Map<number, string> {
  const result = new Map<number, string>();
  for (const part of catalogs[lang]['help.exitCodes'].split(', ')) {
    const match = /^(\d+) (.+)$/.exec(part);
    if (!match) throw new Error(`help.exitCodes (${lang}): cannot read "${part}"`);
    result.set(Number(match[1]), match[2]!);
  }
  const expected = [...EXIT_NAMES.keys()].sort((a, b) => a - b);
  const found = [...result.keys()].sort((a, b) => a - b);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(
      `help.exitCodes (${lang}) lists ${found.join(', ')}, ExitCode has ${expected.join(', ')}`,
    );
  }
  return result;
}

/** `--lang <en|pt-BR|es>` -> `<en|pt-BR|es>`; `-y, --yes` -> null. */
function valueSyntax(syntax: string): string | null {
  const rest = syntax
    .replace(/^-\w, /, '')
    .replace(/^--[\w-]+/, '')
    .trim();
  return rest === '' ? null : rest;
}

export function buildReference() {
  const descriptions = Object.fromEntries(
    LANGS.map((lang) => [lang, exitCodeDescriptions(lang)]),
  ) as Record<Lang, Map<number, string>>;
  const optionNames = Object.keys(OPTIONS) as OptionName[];

  return {
    format: REFERENCE_FORMAT,
    name: 'BladeCP CLI',
    binary: 'bladecp',
    version: cliVersion(),
    languages: [...LANGS],
    commands: COMMANDS.map((spec) => ({
      id: spec.id,
      command: spec.path.join(' '),
      usage: spec.usage,
      arguments: spec.args.map(argumentSyntax),
      options: [...spec.options],
      signInRequired: !spec.public,
      summary: localized(spec.summary),
    })),
    options: optionNames.map((name) => {
      const option = OPTIONS[name] as { type: 'boolean' | 'string'; short?: string };
      const help = OPTION_HELP[name];
      return {
        name,
        flag: `--${name}`,
        short: option.short ? `-${option.short}` : null,
        syntax: help.syntax,
        value: valueSyntax(help.syntax),
        type: option.type,
        global: GLOBAL_OPTIONS.includes(name),
        commands: COMMANDS.filter((spec) => spec.options.includes(name)).map((spec) => spec.id),
        description: localized(help.key),
      };
    }),
    globalOptions: [...GLOBAL_OPTIONS],
    aliases: [
      ...optionNames
        .filter((name) => (OPTIONS[name] as { short?: string }).short)
        .map((name) => ({
          kind: 'short-option' as const,
          alias: `-${(OPTIONS[name] as { short: string }).short}`,
          target: `--${name}`,
        })),
      {
        kind: 'help-command' as const,
        alias: 'bladecp help <command>',
        target: 'bladecp <command> --help',
      },
      ...Object.entries(GROUP_DEFAULTS).map(([group, id]) => {
        const spec = COMMANDS.find((candidate) => candidate.id === id);
        if (!spec) throw new Error(`group default ${group} points to unknown command ${id}`);
        return {
          kind: 'group-default' as const,
          alias: `bladecp ${group}`,
          target: `bladecp ${spec.path.join(' ')}`,
        };
      }),
    ],
    exitCodes: [...EXIT_NAMES.entries()]
      .sort(([a], [b]) => a - b)
      .map(([code, name]) => ({
        code,
        name,
        description: Object.fromEntries(
          LANGS.map((lang) => [lang, descriptions[lang].get(code)!]),
        ) as Localized,
      })),
    errors: [...ERROR_CODES]
      .sort((a, b) => a.exitCodes[0]! - b.exitCodes[0]!)
      .map((spec) => ({
        code: spec.code,
        origin: spec.origin,
        exitCodes: [...spec.exitCodes],
        message: localized(spec.message),
        hint: spec.hint ? localized(spec.hint) : null,
      })),
  };
}

export type CliReference = ReturnType<typeof buildReference>;

/** The exact text of reference.json: 2 spaces, final newline. */
export function formatReference(reference: CliReference): string {
  return `${JSON.stringify(reference, null, 2)}\n`;
}
