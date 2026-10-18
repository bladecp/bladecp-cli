// Go semantics over binary strings (see binary.ts), where JavaScript differs:
// strings.TrimSpace and strings.Fields know the Unicode spaces but not U+FEFF,
// the regexp \s of Go (RE2) is ASCII only, strconv rejects what Number()
// accepts, and strings.ToLower maps two non-ASCII runes to ASCII letters.

/** The `\s` of Go regular expressions (RE2): never the `\s` of JavaScript. */
export const WS = '[\\t\\n\\f\\r ]';

const ASCII_SPACE = new Uint8Array(256);
for (const c of [9, 10, 11, 12, 13, 32]) ASCII_SPACE[c] = 1;

// unicode.IsSpace above ASCII, as UTF-8 bytes in a binary string.
const WIDE_SPACES: string[] = [
  '\xc2\x85',
  '\xc2\xa0',
  '\xe1\x9a\x80',
  ...Array.from({ length: 11 }, (_, i) => `\xe2\x80${String.fromCharCode(0x80 + i)}`),
  '\xe2\x80\xa8',
  '\xe2\x80\xa9',
  '\xe2\x80\xaf',
  '\xe2\x81\x9f',
  '\xe3\x80\x80',
];

/** Length of the space rune that starts at `i`, or 0. */
function spaceAt(s: string, i: number): number {
  const c = s.charCodeAt(i);
  if (c < 0x80) return ASCII_SPACE[c] ? 1 : 0;
  if (c !== 0xc2 && c !== 0xe1 && c !== 0xe2 && c !== 0xe3) return 0;
  for (const w of WIDE_SPACES) if (s.startsWith(w, i)) return w.length;
  return 0;
}

/** Length of the space rune that ends right before `end`, or 0. */
function spaceBefore(s: string, end: number): number {
  const c = s.charCodeAt(end - 1);
  if (c < 0x80) return ASCII_SPACE[c] ? 1 : 0;
  for (const w of WIDE_SPACES) {
    if (end >= w.length && s.startsWith(w, end - w.length)) return w.length;
  }
  return 0;
}

/** strings.TrimSpace (U+FEFF is not a space). */
export function trimSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end) {
    const n = spaceAt(s, start);
    if (n === 0) break;
    start += n;
  }
  while (end > start) {
    const n = spaceBefore(s, end);
    if (n === 0 || end - n < start) break;
    end -= n;
  }
  return s.slice(start, end);
}

/** strings.Fields: the words between runs of Unicode spaces. */
export function fields(s: string): string[] {
  const out: string[] = [];
  let word = -1;
  let i = 0;
  while (i < s.length) {
    const n = spaceAt(s, i);
    if (n > 0) {
      if (word >= 0) out.push(s.slice(word, i));
      word = -1;
      i += n;
    } else {
      if (word < 0) word = i;
      i += 1;
    }
  }
  if (word >= 0) out.push(s.slice(word));
  return out;
}

/** strings.Trim(s, cutset) for an ASCII cutset. */
export function trimChars(s: string, cutset: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && cutset.includes(s[start]!)) start += 1;
  while (end > start && cutset.includes(s[end - 1]!)) end -= 1;
  return s.slice(start, end);
}

/** strings.TrimRight(s, cutset) for an ASCII cutset. */
export function trimRightChars(s: string, cutset: string): string {
  let end = s.length;
  while (end > 0 && cutset.includes(s[end - 1]!)) end -= 1;
  return s.slice(0, end);
}

/** strings.Cut. */
export function cut(s: string, sep: string): [string, string, boolean] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, '', false] : [s.slice(0, i), s.slice(i + sep.length), true];
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** strconv.ParseInt(s, 10, 64) (bit size 0 is the same on 64-bit platforms). */
export function parseInt64(s: string): bigint | null {
  if (!/^[+-]?[0-9]+$/.test(s)) return null;
  const value = BigInt(s);
  return value < INT64_MIN || value > INT64_MAX ? null : value;
}

/** strconv.Atoi on a 64-bit platform, as a JavaScript number. */
export function atoi(s: string): number | null {
  const value = parseInt64(s);
  return value === null ? null : Number(value);
}

/** strconv.ParseUint(s, base, 64) for base 8 or 10. */
export function parseUint64(s: string, base: 8 | 10): bigint | null {
  const pattern = base === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!pattern.test(s)) return null;
  const value = base === 8 ? BigInt(`0o${s}`) : BigInt(s);
  return value >= 2n ** 64n ? null : value;
}

/**
 * strings.ToLower as far as a comparison with ASCII text can tell: ASCII
 * letters, plus the two runes Go lowers to ASCII (U+0130 to i, U+212A to k).
 * Other non-ASCII runes stay non-ASCII, as they do in Go.
 */
export function toLowerAscii(s: string): string {
  return s
    .replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
    .replaceAll('\xc4\xb0', 'i')
    .replaceAll('\xe2\x84\xaa', 'k');
}

/** strings.EqualFold for ASCII words (the lexer only reads ASCII letters). */
export function equalFoldAscii(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) continue;
    if ((x | 0x20) !== (y | 0x20) || (x | 0x20) < 0x61 || (x | 0x20) > 0x7a) return false;
  }
  return true;
}

/** regexp.QuoteMeta for the ASCII constant names the parser asks for. */
export function quoteMeta(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** keyValue: the value of KEY=VALUE metadata (cp/<user>); the first match wins. */
export function keyValue(content: string, key: string): string {
  for (const line of content.split('\n')) {
    const [k, v, ok] = cut(line, '=');
    if (ok && trimSpace(k) === key) return trimSpace(v);
  }
  return '';
}

/** yamlScalar: a top-level "key: value" of cPanel's flat userdata YAML; the first line wins. */
export function yamlScalar(content: string, key: string): string {
  const prefix = `${key}:`;
  for (const line of content.split('\n')) {
    const trimmed = trimSpace(line);
    if (trimmed.startsWith(prefix)) return trimChars(trimSpace(trimmed.slice(prefix.length)), `'"`);
  }
  return '';
}
