// A streaming tar reader with the behavior of Go's archive/tar Reader (the one
// the migration parser uses): the same checksum rule (signed or unsigned
// sum), the same formats (V7, USTAR, PAX, GNU, STAR), GNU long names and PAX
// records, the same end of archive (two zero blocks, one zero block or the end
// of the stream at a block boundary, or inside the padding), the same errors
// for malformed numbers and records, and GNU sparse files (old and PAX). Only
// the bytes the caller asks for are copied; the rest is skipped.

import { binary, isAsciiC } from './binary.js';
import { headerError, truncatedError } from './errors.js';
import { cut, parseInt64, trimRightChars } from './go.js';
import type { Bytes } from './source.js';

const BLOCK = 512;
const MAX_SPECIAL_FILE = 1 << 20;
const MAX_SPARSE_ENTRIES = 1 << 20;
const INT64_MAX = 2n ** 63n - 1n;
const TWO_62 = 2n ** 62n;

const F_V7 = 1;
const F_USTAR = 2;
const F_PAX = 4;
const F_GNU = 8;
const F_STAR = 16;

const HEADER_ONLY = new Set(['1', '2', '3', '4', '5', '6']);
const ZERO_CHUNK = new Uint8Array(64 * 1024);

export interface TarEntry {
  /** Binary string (bytes of the name, as Go keeps them). */
  name: string;
  type: string;
  /** Header.Size: the logical size (the real size of a sparse file). */
  size: number;
  sparse: boolean;
}

interface Header {
  name: string;
  type: string;
  size: number;
  pax: Map<string, string> | null;
}

interface SparseEntry {
  offset: bigint;
  length: bigint;
}

/** archive/tar parser: numbers in octal or base-256, an error flag that sticks. */
class Numbers {
  err = false;

  /** parseNumeric as a JavaScript number (exact up to 2^53). */
  numeric(b: Uint8Array): number {
    if (b.length > 0 && (b[0]! & 0x80) !== 0) return Number(this.base256(b));
    return this.octal(b);
  }

  /** parseNumeric as an exact 64-bit value. */
  numericBig(b: Uint8Array): bigint {
    if (b.length > 0 && (b[0]! & 0x80) !== 0) return this.base256(b);
    return BigInt(this.octal(b));
  }

  private base256(b: Uint8Array): bigint {
    const inv = (b[0]! & 0x40) !== 0 ? 0xff : 0;
    let x = 0n;
    for (let i = 0; i < b.length; i += 1) {
      let c = b[i]! ^ inv;
      if (i === 0) c &= 0x7f;
      if (x >> 56n > 0n) {
        this.err = true;
        return 0n;
      }
      x = (x << 8n) | BigInt(c);
    }
    if (x >> 63n > 0n) {
      this.err = true;
      return 0n;
    }
    return inv ? -x - 1n : x;
  }

  /** parseOctal: trim spaces and NULs at both ends, stop at a NUL, octal digits only. */
  octal(b: Uint8Array): number {
    let start = 0;
    let end = b.length;
    while (start < end && (b[start] === 0x20 || b[start] === 0)) start += 1;
    while (end > start && (b[end - 1] === 0x20 || b[end - 1] === 0)) end -= 1;
    if (start === end) return 0;
    const nul = b.indexOf(0, start);
    if (nul >= 0 && nul < end) end = nul;
    let x = 0;
    for (let i = start; i < end; i += 1) {
      const c = b[i]! - 0x30;
      if (c < 0 || c > 7) {
        this.err = true;
        return 0;
      }
      x = x * 8 + c;
    }
    return x;
  }
}

/** parseString: the bytes up to the first NUL. */
function cstr(b: Uint8Array, start: number, end: number): string {
  const nul = b.indexOf(0, start);
  return binary(b, start, nul >= 0 && nul < end ? nul : end);
}

function isZero(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i += 1) if (b[i] !== 0) return false;
  return true;
}

/** block.getFormat: 0 when the checksum fails. */
function formatOf(blk: Uint8Array): number {
  const p = new Numbers();
  const value = p.octal(blk.subarray(148, 156));
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i += 1) {
    const c = i >= 148 && i < 156 ? 0x20 : blk[i]!;
    unsigned += c;
    signed += c > 127 ? c - 256 : c;
  }
  if (p.err || (value !== unsigned && value !== signed)) return 0;
  const magic = binary(blk, 257, 263);
  const version = binary(blk, 263, 265);
  const trailer = binary(blk, 508, 512);
  if (magic === 'ustar\0' && trailer === 'tar\0') return F_STAR;
  if (magic === 'ustar\0') return F_USTAR | F_PAX;
  if (magic === 'ustar ' && version === ' \0') return F_GNU;
  return F_V7;
}

/** The data of the current entry: a plain run of bytes. */
class RegReader {
  constructor(
    private readonly src: Bytes,
    /** Physical bytes left. */
    public nb: number,
  ) {}

  physicalRemaining(): number {
    return this.nb;
  }

  /** io.ReadAll(io.LimitReader(entry, max)). */
  async readCapped(max: number): Promise<Uint8Array> {
    return this.readSome(max);
  }

  /** Up to `n` bytes; fewer only when the entry ends. */
  async readSome(n: number): Promise<Uint8Array> {
    const want = Math.min(n, this.nb);
    const data = await this.src.read(want);
    this.nb -= data.length;
    if (data.length < want) throw truncatedError();
    return data;
  }

  /** Hands every remaining byte to `sink`, chunk by chunk (views, not copies). */
  async readAll(sink: (chunk: Uint8Array) => void): Promise<void> {
    while (this.nb > 0) {
      if (!(await this.src.more())) throw truncatedError();
      const part = this.src.take(this.nb);
      this.nb -= part.length;
      sink(part);
    }
  }

  /** Feeds `n` physical bytes to `sink`; false when the entry has fewer (io.EOF). */
  async feed(n: number, sink: (chunk: Uint8Array) => void): Promise<boolean> {
    let need = n;
    while (need > 0) {
      if (this.nb === 0) return false;
      if (!(await this.src.more())) throw truncatedError();
      const part = this.src.take(Math.min(need, this.nb));
      this.nb -= part.length;
      need -= part.length;
      sink(part);
    }
    return true;
  }
}

/** The logical data of a sparse entry: holes read back as zeros (sparseFileReader). */
class SparseReader {
  private pos = 0;

  constructor(
    private readonly fr: RegReader,
    private readonly holes: { offset: number; end: number }[],
  ) {}

  physicalRemaining(): number {
    return this.fr.nb;
  }

  private logicalRemaining(): number {
    return this.holes[this.holes.length - 1]!.end - this.pos;
  }

  async readCapped(max: number): Promise<Uint8Array> {
    const left = this.logicalRemaining();
    const want = Math.min(max, left);
    const out = new Uint8Array(want);
    let at = 0;
    await this.pull(want, (chunk) => {
      out.set(chunk, at);
      at += chunk.length;
    });
    // A read that reaches the logical end checks that no data is left over.
    if (max > 0 && max >= left && this.fr.nb > 0) throw headerError('sparse_unreferenced_data');
    return out;
  }

  async readAll(sink: (chunk: Uint8Array) => void): Promise<void> {
    await this.pull(this.logicalRemaining(), sink);
    if (this.fr.nb > 0) throw headerError('sparse_unreferenced_data');
  }

  private async pull(n: number, sink: (chunk: Uint8Array) => void): Promise<void> {
    let left = n;
    while (left > 0) {
      const hole = this.holes[0]!;
      let k: number;
      if (this.pos < hole.offset) {
        k = Math.min(left, hole.offset - this.pos);
        if (!(await this.fr.feed(k, sink))) throw headerError('sparse_missing_data');
      } else {
        k = Math.min(left, hole.end - this.pos);
        for (let z = k; z > 0; z -= ZERO_CHUNK.length) {
          sink(ZERO_CHUNK.subarray(0, Math.min(z, ZERO_CHUNK.length)));
        }
      }
      this.pos += k;
      left -= k;
      if (this.pos >= hole.end && this.holes.length > 1) this.holes.shift();
    }
  }
}

/** parsePAXRecord: "%d %s=%s\n". */
function paxRecord(s: string): { key: string; value: string; rest: string } | null {
  const [count, rest, spaced] = cut(s, ' ');
  if (!spaced) return null;
  const n = parseInt64(count);
  if (n === null || n < 5n || n > BigInt(s.length)) return null;
  const m = Number(n) - (count.length + 1);
  if (m <= 0) return null;
  if (rest.slice(m - 1, m) !== '\n') return null;
  const [key, value, equals] = cut(rest.slice(0, m - 1), '=');
  if (!equals) return null;
  if (key === '' || key.includes('=')) return null;
  const named = key === 'path' || key === 'linkpath' || key === 'uname' || key === 'gname';
  if (named ? value.includes('\0') : key.includes('\0')) return null;
  return { key, value, rest: rest.slice(m) };
}

function parsePax(data: Uint8Array): Map<string, string> {
  let s = binary(data);
  const sparseMap: string[] = [];
  const out = new Map<string, string>();
  while (s.length > 0) {
    const record = paxRecord(s);
    if (!record) throw headerError('pax');
    s = record.rest;
    const { key, value } = record;
    if (key === 'GNU.sparse.offset' || key === 'GNU.sparse.numbytes') {
      const even = sparseMap.length % 2 === 0;
      if (
        (even && key !== 'GNU.sparse.offset') ||
        (!even && key !== 'GNU.sparse.numbytes') ||
        value.includes(',')
      ) {
        throw headerError('pax');
      }
      sparseMap.push(value);
    } else {
      out.set(key, value);
    }
  }
  if (sparseMap.length > 0) out.set('GNU.sparse.map', sparseMap.join(','));
  return out;
}

/** parsePAXTime validity: seconds, optionally a dot and digits. */
function paxTimeValid(s: string): boolean {
  const [seconds, fraction] = cut(s, '.');
  if (parseInt64(seconds) === null) return false;
  return fraction === '' || /^[0-9]*$/.test(fraction);
}

/** mergePAX: false where Go returns ErrHeader. */
function mergePax(h: Header, pax: Map<string, string> | null): boolean {
  if (pax) {
    for (const [key, value] of pax) {
      if (value === '') continue;
      switch (key) {
        case 'path':
          h.name = value;
          break;
        case 'uid':
        case 'gid':
          if (parseInt64(value) === null) return false;
          break;
        case 'atime':
        case 'mtime':
        case 'ctime':
          if (!paxTimeValid(value)) return false;
          break;
        case 'size': {
          const n = parseInt64(value);
          if (n === null) return false;
          h.size = Number(n);
          break;
        }
      }
    }
  }
  h.pax = pax;
  return true;
}

function appendSparse(list: SparseEntry[], entry: SparseEntry): void {
  if (list.length >= MAX_SPARSE_ENTRIES) throw headerError('sparse_too_long');
  list.push(entry);
}

function validSparse(list: SparseEntry[], size: bigint): boolean {
  if (size < 0n) return false;
  let previousEnd = 0n;
  for (const cur of list) {
    if (cur.offset < 0n || cur.length < 0n) return false;
    if (cur.offset > INT64_MAX - cur.length) return false;
    if (cur.offset + cur.length > size) return false;
    if (previousEnd > cur.offset) return false;
    previousEnd = cur.offset + cur.length;
  }
  return true;
}

function holesOf(list: SparseEntry[], size: bigint): { offset: number; end: number }[] {
  const out: { offset: number; end: number }[] = [];
  let at = 0n;
  for (const cur of list) {
    if (cur.length === 0n) continue;
    if (cur.offset - at > 0n) out.push({ offset: Number(at), end: Number(cur.offset) });
    at = cur.offset + cur.length;
  }
  out.push({ offset: Number(at), end: Number(size) });
  return out;
}

export class TarReader {
  private curr: RegReader | SparseReader;
  private pad = 0;
  private failure: unknown = null;

  constructor(private readonly src: Bytes) {
    this.curr = new RegReader(src, 0);
  }

  /** The next entry, or null at the end of the archive. Errors stick. */
  async next(): Promise<TarEntry | null> {
    if (this.failure) throw this.failure;
    try {
      return await this.advance();
    } catch (error) {
      this.failure = error;
      throw error;
    }
  }

  /** Up to `max` bytes of the current entry (io.ReadAll over io.LimitReader). */
  async readCapped(max: number): Promise<Uint8Array> {
    if (this.failure) throw this.failure;
    try {
      return await this.curr.readCapped(max);
    } catch (error) {
      this.failure = error;
      throw error;
    }
  }

  /** Every remaining byte of the current entry, chunk by chunk. */
  async readAll(sink: (chunk: Uint8Array) => void): Promise<void> {
    if (this.failure) throw this.failure;
    try {
      await this.curr.readAll(sink);
    } catch (error) {
      this.failure = error;
      throw error;
    }
  }

  private async advance(): Promise<TarEntry | null> {
    let pax: Map<string, string> | null = null;
    let longName = '';
    for (;;) {
      const remaining = this.curr.physicalRemaining();
      if (remaining > 0 && (await this.src.skip(remaining)) < remaining) throw truncatedError();
      this.curr = new RegReader(this.src, 0);
      // A stream that ends inside the padding is a clean end (tryReadFull).
      if (this.pad > 0 && (await this.src.skip(this.pad)) < this.pad) return null;
      this.pad = 0;

      const read = await this.readHeader();
      if (!read) return null;
      const { header: h, block } = read;
      this.handleRegularFile(h);

      if (h.type === 'x' || h.type === 'g') {
        pax = parsePax(await this.readSpecialFile());
        if (h.type === 'g') {
          mergePax(h, pax);
          return { name: h.name, type: 'g', size: 0, sparse: false };
        }
        continue;
      }
      if (h.type === 'L' || h.type === 'K') {
        const data = await this.readSpecialFile();
        const nul = data.indexOf(0);
        if (h.type === 'L') longName = binary(data, 0, nul >= 0 ? nul : data.length);
        continue;
      }
      if (!mergePax(h, pax)) throw headerError();
      if (longName !== '') h.name = longName;
      if (h.type === '\0') h.type = h.name.endsWith('/') ? '5' : '0';
      this.handleRegularFile(h);
      const sparse = await this.handleSparseFile(h, block);
      return { name: h.name, type: h.type, size: h.size, sparse };
    }
  }

  private handleRegularFile(h: Header): void {
    const nb = HEADER_ONLY.has(h.type) ? 0 : h.size;
    if (nb < 0) throw headerError();
    this.pad = (BLOCK - (nb % BLOCK)) % BLOCK;
    this.curr = new RegReader(this.src, nb);
  }

  private async readSpecialFile(): Promise<Uint8Array> {
    const data = await this.curr.readCapped(MAX_SPECIAL_FILE + 1);
    if (data.length > MAX_SPECIAL_FILE) throw headerError('field_too_long');
    return data;
  }

  private async readBlock(): Promise<Uint8Array | null> {
    const blk = await this.src.read(BLOCK);
    if (blk.length === 0) return null;
    if (blk.length < BLOCK) throw truncatedError();
    return blk;
  }

  private async readHeader(): Promise<{ header: Header; block: Uint8Array } | null> {
    const blk = await this.readBlock();
    if (!blk) return null;
    if (isZero(blk)) {
      const second = await this.readBlock();
      if (!second || isZero(second)) return null;
      throw headerError();
    }
    const format = formatOf(blk);
    if (format === 0) throw headerError();
    const p = new Numbers();
    let name = cstr(blk, 0, 100);
    const size = p.numeric(blk.subarray(124, 136));
    p.numeric(blk.subarray(100, 108));
    p.numeric(blk.subarray(108, 116));
    p.numeric(blk.subarray(116, 124));
    p.numeric(blk.subarray(136, 148));
    if (format > F_V7) {
      p.numeric(blk.subarray(329, 337));
      p.numeric(blk.subarray(337, 345));
      let prefix = '';
      if ((format & (F_USTAR | F_PAX)) !== 0) {
        prefix = cstr(blk, 345, 500);
      } else if ((format & F_STAR) !== 0) {
        prefix = cstr(blk, 345, 476);
        p.numeric(blk.subarray(476, 488));
        p.numeric(blk.subarray(488, 500));
      } else if ((format & F_GNU) !== 0) {
        // Archives of old Go writers put a USTAR prefix where GNU keeps times.
        const times = new Numbers();
        if (blk[345] !== 0) times.numeric(blk.subarray(345, 357));
        if (blk[357] !== 0) times.numeric(blk.subarray(357, 369));
        if (times.err) {
          const s = cstr(blk, 345, 500);
          if (isAsciiC(s)) prefix = s;
        }
      }
      if (prefix.length > 0) name = `${prefix}/${name}`;
    }
    if (p.err) throw headerError();
    return {
      header: { name, type: String.fromCharCode(blk[156]!), size, pax: null },
      block: blk,
    };
  }

  private async handleSparseFile(h: Header, block: Uint8Array): Promise<boolean> {
    const list = h.type === 'S' ? await this.oldGnuSparseMap(h, block) : await this.paxSparseMap(h);
    if (!list) return false;
    const size = BigInt(Math.trunc(h.size));
    if (HEADER_ONLY.has(h.type) || !validSparse(list, size)) throw headerError('sparse');
    this.curr = new SparseReader(this.curr as RegReader, holesOf(list, size));
    return true;
  }

  private async oldGnuSparseMap(h: Header, block: Uint8Array): Promise<SparseEntry[]> {
    if (formatOf(block) !== F_GNU) throw headerError();
    const p = new Numbers();
    h.size = p.numeric(block.subarray(483, 495));
    if (p.err) throw headerError();
    let s = block.subarray(386, 386 + 24 * 4 + 1);
    const list: SparseEntry[] = [];
    let total = s.length;
    while (total < MAX_SPECIAL_FILE) {
      const max = Math.floor(s.length / 24);
      for (let i = 0; i < max; i += 1) {
        if (s[i * 24] === 0) break;
        const offset = p.numericBig(s.subarray(i * 24, i * 24 + 12));
        const length = p.numericBig(s.subarray(i * 24 + 12, i * 24 + 24));
        if (p.err) throw headerError();
        appendSparse(list, { offset, length });
      }
      if (s[max * 24]! > 0) {
        const ext = await this.src.read(BLOCK);
        if (ext.length < BLOCK) throw truncatedError();
        s = ext;
        total += s.length;
        continue;
      }
      return list;
    }
    throw headerError('sparse_too_long');
  }

  private async paxSparseMap(h: Header): Promise<SparseEntry[] | null> {
    const get = (key: string) => h.pax?.get(key) ?? '';
    const major = get('GNU.sparse.major');
    const minor = get('GNU.sparse.minor');
    let v1: boolean;
    if (major === '0' && (minor === '0' || minor === '1')) v1 = false;
    else if (major === '1' && minor === '0') v1 = true;
    else if (major !== '' || minor !== '') return null;
    else if (get('GNU.sparse.map') !== '') v1 = false;
    else return null;
    const name = get('GNU.sparse.name');
    if (name !== '') h.name = name;
    let size = get('GNU.sparse.size');
    if (size === '') size = get('GNU.sparse.realsize');
    if (size !== '') {
      const n = parseInt64(size);
      if (n === null) throw headerError();
      h.size = Number(n);
    }
    return v1 ? this.sparseMap1x0() : sparseMap0x1(get);
  }

  /** GNU PAX sparse 1.0: the map is in the data, as decimal lines in whole blocks. */
  private async sparseMap1x0(): Promise<SparseEntry[]> {
    const fr = this.curr as RegReader;
    let lines = 0;
    let buf = '';
    let total = 0;
    const feed = async (n: bigint) => {
      while (BigInt(lines) < n) {
        total += BLOCK;
        if (total > MAX_SPECIAL_FILE) throw headerError('sparse_too_long');
        const blk = await fr.readSome(BLOCK);
        if (blk.length < BLOCK) throw truncatedError();
        buf += binary(blk);
        for (let i = 0; i < blk.length; i += 1) if (blk[i] === 10) lines += 1;
      }
    };
    const token = () => {
      lines -= 1;
      const i = buf.indexOf('\n');
      const tok = i < 0 ? buf : buf.slice(0, i + 1);
      buf = i < 0 ? '' : buf.slice(i + 1);
      return trimRightChars(tok, '\n');
    };
    await feed(1n);
    const count = parseInt64(token());
    if (count === null || count < 0n || count >= TWO_62) throw headerError();
    await feed(2n * count);
    const list: SparseEntry[] = [];
    for (let i = 0n; i < count; i += 1n) {
      const offset = parseInt64(token());
      const length = parseInt64(token());
      if (offset === null || length === null) throw headerError();
      appendSparse(list, { offset, length });
    }
    return list;
  }
}

/** GNU PAX sparse 0.0 and 0.1: the map is in the PAX records. */
function sparseMap0x1(get: (key: string) => string): SparseEntry[] {
  const count = parseInt64(get('GNU.sparse.numblocks'));
  if (count === null || count < 0n || count >= TWO_62) throw headerError();
  let parts = get('GNU.sparse.map').split(',');
  if (parts.length === 1 && parts[0] === '') parts = [];
  if (BigInt(parts.length) !== 2n * count) throw headerError();
  const list: SparseEntry[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const offset = parseInt64(parts[i]!);
    const length = parseInt64(parts[i + 1]!);
    if (offset === null || length === null) throw headerError();
    appendSparse(list, { offset, length });
  }
  return list;
}
