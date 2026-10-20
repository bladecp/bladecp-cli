// `bladecp partner migrations ...`: Fast Deploy run by a BladeCP partner for
// its clients, through the routes the BladeCP WHMCS module uses. A request
// belongs to one WHMCS installation and one client of it (both name it in
// every call); a cPanel Migrator request also waits in the billing queue
// until the billing WHMCS links it to a client and a service, and may need
// the account holder to confirm the account in the client area.

import { randomUUID } from 'node:crypto';

import type { OperationId } from '../api/operations.js';
import { type BladecpApi, dataObject, invalidResponse, isRecord, type Json } from '../api.js';
import type { Ctx } from '../context.js';
import { nameserversFor } from '../endpoints.js';
import { ApiError, CliError, ExitCode, type ExitCodeValue, NetworkError } from '../errors.js';
import {
  componentLabel,
  componentStatusLabel,
  formatDate,
  isEnded,
  isValidDomain,
  migrationPhaseLabel,
  normalizeDomain,
  phaseTone,
  shortIds,
  type Tone,
} from '../format.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import { isIdPrefix, resolveId } from '../ids.js';
import { safeText } from '../sanitize.js';
import type { Migration } from '../types.js';
import { type Kit, kit } from '../ui/kit.js';
import { type Next, paintTone, showDone, showList, showOnce } from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  type Invocation,
  optFlag,
  optInteger,
  optString,
  partnerOnly,
  requireOption,
  signedInApi,
  usageError,
} from './common.js';
import { absentComponents, discoveredDomain, PhaseRail, visibleComponents } from './follow.js';

// ------------------------------------------------------------------ shapes

/** The WHMCS installation and the client of it that a request belongs to. */
interface Scope {
  installation_id: string;
  external_client_id: string;
}

interface RequestMigration {
  phase: string;
  primaryDomain: string | null;
  requestedPrimaryDomain?: string | null;
  sourcePrimaryDomain?: string | null;
  discovery?: Migration['discovery'];
  components?: { name: string; status: string }[] | null;
  stagingUrl?: string | null;
  cutoverTarget?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** A Fast Deploy request as the partner routes answer it (MigrationDetail). */
interface PartnerRequest {
  requestUuid: string;
  installationId?: string;
  externalClientId?: string;
  partnerPlanId?: number;
  locationId?: number;
  commercial?: {
    policy?: { mode?: string; trialDays?: number | null; paymentDays?: number | null } | null;
    state?: string;
    externalServiceId?: string | null;
    dueAt?: string | null;
  } | null;
  billing_link?: { status?: string; whmcs_service_id?: string; linked_at?: string } | null;
  waiting_reason?: string | null;
  migration: RequestMigration;
  actions?: Partial<Record<'review' | 'approve' | 'cancel' | 'retry', boolean>> | null;
  retry?: { allowed?: boolean; reason?: string | null } | null;
  [key: string]: unknown;
}

/** A cPanel Migrator request waiting for the billing WHMCS (MigrationBillingWork). */
interface QueueItem {
  request_uuid: string;
  created_at?: string;
  phase?: string;
  source?: { server_hostname?: string; username?: string; domain?: string } | null;
  plan?: { partner_plan_id?: number; location_id?: number } | null;
  commercial?: { mode?: string; trial_days?: number | null } | null;
  [key: string]: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A client or service ID of WHMCS itself (the billing link takes only these). */
const NATIVE_ID = /^[1-9]\d{0,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 100;
/** Pages read to find a short ID; past that, the whole ID is needed. */
const RESOLVE_PAGES = 20;
/** Pages read by --all, at most. */
const ALL_PAGES = 100;
const MAX_TRANSIENT_FAILURES = 6;

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function checkRequest(value: unknown): PartnerRequest {
  if (!isRecord(value) || typeof value.requestUuid !== 'string' || value.requestUuid === '')
    throw invalidResponse();
  const m = value.migration;
  if (!isRecord(m) || typeof m.phase !== 'string' || m.phase === '') throw invalidResponse();
  if (!optionalString(m.primaryDomain) || !optionalString(m.stagingUrl)) throw invalidResponse();
  if (m.components !== undefined && m.components !== null) {
    if (
      !Array.isArray(m.components) ||
      !m.components.every(
        (c) => isRecord(c) && typeof c.name === 'string' && typeof c.status === 'string',
      )
    )
      throw invalidResponse();
  }
  for (const part of ['commercial', 'billing_link', 'actions', 'retry']) {
    if (value[part] !== undefined && value[part] !== null && !isRecord(value[part]))
      throw invalidResponse();
  }
  return value as unknown as PartnerRequest;
}

function checkQueueItem(value: unknown): QueueItem {
  if (!isRecord(value) || typeof value.request_uuid !== 'string' || value.request_uuid === '')
    throw invalidResponse();
  for (const part of ['source', 'plan', 'commercial']) {
    if (value[part] !== undefined && value[part] !== null && !isRecord(value[part]))
      throw invalidResponse();
  }
  return value as QueueItem;
}

/** The migration of a request, in the form the shared migration helpers read. */
function asMigration(r: PartnerRequest): Migration {
  return { ...r.migration, uuid: r.requestUuid } as Migration;
}

// ----------------------------------------------------------------- options

function installationOption(values: Invocation['values']): string {
  const value = requireOption(values, 'installation');
  if (!UUID.test(value)) throw usageError('partnerMigrations.error.installation', { value });
  return value;
}

function clientOption(values: Invocation['values']): string {
  const value = requireOption(values, 'client');
  if (value.length > 191) throw usageError('partnerMigrations.error.client', { value });
  return value;
}

function scopeOf(values: Invocation['values']): Scope {
  return { installation_id: installationOption(values), external_client_id: clientOption(values) };
}

function limitOption(values: Invocation['values']): number | undefined {
  const limit = optInteger(values, 'limit');
  if (limit !== undefined && (limit < 1 || limit > PAGE_SIZE))
    throw usageError('partnerMigrations.error.limit', { max: PAGE_SIZE });
  return limit;
}

/** A value as one shell word, so the printed command can be copied as is. */
function shellWord(value: string): string {
  if (/^[A-Za-z0-9._:@/+=-]+$/.test(value)) return value;
  return `'${value.split("'").join(`'\\''`)}'`;
}

function scopeArgs(scope: Scope): string {
  return `--installation ${scope.installation_id} --client ${shellWord(scope.external_client_id)}`;
}

/** A command on one request, ready to copy. */
function requestCommand(verb: string, uuid: string, scope: Scope, extra = ''): string {
  return `bladecp partner migrations ${verb} ${uuid} ${scopeArgs(scope)}${extra}`;
}

// --------------------------------------------------------------- API calls

/**
 * Calls a partner route. A key that is not a partner's gets `partner_only`;
 * a refusal the API names with a code gets a line on what to do.
 */
async function call(
  api: BladecpApi,
  id: OperationId,
  options: Parameters<BladecpApi['request']>[1],
): Promise<unknown> {
  try {
    return await partnerOnly(api, () => api.request(id, options));
  } catch (error) {
    if (error instanceof ApiError && error.apiCode && !error.extraHint) {
      const key = REFUSALS[error.apiCode];
      // The billing link names no client of the request, so its not-found has nothing to check.
      const unscoped = id === 'postMigrationsByRequestUuidBilling-link' && error.status === 404;
      if (key && !unscoped) error.extraHint = { key };
    }
    throw error;
  }
}

/** A change to one request: the request in the path, the body, a replay-safe key. */
function change(api: BladecpApi, id: OperationId, uuid: string, body: Json): Promise<unknown> {
  return call(api, id, {
    params: { requestUuid: uuid },
    body,
    idempotencyKey: randomUUID(),
  });
}

const REFUSALS: Record<string, MessageKey> = {
  MIGRATION_REQUEST_NOT_FOUND: 'partnerMigrations.refused.notFound',
  MIGRATION_PAYMENT_REQUIRED: 'partnerMigrations.refused.payment',
  MIGRATION_APPROVAL_NOT_ALLOWED: 'partnerMigrations.refused.approval',
  MIGRATION_CANCEL_NOT_ALLOWED: 'partnerMigrations.refused.cancel',
  MIGRATION_BILLING_LINK_CONFLICT: 'partnerMigrations.refused.linkConflict',
  MIGRATION_NOT_LINKABLE: 'partnerMigrations.refused.notLinkable',
  MIGRATION_CLAIM_NOT_REQUIRED: 'partnerMigrations.refused.claimNotRequired',
  MIGRATION_CLAIM_NOT_ALLOWED: 'partnerMigrations.refused.claimNotAllowed',
  MIGRATION_CLAIM_URL_UNAVAILABLE: 'partnerMigrations.refused.claimUnavailable',
};

async function getRequest(api: BladecpApi, uuid: string, scope: Scope): Promise<PartnerRequest> {
  const body = await call(api, 'getMigrationsByRequestUuid', {
    params: { requestUuid: uuid },
    query: { ...scope },
  });
  return checkRequest(dataObject(body));
}

/** The request for a question: it only adds detail, so most failures leave it out. */
async function peekRequest(
  api: BladecpApi,
  uuid: string,
  scope: Scope,
): Promise<PartnerRequest | null> {
  try {
    return await getRequest(api, uuid, scope);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 401 || error.status === 404) throw error;
    return null;
  }
}

interface Page<T> {
  items: T[];
  next: string | null;
}

function cursorOf(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidResponse();
  return value;
}

async function requestPage(
  api: BladecpApi,
  query: { installation_id: string; external_client_id?: string | undefined },
  limit: number | undefined,
  after: string | undefined,
): Promise<Page<PartnerRequest>> {
  const data = dataObject(await call(api, 'getMigrations', { query: { ...query, limit, after } }));
  if (!Array.isArray(data.items)) throw invalidResponse();
  return { items: data.items.map(checkRequest), next: cursorOf(data.nextCursor) };
}

async function queuePage(
  api: BladecpApi,
  limit: number | undefined,
  cursor: string | undefined,
): Promise<Page<QueueItem>> {
  const data = dataObject(
    await call(api, 'getMigrationsBilling-queue', { query: { limit, cursor } }),
  );
  if (!Array.isArray(data.items)) throw invalidResponse();
  return { items: data.items.map(checkQueueItem), next: cursorOf(data.next_cursor) };
}

/** Page after page, up to `pages`; `next` stays set when there is more. */
async function pages<T>(
  read: (cursor: string | undefined) => Promise<Page<T>>,
  max: number,
): Promise<Page<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < max; page += 1) {
    const result = await read(cursor);
    items.push(...result.items);
    if (!result.next || seen.has(result.next)) return { items, next: null };
    seen.add(result.next);
    cursor = result.next;
  }
  return { items, next: cursor ?? null };
}

/**
 * A whole request UUID, or the first characters of one (at least 4) when
 * they match a single request of the listing. Anything else is a usage error.
 */
async function requestId(
  value: string,
  list: () => Promise<Page<{ uuid: string }>>,
): Promise<string> {
  const id = value.trim();
  if (UUID.test(id)) return id;
  if (!isIdPrefix(id)) throw usageError('error.invalidUuid', { value });
  return resolveId(id, async () => {
    const found = await list();
    if (found.next) throw usageError('partnerMigrations.error.wholeId', { value });
    return found.items;
  });
}

/** A request of one installation and client (short IDs read their requests). */
function scopedRequestId(api: BladecpApi, value: string, scope: Scope): Promise<string> {
  return requestId(value, async () => {
    const found = await pages(
      (cursor) => requestPage(api, scope, PAGE_SIZE, cursor),
      RESOLVE_PAGES,
    );
    return { items: found.items.map((r) => ({ uuid: r.requestUuid })), next: found.next };
  });
}

// ------------------------------------------------------------ words, tones

/** What holds a request before the migration may go on: the billing link. */
function holdOf(r: PartnerRequest): 'billing' | 'claim' | null {
  if (isEnded(r.migration.phase)) return null;
  const status = r.billing_link?.status;
  if (status === 'claim_required') return 'claim';
  if (status === 'pending' || r.waiting_reason === 'waiting_for_provider') return 'billing';
  return null;
}

function requestPhase(r: PartnerRequest, t: Translator): string {
  const hold = holdOf(r);
  if (hold === 'claim') return t('partnerMigrations.phase.claim');
  if (hold === 'billing') return t('partnerMigrations.phase.billing');
  return migrationPhaseLabel(r.migration, t);
}

function requestTone(r: PartnerRequest): Tone {
  return holdOf(r) ? 'warn' : phaseTone(r.migration);
}

/** Waits for someone (the partner, the client or the account holder). */
function needsAction(r: PartnerRequest): boolean {
  return requestTone(r) === 'warn';
}

/** The mark of a phase, as in `bladecp migrations list`. */
function phaseGlyph(k: Kit, tone: Tone): string {
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

function domainOf(r: PartnerRequest): string | null {
  return discoveredDomain(asMigration(r));
}

const STATE_KEYS: Record<string, MessageKey> = {
  awaiting_payment: 'partnerMigrations.state.awaiting_payment',
  ready: 'partnerMigrations.state.ready',
  paid: 'partnerMigrations.state.paid',
  payment_due: 'partnerMigrations.state.payment_due',
  trial_active: 'partnerMigrations.state.trial_active',
  suspension_pending: 'partnerMigrations.state.suspension_pending',
  suspended: 'partnerMigrations.state.suspended',
  termination_pending: 'partnerMigrations.state.termination_pending',
  terminated: 'partnerMigrations.state.terminated',
  regularized: 'partnerMigrations.state.regularized',
  regular: 'partnerMigrations.state.regularized',
};

const LINK_KEYS: Record<string, MessageKey> = {
  pending: 'partnerMigrations.link.pending',
  claim_required: 'partnerMigrations.link.claim',
  linked: 'partnerMigrations.link.linked',
};

/** How the client pays: in words for the details, short for a table column. */
function modeLabel(
  mode: string | undefined,
  days: number | null | undefined,
  t: Translator,
  short = false,
): string {
  if (mode === 'payment_before')
    return t(short ? 'partnerMigrations.mode.beforeShort' : 'partnerMigrations.mode.before');
  if (mode === 'payment_after')
    return t(short ? 'partnerMigrations.mode.afterShort' : 'partnerMigrations.mode.after');
  if (mode === 'trial') {
    return typeof days === 'number' && days > 0
      ? t('partnerMigrations.mode.trialDays', { days })
      : t('partnerMigrations.mode.trial');
  }
  return mode ? safeText(mode) : '-';
}

/** Payment is still missing before the approval (a trial approves without it). */
function paymentPending(r: PartnerRequest): boolean {
  const mode = r.commercial?.policy?.mode;
  const state = r.commercial?.state;
  return mode !== undefined && mode !== 'trial' && state !== 'paid' && state !== 'regularized';
}

const RETRY_REASONS: Record<string, MessageKey> = {
  attempt_used: 'partnerMigrations.retryReason.attempt_used',
  backup_unavailable: 'partnerMigrations.retryReason.backup_unavailable',
  discovery_review_expired: 'partnerMigrations.retryReason.discovery_review_expired',
  destination_needs_review: 'retryReason.destination_needs_review',
  not_failed: 'retryReason.not_failed',
};

/** What can be done next with a request, in words and as a command. */
function nextSteps(r: PartnerRequest, scope: Scope, t: Translator): Next[] {
  const uuid = r.requestUuid;
  const watch = {
    text: t('status.hintWatch'),
    command: requestCommand('show', uuid, scope, ' --watch'),
  };
  const hold = holdOf(r);
  if (hold === 'claim')
    return [
      {
        text: t('partnerMigrations.next.claim'),
        command: requestCommand('claim-url', uuid, scope),
      },
    ];
  if (hold === 'billing')
    return [
      {
        text: t('partnerMigrations.next.billing'),
        command: 'bladecp partner migrations billing-queue',
      },
    ];
  switch (r.migration.phase) {
    case 'draft':
    case 'uploading':
      return [{ text: t('partnerMigrations.next.upload') }];
    case 'discovery_review':
      if (r.migration.primaryDomain) return [watch];
      return [
        {
          text: t('outcome.reviewRequired'),
          command: requestCommand(
            'review',
            uuid,
            scope,
            ` --domain ${domainOf(r) ?? 'example.com'}`,
          ),
        },
      ];
    case 'awaiting_approval':
      if (r.actions?.approve === false) {
        return paymentPending(r) ? [{ text: t('partnerMigrations.next.payment') }] : [];
      }
      return [{ text: t('outcome.approveHint'), command: requestCommand('approve', uuid, scope) }];
    case 'failed': {
      if (r.retry?.allowed)
        return [{ text: t('outcome.retryHint'), command: requestCommand('retry', uuid, scope) }];
      const key = r.retry?.reason ? RETRY_REASONS[r.retry.reason] : undefined;
      return key ? [{ text: t(key) }] : [];
    }
    case 'cutover_pending':
    case 'cutover_stalled':
    case 'live':
    case 'cancelled':
      return [];
    default:
      return [watch];
  }
}

/** The billing side of a request: the link to the billing WHMCS and the payment. */
function billingRows(ctx: Ctx, r: PartnerRequest): [string, string][] {
  const t = ctx.out.t;
  const rows: [string, string][] = [];
  const link = r.billing_link;
  if (link?.status && link.status !== 'not_required') {
    const key = LINK_KEYS[link.status];
    rows.push([t('partnerMigrations.label.link'), key ? t(key) : safeText(link.status)]);
  }
  const commercial = r.commercial;
  if (commercial?.policy?.mode)
    rows.push([
      t('partnerMigrations.label.mode'),
      modeLabel(commercial.policy.mode, commercial.policy.trialDays, t),
    ]);
  if (commercial?.state) {
    const key = STATE_KEYS[commercial.state];
    rows.push([t('partnerMigrations.label.payment'), key ? t(key) : safeText(commercial.state)]);
  }
  const service = commercial?.externalServiceId ?? link?.whmcs_service_id;
  if (service) rows.push([t('partnerMigrations.label.service'), safeText(service)]);
  if (commercial?.dueAt)
    rows.push([t('partnerMigrations.label.due'), formatDate(commercial.dueAt, ctx.lang)]);
  return rows;
}

/** The optional domain step of a complete migration. */
function domainRows(ctx: Ctx, r: PartnerRequest, join: string): [string, string][] {
  const phase = r.migration.phase;
  if (phase !== 'cutover_pending' && phase !== 'cutover_stalled') return [];
  const t = ctx.out.t;
  const rows: [string, string][] = [];
  if (r.migration.primaryDomain)
    rows.push([t('label.domain'), safeText(r.migration.primaryDomain)]);
  const nameservers = nameserversFor(ctx.apiUrl);
  if (nameservers.length > 0) rows.push([t('label.nameservers'), nameservers.join(join)]);
  const target = typeof r.migration.cutoverTarget === 'string' ? r.migration.cutoverTarget : '';
  if (target.trim()) rows.push([t('label.aRecord'), safeText(target.trim())]);
  return rows;
}

function domainNotes(r: PartnerRequest, t: Translator): string[] {
  const phase = r.migration.phase;
  if (phase !== 'cutover_pending' && phase !== 'cutover_stalled') return [];
  return [
    t('partnerMigrations.pointDomain'),
    ...(phase === 'cutover_stalled' ? [t('partnerMigrations.checkEnded')] : []),
  ];
}

// ---------------------------------------------------------------- screens

function printRequest(ctx: Ctx, r: PartnerRequest, scope: Scope): void {
  const t = ctx.out.t;
  const m = asMigration(r);
  const domain = domainOf(r);
  const client = r.externalClientId ?? scope.external_client_id;
  const installation = r.installationId ?? scope.installation_id;
  const plan =
    typeof r.partnerPlanId === 'number' && typeof r.locationId === 'number'
      ? t('partnerMigrations.planValue', { plan: r.partnerPlanId, location: r.locationId })
      : null;
  const hints = nextSteps(r, scope, t);
  const billing = billingRows(ctx, r);
  const staging = r.migration.stagingUrl ?? null;
  const created = r.migration.createdAt;
  const notes = domainNotes(r, t);

  if (!ctx.out.rich) {
    const k = kit(ctx.out, 'out');
    const rows: [string, string][] = [
      [t('partnerMigrations.label.request'), safeText(r.requestUuid)],
      [t('label.phase'), requestPhase(r, t)],
      [t('label.domain'), safeText(domain ?? '-')],
      [t('partnerMigrations.label.client'), safeText(client)],
      [t('partnerMigrations.label.installation'), safeText(installation)],
    ];
    if (plan) rows.push([t('partnerMigrations.label.plan'), plan]);
    if (staging) rows.push([t('label.preview'), safeText(staging)]);
    if (created) rows.push([t('label.created'), formatDate(created, ctx.lang)]);
    ctx.out.lines(k.plainRows(rows));
    const absent = absentComponents(m);
    const components = r.migration.components ?? [];
    if (components.length > 0) {
      ctx.out.print();
      for (const c of components) {
        ctx.out.print(
          `  ${componentLabel(c.name, t)}: ${componentStatusLabel(c.status, t, m.phase, absent.has(c.name))}`,
        );
      }
    }
    for (const [title, section] of [
      [t('partnerMigrations.section.billing'), billing],
      [t('label.domain'), domainRows(ctx, r, ', ')],
    ] as const) {
      if (section.length === 0) continue;
      ctx.out.print();
      ctx.out.print(title);
      ctx.out.lines(k.plainRows(section, 2));
    }
    if (hints.length > 0 || notes.length > 0) ctx.out.print();
    for (const note of notes) ctx.out.print(note);
    for (const hint of hints) {
      ctx.out.print(hint.text);
      if (hint.command) ctx.out.print(`  ${safeText(hint.command)}`);
    }
    return;
  }

  const k = kit(ctx.out, 'out');
  const rows: [string, string][] = [
    [t('label.id'), safeText(r.requestUuid)],
    [t('partnerMigrations.label.client'), safeText(client)],
    [t('partnerMigrations.label.installation'), safeText(installation)],
  ];
  if (plan) rows.push([t('partnerMigrations.label.plan'), plan]);
  if (staging) rows.push([t('label.preview'), k.link(staging, k.accent(safeText(staging)))]);
  if (created) rows.push([t('label.created'), formatDate(created, ctx.lang)]);
  const lines = [
    '',
    `  ${k.bold(safeText(domain ?? r.requestUuid))}   ${phaseGlyph(k, requestTone(r))} ${requestPhase(r, t)}`,
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
  if (billing.length > 0)
    lines.push('', `  ${k.ruler(t('partnerMigrations.section.billing'))}`, ...k.rows(billing));
  const pointing = domainRows(ctx, r, k.muted(' · '));
  if (pointing.length > 0) {
    lines.push(
      '',
      `  ${k.ruler(`${t('label.domain')} ${k.muted(`(${t('outcome.optional')})`)}`)}`,
      ...k.rows(pointing),
    );
    for (const note of notes) lines.push(...k.wrap(note, k.width, '  ').map((l) => k.muted(l)));
  }
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

// ------------------------------------------------------------------- watch

function changeKey(r: PartnerRequest): string {
  const m = r.migration;
  const components = (m.components ?? []).map((c) => `${c.name}:${c.status}`).join(',');
  return [
    m.phase,
    m.primaryDomain ?? '',
    components,
    m.stagingUrl ?? '',
    r.billing_link?.status ?? '',
    r.commercial?.state ?? '',
  ].join('|');
}

function clock(now: number): string {
  const d = new Date(now);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/**
 * Where a watch stops: when the request needs someone (the approval, the
 * domain, the backup, the billing link) or has ended. Null keeps watching.
 */
function stopCode(r: PartnerRequest): ExitCodeValue | null {
  const phase = r.migration.phase;
  if (phase === 'failed' || phase === 'cancelled') return ExitCode.MIGRATION_FAILED;
  if (phase === 'live' || phase === 'cutover_pending' || phase === 'cutover_stalled')
    return ExitCode.OK;
  if (phase === 'awaiting_approval') return ExitCode.OK;
  if (holdOf(r)) return ExitCode.ACTION_REQUIRED;
  if (phase === 'draft' || phase === 'uploading') return ExitCode.ACTION_REQUIRED;
  if (phase === 'discovery_review' && !r.migration.primaryDomain) return ExitCode.ACTION_REQUIRED;
  return null;
}

async function watchRequest(
  ctx: Ctx,
  api: BladecpApi,
  uuid: string,
  scope: Scope,
): Promise<{ request: PartnerRequest; exitCode: ExitCodeValue }> {
  const t = ctx.out.t;
  const base = ctx.pollIntervalMs ?? 5000;
  const live = !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr;
  const rail = live ? new PhaseRail(ctx, uuid) : null;
  if (rail) ctx.out.info(rail.header());
  else if (!ctx.json) ctx.out.info(t('follow.watching'));
  let lastKey = '';
  let unchanged = 0;
  let failures = 0;
  let frame = 0;
  for (;;) {
    let r: PartnerRequest;
    try {
      r = await getRequest(api, uuid, scope);
      failures = 0;
      if (rail) rail.note = null;
    } catch (error) {
      const transient =
        error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
      if (transient && failures < MAX_TRANSIENT_FAILURES) {
        failures += 1;
        if (rail) {
          rail.note = t('follow.reconnectingTry', {
            attempt: failures,
            of: MAX_TRANSIENT_FAILURES,
          });
          rail.draw(frame);
        } else if (!ctx.json) ctx.out.info(t('follow.reconnecting'));
        await ctx.sleep(base * 2, ctx.signal);
        continue;
      }
      if (rail) ctx.out.clearLiveLine();
      throw error;
    }
    rail?.update(asMigration(r));
    const key = changeKey(r);
    if (key !== lastKey) {
      lastKey = key;
      unchanged = 0;
      if (ctx.json) ctx.out.emitJsonLine({ ok: true, data: r });
      else if (!rail) ctx.out.info(`${clock(ctx.now())}  ${requestPhase(r, t)}`);
    } else {
      unchanged += 1;
    }
    const stop = stopCode(r);
    if (stop !== null) {
      rail?.finish();
      return { request: r, exitCode: stop };
    }
    // Slower while nothing changes, as `bladecp migrations status --watch`.
    const delay = unchanged >= 60 ? base * 3 : unchanged >= 12 ? base * 2 : base;
    if (rail) {
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
      await ctx.sleep(delay, ctx.signal);
    }
  }
}

// ---------------------------------------------------------------- commands

async function listCommand(ctx: Ctx, { values }: Invocation): Promise<number> {
  const installation = installationOption(values);
  const rawClient = optString(values, 'client');
  const client = rawClient === undefined ? undefined : clientOption(values);
  const limit = limitOption(values);
  const all = optFlag(values, 'all');
  const api = await signedInApi(ctx);
  const query = { installation_id: installation, external_client_id: client };
  const page = all
    ? await pages((cursor) => requestPage(api, query, limit ?? PAGE_SIZE, cursor), ALL_PAGES)
    : await requestPage(api, query, limit, undefined);
  if (ctx.json) return emitData(ctx, { items: page.items, nextCursor: page.next });

  const t = ctx.out.t;
  const items = page.items;
  const ids = shortIds(items.map((r) => r.requestUuid));
  const waiting = items.filter(needsAction).length;
  const showOne = `bladecp partner migrations show <request> --installation ${installation} --client ${client === undefined ? '<id>' : shellWord(client)}`;
  showList(ctx.out, {
    items,
    columns: [
      {
        header: t('column.id'),
        value: (r) => ids.get(r.requestUuid) ?? r.requestUuid,
        plain: (r) => r.requestUuid,
        paint: (k, text) => k.violet(text),
        priority: 5,
      },
      {
        header: t('column.domain'),
        value: (r) => domainOf(r) ?? '-',
        priority: 4,
        flex: true,
        // The domain is what people recognize: the phase is cut first.
        min: 16,
      },
      ...(client === undefined
        ? [
            {
              header: t('partnerMigrations.column.client'),
              value: (r: PartnerRequest) => r.externalClientId ?? '-',
              priority: 2,
            },
          ]
        : []),
      {
        header: t('column.phase'),
        value: (r) => `* ${requestPhase(r, t)}`,
        plain: (r) => requestPhase(r, t),
        paint: (k, text, r) => `${phaseGlyph(k, requestTone(r))}${text.slice(1)}`,
        priority: 3,
        flex: true,
        min: 14,
      },
      {
        header: t('column.created'),
        value: (r) => formatDate(r.migration.createdAt, ctx.lang),
        paint: (k, text) => k.muted(text),
        priority: 1,
      },
    ],
    empty: t(
      client === undefined
        ? 'partnerMigrations.list.emptyInstallation'
        : 'partnerMigrations.list.empty',
    ),
    summary: [
      t(
        items.length === 1 ? 'partnerMigrations.list.countOne' : 'partnerMigrations.list.countMany',
        {
          count: items.length,
        },
      ),
      ...(waiting > 0
        ? [
            t(
              waiting === 1 ? 'partnerMigrations.list.actionOne' : 'partnerMigrations.list.action',
              {
                count: waiting,
              },
            ),
          ]
        : []),
    ].join(' · '),
    notes: page.next ? [t('partnerMigrations.list.more')] : [],
    next: items.length > 0 ? [{ text: t('partnerMigrations.list.hint'), command: showOne }] : [],
  });
  return ExitCode.OK;
}

async function showCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const watch = optFlag(values, 'watch');
  // `--watch --json` is one JSON document per line, errors included.
  if (watch && ctx.json) ctx.out.ndjson = true;
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  if (!watch) {
    const r = await getRequest(api, uuid, scope);
    if (ctx.json) return emitData(ctx, r);
    printRequest(ctx, r, scope);
    return ExitCode.OK;
  }
  const result = await watchRequest(ctx, api, uuid, scope);
  if (!ctx.json) printRequest(ctx, result.request, scope);
  return result.exitCode;
}

function phaseOf(body: unknown): string {
  const data = dataObject(body);
  if (typeof data.phase !== 'string') throw invalidResponse();
  return data.phase;
}

async function reviewCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const domain = normalizeDomain(requireOption(values, 'domain'));
  if (!isValidDomain(domain)) {
    throw new CliError(
      'review.invalidDomain',
      {},
      { exitCode: ExitCode.USAGE, code: 'invalid_domain' },
    );
  }
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  const phase = phaseOf(
    await change(api, 'postMigrationsByRequestUuidDiscovery-review', uuid, {
      ...scope,
      primaryDomain: domain,
    }),
  );
  if (ctx.json) return emitData(ctx, { requestUuid: uuid, phase, primaryDomain: domain });
  const t = ctx.out.t;
  showDone(ctx.out, {
    text: t('review.sent', { domain }),
    next: [
      { text: t('status.hintWatch'), command: requestCommand('show', uuid, scope, ' --watch') },
    ],
  });
  return ExitCode.OK;
}

/** The lines under a question about one request: which one, where it is. */
function aboutLines(r: PartnerRequest | null, uuid: string, t: Translator): string[] {
  return r ? [`${safeText(uuid.slice(0, 8))} · ${requestPhase(r, t)}`] : [];
}

async function approveCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const yes = optFlag(values, 'yes');
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  const t = ctx.out.t;
  const r = ctx.interactive && !yes ? await peekRequest(api, uuid, scope) : null;
  const domain = r ? domainOf(r) : null;
  const staging = r?.migration.stagingUrl;
  const { go, asked } = await confirmAction(ctx, {
    question: domain ? t('approve.confirm', { domain }) : t('approve.confirmNoDomain'),
    detail: [
      ...aboutLines(r, uuid, t),
      ...(staging ? [t('outcome.preview', { url: staging })] : []),
      t('partnerMigrations.approve.detail'),
    ],
    yes,
    defaultYes: true,
  });
  if (!go) {
    showDone(ctx.out, { text: t('migrate.declined'), tone: 'faint', afterQuestion: asked });
    return ExitCode.OK;
  }
  const phase = phaseOf(
    await change(api, 'postMigrationsByRequestUuidApprove', uuid, { ...scope }),
  );
  if (ctx.json) return emitData(ctx, { requestUuid: uuid, phase });
  showDone(ctx.out, {
    text: t('approve.done'),
    next: [
      { text: t('status.hintWatch'), command: requestCommand('show', uuid, scope, ' --watch') },
    ],
    afterQuestion: asked,
  });
  return ExitCode.OK;
}

async function cancelCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const reason = optString(values, 'reason')?.trim();
  if (reason && reason.length > 2000)
    throw usageError('partnerMigrations.error.reason', { max: 2000 });
  const yes = optFlag(values, 'yes');
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  const t = ctx.out.t;
  const r = ctx.interactive && !yes ? await peekRequest(api, uuid, scope) : null;
  const domain = r ? domainOf(r) : null;
  const { go, asked } = await confirmAction(ctx, {
    question: domain ? t('cancel.confirm', { domain }) : t('cancel.confirmNoDomain'),
    detail: [...aboutLines(r, uuid, t), t('cancel.detail')],
    yes,
    defaultYes: false,
  });
  if (!go) {
    showDone(ctx.out, { text: t('migrate.declined'), tone: 'faint', afterQuestion: asked });
    return ExitCode.OK;
  }
  const phase = phaseOf(
    await change(api, 'postMigrationsByRequestUuidCancel', uuid, {
      ...scope,
      ...(reason ? { reason } : {}),
    }),
  );
  if (ctx.json) return emitData(ctx, { requestUuid: uuid, phase });
  showDone(ctx.out, { text: t('cancel.done'), tone: 'faint', afterQuestion: asked });
  return ExitCode.OK;
}

async function retryCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  let body: unknown;
  try {
    body = await change(api, 'postMigrationsByRequestUuidRetry', uuid, { ...scope });
  } catch (error) {
    // Say why: the request itself knows the reason a new attempt is refused.
    if (error instanceof ApiError && error.apiCode === 'MIGRATION_RETRY_UNAVAILABLE') {
      const r = await getRequest(api, uuid, scope).catch(() => null);
      const reason = r?.retry?.reason ?? null;
      if (reason && RETRY_REASONS[reason]) {
        error.extraHint = { key: RETRY_REASONS[reason] };
        error.extraDetails = { retryReason: reason };
      }
    }
    throw error;
  }
  const data = dataObject(body);
  const migration = data.migration;
  if (!isRecord(migration) || typeof migration.phase !== 'string') throw invalidResponse();
  const requestUuid =
    typeof data.requestUuid === 'string' && data.requestUuid ? data.requestUuid : uuid;
  if (ctx.json) return emitData(ctx, { requestUuid, phase: migration.phase });
  const t = ctx.out.t;
  showDone(ctx.out, {
    text: t('partnerMigrations.retry.done'),
    next: [
      {
        text: t('status.hintWatch'),
        command: requestCommand('show', requestUuid, scope, ' --watch'),
      },
    ],
  });
  return ExitCode.OK;
}

async function queueCommand(ctx: Ctx, { values }: Invocation): Promise<number> {
  const limit = limitOption(values);
  const all = optFlag(values, 'all');
  const api = await signedInApi(ctx);
  const page = all
    ? await pages((cursor) => queuePage(api, limit ?? PAGE_SIZE, cursor), ALL_PAGES)
    : await queuePage(api, limit, undefined);
  if (ctx.json) return emitData(ctx, { items: page.items, next_cursor: page.next });
  const t = ctx.out.t;
  const items = page.items;
  const ids = shortIds(items.map((item) => item.request_uuid));
  showList(ctx.out, {
    items,
    columns: [
      {
        header: t('column.id'),
        value: (item) => ids.get(item.request_uuid) ?? item.request_uuid,
        plain: (item) => item.request_uuid,
        paint: (k, text) => k.violet(text),
        priority: 6,
      },
      {
        header: t('column.domain'),
        value: (item) => item.source?.domain ?? '-',
        priority: 5,
        flex: true,
        min: 16,
      },
      {
        header: t('partnerMigrations.column.account'),
        value: (item) => item.source?.username ?? '-',
        priority: 4,
        flex: true,
        min: 8,
      },
      {
        header: t('partnerMigrations.column.mode'),
        value: (item) => modeLabel(item.commercial?.mode, item.commercial?.trial_days, t, true),
        priority: 3,
      },
      {
        header: t('column.created'),
        value: (item) => formatDate(item.created_at, ctx.lang),
        paint: (k, text) => k.muted(text),
        priority: 2,
      },
      {
        header: t('partnerMigrations.column.server'),
        value: (item) => item.source?.server_hostname ?? '-',
        paint: (k, text) => k.muted(text),
        priority: 1,
        flex: true,
        min: 12,
      },
    ],
    empty: t('partnerMigrations.queue.empty'),
    summary: t(
      items.length === 1 ? 'partnerMigrations.queue.countOne' : 'partnerMigrations.queue.countMany',
      { count: items.length },
    ),
    notes: page.next ? [t('partnerMigrations.list.more')] : [],
    next:
      items.length > 0
        ? [
            {
              text: t('partnerMigrations.queue.hint'),
              command:
                'bladecp partner migrations billing-link <request> --installation <id> --client <id> --external-id <service> --email <email> --name <name>',
            },
          ]
        : [],
  });
  return ExitCode.OK;
}

/** The contact of the WHMCS client: the first word is the first name, the rest the last name. */
function ownerOf(values: Invocation['values']): Json {
  const email = requireOption(values, 'email');
  if (email.length > 254 || !EMAIL.test(email))
    throw usageError('partnerMigrations.error.email', { value: email });
  const name = requireOption(values, 'name');
  const [first = '', ...rest] = name.split(/\s+/);
  const last = rest.join(' ');
  if (first.length > 100 || last.length > 100)
    throw usageError('partnerMigrations.error.name', { max: 100 });
  const company = optString(values, 'company')?.trim();
  if (company && company.length > 150)
    throw usageError('partnerMigrations.error.company', { max: 150 });
  return {
    email,
    first_name: first,
    last_name: last,
    ...(company ? { company_name: company } : {}),
  };
}

function nativeId(values: Invocation['values'], name: 'client' | 'external-id'): string {
  const value = requireOption(values, name);
  if (!NATIVE_ID.test(value))
    throw usageError('partnerMigrations.error.nativeId', { option: `--${name}`, value });
  return value;
}

async function linkCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const installation = installationOption(values);
  const client = nativeId(values, 'client');
  const service = nativeId(values, 'external-id');
  const owner = ownerOf(values);
  const yes = optFlag(values, 'yes');
  const api = await signedInApi(ctx);
  // The request is not linked yet, so only the billing queue knows it.
  let queue: QueueItem[] | null = null;
  const readQueue = async () => {
    const found = await pages((cursor) => queuePage(api, PAGE_SIZE, cursor), RESOLVE_PAGES);
    queue = found.items;
    return found;
  };
  const uuid = await requestId(args[0]!, async () => {
    const found = await readQueue();
    return { items: found.items.map((item) => ({ uuid: item.request_uuid })), next: found.next };
  });
  const t = ctx.out.t;
  if (ctx.interactive && !yes && queue === null) {
    await readQueue().catch((error: unknown) => {
      if (!(error instanceof ApiError) || error.status === 401) throw error;
    });
  }
  const item = (queue as QueueItem[] | null)?.find((entry) => entry.request_uuid === uuid);
  const domain = item?.source?.domain;
  const { go, asked } = await confirmAction(ctx, {
    question: domain
      ? t('partnerMigrations.link.confirm', { domain, service })
      : t('partnerMigrations.link.confirmNoDomain', { service }),
    detail: [
      t('partnerMigrations.link.detailOwner', { client, email: String(owner.email) }),
      t('partnerMigrations.link.detail'),
    ],
    yes,
    defaultYes: false,
  });
  if (!go) {
    showDone(ctx.out, { text: t('migrate.declined'), tone: 'faint', afterQuestion: asked });
    return ExitCode.OK;
  }
  const r = checkRequest(
    dataObject(
      await change(api, 'postMigrationsByRequestUuidBilling-link', uuid, {
        installation_id: installation,
        whmcs_client_id: client,
        whmcs_service_id: service,
        owner,
      }),
    ),
  );
  if (ctx.json) return emitData(ctx, r);
  // The answer is the request as the billing installation sees it.
  const scope = {
    installation_id: r.installationId ?? installation,
    external_client_id: r.externalClientId ?? client,
  };
  showDone(ctx.out, {
    text: t('partnerMigrations.link.done', { service }),
    next: [
      {
        text: t('status.hintWatch'),
        command: requestCommand('show', r.requestUuid, scope, ' --watch'),
      },
    ],
    afterQuestion: asked,
  });
  return ExitCode.OK;
}

async function claimCommand(ctx: Ctx, { args, values }: Invocation): Promise<number> {
  const scope = scopeOf(values);
  const api = await signedInApi(ctx);
  const uuid = await scopedRequestId(api, args[0]!, scope);
  const data = dataObject(
    await change(api, 'postMigrationsByRequestUuidClaim-url', uuid, { ...scope }),
  );
  if (typeof data.url !== 'string' || data.url === '') throw invalidResponse();
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const expires = typeof data.expires_at === 'string' ? data.expires_at : null;
  showOnce(ctx.out, {
    label: t('partnerMigrations.claim.label'),
    value: data.url,
    note: expires
      ? t('partnerMigrations.claim.note', { date: formatDate(expires, ctx.lang) })
      : t('partnerMigrations.claim.noteNoDate'),
  });
  return ExitCode.OK;
}

export const handlers: Handlers = {
  'partner.migrations.list': listCommand,
  'partner.migrations.show': showCommand,
  'partner.migrations.review': reviewCommand,
  'partner.migrations.approve': approveCommand,
  'partner.migrations.cancel': cancelCommand,
  'partner.migrations.retry': retryCommand,
  'partner.migrations.billing-queue': queueCommand,
  'partner.migrations.billing-link': linkCommand,
  'partner.migrations.claim-url': claimCommand,
};
