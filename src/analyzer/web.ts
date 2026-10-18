// @bladecp/cli/analyzer/web: analyze a backup in a browser (a File from a
// drop or an <input>, ideally in a Web Worker). The file is read as a stream
// and decompressed with DecompressionStream; nothing is uploaded.

import { type AnalyzeOptions, analyze } from './core/analyze.js';
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

/** An async iterable as a web ReadableStream (pull based, so it never runs ahead). */
function streamOf(source: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const it = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await it.return?.();
    },
  });
}

/** DecompressionStream reports a short or corrupt stream with a TypeError; tell them apart by the text. */
export function classifyWebError(error: unknown): StreamFailure | null {
  if (!(error instanceof Error)) return 'invalid';
  if (error.name === 'AbortError') return null;
  return /end of|truncat|unexpected|incomplete|premature/i.test(error.message)
    ? 'truncated'
    : 'invalid';
}

export function gunzipWeb(raw: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  return chunks(
    streamOf(raw).pipeThrough(
      new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>,
    ),
  );
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
