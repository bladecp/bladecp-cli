// @bladecp/cli/analyzer/node: analyze a backup file from Node, streaming it
// from disk. Nothing is sent anywhere. The gzip reader is the one of the core
// (the behavior of Go's reader, the same as in a browser); zlib only lends its
// faster CRC-32 when this Node has one.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import * as zlib from 'node:zlib';

import { type AnalyzeOptions, analyze } from './core/analyze.js';
import { classifyGzipError, gunzip } from './core/gzip.js';
import type { Report } from './core/report.js';
import type { StreamFailure } from './core/source.js';

export * from './index.js';

/** Errors of the gzip reader (and of zlib, for streams made with it): cut short, or corrupt. */
export function classifyZlibError(error: unknown): StreamFailure | null {
  const kind = classifyGzipError(error);
  if (kind) return kind;
  const code = (error as { code?: unknown })?.code;
  if (code === 'Z_BUF_ERROR') return 'truncated';
  if (code === 'Z_DATA_ERROR' || code === 'Z_STREAM_ERROR' || code === 'Z_NEED_DICT')
    return 'invalid';
  return null;
}

const nativeCrc32 = (zlib as { crc32?: (data: Uint8Array, value?: number) => number }).crc32;

/** Decompresses every gzip member, one by one, with the core reader. */
export function gunzipNode(raw: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  return gunzip(
    raw,
    nativeCrc32 ? { crc32: (crc: number, data: Uint8Array) => nativeCrc32(data, crc) } : {},
  );
}

export async function analyzeFile(path: string, options: AnalyzeOptions = {}): Promise<Report> {
  const info = await stat(path);
  return analyze(
    {
      name: basename(path),
      size: info.size,
      open: () => createReadStream(path, { highWaterMark: 1024 * 1024 }),
      gunzip: gunzipNode,
      classifyError: classifyZlibError,
    },
    options,
  );
}
