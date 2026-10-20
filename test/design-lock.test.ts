// The design lock: everything visual lives in src/ui/ (the kit). Commands
// and the rest of the CLI build screens only with its pieces, and every text
// a person reads comes from the message catalogs, in the three languages.
// A simple static check, with no dependency: it reads the sources.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { catalogs, LANGS } from '../src/i18n/index.js';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}

const files = walk(src).map((path) => ({
  path: relative(root, path),
  text: readFileSync(path, 'utf8'),
}));

/** Owners of the visual layer, and of the message catalogs. */
const isKit = (path: string) => path.startsWith('src/ui/');
const isCatalog = (path: string) => path.startsWith('src/i18n/');
/** Builds reference.json for the documentation; never runs in the CLI. */
const isReference = (path: string) => path === 'src/reference.ts';
/**
 * The operation table generated from the published API reference: its
 * summaries are API reference text (English), shown only by `bladecp api list`.
 */
const isApiReference = (path: string) => path === 'src/api/operations.ts';

interface Token {
  kind: 'code' | 'string';
  text: string;
  line: number;
}

/** Splits TypeScript into code and string literals, dropping comments. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let code = '';
  const flushCode = () => {
    if (code) tokens.push({ kind: 'code', text: code, line });
    code = '';
  };
  const templateStack: number[] = [];
  /** Line where each open template literal began (its parts report that line). */
  const templateLines: number[] = [];
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '\n') line += 1;
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const chunk = source.slice(i, end === -1 ? source.length : end + 2);
      line += chunk.split('\n').length - 1;
      i += chunk.length;
      continue;
    }
    if (ch === '}' && templateStack.length > 0 && templateStack.at(-1) === 0) {
      templateStack.pop();
      i += 1;
      // back inside a template literal
      flushCode();
      const start = templateLines.pop() ?? line;
      let text = '';
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          text += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          templateStack.push(0);
          templateLines.push(start);
          i += 2;
          break;
        }
        if (source[i] === '\n') line += 1;
        text += source[i];
        i += 1;
      }
      if (source[i] === '`') i += 1;
      tokens.push({ kind: 'string', text, line: start });
      continue;
    }
    if (ch === '{' && templateStack.length > 0) templateStack[templateStack.length - 1]! += 1;
    if (ch === '}' && templateStack.length > 0) templateStack[templateStack.length - 1]! -= 1;
    if (ch === "'" || ch === '"') {
      flushCode();
      let text = '';
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          text += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        text += source[i];
        i += 1;
      }
      i += 1;
      tokens.push({ kind: 'string', text, line });
      continue;
    }
    if (ch === '`') {
      flushCode();
      const start = line;
      let text = '';
      i += 1;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          text += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          templateStack.push(0);
          templateLines.push(start);
          i += 2;
          break;
        }
        if (source[i] === '\n') line += 1;
        text += source[i];
        i += 1;
      }
      if (source[i] === '`') i += 1;
      tokens.push({ kind: 'string', text, line: start });
      continue;
    }
    // A regular expression literal: skip it whole (it is not text for people).
    if (
      ch === '/' &&
      next !== '/' &&
      next !== '*' &&
      /(^|[=(,:!&|?{};[]|\breturn)$/.test(code.trimEnd())
    ) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        j += 1;
      }
      if (source[j] === '/') {
        code += source.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }
    code += ch;
    i += 1;
  }
  flushCode();
  return tokens;
}

const ESCAPE_IN_SOURCE =
  /\\u001b|\\x1b|\\033|\\e\[|\\u009b|\\x9b|\u001b|fromCharCode\(\s*(27|0x1b)\s*\)/i;

describe('everything visual lives in the kit (src/ui)', () => {
  const outside = files.filter((f) => !isKit(f.path) && !isCatalog(f.path));

  it('the kit exists and owns output, terminal, questions and the B', () => {
    const kit = files.filter((f) => isKit(f.path)).map((f) => f.path);
    for (const piece of [
      'src/ui/kit.ts',
      'src/ui/output.ts',
      'src/ui/term.ts',
      'src/ui/prompt.ts',
      'src/ui/interact.ts',
      'src/ui/layout.ts',
      'src/ui/logo/b3d.ts',
      'src/ui/logo/show.ts',
      'src/ui/callback-page.ts',
    ]) {
      expect(kit, piece).toContain(piece);
    }
  });

  it('nothing outside the kit writes to stdout or stderr itself', () => {
    const problems: string[] = [];
    for (const f of outside) {
      f.text.split('\n').forEach((line, index) => {
        const where = `${f.path}:${index + 1}`;
        // The real streams are only handed to the CLI (src/deps.ts) and the exit code set (src/bin.ts).
        if (/process\.(stdout|stderr)/.test(line) && f.path !== 'src/deps.ts')
          problems.push(`${where} uses process.stdout or process.stderr`);
        if (/\b(stdout|stderr)\.write\(/.test(line)) problems.push(`${where} writes to a stream`);
        if (/\bconsole\.(log|error|warn|info|debug)\(/.test(line))
          problems.push(`${where} uses console`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('nothing outside the kit writes escape sequences or builds colors', () => {
    const problems: string[] = [];
    for (const f of outside) {
      for (const token of tokenize(f.text)) {
        const where = `${f.path}:${token.line}`;
        if (ESCAPE_IN_SOURCE.test(token.text)) problems.push(`${where} has an escape sequence`);
        if (token.kind === 'code') {
          if (/\.(style|rgb|fgOpen|bgOpen|fgClose|bgClose)\(/.test(token.text))
            problems.push(`${where} builds a color (use a kit piece)`);
          if (/\b(sgrColor|SEQ\.|hexToRgb|mixRgb)\b/.test(token.text))
            problems.push(`${where} builds a color`);
        } else if (/#[0-9a-f]{6}\b/i.test(token.text)) {
          problems.push(`${where} has a color literal (${token.text.slice(0, 30)})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

/**
 * Strings that are not text for people: commands and options the person
 * types, addresses, machine codes, file names and internal error messages.
 */
function exempt(text: string, context: string): boolean {
  const value = text.trim();
  if (value === '') return true;
  if (/^(bladecp|npm|pnpm|yarn|bun|volta|export BLADECP_API_KEY)\b/.test(value)) return true;
  if (/^-{1,2}[a-z]/.test(value)) return true;
  if (/^(https?:|file:|\.{0,2}\/)/.test(value)) return true;
  if (/new Error\(|super\(|throw new Error/.test(context)) return true;
  // Brand and product names are the same in every language.
  if (/^BladeCP( CLI)?$/.test(value)) return true;
  return false;
}

/** Two words of letters in a row: text written for a person. */
const PROSE = /[A-Za-zÀ-ÿ]{2,}[,.:;!?]?\s+[A-Za-zÀ-ÿ]{2,}/;

describe('every text a person reads comes from the catalogs', () => {
  it('no prose in string literals outside the catalogs and the reference', () => {
    const problems: string[] = [];
    for (const f of files) {
      if (isCatalog(f.path) || isReference(f.path) || isApiReference(f.path)) continue;
      const lines = f.text.split('\n');
      for (const token of tokenize(f.text)) {
        if (token.kind !== 'string' || !PROSE.test(token.text)) continue;
        // The line of the literal and the one before (a call that wraps).
        const context = `${lines[token.line - 2] ?? ''}\n${lines[token.line - 1] ?? ''}`;
        if (context.includes('i18n-exempt')) continue;
        if (exempt(token.text, context)) continue;
        problems.push(`${f.path}:${token.line} "${token.text.slice(0, 60)}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every message key used in the source exists in the three languages', () => {
    const keys = new Set<string>();
    for (const f of files) {
      if (isCatalog(f.path)) continue;
      for (const token of tokenize(f.text)) {
        if (
          token.kind === 'string' &&
          /^[a-z]+[A-Za-z]*\.[A-Za-z_.]+$/.test(token.text) &&
          token.text in catalogs.en
        ) {
          keys.add(token.text);
        }
      }
    }
    expect(keys.size).toBeGreaterThan(200);
    for (const key of keys) {
      for (const lang of LANGS) {
        expect(catalogs[lang][key as keyof typeof catalogs.en], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});
