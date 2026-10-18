// @bladecp/cli/analyzer/web: analyze a backup in a browser (a File from a
// drop or an <input>, ideally in a Web Worker). The file is read as a stream
// and decompressed by the core gzip reader, member by member; nothing is
// uploaded.

import { type AnalyzeOptions, analyze } from './core/analyze.js';
import { classifyGzipError, gunzip } from './core/gzip.js';
import type { Report } from './core/report.js';
import type { StreamFailure } from './core/source.js';

export * from './index.js';

/** The chunks of a web ReadableStream, cancelled when the reader stops early. */
async function* chunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Errors of the gzip reader: cut short, or corrupt. */
export function classifyWebError(error: unknown): StreamFailure | null {
  return classifyGzipError(error);
}

/**
 * Decompresses every gzip member with the core reader. No DecompressionStream:
 * browsers and Node versions differ on files of several gzip members and on
 * bytes after the end, and the analysis must read them as the migration does.
 */
export function gunzipWeb(raw: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  return gunzip(raw);
}

export async function analyzeBlob(
  file: Blob & { name?: string },
  options: AnalyzeOptions = {},
): Promise<Report> {
  return analyze(
    {
      name: file.name ?? 'backup',
      size: file.size,
      open: () => chunks(file.stream() as ReadableStream<Uint8Array>),
      gunzip: gunzipWeb,
      classifyError: classifyWebError,
    },
    options,
  );
}
