import type { BladecpApi } from '../api.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode } from '../errors.js';
import {
  componentLabel,
  componentStatusLabel,
  formatDate,
  formatDuration,
  isValidDomain,
  migrationPhaseLabel,
  needsYou,
  normalizeDomain,
  phaseTone,
  reviewAnswered,
  shortIds,
} from '../format.js';
import type { MessageKey } from '../i18n/index.js';
import { resolveId } from '../ids.js';
import { safeText } from '../sanitize.js';
import type { Migration } from '../types.js';
import { confirmStep } from '../ui/interact.js';
import { fitTable, type Kit, kit } from '../ui/kit.js';
import {
  absentComponents,
  discoveredDomain,
  domainPointingLines,
  domainSection,
  failureReason,
  followMigration,
  previewBlock,
  printFollowOutcome,
  retryLines,
  slowLines,
  slowPhase,
  uploadPendingText,
  visibleComponents,
  withDomainPointing,
} from './follow.js';
import { paintTone } from './servers.js';

function migrationId(api: BladecpApi, value: string): Promise<string> {
  return resolveId(value, () => api.listMigrations());
}

function phaseGlyph(k: Kit, m: Migration): string {
  const tone = phaseTone(m);
  const glyph =
    tone === 'ok'
      ? k.glyph.check
      : tone === 'err'
        ? k.glyph.cross
        : tone === 'faint'
          ? k.glyph.ring
          : tone === 'warn'
            ? k.glyph.active
            : k.glyph.done;
  return paintTone(k, tone, glyph);
}

export async function migrationsListCommand(ctx: Ctx): Promise<number> {
  const auth = await resolveAuth(ctx);
  const migrations = await createApi(ctx, auth.apiKey).listMigrations();
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: migrations });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  if (!ctx.out.rich) {
    if (migrations.length === 0) {
      ctx.out.say('migrations.empty');
      return ExitCode.OK;
    }
    ctx.out.print(
      kit(ctx.out, 'out').plainTable(
        [t('column.uuid'), t('column.domain'), t('column.phase'), t('column.created')],
        migrations.map((m) => [
          m.uuid,
          m.primaryDomain ?? discoveredDomain(m) ?? '-',
          migrationPhaseLabel(m, t),
          formatDate(m.createdAt, ctx.lang),
        ]),
      ),
    );
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  if (migrations.length === 0) {
    ctx.out.lines(['', `  ${k.faint(k.glyph.ring)}  ${t('migrations.empty')}`]);
    return ExitCode.OK;
  }
  const ids = shortIds(migrations.map((m) => m.uuid));
  const { header, body, width } = fitTable(
    k,
    [
      { header: t('column.id'), priority: 5 },
      { header: t('column.domain'), priority: 4, flex: true, min: 12 },
      { header: t('column.phase'), priority: 3, flex: true, min: 14 },
      { header: t('column.created'), priority: 1 },
    ],
    migrations.map((m) => [
      { text: safeText(ids.get(m.uuid) ?? m.uuid), paint: k.violet },
      { text: safeText(m.primaryDomain ?? discoveredDomain(m) ?? '-') },
      {
        text: `* ${migrationPhaseLabel(m, t)}`,
        paint: (text: string) => `${phaseGlyph(k, m)}${text.slice(1)}`,
      },
      { text: formatDate(m.createdAt, ctx.lang), paint: k.muted },
    ]),
  );
  const waiting = migrations.filter(needsYou).length;
  ctx.out.lines([
    '',
    header,
    ` ${k.horizon(Math.min(width + 1, k.columns - 1), { at: 0.08, spread: 0.85, power: 1.2 })}`,
    ...body,
    '',
    `  ${k.muted(
      [
        t(migrations.length === 1 ? 'migrations.countOne' : 'migrations.countMany', {
          count: migrations.length,
        }),
        ...(waiting > 0
          ? [t(waiting === 1 ? 'migrations.needYouOne' : 'migrations.needYou', { count: waiting })]
          : []),
      ].join(' · '),
    )}`,
    `  ${k.muted(t('migrations.hint'))}`,
  ]);
  return ExitCode.OK;
}

/** What the person can do next, in words, for a migration in a given phase. */
async function phaseHint(ctx: Ctx, m: Migration): Promise<{ text: string; command?: string }[]> {
  const t = ctx.out.t;
  switch (m.phase) {
    case 'draft':
    case 'uploading':
      return [await uploadPendingText(ctx, m)];
    case 'discovery_review':
      if (reviewAnswered(m)) {
        return [
          { text: t('status.hintWatch'), command: `bladecp migrations status ${m.uuid} --watch` },
        ];
      }
      return [
        {
          text: t('outcome.reviewRequired'),
          command: `bladecp migrations review ${m.uuid} --domain ${discoveredDomain(m) ?? 'example.com'}`,
        },
      ];
    case 'awaiting_approval':
      return [{ text: t('outcome.approveHint'), command: `bladecp migrations approve ${m.uuid}` }];
    case 'failed':
      return retryLines(m, t);
    case 'cutover_pending':
    case 'cutover_stalled':
    case 'live':
    case 'cancelled':
      return [];
    default:
      return [
        { text: t('status.hintWatch'), command: `bladecp migrations status ${m.uuid} --watch` },
      ];
  }
}

async function printMigration(ctx: Ctx, m: Migration): Promise<void> {
  const t = ctx.out.t;
  const reason = m.phase === 'failed' ? failureReason(m, t) : null;
  const slow = slowPhase(m, ctx.now());
  // A slow phase already says how to follow the migration later.
  const hints = slow ? slowLines(ctx, m, slow) : await phaseHint(ctx, m);
  const absent = absentComponents(m);
  if (!ctx.out.rich) {
    const rows: [string, string][] = [
      [t('label.migration'), m.uuid],
      [t('label.phase'), migrationPhaseLabel(m, t)],
      [t('label.domain'), m.primaryDomain ?? discoveredDomain(m) ?? '-'],
    ];
    if (m.stagingUrl) rows.push([t('label.preview'), m.stagingUrl]);
    if (m.timing && typeof m.timing.executionMs === 'number' && m.timing.executionMs > 0) {
      rows.push([t('label.duration'), formatDuration(m.timing.executionMs)]);
    }
    if (m.createdAt) rows.push([t('label.created'), formatDate(m.createdAt, ctx.lang)]);
    if (reason) rows.push([t('label.reason'), reason]);
    ctx.out.lines(kit(ctx.out, 'out').plainRows(rows));
    const components = m.components ?? [];
    if (components.length > 0) {
      ctx.out.print();
      for (const c of components) {
        ctx.out.print(
          `  ${componentLabel(c.name, t)}: ${componentStatusLabel(c.status, t, m.phase, absent.has(c.name))}`,
        );
      }
    }
    const pointing = domainPointingLines(ctx, m);
    if (hints.length > 0 || pointing.length > 0) ctx.out.print();
    for (const hint of hints) {
      ctx.out.print(hint.text);
      if (hint.command) ctx.out.print(`  ${safeText(hint.command)}`);
    }
    for (const line of pointing) ctx.out.print(line);
    return;
  }
  const k = kit(ctx.out, 'out');
  const domain = m.primaryDomain ?? discoveredDomain(m);
  const rows: [string, string][] = [[t('label.id'), safeText(m.uuid)]];
  if (m.stagingUrl)
    rows.push([t('label.preview'), k.link(m.stagingUrl, k.accent(safeText(m.stagingUrl)))]);
  if (m.createdAt) rows.push([t('label.created'), formatDate(m.createdAt, ctx.lang)]);
  if (m.timing && typeof m.timing.executionMs === 'number' && m.timing.executionMs > 0) {
    rows.push([t('label.duration'), formatDuration(m.timing.executionMs)]);
  }
  if (reason) rows.push([t('label.reason'), safeText(reason)]);
  const lines = [
    '',
    `  ${k.bold(safeText(domain ?? m.uuid))}   ${phaseGlyph(k, m)} ${migrationPhaseLabel(m, t)}`,
    ` ${k.horizon(k.width, { at: 0.1, spread: 0.6, tone: m.phase === 'failed' ? 'err' : null })}`,
    ...k.rows(rows),
  ];
  const components = visibleComponents(m);
  if (components.length > 0) {
    lines.push(
      '',
      `  ${k.ruler(t('label.components'))}`,
      ...components.map((c) => {
        const status = componentStatusLabel(c.status, t, m.phase);
        const mark =
          c.status === 'completed'
            ? k.ok(k.glyph.check)
            : c.status === 'failed'
              ? k.err(k.glyph.cross)
              : c.status === 'running' && m.phase !== 'failed' && m.phase !== 'cancelled'
                ? k.violet(k.glyph.active)
                : k.faint(k.glyph.done);
        return `  ${mark} ${componentLabel(c.name, t)} ${k.muted(`· ${status}`)}`;
      }),
    );
  }
  const section = domainSection(ctx, k, m);
  if (section.length > 0) lines.push('', ...section);
  if (hints.length > 0) {
    lines.push('', `  ${k.ruler(t('status.next'))}`);
    for (const hint of hints) {
      lines.push(...k.wrap(hint.text, k.width, '  '));
      if (hint.command)
        lines.push(`  ${k.violet(k.glyph.arrow)} ${k.accent(safeText(hint.command))}`);
    }
  }
  ctx.out.lines(lines);
}

export async function migrationsStatusCommand(
  ctx: Ctx,
  idArg: string,
  watch: boolean,
): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  // `--watch --json` is one JSON document per line, errors included.
  if (watch && ctx.json) ctx.out.ndjson = true;
  const uuid = await migrationId(api, idArg);
  if (!watch) {
    const m = await api.getMigration(uuid);
    if (ctx.json) {
      // Only an addition to the API object: `slowPhase` when a phase passed its usual time.
      const slow = slowPhase(m, ctx.now());
      ctx.out.emitJson({
        ok: true,
        data: { ...withDomainPointing(ctx, m), ...(slow ? { slowPhase: slow } : {}) },
      });
    } else await printMigration(ctx, m);
    return ExitCode.OK;
  }
  if (!ctx.json && !(ctx.out.caps.errTTY && ctx.out.richErr))
    ctx.out.info(ctx.out.t('follow.watching'));
  const result = await followMigration(ctx, api, uuid, { mode: 'watch' });
  if (!ctx.json) await printFollowOutcome(ctx, result);
  return result.exitCode;
}

export async function migrationsReviewCommand(
  ctx: Ctx,
  idArg: string,
  rawDomain: string | undefined,
): Promise<number> {
  if (!rawDomain) {
    throw new CliError(
      'error.missingOption',
      { option: '--domain' },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) {
    throw new CliError(
      'review.invalidDomain',
      {},
      { exitCode: ExitCode.USAGE, code: 'invalid_domain' },
    );
  }
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  const uuid = await migrationId(api, idArg);
  const result = await api.reviewDiscovery(uuid, domain);
  if (ctx.json) {
    ctx.out.emitJson({
      ok: true,
      data: { migrationUuid: uuid, phase: result.phase, primaryDomain: domain },
    });
    return ExitCode.OK;
  }
  doneLines(ctx, ctx.out.t('review.sent', { domain }), [
    { text: ctx.out.t('status.hintWatch'), command: `bladecp migrations status ${uuid} --watch` },
  ]);
  return ExitCode.OK;
}

/** A finished action: one line, then what to do next. */
function doneLines(
  ctx: Ctx,
  text: string,
  next: { text: string; command?: string }[],
  tone: 'ok' | 'faint' = 'ok',
  afterQuestion = false,
): void {
  if (!ctx.out.rich) {
    ctx.out.print(text);
    for (const line of next) {
      ctx.out.print(line.text);
      if (line.command) ctx.out.print(`  ${safeText(line.command)}`);
    }
    return;
  }
  const k = kit(ctx.out, 'out');
  const lines = [
    ...(afterQuestion ? [] : ['']),
    `  ${tone === 'ok' ? k.ok(k.glyph.done) : k.faint(k.glyph.done)}  ${text}`,
  ];
  for (const line of next) {
    lines.push(...k.wrap(line.text, k.width - 3, '').map((part) => k.railLine(k.muted(part))));
    if (line.command) lines.push(`  ${k.rail(k.glyph.end)}  ${k.accent(safeText(line.command))}`);
  }
  ctx.out.lines(lines);
}

/**
 * On a terminal, approve and cancel show what they act on and ask first.
 * `--yes` skips the question; the command itself is still the explicit act.
 */
async function confirmAction(
  ctx: Ctx,
  api: BladecpApi,
  uuid: string,
  action: 'approve' | 'cancel',
): Promise<boolean> {
  const t = ctx.out.t;
  let m: Migration | null = null;
  try {
    m = await api.getMigration(uuid);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 401 || error.status === 404) throw error;
  }
  const domain = m ? (m.primaryDomain ?? discoveredDomain(m)) : null;
  const k = kit(ctx.out, 'err');
  const detail: string[] = [];
  if (m) detail.push(k.muted(`${safeText(uuid.slice(0, 8))} · ${migrationPhaseLabel(m, t)}`));
  if (action === 'approve' && m?.stagingUrl) {
    detail.push(
      ...previewBlock(ctx, k, m.stagingUrl).map((line) => line.replace(/^ {2}\S+ {0,2}/, '')),
    );
  }
  const note: MessageKey = action === 'approve' ? 'approve.detail' : 'cancel.detail';
  detail.push(...k.wrap(t(note), k.width - 6, '').map((line) => k.muted(line)));
  ctx.out.info('');
  return confirmStep(ctx, k, {
    title: domain
      ? t(action === 'approve' ? 'approve.confirm' : 'cancel.confirm', { domain })
      : t(action === 'approve' ? 'approve.confirmNoDomain' : 'cancel.confirmNoDomain'),
    detail,
    defaultYes: action === 'approve',
  });
}

export async function migrationsApproveCommand(
  ctx: Ctx,
  idArg: string,
  yes: boolean,
): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  const uuid = await migrationId(api, idArg);
  const asked = ctx.interactive && !yes;
  if (asked && !(await confirmAction(ctx, api, uuid, 'approve'))) {
    doneLines(ctx, ctx.out.t('migrate.declined'), [], 'faint', true);
    return ExitCode.OK;
  }
  const result = await api.approve(uuid);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { migrationUuid: uuid, phase: result.phase } });
    return ExitCode.OK;
  }
  doneLines(
    ctx,
    ctx.out.t('approve.done'),
    [{ text: ctx.out.t('status.hintWatch'), command: `bladecp migrations status ${uuid} --watch` }],
    'ok',
    asked,
  );
  return ExitCode.OK;
}

export async function migrationsCancelCommand(
  ctx: Ctx,
  idArg: string,
  reason: string | undefined,
  yes: boolean,
): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  const uuid = await migrationId(api, idArg);
  const asked = ctx.interactive && !yes;
  if (asked && !(await confirmAction(ctx, api, uuid, 'cancel'))) {
    doneLines(ctx, ctx.out.t('migrate.declined'), [], 'faint', true);
    return ExitCode.OK;
  }
  const result = await api.cancel(uuid, reason);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { migrationUuid: uuid, phase: result.phase } });
    return ExitCode.OK;
  }
  doneLines(ctx, ctx.out.t('cancel.done'), [], 'faint', asked);
  return ExitCode.OK;
}

const RETRY_REASON_HINTS: Record<string, MessageKey> = {
  attempt_used: 'retryReason.attempt_used',
  backup_unavailable: 'retryReason.backup_unavailable',
  discovery_review_expired: 'retryReason.discovery_review_expired',
  destination_needs_review: 'retryReason.destination_needs_review',
  not_failed: 'retryReason.not_failed',
};

export async function migrationsRetryCommand(ctx: Ctx, idArg: string): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  const uuid = await migrationId(api, idArg);
  let result: Awaited<ReturnType<BladecpApi['retry']>>;
  try {
    result = await api.retry(uuid);
  } catch (error) {
    // Say why: the migration itself knows the reason a retry is refused.
    if (error instanceof ApiError && error.apiCode === 'MIGRATION_RETRY_UNAVAILABLE') {
      const m = await api.getMigration(uuid).catch(() => null);
      const reason = m?.retry?.reason ?? null;
      if (reason && RETRY_REASON_HINTS[reason]) {
        error.extraHint = { key: RETRY_REASON_HINTS[reason] };
        error.extraDetails = { retryReason: reason };
      }
    }
    throw error;
  }
  if (ctx.json) {
    ctx.out.emitJson({
      ok: true,
      data: { migrationUuid: result.migrationUuid, retryOf: uuid, phase: result.phase },
    });
    return ExitCode.OK;
  }
  doneLines(ctx, ctx.out.t('retry.done', { uuid: result.migrationUuid }), [
    {
      text: ctx.out.t('status.hintWatch'),
      command: `bladecp migrations status ${result.migrationUuid} --watch`,
    },
  ]);
  return ExitCode.OK;
}
