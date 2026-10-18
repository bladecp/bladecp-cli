// Layout helpers for composed text (text that may hold style markers).

import type { Output } from './output.js';

export function padEnd(out: Output, text: string, width: number): string {
  const d = width - out.width(text);
  return d > 0 ? text + ' '.repeat(d) : text;
}

export function padStart(out: Output, text: string, width: number): string {
  const d = width - out.width(text);
  return d > 0 ? ' '.repeat(d) + text : text;
}

export function center(out: Output, text: string, width: number): string {
  const d = width - out.width(text);
  if (d <= 0) return text;
  return ' '.repeat(Math.floor(d / 2)) + text;
}

/**
 * Commands and their descriptions in two columns, or stacked when the
 * terminal is too narrow for both.
 */
export function twoColumns(
  out: Output,
  entries: [string, string][],
  options: {
    width: number;
    indent?: number;
    gap?: number;
    /** Align with other blocks: the left column is at least this wide. */
    minLeft?: number;
    paintLeft?: (s: string) => string;
    paintRight?: (s: string) => string;
    wrap: (text: string, width: number) => string[];
  },
): string[] {
  const indent = options.indent ?? 2;
  const gap = options.gap ?? 3;
  const pad = ' '.repeat(indent);
  const left = Math.max(options.minLeft ?? 0, ...entries.map(([l]) => out.width(l)));
  const paintLeft = options.paintLeft ?? ((s: string) => s);
  const paintRight = options.paintRight ?? ((s: string) => s);
  const room = options.width - indent - left - gap;
  const lines: string[] = [];
  if (room >= 24 || !Number.isFinite(options.width)) {
    for (const [l, r] of entries) {
      const parts = Number.isFinite(options.width) ? options.wrap(r, room) : [r];
      parts.forEach((part, i) => {
        lines.push(
          i === 0
            ? `${pad}${padEnd(out, paintLeft(l), left)}${' '.repeat(gap)}${paintRight(part)}`
            : `${pad}${' '.repeat(left + gap)}${paintRight(part)}`,
        );
      });
    }
    return lines;
  }
  // Narrow: the description goes under its command.
  for (const [l, r] of entries) {
    lines.push(`${pad}${paintLeft(l)}`);
    for (const part of options.wrap(r, options.width - indent - 2)) {
      lines.push(`${pad}  ${paintRight(part)}`);
    }
  }
  return lines;
}
