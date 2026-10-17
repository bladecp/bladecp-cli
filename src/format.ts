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

/** Left-aligned text table with two spaces between columns. */
export function table(headers: string[], rows: string[][]): string {
  headers = headers.map(safeText);
  rows = rows.map((row) => row.map(safeText));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, index) => (index === cells.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join('  ')
      .trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
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

export function componentStatusLabel(status: string, t: Translator): string {
  const key = COMPONENT_STATUS_KEYS[status];
  return key ? t(key) : safeText(status);
}

const PRODUCT_NAMES: Record<string, string> = {
  'stack-container': 'Stack Container',
  'edge-cloud': 'Edge Cloud',
  'hyper-cloud': 'Hyper Cloud',
  dedicated: 'Dedicated',
  vibe: 'Vibe',
};

export function productLabel(type: string | null | undefined): string {
  if (!type) return '-';
  return PRODUCT_NAMES[type] ?? safeText(type);
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
