// What the terminal can do, and the text measurements the layout needs.
// Zero dependencies: everything here reads the environment and the streams.

export type ColorDepth = 'none' | '16' | '256' | 'truecolor';
/** `full` animates, `reduced` shows the final frame only, `off` shows nothing animated. */
export type Motion = 'full' | 'reduced' | 'off';

type Env = Record<string, string | undefined>;

export interface StreamInfo {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}

export interface TermCaps {
  /** stdout and stderr are terminals (and the run is not --json). */
  outTTY: boolean;
  errTTY: boolean;
  outColor: ColorDepth;
  errColor: ColorDepth;
  /** Box drawing and symbols such as ◆ ◇ │ are safe to print. */
  unicode: boolean;
  /** OSC 8 links are understood. */
  hyperlinks: boolean;
  /** Progress in the tab or taskbar (OSC 9;4). */
  progressBar: boolean;
  motion: Motion;
  /** The background looks light (from COLORFGBG), so fades end in light grey. */
  lightBackground: boolean;
}

const TRUECOLOR_PROGRAMS = new Set([
  'iTerm.app',
  'WezTerm',
  'ghostty',
  'vscode',
  'Hyper',
  'Tabby',
  'rio',
  'WarpTerminal',
]);

/** True when the variable is set to something other than an explicit "off". */
export function envFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

/** Continuous integration: never ask, never animate. */
export function isCI(env: Env): boolean {
  return envFlag(env.CI) || envFlag(env.CONTINUOUS_INTEGRATION) || envFlag(env.BUILD_ID);
}

function terminalDepth(env: Env): ColorDepth {
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '')) return 'truecolor';
  if (
    TRUECOLOR_PROGRAMS.has(env.TERM_PROGRAM ?? '') ||
    env.WT_SESSION ||
    env.KITTY_WINDOW_ID ||
    /kitty|ghostty|wezterm|alacritty|foot/.test(env.TERM ?? '')
  ) {
    return 'truecolor';
  }
  if (/256/.test(env.TERM ?? '') || env.TERM_PROGRAM === 'Apple_Terminal') return '256';
  return '16';
}

/**
 * Color depth of one stream, following the common conventions: FORCE_COLOR
 * (0, 1, 2, 3, true, false) wins, then NO_COLOR when it is not empty, then
 * TERM=dumb; without a terminal there is no color unless forced.
 */
export function colorDepth(env: Env, isTTY: boolean, json: boolean): ColorDepth {
  if (json) return 'none';
  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    const f = force.trim().toLowerCase();
    if (f === '0' || f === 'false') return 'none';
    if (f === '3') return 'truecolor';
    if (f === '2') return '256';
    if (f === '' || f === '1' || f === 'true') return isTTY ? terminalDepth(env) : '16';
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none';
  if (env.TERM === 'dumb') return 'none';
  if (!isTTY) return 'none';
  return terminalDepth(env);
}

export function detectCaps(
  env: Env,
  streams: { stdout: StreamInfo; stderr: StreamInfo },
  options: { json: boolean; platform: NodeJS.Platform },
): TermCaps {
  const outTTY = Boolean(streams.stdout.isTTY) && !options.json;
  const errTTY = Boolean(streams.stderr.isTTY) && !options.json;
  const outColor = colorDepth(env, Boolean(streams.stdout.isTTY), options.json);
  const errColor = colorDepth(env, Boolean(streams.stderr.isTTY), options.json);
  const unicode =
    env.TERM !== 'linux' && !(options.platform === 'win32' && !env.WT_SESSION && !env.TERM_PROGRAM);
  const linkForced = env.FORCE_HYPERLINK;
  const hyperlinks =
    linkForced !== undefined
      ? envFlag(linkForced) && errColor !== 'none'
      : errTTY &&
        errColor !== 'none' &&
        (TRUECOLOR_PROGRAMS.has(env.TERM_PROGRAM ?? '') ||
          Boolean(env.WT_SESSION) ||
          Boolean(env.KITTY_WINDOW_ID) ||
          Number(env.VTE_VERSION ?? 0) >= 5000);
  let motion: Motion = 'off';
  const pref = (env.BLADECP_MOTION ?? '').trim().toLowerCase();
  if (errTTY && errColor !== 'none' && !isCI(env) && env.TERM !== 'dumb' && pref !== 'off') {
    motion = env.SSH_CONNECTION || env.SSH_TTY || pref === 'reduced' ? 'reduced' : 'full';
  }
  const bg = /;(\d+)$/.exec(env.COLORFGBG ?? '')?.[1];
  return {
    outTTY,
    errTTY,
    outColor,
    errColor,
    unicode,
    hyperlinks,
    progressBar: errTTY && (Boolean(env.WT_SESSION) || env.TERM_PROGRAM === 'ghostty'),
    motion,
    lightBackground: bg === '7' || bg === '15',
  };
}

// ------------------------------------------------------------------ colors

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: Rgb): string {
  return rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Nearest of the 16 basic colors for the brand light (blues, violets, greys
 * and white). The saturated xterm palette distorts plain RGB distance, so it
 * classifies by hue and light instead.
 */
export function nearest16(c: Rgb): number {
  const [r, g, b] = c;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return l > 0.75 ? 15 : l > 0.45 ? 7 : 8;
  const violet = r > g * 1.25 && r > b * 0.52;
  if (l > 0.62) return 15;
  if (violet) return l > 0.34 ? 13 : 5;
  return l > 0.3 ? 12 : 4;
}

export function nearest256(c: Rgb): number {
  const [r, g, b] = c;
  const level = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.round((v - 35) / 40)));
  const steps = [0, 95, 135, 175, 215, 255];
  const ri = level(r);
  const gi = level(g);
  const bi = level(b);
  const cube = 16 + 36 * ri + 6 * gi + bi;
  const cd = (steps[ri]! - r) ** 2 + (steps[gi]! - g) ** 2 + (steps[bi]! - b) ** 2;
  const avg = Math.round((r + g + b) / 3);
  const gi2 = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const gv = 8 + gi2 * 10;
  const gd = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return gd < cd ? 232 + gi2 : cube;
}

/** SGR parameters of a raw color at a depth (foreground or background). */
export function sgrColor(rgb: Rgb, depth: ColorDepth, bg: boolean): string {
  if (depth === 'truecolor')
    return `${bg ? 48 : 38};2;${Math.round(rgb[0])};${Math.round(rgb[1])};${Math.round(rgb[2])}`;
  if (depth === '256') return `${bg ? 48 : 38};5;${nearest256(rgb)}`;
  const n = nearest16(rgb);
  return String((bg ? 40 : 30) + (n % 8) + (n >= 8 ? 60 : 0));
}

// ------------------------------------------------------------------- width

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function isZeroWidth(cp: number): boolean {
  return (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f;
}

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  return isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1;
}

/** Cells a plain string takes on screen (no escape sequences inside). */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w;
}

/** Cuts plain text to a width, ending with an ellipsis when it was longer. */
export function truncate(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  if (width <= 0) return '';
  let out = '';
  let used = 0;
  for (const ch of text) {
    const w = charWidth(ch);
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

/**
 * Wraps plain text on spaces to a width. Words longer than the width (URLs,
 * IDs) stay whole on their own line so they can still be copied.
 */
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number = textWidth,
): string[] {
  if (!Number.isFinite(width) || width <= 0) return text.split('\n');
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (line === '') line = word;
      else if (measure(line) + 1 + measure(word) <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export function padEndText(text: string, width: number): string {
  const d = width - textWidth(text);
  return d > 0 ? text + ' '.repeat(d) : text;
}

export function padStartText(text: string, width: number): string {
  const d = width - textWidth(text);
  return d > 0 ? ' '.repeat(d) + text : text;
}

// --------------------------------------------------------------- sequences

const ESC = '\u001b';

export const SEQ = {
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  syncOn: `${ESC}[?2026h`,
  syncOff: `${ESC}[?2026l`,
  clearLine: `${ESC}[2K`,
  clearDown: `${ESC}[J`,
  up: (n: number) => `${ESC}[${n}A`,
  down: (n: number) => `${ESC}[${n}B`,
  /** Moves to a column of the current row (1 is the first). */
  column: (n: number) => `${ESC}[${n}G`,
  reset: `${ESC}[0m`,
  /** Progress in the tab or taskbar; `null` removes it. */
  progress: (pct: number | null) =>
    pct === null ? `${ESC}]9;4;0;0${ESC}\\` : `${ESC}]9;4;1;${Math.round(pct)}${ESC}\\`,
  linkOpen: (url: string) => `${ESC}]8;;${url}${ESC}\\`,
  linkClose: `${ESC}]8;;${ESC}\\`,
} as const;

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/y;

/** Visible width of text that may hold escape sequences. */
export function ansiWidth(text: string): number {
  return textWidth(
    text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, ''),
  );
}

/** Cuts text with escape sequences to a visible width, keeping the sequences whole. */
export function cutAnsi(text: string, width: number): string {
  if (ansiWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  let i = 0;
  let inLink = false;
  while (i < text.length) {
    ANSI_PATTERN.lastIndex = i;
    const m = ANSI_PATTERN.exec(text);
    if (m) {
      out += m[0];
      i += m[0].length;
      if (m[0].startsWith('\u001b]8;;')) inLink = m[0].length > SEQ.linkClose.length;
      continue;
    }
    const ch = String.fromCodePoint(text.codePointAt(i) ?? 32);
    const w = charWidth(ch);
    if (used + w > width - 1) {
      out += '…';
      break;
    }
    out += ch;
    used += w;
    i += ch.length;
  }
  return `${out}${inLink ? SEQ.linkClose : ''}${SEQ.reset}`;
}
