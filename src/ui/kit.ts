// The Horizonte direction: the identity of the Hub in the terminal. Its
// signature is the horizon, a line of light brightest at its center that
// fades into the background. Flows run on a rail of steps (◆ active,
// ◇ done), the current step can shimmer, progress is light travelling along
// the horizon. Color is used with restraint: one indigo accent, a violet for
// values, greys for everything quiet.
//
// Every function returns composed text with Output style markers, so the
// sanitizer, the color depth and NO_COLOR still decide what reaches the
// terminal.

import { safeText } from '../sanitize.js';
import type { Output } from './output.js';
import {
  hexToRgb,
  mixRgb,
  padEndText,
  padStartText,
  type Rgb,
  textWidth,
  truncate,
  wrapText,
} from './term.js';

const DARK_RAMP = ['#1c1c28', '#312e81', '#4f46e5', '#6366f1', '#a78bfa', '#ede9fe'].map(hexToRgb);
const LIGHT_RAMP = ['#ececf3', '#c7c9f9', '#8b8ff8', '#6366f1', '#7c5cf0', '#4c1d95'].map(hexToRgb);

export const BRAND_STOPS = ['#8b5cf6', '#6366f1', '#4f46e5'].map(hexToRgb);

export const SPINNERS = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  ascii: ['|', '/', '-', '\\'],
} as const;

export interface Kit {
  out: Output;
  stream: 'out' | 'err';
  color: boolean;
  unicode: boolean;
  /** Layout width: the terminal width, never more than 80 for prose blocks. */
  width: number;
  /** Full width of the stream (may be Infinity without a terminal). */
  columns: number;
  glyph: {
    active: string;
    done: string;
    open: string;
    bar: string;
    end: string;
    check: string;
    cross: string;
    dot: string;
    bullet: string;
    ring: string;
    pending: string;
    square: string;
    arrow: string;
    hline: string;
  };
  spin: readonly string[];
  accent(text: string): string;
  violet(text: string): string;
  muted(text: string): string;
  faint(text: string): string;
  rail(text: string): string;
  ok(text: string): string;
  warn(text: string): string;
  err(text: string): string;
  bold(text: string): string;
  underline(text: string): string;
  /** A clickable address where the terminal supports links, plain text elsewhere. */
  link(url: string, text?: string): string;
  /** `label  value` lines of the plain layout (no terminal): label padded, nothing else. */
  plainRows(list: [string, string][], indent?: number): string[];
  /** The plain table of 0.1.0: two spaces between columns, cells made terminal-safe. */
  plainTable(headers: string[], rows: string[][]): string;
  /** `  │` (the rail between steps). */
  railLine(text?: string): string;
  /** Color of a light intensity in [0, 1], from the background to a white core. */
  light(intensity: number): Rgb;
  horizon(width: number, options?: HorizonOptions): string;
  ruler(title: string, width?: number): string;
  gradient(text: string, stops?: Rgb[]): string;
  wordmark(version: string): string;
  shimmer(text: string, timeMs: number): string;
  lightBar(fraction: number, width: number): string;
  rows(list: [string, string][], options?: { indent?: number; width?: number }): string[];
  wrap(text: string, width: number, indent?: string): string[];
}

export interface HorizonOptions {
  /** Center of the light (0..1). */
  at?: number;
  /** Half width of the light (0..1). */
  spread?: number;
  power?: number;
  /** A moving highlight (0..1), or null. */
  sweep?: number | null;
  /** Replaces the brand light: rose for errors, amber for warnings. */
  tone?: 'err' | 'warn' | null;
  gain?: number;
}

function rampColor(ramp: Rgb[], intensity: number): Rgb {
  const x = Math.max(0, Math.min(1, intensity)) * (ramp.length - 1);
  const k = Math.min(ramp.length - 2, Math.floor(x));
  return mixRgb(ramp[k]!, ramp[k + 1]!, x - k);
}

export function kit(out: Output, stream: 'out' | 'err' = 'out'): Kit {
  const color = out.colored(stream);
  const depth16 = out.depthOf(stream) === '16';
  const unicode = out.unicode;
  const columns = stream === 'out' ? out.columns : out.errColumns;
  const width = Number.isFinite(columns) ? Math.max(20, Math.min(columns, 80) - 2) : 78;
  const ramp = out.caps.lightBackground ? LIGHT_RAMP : DARK_RAMP;
  const s = (name: Parameters<Output['style']>[0]) => (text: string) =>
    color ? out.style(name, text) : text;
  const light = (intensity: number) => rampColor(ramp, intensity);
  const glyph = unicode
    ? {
        active: '◆',
        done: '◇',
        open: '┌',
        bar: '│',
        end: '└',
        check: '✓',
        cross: '✕',
        dot: '·',
        bullet: '●',
        ring: '○',
        pending: '◌',
        square: '■',
        arrow: '›',
        hline: '─',
      }
    : {
        active: '*',
        done: 'o',
        open: '+',
        bar: '|',
        end: '+',
        check: 'v',
        cross: 'x',
        dot: '.',
        bullet: '*',
        ring: 'o',
        pending: 'o',
        square: '#',
        arrow: '>',
        hline: '-',
      };

  const k: Kit = {
    out,
    stream,
    color,
    unicode,
    width,
    columns,
    glyph,
    spin: unicode ? SPINNERS.dots : SPINNERS.ascii,
    accent: s('accent'),
    violet: s('violet'),
    muted: s('muted'),
    faint: s('faint'),
    rail: s('rail'),
    ok: s('ok'),
    warn: s('warn'),
    err: s('err'),
    bold: s('bold'),
    underline: s('underline'),
    link: (url, text = url) => out.link(url, text),
    plainRows(list, indent = 0) {
      const width = Math.max(0, ...list.map(([label]) => out.width(label)));
      return list.map(
        ([label, value]) => `${' '.repeat(indent)}${padEndText(label, width)}  ${safeText(value)}`,
      );
    },
    plainTable(headers, rows) {
      const head = headers.map(safeText);
      const body = rows.map((row) => row.map(safeText));
      const widths = head.map((header, index) =>
        Math.max(header.length, ...body.map((row) => (row[index] ?? '').length)),
      );
      const line = (cells: string[]) =>
        cells
          .map((cell, index) =>
            index === cells.length - 1 ? cell : cell.padEnd(widths[index] ?? 0),
          )
          .join('  ')
          .trimEnd();
      return [line(head), ...body.map(line)].join('\n');
    },
    railLine: (text = '') => `  ${k.rail(glyph.bar)}${text ? `  ${text}` : ''}`,
    light,
    horizon(w, options = {}) {
      const n = Math.max(1, Math.floor(w));
      if (!color) return glyph.hline.repeat(n);
      const { at = 0.5, spread = 0.42, power = 1.7, sweep = null, tone = null, gain = 1 } = options;
      const base = ramp[0]!;
      const toneRgb = tone ? hexToRgb(tone === 'warn' ? '#eab308' : '#f43f5e') : null;
      let line = '';
      for (let i = 0; i < n; i += 1) {
        const x = i / Math.max(1, n - 1);
        let v = Math.max(0, 1 - Math.abs(x - at) / spread) ** power * gain;
        if (sweep !== null) v = Math.max(v * 0.7, Math.exp(-(((x - sweep) / 0.06) ** 2)) * 1.05);
        const ch = v > 0.42 && unicode ? '━' : glyph.hline;
        const c = toneRgb ? mixRgb(base, toneRgb, Math.min(1, v * 1.25)) : light(v);
        line += depth16 ? ch : `${out.fgOpen(c)}${ch}`;
      }
      if (depth16) return out.style(tone ? 'err' : 'accent', line);
      return `${line}${out.fgClose()}`;
    },
    ruler(title, w = 44) {
      const n = Math.max(3, Math.min(w, width) - textWidth(out.plain(title)) - 1);
      if (!color) return `${title} ${glyph.hline.repeat(n)}`;
      if (depth16) return `${title} ${out.style('faint', glyph.hline.repeat(n))}`;
      const from = hexToRgb(out.caps.lightBackground ? '#a1a1b5' : '#4b4b62');
      const to = ramp[0]!;
      let line = '';
      for (let i = 0; i < n; i += 1) line += `${out.fgOpen(mixRgb(from, to, i / n))}${glyph.hline}`;
      return `${title} ${line}${out.fgClose()}`;
    },
    gradient(text, stops = BRAND_STOPS) {
      if (!color) return text;
      if (depth16) return out.style('accent', text);
      const chars = [...text];
      const last = Math.max(1, chars.length - 1);
      let line = '';
      chars.forEach((ch, i) => {
        if (ch === ' ') {
          line += ch;
          return;
        }
        const t = i / last;
        const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
        const local = t * (stops.length - 1) - seg;
        line += `${out.fgOpen(mixRgb(stops[seg]!, stops[seg + 1]!, local))}${ch}`;
      });
      return `${line}${out.fgClose()}`;
    },
    wordmark(version) {
      return `${k.gradient('B L A D E C P')}   ${k.muted(`CLI  v${version}`)}`;
    },
    shimmer(text, timeMs) {
      if (!color) return text;
      if (depth16) return out.style('accent', text);
      const chars = [...text];
      const band = 5;
      const period = 1600;
      const span = chars.length + band * 2;
      const pos = ((timeMs % period) / period) * span - band;
      const base = hexToRgb('#8b8b98');
      const peak = hexToRgb(out.caps.lightBackground ? '#312e81' : '#f4f4f5');
      const accent = hexToRgb('#a78bfa');
      let line = '';
      chars.forEach((ch, i) => {
        if (ch === ' ') {
          line += ch;
          return;
        }
        const d = Math.abs(i - pos) / band;
        const kk = Math.max(0, 1 - d);
        const e = kk * kk * (3 - 2 * kk);
        const mid = mixRgb(base, accent, Math.min(1, e * 1.6));
        const top = e > 0.6 ? (e - 0.6) / 0.4 : 0;
        line += `${out.fgOpen(mixRgb(mid, peak, top))}${ch}`;
      });
      return `${line}${out.fgClose()}`;
    },
    lightBar(fraction, w) {
      const n = Math.max(4, Math.floor(w));
      const pct = Math.max(0, Math.min(1, fraction));
      if (!color || !unicode) {
        const filled = Math.round(pct * n);
        return `${'='.repeat(filled)}${filled < n ? '>' : ''}${'-'.repeat(Math.max(0, n - filled - 1))}`;
      }
      if (depth16) {
        const filled = Math.round(pct * n);
        return `${out.style('accent', '━'.repeat(filled))}${out.style('faint', '─'.repeat(n - filled))}`;
      }
      const head = Math.min(n - 1, Math.round(pct * (n - 1)));
      let line = '';
      for (let i = 0; i < n; i += 1) {
        if (i < head) {
          line += `${out.fgOpen(light(0.42 + 0.5 * (i / Math.max(1, head)) ** 2.2))}━`;
        } else if (i === head) {
          line += `${out.fgOpen(light(pct >= 1 ? 0.8 : 1))}${pct >= 1 ? '━' : '●'}`;
        } else {
          const glow = Math.max(0, 1 - (i - head) / 4) ** 2 * 0.5;
          line += `${out.fgOpen(light(0.08 + glow))}${glow > 0.2 ? '━' : '─'}`;
        }
      }
      return `${line}${out.fgClose()}`;
    },
    rows(list, options = {}) {
      // A value longer than its column (a path) breaks inside the column.
      const fitValue = (value: string, room: number) =>
        wrapText(value, room, (x) => out.width(x)).flatMap((part) =>
          room >= 8 ? out.cut(part, room) : [part],
        );
      const indent = options.indent ?? 2;
      const total = options.width ?? width;
      const labelWidth = Math.max(0, ...list.map(([label]) => out.width(label)));
      const room = total - indent - labelWidth - 2;
      const lines: string[] = [];
      const pad = ' '.repeat(indent);
      if (room < 20) {
        // Narrow: the label above its value.
        for (const [label, value] of list) {
          lines.push(`${pad}${k.muted(label)}`);
          for (const part of fitValue(value, Math.max(12, total - indent - 2))) {
            lines.push(`${pad}  ${part}`);
          }
        }
        return lines;
      }
      for (const [label, value] of list) {
        const parts = fitValue(value, room);
        parts.forEach((part, i) => {
          const gap = ' '.repeat(Math.max(0, labelWidth - out.width(label)));
          const head = i === 0 ? `${k.muted(label)}${gap}` : ' '.repeat(labelWidth);
          lines.push(`${pad}${head}  ${part}`);
        });
      }
      return lines;
    },
    wrap(text, w, indent = '  ') {
      return wrapText(text, Math.max(16, w - textWidth(indent)), (s) => out.width(s)).map(
        (line) => `${indent}${line}`,
      );
    },
  };
  return k;
}

// ------------------------------------------------------------------ tables

export interface TableColumn {
  header: string;
  /** Higher survives longer on a narrow terminal. */
  priority: number;
  /** Can be cut with an ellipsis down to `min` cells. */
  flex?: boolean;
  min?: number;
  align?: 'left' | 'right';
}

export interface TableCell {
  /** Terminal-safe plain text (no style markers). */
  text: string;
  /** Paints the (possibly cut) text. */
  paint?: (text: string) => string;
}

/**
 * A table that fits the width: columns with the lowest priority leave first,
 * then flexible columns are cut with an ellipsis. Returns the lines and the
 * width it takes (for the horizon under the header).
 */
export function fitTable(
  k: Kit,
  columns: TableColumn[],
  rows: TableCell[][],
  options: { indent?: number; gap?: number; width?: number } = {},
): { lines: string[]; width: number; header: string; body: string[] } {
  const indent = options.indent ?? 2;
  const gap = options.gap ?? 3;
  const limit = options.width ?? (Number.isFinite(k.columns) ? k.columns - 1 : 200);
  const full = columns.map((column, i) =>
    Math.max(textWidth(column.header), ...rows.map((row) => textWidth(row[i]?.text ?? ''))),
  );
  let keep = columns.map((_, i) => i);
  let natural = [...full];
  const used = () =>
    indent + keep.reduce((sum, i) => sum + natural[i]!, 0) + gap * Math.max(0, keep.length - 1);
  for (;;) {
    natural = [...full];
    // First cut the flexible columns down to their minimum.
    let over = used() - limit;
    for (const i of keep) {
      const column = columns[i]!;
      if (!column.flex || over <= 0) continue;
      const min = Math.max(column.min ?? 8, textWidth(column.header));
      const cut = Math.min(over, Math.max(0, full[i]! - min));
      natural[i] = full[i]! - cut;
      over -= cut;
    }
    if (used() <= limit || keep.length === 1) break;
    // Then the least important column leaves.
    const lowest = keep.reduce((a, b) => (columns[b]!.priority < columns[a]!.priority ? b : a));
    keep = keep.filter((i) => i !== lowest);
  }
  // Last resort on a very narrow terminal: cut the widest column left.
  while (used() > limit) {
    const widest = keep.reduce((a, b) => (natural[b]! > natural[a]! ? b : a));
    if (natural[widest]! <= 4) break;
    natural[widest] = natural[widest]! - 1;
  }
  const cell = (i: number, text: string, paint?: (t: string) => string, last = false) => {
    const column = columns[i]!;
    const cut = truncate(text, natural[i]!);
    const painted = paint ? paint(cut) : cut;
    if (column.align === 'right') return `${' '.repeat(natural[i]! - textWidth(cut))}${painted}`;
    return last ? painted : `${painted}${' '.repeat(Math.max(0, natural[i]! - textWidth(cut)))}`;
  };
  const pad = ' '.repeat(indent);
  const spacer = ' '.repeat(gap);
  const header = `${pad}${keep
    .map((i, j) => {
      const text = truncate(columns[i]!.header, natural[i]!);
      const last = j === keep.length - 1;
      const aligned =
        columns[i]!.align === 'right'
          ? padStartText(text, natural[i]!)
          : last
            ? text
            : padEndText(text, natural[i]!);
      return k.muted(aligned);
    })
    .join(spacer)}`;
  const body = rows.map(
    (row) =>
      `${pad}${keep
        .map((i, j) => cell(i, row[i]?.text ?? '', row[i]?.paint, j === keep.length - 1))
        .join(spacer)}`,
  );
  return { lines: [header, ...body], width: used(), header, body };
}

// ------------------------------------------------------------------ errors

export interface ErrorView {
  title: string;
  cause?: string | undefined;
  /**
   * Each fix is a line (already composed), or a command with what it does:
   * side by side when they fit, the command above its text when they do not.
   */
  fixes: (string | { command: string; text: string })[];
  exit: number;
  code: string;
  tone?: 'err' | 'warn';
  glyph?: string;
}

/** An error as a short block: title, a horizon in the error tone, cause, fix, exit code. */
export function errorBlock(k: Kit, view: ErrorView): string[] {
  const t = k.out.t;
  const tone = view.tone ?? 'err';
  const paint = tone === 'warn' ? k.warn : k.err;
  const glyph = view.glyph ?? k.glyph.cross;
  const width = Math.max(20, Math.min(k.width, 76));
  const titleLines = wrapText(view.title, width - 5);
  const lines = titleLines.map((line, i) =>
    i === 0 ? `  ${paint(glyph)}  ${k.bold(line)}` : `     ${k.bold(line)}`,
  );
  const ruleWidth = Math.min(
    64,
    Math.max(...titleLines.map((line) => textWidth(line))) + 18,
    width,
  );
  lines.push(` ${k.horizon(ruleWidth, { at: 0.1, spread: 0.9, power: 1.3, tone })}`);
  const causeLabel = t('err.cause');
  const fixLabel = t('err.fix');
  const labelWidth = Math.max(textWidth(causeLabel), textWidth(fixLabel));
  const valueWidth = Math.max(16, width - labelWidth - 4);
  if (view.cause) {
    wrapText(view.cause, valueWidth).forEach((line, i) => {
      lines.push(
        `  ${i === 0 ? k.muted(padEndText(causeLabel, labelWidth)) : ' '.repeat(labelWidth)}  ${line}`,
      );
    });
  }
  const commandWidth = Math.max(
    0,
    ...view.fixes.map((fix) => (typeof fix === 'string' ? 0 : textWidth(fix.command) + 2)),
  );
  const fixLines = view.fixes.flatMap((fix) => {
    if (typeof fix === 'string') return [fix];
    const side = `${k.accent(padEndText(fix.command, commandWidth))}${k.muted(fix.text)}`;
    if (commandWidth + textWidth(fix.text) <= valueWidth) return [side];
    return [
      k.accent(fix.command),
      ...wrapText(fix.text, valueWidth - 2).map((line) => `  ${k.muted(line)}`),
    ];
  });
  fixLines.forEach((fix, i) => {
    lines.push(
      `  ${i === 0 ? k.muted(padEndText(fixLabel, labelWidth)) : ' '.repeat(labelWidth)}  ${fix}`,
    );
  });
  lines.push(`  ${k.faint(t('err.meta', { exit: view.exit, code: view.code }))}`);
  return lines;
}
