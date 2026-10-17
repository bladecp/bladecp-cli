import { randomUUID } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { BladecpApi } from '../api.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode, InterruptedError } from '../errors.js';
import {
  formatBytes,
  formatDuration,
  isValidDomain,
  normalizeDomain,
  phaseLabel,
} from '../format.js';
import { choose, confirm } from '../prompt.js';
import { safeText } from '../sanitize.js';
import type { Migration } from '../types.js';
import { orderedParts, type UploadPlan } from '../upload/plan.js';
import { putPart as defaultPutPart } from '../upload/put.js';
import {
  loadState,
  type MigrateState,
  pruneStates,
  removeState,
  saveState,
  stateKey,
} from '../upload/state.js';
import { uploadBackup } from '../upload/uploader.js';
import { domainPointing, followMigration, nextAction, printFollowOutcome } from './follow.js';
import { destinationLabel } from './servers.js';

/** 50 GB backup limit enforced by the API. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024 * 1024;

export interface MigrateFlags {
  plan?: string | undefined;
  location?: string | undefined;
  domain?: string | undefined;
  yes?: boolean | undefined;
  noWait?: boolean | undefined;
}

interface BackupFile {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
}

interface ChosenDestination {
  partnerPlanId: number;
  locationId: number;
  label: string;
}

const ENDED_PHASES = new Set(['failed', 'cancelled', 'live']);

export function parsePositiveInt(value: string, option: string): number {
  const trimmed = value.trim();
  const n = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(n) || n <= 0) {
    throw new CliError(
      'error.invalidNumber',
      { option, value },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  return n;
}

export async function inspectBackup(arg: string): Promise<BackupFile> {
  const path = resolve(arg);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    throw new CliError(
      'migrate.fileNotFound',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'file_not_found' },
    );
  }
  if (!info.isFile()) {
    throw new CliError(
      'migrate.notAFile',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'not_a_file' },
    );
  }
  if (info.size === 0) {
    throw new CliError(
      'migrate.emptyFile',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'empty_file' },
    );
  }
  if (info.size > MAX_BACKUP_BYTES) {
    throw new CliError(
      'migrate.tooLarge',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'file_too_large' },
    );
  }
  const header = Buffer.alloc(2);
  try {
    const handle = await open(path, 'r');
    try {
      await handle.read(header, 0, 2, 0);
    } finally {
      await handle.close();
    }
  } catch {
    throw new CliError(
      'migrate.fileUnreadable',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'file_unreadable' },
    );
  }
  if (header[0] !== 0x1f || header[1] !== 0x8b) {
    throw new CliError(
      'migrate.notGzip',
      { path: arg },
      { exitCode: ExitCode.USAGE, code: 'not_gzip' },
    );
  }
  const real = await realpath(path);
  return { path: real, name: basename(real), size: info.size, mtimeMs: info.mtimeMs };
}

async function chooseDestination(
  ctx: Ctx,
  api: BladecpApi,
  plan: number | undefined,
  location: number | undefined,
  yes: boolean,
): Promise<ChosenDestination> {
  const t = ctx.out.t;
  if (plan !== undefined && location !== undefined) {
    return {
      partnerPlanId: plan,
      locationId: location,
      label: t('migrate.destinationIds', { plan, location }),
    };
  }
  // Without a terminal the destination (and therefore the plan that will be
  // billed) is never guessed: it comes from --plan/--location, or from --yes
  // when the account has exactly one possible destination.
  const required = () =>
    new CliError(
      'migrate.destinationRequired',
      {},
      {
        exitCode: ExitCode.USAGE,
        code: 'destination_required',
        hint: { key: 'hint.destinations' },
      },
    );
  if (!ctx.interactive && !yes) throw required();
  const destinations = await api.listDestinations();
  const options: ChosenDestination[] = [];
  for (const d of destinations) {
    d.locations.forEach((loc, index) => {
      options.push({
        partnerPlanId: d.partnerPlanId,
        locationId: loc.locationId,
        label: destinationLabel(d, index, ctx),
      });
    });
  }
  if (options.length === 0) {
    throw new CliError(
      'migrate.noDestinations',
      {},
      { exitCode: ExitCode.REJECTED, code: 'no_destinations' },
    );
  }
  if (options.length === 1) {
    // On a terminal the confirmation that follows shows it (unless --yes).
    const only = options[0]!;
    ctx.out.info(t('migrate.onlyDestination', { destination: only.label }));
    return only;
  }
  if (!ctx.interactive) throw required();
  const prompter = ctx.createPrompter();
  try {
    const index = await choose(
      prompter,
      ctx.out,
      t('migrate.chooseDestination'),
      options.map((o) => o.label),
    );
    return options[index]!;
  } finally {
    prompter.close();
  }
}

function progressReporter(ctx: Ctx, file: BackupFile) {
  const t = ctx.out.t;
  const startedAt = ctx.now();
  let startBytes: number | undefined;
  let lastDraw = 0;
  let lastStep = -1;
  return (uploaded: number, total: number) => {
    if (ctx.json) return;
    startBytes ??= uploaded;
    const percent = total > 0 ? Math.floor((uploaded / total) * 100) : 100;
    const now = ctx.now();
    if (ctx.out.stderrIsTTY) {
      if (now - lastDraw < 200 && uploaded < total) return;
      lastDraw = now;
      const elapsed = Math.max(1, now - startedAt);
      const rate = ((uploaded - startBytes) / elapsed) * 1000;
      const width = 24;
      const filled = Math.round((percent / 100) * width);
      const bar = `${'#'.repeat(filled)}${'.'.repeat(width - filled)}`;
      const eta =
        rate > 0 && uploaded < total
          ? `  ${t('upload.eta', { time: formatDuration(((total - uploaded) / rate) * 1000) })}`
          : '';
      ctx.out.liveLine(
        `${t('upload.progress', { file: file.name })} [${bar}] ${percent}%  ${formatBytes(uploaded, ctx.lang)} / ${formatBytes(total, ctx.lang)}  ${formatBytes(rate, ctx.lang)}/s${eta}`,
      );
    } else {
      const step = Math.floor(percent / 10);
      if (step === lastStep) return;
      lastStep = step;
      ctx.out.info(
        `${t('upload.progress', { file: file.name })} ${percent}% (${formatBytes(uploaded, ctx.lang)} / ${formatBytes(total, ctx.lang)})`,
      );
    }
  };
}

async function uploadAndConfirm(
  ctx: Ctx,
  api: BladecpApi,
  state: MigrateState,
  file: BackupFile,
  persist: () => Promise<void>,
  backupReady: boolean,
): Promise<string> {
  const t = ctx.out.t;
  const uuid = state.migrationUuid!;
  if (!state.uploadCompleted && backupReady) {
    // The API already holds the whole backup (an earlier run finished the
    // upload but lost the answer): go straight to the confirmation.
    state.uploadCompleted = true;
    await persist();
  }
  if (!state.uploadCompleted) {
    const uploadDeps = ctx.upload ?? {};
    let announced = false;
    const result = await uploadBackup(
      {
        filePath: file.path,
        sizeBytes: file.size,
        local: { uploadId: state.uploadId, parts: state.parts },
        concurrency: uploadDeps.concurrency ?? 3,
        maxAttempts: uploadDeps.maxAttempts ?? 5,
        baseDelayMs: uploadDeps.baseDelayMs ?? 1000,
        putPart: uploadDeps.putPart ?? defaultPutPart,
        sleep: ctx.sleep,
        now: ctx.now,
        random: ctx.random,
        signal: ctx.signal,
      },
      {
        requestUrls: () =>
          api.requestUploadUrls(uuid, { sizeBytes: file.size, filename: file.name, resume: true }),
        onPlan: async (plan: UploadPlan) => {
          if (!announced) {
            announced = true;
            if (plan.done.size > 0) {
              ctx.out.info(t('upload.resuming', { done: plan.done.size, total: plan.partCount }));
            } else {
              ctx.out.info(
                t('upload.starting', {
                  size: formatBytes(file.size, ctx.lang),
                  parts: plan.partCount,
                }),
              );
            }
          } else {
            ctx.out.info(t('upload.restarted'));
          }
          state.uploadId = plan.uploadId;
          state.partSize = plan.partSize;
          state.parts = orderedParts(plan);
          await persist();
        },
        onPartDone: async (plan: UploadPlan) => {
          state.parts = orderedParts(plan);
          await persist();
        },
        onProgress: progressReporter(ctx, file),
        onRetry: (part, attempt, delayMs) =>
          ctx.out.info(t('upload.retrying', { part, attempt, seconds: Math.ceil(delayMs / 1000) })),
      },
    );
    ctx.out.clearLiveLine();
    ctx.out.info(t('upload.assembling'));
    let completed: Awaited<ReturnType<BladecpApi['completeUpload']>>;
    try {
      completed = await api.completeUpload(uuid, result.parts);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 403 &&
        error.status !== 429
      ) {
        // The storage no longer knows this upload: forget it so the next
        // run starts a fresh one instead of failing the same way.
        state.uploadId = null;
        state.parts = [];
        await persist();
        throw new CliError(
          'upload.completeFailed',
          { message: error.apiMessage ?? `HTTP ${error.status}` },
          {
            exitCode: ExitCode.NETWORK,
            code: 'upload_complete_failed',
            hint: { key: 'hint.rerunToResume' },
          },
        );
      }
      throw error;
    }
    if (typeof completed.sizeBytes === 'number' && completed.sizeBytes !== file.size) {
      state.uploadId = null;
      state.parts = [];
      await persist();
      throw new CliError(
        'upload.sizeMismatch',
        { expected: file.size, received: completed.sizeBytes },
        {
          exitCode: ExitCode.NETWORK,
          code: 'upload_size_mismatch',
          hint: { key: 'hint.rerunToResume' },
        },
      );
    }
    state.uploadCompleted = true;
    await persist();
  }
  const confirmed = await api.confirmUpload(uuid);
  state.confirmed = true;
  await persist();
  ctx.out.info(ctx.out.style('green', t('upload.confirmed')));
  return confirmed.phase;
}

export async function migrateCommand(
  ctx: Ctx,
  fileArg: string,
  flags: MigrateFlags,
): Promise<number> {
  const t = ctx.out.t;
  const plan = flags.plan !== undefined ? parsePositiveInt(flags.plan, '--plan') : undefined;
  const location =
    flags.location !== undefined ? parsePositiveInt(flags.location, '--location') : undefined;
  if ((plan === undefined) !== (location === undefined)) {
    throw new CliError('migrate.planAndLocation', {}, { exitCode: ExitCode.USAGE, code: 'usage' });
  }
  let domain: string | undefined;
  if (flags.domain !== undefined) {
    domain = normalizeDomain(flags.domain);
    if (!isValidDomain(domain)) {
      throw new CliError(
        'review.invalidDomain',
        {},
        { exitCode: ExitCode.USAGE, code: 'invalid_domain' },
      );
    }
  }

  const file = await inspectBackup(fileArg);
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  await pruneStates(ctx.configDir, ctx.now());

  const key = stateKey(ctx.apiUrl, file.path, file.size, file.mtimeMs);
  let state = await loadState(ctx.configDir, key);
  let migration: Migration | undefined;
  let resumed = false;

  if (state?.migrationUuid) {
    try {
      migration = await api.getMigration(state.migrationUuid);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
    if (!migration || ENDED_PHASES.has(migration.phase)) {
      if (migration) {
        ctx.out.info(
          t('migrate.previousEnded', {
            uuid: migration.uuid,
            phase: phaseLabel(migration.phase, t),
          }),
        );
      }
      await removeState(ctx.configDir, key);
      state = null;
      migration = undefined;
    } else {
      resumed = true;
      ctx.out.info(t('migrate.resuming', { uuid: migration.uuid }));
    }
  } else if (
    state &&
    plan !== undefined &&
    (state.partnerPlanId !== plan || state.locationId !== location)
  ) {
    // The earlier run never got a migration back; a new destination needs a
    // new idempotency key.
    await removeState(ctx.configDir, key);
    state = null;
  }

  if (!state) {
    const destination = await chooseDestination(ctx, api, plan, location, Boolean(flags.yes));
    if (ctx.interactive && !flags.yes) {
      const prompter = ctx.createPrompter();
      let go: boolean;
      try {
        go = await confirm(
          prompter,
          ctx.out,
          t('migrate.confirm', {
            file: file.name,
            size: formatBytes(file.size, ctx.lang),
            destination: destination.label,
          }),
        );
      } finally {
        prompter.close();
      }
      if (!go) {
        ctx.out.say('migrate.declined');
        return ExitCode.OK;
      }
    }
    const nowIso = new Date(ctx.now()).toISOString();
    state = {
      version: 1,
      key,
      apiUrl: ctx.apiUrl,
      filePath: file.path,
      fileSize: file.size,
      fileMtimeMs: file.mtimeMs,
      idempotencyKey: randomUUID(),
      partnerPlanId: destination.partnerPlanId,
      locationId: destination.locationId,
      primaryDomain: domain ?? null,
      migrationUuid: null,
      uploadId: null,
      partSize: null,
      parts: [],
      uploadCompleted: false,
      confirmed: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  const current = state;
  let saving: Promise<void> = Promise.resolve();
  const persist = () => {
    saving = saving.catch(() => undefined).then(() => saveState(ctx.configDir, current, ctx.now()));
    return saving;
  };
  await persist();

  if (!current.migrationUuid) {
    const created = await api.createMigration(
      {
        sourcePanel: 'cpanel',
        ...(current.primaryDomain ? { primaryDomain: current.primaryDomain } : {}),
        partnerPlanId: current.partnerPlanId,
        locationId: current.locationId,
      },
      current.idempotencyKey,
    );
    current.migrationUuid = created.migrationUuid;
    await persist();
    ctx.out.info(t('migrate.created', { uuid: created.migrationUuid }));
  }
  const uuid = current.migrationUuid;
  let phase = migration?.phase ?? 'draft';

  if (phase === 'draft' || phase === 'uploading') {
    try {
      phase = await uploadAndConfirm(
        ctx,
        api,
        current,
        file,
        persist,
        migration?.backupReady === true,
      );
    } catch (error) {
      if (error instanceof InterruptedError) {
        ctx.out.clearLiveLine();
        throw new CliError(
          'migrate.uploadPaused',
          {},
          {
            exitCode: ExitCode.INTERRUPTED,
            code: 'interrupted',
            hint: { key: 'hint.rerunToResume' },
          },
        );
      }
      throw error;
    }
  }

  if (flags.noWait) {
    if (ctx.json) {
      ctx.out.emitJson({
        ok: true,
        data: {
          migrationUuid: uuid,
          phase,
          primaryDomain: migration?.primaryDomain ?? current.primaryDomain ?? null,
          previewUrl: migration?.stagingUrl ?? null,
          resumed,
          file: { name: file.name, sizeBytes: file.size },
          nextAction: { type: 'watch', command: `bladecp migrations status ${uuid} --watch` },
        },
      });
    } else {
      ctx.out.say('migrate.noWait');
      ctx.out.print(`  bladecp migrations status ${safeText(uuid)} --watch`);
    }
    return ExitCode.OK;
  }

  ctx.out.info(t('migrate.following'));
  let result: Awaited<ReturnType<typeof followMigration>>;
  try {
    result = await followMigration(ctx, api, uuid, {
      mode: 'migrate',
      domain,
      yes: Boolean(flags.yes),
    });
  } catch (error) {
    if (error instanceof InterruptedError) {
      ctx.out.clearLiveLine();
      throw new CliError(
        'migrate.followStopped',
        { uuid },
        {
          exitCode: ExitCode.INTERRUPTED,
          code: 'interrupted',
          hint: { key: 'hint.watch', vars: { uuid } },
        },
      );
    }
    throw error;
  }
  if (ENDED_PHASES.has(result.migration.phase)) await removeState(ctx.configDir, key);

  if (ctx.json) {
    const m = result.migration;
    const failed = result.exitCode === ExitCode.MIGRATION_FAILED;
    ctx.out.emitJson({
      ok: !failed,
      ...(failed
        ? {
            error: {
              code: result.outcome === 'cancelled' ? 'migration_cancelled' : 'migration_failed',
              message:
                m.message ??
                m.reason ??
                t(result.outcome === 'cancelled' ? 'outcome.cancelled' : 'outcome.failed'),
              exitCode: result.exitCode,
            },
          }
        : {}),
      data: {
        migrationUuid: uuid,
        phase: m.phase,
        primaryDomain: m.primaryDomain ?? null,
        previewUrl: m.stagingUrl ?? null,
        resumed,
        file: { name: file.name, sizeBytes: file.size },
        nextAction: nextAction(m, result.outcome),
        domainPointing: domainPointing(ctx, m),
      },
    });
  } else {
    printFollowOutcome(ctx, result);
  }
  return result.exitCode;
}
