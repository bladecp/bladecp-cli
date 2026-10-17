import {
  assertUuidArg,
  type CommandSpec,
  type OptionValues,
  parseCli,
  prescan,
  resolveCommand,
  validateInvocation,
} from './args.js';
import { loginCommand, logoutCommand, whoamiCommand } from './commands/account.js';
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
import { resolveConfigDir } from './config.js';
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
  NetworkError,
} from './errors.js';
import { commandHelp, globalHelp, groupHelp } from './help.js';
import { detectLang, type Lang, normalizeLang } from './i18n/index.js';
import { Output } from './output.js';
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
      return serversListCommand(ctx);
    case 'servers.show':
      return serversShowCommand(ctx, assertUuidArg(args[0]!));
    case 'destinations.list':
      return destinationsListCommand(ctx, str(values, 'currency'));
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
      return migrationsApproveCommand(ctx, assertUuidArg(args[0]!));
    case 'migrations.cancel':
      return migrationsCancelCommand(ctx, assertUuidArg(args[0]!), str(values, 'reason'));
    case 'migrations.retry':
      return migrationsRetryCommand(ctx, assertUuidArg(args[0]!));
  }
}

function describe(error: unknown): DescribedError & { details?: Record<string, unknown> } {
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
  if (error instanceof ApiError) return describeApiError(error);
  if (error instanceof NetworkError) {
    return {
      key: 'error.network',
      vars: { host: error.host },
      exitCode: ExitCode.NETWORK,
      code: 'network_error',
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
  return {
    key: 'error.unexpected',
    vars: { message: error instanceof Error ? error.message : String(error) },
    exitCode: ExitCode.GENERAL,
    code: 'unexpected',
  };
}

function report(out: Output, error: unknown, keysUrl: string): number {
  const d = describe(error);
  // `{url}` in key-related messages and hints is the Hub API keys page.
  const message = out.t(d.key, { url: keysUrl, ...d.vars });
  const hint = d.hint ? out.t(d.hint.key, { url: keysUrl, ...d.hint.vars }) : undefined;
  if (out.json) {
    out.clearLiveLine();
    out.emitJson({
      ok: false,
      error: {
        code: d.code,
        message,
        exitCode: d.exitCode,
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.apiCode !== undefined ? { apiCode: d.apiCode } : {}),
        ...(hint ? { hint } : {}),
        ...(d.details ?? {}),
      },
    });
  } else {
    out.error(message, hint);
  }
  return d.exitCode;
}

/** Runs one CLI invocation and returns the process exit code. Never throws. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  const pre = prescan(argv);
  let lang: Lang = detectLang(deps.env, deps.systemLocale);
  const flagLang = pre.lang !== undefined ? normalizeLang(pre.lang) : undefined;
  if (flagLang) lang = flagLang;
  const out = new Output(deps.stdout, deps.stderr, { json: pre.json, lang, env: deps.env });
  out.addSecret(deps.env.BLADECP_API_KEY?.trim());
  let keysUrl = apiKeysPageUrl(DEFAULT_HUB_URL);

  try {
    if (pre.lang !== undefined && !flagLang) {
      throw new CliError(
        'error.invalidLang',
        { value: pre.lang },
        { exitCode: ExitCode.USAGE, code: 'usage' },
      );
    }
    const { values, positionals } = parseCli(argv);
    if (values.version) {
      if (pre.json) out.emitJson({ ok: true, data: { version: cliVersion() } });
      else deps.stdout.write(`${cliVersion()}\n`);
      return ExitCode.OK;
    }
    const resolved = resolveCommand(positionals);
    if (resolved.kind === 'help' || values.help) {
      const topic = resolved.kind === 'command' ? resolved.spec : resolved.topic;
      const group = resolved.kind === 'help' ? resolved.group : undefined;
      const text = topic
        ? commandHelp(out.t, topic)
        : group
          ? groupHelp(out.t, group)
          : globalHelp(out.t, cliVersion());
      deps.stdout.write(`${text}\n`);
      return ExitCode.OK;
    }
    const { spec, args } = resolved;
    validateInvocation(spec, values, args);

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
      configDir: resolveConfigDir(deps.env, deps.platform, deps.homedir),
      userAgent: `bladecp-cli/${cliVersion()} node/${process.versions.node} ${deps.platform}`,
      interactive: !pre.json && Boolean(deps.stdin.isTTY) && Boolean(deps.stdout.isTTY),
    };
    return await dispatch(ctx, spec, args, values);
  } catch (error) {
    return report(out, error, keysUrl);
  } finally {
    out.clearLiveLine();
  }
}
