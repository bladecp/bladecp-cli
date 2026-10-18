// A Go string is a sequence of bytes. The analyzer keeps every value it reads
// from a backup as a binary string (one character per byte, 0 to 255), so
// lengths, comparisons and regular expressions behave exactly as in the
// migration parser. Text for people is decoded as UTF-8 only at the edge.

const CHUNK = 0x2000;
const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

/** Bytes as a binary string. */
export function binary(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(end, i + CHUNK)) as unknown as number[],
    );
  }
  return out;
}

/** A binary string back to its bytes. */
export function bytesOf(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

/** A binary string read as UTF-8 (invalid sequences become U+FFFD), for display. */
export function text(value: string): string {
  return decoder.decode(bytesOf(value));
}

/** A JavaScript string as the binary string of its UTF-8 bytes. */
export function fromText(value: string): string {
  return binary(encoder.encode(value));
}

/** True when every byte is ASCII and not NUL (Go archive/tar isASCII). */
export function isAsciiC(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0x80 || c === 0) return false;
  }
  return true;
}
