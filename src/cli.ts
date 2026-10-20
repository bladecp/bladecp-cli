import {
  assertUuidArg,
  COMMANDS,
  type CommandSpec,
  isGroup,
  type OptionValues,
  parseCli,
  prescan,
  resolveCommand,
  validateInvocation,
} from './args.js';
import { loginCommand, logoutCommand, whoamiCommand } from './commands/account.js';
import { analyzeCommand } from './commands/analyze.js';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config.js';
import { HANDLERS } from './commands/handlers.js';
import { homeCommand } from './commands/home.js';
import { migrateCommand } from './commands/migrate.js';
import {
  migrationsApproveCommand,
  migrationsCancelCommand,
  migrationsListCommand,
  migrationsRetryCommand,
  migrationsReviewCommand,
  migrationsStatusCommand,
} from './commands/migrations.js';
import {
  destinationsListCommand,
  serversListCommand,
  serversShowCommand,
} from './commands/servers.js';
import {
  autoUpdate,
  printUpdateNotice,
  updateCommand,
  updateNoticeAllowed,
} from './commands/update.js';
import { type Preferences, readPreferences, resolveConfigDir } from './config.js';
import type { Ctx, Deps } from './context.js';
import { apiKeysPageUrl, DEFAULT_HUB_URL, resolveApiUrl, resolveHubUrl } from './endpoints.js';
import {
  ApiError,
  CliError,
  type DescribedError,
  describeApiError,
  ExitCode,
  InterruptedError,
  isAbortLike,
  isSystemError,
  NetworkError,
} from './errors.js';
import { phaseLabel } from './format.js';
import { commandHelp, globalHelp, groupHelp, helpDocument } from './help.js';
import { detectLang, type Lang, type MessageKey, normalizeLang } from './i18n/index.js';
import { type ErrorView, errorBlock, kit } from './ui/kit.js';
import { Output } from './ui/output.js';
import { isCI } from './ui/term.js';
import { checkIsDue, readUpdateCache, registryUrl, writeUpdateCache } from './update/check.js';
import { cliVersion } from './version.js';

function str(values: OptionValues, name: keyof OptionValues): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

function bool(values: OptionValues, name: keyof OptionValues): boolean {
  return values[name] === true;
}

async function dispatch(
  ctx: Ctx,
  spec: CommandSpec,
  args: string[],
  values: OptionValues,
): Promise<number> {
  switch (spec.id) {
    case 'login':
      return loginCommand(ctx, {
        token: str(values, 'token'),
        noBrowser: bool(values, 'no-browser'),
      });
    case 'logout':
      return logoutCommand(ctx);
    case 'whoami':
      return whoamiCommand(ctx);
    case 'servers.list':
      return serversListCommand(ctx, bool(values, 'all'));
    case 'servers.show':
      return serversShowCommand(ctx, assertUuidArg(args[0]!));
    case 'destinations.list':
      return destinationsListCommand(ctx, str(values, 'currency'));
    case 'analyze':
      return analyzeCommand(ctx, args[0]!, {
        prices: bool(values, 'prices'),
        currency: str(values, 'currency'),
      });
    case 'migrate':
      return migrateCommand(ctx, args[0]!, {
        plan: str(values, 'plan'),
        location: str(values, 'location'),
        domain: str(values, 'domain'),
        yes: bool(values, 'yes'),
        noWait: bool(values, 'no-wait'),
      });
    case 'migrations.list':
      return migrationsListCommand(ctx);
    case 'migrations.status':
      return migrationsStatusCommand(ctx, assertUuidArg(args[0]!), bool(values, 'watch'));
    case 'migrations.review':
      return migrationsReviewCommand(ctx, assertUuidArg(args[0]!), str(values, 'domain'));
    case 'migrations.approve':
      return migrationsApproveCommand(ctx, assertUuidArg(args[0]!), bool(values, 'yes'));
    case 'migrations.cancel':
      return migrationsCancelCommand(
        ctx,
        assertUuidArg(args[0]!),
        str(values, 'reason'),
        bool(values, 'yes'),
      );
    case 'migrations.retry':
      return migrationsRetryCommand(ctx, assertUuidArg(args[0]!));
    case 'update':
      return updateCommand(ctx, { check: bool(values, 'check'), yes: bool(values, 'yes') });
    case 'config.list':
      return configListCommand(ctx);
    case 'config.get':
      return configGetCommand(ctx, args[0]!);
    case 'config.set':
      return configSetCommand(ctx, args[0]!, args[1]!);
    default: {
      // The command groups of src/commands/specs/ (each with its handlers).
      const handler = HANDLERS[spec.id];
      if (!handler) throw new Error(`No handler for the command ${spec.id}`);
      return handler(ctx, { spec, args, values });
    }
  }
}

/** Translations of the system error codes the CLI explains in words. */
const SYSTEM_REASONS: Record<string, MessageKey> = {
  EACCES: 'errno.EACCES',
  EPERM: 'errno.EACCES',
  ENOSPC: 'errno.ENOSPC',
  EROFS: 'errno.EROFS',
  ENOENT: 'errno.ENOENT',
  ENOTDIR: 'errno.ENOTDIR',
  EISDIR: 'errno.EISDIR',
  EMFILE: 'errno.EMFILE',
  EDQUOT: 'errno.ENOSPC',
};

const NETWORK_CAUSES: Record<string, MessageKey> = {
  ECONNREFUSED: 'cause.ECONNREFUSED',
  ENOTFOUND: 'cause.ENOTFOUND',
  EAI_AGAIN: 'cause.ENOTFOUND',
  ETIMEDOUT: 'cause.ETIMEDOUT',
  UND_ERR_CONNECT_TIMEOUT: 'cause.ETIMEDOUT',
  ECONNRESET: 'cause.ECONNRESET',
  UND_ERR_SOCKET: 'cause.ECONNRESET',
  EPIPE: 'cause.ECONNRESET',
  CERT_HAS_EXPIRED: 'cause.TLS',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'cause.TLS',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'cause.TLS',
  SELF_SIGNED_CERT_IN_CHAIN: 'cause.TLS',
  ERR_TLS_CERT_ALTNAME_INVALID: 'cause.TLS',
};

type Described = DescribedError & {
  details?: Record<string, unknown>;
  /** A catalog key that explains the cause, shown on the terminal. */
  causeKey?: MessageKey;
};

function describe(error: unknown): Described {
  if (error instanceof CliError) {
    return {
      key: error.key,
      vars: error.vars,
      exitCode: error.exitCode,
      code: error.code,
      ...(error.hint ? { hint: error.hint } : {}),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof ApiError) {
    const described: Described = describeApiError(error);
    if (error.extraHint) described.hint = error.extraHint;
    if (error.extraDetails) described.details = error.extraDetails;
    return described;
  }
  if (error instanceof NetworkError) {
    const system = error.systemCode;
    const causeKey = system ? NETWORK_CAUSES[system] : undefined;
    return {
      key: 'error.network',
      vars: { host: error.host },
      exitCode: ExitCode.NETWORK,
      code: 'network_error',
      ...(causeKey ? { causeKey } : {}),
    };
  }
  if (error instanceof InterruptedError || isAbortLike(error)) {
    return {
      key: 'error.interrupted',
      vars: {},
      exitCode: ExitCode.INTERRUPTED,
      code: 'interrupted',
    };
  }
  if (isSystemError(error)) {
    // A file the CLI needs (config folder, upload state, the backup) could not be used.
    return {
      key: 'error.fileSystem',
      vars: {
        path: error.path ?? '-',
        reason: SYSTEM_REASONS[error.code] ?? 'errno.other',
        code: error.code,
      },
      exitCode: ExitCode.GENERAL,
      code: 'filesystem_error',
      hint: { key: 'hint.fileSystem' },
    };
  }
  return {
    key: 'error.unexpected',
    vars: { message: error instanceof Error ? error.message : String(error) },
    exitCode: ExitCode.GENERAL,
    code: 'unexpected',
  };
}

function report(out: Output, error: unknown, keysUrl: string): number {
  const d = describe(error);
  const t = out.t;
  const vars: Record<string, string | number> = { url: keysUrl, ...d.vars };
  // The phase in a conflict is shown in words, as everywhere else.
  if (d.code === 'phase_conflict' && typeof d.vars.phase === 'string') {
    vars.phase = phaseLabel(d.vars.phase, t);
  }
  if (d.code === 'filesystem_error' && typeof d.vars.reason === 'string') {
    vars.reason = t(d.vars.reason as MessageKey, { code: String(d.vars.code ?? '') });
  }
  const message = t(d.key, vars);
  const hint = d.hint ? t(d.hint.key, { url: keysUrl, ...d.hint.vars }) : undefined;
  if (out.json) {
    out.clearLiveLine();
    const envelope = {
      ok: false,
      error: {
        code: d.code,
        message,
        exitCode: d.exitCode,
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.apiCode !== undefined ? { apiCode: d.apiCode } : {}),
        ...(hint ? { hint } : {}),
        ...(d.code === 'phase_conflict' && typeof d.vars.phase === 'string'
          ? { phase: d.vars.phase }
          : {}),
        ...(d.details ?? {}),
      },
    };
    if (out.ndjson) out.emitJsonLine(envelope);
    else out.emitJson(envelope);
    return d.exitCode;
  }
  if (!out.caps.errTTY) {
    out.error(message, hint);
    return d.exitCode;
  }
  const k = kit(out, 'err');
  const fixes: ErrorView['fixes'] = [];
  if (d.code === 'not_signed_in') {
    fixes.push({ command: 'bladecp login', text: t('err.fixLogin') });
    fixes.push({ command: 'export BLADECP_API_KEY=…', text: t('err.fixEnvKey') });
  } else if (d.hint?.key === 'hint.newKey') {
    fixes.push({ command: 'bladecp login', text: t('err.fixNewKey') });
    fixes.push(k.muted(t('err.fixKeyInHub')), k.link(keysUrl));
  } else if (hint) {
    fixes.push(...k.wrap(hint, Math.min(k.width, 76) - 14, ''));
  }
  if (d.code === 'update_required') fixes.push(k.accent('bladecp update'));
  if (d.code === 'network_error')
    fixes.push(...k.wrap(t('err.fixNetwork'), Math.min(k.width, 76) - 14, ''));
  const paused = d.code === 'interrupted';
  out.infoLines([
    '',
    ...errorBlock(k, {
      title: message,
      cause: d.causeKey
        ? t(d.causeKey)
        : d.code === 'not_signed_in' && d.key === 'error.notSignedIn'
          ? t('cause.notSignedIn')
          : undefined,
      fixes,
      exit: d.exitCode,
      code: d.code,
      ...(paused ? { tone: 'warn' as const, glyph: k.glyph.square } : {}),
    }),
  ]);
  return d.exitCode;
}

/**
 * Starts the daily version check in the background when it is due. Only for
 * interactive runs that could show the notice.
 */
async function backgroundCheck(ctx: Ctx): Promise<void> {
  if (!updateNoticeAllowed(ctx)) return;
  const cache = await readUpdateCache(ctx.configDir);
  const now = ctx.now();
  if (!checkIsDue(cache, now)) return;
  try {
    // Mark the check as started, so parallel runs do not repeat it.
    await writeUpdateCache(ctx.configDir, {
      checkedAt: new Date(now).toISOString(),
      latest: cache?.latest ?? null,
    });
  } catch {
    return;
  }
  ctx.startUpdateCheck({
    configDir: ctx.configDir,
    registryUrl: registryUrl(ctx.env),
    current: cliVersion(),
  });
}

/** Runs one CLI invocation and returns the process exit code. Never throws. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  const pre = prescan(argv);
  const configDir = resolveConfigDir(deps.env, deps.platform, deps.homedir);
  const preferences: Preferences = await readPreferences(configDir);
  let lang: Lang = normalizeLang(preferences.lang) ?? detectLang(deps.env, deps.systemLocale);
  const flagLang = pre.lang !== undefined ? normalizeLang(pre.lang) : undefined;
  if (flagLang) lang = flagLang;
  const out = new Output(deps.stdout, deps.stderr, {
    json: pre.json,
    lang,
    env: deps.env,
    platform: deps.platform,
  });
  out.debugEnabled = pre.debug;
  out.addSecret(deps.env.BLADECP_API_KEY?.trim());
  let keysUrl = apiKeysPageUrl(DEFAULT_HUB_URL);
  const ci = isCI(deps.env);

  try {
    if (pre.lang !== undefined && !flagLang) {
      throw new CliError(
        'error.invalidLang',
        { value: pre.lang },
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    const { values, positionals, repeated } = parseCli(argv);
    if (values.version) {
      if (pre.json) out.emitJson({ ok: true, data: { version: cliVersion() } });
      else out.print(cliVersion());
      return ExitCode.OK;
    }
    const resolved = resolveCommand(positionals);
    const home = resolved.kind === 'help' && positionals.length === 0 && !values.help;
    if ((resolved.kind === 'help' || values.help) && !(home && out.rich && !pre.json)) {
      // `bladecp migrations --help` is the help of the whole group (unless
      // the words are also a command of their own, as `bladecp api` is).
      const group =
        resolved.kind === 'help'
          ? resolved.group
          : isGroup(positionals) &&
              !COMMANDS.some((s) => s.path.join(' ') === positionals.join(' '))
            ? positionals.join(' ')
            : undefined;
      const topic = group
        ? undefined
        : resolved.kind === 'command'
          ? resolved.spec
          : resolved.topic;
      if (pre.json) {
        out.emitJson(helpDocument(out, cliVersion(), { spec: topic, group }));
        return ExitCode.OK;
      }
      const text = topic
        ? commandHelp(out, topic)
        : group
          ? groupHelp(out, group)
          : globalHelp(out, cliVersion());
      out.print(text);
      return ExitCode.OK;
    }
    for (const entry of repeated) {
      out.warn(
        entry.value
          ? out.t('warning.repeatedOption', { option: entry.option, value: entry.value })
          : out.t('warning.repeatedFlag', { option: entry.option }),
      );
    }
    const spec = resolved.kind === 'command' ? resolved.spec : null;
    const args = resolved.kind === 'command' ? resolved.args : [];
    if (spec) validateInvocation(spec, values, args);

    const apiUrl = resolveApiUrl(str(values, 'api-url'), deps.env);
    const hubUrl = resolveHubUrl(apiUrl, deps.env);
    keysUrl = apiKeysPageUrl(hubUrl);
    const ctx: Ctx = {
      ...deps,
      out,
      lang,
      json: pre.json,
      apiUrl,
      hubUrl,
      keysUrl,
      configDir,
      userAgent: `bladecp-cli/${cliVersion()} node/${process.versions.node} ${deps.platform}`,
      interactive: !pre.json && !ci && Boolean(deps.stdin.isTTY) && Boolean(deps.stdout.isTTY),
      ci,
      preferences,
    };
    const updating = spec?.id === 'update' || spec?.path[0] === 'config';
    if (!updating) {
      const rerun = await autoUpdate(ctx, argv);
      if (rerun !== null) return rerun;
    }
    await backgroundCheck(ctx);
    const code = spec ? await dispatch(ctx, spec, args, values) : await homeCommand(ctx);
    if (!updating && updateNoticeAllowed(ctx)) await printUpdateNotice(ctx);
    return code;
  } catch (error) {
    return report(out, error, keysUrl);
  } finally {
    out.clearLiveLine();
  }
}
