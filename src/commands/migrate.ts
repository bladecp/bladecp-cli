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
  isEnded,
  isValidDomain,
  normalizeDomain,
  phaseLabel,
} from '../format.js';
import { safeText } from '../sanitize.js';
import type { Destination, Migration } from '../types.js';
import { confirmStep, keyMenu, select } from '../ui/interact.js';
import { type Kit, kit } from '../ui/kit.js';
import { padEnd } from '../ui/layout.js';
import { orderedParts, type UploadPlan } from '../upload/plan.js';
import { putPart as defaultPutPart, type PutPart } from '../upload/put.js';
import {
  listStates,
  loadState,
  type MigrateState,
  pruneStates,
  removeState,
  saveState,
  stateKey,
} from '../upload/state.js';
import { uploadBackup } from '../upload/uploader.js';
import {
  domainPointing,
  domainSection,
  type FollowResult,
  followMigration,
  nextAction,
  PhaseRail,
  previewBlock,
  printFollowOutcome,
} from './follow.js';
import { destinationLabel, preferredPrice, priceText } from './servers.js';

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
  /** Short form for the rail: "Stack Container S · São Paulo, BR · R$ 49,00/month". */
  short: string;
}

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

function shortDestination(ctx: Ctx, d: Destination, locationIndex: number): string {
  const location = d.locations[locationIndex];
  const where = location
    ? `${location.name}${location.countryCode ? `, ${location.countryCode}` : ''}`
    : '-';
  return [
    safeText(d.planName),
    safeText(where),
    priceText(ctx, preferredPrice(ctx, d.prices)),
  ].join(' · ');
}

async function chooseDestination(
  ctx: Ctx,
  api: BladecpApi,
  plan: number | undefined,
  location: number | undefined,
  yes: boolean,
  k: Kit | null,
): Promise<ChosenDestination> {
  const t = ctx.out.t;
  if (plan !== undefined && location !== undefined) {
    const label = t('migrate.destinationIds', { plan, location });
    // On a terminal, show the plan, the place and the price that will be billed.
    if (k) {
      const destinations = await api.listDestinations().catch(() => [] as Destination[]);
      for (const d of destinations) {
        const index = d.locations.findIndex((l) => l.locationId === location);
        if (d.partnerPlanId === plan && index >= 0) {
          return {
            partnerPlanId: plan,
            locationId: location,
            label: destinationLabel(d, index, ctx),
            short: shortDestination(ctx, d, index),
          };
        }
      }
    }
    return { partnerPlanId: plan, locationId: location, label, short: label };
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
  const options: (ChosenDestination & { d: Destination; index: number })[] = [];
  for (const d of destinations) {
    d.locations.forEach((loc, index) => {
      options.push({
        partnerPlanId: d.partnerPlanId,
        locationId: loc.locationId,
        label: destinationLabel(d, index, ctx),
        short: shortDestination(ctx, d, index),
        d,
        index,
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
    if (k)
      ctx.out.infoLines([
        `  ${k.ok(k.glyph.done)}  ${t('migrate.destinationTitle')}`,
        k.railLine(only.short),
        k.railLine(),
      ]);
    else ctx.out.info(t('migrate.onlyDestination', { destination: only.label }));
    return only;
  }
  if (!ctx.interactive || !k) throw required();
  const planWidth = Math.max(...options.map((o) => ctx.out.width(safeText(o.d.planName))));
  const index = await select(ctx, k, {
    title: t('migrate.chooseDestination'),
    items: options.map((o) => {
      const loc = o.d.locations[o.index];
      const where = loc
        ? safeText(`${loc.name}${loc.countryCode ? `, ${loc.countryCode}` : ''}`)
        : '-';
      const disk = typeof o.d.diskGb === 'number' ? `${o.d.diskGb} GB` : '';
      return [
        padEnd(ctx.out, safeText(o.d.planName), planWidth),
        disk.padStart(6),
        priceText(ctx, preferredPrice(ctx, o.d.prices)),
        where,
      ].join('   ');
    }),
    chosen: (i) => options[i]!.short,
  });
  return options[index]!;
}

/** "62%  1.6 GB / 2.4 GB · 25 MB/s · 32s left · part 30 of 48", fitted to the width. */
function uploadLines(
  ctx: Ctx,
  k: Kit,
  view: {
    uploaded: number;
    total: number;
    rate: number;
    partsDone: number;
    parts: number;
    note: string | null;
    frame: number;
  },
): string[] {
  const t = ctx.out.t;
  const fraction = view.total > 0 ? view.uploaded / view.total : 1;
  const percent = `${Math.floor(fraction * 100)}%`.padStart(4);
  const width = Math.min(k.width, 76);
  const barWidth = Math.max(8, Math.min(54, width - 12));
  const stats = [
    `${formatBytes(view.uploaded, ctx.lang)} ${k.muted('/')} ${formatBytes(view.total, ctx.lang)}`,
    `${formatBytes(view.rate, ctx.lang)}/s`,
    ...(view.rate > 0 && view.uploaded < view.total
      ? [
          t('upload.eta', {
            time: formatDuration(((view.total - view.uploaded) / view.rate) * 1000),
          }),
        ]
      : []),
    k.muted(t('upload.partOf', { done: view.partsDone, total: view.parts })),
  ];
  // Fewer facts on a narrow terminal; the percentage always stays.
  let statsLine = '';
  for (const part of stats) {
    const next = statsLine ? `${statsLine}  ${k.muted('·')}  ${part}` : part;
    if (ctx.out.width(next) + 5 > width && statsLine) break;
    statsLine = next;
  }
  return [
    `  ${k.accent(k.spin[view.frame % k.spin.length]!)}  ${k.shimmer(t('upload.title'), view.frame * 90)} ${k.muted(`· ${view.parts === 1 ? t('upload.metaOne') : t('upload.meta', { parts: view.parts })}`)}`,
    k.railLine(`${k.lightBar(fraction, barWidth)}  ${k.bold(percent)}`),
    k.railLine(statsLine),
    k.railLine(view.note ? k.muted(view.note) : k.faint(t('upload.pauseHint'))),
  ];
}

async function uploadAndConfirm(
  ctx: Ctx,
  api: BladecpApi,
  state: MigrateState,
  file: BackupFile,
  persist: () => Promise<void>,
  backupReady: boolean,
  k: Kit | null,
): Promise<string> {
  const t = ctx.out.t;
  const uuid = state.migrationUuid!;
  if (!state.uploadCompleted && backupReady) {
    // The API already holds the whole backup (an earlier run finished the
    // upload but lost the answer): go straight to the confirmation.
    state.uploadCompleted = true;
    await persist();
  }
  const started = ctx.now();
  let sentBytes = 0;
  if (!state.uploadCompleted) {
    const uploadDeps = ctx.upload ?? {};
    let announced = false;
    const startedAt = ctx.now();
    let startBytes: number | undefined;
    let lastDraw = 0;
    let lastStep = -1;
    let plan: UploadPlan | null = null;
    let note: string | null = null;
    let frame = 0;
    const view = { uploaded: 0, total: file.size, rate: 0 };
    const draw = () => {
      if (!k || !plan) return;
      ctx.out.live(
        uploadLines(ctx, k, {
          ...view,
          partsDone: plan.done.size,
          parts: plan.partCount,
          note,
          frame: frame++,
        }),
      );
      ctx.out.progress(Math.floor((view.uploaded / Math.max(1, view.total)) * 100));
    };
    const basePut = uploadDeps.putPart ?? defaultPutPart;
    const putPart: PutPart = async (input) => {
      const begun = Date.now();
      try {
        const etag = await basePut(input);
        ctx.out.debug(
          `PUT ${formatBytes(input.length, ctx.lang)} -> ok (${Date.now() - begun} ms)`,
        );
        return etag;
      } catch (error) {
        ctx.out.debug(`PUT ${formatBytes(input.length, ctx.lang)} -> ${(error as Error).message}`);
        throw error;
      }
    };
    const maxAttempts = uploadDeps.maxAttempts ?? 5;
    const result = await uploadBackup(
      {
        filePath: file.path,
        sizeBytes: file.size,
        local: { uploadId: state.uploadId, parts: state.parts },
        concurrency: uploadDeps.concurrency ?? 3,
        maxAttempts,
        baseDelayMs: uploadDeps.baseDelayMs ?? 1000,
        putPart,
        sleep: ctx.sleep,
        now: ctx.now,
        random: ctx.random,
        signal: ctx.signal,
      },
      {
        requestUrls: () =>
          api.requestUploadUrls(uuid, { sizeBytes: file.size, filename: file.name, resume: true }),
        onPlan: async (next: UploadPlan) => {
          const first = !announced;
          announced = true;
          plan = next;
          if (k) {
            if (!first) note = t('upload.restarted');
            else if (next.done.size > 0)
              note = t('upload.resuming', { done: next.done.size, total: next.partCount });
          } else if (first) {
            ctx.out.info(
              next.done.size > 0
                ? t('upload.resuming', { done: next.done.size, total: next.partCount })
                : next.partCount === 1
                  ? t('upload.startingOne', { size: formatBytes(file.size, ctx.lang) })
                  : t('upload.starting', {
                      size: formatBytes(file.size, ctx.lang),
                      parts: next.partCount,
                    }),
            );
          } else ctx.out.info(t('upload.restarted'));
          state.uploadId = next.uploadId;
          state.partSize = next.partSize;
          state.parts = orderedParts(next);
          await persist();
        },
        onPartDone: async (next: UploadPlan) => {
          state.parts = orderedParts(next);
          await persist();
        },
        onProgress: (uploaded, total) => {
          if (ctx.json) return;
          startBytes ??= uploaded;
          const now = ctx.now();
          view.uploaded = uploaded;
          view.total = total;
          view.rate = ((uploaded - startBytes) / Math.max(1, now - startedAt)) * 1000;
          sentBytes = uploaded - startBytes;
          const percent = total > 0 ? Math.floor((uploaded / total) * 100) : 100;
          if (k) {
            if (now - lastDraw < 120 && uploaded < total) return;
            lastDraw = now;
            draw();
          } else {
            const step = Math.floor(percent / 10);
            if (step === lastStep) return;
            lastStep = step;
            ctx.out.info(
              `${t('upload.progress', { file: file.name })} ${percent}% (${formatBytes(uploaded, ctx.lang)} / ${formatBytes(total, ctx.lang)})`,
            );
          }
        },
        onRetry: (part, attempt, delayMs) => {
          const text = t('upload.retrying', {
            part,
            attempt,
            of: maxAttempts,
            seconds: Math.ceil(delayMs / 1000),
          });
          if (k) {
            note = text;
            draw();
          } else ctx.out.info(text);
        },
      },
    );
    if (k) {
      ctx.out.live([`  ${k.accent(k.spin[0]!)}  ${t('upload.assembling')}`]);
    } else {
      ctx.out.clearLiveLine();
      ctx.out.info(t('upload.assembling'));
    }
    let completed: Awaited<ReturnType<BladecpApi['completeUpload']>>;
    try {
      completed = await api.completeUpload(uuid, result.parts);
    } catch (error) {
      ctx.out.progress(null);
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
          { message: error.apiMessage || `HTTP ${error.status}` },
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
  ctx.out.progress(null);
  if (k) {
    const took = ctx.now() - started;
    const details =
      sentBytes > 0 && took >= 1000
        ? t('upload.receivedStats', {
            size: formatBytes(file.size, ctx.lang),
            time: formatDuration(took),
            rate: formatBytes((sentBytes / took) * 1000, ctx.lang),
          })
        : formatBytes(file.size, ctx.lang);
    ctx.out.live([
      `  ${k.ok(k.glyph.done)}  ${t('upload.receivedTitle')} ${k.muted(`· ${details}`)}`,
      k.railLine(),
    ]);
    ctx.out.liveDone();
  } else {
    ctx.out.info(t('upload.confirmed'));
  }
  return confirmed.phase;
}

/**
 * A migration of a file with the same name and size kept on this computer
 * under another path or date: the backup was most likely downloaded again.
 */
async function sameBackupElsewhere(
  ctx: Ctx,
  api: BladecpApi,
  file: BackupFile,
  key: string,
): Promise<{ uuid: string; path: string } | null> {
  const states = await listStates(ctx.configDir);
  const candidate = states.find(
    (s) =>
      s.key !== key &&
      s.apiUrl === ctx.apiUrl &&
      s.migrationUuid &&
      s.fileSize === file.size &&
      basename(s.filePath) === file.name,
  );
  if (!candidate?.migrationUuid) return null;
  try {
    const m = await api.getMigration(candidate.migrationUuid);
    return isEnded(m.phase) ? null : { uuid: m.uuid, path: candidate.filePath };
  } catch {
    return null;
  }
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
  const runStarted = ctx.now();
  // The rail of steps on a terminal; plain lines everywhere else.
  const k = !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr ? kit(ctx.out, 'err') : null;
  if (k) {
    ctx.out.infoLines([
      '',
      `  ${k.rail(k.glyph.open)}  ${k.bold(t('migrate.title'))}`,
      k.railLine(),
      `  ${k.ok(k.glyph.done)}  ${safeText(file.name)}`,
      k.railLine(k.muted(t('migrate.fileOk', { size: formatBytes(file.size, ctx.lang) }))),
      k.railLine(),
    ]);
  }
  const step = (text: string) => {
    if (k) ctx.out.infoLines([`  ${k.ok(k.glyph.done)}  ${text}`, k.railLine()]);
    else ctx.out.info(text);
  };

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
    if (!migration || isEnded(migration.phase)) {
      if (migration) {
        step(
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
      const other =
        plan !== undefined && (state.partnerPlanId !== plan || state.locationId !== location);
      if (other) {
        // Never continue on another destination than the one asked for without saying so.
        const destination = t('migrate.destinationIds', {
          plan: state.partnerPlanId,
          location: state.locationId,
        });
        if (!ctx.interactive || flags.yes || !k) {
          throw new CliError(
            'migrate.destinationInProgress',
            { uuid: migration.uuid, destination },
            {
              exitCode: ExitCode.USAGE,
              code: 'migration_in_progress',
              hint: { key: 'hint.migrationInProgress', vars: { uuid: migration.uuid } },
              details: {
                migrationUuid: migration.uuid,
                partnerPlanId: state.partnerPlanId,
                locationId: state.locationId,
              },
            },
          );
        }
        const keep = await confirmStep(ctx, k, {
          title: t('migrate.inProgressAsk', { destination }),
          detail: k
            .wrap(t('migrate.inProgressDetail', { uuid: migration.uuid }), k.width - 6, '')
            .map((line) => k.muted(line)),
          defaultYes: true,
        });
        if (!keep) {
          ctx.out.lines([
            `  ${k.rail(k.glyph.end)}  ${t('migrate.inProgressStop')}`,
            `  ${k.violet(k.glyph.arrow)} ${k.accent(`bladecp migrations cancel ${migration.uuid}`)}`,
          ]);
          return ExitCode.OK;
        }
      }
      resumed = true;
      step(t('migrate.resuming', { uuid: migration.uuid }));
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
    const elsewhere = await sameBackupElsewhere(ctx, api, file, key);
    if (elsewhere) {
      const text = t('migrate.sameBackupElsewhere', { uuid: elsewhere.uuid, path: elsewhere.path });
      if (k)
        ctx.out.infoLines([
          ...k.wrap(text, k.width - 3, '').map((line) => k.railLine(k.warn(line))),
          k.railLine(),
        ]);
      else ctx.out.info(text);
    }
    const destination = await chooseDestination(ctx, api, plan, location, Boolean(flags.yes), k);
    if (ctx.interactive && !flags.yes) {
      let go: boolean;
      if (k) {
        go = await confirmStep(ctx, k, {
          title: t('migrate.start'),
          detail: [
            k.muted(
              t('migrate.confirmDetail', {
                file: file.name,
                size: formatBytes(file.size, ctx.lang),
              }),
            ),
            k.muted(destination.short),
          ],
          defaultYes: true,
          tail: false,
        });
      } else {
        const { confirm } = await import('../ui/prompt.js');
        const prompter = ctx.createPrompter();
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
      }
      if (!go) {
        if (k) ctx.out.lines([`  ${k.rail(k.glyph.end)}  ${t('migrate.declined')}`]);
        else ctx.out.say('migrate.declined');
        return ExitCode.OK;
      }
    } else if (k && plan !== undefined) {
      ctx.out.infoLines([
        `  ${k.ok(k.glyph.done)}  ${t('migrate.destinationTitle')}`,
        k.railLine(destination.short),
        k.railLine(),
      ]);
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
    if (k)
      ctx.out.infoLines([
        k.railLine(k.muted(t('migrate.created', { uuid: created.migrationUuid }))),
        k.railLine(),
      ]);
    else ctx.out.info(t('migrate.created', { uuid: created.migrationUuid }));
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
        k,
      );
    } catch (error) {
      ctx.out.progress(null);
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
      const known = migration ? { ...migration, phase } : null;
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
          domainPointing: known ? domainPointing(ctx, known) : null,
        },
      });
    } else if (k) {
      ctx.out.lines([
        `  ${k.rail(k.glyph.end)}  ${t('migrate.noWait')}`,
        `  ${k.violet(k.glyph.arrow)} ${k.accent(`bladecp migrations status ${safeText(uuid)} --watch`)}`,
      ]);
    } else {
      ctx.out.say('migrate.noWait');
      ctx.out.print(`  bladecp migrations status ${safeText(uuid)} --watch`);
    }
    return ExitCode.OK;
  }

  if (!k) ctx.out.info(t('migrate.following'));
  let result: FollowResult & { rail: PhaseRail | null };
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
  if (isEnded(result.migration.phase)) await removeState(ctx.configDir, key);

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
                m.message ||
                m.reason ||
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
    return result.exitCode;
  }

  // On a terminal, the person may approve right here; only the key "a" does it.
  if (result.outcome === 'awaiting_approval' && k && ctx.interactive && !flags.yes) {
    return approveHere(ctx, api, result.migration, k, runStarted);
  }
  await printFollowOutcome(ctx, result);
  return result.exitCode;
}

/** The preview is ready: open it, approve it, or decide later. */
async function approveHere(
  ctx: Ctx,
  api: BladecpApi,
  m: Migration,
  k: Kit,
  runStarted: number,
): Promise<number> {
  const t = ctx.out.t;
  const outK = kit(ctx.out, 'out');
  const lines = [
    `  ${outK.violet(outK.glyph.active)}  ${outK.bold(t('outcome.ready'))}`,
    outK.railLine(),
  ];
  if (m.stagingUrl) lines.push(...previewBlock(ctx, outK, m.stagingUrl), outK.railLine());
  lines.push(
    ...outK
      .wrap(t('outcome.previewHint'), outK.width - 3, '')
      .map((line) => outK.railLine(outK.muted(line))),
    outK.railLine(),
  );
  ctx.out.lines(lines);
  const extra: string[] = [];
  let choice: string;
  for (;;) {
    choice = await keyMenu(ctx, k, {
      title: t('approve.ask'),
      hint: m.stagingUrl ? t('approve.keys') : t('approve.keysNoPreview'),
      keys: m.stagingUrl ? ['o', 'a', 'd'] : ['a', 'd'],
      extra: () => extra,
    });
    if (choice === 'o' && m.stagingUrl) {
      const opened = await ctx.openUrl(m.stagingUrl);
      extra.splice(
        0,
        extra.length,
        k.muted(`↗ ${opened ? t('approve.opened') : t('approve.openFailed')}`),
      );
      continue;
    }
    break;
  }
  if (choice !== 'a') {
    ctx.out.live([
      ...extra.map((line) => k.railLine(line)),
      `  ${k.faint(k.glyph.done)}  ${t('approve.ask')} ${k.muted(t('approve.later'))}`,
    ]);
    ctx.out.liveDone();
    ctx.out.lines([
      `  ${outK.rail(outK.glyph.end)}  ${t('outcome.approveHint')}`,
      `  ${outK.violet(outK.glyph.arrow)} ${outK.accent(`bladecp migrations approve ${safeText(m.uuid)}`)}`,
    ]);
    return ExitCode.OK;
  }
  ctx.out.live([`  ${k.accent(k.spin[0]!)}  ${t('approve.approving')}`]);
  await api.approve(m.uuid);
  // In the order it happened: the preview opened, then the answer.
  ctx.out.live([
    ...extra.map((line) => k.railLine(line)),
    `  ${k.ok(k.glyph.done)}  ${t('approve.ask')} ${k.muted(t('ui.yes'))}`,
  ]);
  ctx.out.liveDone();
  // Written for good, so a narrow window wraps it instead of cutting it.
  ctx.out.infoLines([k.railLine(k.muted(t('approve.done'))), k.railLine()]);
  const rail = new PhaseRail(ctx, m.uuid, 'syncing');
  ctx.out.info(rail.header());
  const result = await followMigration(
    ctx,
    api,
    m.uuid,
    { mode: 'watch', untilComplete: true },
    rail,
  );
  if (result.outcome !== 'complete' && result.outcome !== 'live') {
    await printFollowOutcome(ctx, result);
    return result.exitCode;
  }
  const done = result.migration;
  ctx.out.lines([`  ${outK.rail(outK.glyph.end)}  ${outK.ok(t('outcome.complete'))}`]);
  await sweep(ctx, k);
  ctx.out.lines([
    '',
    ...domainSection(ctx, outK, done),
    '',
    `  ${outK.muted(`${t('migrate.totalTime', { time: formatDuration(ctx.now() - runStarted) })} ·`)} ${outK.accent(`bladecp migrations status ${safeText(done.uuid)}`)}`,
  ]);
  return ExitCode.OK;
}

/** A sweep of light crosses the horizon once, then it settles. */
async function sweep(ctx: Ctx, k: Kit): Promise<void> {
  ctx.out.info('');
  const frames = ctx.out.caps.motion === 'full' && k.color ? 22 : 0;
  for (let i = 0; i < frames; i += 1) {
    ctx.out.live([
      ` ${k.horizon(k.width, { sweep: -0.05 + (1.1 * i) / (frames - 1), gain: 0.25 + 0.75 * (i / frames) })}`,
    ]);
    await ctx.frame(33);
  }
  ctx.out.live([` ${k.horizon(k.width)}`]);
  ctx.out.liveDone();
}
