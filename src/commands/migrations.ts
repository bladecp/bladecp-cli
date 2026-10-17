import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { CliError, ExitCode } from '../errors.js';
import {
  componentLabel,
  componentStatusLabel,
  formatDate,
  formatDuration,
  isValidDomain,
  migrationPhaseLabel,
  normalizeDomain,
  reviewAnswered,
  table,
} from '../format.js';
import { safeText } from '../sanitize.js';
import type { Migration } from '../types.js';
import {
  discoveredDomain,
  domainPointingLines,
  followMigration,
  printFollowOutcome,
  withDomainPointing,
} from './follow.js';

export async function migrationsListCommand(ctx: Ctx): Promise<number> {
  const auth = await resolveAuth(ctx);
  const migrations = await createApi(ctx, auth.apiKey).listMigrations();
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: migrations });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  if (migrations.length === 0) {
    ctx.out.say('migrations.empty');
    return ExitCode.OK;
  }
  ctx.out.print(
    table(
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

/** What the person can do next, in words, for a migration in a given phase. */
function phaseHint(ctx: Ctx, m: Migration): string[] {
  const t = ctx.out.t;
  switch (m.phase) {
    case 'draft':
    case 'uploading':
      return [t('status.hintUpload')];
    case 'discovery_review':
      if (reviewAnswered(m)) {
        return [t('status.hintWatch'), `  bladecp migrations status ${safeText(m.uuid)} --watch`];
      }
      return [
        t('outcome.reviewRequired'),
        `  bladecp migrations review ${safeText(m.uuid)} --domain ${safeText(discoveredDomain(m) ?? 'example.com')}`,
      ];
    case 'awaiting_approval':
      return [t('outcome.approveHint'), `  bladecp migrations approve ${safeText(m.uuid)}`];
    case 'failed':
      return m.retry?.allowed
        ? [t('outcome.retryHint'), `  bladecp migrations retry ${safeText(m.uuid)}`]
        : [];
    case 'cutover_pending':
    case 'cutover_stalled':
      return domainPointingLines(ctx, m);
    case 'live':
    case 'cancelled':
      return [];
    default:
      return [t('status.hintWatch'), `  bladecp migrations status ${safeText(m.uuid)} --watch`];
  }
}

function printMigration(ctx: Ctx, m: Migration): void {
  const t = ctx.out.t;
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
  if (m.phase === 'failed' && (m.message || m.reason))
    rows.push([t('label.reason'), String(m.message ?? m.reason)]);
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows)
    ctx.out.print(`${ctx.out.style('dim', label.padEnd(width))}  ${safeText(value)}`);
  const components = m.components ?? [];
  if (components.length > 0) {
    ctx.out.print();
    for (const c of components) {
      ctx.out.print(`  ${componentLabel(c.name, t)}: ${componentStatusLabel(c.status, t)}`);
    }
  }
  const hint = phaseHint(ctx, m);
  if (hint.length > 0) {
    ctx.out.print();
    for (const line of hint) ctx.out.print(line);
  }
}

export async function migrationsStatusCommand(
  ctx: Ctx,
  uuid: string,
  watch: boolean,
): Promise<number> {
  const auth = await resolveAuth(ctx);
  const api = createApi(ctx, auth.apiKey);
  if (!watch) {
    const m = await api.getMigration(uuid);
    if (ctx.json) ctx.out.emitJson({ ok: true, data: withDomainPointing(ctx, m) });
    else printMigration(ctx, m);
    return ExitCode.OK;
  }
  if (!ctx.json) ctx.out.info(ctx.out.t('follow.watching'));
  const result = await followMigration(ctx, api, uuid, { mode: 'watch' });
  if (!ctx.json) printFollowOutcome(ctx, result);
  return result.exitCode;
}

export async function migrationsReviewCommand(
  ctx: Ctx,
  uuid: string,
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
  const result = await createApi(ctx, auth.apiKey).reviewDiscovery(uuid, domain);
  if (ctx.json) {
    ctx.out.emitJson({
      ok: true,
      data: { migrationUuid: uuid, phase: result.phase, primaryDomain: domain },
    });
    return ExitCode.OK;
  }
  ctx.out.say('review.sent', { domain });
  ctx.out.say('status.hintWatch');
  ctx.out.print(`  bladecp migrations status ${uuid} --watch`);
  return ExitCode.OK;
}

export async function migrationsApproveCommand(ctx: Ctx, uuid: string): Promise<number> {
  const auth = await resolveAuth(ctx);
  const result = await createApi(ctx, auth.apiKey).approve(uuid);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { migrationUuid: uuid, phase: result.phase } });
    return ExitCode.OK;
  }
  ctx.out.print(ctx.out.style('green', ctx.out.t('approve.done')));
  ctx.out.say('status.hintWatch');
  ctx.out.print(`  bladecp migrations status ${uuid} --watch`);
  return ExitCode.OK;
}

export async function migrationsCancelCommand(
  ctx: Ctx,
  uuid: string,
  reason: string | undefined,
): Promise<number> {
  const auth = await resolveAuth(ctx);
  const result = await createApi(ctx, auth.apiKey).cancel(uuid, reason);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { migrationUuid: uuid, phase: result.phase } });
    return ExitCode.OK;
  }
  ctx.out.say('cancel.done');
  return ExitCode.OK;
}

export async function migrationsRetryCommand(ctx: Ctx, uuid: string): Promise<number> {
  const auth = await resolveAuth(ctx);
  const result = await createApi(ctx, auth.apiKey).retry(uuid);
  if (ctx.json) {
    ctx.out.emitJson({
      ok: true,
      data: { migrationUuid: result.migrationUuid, retryOf: uuid, phase: result.phase },
    });
    return ExitCode.OK;
  }
  ctx.out.say('retry.done', { uuid: result.migrationUuid });
  ctx.out.say('status.hintWatch');
  ctx.out.print(`  bladecp migrations status ${safeText(result.migrationUuid)} --watch`);
  return ExitCode.OK;
}
