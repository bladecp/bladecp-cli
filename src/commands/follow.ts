import type { BladecpApi } from '../api.js';
import type { Ctx } from '../context.js';
import { nameserversFor } from '../endpoints.js';
import { ApiError, CliError, ExitCode, type ExitCodeValue, NetworkError } from '../errors.js';
import {
  componentLabel,
  componentStatusLabel,
  formatDuration,
  isValidDomain,
  migrationPhaseLabel,
  normalizeDomain,
} from '../format.js';
import { safeText } from '../sanitize.js';
import type { Migration } from '../types.js';

export type FollowOutcome =
  | 'awaiting_approval'
  | 'approved'
  | 'complete'
  | 'live'
  | 'failed'
  | 'cancelled'
  | 'review_required'
  | 'upload_pending';

export interface FollowResult {
  migration: Migration;
  outcome: FollowOutcome;
  exitCode: ExitCodeValue;
}

export interface FollowOptions {
  /** `migrate` answers the domain question itself; `watch` only observes. */
  mode: 'migrate' | 'watch';
  domain?: string | undefined;
  yes?: boolean;
}

const MAX_TRANSIENT_FAILURES = 6;
/** Republish attempts for a domain the API stored but could not pass on. */
const MAX_REVIEW_REPUBLISH = 5;
/** After this long waiting for BladeCP in review, mention the safe resend. */
const REVIEW_SLOW_MS = 10 * 60 * 1000;

function isReviewPending(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    error.apiCode === 'MIGRATION_DISCOVERY_REVIEW_PENDING'
  );
}

/**
 * Sends the chosen domain. `pending` means the API stored the choice but
 * could not hand it to the migration engine yet; sending the same domain
 * again later is safe and completes it.
 */
async function submitReview(
  api: BladecpApi,
  uuid: string,
  domain: string,
): Promise<'sent' | 'pending'> {
  try {
    await api.reviewDiscovery(uuid, domain);
    return 'sent';
  } catch (error) {
    if (isReviewPending(error)) return 'pending';
    throw error;
  }
}

export function discoveredDomain(m: Migration): string | null {
  return m.sourcePrimaryDomain ?? m.requestedPrimaryDomain ?? m.primaryDomain ?? null;
}

/**
 * After the preview is approved the migration is complete. Pointing the
 * domain is optional and the old site stays online until the person does it;
 * `cutover_stalled` only means the automatic check for the pointing ended.
 */
function isCompleteWithOptionalDomain(phase: string): boolean {
  return phase === 'cutover_pending' || phase === 'cutover_stalled';
}

export interface DomainPointing {
  optional: true;
  /** Empty when the API address has no known nameservers. */
  nameservers: string[];
  /** Address for an A record of the domain, when the API returns one. */
  aRecord: string | null;
}

/** How to point the domain of a complete migration, or null before that. */
export function domainPointing(ctx: Ctx, m: Migration): DomainPointing | null {
  if (!isCompleteWithOptionalDomain(m.phase)) return null;
  const target = typeof m.cutoverTarget === 'string' ? m.cutoverTarget.trim() : '';
  return {
    optional: true,
    nameservers: [...nameserversFor(ctx.apiUrl)],
    aRecord: target === '' ? null : target,
  };
}

/**
 * The API object for `--json` read output, unchanged, plus `domainPointing`
 * once the migration is complete.
 */
export function withDomainPointing(ctx: Ctx, m: Migration): Migration {
  const pointing = domainPointing(ctx, m);
  return pointing ? { ...m, domainPointing: pointing } : m;
}

/** Human lines for a complete migration whose domain may still be pointed. */
export function domainPointingLines(ctx: Ctx, m: Migration): string[] {
  const pointing = domainPointing(ctx, m);
  if (!pointing) return [];
  const t = ctx.out.t;
  const lines = [t('outcome.pointDomain')];
  if (pointing.nameservers.length > 0) {
    lines.push(t('outcome.nameservers'));
    for (const nameserver of pointing.nameservers) lines.push(`  ${nameserver}`);
  }
  if (pointing.aRecord) {
    lines.push(
      pointing.nameservers.length > 0
        ? t('outcome.aRecordAlternative', { address: pointing.aRecord })
        : t('outcome.aRecord', { address: pointing.aRecord }),
    );
  }
  if (m.phase === 'cutover_stalled') lines.push(t('outcome.checkEnded'));
  return lines;
}

function componentsSummary(m: Migration, ctx: Ctx): string {
  const parts = (m.components ?? [])
    .filter((c) => c.status !== 'skipped' || c.name === 'files' || c.name === 'database')
    .map(
      (c) => `${componentLabel(c.name, ctx.out.t)}: ${componentStatusLabel(c.status, ctx.out.t)}`,
    );
  return parts.join(', ');
}

function changeKey(m: Migration): string {
  const components = (m.components ?? []).map((c) => `${c.name}:${c.status}`).join(',');
  return `${m.phase}|${m.primaryDomain ?? ''}|${components}|${m.stagingUrl ?? ''}`;
}

function clock(now: number): string {
  const d = new Date(now);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** Interval that starts at the base and slows down while nothing changes. */
function pollDelay(base: number, unchangedPolls: number): number {
  if (unchangedPolls >= 60) return base * 3;
  if (unchangedPolls >= 12) return base * 2;
  return base;
}

async function askDomain(
  ctx: Ctx,
  api: BladecpApi,
  m: Migration,
): Promise<{ domain: string; result: 'sent' | 'pending' }> {
  const prompter = ctx.createPrompter();
  try {
    const found = discoveredDomain(m);
    if (found) ctx.out.info(ctx.out.t('review.found', { domain: found }));
    for (let tries = 0; ; tries += 1) {
      const answer = await prompter.ask(
        found ? ctx.out.t('review.askWithDefault', { domain: found }) : ctx.out.t('review.ask'),
      );
      const domain = normalizeDomain(answer || found || '');
      if (!isValidDomain(domain)) {
        ctx.out.info(ctx.out.t('review.invalidDomain'));
        continue;
      }
      try {
        return { domain, result: await submitReview(api, m.uuid, domain) };
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.apiCode === 'MIGRATION_DOMAIN_UNAVAILABLE' &&
          tries < 4
        ) {
          ctx.out.info(ctx.out.t('error.domainUnavailable'));
          continue;
        }
        throw error;
      }
    }
  } finally {
    prompter.close();
  }
}

/**
 * Polls a migration until it needs the person or reaches an end state.
 * Prints one line per change (or one JSON line per change with
 * `--watch --json`) and respects rate limits through the API client.
 */
export async function followMigration(
  ctx: Ctx,
  api: BladecpApi,
  uuid: string,
  options: FollowOptions,
): Promise<FollowResult> {
  const base = ctx.pollIntervalMs ?? 5000;
  let lastKey = '';
  let unchanged = 0;
  let transientFailures = 0;
  // Domain this run submitted, and whether the engine still has to receive it.
  let submitted: string | null = null;
  let republish = false;
  let republishAttempts = 0;
  let waitingSince: number | null = null;
  let slowHintShown = false;
  let phaseSince = ctx.now();
  let lastPhase = '';

  for (;;) {
    let m: Migration;
    try {
      m = await api.getMigration(uuid);
      transientFailures = 0;
    } catch (error) {
      const transient =
        error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
      if (transient && transientFailures < MAX_TRANSIENT_FAILURES) {
        transientFailures += 1;
        ctx.out.liveLine(ctx.out.t('follow.reconnecting'));
        await ctx.sleep(base * 2, ctx.signal);
        continue;
      }
      throw error;
    }

    const key = changeKey(m);
    if (m.phase !== lastPhase) {
      lastPhase = m.phase;
      phaseSince = ctx.now();
    }
    if (key !== lastKey) {
      lastKey = key;
      unchanged = 0;
      if (ctx.json) {
        if (options.mode === 'watch')
          ctx.out.emitJsonLine({ ok: true, data: withDomainPointing(ctx, m) });
      } else {
        const summary = componentsSummary(m, ctx);
        const label = migrationPhaseLabel(m, ctx.out.t);
        ctx.out.info(
          `${ctx.out.style('dim', clock(ctx.now()))}  ${label}${summary ? ctx.out.style('dim', `  (${summary})`) : ''}`,
        );
      }
    } else {
      unchanged += 1;
    }

    switch (m.phase) {
      case 'awaiting_approval':
        return { migration: m, outcome: 'awaiting_approval', exitCode: ExitCode.OK };
      case 'live':
        return { migration: m, outcome: 'live', exitCode: ExitCode.OK };
      case 'failed':
        return { migration: m, outcome: 'failed', exitCode: ExitCode.MIGRATION_FAILED };
      case 'cancelled':
        return { migration: m, outcome: 'cancelled', exitCode: ExitCode.MIGRATION_FAILED };
      // Complete: pointing the domain is optional, so nothing is left to wait for.
      case 'cutover_pending':
      case 'cutover_stalled':
        return { migration: m, outcome: 'complete', exitCode: ExitCode.OK };
      case 'syncing':
        if (options.mode === 'migrate')
          return { migration: m, outcome: 'approved', exitCode: ExitCode.OK };
        break;
      case 'draft':
      case 'uploading':
        if (options.mode === 'watch') {
          return { migration: m, outcome: 'upload_pending', exitCode: ExitCode.ACTION_REQUIRED };
        }
        break;
      case 'discovery_review': {
        const chosen = m.primaryDomain ?? submitted;
        if (chosen) {
          // Already answered (now, earlier or at creation): only BladeCP can
          // move on, so keep waiting instead of asking again.
          if (republish && options.mode === 'migrate' && republishAttempts < MAX_REVIEW_REPUBLISH) {
            republishAttempts += 1;
            republish = (await submitReview(api, m.uuid, chosen)) === 'pending';
          }
          if (waitingSince === null) {
            waitingSince = ctx.now();
            ctx.out.info(ctx.out.t('follow.waitingForBladecp', { domain: chosen }));
          } else if (!slowHintShown && ctx.now() - waitingSince >= REVIEW_SLOW_MS) {
            slowHintShown = true;
            ctx.out.info(ctx.out.t('follow.reviewSlow', { uuid: m.uuid, domain: chosen }));
          }
          break;
        }
        if (options.mode === 'watch') {
          return { migration: m, outcome: 'review_required', exitCode: ExitCode.ACTION_REQUIRED };
        }
        const preset =
          options.domain ?? (options.yes ? (discoveredDomain(m) ?? undefined) : undefined);
        let answer: { domain: string; result: 'sent' | 'pending' } | null = null;
        if (preset) {
          const domain = normalizeDomain(preset);
          if (!isValidDomain(domain)) {
            throw new CliError(
              'review.invalidDomain',
              {},
              { exitCode: ExitCode.USAGE, code: 'invalid_domain' },
            );
          }
          answer = { domain, result: await submitReview(api, m.uuid, domain) };
        } else if (ctx.interactive) {
          ctx.out.clearLiveLine();
          answer = await askDomain(ctx, api, m);
        }
        if (!answer) {
          return { migration: m, outcome: 'review_required', exitCode: ExitCode.ACTION_REQUIRED };
        }
        submitted = answer.domain;
        republish = answer.result === 'pending';
        ctx.out.info(ctx.out.t('review.sent', { domain: answer.domain }));
        if (republish) ctx.out.info(ctx.out.t('follow.reviewPending'));
        break;
      }
      default:
        break;
    }

    ctx.out.liveLine(
      ctx.out.t('follow.live', {
        phase: migrationPhaseLabel(m, ctx.out.t),
        elapsed: formatDuration(ctx.now() - phaseSince),
      }),
    );
    await ctx.sleep(pollDelay(base, unchanged), ctx.signal);
  }
}

/** Human closing lines for a follow result. */
export function printFollowOutcome(ctx: Ctx, result: FollowResult): void {
  const { migration: m, outcome } = result;
  const t = ctx.out.t;
  ctx.out.clearLiveLine();
  switch (outcome) {
    case 'awaiting_approval':
      ctx.out.print();
      ctx.out.print(ctx.out.style('green', t('outcome.ready')));
      if (m.stagingUrl) ctx.out.print(t('outcome.preview', { url: m.stagingUrl }));
      ctx.out.print(t('outcome.approveHint'));
      ctx.out.print(`  bladecp migrations approve ${safeText(m.uuid)}`);
      break;
    case 'approved':
      ctx.out.print(t('outcome.approved'));
      ctx.out.print(`  bladecp migrations status ${safeText(m.uuid)} --watch`);
      break;
    case 'complete':
      ctx.out.print();
      ctx.out.print(ctx.out.style('green', t('outcome.complete')));
      for (const line of domainPointingLines(ctx, m)) ctx.out.print(line);
      break;
    case 'live':
      ctx.out.print(ctx.out.style('green', t('outcome.live', { domain: m.primaryDomain ?? '-' })));
      break;
    case 'failed':
      ctx.out.print(ctx.out.style('red', t('outcome.failed')));
      if (m.message || m.reason)
        ctx.out.print(t('outcome.reason', { reason: String(m.message ?? m.reason) }));
      if (m.retry?.allowed) {
        ctx.out.print(t('outcome.retryHint'));
        ctx.out.print(`  bladecp migrations retry ${safeText(m.uuid)}`);
      }
      break;
    case 'cancelled':
      ctx.out.print(t('outcome.cancelled'));
      break;
    case 'review_required': {
      const domain = discoveredDomain(m);
      ctx.out.print(t('outcome.reviewRequired'));
      ctx.out.print(
        `  bladecp migrations review ${safeText(m.uuid)} --domain ${safeText(domain ?? 'example.com')}`,
      );
      break;
    }
    case 'upload_pending':
      ctx.out.print(t('outcome.uploadPending'));
      break;
  }
}

/** Machine description of what the person should do next. */
export function nextAction(
  m: Migration,
  outcome: FollowOutcome,
): { type: string; command: string } | null {
  switch (outcome) {
    case 'awaiting_approval':
      return { type: 'approve', command: `bladecp migrations approve ${m.uuid}` };
    case 'review_required':
      return {
        type: 'review',
        command: `bladecp migrations review ${m.uuid} --domain ${discoveredDomain(m) ?? '<domain>'}`,
      };
    case 'failed':
      return m.retry?.allowed
        ? { type: 'retry', command: `bladecp migrations retry ${m.uuid}` }
        : null;
    case 'approved':
      return { type: 'watch', command: `bladecp migrations status ${m.uuid} --watch` };
    case 'upload_pending':
      return { type: 'upload', command: 'bladecp migrate <backup.tar.gz>' };
    default:
      return null;
  }
}
