// The analyzer must read a backup exactly as the migration engine does: the
// same acceptance or refusal and the same fields of the Spec. The goldens in
// test/fixtures/analyzer/ were produced by the engine parser itself:
//
// - engine-synthetic.json: the synthetic cases of test/helpers/backup.ts
//   (formats, headers, sparse files, limits, multisite networks);
// - engine-samples.json: the 16 sample backups of the specification, kept
//   outside the repository (about 560 MB). Point BLADECP_ANALYZER_SAMPLES at
//   their folder to run them.
//
// Refusals are compared by code (the engine's sentences stay with the engine).

import { existsSync, openAsBlob, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeFile } from '../src/analyzer/node.js';
import { analyzeBlob } from '../src/analyzer/web.js';
import { analyzeBytes, engineProjection } from './helpers/analyze.js';
import { buildBackup, cases } from './helpers/backup.js';

const root = new URL('..', import.meta.url).pathname;
const golden = (file: string) =>
  JSON.parse(readFileSync(join(root, 'test/fixtures/analyzer', file), 'utf8')) as Record<
    string,
    unknown
  >[];

describe('engine conformance: synthetic backups', () => {
  const expected = new Map(golden('engine-synthetic.json').map((g) => [g.fixture as string, g]));
  const all = cases();

  it('covers every case of the golden', () => {
    const names = all.map((c) => `${c.id}${c.spec.gzip ? '.tar.gz' : '.tar'}`);
    expect(names.sort()).toEqual([...expected.keys()].sort());
  });

  for (const c of all) {
    it(c.id, async () => {
      const file = `${c.id}${c.spec.gzip ? '.tar.gz' : '.tar'}`;
      const { fixture: _fixture, ...want } = expected.get(file)!;
      const report = await analyzeBytes(buildBackup(c.spec), { name: file });
      expect(engineProjection(report)).toEqual(want);
    });
  }
});

const SAMPLES = process.env.BLADECP_ANALYZER_SAMPLES;
const FIELDS = [
  'primaryDomain',
  'phpVersion',
  'docrootBytes',
  'docrootFiles',
  'dbName',
  'dumpPath',
  'dumpBytes',
  'dbEngine',
  'dbVersion',
  'tablePrefix',
  'dbCharset',
] as const;

/** The verdict the analyzer gives each sample (the engine gates on top of the parser). */
const VERDICTS: Record<string, [string, string[]]> = {
  'f01-original.tar.gz': ['supported', []],
  'f02-plain-gnu.tar': ['blocked', ['plain_tar']],
  'f03-no-wpconfig.tar.gz': ['blocked', ['not_wordpress']],
  'f04-dotslash-root.tar.gz': ['blocked', ['dot_slash_root']],
  'f05-wp-allow-multisite.tar.gz': ['blocked', ['multisite_unsupported']],
  'f06-commented-multisite.tar.gz': ['blocked', ['multisite_unsupported']],
  'f07-long-domain.tar.gz': ['blocked', ['invalid_primary_domain']],
  'f08-no-sql-dump.tar.gz': ['blocked', ['no_sql_dump']],
  'f09-one-mailbox.tar.gz': ['supported', []],
  'f10-not-cpanel.tar.gz': ['blocked', ['unrecognized_layout']],
  'f11-php84.tar.gz': ['supported_with_warnings', []],
  'f12-truncated.tar.gz': ['blocked', ['archive_truncated']],
  'f13-traversal.tar.gz': ['supported_with_warnings', []],
  'f14-longnames-gnu.tar.gz': ['supported', []],
  'f15-longnames-pax.tar.gz': ['supported', []],
  'f16-multimember.tar.gz': ['supported', []],
};

describe.skipIf(!SAMPLES || !existsSync(SAMPLES))(
  'engine conformance: the 16 sample backups',
  () => {
    for (const want of golden('engine-samples.json')) {
      const name = want.fixture as string;
      it(name, { timeout: 60_000 }, async () => {
        const report = await analyzeFile(join(SAMPLES!, name));
        const got = engineProjection(report);
        expect(got.ok).toBe(want.ok);
        if (!want.ok) {
          expect(got.code).toBe(want.code);
        } else {
          for (const field of FIELDS) expect(got[field] || '', field).toBe(want[field] || '');
          const mail = (want.mail as unknown[] | undefined) ?? [];
          expect(got.mail).toEqual(mail);
        }
        const [verdict, blockers] = VERDICTS[name]!;
        expect(report.verdict).toBe(verdict);
        expect(report.blockers.map((b) => b.code)).toEqual(blockers);
        // The web entry reads the same file (streamed from disk) to the same report.
        const web = await analyzeBlob(await openAsBlob(join(SAMPLES!, name)));
        expect({ ...web, file: { ...web.file, name } }).toEqual(report);
      });
    }
  },
);
