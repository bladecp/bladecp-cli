// The B on the login screen: it rises above the horizon among points of light,
// spins for about 1.5 s (44 frames) and lands facing the viewer, a little
// smaller than its area and centered in it. While the login waits, the points
// of light keep twinkling (only those cells are redrawn). Only on an
// interactive terminal with motion; over SSH, in CI or with
// BLADECP_MOTION=reduced the final frame is shown still; without color it is
// the ASCII ramp, never animated.

import type { Ctx } from '../../context.js';
import { cliVersion } from '../../version.js';
import type { Kit } from '../kit.js';
import { center } from '../layout.js';
import type { Output } from '../output.js';
import {
  type Cell,
  HERO_POSE,
  iconField,
  introPoses,
  type LogoMode,
  logoArea,
  pickLogoSize,
  renderCells,
} from './b3d.js';
import { STAR_LEVELS, type Star, starField, starLevel } from './stars.js';

/** Cells as composed text: colors become style markers, trailing blanks are trimmed. */
export function cellsToLine(out: Output, row: Cell[]): string {
  let end = row.length;
  while (end > 0 && row[end - 1]![0] === ' ' && !row[end - 1]![2]) end -= 1;
  let line = '';
  let fg = '';
  let bg = '';
  for (let i = 0; i < end; i += 1) {
    const [ch, f, b] = row[i]!;
    if (ch === ' ' && !b) {
      if (bg) {
        line += out.bgClose();
        bg = '';
      }
      line += ' ';
      continue;
    }
    const fKey = f ? f.join(',') : '';
    const bKey = b ? b.join(',') : '';
    if (fKey !== fg) {
      line += f ? out.fgOpen(f) : out.fgClose();
      fg = fKey;
    }
    if (bKey !== bg) {
      line += b ? out.bgOpen(b) : out.bgClose();
      bg = bKey;
    }
    line += ch;
  }
  if (fg) line += out.fgClose();
  if (bg) line += out.bgClose();
  return line;
}

/**
 * Size of the B for this window, or null when it does not fit. `extraRows`
 * are rows the waiting screen takes beyond the usual (a wrapped address, one
 * more hint).
 */
export function loginLogoSize(out: Output, extraRows = 0): { cols: number | null; mode: LogoMode } {
  const mode: LogoMode = out.colored('err') ? 'half' : 'ramp';
  return { cols: pickLogoSize(out.errColumns, out.rows, mode, extraRows), mode };
}

/** Where the B sits in its area: rows above it and the column its first cell lands on. */
export interface LogoPlacement {
  /** Rows of the area (the height kept for the logo). */
  rows: number;
  /** Width the B is drawn at, about 87% of the area. */
  inner: number;
  /** Rendered row shown on the first row of the area. */
  srcTop: number;
  /** Screen column of the first rendered column. */
  left: number;
  /** The B itself (its final pose) on screen: first and last row and column. */
  ink: { top: number; bottom: number; left: number; right: number };
}

const isBlank = (cell: Cell | undefined) => !cell || (cell[0] === ' ' && !cell[2]);

/**
 * Centers the B in the area of the logo, across and down: the free row left
 * over when the room is odd goes under the B, above the horizon. `width` is
 * the screen row the horizon spans (from column 1).
 */
export function placeLogo(
  cells: Cell[][],
  rows: number,
  inner: number,
  width: number,
): LogoPlacement {
  let top = -1;
  let bottom = -1;
  let first = Number.POSITIVE_INFINITY;
  let last = -1;
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (isBlank(cell)) return;
      if (top < 0) top = y;
      bottom = y;
      first = Math.min(first, x);
      last = Math.max(last, x);
    });
  });
  const inkRows = bottom - top + 1;
  const above = Math.floor((rows - inkRows) / 2);
  const left = Math.round(1 + width / 2 - (first + last + 1) / 2);
  return {
    rows,
    inner,
    srcTop: top - above,
    left,
    ink: { top: above, bottom: above + inkRows - 1, left: left + first, right: left + last },
  };
}

/** The login logo once drawn: its points of light keep twinkling while the login waits. */
export interface LoginLogo {
  /** Redraws the points of light that changed since the last frame; call it on every frame. */
  twinkle(): void;
}

const STILL: LoginLogo = { twinkle() {} };

export async function showLoginLogo(ctx: Ctx, k: Kit, extraRows = 0): Promise<LoginLogo> {
  const out = ctx.out;
  const t = out.t;
  const { cols, mode } = loginLogoSize(out, extraRows);
  const W = Math.max(k.width, Math.min(out.errColumns - 2, (cols ?? 0) + 40, 140));
  const tagline = t('brand.tagline');
  const footer = (progress: number, showText: boolean): string[] => [
    ` ${k.horizon(W, { spread: 0.14 + 0.4 * progress, power: 1.25, gain: 0.55 + 0.5 * progress })}`,
    // The reflection under the horizon only exists in color; without color
    // it would be a second identical rule.
    ...(out.colored('err')
      ? [` ${k.horizon(W, { spread: 0.08 + 0.22 * progress, power: 1.6, gain: 0.32 * progress })}`]
      : []),
    showText ? ` ${center(out, k.wordmark(cliVersion()), W)}` : '',
    showText ? ` ${center(out, k.muted(tagline), W)}` : '',
  ];

  out.info('');
  if (!cols) {
    out.live([
      ` ${k.horizon(W)}`,
      ` ${center(out, k.wordmark(cliVersion()), W)}`,
      ` ${center(out, k.muted(tagline), W)}`,
    ]);
    out.liveDone();
    out.info('');
    return STILL;
  }

  const field = iconField();
  const area = logoArea(cols, mode);
  const finalCells = renderCells(field, area.inner, mode, HERO_POSE);
  const place = placeLogo(finalCells, area.rows, area.inner, W);
  const width = W + 1;
  // Points of light only around the B: a band a little wider than it, and
  // never on the B, inside its outline (the hole, the notch open to the left)
  // or right next to it. The outline of a row spans the first to the last
  // cell of the B within three rows above and below.
  const margin = Math.max(6, Math.min(18, Math.round(cols * 0.22)));
  const outline = Array.from({ length: area.rows }, (_, row) => {
    let first = Number.POSITIVE_INFINITY;
    let last = -1;
    for (let dy = -3; dy <= 3; dy += 1) {
      finalCells[place.srcTop + row + dy]?.forEach((cell, x) => {
        if (isBlank(cell)) return;
        first = Math.min(first, place.left + x);
        last = Math.max(last, place.left + x);
      });
    }
    return { first: first - 2, last: last + 2 };
  });
  const stars = starField(
    {
      rows: area.rows,
      left: Math.max(1, place.ink.left - margin),
      right: Math.min(W, place.ink.right + margin),
    },
    (row, col) => col >= outline[row]!.first && col <= outline[row]!.last,
  );
  const dot = (star: Star) => (k.unicode ? star.dot : '.');
  const starRgb = (level: number) => k.light(0.18 + (0.78 * level) / STAR_LEVELS);
  // Without color every lit point looks the same: only the bright ones show.
  const levelAt = (star: Star, time: number) => {
    const level = starLevel(star, time);
    return k.color ? level : level >= 4 ? STAR_LEVELS : 0;
  };

  const body = (cells: Cell[][], time: number): string[] => {
    const grid: Cell[][] = [];
    for (let y = 0; y < area.rows; y += 1) {
      const row: Cell[] = Array.from({ length: width }, (): Cell => [' ', null, null]);
      const src = cells[place.srcTop + y];
      src?.forEach((cell, x) => {
        const at = place.left + x;
        if (at >= 0 && at < width && !isBlank(cell)) row[at] = cell;
      });
      grid.push(row);
    }
    for (const star of stars) {
      const level = levelAt(star, time);
      const row = grid[star.row]!;
      // The B passes in front of the points while it spins.
      if (!level || !isBlank(row[star.col])) continue;
      row[star.col] = [dot(star), k.color ? starRgb(level) : null, null];
    }
    return grid.map((row) => cellsToLine(out, row));
  };

  const { poses, fps } = introPoses();
  const introSeconds = poses.length / fps;
  const base = out.screenMark();
  if (out.caps.motion !== 'full' || !k.color) {
    out.live([...body(finalCells, introSeconds), ...footer(1, true)]);
    out.liveDone();
    out.info('');
    return STILL;
  }
  const frameMs = 1000 / fps;
  for (let i = 0; i < poses.length; i += 1) {
    const started = performance.now();
    const pose = poses[i]!;
    const cells = pose === HERO_POSE ? finalCells : renderCells(field, area.inner, mode, pose);
    const progress = Math.min(1, (i + 1) / poses.length);
    out.live([...body(cells, (i + 1) / fps), ...footer(progress, i >= poses.length - 12)]);
    if (ctx.signal.aborted) break;
    await ctx.frame(Math.max(0, frameMs - (performance.now() - started)));
  }
  out.liveDone();
  out.info('');

  // While the login waits, only the points of light that change are redrawn.
  const drawn = stars.map((star) => levelAt(star, introSeconds));
  const startedAt = ctx.now();
  let twinkling = true;
  return {
    twinkle() {
      if (!twinkling) return;
      const time = introSeconds + (ctx.now() - startedAt) / 1000;
      const cells: { row: number; col: number; text: string }[] = [];
      stars.forEach((star, i) => {
        const level = levelAt(star, time);
        if (level === drawn[i]) return;
        drawn[i] = level;
        cells.push({
          row: base + star.row,
          col: star.col,
          text: level ? out.rgb(starRgb(level), dot(star)) : ' ',
        });
      });
      // The window changed or the logo scrolled away: the points stay as they are.
      if (!out.patchCells(cells)) twinkling = false;
    },
  };
}
