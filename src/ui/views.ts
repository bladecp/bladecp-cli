// Screens shared by the command groups: a list, the details of one thing, a
// finished action and a value shown once. Each one has the three layouts of
// the CLI: the Horizonte screen on a terminal, plain lines without one, and
// nothing at all with --json (the command emits its JSON instead).
//
// Values from the API are made terminal-safe here; labels and texts come
// translated from the command (catalog messages).

import type { Tone } from '../format.js';
import { safeText } from '../sanitize.js';
import { fitTable, type Kit, kit, type TableColumn } from './kit.js';
import type { Output } from './output.js';

export type { Tone };

/** What to do next: a line of text, and the command when there is one. */
export interface Next {
  text: string;
  command?: string;
}

export interface Column<T> {
  header: string;
  /** The value of the cell (from the API: made safe here). */
  value: (item: T) => string;
  /** The value in the plain layout, when it differs (a whole ID instead of a short one). */
  plain?: (item: T) => string;
  /** Paints the cell on a terminal (the text may arrive cut with an ellipsis). */
  paint?: (k: Kit, text: string, item: T) => string;
  /** Higher survives longer on a narrow terminal. */
  priority: number;
  flex?: boolean;
  min?: number;
  align?: 'left' | 'right';
}

export interface ListScreen<T> {
  items: T[];
  columns: Column<T>[];
  /** Shown instead of the table when there is nothing. */
  empty: string;
  /** A muted line under the table ("3 domains"). */
  summary?: string;
  notes?: string[];
  next?: Next[];
  /** Right after a question: no blank line before the table. */
  afterQuestion?: boolean;
}

export function paintTone(k: Kit, tone: Tone, text: string): string {
  return tone === 'ok'
    ? k.ok(text)
    : tone === 'warn'
      ? k.warn(text)
      : tone === 'err'
        ? k.err(text)
        : tone === 'violet'
          ? k.violet(text)
          : k.faint(text);
}

/** The glyph in front of a status: done, waiting, failed or gone. */
export function toneGlyph(k: Kit, tone: Tone): string {
  const glyph =
    tone === 'ok'
      ? k.glyph.bullet
      : tone === 'err'
        ? k.glyph.cross
        : tone === 'faint'
          ? k.glyph.ring
          : k.glyph.pending;
  return paintTone(k, tone, glyph);
}

/** A status cell: "● Active" with the glyph in the color of the tone. */
export function statusColumn<T>(
  header: string,
  label: (item: T) => string,
  tone: (item: T) => Tone,
  priority = 3,
): Column<T> {
  return {
    header,
    priority,
    value: (item) => `* ${label(item)}`,
    plain: (item) => label(item),
    paint: (k, text, item) => `${toneGlyph(k, tone(item))}${text.slice(1)}`,
  };
}

/**
 * How a status word reads, for the statuses the API uses across resources:
 * ok when working, warn while it changes, err when it failed, faint when gone.
 */
export function statusTone(status: string | null | undefined): Tone {
  const value = String(status ?? '').toLowerCase();
  if (
    /^(active|enabled|ready|available|succeeded|success|completed|complete|delivered|paid|installed|ok|healthy|up_to_date|verified)$/.test(
      value,
    )
  )
    return 'ok';
  // Suspended is reversible, so it reads amber (the last case), not red.
  if (/(fail|error|rejected|invalid|blocked|disabled|expired|overdue)/.test(value)) return 'err';
  if (/^(deleted|cancelled|canceled|terminated|removed|archived|inactive|void)$/.test(value))
    return 'faint';
  return 'warn';
}

function nextLines(k: Kit, next: Next[]): string[] {
  const lines: string[] = [];
  for (const line of next) {
    lines.push(...k.wrap(line.text, k.width - 4, '').map((part) => `  ${k.muted(part)}`));
    if (line.command)
      lines.push(`  ${k.violet(k.glyph.arrow)} ${k.accent(safeText(line.command))}`);
  }
  return lines;
}

function plainNext(out: Output, next: Next[] | undefined): void {
  for (const line of next ?? []) {
    out.print(line.text);
    if (line.command) out.print(`  ${safeText(line.command)}`);
  }
}

/** A table of things: adapts to the width, horizon under the header, summary below. */
export function showList<T>(out: Output, screen: ListScreen<T>): void {
  if (!out.rich) {
    if (screen.items.length === 0) out.print(screen.empty);
    else {
      out.print(
        kit(out, 'out').plainTable(
          screen.columns.map((c) => c.header),
          screen.items.map((item) => screen.columns.map((c) => (c.plain ?? c.value)(item))),
        ),
      );
    }
    for (const note of screen.notes ?? []) out.info(note);
    plainNext(out, screen.next);
    return;
  }
  const k = kit(out, 'out');
  const lead = screen.afterQuestion ? [] : [''];
  if (screen.items.length === 0) {
    out.lines([
      ...lead,
      `  ${k.faint(k.glyph.ring)}  ${screen.empty}`,
      ...(screen.next?.length ? ['', ...nextLines(k, screen.next)] : []),
    ]);
    return;
  }
  const columns: TableColumn[] = screen.columns.map((c) => ({
    header: c.header,
    priority: c.priority,
    ...(c.flex ? { flex: true } : {}),
    ...(c.min !== undefined ? { min: c.min } : {}),
    ...(c.align ? { align: c.align } : {}),
  }));
  const { header, body, width } = fitTable(
    k,
    columns,
    screen.items.map((item) =>
      screen.columns.map((c) => {
        const paint = c.paint;
        return {
          text: safeText(c.value(item)),
          ...(paint ? { paint: (text: string) => paint(k, text, item) } : {}),
        };
      }),
    ),
  );
  out.lines([
    ...lead,
    header,
    ` ${k.horizon(Math.min(width + 1, k.columns - 1), { at: 0.08, spread: 0.85, power: 1.2 })}`,
    ...body,
    ...(screen.summary || screen.notes?.length ? [''] : []),
    ...(screen.summary ? [`  ${k.muted(screen.summary)}`] : []),
    ...(screen.notes ?? []).flatMap((note) =>
      k.wrap(note, k.width - 4, '').map((part) => `  ${k.muted(part)}`),
    ),
    ...(screen.next?.length ? ['', ...nextLines(k, screen.next)] : []),
  ]);
}

/** A label (translated) and its value (from the API: made safe here). */
export type DetailRow = [label: string, value: string];

export interface DetailScreen {
  /** The name of the thing (a domain, a plan): from the API, made safe here. */
  title: string;
  /** The status beside the title; `label` heads it in the plain layout. */
  status?: { label: string; text: string; tone: Tone };
  rows: DetailRow[];
  sections?: { title: string; rows: DetailRow[] }[];
  notes?: string[];
  next?: Next[];
  /** Right after a question: the rail of the question continues, no blank line. */
  afterQuestion?: boolean;
}

/** The details of one thing: title and status, horizon, label and value rows, sections. */
export function showDetail(out: Output, screen: DetailScreen): void {
  const safeRows = (rows: DetailRow[]): [string, string][] =>
    rows.map(([label, value]) => [label, safeText(value)]);
  if (!out.rich) {
    const k = kit(out, 'out');
    const status: [string, string][] = screen.status
      ? [[screen.status.label, screen.status.text]]
      : [];
    out.lines(k.plainRows([...status, ...safeRows(screen.rows)]));
    for (const section of screen.sections ?? []) {
      if (section.rows.length === 0) continue;
      out.print();
      out.print(section.title);
      out.lines(k.plainRows(safeRows(section.rows), 2));
    }
    for (const note of screen.notes ?? []) out.info(note);
    plainNext(out, screen.next);
    return;
  }
  const k = kit(out, 'out');
  const lines = [
    ...(screen.afterQuestion ? [] : ['']),
    `  ${k.bold(safeText(screen.title))}${screen.status ? `   ${toneGlyph(k, screen.status.tone)} ${screen.status.text}` : ''}`,
    ` ${k.horizon(k.width, { at: 0.1, spread: 0.6 })}`,
    ...k.rows(safeRows(screen.rows)),
  ];
  for (const section of screen.sections ?? []) {
    if (section.rows.length === 0) continue;
    lines.push('', `  ${k.ruler(section.title)}`, ...k.rows(safeRows(section.rows)));
  }
  for (const note of screen.notes ?? []) {
    lines.push('', ...k.wrap(note, k.width - 4, '').map((part) => `  ${k.muted(part)}`));
  }
  if (screen.next?.length) lines.push('', ...nextLines(k, screen.next));
  out.lines(lines);
}

export interface DoneScreen {
  text: string;
  /** ok when it happened; faint when nothing changed (a declined question). */
  tone?: 'ok' | 'faint' | 'warn';
  next?: Next[];
  /** Right after a question: the rail of the question continues. */
  afterQuestion?: boolean;
}

/** A finished action: one line with a check, then what to do next. */
export function showDone(out: Output, screen: DoneScreen): void {
  if (!out.rich) {
    out.print(screen.text);
    plainNext(out, screen.next);
    return;
  }
  const k = kit(out, 'out');
  const tone = screen.tone ?? 'ok';
  const mark =
    tone === 'ok'
      ? k.ok(k.glyph.done)
      : tone === 'warn'
        ? k.warn(k.glyph.done)
        : k.faint(k.glyph.done);
  const lines = [...(screen.afterQuestion ? [] : ['']), `  ${mark}  ${screen.text}`];
  for (const line of screen.next ?? []) {
    lines.push(...k.wrap(line.text, k.width - 3, '').map((part) => k.railLine(k.muted(part))));
    if (line.command) lines.push(`  ${k.rail(k.glyph.end)}  ${k.accent(safeText(line.command))}`);
  }
  out.lines(lines);
}

export interface SecretScreen {
  /** What the value is ("Signing secret"). */
  label: string;
  /** The value itself (a secret, a one-time address). Never registered as a secret: it must show. */
  value: string;
  /** Why it shows once and where to keep it. */
  note: string;
}

/**
 * A value that shows only now (a new signing secret, a one-time sign-in
 * address): set apart, easy to copy, with a note. Without a terminal it is
 * the value alone on its own line, then the note on stderr.
 */
export function showOnce(out: Output, screen: SecretScreen): void {
  const value = safeText(screen.value);
  if (!out.rich) {
    out.print(value);
    out.info(screen.note);
    return;
  }
  const k = kit(out, 'out');
  out.lines([
    '',
    `  ${k.muted(screen.label)}`,
    `  ${k.violet(k.glyph.arrow)} ${k.accent(value)}`,
    '',
    ...k.wrap(screen.note, k.width - 4, '').map((part) => `  ${k.warn(part)}`),
  ]);
}
