import type { BladecpApi } from '../api.js';
import type { Ctx } from '../context.js';
import { migrationHubUrl, nameserversFor, supportUrl } from '../endpoints.js';
import { ApiError, CliError, ExitCode, type ExitCodeValue, NetworkError } from '../errors.js';
import {
  componentLabel,
  componentStatusLabel,
  formatDuration,
  isValidDomain,
  migrationPhaseLabel,
  normalizeDomain,
  phaseLabel,
} from '../format.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import type { Migration, MigrationComponent } from '../types.js';
import { type Kit, kit } from '../ui/kit.js';
import { findLocalUpload } from '../upload/state.js';

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
  /** Keep following after the approval until the migration is complete. */
  untilComplete?: boolean;
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
  // Without the BladeCP nameservers for this address, the Hub shows every way to point it.
  if (pointing.nameservers.length === 0) {
    lines.push(t('outcome.pointInHub', { url: migrationHubUrl(ctx.hubUrl, m.uuid) }));
  }
  if (m.phase === 'cutover_stalled') lines.push(t('outcome.checkEnded'));
  return lines;
}

const REASON_KEYS: Record<string, MessageKey> = {
  permanent: 'reason.permanent',
  retryable: 'reason.retryable',
};

/** Why a migration failed: the API message, or a known reason code in words. */
export function failureReason(m: Migration, t: Translator): string | null {
  const message = typeof m.message === 'string' ? m.message.trim() : '';
  if (message) return message;
  const reason = typeof m.reason === 'string' ? m.reason.trim() : '';
  if (!reason) return null;
  return REASON_KEYS[reason] ? t(REASON_KEYS[reason]) : reason;
}

const RETRY_REASON_KEYS: Record<string, MessageKey> = {
  attempt_used: 'retryReason.attempt_used',
  backup_unavailable: 'retryReason.backup_unavailable',
  discovery_review_expired: 'retryReason.discovery_review_expired',
  destination_needs_review: 'retryReason.destination_needs_review',
};

/** What can be done after a failure: retry, follow the retry, or why neither. */
export function retryLines(m: Migration, t: Translator): { text: string; command?: string }[] {
  const retry = m.retry;
  if (!retry) return [];
  if (retry.allowed && retry.migrationUuid) {
    return [
      {
        text: t('retry.exists', { uuid: retry.migrationUuid }),
        command: `bladecp migrations status ${retry.migrationUuid} --watch`,
      },
    ];
  }
  if (retry.allowed) {
    return [{ text: t('outcome.retryHint'), command: `bladecp migrations retry ${m.uuid}` }];
  }
  const key = retry.reason ? RETRY_REASON_KEYS[retry.reason] : undefined;
  return key ? [{ text: t(key) }] : [];
}

function componentsSummary(m: Migration, ctx: Ctx): string {
  const parts = visibleComponents(m).map(
    (c) =>
      `${componentLabel(c.name, ctx.out.t)}: ${componentStatusLabel(c.status, ctx.out.t, m.phase)}`,
  );
  return parts.join(', ');
}

/** Components the backup does not have, as the reading of the backup reported them. */
export function absentComponents(m: Migration): Set<string> {
  const absent = new Set<string>();
  const d = m.discovery;
  if (d && typeof d === 'object') {
    if (d.emailAccountCount === 0) absent.add('email_accounts');
    if (d.emailHistoryBytes === 0) absent.add('email_history');
  }
  return absent;
}

/** Components worth showing: the ones in the backup (files and database always). */
export function visibleComponents(m: Migration): MigrationComponent[] {
  const absent = absentComponents(m);
  return (m.components ?? []).filter(
    (c) =>
      !absent.has(c.name) &&
      (c.status !== 'skipped' || c.name === 'files' || c.name === 'database'),
  );
}

// ------------------------------------------------------------ slow phases

/**
 * How long each phase usually takes, in minutes: after the first number the
 * CLI says it is taking longer than usual, after the second it points to
 * support. The migration keeps going either way.
 */
export const PHASE_LIMITS: Record<string, readonly [number, number]> = {
  queued: [10, 30],
  parsing: [20, 60],
  provisioning: [10, 30],
  importing: [45, 120],
  validating: [15, 45],
  syncing: [15, 45],
};

export interface SlowPhase {
  phase: string;
  elapsedMs: number;
  expectedMs: number;
  contactSupport: boolean;
}

/**
 * Whether the current phase passed its usual time: from the time the API
 * says the phase began, or else since this run first saw it.
 */
export function slowPhase(m: Migration, now: number, seenSince?: number): SlowPhase | null {
  const limits = PHASE_LIMITS[m.phase];
  if (!limits) return null;
  const entered = m.timing?.phaseEnteredAt ? Date.parse(m.timing.phaseEnteredAt) : Number.NaN;
  const since = Number.isNaN(entered) ? seenSince : entered;
  if (since === undefined) return null;
  const elapsedMs = Math.max(0, now - since);
  const expectedMs = limits[0] * 60_000;
  if (elapsedMs < expectedMs) return null;
  return { phase: m.phase, elapsedMs, expectedMs, contactSupport: elapsedMs >= limits[1] * 60_000 };
}

/** The words of a slow phase: what happens, how to follow later, support when it is long. */
export function slowLines(
  ctx: Ctx,
  m: Migration,
  slow: SlowPhase,
): { text: string; command?: string }[] {
  const t = ctx.out.t;
  const lines: { text: string; command?: string }[] = [
    {
      text: t('slow.title', {
        phase: phaseLabel(slow.phase, t),
        elapsed: formatDuration(slow.elapsedMs),
      }),
    },
    { text: t('slow.later'), command: `bladecp migrations status ${m.uuid} --watch` },
  ];
  if (slow.contactSupport) lines.push({ text: t('slow.support', { url: supportUrl(ctx.hubUrl) }) });
  return lines;
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

// ---------------------------------------------------------------- the rail

const RAIL_PHASES = [
  'queued',
  'parsing',
  'discovery_review',
  'provisioning',
  'importing',
  'validating',
  'awaiting_approval',
];
const AFTER_APPROVAL = ['syncing'];

/**
 * The phases of a migration as a rail on the terminal: ✓ done (with the
 * time each took when this run saw it), a spinner on the current one, dots
 * for what is still ahead, the components under the import.
 */
export class PhaseRail {
  private readonly k: Kit;
  private readonly entered = new Map<string, number>();
  private readonly took = new Map<string, number>();
  private last: Migration | null = null;
  private current = '';
  private lastActive = '';
  /** Rows already written for good (above the live region). */
  private printed = 0;
  note: string | null = null;
  /** Lines about a phase that is taking longer than usual. */
  slow: { text: string; command?: string }[] | null = null;

  constructor(
    private readonly ctx: Ctx,
    private readonly uuid: string,
    /** First phase shown (after an approval, the rail starts at the sync). */
    private readonly from?: string,
  ) {
    this.k = kit(ctx.out, 'err');
  }

  header(): string {
    const k = this.k;
    return `  ${k.violet(k.glyph.active)}  ${this.ctx.out.t('follow.title')} ${k.muted(`· ${safeText(this.uuid.slice(0, 8))}`)}`;
  }

  update(m: Migration): void {
    const now = this.ctx.now();
    const phase =
      isCompleteWithOptionalDomain(m.phase) || m.phase === 'live' ? 'cutover_pending' : m.phase;
    if (phase !== this.current) {
      const since = this.entered.get(this.current);
      if (since !== undefined) this.took.set(this.current, now - since);
      this.entered.set(phase, now);
      this.current = phase;
    }
    if (phase !== 'failed' && phase !== 'cancelled') this.lastActive = phase;
    this.last = m;
  }

  private order(): string[] {
    const beyond =
      this.from !== undefined ||
      AFTER_APPROVAL.includes(this.current) ||
      AFTER_APPROVAL.includes(this.lastActive) ||
      this.current === 'cutover_pending';
    const all = beyond ? [...RAIL_PHASES, ...AFTER_APPROVAL] : RAIL_PHASES;
    return this.from ? all.slice(Math.max(0, all.indexOf(this.from))) : all;
  }

  private rows(frame: number): string[] {
    const k = this.k;
    const t = this.ctx.out.t;
    const m = this.last;
    if (!m) return [];
    const order = this.order();
    const ended = this.current === 'failed' || this.current === 'cancelled';
    const at = ended ? this.lastActive : this.current;
    const position = at === 'cutover_pending' ? order.length : order.indexOf(at);
    const width = Math.max(24, Math.min(k.width, 76) - 14);
    const rows: string[] = [];
    order.forEach((phase, i) => {
      const domain = m.primaryDomain ?? null;
      let label: string;
      if (phase === 'cutover_pending') label = t('follow.complete');
      else if (phase === 'discovery_review' && domain && i < position)
        label = t('follow.domainDone', { domain });
      else label = phaseLabel(phase, t);
      const time = this.took.get(phase);
      let mark: string;
      let right = '';
      if (position === -1 || i > position) {
        mark = k.faint(k.glyph.dot);
        label = k.faint(label);
      } else if (i < position) {
        mark = k.ok(k.glyph.check);
        if (time !== undefined && time >= 1000) right = k.muted(formatDuration(time));
      } else if (ended) {
        mark = k.err(k.glyph.cross);
      } else if (phase === 'discovery_review' && !domain) {
        mark = k.warn(k.glyph.active);
      } else if (phase === 'awaiting_approval' || phase === 'cutover_pending') {
        mark = k.ok(k.glyph.check);
      } else {
        if (phase === 'discovery_review' && domain) label = t('phase.discovery_review_answered');
        mark = k.accent(k.spin[frame % k.spin.length]!);
        label = k.shimmer(label, frame * 90);
        const since = this.entered.get(phase);
        if (since !== undefined) right = k.violet(formatDuration(this.ctx.now() - since));
      }
      const pad = ' '.repeat(Math.max(1, width - this.ctx.out.width(label)));
      rows.push(k.railLine(`${mark} ${label}${right ? `${pad}${right}` : ''}`));
      if (phase === 'importing' && i <= position) {
        const components = visibleComponents(m);
        if (components.length > 0) {
          rows.push(
            k.railLine(
              `    ${components
                .map((c) => {
                  const name = componentLabel(c.name, t);
                  if (absentComponents(m).has(c.name))
                    return `${k.faint(k.glyph.dot)} ${k.faint(name)}`;
                  if (c.status === 'completed') return `${k.ok(k.glyph.check)} ${name}`;
                  if (c.status === 'running') return `${k.violet(k.glyph.active)} ${name}`;
                  if (c.status === 'failed') return `${k.err(k.glyph.cross)} ${name}`;
                  return `${k.faint(k.glyph.done)} ${k.faint(name)}`;
                })
                .join('   ')}`,
            ),
          );
        }
      }
    });
    return rows;
  }

  /** The live region: rows not yet written for good, plus a note. */
  draw(frame: number): void {
    const k = this.k;
    const rows = this.rows(frame).slice(this.printed);
    const slow = (this.slow ?? []).flatMap((line, i) => [
      ...k
        .wrap(line.text, k.width - 6, '')
        .map((part, j) =>
          k.railLine(
            i === 0 && j === 0 ? `${k.warn(k.glyph.active)} ${k.warn(part)}` : `  ${k.muted(part)}`,
          ),
        ),
      ...(line.command ? [k.railLine(`  ${k.accent(line.command)}`)] : []),
    ]);
    this.ctx.out.live([
      ...rows,
      ...(slow.length > 0 ? [k.railLine(), ...slow] : []),
      ...(this.note ? [k.railLine(k.muted(this.note))] : []),
    ]);
  }

  /** Writes the rows that are done for good, so a question can be asked below them. */
  settle(frame: number): void {
    this.ctx.out.clearLiveLine();
    const rows = this.rows(frame);
    const done = rows
      .slice(this.printed)
      .filter((row) => this.ctx.out.plain(row).includes(this.k.glyph.check));
    // Only the leading completed rows are final.
    let count = 0;
    for (const row of rows.slice(this.printed)) {
      if (!done.includes(row)) break;
      count += 1;
    }
    if (count > 0) this.ctx.out.infoLines(rows.slice(this.printed, this.printed + count));
    this.printed += count;
  }

  /** Last frame, kept on screen. */
  finish(): void {
    this.note = null;
    this.draw(0);
    this.ctx.out.liveDone();
    this.ctx.out.info(this.k.railLine());
  }
}

async function askDomain(
  ctx: Ctx,
  api: BladecpApi,
  m: Migration,
  rail: PhaseRail | null,
): Promise<{ domain: string; result: 'sent' | 'pending' }> {
  const t = ctx.out.t;
  const k = kit(ctx.out, 'err');
  const prompter = ctx.createPrompter();
  try {
    const found = discoveredDomain(m);
    if (rail) {
      rail.settle(0);
      ctx.out.infoLines([
        k.railLine(
          `${k.warn(k.glyph.active)} ${found ? t('review.found', { domain: found }) : t('review.needed')}`,
        ),
      ]);
    } else if (found) ctx.out.info(t('review.found', { domain: found }));
    for (let tries = 0; ; tries += 1) {
      const question = found ? t('review.askWithDefault', { domain: found }) : t('review.ask');
      const asked = ctx.out.promptLines(
        rail ? `  ${k.rail(k.glyph.bar)}    ${k.violet(k.glyph.arrow)} ${question}` : question,
      );
      if (asked.length > 1) ctx.out.infoLines(asked.slice(0, -1));
      const answer = await prompter.ask(ctx.out.renderPrompt(asked.at(-1) ?? question));
      // The confirmed-domain step right below says the same thing.
      if (rail) ctx.out.forgetPrompt(asked, answer);
      const domain = normalizeDomain(answer || found || '');
      if (!isValidDomain(domain)) {
        ctx.out.info(
          rail ? k.railLine(k.warn(t('review.invalidDomain'))) : t('review.invalidDomain'),
        );
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
          ctx.out.info(
            rail ? k.railLine(k.warn(t('error.domainUnavailable'))) : t('error.domainUnavailable'),
          );
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
 * `--watch --json`), or draws the rail of phases on a terminal, and respects
 * rate limits through the API client.
 */
export async function followMigration(
  ctx: Ctx,
  api: BladecpApi,
  uuid: string,
  options: FollowOptions,
  existingRail?: PhaseRail,
): Promise<FollowResult & { rail: PhaseRail | null }> {
  const base = ctx.pollIntervalMs ?? 5000;
  const t = ctx.out.t;
  const live = !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr;
  const rail = live ? (existingRail ?? new PhaseRail(ctx, uuid)) : null;
  if (rail && !existingRail) ctx.out.info(rail.header());
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
  let frame = 0;
  /** 0 normal, 1 slower than usual, 2 time to talk to support. */
  let slowLevel = 0;
  const done = (migration: Migration, outcome: FollowOutcome, exitCode: ExitCodeValue) => {
    if (rail) rail.finish();
    return { migration, outcome, exitCode, rail };
  };
  const say = (text: string) => {
    if (rail) rail.note = text;
    else ctx.out.info(text);
  };

  for (;;) {
    let m: Migration;
    try {
      m = await api.getMigration(uuid);
      transientFailures = 0;
      if (rail && rail.note === t('follow.reconnecting')) rail.note = null;
    } catch (error) {
      const transient =
        error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
      if (transient && transientFailures < MAX_TRANSIENT_FAILURES) {
        transientFailures += 1;
        if (rail) {
          rail.note = t('follow.reconnectingTry', {
            attempt: transientFailures,
            of: MAX_TRANSIENT_FAILURES,
          });
          rail.draw(frame);
        } else ctx.out.liveLine(t('follow.reconnecting'));
        await ctx.sleep(base * 2, ctx.signal);
        continue;
      }
      if (rail) ctx.out.clearLiveLine();
      throw error;
    }

    const key = changeKey(m);
    if (m.phase !== lastPhase) {
      lastPhase = m.phase;
      phaseSince = ctx.now();
      slowLevel = 0;
      if (rail) rail.slow = null;
    }
    rail?.update(m);
    if (key !== lastKey) {
      lastKey = key;
      unchanged = 0;
      if (ctx.json) {
        if (options.mode === 'watch')
          ctx.out.emitJsonLine({ ok: true, data: withDomainPointing(ctx, m) });
      } else if (!rail) {
        const summary = componentsSummary(m, ctx);
        const label = migrationPhaseLabel(m, t);
        ctx.out.info(`${clock(ctx.now())}  ${label}${summary ? `  (${summary})` : ''}`);
      }
    } else {
      unchanged += 1;
    }

    // A phase past its usual time: say so once, and again when it is long.
    const slow = slowPhase(m, ctx.now(), phaseSince);
    const level = slow ? (slow.contactSupport ? 2 : 1) : 0;
    if (slow && level > slowLevel) {
      slowLevel = level;
      if (ctx.json) {
        if (options.mode === 'watch') {
          ctx.out.emitJsonLine({
            ok: true,
            data: { ...withDomainPointing(ctx, m), slowPhase: slow },
          });
        }
      } else if (rail) {
        rail.slow = slowLines(ctx, m, slow);
      } else {
        for (const line of slowLines(ctx, m, slow)) {
          ctx.out.info(line.text);
          if (line.command) ctx.out.info(`  ${line.command}`);
        }
      }
    }

    switch (m.phase) {
      case 'awaiting_approval':
        if (!options.untilComplete) return done(m, 'awaiting_approval', ExitCode.OK);
        break;
      case 'live':
        return done(m, 'live', ExitCode.OK);
      case 'failed':
        return done(m, 'failed', ExitCode.MIGRATION_FAILED);
      case 'cancelled':
        return done(m, 'cancelled', ExitCode.MIGRATION_FAILED);
      // Complete: pointing the domain is optional, so nothing is left to wait for.
      case 'cutover_pending':
      case 'cutover_stalled':
        return done(m, 'complete', ExitCode.OK);
      case 'syncing':
        if (options.mode === 'migrate' && !options.untilComplete)
          return done(m, 'approved', ExitCode.OK);
        break;
      case 'draft':
      case 'uploading':
        if (options.mode === 'watch') {
          return done(m, 'upload_pending', ExitCode.ACTION_REQUIRED);
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
            if (!rail) say(t('follow.waitingForBladecp', { domain: chosen }));
          } else if (!slowHintShown && ctx.now() - waitingSince >= REVIEW_SLOW_MS) {
            slowHintShown = true;
            say(t('follow.reviewSlow', { uuid: m.uuid, domain: chosen }));
          }
          break;
        }
        if (options.mode === 'watch') {
          return done(m, 'review_required', ExitCode.ACTION_REQUIRED);
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
          if (!rail) ctx.out.clearLiveLine();
          answer = await askDomain(ctx, api, m, rail);
        }
        if (!answer) {
          return done(m, 'review_required', ExitCode.ACTION_REQUIRED);
        }
        submitted = answer.domain;
        republish = answer.result === 'pending';
        if (rail) {
          m.primaryDomain = answer.domain;
          rail.update(m);
          rail.note = republish ? t('follow.reviewPending') : null;
        } else {
          ctx.out.info(t('review.sent', { domain: answer.domain }));
          if (republish) ctx.out.info(t('follow.reviewPending'));
        }
        break;
      }
      default:
        break;
    }

    const delay = pollDelay(base, unchanged);
    if (rail) {
      // The spinner turns while the poll interval passes.
      let waited = false;
      const sleeping = ctx.sleep(delay, ctx.signal).then(() => {
        waited = true;
      });
      do {
        rail.draw(frame);
        frame += 1;
        await Promise.race([sleeping, ctx.frame(100)]);
      } while (!waited);
      await sleeping;
    } else {
      ctx.out.liveLine(
        t('follow.live', {
          phase: migrationPhaseLabel(m, t),
          elapsed: formatDuration(ctx.now() - phaseSince),
        }),
      );
      await ctx.sleep(delay, ctx.signal);
    }
  }
}

/** What to say about an unfinished upload: rerun here, or on the computer that started it. */
export async function uploadPendingText(
  ctx: Ctx,
  m: Migration,
): Promise<{ text: string; command?: string }> {
  const t = ctx.out.t;
  const local = await findLocalUpload(ctx.configDir, m.uuid);
  if (local)
    return {
      text: t('status.hintUploadHere'),
      command: `bladecp migrate ${safeText(local.filePath)}`,
    };
  return { text: t('status.hintUploadElsewhere') };
}

/** Human closing lines for a follow result. */
export async function printFollowOutcome(ctx: Ctx, result: FollowResult): Promise<void> {
  const { migration: m, outcome } = result;
  const t = ctx.out.t;
  ctx.out.clearLiveLine();
  if (ctx.out.rich) {
    await printRichOutcome(ctx, result);
    return;
  }
  switch (outcome) {
    case 'awaiting_approval':
      ctx.out.print();
      ctx.out.print(t('outcome.ready'));
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
      ctx.out.print(t('outcome.complete'));
      for (const line of domainPointingLines(ctx, m)) ctx.out.print(line);
      break;
    case 'live':
      ctx.out.print(t('outcome.live', { domain: m.primaryDomain ?? '-' }));
      break;
    case 'failed': {
      ctx.out.print(t('outcome.failed'));
      const reason = failureReason(m, t);
      if (reason) ctx.out.print(t('outcome.reason', { reason }));
      for (const line of retryLines(m, t)) {
        ctx.out.print(line.text);
        if (line.command) ctx.out.print(`  ${safeText(line.command)}`);
      }
      break;
    }
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
    case 'upload_pending': {
      const hint = await uploadPendingText(ctx, m);
      ctx.out.print(hint.text);
      if (hint.command) ctx.out.print(`  ${hint.command}`);
      break;
    }
  }
}

/** The preview address between two horizons, the brightest thing on screen. */
export function previewBlock(ctx: Ctx, k: Kit, url: string): string[] {
  const width = Math.min(ctx.out.width(safeText(url)) + 6, k.width - 3);
  const link = k.link(url, k.underline(k.bold(safeText(url))));
  return [
    k.railLine(k.horizon(width, { spread: 0.6 })),
    k.railLine(`  ${link}`),
    k.railLine(k.horizon(width, { spread: 0.6 })),
  ];
}

/** The rows of the optional domain step of a complete migration. */
export function domainSection(ctx: Ctx, k: Kit, m: Migration): string[] {
  const pointing = domainPointing(ctx, m);
  if (!pointing) return [];
  const t = ctx.out.t;
  const rows: [string, string][] = [];
  if (m.primaryDomain) rows.push([t('label.domain'), safeText(m.primaryDomain)]);
  if (pointing.nameservers.length > 0)
    rows.push([t('label.nameservers'), pointing.nameservers.join(k.muted(' · '))]);
  if (pointing.aRecord) rows.push([t('label.aRecord'), safeText(pointing.aRecord)]);
  const lines = [
    `  ${k.ruler(`${t('label.domain')} ${k.muted(`(${t('outcome.optional')})`)}`)}`,
    ...k.rows(rows),
    ...k.wrap(t('outcome.pointDomain'), k.width, '  ').map((line) => k.muted(line)),
  ];
  if (pointing.nameservers.length === 0) {
    const url = migrationHubUrl(ctx.hubUrl, m.uuid);
    lines.push(
      ...k.wrap(t('outcome.pointInHubShort'), k.width, '  ').map((line) => k.muted(line)),
      `  ${k.link(url, k.accent(url))}`,
    );
  }
  if (m.phase === 'cutover_stalled')
    lines.push(...k.wrap(t('outcome.checkEnded'), k.width, '  ').map((line) => k.muted(line)));
  return lines;
}

async function printRichOutcome(ctx: Ctx, result: FollowResult): Promise<void> {
  const { migration: m, outcome } = result;
  const t = ctx.out.t;
  const k = kit(ctx.out, 'out');
  const command = (text: string) => `  ${k.violet(k.glyph.arrow)} ${k.accent(text)}`;
  const lines: string[] = [];
  switch (outcome) {
    case 'awaiting_approval':
      lines.push(`  ${k.violet(k.glyph.active)}  ${k.bold(t('outcome.ready'))}`, k.railLine());
      if (m.stagingUrl) lines.push(...previewBlock(ctx, k, m.stagingUrl), k.railLine());
      lines.push(
        ...k
          .wrap(t('outcome.previewHint'), k.width - 3, '')
          .map((line) => k.railLine(k.muted(line))),
        `  ${k.rail(k.glyph.end)}  ${t('outcome.approveHint')}`,
        command(`bladecp migrations approve ${safeText(m.uuid)}`),
      );
      break;
    case 'approved':
      lines.push(
        `  ${k.ok(k.glyph.done)}  ${t('outcome.approved')}`,
        command(`bladecp migrations status ${safeText(m.uuid)} --watch`),
      );
      break;
    case 'complete':
      lines.push(
        `  ${k.rail(k.glyph.end)}  ${k.ok(t('outcome.complete'))}`,
        '',
        ...domainSection(ctx, k, m),
      );
      break;
    case 'live':
      lines.push(
        `  ${k.rail(k.glyph.end)}  ${k.ok(t('outcome.live', { domain: m.primaryDomain ?? '-' }))}`,
      );
      break;
    case 'failed': {
      lines.push(`  ${k.err(k.glyph.cross)}  ${k.bold(t('outcome.failed'))}`);
      const reason = failureReason(m, t);
      if (reason)
        lines.push(
          ...k
            .wrap(t('outcome.reason', { reason }), k.width - 3, '')
            .map((line) => k.railLine(line)),
        );
      for (const line of retryLines(m, t)) {
        lines.push(...k.wrap(line.text, k.width - 3, '').map((part) => k.railLine(k.muted(part))));
        if (line.command) lines.push(command(line.command));
      }
      break;
    }
    case 'cancelled':
      lines.push(`  ${k.faint(k.glyph.done)}  ${t('outcome.cancelled')}`);
      break;
    case 'review_required': {
      const domain = discoveredDomain(m);
      lines.push(
        `  ${k.warn(k.glyph.active)}  ${t('outcome.reviewRequired')}`,
        command(
          `bladecp migrations review ${safeText(m.uuid)} --domain ${safeText(domain ?? 'example.com')}`,
        ),
      );
      break;
    }
    case 'upload_pending': {
      const hint = await uploadPendingText(ctx, m);
      lines.push(`  ${k.warn(k.glyph.active)}  ${hint.text}`);
      if (hint.command) lines.push(command(hint.command));
      break;
    }
  }
  ctx.out.lines(lines);
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
