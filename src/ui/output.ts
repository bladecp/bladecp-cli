import { randomBytes } from 'node:crypto';

import {
  createTranslator,
  type Lang,
  type MessageKey,
  type Translator,
  translateComposed,
  type Vars,
} from '../i18n/index.js';
import { redact } from '../redact.js';
import { safeJson, safeLines } from '../sanitize.js';
import {
  type ColorDepth,
  charWidth,
  cutAnsi,
  detectCaps,
  hexToRgb,
  nearest256,
  type Rgb,
  rgbToHex,
  SEQ,
  sgrColor,
  type TermCaps,
  textWidth,
} from './term.js';

export interface OutStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}

type Env = Record<string, string | undefined>;

/** Text attributes: SGR open and close codes. */
const ATTRS = {
  bold: ['1', '22'],
  dim: ['2', '22'],
  italic: ['3', '23'],
  underline: ['4', '24'],
} as const;

/**
 * Semantic colors of the Horizonte direction: one indigo accent, a violet
 * for values, greys for the quiet parts and the three status colors. Each has
 * a fixed fallback among the 16 basic colors.
 */
const TOKENS = {
  accent: { hex: '6366f1', c16: '94' },
  violet: { hex: 'a78bfa', c16: '95' },
  muted: { hex: '8b8b98', c16: '90' },
  faint: { hex: '62627a', c16: '90' },
  rail: { hex: '4a4a5e', c16: '90' },
  ok: { hex: '22c55e', c16: '32' },
  warn: { hex: 'eab308', c16: '33' },
  err: { hex: 'f43f5e', c16: '31' },
  // Names kept from 0.1.0.
  red: { hex: 'f43f5e', c16: '31' },
  green: { hex: '22c55e', c16: '32' },
  yellow: { hex: 'eab308', c16: '33' },
  cyan: { hex: '38bdf8', c16: '36' },
} as const;

export type Attr = keyof typeof ATTRS;
export type Token = keyof typeof TOKENS;
export type Style = Attr | Token;

// Style markers: private-use delimiters around a per-run random nonce. Text
// from outside the CLI cannot forge them (the sanitizer escapes the
// delimiters and the nonce is unknown), so only the CLI's own styles become
// ANSI codes, and only after everything else was sanitized.
const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);

/** The stream on which a live region hid the cursor, restored on exit. */
let cursorHiddenOn: OutStream | null = null;

/** Shows the cursor again if a live region hid it. Safe to call at any time. */
export function restoreCursor(): void {
  if (cursorHiddenOn) {
    cursorHiddenOn.write(`${SEQ.syncOff}${SEQ.showCursor}`);
    cursorHiddenOn = null;
  }
}

/** Only http(s) addresses made of printable ASCII become OSC 8 links. */
function linkable(url: string): string | null {
  return /^https?:\/\/[\x21-\x7e]+$/.test(url) ? url : null;
}

/**
 * Every byte the CLI prints goes through this class, so terminal
 * sanitization, redaction, colors, `--json` silence and translation are
 * enforced in one place.
 */
export class Output {
  readonly json: boolean;
  readonly lang: Lang;
  readonly t: Translator;
  readonly caps: TermCaps;
  /** `--watch --json`: errors are one compact line like the documents before them. */
  ndjson = false;
  /** `--debug`/`--verbose`: requests are described on stderr. */
  debugEnabled = false;
  private readonly env: Env;
  private readonly secrets = new Set<string>();
  private readonly nonce = randomBytes(8).toString('hex');
  private readonly markers: RegExp;
  private readonly links = new Map<number, string>();
  private readonly sgrCache = new Map<string, string>();
  private liveCount = 0;
  /**
   * Rows kept on the terminal so far (the live region not included), so a
   * piece of a screen already written can be found again: the points of light
   * around the B twinkle while the login waits. `partial` is a row left
   * without its line break; `screenColumns` is the width they were counted at.
   */
  private screenRows = 0;
  private partial = false;
  private screenColumns = 0;

  constructor(
    private readonly stdout: OutStream,
    private readonly stderr: OutStream,
    options: { json: boolean; lang: Lang; env: Env; platform?: NodeJS.Platform },
  ) {
    this.json = options.json;
    this.lang = options.lang;
    this.env = options.env;
    this.t = createTranslator(options.lang);
    this.caps = detectCaps(
      options.env,
      { stdout, stderr },
      { json: options.json, platform: options.platform ?? process.platform },
    );
    this.markers = new RegExp(
      `${MARK_OPEN}${this.nonce}([a-z]+|[FB][0-9a-f]{6}|L\\d+)([+-])${MARK_CLOSE}`,
      'g',
    );
  }

  /**
   * Translation whose values are composed text (styled, already safe). Use
   * `safeText` on anything from outside the CLI before styling it.
   */
  tc(key: MessageKey, vars: Record<string, string>): string {
    return translateComposed(this.lang, key, vars);
  }

  /** Registers a secret that must never be printed verbatim. */
  addSecret(secret: string | undefined): void {
    if (secret) this.secrets.add(secret);
  }

  get stderrIsTTY(): boolean {
    return this.caps.errTTY;
  }

  /** Human output on stdout uses the designed layout (terminal, or colors forced). */
  get rich(): boolean {
    return !this.json && (this.caps.outTTY || this.caps.outColor !== 'none');
  }

  /** Progress and questions on stderr use the designed layout. */
  get richErr(): boolean {
    return !this.json && (this.caps.errTTY || this.caps.errColor !== 'none');
  }

  get unicode(): boolean {
    return this.caps.unicode;
  }

  /** Width available on stdout; without a terminal nothing is wrapped. */
  get columns(): number {
    if (!this.caps.outTTY) return this.rich ? 80 : Number.POSITIVE_INFINITY;
    return this.stdout.columns || Number(this.env.COLUMNS) || 80;
  }

  /** Width available on stderr (live regions and questions). */
  get errColumns(): number {
    if (!this.caps.errTTY) return this.richErr ? 80 : Number.POSITIVE_INFINITY;
    return this.stderr.columns || Number(this.env.COLUMNS) || 80;
  }

  /** Height of the terminal window. */
  get rows(): number {
    return this.stderr.rows || this.stdout.rows || Number(this.env.LINES) || 24;
  }

  private sgr(spec: string, open: boolean, depth: ColorDepth): string {
    if (spec in ATTRS) return ATTRS[spec as Attr][open ? 0 : 1];
    if (spec.startsWith('F')) return open ? this.rawColor(spec.slice(1), depth, false) : '39';
    if (spec.startsWith('B')) return open ? this.rawColor(spec.slice(1), depth, true) : '49';
    const token = TOKENS[spec as Token];
    if (!token) return '';
    if (!open) return '39';
    if (depth === '16') return token.c16;
    if (depth === '256') return `38;5;${nearest256(hexToRgb(token.hex))}`;
    return sgrColor(hexToRgb(token.hex), depth, false);
  }

  private rawColor(hex: string, depth: ColorDepth, bg: boolean): string {
    const key = `${depth}${bg ? 'b' : 'f'}${hex}`;
    let code = this.sgrCache.get(key);
    if (code === undefined) {
      code = sgrColor(hexToRgb(hex), depth, bg);
      this.sgrCache.set(key, code);
    }
    return code;
  }

  /**
   * Turns composed text into terminal-safe text: control, C1 and bidi
   * characters are escaped visibly (line breaks kept), the CLI's own style
   * markers become ANSI codes when colors are on, and keys are redacted.
   */
  private render(text: string, depth: ColorDepth, links: boolean): string {
    let out = '';
    let last = 0;
    for (const match of text.matchAll(this.markers)) {
      out += safeLines(text.slice(last, match.index));
      const spec = match[1]!;
      const open = match[2] === '+';
      if (spec.startsWith('L')) {
        const url = this.links.get(Number(spec.slice(1)));
        if (links && url) out += open ? SEQ.linkOpen(url) : SEQ.linkClose;
      } else if (depth !== 'none') {
        const code = this.sgr(spec, open, depth);
        if (code) out += `\u001b[${code}m`;
      }
      last = match.index + match[0].length;
    }
    out += safeLines(text.slice(last));
    return redact(out, this.secrets);
  }

  /**
   * A question for the line editor (readline writes it to stderr itself):
   * the same sanitizing, redaction and colors as everything else.
   */
  renderPrompt(text: string): string {
    return this.render(text, this.caps.errColor, false);
  }

  /** The text as it will read on screen, without any color. */
  plain(text: string): string {
    return this.render(text, 'none', false);
  }

  /** Cells the composed text takes on screen. */
  width(text: string): number {
    return textWidth(this.plain(text));
  }

  private writeOut(text: string): void {
    this.clearLiveLine();
    const fitted = this.caps.outTTY ? this.fit(text, this.columns) : text;
    if (this.caps.outTTY) this.countRows(fitted, this.columns);
    this.stdout.write(this.render(fitted, this.caps.outColor, this.caps.hyperlinks));
  }

  private writeErr(text: string): void {
    this.clearLiveLine();
    const fitted = this.caps.errTTY ? this.fit(text, this.errColumns) : text;
    if (this.caps.errTTY) this.countRows(fitted, this.errColumns);
    this.stderr.write(this.render(fitted, this.caps.errColor, this.caps.hyperlinks));
  }

  /** Counts the rows a write takes on the terminal, a long line wrapping over several. */
  private countRows(text: string, columns: number): void {
    if (!Number.isFinite(columns) || columns < 1) return;
    this.sameWidth(columns);
    const parts = this.plain(text).split('\n');
    const last = parts.pop() ?? '';
    for (const part of parts) {
      this.screenRows += Math.max(1, Math.ceil(textWidth(part) / columns));
    }
    if (parts.length > 0 && last === '') this.partial = false;
    else if (last !== '') this.partial = true;
  }

  /**
   * A window of another width reflows what is on screen, so rows counted
   * before no longer match: the count jumps far ahead and every earlier mark
   * reads as scrolled out of the window.
   */
  private sameWidth(columns: number): void {
    if (this.screenColumns === columns) return;
    if (this.screenColumns !== 0) this.screenRows += 100_000;
    this.screenColumns = columns;
  }

  /**
   * The row the next line kept on screen will take: with `patchCells`, a way
   * back to it later (for example the first row of a live region about to be
   * drawn and kept).
   */
  screenMark(): number {
    return this.screenRows;
  }

  /**
   * Rewrites single cells already on screen (points of light twinkling in
   * place), without redrawing their lines. `row` comes from `screenMark()`. Returns
   * false when that is no longer possible: no terminal, a row left open, a
   * window of another width, or a row that scrolled out of the window.
   */
  patchCells(cells: { row: number; col: number; text: string }[]): boolean {
    if (!this.caps.errTTY || this.json) return false;
    if (this.partial || this.screenColumns !== this.errColumns) return false;
    if (cells.length === 0) return true;
    const cursor = this.screenRows + this.liveCount;
    let s = SEQ.syncOn;
    const hide = cursorHiddenOn !== this.stderr;
    if (hide) s += SEQ.hideCursor;
    for (const cell of cells) {
      const up = cursor - cell.row;
      if (up < 1 || up > this.rows - 1 || cell.col < 0 || cell.col >= this.errColumns - 1) {
        return false;
      }
      const text = this.render(cell.text, this.caps.errColor, false);
      s += `\r${SEQ.up(up)}${SEQ.column(cell.col + 1)}${text}\r${SEQ.down(up)}`;
    }
    if (hide) s += SEQ.showCursor;
    s += SEQ.syncOff;
    this.stderr.write(s);
    return true;
  }

  /**
   * On a terminal, a line wider than the window is broken between words; the
   * continuation keeps the indentation and the rail (│). A single word longer
   * than the line (an address, a path) stays whole so it can be copied.
   */
  private fit(text: string, columns: number): string {
    if (!Number.isFinite(columns) || columns < 10) return text;
    return text
      .split('\n')
      .flatMap((line) => this.fitLine(line, columns))
      .join('\n');
  }

  private fitLine(line: string, width: number): string[] {
    const plain = this.plain(line);
    if (textWidth(plain) <= width) return [line];
    // The indentation and the marks of the line (rail, step glyph, bullet),
    // so the continuation lines up under the text.
    const prefix = /^[ │┌└◆◇✓✕·›●○■◌▲|]*/.exec(plain)?.[0] ?? '';
    const prefixWidth = textWidth(prefix);
    if (prefixWidth > width / 2) return [line];
    const continuation = [...prefix]
      .map((ch) => (ch === '│' || ch === '┌' || ch === '|' ? '│' : ' '))
      .join('')
      .replace(/│/g, this.style('rail', '│'));
    const [head, rest] = this.splitAtPlain(line, prefix.length);
    const words = rest.split(' ');
    const lines: string[] = [];
    let current = '';
    const room = width - prefixWidth;
    for (const word of words) {
      if (current === '') current = word;
      else if (this.width(current) + 1 + this.width(word) <= room) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines.map((part, i) => (i === 0 ? `${head}${part}` : `${continuation}${part}`));
  }

  /** Splits composed text after `count` visible characters (markers stay whole). */
  private splitAtPlain(text: string, count: number): [string, string] {
    let seen = 0;
    let i = 0;
    const marker = new RegExp(this.markers.source, 'y');
    while (i < text.length && seen < count) {
      marker.lastIndex = i;
      const m = marker.exec(text);
      if (m) {
        i += m[0].length;
        continue;
      }
      const ch = String.fromCodePoint(text.codePointAt(i) ?? 32);
      i += ch.length;
      seen += 1;
    }
    // Markers right after the prefix belong to the text that follows.
    return [text.slice(0, i), text.slice(i)];
  }

  /** Human result text on stdout. Silent in `--json` mode. */
  print(text = ''): void {
    if (this.json) return;
    this.writeOut(`${text}\n`);
  }

  /** Several result lines on stdout at once. */
  lines(lines: string[]): void {
    if (this.json || lines.length === 0) return;
    this.writeOut(`${lines.join('\n')}\n`);
  }

  /** Translated human result line on stdout. */
  say(key: MessageKey, vars?: Vars): void {
    this.print(this.t(key, vars));
  }

  /** Human progress and hints on stderr. Silent in `--json` mode. */
  info(text: string): void {
    if (this.json) return;
    this.writeErr(`${text}\n`);
  }

  /** Several progress lines on stderr at once. */
  infoLines(lines: string[]): void {
    if (this.json || lines.length === 0) return;
    this.writeErr(`${lines.join('\n')}\n`);
  }

  /**
   * Instructions that must reach the person even in `--json` mode (for
   * example the sign-in address). Goes to stderr, never to stdout.
   */
  notice(text: string): void {
    this.writeErr(`${text}\n`);
  }

  /** Request details for `--debug`. Never holds a key (redaction still applies). */
  debug(text: string): void {
    if (!this.debugEnabled) return;
    this.writeErr(`${this.style('faint', `debug ${text}`)}\n`);
  }

  warn(text: string): void {
    if (this.json) return;
    this.writeErr(`${this.style('yellow', this.t('label.warning'))} ${text}\n`);
  }

  error(text: string, hint?: string): void {
    this.writeErr(`${this.style('red', this.t('label.error'))} ${text}\n`);
    if (hint) this.writeErr(`${hint}\n`);
  }

  /** One JSON document on stdout (the whole result of a `--json` run). */
  emitJson(value: unknown): void {
    this.stdout.write(`${redact(safeJson(JSON.stringify(value, null, 2)), this.secrets)}\n`);
  }

  /** One compact JSON line on stdout (used by `--watch --json`). */
  emitJsonLine(value: unknown): void {
    this.stdout.write(`${redact(safeJson(JSON.stringify(value)), this.secrets)}\n`);
  }

  // ------------------------------------------------------------ live region

  /**
   * Lines on stderr redrawn in place: one write per frame inside a
   * synchronized update, cursor hidden, each line cut to the width so it
   * never wraps. Ignored without a terminal or in `--json` mode.
   */
  live(lines: string[]): void {
    if (!this.caps.errTTY) return;
    const width = Math.max(10, this.errColumns - 1);
    const flat = lines.flatMap((line) => line.split('\n'));
    let s = SEQ.syncOn;
    if (cursorHiddenOn !== this.stderr) {
      s += SEQ.hideCursor;
      cursorHiddenOn = this.stderr;
    }
    if (this.liveCount > 0) s += `\r${SEQ.up(this.liveCount)}`;
    for (const line of flat) {
      const rendered = this.render(line, this.caps.errColor, this.caps.hyperlinks);
      s += `${SEQ.clearLine}${cutAnsi(rendered, width)}\n`;
    }
    if (flat.length < this.liveCount) s += SEQ.clearDown;
    s += SEQ.syncOff;
    this.liveCount = flat.length;
    this.stderr.write(s);
  }

  /** Keeps the last frame of the live region on screen and shows the cursor. */
  liveDone(): void {
    if (this.caps.errTTY && this.liveCount > 0) {
      this.sameWidth(this.errColumns);
      this.screenRows += this.liveCount;
    }
    this.liveCount = 0;
    if (cursorHiddenOn === this.stderr) {
      this.stderr.write(SEQ.showCursor);
      cursorHiddenOn = null;
    }
  }

  /** A single status line that is rewritten in place (kept from 0.1.0). */
  liveLine(text: string): void {
    this.live([text.replace(/\n/g, ' ')]);
  }

  /** Erases the live region. */
  clearLiveLine(): void {
    if (this.liveCount > 0) {
      this.stderr.write(`\r${SEQ.up(this.liveCount)}${SEQ.clearDown}`);
      this.liveCount = 0;
    }
    if (cursorHiddenOn === this.stderr) {
      this.stderr.write(SEQ.showCursor);
      cursorHiddenOn = null;
    }
  }

  /**
   * A question broken to the width of the terminal, like any other line: the
   * last line is the prompt itself, the ones before it are written first.
   */
  promptLines(text: string): string[] {
    return this.caps.errTTY && Number.isFinite(this.errColumns) && this.errColumns >= 10
      ? this.fitLine(text, this.errColumns)
      : [text];
  }

  /**
   * Erases a question already answered on the terminal (its lines and the
   * echoed answer), when the line right below says the same thing.
   */
  forgetPrompt(lines: string[], answer: string): void {
    if (!this.caps.errTTY || this.liveCount > 0 || lines.length === 0) return;
    const columns = Math.max(1, this.errColumns);
    const last = this.width(lines.at(-1) ?? '') + textWidth(answer);
    const rows = lines.length - 1 + Math.max(1, Math.ceil(last / columns));
    this.stderr.write(`${SEQ.up(rows)}\r${SEQ.clearDown}`);
    // The lines before the prompt were counted; the prompt row was not (the
    // terminal reader wrote it).
    this.screenRows = Math.max(0, this.screenRows - (lines.length - 1));
  }

  /**
   * Cuts composed text into pieces of at most `width` cells, for a word with
   * no break (a path) that is wider than its column. A style open at a cut is
   * closed at the end of the piece and opened again at the start of the next.
   */
  cut(text: string, width: number): string[] {
    if (width < 1 || this.width(text) <= width) return [text];
    const marker = new RegExp(this.markers.source, 'y');
    const open: string[] = [];
    const pieces: string[] = [];
    let piece = '';
    let seen = 0;
    let i = 0;
    while (i < text.length) {
      marker.lastIndex = i;
      const m = marker.exec(text);
      if (m) {
        const spec = m[1] ?? '';
        if (m[2] === '+') open.push(spec);
        else if (open.includes(spec)) open.splice(open.lastIndexOf(spec), 1);
        piece += m[0];
        i += m[0].length;
        continue;
      }
      const ch = String.fromCodePoint(text.codePointAt(i) ?? 32);
      const cells = charWidth(ch);
      if (seen > 0 && seen + cells > width) {
        pieces.push(
          piece +
            [...open]
              .reverse()
              .map((spec) => this.mark(spec, '-'))
              .join(''),
        );
        piece = open.map((spec) => this.mark(spec, '+')).join('');
        seen = 0;
      }
      piece += ch;
      seen += cells;
      i += ch.length;
    }
    if (piece) pieces.push(piece);
    return pieces;
  }

  /** Progress in the tab or taskbar where the terminal shows it. */
  progress(percent: number | null): void {
    if (this.caps.progressBar) this.stderr.write(SEQ.progress(percent));
  }

  // ----------------------------------------------------------------- styles

  private mark(spec: string, sign: '+' | '-'): string {
    return `${MARK_OPEN}${this.nonce}${spec}${sign}${MARK_CLOSE}`;
  }

  /**
   * Marks text with one of the CLI's own styles. The marker turns into ANSI
   * codes only when the text is written to a terminal with colors on.
   */
  style(style: Style, text: string): string {
    if (text === '') return '';
    return `${this.mark(style, '+')}${text}${this.mark(style, '-')}`;
  }

  /** Text in a raw color (`#rrggbb` or [r, g, b]). */
  rgb(color: string | Rgb, text: string): string {
    if (text === '') return '';
    const hex = typeof color === 'string' ? color.replace('#', '').toLowerCase() : rgbToHex(color);
    return `${this.mark(`F${hex}`, '+')}${text}${this.mark(`F${hex}`, '-')}`;
  }

  /** Opening marker of a raw foreground color, for per character gradients. */
  fgOpen(color: Rgb): string {
    return this.mark(`F${rgbToHex(color)}`, '+');
  }

  /** Opening marker of a raw background color. */
  bgOpen(color: Rgb): string {
    return this.mark(`B${rgbToHex(color)}`, '+');
  }

  /** Back to the default foreground. */
  fgClose(): string {
    return this.mark('F000000', '-');
  }

  /** Back to the default background. */
  bgClose(): string {
    return this.mark('B000000', '-');
  }

  /** Whether colors reach stdout (or stderr with `err`). */
  colored(stream: 'out' | 'err' = 'out'): boolean {
    return this.depthOf(stream) !== 'none';
  }

  depthOf(stream: 'out' | 'err' = 'out'): ColorDepth {
    return stream === 'out' ? this.caps.outColor : this.caps.errColor;
  }

  /** A clickable link (OSC 8) where the terminal supports it, plain text elsewhere. */
  link(url: string, text = url): string {
    const target = linkable(url);
    if (!target || !this.caps.hyperlinks) return text;
    const id = this.links.size + 1;
    this.links.set(id, target);
    return `${this.mark(`L${id}`, '+')}${text}${this.mark(`L${id}`, '-')}`;
  }
}
