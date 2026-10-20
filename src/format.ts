import type { Lang, MessageKey, Translator } from './i18n/index.js';
import { safeText } from './sanitize.js';
import type { Migration } from './types.js';

export function formatBytes(bytes: number, lang: Lang): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const PHASE_KEYS: Record<string, MessageKey> = {
  draft: 'phase.draft',
  uploading: 'phase.uploading',
  queued: 'phase.queued',
  parsing: 'phase.parsing',
  discovery_review: 'phase.discovery_review',
  provisioning: 'phase.provisioning',
  importing: 'phase.importing',
  validating: 'phase.validating',
  awaiting_approval: 'phase.awaiting_approval',
  syncing: 'phase.syncing',
  cutover_pending: 'phase.cutover_pending',
  live: 'phase.live',
  failed: 'phase.failed',
  cancelled: 'phase.cancelled',
  cutover_stalled: 'phase.cutover_stalled',
};

export function phaseLabel(phase: string, t: Translator): string {
  const key = PHASE_KEYS[phase];
  return key ? t(key) : safeText(phase);
}

/**
 * In `discovery_review` the domain question is answered once `primaryDomain`
 * is set (the API stores the choice there, or at creation). The phase only
 * changes when BladeCP resumes the migration.
 */
export function reviewAnswered(m: Pick<Migration, 'phase' | 'primaryDomain'>): boolean {
  return m.phase === 'discovery_review' && Boolean(m.primaryDomain);
}

/** Phase label that tells "waiting for you" apart from "waiting for BladeCP". */
export function migrationPhaseLabel(
  m: Pick<Migration, 'phase' | 'primaryDomain'>,
  t: Translator,
): string {
  return reviewAnswered(m) ? t('phase.discovery_review_answered') : phaseLabel(m.phase, t);
}

const COMPONENT_KEYS: Record<string, MessageKey> = {
  files: 'component.files',
  database: 'component.database',
  email_accounts: 'component.email_accounts',
  email_history: 'component.email_history',
};

const COMPONENT_STATUS_KEYS: Record<string, MessageKey> = {
  pending: 'componentStatus.pending',
  running: 'componentStatus.running',
  completed: 'componentStatus.completed',
  failed: 'componentStatus.failed',
  skipped: 'componentStatus.skipped',
};

export function componentLabel(name: string, t: Translator): string {
  const key = COMPONENT_KEYS[name];
  return key ? t(key) : safeText(name);
}

/**
 * Status of a component. In a migration that failed or was cancelled, a
 * component that never started is "not run" and one that was running
 * "stopped", never "waiting".
 */
export function componentStatusLabel(
  status: string,
  t: Translator,
  phase?: string,
  absent = false,
): string {
  // The backup has none of it (for example no email accounts): never "waiting".
  if (absent && status !== 'completed' && status !== 'failed') return t('componentStatus.none');
  if (phase === 'failed' || phase === 'cancelled') {
    if (status === 'pending') return t('componentStatus.notRun');
    if (status === 'running') return t('componentStatus.stopped');
  }
  const key = COMPONENT_STATUS_KEYS[status];
  return key ? t(key) : safeText(status);
}

const SERVER_STATUS_KEYS: Record<string, MessageKey> = {
  active: 'serverStatus.active',
  pending: 'serverStatus.pending',
  provisioning: 'serverStatus.provisioning',
  suspended: 'serverStatus.suspended',
  failed: 'serverStatus.failed',
  deleted: 'serverStatus.deleted',
  terminated: 'serverStatus.terminated',
  cancelled: 'serverStatus.cancelled',
  deleting: 'serverStatus.deleting',
};

/** Translated server status; an unknown status is shown as the API sent it. */
export function serverStatusLabel(status: string, t: Translator): string {
  const key = SERVER_STATUS_KEYS[status];
  return key ? t(key) : safeText(status);
}

/** Status for a count of servers ("2 active", "2 ativos"). */
export function serverStatusCount(status: string, count: number, t: Translator): string {
  if (count === 1) return `1 ${serverStatusLabel(status, t)}`;
  const key = SERVER_STATUS_KEYS[status];
  return `${count} ${key ? t(key.replace('serverStatus.', 'serverStatusMany.') as MessageKey) : safeText(status)}`;
}

/** Servers that no longer exist are hidden from the list unless asked for. */
export function isGoneServer(status: string): boolean {
  return status === 'deleted' || status === 'terminated' || status === 'cancelled';
}

export type Tone = 'ok' | 'warn' | 'err' | 'faint' | 'violet';

export function serverTone(status: string): Tone {
  if (status === 'active') return 'ok';
  if (status === 'failed') return 'err';
  if (isGoneServer(status)) return 'faint';
  return 'warn';
}

/** How a migration phase reads in a list: needs you, running, done or stopped. */
export function phaseTone(m: Pick<Migration, 'phase' | 'primaryDomain'>): Tone {
  switch (m.phase) {
    case 'awaiting_approval':
    case 'draft':
    case 'uploading':
      return 'warn';
    case 'discovery_review':
      return reviewAnswered(m) ? 'violet' : 'warn';
    case 'cutover_pending':
    case 'cutover_stalled':
    case 'live':
      return 'ok';
    case 'failed':
      return 'err';
    case 'cancelled':
      return 'faint';
    default:
      return 'violet';
  }
}

/** Whether the migration waits for the person (approve, confirm a domain, finish the upload). */
export function needsYou(m: Pick<Migration, 'phase' | 'primaryDomain'>): boolean {
  return phaseTone(m) === 'warn';
}

/** Ended for good: nothing more will happen on BladeCP. */
export function isEnded(phase: string): boolean {
  return phase === 'failed' || phase === 'cancelled' || phase === 'live';
}

const PRODUCT_KEYS: Record<string, MessageKey> = {
  'stack-container': 'product.stackContainer',
  'edge-cloud': 'product.edgeCloud',
  'hyper-cloud': 'product.hyperCloud',
  dedicated: 'product.dedicated',
  vibe: 'product.vibe',
};

/** Product names are BladeCP brands; the catalog keeps them the same in every language. */
export function productLabel(type: string | null | undefined, t: Translator): string {
  if (!type) return '-';
  const key = PRODUCT_KEYS[type];
  return key ? t(key) : safeText(type);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shortest prefix (at least `min` characters) that tells each ID apart from
 * the others in the list. IDs that are not UUIDs are kept whole.
 */
export function shortIds(ids: string[], min = 8): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of ids) {
    if (!UUID.test(id)) {
      result.set(id, id);
      continue;
    }
    let length = min;
    while (
      length < id.length &&
      ids.some(
        (other) =>
          other !== id && other.toLowerCase().startsWith(id.slice(0, length).toLowerCase()),
      )
    ) {
      length += 1;
    }
    // Never end on a dash.
    while (id[length - 1] === '-' && length < id.length) length += 1;
    result.set(id, id.slice(0, length));
  }
  return result;
}

/** Path with the home folder written as `~`. */
export function tildePath(path: string, homedir: string): string {
  return homedir && path.startsWith(homedir) ? `~${path.slice(homedir.length)}` : path;
}

/** Same rule as the Hub migration wizard. */
export const DOMAIN_PATTERN =
  /^(?=.{1,63}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function isValidDomain(value: string): boolean {
  return DOMAIN_PATTERN.test(value);
}
