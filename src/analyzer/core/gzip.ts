// A streaming gzip reader with the behavior of Go's compress/gzip (the reader
// of the migration parser), so the result never depends on the runtime: the
// DecompressionStream of browsers and of some Node versions stops at the end
// of the first member, others go on, and zlib may drop the output of a chunk
// when junk follows the last member.
//
// - Every member is read in turn (Go reads gzip "multistream" by default).
// - Like Go, the trailer (CRC-32 and size) and the header of the next member
//   are read only when more output is asked for after the end of a member: a
//   tar that ends inside the last member never looks at what follows it.
// - The inflater follows compress/flate: complete Huffman codes only (a single
//   one-bit code is accepted), at most 286 literal and 30 distance codes, no
//   distance beyond the history, no extra input read after the last block.
// - Errors: a stream that ends early is `truncated`; corrupt data, a bad
//   header or a checksum that does not match is `invalid`.

import type { StreamFailure } from './source.js';

export class GzipError extends Error {
  constructor(readonly kind: StreamFailure) {
    super(`gzip_${kind}`);
    this.name = 'GzipError';
  }
}

const WINDOW = 32 * 1024;
const OUT_CHUNK = 512 * 1024;
const OUT_SIZE = WINDOW + OUT_CHUNK;
/** Bytes ahead of the reading position that make one symbol safe to decode. */
const SYMBOL_AHEAD = 16;
/** Bytes ahead that make a whole block header safe to decode. */
const HEADER_AHEAD = 1024;
/** Zero bytes put after the real end, so reads never run off the buffer. */
const PADDING = 2048;

const LEN_BASE = Uint16Array.of(
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
);
const LEN_EXTRA = Uint8Array.of(
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
);
const DIST_BASE = Uint16Array.of(
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12289,
  16385,
  24577,
);
const DIST_EXTRA = Uint8Array.of(
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
);
const CODE_ORDER = Uint8Array.of(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15);

// ------------------------------------------------------------------ CRC-32

const CRC = (() => {
  const t = new Int32Array(256 * 8);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  for (let n = 0; n < 256; n += 1) {
    for (let k = 1; k < 8; k += 1) {
      const prev = t[(k - 1) * 256 + n]!;
      t[k * 256 + n] = (prev >>> 8) ^ t[prev & 0xff]!;
    }
  }
  return t;
})();

/** CRC-32 (IEEE) of b[start, end), continuing `crc`. */
export function crc32(crc: number, b: Uint8Array, start = 0, end = b.length): number {
  let c = ~crc;
  let i = start;
  for (; i + 8 <= end; i += 8) {
    c ^= b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24);
    const hi = b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24);
    c =
      CRC[1792 + (c & 0xff)]! ^
      CRC[1536 + ((c >>> 8) & 0xff)]! ^
      CRC[1280 + ((c >>> 16) & 0xff)]! ^
      CRC[1024 + (c >>> 24)]! ^
      CRC[768 + (hi & 0xff)]! ^
      CRC[512 + ((hi >>> 8) & 0xff)]! ^
      CRC[256 + ((hi >>> 16) & 0xff)]! ^
      CRC[hi >>> 24]!;
  }
  for (; i < end; i += 1) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

// ----------------------------------------------------------------- Huffman

interface Huffman {
  /** Indexed by the next `bits` input bits: (symbol << 4) | code length; 0 = no code. */
  table: Int32Array;
  bits: number;
  mask: number;
  empty: boolean;
}

const EMPTY_TREE: Huffman = { table: new Int32Array(1), bits: 0, mask: 0, empty: true };

/** huffmanDecoder.init: null when the code is over-subscribed or incomplete. */
function buildTree(lengths: Uint8Array, n: number): Huffman | null {
  const count = new Int32Array(16);
  let min = 0;
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const l = lengths[i]!;
    if (l === 0) continue;
    if (min === 0 || l < min) min = l;
    if (l > max) max = l;
    count[l]! += 1;
  }
  if (max === 0) return EMPTY_TREE;
  const next = new Int32Array(16);
  let code = 0;
  for (let i = min; i <= max; i += 1) {
    code <<= 1;
    next[i] = code;
    code += count[i]!;
  }
  if (code !== 1 << max && !(code === 1 && max === 1)) return null;
  const size = 1 << max;
  const table = new Int32Array(size);
  for (let s = 0; s < n; s += 1) {
    const l = lengths[s]!;
    if (l === 0) continue;
    let c = next[l]!;
    next[l] = c + 1;
    let rev = 0;
    for (let k = 0; k < l; k += 1) {
      rev = (rev << 1) | (c & 1);
      c >>= 1;
    }
    const entry = (s << 4) | l;
    for (let k = rev; k < size; k += 1 << l) table[k] = entry;
  }
  return { table, bits: max, mask: size - 1, empty: false };
}

const FIXED_LIT = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  return buildTree(l, 288)!;
})();
const FIXED_DIST = buildTree(new Uint8Array(32).fill(5), 32)!;

// ------------------------------------------------------------------ reader

const NEED_INPUT = 1;
const NEED_FLUSH = 2;
const BLOCK_END = 3;
type Step = typeof NEED_INPUT | typeof NEED_FLUSH | typeof BLOCK_END;

class Decoder {
  private buf: Uint8Array = new Uint8Array(0);
  private p = 0;
  /** Index of the first padding byte once the input has ended, else -1. */
  private realEnd = -1;
  private bb = 0;
  private bc = 0;
  private readonly out = new Uint8Array(OUT_SIZE);
  private wp = 0;
  private emitFrom = 0;
  /** Output bytes of the current member (the history available to distances). */
  private memberOut = 0;
  private crc = 0;
  private size = 0;
  // the block being decoded
  private lit: Huffman = FIXED_LIT;
  private dist: Huffman = FIXED_DIST;
  private stored = 0;

  constructor(
    private readonly it: AsyncIterator<Uint8Array>,
    private readonly checksum: (crc: number, data: Uint8Array) => number,
  ) {}

  private get ended(): boolean {
    return this.realEnd >= 0;
  }

  /** Makes at least `min` bytes available after the position, unless the input ends. */
  private async fill(min: number): Promise<void> {
    while (this.buf.length - this.p < min && !this.ended) {
      const r = await this.it.next();
      // Keep the bytes still in the bit buffer: the trailer may start in them.
      const keep = Math.max(0, this.p - ((this.bc + 7) >> 3));
      const tail = this.buf.subarray(keep);
      const p = this.p - keep;
      if (r.done) {
        const padded = new Uint8Array(tail.length + PADDING);
        padded.set(tail);
        this.buf = padded;
        this.p = p;
        this.realEnd = tail.length;
        return;
      }
      if (r.value.length === 0) continue;
      if (tail.length === 0) this.buf = r.value;
      else {
        const joined = new Uint8Array(tail.length + r.value.length);
        joined.set(tail);
        joined.set(r.value, tail.length);
        this.buf = joined;
      }
      this.p = p;
    }
  }

  /** Bits consumed past the real end of the input (the stream was cut short). */
  private overrun(): boolean {
    return this.ended && this.p * 8 - this.bc > this.realEnd * 8;
  }

  private corrupt(): GzipError {
    return new GzipError(this.overrun() ? 'truncated' : 'invalid');
  }

  private need(n: number): void {
    while (this.bc < n) {
      this.bb |= this.buf[this.p++]! << this.bc;
      this.bc += 8;
    }
  }

  private bits(n: number): number {
    this.need(n);
    const v = this.bb & ((1 << n) - 1);
    this.bb >>>= n;
    this.bc -= n;
    return v;
  }

  private symbol(tree: Huffman): number {
    if (tree.empty) throw this.corrupt();
    this.need(tree.bits);
    const e = tree.table[this.bb & tree.mask]!;
    const l = e & 15;
    if (l === 0) throw this.corrupt();
    this.bb >>>= l;
    this.bc -= l;
    return e >>> 4;
  }

  /** Reads whole bytes from the input (header and trailer fields); fewer at the end. */
  private async bytes(n: number): Promise<Uint8Array | null> {
    await this.fill(n);
    const available = this.ended ? this.realEnd - this.p : this.buf.length - this.p;
    if (available < n) return null;
    const out = this.buf.slice(this.p, this.p + n);
    this.p += n;
    return out;
  }

  /** readHeader: 'eof' when the input ends right here (no more members). */
  private async header(): Promise<'ok' | 'eof'> {
    await this.fill(10);
    const available = this.ended ? this.realEnd - this.p : this.buf.length - this.p;
    if (available === 0) return 'eof';
    const h = await this.bytes(10);
    if (!h) throw new GzipError('truncated');
    if (h[0] !== 0x1f || h[1] !== 0x8b || h[2] !== 8) throw new GzipError('invalid');
    const flags = h[3]!;
    let digest = crc32(0, h);
    if (flags & 4) {
      const xlen = await this.bytes(2);
      if (!xlen) throw new GzipError('truncated');
      digest = crc32(digest, xlen);
      const extra = await this.bytes(xlen[0]! | (xlen[1]! << 8));
      if (!extra) throw new GzipError('truncated');
      digest = crc32(digest, extra);
    }
    for (const flag of [8, 16]) {
      if (!(flags & flag)) continue;
      // A NUL-terminated name or comment, at most 511 bytes (Go's buffer).
      const text: number[] = [];
      for (;;) {
        if (text.length >= 512) throw new GzipError('invalid');
        const b = await this.bytes(1);
        if (!b) throw new GzipError('truncated');
        text.push(b[0]!);
        if (b[0] === 0) break;
      }
      digest = crc32(digest, Uint8Array.from(text));
    }
    if (flags & 2) {
      const hcrc = await this.bytes(2);
      if (!hcrc) throw new GzipError('truncated');
      if ((hcrc[0]! | (hcrc[1]! << 8)) !== (digest & 0xffff)) throw new GzipError('invalid');
    }
    this.bb = 0;
    this.bc = 0;
    this.wp = 0;
    this.emitFrom = 0;
    this.memberOut = 0;
    this.crc = 0;
    this.size = 0;
    return 'ok';
  }

  /** The output written since the last emission, with its checksum counted. */
  private take(): Uint8Array | null {
    if (this.wp === this.emitFrom) return null;
    const chunk = this.out.slice(this.emitFrom, this.wp);
    this.crc = this.checksum(this.crc, chunk);
    this.size = (this.size + chunk.length) >>> 0;
    this.emitFrom = this.wp;
    return chunk;
  }

  /** Keeps the last 32 KiB as history at the start of the output buffer. */
  private rotate(): void {
    if (this.wp < OUT_SIZE - 258) return;
    this.out.copyWithin(0, this.wp - WINDOW, this.wp);
    this.wp = WINDOW;
    this.emitFrom = WINDOW;
  }

  /** readHuffman: the trees of a dynamic block. */
  private dynamicTrees(): void {
    const nlit = this.bits(5) + 257;
    if (nlit > 286) throw this.corrupt();
    const ndist = this.bits(5) + 1;
    if (ndist > 30) throw this.corrupt();
    const nclen = this.bits(4) + 4;
    const codeBits = new Uint8Array(19);
    for (let i = 0; i < nclen; i += 1) codeBits[CODE_ORDER[i]!] = this.bits(3);
    const codeTree = buildTree(codeBits, 19);
    if (!codeTree) throw this.corrupt();
    const lengths = new Uint8Array(nlit + ndist);
    for (let i = 0; i < nlit + ndist; ) {
      const x = this.symbol(codeTree);
      if (x < 16) {
        lengths[i++] = x;
        continue;
      }
      let rep: number;
      let value = 0;
      if (x === 16) {
        if (i === 0) throw this.corrupt();
        rep = 3 + this.bits(2);
        value = lengths[i - 1]!;
      } else if (x === 17) rep = 3 + this.bits(3);
      else rep = 11 + this.bits(7);
      if (i + rep > nlit + ndist) throw this.corrupt();
      lengths.fill(value, i, i + rep);
      i += rep;
    }
    const lit = buildTree(lengths, nlit);
    const dist = buildTree(lengths.subarray(nlit), ndist);
    if (!lit || !dist) throw this.corrupt();
    this.lit = lit;
    this.dist = dist;
  }

  /** Decodes symbols of a Huffman block until it ends, the input runs low or the output is full. */
  private huffman(): Step {
    const buf = this.buf;
    const out = this.out;
    const lit = this.lit.table;
    const litMask = this.lit.mask;
    const litBits = this.lit.bits;
    const distTree = this.dist;
    const distTable = distTree.table;
    const distMask = distTree.mask;
    const distBits = distTree.bits;
    const distEmpty = distTree.empty;
    const limit = buf.length - SYMBOL_AHEAD;
    // Past this bit the input is padding: the stream was cut short.
    const realBits = this.ended ? this.realEnd * 8 : Number.POSITIVE_INFINITY;
    let p = this.p;
    let bb = this.bb;
    let bc = this.bc;
    let wp = this.wp;
    let history = this.memberOut;
    const save = () => {
      this.p = p;
      this.bb = bb;
      this.bc = bc;
      this.memberOut = history;
      this.wp = wp;
    };
    for (;;) {
      if (p > limit) {
        save();
        if (this.ended) throw new GzipError('truncated');
        return NEED_INPUT;
      }
      if (wp > OUT_SIZE - 258) {
        save();
        return NEED_FLUSH;
      }
      while (bc < litBits) {
        bb |= buf[p++]! << bc;
        bc += 8;
      }
      const e = lit[bb & litMask]!;
      const l = e & 15;
      if (l === 0) {
        save();
        throw this.corrupt();
      }
      bb >>>= l;
      bc -= l;
      const sym = e >>> 4;
      if (p * 8 - bc > realBits) {
        save();
        throw new GzipError('truncated');
      }
      if (sym < 256) {
        out[wp++] = sym;
        history += 1;
        continue;
      }
      if (sym === 256) {
        save();
        return BLOCK_END;
      }
      const li = sym - 257;
      if (li >= 29) {
        save();
        throw this.corrupt();
      }
      let length = LEN_BASE[li]!;
      const lx = LEN_EXTRA[li]!;
      if (lx > 0) {
        while (bc < lx) {
          bb |= buf[p++]! << bc;
          bc += 8;
        }
        length += bb & ((1 << lx) - 1);
        bb >>>= lx;
        bc -= lx;
      }
      if (distEmpty) {
        save();
        throw this.corrupt();
      }
      while (bc < distBits) {
        bb |= buf[p++]! << bc;
        bc += 8;
      }
      const de = distTable[bb & distMask]!;
      const dl = de & 15;
      if (dl === 0) {
        save();
        throw this.corrupt();
      }
      bb >>>= dl;
      bc -= dl;
      const ds = de >>> 4;
      if (ds >= 30) {
        save();
        throw this.corrupt();
      }
      let distance = DIST_BASE[ds]!;
      const dx = DIST_EXTRA[ds]!;
      if (dx > 0) {
        while (bc < dx) {
          bb |= buf[p++]! << bc;
          bc += 8;
        }
        distance += bb & ((1 << dx) - 1);
        bb >>>= dx;
        bc -= dx;
      }
      if (p * 8 - bc > realBits) {
        save();
        throw new GzipError('truncated');
      }
      if (distance > (history < WINDOW ? history : WINDOW)) {
        save();
        throw this.corrupt();
      }
      let from = wp - distance;
      if (distance >= length && length > 16) {
        out.copyWithin(wp, from, from + length);
        wp += length;
      } else {
        for (let k = 0; k < length; k += 1) out[wp++] = out[from++]!;
      }
      history += length;
    }
  }

  /** Copies the data of a stored block; 'end' when the block is done. */
  private storedCopy(): Step {
    while (this.stored > 0 && this.bc >= 8) {
      if (this.wp >= OUT_SIZE) return NEED_FLUSH;
      this.out[this.wp++] = this.bb & 0xff;
      this.bb >>>= 8;
      this.bc -= 8;
      this.stored -= 1;
      this.memberOut += 1;
    }
    while (this.stored > 0) {
      const available = (this.ended ? this.realEnd : this.buf.length) - this.p;
      if (available <= 0) {
        if (this.ended) throw new GzipError('truncated');
        return NEED_INPUT;
      }
      const room = OUT_SIZE - this.wp;
      if (room <= 0) return NEED_FLUSH;
      const n = Math.min(this.stored, available, room);
      this.out.set(this.buf.subarray(this.p, this.p + n), this.wp);
      this.p += n;
      this.wp += n;
      this.stored -= n;
      this.memberOut += n;
    }
    return BLOCK_END;
  }

  /** Members in turn; yields the output, checks each trailer only when asked for more. */
  async *run(): AsyncGenerator<Uint8Array> {
    let first = true;
    for (;;) {
      const h = await this.header();
      if (h === 'eof') {
        // Go reads at least one header: an empty stream is a cut gzip file.
        if (first) throw new GzipError('truncated');
        return;
      }
      first = false;
      let last = false;
      while (!last) {
        await this.fill(HEADER_AHEAD);
        last = this.bits(1) === 1;
        const type = this.bits(2);
        let step: Step;
        if (type === 0) {
          this.bb >>>= this.bc & 7;
          this.bc -= this.bc & 7;
          const len = this.bits(16);
          const nlen = this.bits(16);
          if (this.overrun()) throw new GzipError('truncated');
          if (len !== (~nlen & 0xffff)) throw this.corrupt();
          this.stored = len;
          for (;;) {
            step = this.storedCopy();
            if (step === BLOCK_END) break;
            if (step === NEED_INPUT) await this.fill(1);
            else {
              const chunk = this.take();
              if (chunk) yield chunk;
              this.rotate();
            }
          }
          continue;
        }
        if (type === 3) throw this.corrupt();
        if (type === 1) {
          this.lit = FIXED_LIT;
          this.dist = FIXED_DIST;
        } else {
          this.dynamicTrees();
        }
        if (this.overrun()) throw new GzipError('truncated');
        for (;;) {
          step = this.huffman();
          if (step === BLOCK_END) break;
          if (step === NEED_INPUT) await this.fill(SYMBOL_AHEAD + 1);
          else {
            const chunk = this.take();
            if (chunk) yield chunk;
            this.rotate();
          }
        }
      }
      const rest = this.take();
      if (rest) yield rest;
      // The trailer starts at the next byte: give back the whole bytes the
      // bit buffer read ahead (fill() keeps them in the input buffer).
      this.p -= this.bc >> 3;
      this.bb = 0;
      this.bc = 0;
      if (this.overrun()) throw new GzipError('truncated');
      const trailer = await this.bytes(8);
      if (!trailer) throw new GzipError('truncated');
      const digest =
        (trailer[0]! | (trailer[1]! << 8) | (trailer[2]! << 16) | (trailer[3]! << 24)) >>> 0;
      const size =
        (trailer[4]! | (trailer[5]! << 8) | (trailer[6]! << 16) | (trailer[7]! << 24)) >>> 0;
      if (digest !== this.crc || size !== this.size) throw new GzipError('invalid');
    }
  }

  async close(): Promise<void> {
    try {
      await this.it.return?.();
    } catch {
      // Already closed.
    }
  }
}

export interface GunzipOptions {
  /** A faster CRC-32 with the same result (zlib.crc32 on Node), when there is one. */
  crc32?: (crc: number, data: Uint8Array) => number;
}

/** Decompresses a gzip stream (every member) chunk by chunk. */
export async function* gunzip(
  raw: AsyncIterable<Uint8Array>,
  options: GunzipOptions = {},
): AsyncGenerator<Uint8Array> {
  const checksum = options.crc32 ?? ((crc: number, data: Uint8Array) => crc32(crc, data));
  const decoder = new Decoder(raw[Symbol.asyncIterator](), checksum);
  try {
    yield* decoder.run();
  } finally {
    await decoder.close();
  }
}

/** The kind of a failure of `gunzip`. */
export function classifyGzipError(error: unknown): StreamFailure | null {
  return error instanceof GzipError ? error.kind : null;
}
