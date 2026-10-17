import { randomBytes } from 'node:crypto';

import {
  createTranslator,
  type Lang,
  type MessageKey,
  type Translator,
  type Vars,
} from './i18n/index.js';
import { redact } from './redact.js';
import { safeJson, safeLines } from './sanitize.js';

export interface OutStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
  columns?: number;
}

type Env = Record<string, string | undefined>;

const ANSI = {
  bold: ['\u001b[1m', '\u001b[22m'],
  dim: ['\u001b[2m', '\u001b[22m'],
  red: ['\u001b[31m', '\u001b[39m'],
  green: ['\u001b[32m', '\u001b[39m'],
  yellow: ['\u001b[33m', '\u001b[39m'],
  cyan: ['\u001b[36m', '\u001b[39m'],
} as const;

type Style = keyof typeof ANSI;

// Style markers: private-use delimiters around a per-run random nonce. Text
// from outside the CLI cannot forge them (the sanitizer escapes the
// delimiters and the nonce is unknown), so only the CLI's own styles become
// ANSI codes, and only after everything else was sanitized.
const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);

/**
 * Every byte the CLI prints goes through this class, so terminal
 * sanitization, redaction, colors, `--json` silence and translation are
 * enforced in one place.
 */
export class Output {
  readonly json: boolean;
  readonly lang: Lang;
  readonly t: Translator;
  private readonly colorOut: boolean;
  private readonly colorErr: boolean;
  private readonly secrets = new Set<string>();
  private readonly nonce = randomBytes(8).toString('hex');
  private readonly markers: RegExp;
  private liveLineActive = false;

  constructor(
    private readonly stdout: OutStream,
    private readonly stderr: OutStream,
    options: { json: boolean; lang: Lang; env: Env },
  ) {
    this.json = options.json;
    this.lang = options.lang;
    this.t = createTranslator(options.lang);
    const noColor =
      options.json ||
      options.env.NO_COLOR !== undefined ||
      options.env.FORCE_COLOR === '0' ||
      options.env.TERM === 'dumb';
    this.colorOut = !noColor && Boolean(stdout.isTTY);
    this.colorErr = !noColor && Boolean(stderr.isTTY);
    this.markers = new RegExp(`${MARK_OPEN}${this.nonce}([a-z]+)([+-])${MARK_CLOSE}`, 'g');
  }

  /** Registers a secret that must never be printed verbatim. */
  addSecret(secret: string | undefined): void {
    if (secret) this.secrets.add(secret);
  }

  get stderrIsTTY(): boolean {
    return Boolean(this.stderr.isTTY) && !this.json;
  }

  /**
   * Turns composed text into terminal-safe text: control, C1 and bidi
   * characters are escaped visibly (line breaks kept), the CLI's own style
   * markers become ANSI codes when colors are on, and keys are redacted.
   */
  private render(text: string, color: boolean): string {
    let out = '';
    let last = 0;
    for (const match of text.matchAll(this.markers)) {
      out += safeLines(text.slice(last, match.index));
      const style = match[1] as Style;
      if (color && Object.hasOwn(ANSI, style)) out += ANSI[style][match[2] === '+' ? 0 : 1];
      last = match.index + match[0].length;
    }
    out += safeLines(text.slice(last));
    return redact(out, this.secrets);
  }

  private writeOut(text: string): void {
    this.clearLiveLine();
    this.stdout.write(this.render(text, this.colorOut));
  }

  private writeErr(text: string): void {
    this.clearLiveLine();
    this.stderr.write(this.render(text, this.colorErr));
  }

  /** Human result text on stdout. Silent in `--json` mode. */
  print(text = ''): void {
    if (this.json) return;
    this.writeOut(`${text}\n`);
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

  /**
   * Instructions that must reach the person even in `--json` mode (for
   * example the sign-in address). Goes to stderr, never to stdout.
   */
  notice(text: string): void {
    this.writeErr(`${text}\n`);
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

  /**
   * A single status line on a terminal that is rewritten in place. Ignored
   * when stderr is not a terminal or in `--json` mode.
   */
  liveLine(text: string): void {
    if (!this.stderrIsTTY) return;
    const width = Math.max(20, (this.stderr.columns ?? 80) - 1);
    const plain = this.render(text.replace(/\n/g, ' '), false);
    const line = plain.length > width ? `${plain.slice(0, width - 1)}…` : plain;
    this.stderr.write(`\r\u001b[2K${line}`);
    this.liveLineActive = true;
  }

  clearLiveLine(): void {
    if (!this.liveLineActive) return;
    this.liveLineActive = false;
    this.stderr.write('\r\u001b[2K');
  }

  /**
   * Marks text with one of the CLI's own styles. The marker turns into ANSI
   * codes only when the text is written to a terminal with colors on.
   */
  style(style: Style, text: string): string {
    return `${MARK_OPEN}${this.nonce}${style}+${MARK_CLOSE}${text}${MARK_OPEN}${this.nonce}${style}-${MARK_CLOSE}`;
  }
}
