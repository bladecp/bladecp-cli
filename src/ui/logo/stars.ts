// Points of light around the B on the login screen, after the starfield of
// the Codex CLI: a hash of each blank cell near the B decides whether it holds
// one, and each one glows for a short moment on its own period and phase, so
// only a few are lit at a time. They are single dots of a braille cell, one
// pixel each, never drawings of stars.

/** One raised dot of a braille cell: a single pixel in eight places. */
export const STAR_DOTS = ['⠁', '⠂', '⠄', '⠈', '⠐', '⠠', '⡀', '⢀'] as const;

/** Brightness steps of a point of light; 0 is off. */
export const STAR_LEVELS = 6;

/** About one blank cell in this many holds a point of light. */
const DENSITY = 29;

export interface Star {
  /** Row of the logo area and column of the screen row. */
  row: number;
  col: number;
  dot: string;
  /** Seconds between two glows, and where in that cycle it starts. */
  period: number;
  offset: number;
}

function hash(row: number, col: number): number {
  let h = (row * 65537 + col) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The points of light of an area: `rows` rows, columns `left` to `right`, and
 * never on a cell for which `blocked` is true (the B and the cells around it).
 * The same area always gets the same points.
 */
export function starField(
  area: { rows: number; left: number; right: number },
  blocked: (row: number, col: number) => boolean,
): Star[] {
  const stars: Star[] = [];
  for (let row = 0; row < area.rows; row += 1) {
    for (let col = Math.max(0, area.left); col <= area.right; col += 1) {
      const h = hash(row, col);
      if (h % DENSITY !== 0 || blocked(row, col)) continue;
      stars.push({
        row,
        col,
        dot: STAR_DOTS[Math.floor(h / 161) % STAR_DOTS.length]!,
        period: 3.6 + (h % 31) / 10,
        offset: (h % 997) / 997,
      });
    }
  }
  return stars;
}

/** How bright a point is at `time` seconds, 0 to 1: a short glow, dark most of the time. */
export function starGlow(star: Star, time: number): number {
  const phase = (((time / star.period + star.offset) % 1) + 1) % 1;
  return Math.sin(phase * Math.PI) ** 12;
}

/** The glow as a step from 0 (off) to STAR_LEVELS, so a frame only redraws the points that changed. */
export function starLevel(star: Star, time: number): number {
  const glow = starGlow(star, time);
  return glow < 0.05 ? 0 : Math.min(STAR_LEVELS, 1 + Math.floor(glow * STAR_LEVELS));
}
