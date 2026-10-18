// @bladecp/cli/analyzer/node: analyze a backup file from Node, streaming it
// from disk through zlib. Nothing is sent anywhere.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { pipeline, Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { type AnalyzeOptions, analyze } from './core/analyze.js';
import type { Report } from './core/report.js';
import type { StreamFailure } from './core/source.js';

export * from './index.js';

/** zlib errors of a gzip stream: cut short, or corrupt. */
export function classifyZlibError(error: unknown): StreamFailure | null {
  const code = (error as { code?: unknown })?.code;
  if (code === 'Z_BUF_ERROR') return 'truncated';
  if (code === 'Z_DATA_ERROR' || code === 'Z_STREAM_ERROR' || code === 'Z_NEED_DICT')
    return 'invalid';
  return null;
}

/** Decompresses every gzip member (as Go's reader does), in large chunks. */
export function gunzipNode(raw: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const gunzip = createGunzip({ chunkSize: 256 * 1024 });
  pipeline(Readable.from(raw, { objectMode: false }), gunzip, () => {
    // Errors reach the reader through the gunzip stream itself.
  });
  return gunzip;
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
