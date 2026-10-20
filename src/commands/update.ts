import type { Ctx } from '../context.js';
import { CliError, ExitCode, NetworkError } from '../errors.js';
import type { MessageKey } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { confirmStep } from '../ui/interact.js';
import { type Kit, kit } from '../ui/kit.js';
import {
  fetchLatest,
  PACKAGE_NAME,
  readUpdateCache,
  registryUrl,
  updateCheckDisabled,
  writeUpdateCache,
} from '../update/check.js';
import { commandText, detectInstall, type Install, updateCommandFor } from '../update/install.js';
import { fetchChanges, releaseUrl } from '../update/notes.js';
import { cliVersion, isNewerVersion } from '../version.js';

export interface UpdateFlags {
  check?: boolean;
  yes?: boolean;
}

const MANUAL = `npm install --global ${PACKAGE_NAME}@latest`;

const KIND_KEYS: Record<Install['kind'], MessageKey> = {
  global: 'update.kindGlobal',
  temporary: 'update.kindTemporary',
  project: 'update.kindProject',
  unknown: 'update.kindUnknown',
};

function installText(ctx: Ctx, install: Install): string {
  const t = ctx.out.t;
  return install.manager
    ? t('update.installedWith', { manager: install.manager, kind: t(KIND_KEYS[install.kind]) })
    : t(KIND_KEYS[install.kind]);
}

/**
 * Runs the package manager. Its output is shown as it comes (sanitized,
 * quiet), and a failure is explained, permissions included, without ever
 * suggesting sudo.
 */
export async function runUpdate(ctx: Ctx, install: Install): Promise<void> {
  const command = install.command ?? updateCommandFor('npm');
  const text = commandText(command);
  const k = ctx.out.richErr ? kit(ctx.out, 'err') : null;
  if (!ctx.json) {
    ctx.out.info(k ? `  ${k.violet(k.glyph.active)}  ${k.accent(text)}` : `$ ${text}`);
  }
  const result = await ctx.runProcess(command.program, command.args, (line) => {
    if (!ctx.json) ctx.out.info(k ? k.railLine(k.faint(line)) : `  ${line}`);
  });
  if (result.code === 0) return;
  if (result.startError === 'ENOENT') {
    throw new CliError(
      'update.managerMissing',
      { program: command.program },
      {
        exitCode: ExitCode.GENERAL,
        code: 'update_failed',
        hint: { key: 'hint.updateManual', vars: { command: MANUAL } },
      },
    );
  }
  if (/EACCES|EPERM|permission denied/i.test(result.output)) {
    const path = /\bpath (\S+)/.exec(result.output)?.[1] ?? install.path;
    throw new CliError(
      'update.permission',
      { path, manager: command.program },
      {
        exitCode: ExitCode.GENERAL,
        code: 'update_failed',
        hint: {
          key: command.program === 'npm' ? 'hint.updatePermissionNpm' : 'hint.updatePermission',
        },
      },
    );
  }
  throw new CliError(
    'update.failed',
    { status: result.code ?? '-' },
    {
      exitCode: ExitCode.GENERAL,
      code: 'update_failed',
      hint: { key: 'hint.updateManual', vars: { command: text } },
    },
  );
}

export async function updateCommand(ctx: Ctx, flags: UpdateFlags): Promise<number> {
  const t = ctx.out.t;
  const current = cliVersion();
  const install = detectInstall(ctx.binPath);
  const url = registryUrl(ctx.env);
  const k = ctx.out.rich ? kit(ctx.out, 'out') : null;
  if (k && !ctx.json) ctx.out.live([`  ${k.accent(k.spin[0]!)}  ${t('update.checking')}`]);
  let latest: string;
  try {
    latest = await fetchLatest(ctx.fetch, url);
  } catch (error) {
    ctx.out.clearLiveLine();
    throw new NetworkError(new URL(url).host, error);
  }
  ctx.out.clearLiveLine();
  await writeUpdateCache(ctx.configDir, {
    checkedAt: new Date(ctx.now()).toISOString(),
    latest,
  }).catch(() => undefined);
  const available = isNewerVersion(latest, current);
  const command =
    install.kind === 'global' && install.command ? commandText(install.command) : null;
  const data = {
    current,
    latest,
    updateAvailable: available,
    install: install.kind,
    manager: install.manager,
    command,
  };

  if (flags.check || !available || install.kind !== 'global') {
    if (ctx.json) {
      ctx.out.emitJson({ ok: true, data: { ...data, updated: false } });
      return ExitCode.OK;
    }
    printStatus(ctx, k, install, current, latest, available, Boolean(flags.check));
    return ExitCode.OK;
  }

  const changes = ctx.json ? [] : await fetchChanges(ctx.fetch, current, latest);
  if (!ctx.json) printStatus(ctx, k, install, current, latest, available, false, changes);
  if (!flags.yes) {
    if (!ctx.interactive) {
      throw new CliError(
        'error.confirmationRequired',
        { command: 'bladecp update --yes' },
        { exitCode: ExitCode.USAGE, code: 'confirmation_required' },
      );
    }
    const yes = await confirmStep(ctx, kit(ctx.out, 'err'), {
      title: t('update.ask', { latest }),
      detail: [kit(ctx.out, 'err').muted(command ?? MANUAL)],
      defaultYes: true,
    });
    if (!yes) {
      ctx.out.say('migrate.declined');
      return ExitCode.OK;
    }
  }
  await runUpdate(ctx, install);
  await writeUpdateCache(ctx.configDir, {
    checkedAt: new Date(ctx.now()).toISOString(),
    latest,
  }).catch(() => undefined);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { ...data, updated: true } });
    return ExitCode.OK;
  }
  if (k) {
    ctx.out.lines([`  ${k.rail(k.glyph.end)}  ${k.ok(t('update.done', { latest }))}`]);
  } else {
    ctx.out.print(t('update.done', { latest }));
  }
  return ExitCode.OK;
}

function printStatus(
  ctx: Ctx,
  k: Kit | null,
  install: Install,
  current: string,
  latest: string,
  available: boolean,
  check: boolean,
  changes: string[] = [],
): void {
  const t = ctx.out.t;
  const advice: { text: string; command?: string } | null = !available
    ? { text: t('update.upToDate') }
    : install.kind === 'temporary'
      ? { text: t('update.temporary') }
      : install.kind === 'project'
        ? {
            text: t('update.project', { path: install.path }),
            command: `npm install ${PACKAGE_NAME}@latest`,
          }
        : install.kind === 'unknown'
          ? { text: t('update.unknown'), command: MANUAL }
          : check
            ? { text: t('update.runIt'), command: 'bladecp update' }
            : null;
  if (!k) {
    ctx.out.print(t('update.installed', { version: current, how: installText(ctx, install) }));
    ctx.out.print(t('update.latest', { version: latest }));
    for (const change of changes) ctx.out.print(`  - ${safeText(change)}`);
    if (advice) {
      ctx.out.print(advice.text);
      if (advice.command) ctx.out.print(`  ${advice.command}`);
    }
    return;
  }
  const lines = [
    '',
    `  ${k.rail(k.glyph.open)}  ${k.bold(t('update.title'))}`,
    k.railLine(),
    `  ${k.ok(k.glyph.done)}  ${t('update.installed', { version: current, how: installText(ctx, install) })}`,
    `  ${available ? k.violet(k.glyph.active) : k.ok(k.glyph.done)}  ${t('update.latest', { version: latest })}`,
  ];
  if (changes.length > 0) {
    lines.push(k.railLine(), k.railLine(k.muted(t('update.whatsNew'))));
    for (const change of changes) {
      const parts = k.wrap(safeText(change), k.width - 7, '');
      parts.forEach((part, i) => {
        lines.push(k.railLine(`${i === 0 ? `${k.violet(k.glyph.dot)} ` : '  '}${part}`));
      });
    }
    lines.push(k.railLine(k.muted(`${t('update.notes')} ${releaseUrl(latest)}`)));
  }
  if (advice) {
    lines.push(k.railLine(), `  ${k.rail(k.glyph.end)}  ${advice.text}`);
    if (advice.command) lines.push(`  ${k.violet(k.glyph.arrow)} ${k.accent(advice.command)}`);
  } else {
    lines.push(k.railLine());
  }
  ctx.out.lines(lines);
}

// ------------------------------------------------- notice and automatic update

/** The quiet line about a new version: interactive terminals only, never in CI, JSON or without color. */
export function updateNoticeAllowed(ctx: Ctx): boolean {
  const caps = ctx.out.caps;
  return (
    !ctx.json &&
    !ctx.ci &&
    caps.outTTY &&
    caps.errTTY &&
    caps.errColor !== 'none' &&
    !updateCheckDisabled(ctx.env, ctx.preferences)
  );
}

export async function newerVersion(ctx: Ctx): Promise<string | null> {
  const cache = await readUpdateCache(ctx.configDir);
  const latest = cache?.latest;
  return latest && isNewerVersion(latest, cliVersion()) ? latest : null;
}

export async function printUpdateNotice(ctx: Ctx): Promise<void> {
  const latest = await newerVersion(ctx);
  if (!latest) return;
  const k = kit(ctx.out, 'err');
  ctx.out.infoLines([
    '',
    `  ${k.violet(k.glyph.active)}  ${ctx.out.tc('update.notice', {
      latest: safeText(latest),
      current: cliVersion(),
      command: k.accent('bladecp update'),
    })}`,
  ]);
}

/** After a failed automatic update, that version is not tried again for a day. */
const AUTO_UPDATE_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * A new version found by the daily check is installed before the command
 * runs, then the command runs on the new version, the way an app updates
 * itself. On by default since 0.4.1; `bladecp config set auto-update off`
 * turns it off. Interactive terminals and global installs only; never in CI,
 * with --json or in a script, which keep the quiet notice. A failed update
 * runs the command on the current version and waits a day before trying that
 * version again. Returns the exit code of the command when it ran again, or
 * null.
 */
/** The automatic update runs on any interactive terminal, with or without color. */
function autoUpdateAllowed(ctx: Ctx): boolean {
  const caps = ctx.out.caps;
  return (
    ctx.interactive &&
    !ctx.json &&
    !ctx.ci &&
    caps.outTTY &&
    caps.errTTY &&
    ctx.preferences.autoUpdate !== false &&
    !updateCheckDisabled(ctx.env, ctx.preferences)
  );
}

export async function autoUpdate(ctx: Ctx, argv: string[]): Promise<number | null> {
  if (!autoUpdateAllowed(ctx)) return null;
  if (ctx.env.BLADECP_AUTO_UPDATED) return null;
  const cache = await readUpdateCache(ctx.configDir);
  const latest = cache?.latest && isNewerVersion(cache.latest, cliVersion()) ? cache.latest : null;
  if (!latest || !cache) return null;
  const failed = cache.autoUpdateFailed;
  if (failed?.version === latest && Date.now() - Date.parse(failed.at) < AUTO_UPDATE_RETRY_MS) {
    return null;
  }
  const install = detectInstall(ctx.binPath);
  if (install.kind !== 'global') return null;
  const t = ctx.out.t;
  const k = kit(ctx.out, 'err');
  ctx.out.infoLines([
    '',
    `  ${k.violet(k.glyph.active)}  ${t('update.autoStarting', { current: cliVersion(), latest })}`,
  ]);
  try {
    await runUpdate(ctx, install);
  } catch {
    await writeUpdateCache(ctx.configDir, {
      ...cache,
      autoUpdateFailed: { version: latest, at: new Date().toISOString() },
    }).catch(() => undefined);
    ctx.out.infoLines([
      `  ${k.warn(k.glyph.active)}  ${t('update.autoFailed', { current: cliVersion() })}`,
      '',
    ]);
    return null;
  }
  ctx.out.infoLines([`  ${k.ok(k.glyph.done)}  ${t('update.autoDone', { latest })}`, '']);
  return ctx.rerun(argv, { ...ctx.env, BLADECP_AUTO_UPDATED: '1' });
}
