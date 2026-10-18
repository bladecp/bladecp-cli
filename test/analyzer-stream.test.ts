// A large backup streams through without being held in memory: a sparse
// file on disk (holes cost no disk) holding a valid cPanel tree and one
// regular file of 4 GiB. The analyzer reads every byte (a tar cannot seek)
// and the memory stays flat. BLADECP_ANALYZER_BIG_GIB changes the size.

import { closeSync, ftruncateSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { analyzeFile } from '../src/analyzer/node.js';
import { baseEntries, buildBackup, entryHeader } from './helpers/backup.js';
import { tempDir } from './helpers/run.js';

const GIB = 1024 ** 3;
const SIZE_GIB = Number(process.env.BLADECP_ANALYZER_BIG_GIB ?? 4);
const dir = tempDir('bladecp-big-');
afterAll(() => dir.cleanup());

describe('a large backup streams', () => {
  it(`${SIZE_GIB} GiB sparse tar: every byte read, memory flat`, { timeout: 300_000 }, async () => {
    const path = join(dir.path, 'cpmove-demo.tar');
    const head = buildBackup({ entries: baseEntries(), end: 'none' });
    const big = Math.round(SIZE_GIB * GIB);
    const fd = openSync(path, 'w');
    writeSync(fd, head);
    writeSync(fd, entryHeader('cpmove-demo/homedir/public_html/video.bin', big));
    // The data and the two zero blocks that end the archive are holes.
    ftruncateSync(fd, head.length + 512 + big + 1024);
    closeSync(fd);

    global.gc?.();
    const before = process.memoryUsage();
    let peakRss = before.rss;
    let peakHeap = before.heapUsed;
    let calls = 0;
    const started = performance.now();
    const report = await analyzeFile(path, {
      onProgress: () => {
        calls += 1;
        if (calls % 64 !== 0) return;
        const now = process.memoryUsage();
        peakRss = Math.max(peakRss, now.rss);
        peakHeap = Math.max(peakHeap, now.heapUsed);
      },
    });
    const seconds = (performance.now() - started) / 1000;
    const growth = {
      rssMiB: (peakRss - before.rss) / 2 ** 20,
      heapMiB: (peakHeap - before.heapUsed) / 2 ** 20,
    };
    console.info(
      `analyzer: ${SIZE_GIB} GiB sparse tar in ${seconds.toFixed(1)} s, ` +
        `rss +${growth.rssMiB.toFixed(0)} MiB, heap +${growth.heapMiB.toFixed(0)} MiB (peak ${(peakRss / 2 ** 20).toFixed(0)} MiB)`,
    );

    expect(report.file.complete).toBe(true);
    expect(report.engine.ok && report.engine.spec.files.totalBytes).toBeGreaterThan(big);
    // Not gzip: the import needs the .tar.gz, so this one is blocked, after a full read.
    expect(report.blockers.map((b) => b.code)).toEqual(['plain_tar']);
    expect(growth.heapMiB).toBeLessThan(64);
    expect(growth.rssMiB).toBeLessThan(256);
  });
});
