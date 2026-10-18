// The analyzer over bytes in memory, cut into chunks of any size (the tests
// move chunk boundaries around to reach every state of the readers).

import { type AnalyzeOptions, analyze, type Report } from '../../src/analyzer/index.js';
import { classifyZlibError, gunzipNode } from '../../src/analyzer/node.js';

export async function* chunked(
  data: Uint8Array,
  size: number | (() => number),
): AsyncGenerator<Uint8Array> {
  let i = 0;
  while (i < data.length) {
    const n = Math.max(1, typeof size === 'number' ? size : size());
    yield data.subarray(i, i + n);
    i += n;
  }
}

export function analyzeBytes(
  data: Uint8Array,
  options: AnalyzeOptions & { name?: string; chunk?: number | (() => number) } = {},
): Promise<Report> {
  const { name = 'backup.tar.gz', chunk = 64 * 1024, ...rest } = options;
  return analyze(
    {
      name,
      size: data.length,
      open: () => chunked(data, chunk),
      gunzip: gunzipNode,
      classifyError: classifyZlibError,
    },
    rest,
  );
}

/** A deterministic sequence of small chunk sizes. */
export function jitter(seed: number, max = 23): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return 1 + (x % max);
  };
}

/** The fields the engine golden records, from a report. */
export function engineProjection(report: Report): Record<string, unknown> {
  if (!report.engine.ok) return { ok: false, code: report.engine.code };
  const s = report.engine.spec;
  return {
    ok: true,
    primaryDomain: s.primaryDomain,
    phpVersion: s.webConfig.phpVersion,
    docrootBytes: s.files.totalBytes,
    docrootFiles: s.files.fileCount,
    dbName: s.database.name,
    dumpPath: s.database.dumpPath,
    dumpBytes: s.database.dumpBytes,
    dbEngine: s.database.engine,
    dbVersion: s.database.version,
    tablePrefix: s.wordpress.tablePrefix,
    dbCharset: s.wordpress.dbCharset,
    dbCollate: s.wordpress.dbCollate,
    legacyUrl: s.wordpress.legacyUrl,
    multisite: s.wordpress.multisite,
    network: s.network
      ? {
          ...s.network,
          sites: s.network.sites.map((site) => ({ ...site, blogId: Number(site.blogId) })),
        }
      : null,
    mail: s.email.domains,
  };
}
