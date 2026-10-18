// A pull reader over the decompressed bytes of the backup. It hands out
// slices of the chunks it receives (no copy for skipped data), counts what it
// delivered and turns stream failures into archive errors.

import { AnalyzerError, abortError } from './errors.js';

export type StreamFailure = 'truncated' | 'invalid';

const EMPTY = new Uint8Array(0);

export class Bytes {
  private buf: Uint8Array = EMPTY;
  private off = 0;
  private ended = false;
  /** Decompressed bytes handed out so far. */
  delivered = 0;

  constructor(
    private readonly it: AsyncIterator<Uint8Array>,
    private readonly classify: (error: unknown) => StreamFailure | null,
    private readonly signal?: AbortSignal,
  ) {}

  /** Makes sure unread bytes are buffered; false at the end of the stream. */
  async more(): Promise<boolean> {
    while (this.off >= this.buf.length) {
      if (this.ended) return false;
      if (this.signal?.aborted) throw abortError();
      let result: IteratorResult<Uint8Array>;
      try {
        result = await this.it.next();
      } catch (error) {
        if (this.signal?.aborted) throw abortError();
        const kind = this.classify(error);
        if (kind === 'truncated') throw new AnalyzerError('archive_truncated', 'compressed_stream');
        if (kind === 'invalid') throw new AnalyzerError('archive_invalid', 'compressed_stream');
        throw error;
      }
      if (result.done) {
        this.ended = true;
        this.buf = EMPTY;
        this.off = 0;
        return false;
      }
      this.buf = result.value;
      this.off = 0;
    }
    return true;
  }

  /** Up to `n` buffered bytes (call `more()` first), without copying. */
  take(n: number): Uint8Array {
    const end = Math.min(this.buf.length, this.off + n);
    const out = this.buf.subarray(this.off, end);
    this.delivered += out.length;
    this.off = end;
    return out;
  }

  /** Reads up to `n` bytes; fewer only at the end of the stream. */
  async read(n: number): Promise<Uint8Array> {
    if (n === 0) return EMPTY;
    if (!(await this.more())) return EMPTY;
    if (this.buf.length - this.off >= n) return this.take(n).slice();
    const out = new Uint8Array(n);
    let got = 0;
    while (got < n && (await this.more())) {
      const part = this.take(n - got);
      out.set(part, got);
      got += part.length;
    }
    return got === n ? out : out.subarray(0, got);
  }

  /** Skips up to `n` bytes; returns how many were skipped. */
  async skip(n: number): Promise<number> {
    let left = n;
    while (left > 0 && (await this.more())) left -= this.take(left).length;
    return n - left;
  }

  /** Stops reading: the rest of the stream is never decompressed. */
  async close(): Promise<void> {
    this.ended = true;
    this.buf = EMPTY;
    try {
      await this.it.return?.();
    } catch {
      // A stream torn down while closing has nothing left to say.
    }
  }
}
