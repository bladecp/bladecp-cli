import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as zlib from 'node:zlib';
import { gzipSync, inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { binary, fromText } from '../src/analyzer/core/binary.js';
import { atoi, fields, parseInt64, toLowerAscii, trimSpace } from '../src/analyzer/core/go.js';
import { classifyGzipError, crc32, gunzip } from '../src/analyzer/core/gzip.js';
import { countCron, countZone } from '../src/analyzer/core/inventory.js';
import { DumpScanner } from '../src/analyzer/core/networkscan.js';
import {
  CAPABILITIES,
  type DatabaseItem,
  type EmailItem,
  recommend,
  requirements,
} from '../src/analyzer/index.js';
import { analyzeBlob } from '../src/analyzer/web.js';
import { analyzeBytes, chunked, engineProjection, jitter } from './helpers/analyze.js';
import { buildBackup, cases, demoBackups } from './helpers/backup.js';

const root = new URL('..', import.meta.url).pathname;
const caseSpec = (id: string) => cases().find((c) => c.id === id)!.spec;
const zlibCrc32 = (data: Uint8Array) =>
  (zlib as unknown as { crc32: (d: Uint8Array) => number }).crc32(data);

describe('Go semantics', () => {
  it('TrimSpace trims Unicode spaces but not U+FEFF', () => {
    expect(trimSpace(fromText('  demo.example.com　 '))).toBe('demo.example.com');
    expect(trimSpace(fromText('﻿demo'))).toBe(fromText('﻿demo'));
    expect(trimSpace('\x0b\tx\r\n')).toBe('x');
    expect(trimSpace('\x85x')).toBe('\x85x');
  });

  it('Fields splits on Unicode spaces', () => {
    expect(fields(fromText('a b  c '))).toEqual(['a', 'b', 'c']);
  });

  it('strconv: signs, digits only, 64-bit range', () => {
    expect(parseInt64('+12')).toBe(12n);
    expect(parseInt64('-0')).toBe(0n);
    expect(parseInt64('1_000')).toBeNull();
    expect(parseInt64(' 1')).toBeNull();
    expect(parseInt64('9223372036854775808')).toBeNull();
    expect(atoi('007')).toBe(7);
  });

  it('ToLower maps U+0130 and U+212A to ASCII, like Go', () => {
    expect(toLowerAscii(fromText('BLOG_İD'))).toBe('blog_id');
    expect(toLowerAscii(fromText('Key'))).toBe('key');
  });
});

describe('the multisite scanner reads the same at any chunk boundary', () => {
  const dumps = [
    caseSpec('s37-multisite-network'),
    caseSpec('s38-multisite-subdir-complete-insert'),
    caseSpec('s39-multisite-domain-mapping'),
    caseSpec('s43-multisite-huge-statement'),
    caseSpec('s47-multisite-slug-collision'),
  ].map((spec) => {
    const entry = spec.entries.find((e) => e.name.endsWith('.sql'))!;
    return new TextEncoder().encode(entry.data as string);
  });
  const tricky = new TextEncoder().encode(
    "-- c\n/* block ; */ INSERT IGNORE INTO `wp_blogs` VALUES (1,1,'a''b.example.com','/','x','y',1,0,0,0,0,0);\n" +
      "insert into wp_site values (1,'it''s',\"q\\\"\");INSERT INTO `wp_options` VALUES ('INSERT INTO `wp_blogs` VALUES (9)');" +
      'INSERT INTO `wp_blogs` VALUES (2,1,"b.example.com","/","x","y",1,0,0,0,0,0)',
  );
  const scan = (data: Uint8Array, next: () => number) => {
    let charged = 0;
    const scanner = new DumpScanner((n) => {
      charged += n;
    });
    for (let i = 0; i < data.length; ) {
      const n = next();
      scanner.push(data.subarray(i, i + n));
      i += n;
    }
    scanner.end();
    return JSON.stringify({ charged, prefixes: [...scanner.prefixes] }, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
  };
  for (const [i, data] of [...dumps, tricky].entries()) {
    it(`dump ${i + 1}`, () => {
      const whole = scan(data, () => data.length);
      expect(scan(data, () => 1)).toBe(whole);
      expect(scan(data, jitter(i + 7))).toBe(whole);
    });
  }
});

describe('the tar reader reads the same at any chunk boundary', () => {
  for (const id of ['s04-ustar-prefix', 's14-cut-in-padding', 's15-cut-in-data']) {
    it(id, async () => {
      const data = buildBackup(caseSpec(id));
      const whole = engineProjection(await analyzeBytes(data, { chunk: data.length }));
      expect(engineProjection(await analyzeBytes(data, { chunk: jitter(3, 700) }))).toEqual(whole);
    });
  }
});

describe('the web entry does not depend on the DecompressionStream of the runtime', () => {
  const golden = new Map(
    (
      JSON.parse(
        readFileSync(join(root, 'test/fixtures/analyzer/engine-synthetic.json'), 'utf8'),
      ) as Record<string, unknown>[]
    ).map((g) => [g.fixture as string, g]),
  );
  const all = cases();
  const fileOf = (id: string, gzip: unknown) => `${id}${gzip ? '.tar.gz' : '.tar'}`;

  /**
   * A DecompressionStream like the one of some runtimes (Node 24.19, some
   * browsers): it decodes the first gzip member and stops, silently or with an
   * error about the bytes that follow.
   */
  function firstMemberOnly(onRest: 'ignore' | 'throw') {
    return class extends TransformStream<Uint8Array, Uint8Array> {
      constructor() {
        const parts: Uint8Array[] = [];
        super({
          transform(chunk) {
            parts.push(chunk);
          },
          flush(controller) {
            const data = Buffer.concat(parts);
            const r = inflateRawSync(data.subarray(10), { info: true }) as unknown as {
              buffer: Buffer;
              engine: { bytesWritten: number };
            };
            controller.enqueue(new Uint8Array(r.buffer));
            const rest = data.length - (10 + r.engine.bytesWritten + 8);
            if (rest > 0 && onRest === 'throw') {
              throw new TypeError('Trailing junk found after the end of the compressed stream');
            }
          },
        });
      }
    };
  }

  it('the stand-in really stops at the first member', async () => {
    const two = Buffer.concat([gzipSync(Buffer.from('first ')), gzipSync(Buffer.from('second'))]);
    const Stub = firstMemberOnly('ignore');
    const out = new Blob([two])
      .stream()
      .pipeThrough(new Stub() as unknown as TransformStream<Uint8Array, Uint8Array>);
    expect(Buffer.from(await new Response(out).arrayBuffer()).toString()).toBe('first ');
  });

  for (const runtime of ['native', 'stops silently', 'stops with an error'] as const) {
    it(`every synthetic case as the engine reads it (${runtime} DecompressionStream)`, async () => {
      const original = globalThis.DecompressionStream;
      if (runtime !== 'native') {
        (globalThis as { DecompressionStream: unknown }).DecompressionStream = firstMemberOnly(
          runtime === 'stops silently' ? 'ignore' : 'throw',
        );
      }
      try {
        for (const c of all) {
          const name = fileOf(c.id, c.spec.gzip);
          const { fixture: _fixture, ...want } = golden.get(name)!;
          const report = await analyzeBlob(new Blob([buildBackup(c.spec)]));
          expect(engineProjection(report), `${runtime} ${c.id}`).toEqual(want);
        }
      } finally {
        (globalThis as { DecompressionStream: unknown }).DecompressionStream = original;
      }
    });
  }

  it('the Node and the web entries give the same report', async () => {
    for (const c of all) {
      const data = buildBackup(c.spec);
      const web = await analyzeBlob(new Blob([data]), {});
      const node = await analyzeBytes(data);
      expect({ ...web, file: { ...web.file, name: '' } }, c.id).toEqual({
        ...node,
        file: { ...node.file, name: '' },
      });
    }
  });
});

describe('the gzip reader', () => {
  const read = async (data: Uint8Array, chunk: number | (() => number)) => {
    const parts: Uint8Array[] = [];
    try {
      for await (const part of gunzip(chunked(data, chunk))) parts.push(part);
      return { ok: true as const, data: Buffer.concat(parts) };
    } catch (error) {
      return {
        ok: false as const,
        kind: classifyGzipError(error),
        got: Buffer.concat(parts).length,
      };
    }
  };
  const words = Buffer.from(
    Array.from({ length: 30000 }, (_, i) => `palavra${i % 911} ${(i * 37) % 1000}\n`).join(''),
  );
  const inputs = [
    Buffer.alloc(0),
    Buffer.from('a'),
    Buffer.alloc(200_000),
    Buffer.from(Array.from({ length: 150_000 }, (_, i) => (i * 7919) % 251)),
    words,
  ];

  it('decodes what zlib writes: every level and strategy, at any chunk boundary', async () => {
    for (const [i, input] of inputs.entries()) {
      for (const level of [0, 1, 6, 9]) {
        for (const strategy of [0, 1, 2, 3, 4]) {
          const gz = gzipSync(input, { level, strategy });
          for (const chunk of [1, 13, 65536]) {
            const r = await read(gz, chunk);
            expect(
              r.ok && Buffer.compare(r.data, input) === 0,
              `${i} ${level} ${strategy} ${chunk}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('reads every member, and stops like Go after the last one', async () => {
    const a = words.subarray(0, 70_000);
    const b = words.subarray(70_000);
    const two = Buffer.concat([gzipSync(a), gzipSync(b)]);
    expect((await read(two, jitter(5, 3000))).ok).toBe(true);
    const cases: [string, Uint8Array, string][] = [
      [
        'junk after the last member',
        Buffer.concat([gzipSync(a), Buffer.from('not a gzip header')]),
        'invalid',
      ],
      ['a few bytes after it', Buffer.concat([gzipSync(a), Buffer.from('xyz')]), 'truncated'],
      ['a cut trailer', gzipSync(a).subarray(0, gzipSync(a).length - 3), 'truncated'],
      ['a cut stream', gzipSync(a).subarray(0, 40), 'truncated'],
      [
        'a wrong checksum',
        (() => {
          const g = gzipSync(a);
          g[g.length - 8]! ^= 1;
          return g;
        })(),
        'invalid',
      ],
      [
        'a wrong size',
        (() => {
          const g = gzipSync(a);
          g[g.length - 1]! ^= 1;
          return g;
        })(),
        'invalid',
      ],
      [
        'zeros between members',
        Buffer.concat([gzipSync(a), Buffer.alloc(32), gzipSync(b)]),
        'invalid',
      ],
      ['not deflate', Buffer.from([0x1f, 0x8b, 7, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]), 'invalid'],
    ];
    for (const [name, data, kind] of cases) {
      const r = await read(data, 4096);
      expect(r.ok ? 'ok' : r.kind, name).toBe(kind);
      // The output before the error is all delivered (Go returns it too).
      if (!r.ok && name !== 'a cut stream' && name !== 'not deflate')
        expect(r.got, name).toBe(a.length);
    }
  });

  it('never reads past what the consumer asks for: the trailer is checked lazily', async () => {
    const a = words.subarray(0, 50_000);
    const bad = Buffer.concat([gzipSync(a), Buffer.from('junk after the end')]);
    const it = gunzip(chunked(bad, 1 << 20))[Symbol.asyncIterator]();
    let got = 0;
    while (got < a.length) got += (await it.next()).value!.length;
    expect(got).toBe(a.length);
    await it.return?.(undefined);
  });

  it('the CRC-32 is the one of zlib', () => {
    for (const input of inputs) expect(crc32(0, input)).toBe(zlibCrc32(input));
    expect(crc32(crc32(0, words.subarray(0, 1000)), words.subarray(1000))).toBe(zlibCrc32(words));
  });
});

describe('the core runs anywhere', () => {
  const dir = join(root, 'src/analyzer');
  const files = [
    ...readdirSync(join(dir, 'core')).map((f) => `core/${f}`),
    'index.ts',
    'web.ts',
    'capabilities.ts',
  ];
  it('no Node module, process, Buffer or network in the core and the web entry', () => {
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(
        /from 'node:|require\(|\bprocess\.|\bBuffer\b|\bfetch\(|XMLHttpRequest|WebSocket/,
      );
    }
  });

  it('package.json exports the analyzer next to the binary', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.bin).toEqual({ bladecp: 'dist/bin.js' });
    expect(Object.keys(pkg.exports)).toEqual([
      './analyzer',
      './analyzer/node',
      './analyzer/web',
      './package.json',
    ]);
    expect(pkg.exports['./analyzer'].default).toBe('./dist/analyzer/index.js');
  });
});

describe('inventory parsers', () => {
  it('counts zone records by type, owners and parentheses included', () => {
    const zone = [
      '; zone',
      '$TTL 14400',
      'example.com. 86400 IN SOA ns1.example.com. admin.example.com. (',
      '  2026101701 ; serial',
      '  3600 1800 1209600 86400 )',
      'mx 14400 IN A 203.0.113.1',
      '@ IN MX 10 mail.example.com.',
      '\tIN TXT "v=spf1 ~all; not a comment"',
      'www CNAME example.com.',
    ].join('\n');
    expect(countZone(zone)).toEqual({ SOA: 1, A: 1, MX: 1, TXT: 1, CNAME: 1 });
  });

  it('counts cron jobs, never comments or variables', () => {
    expect(countCron('MAILTO=""\nPATH = /bin\n# x\n\n* * * * * a\n@daily b\n')).toBe(2);
  });
});

describe('the capabilities file decides what comes and what stays', () => {
  const demo = demoBackups().find((d) => d.file === 'cpmove-demo.tar.gz')!;

  it('the decision of 2026-10-17: sites, databases, email, DNS and cron come', async () => {
    const report = await analyzeBytes(buildBackup(demo.spec));
    expect(report.verdict).toBe('supported');
    const moving = report.items.filter((i) => i.status === 'supported').map((i) => i.kind);
    expect(new Set(moving)).toEqual(
      new Set(['site', 'php', 'database', 'email_domain', 'dns_zone', 'cron']),
    );
    const staying = report.items.filter((i) => i.status === 'not_migrated').map((i) => i.kind);
    expect(staying.sort()).toEqual(['ftp', 'panel_password', 'ssl']);
    expect(report.requirements).toEqual({
      diskGb: 1,
      databaseGb: 1,
      databases: 2,
      databaseEngine: 'mariadb',
      sites: 3,
      emailAccounts: 2,
    });
  });

  it('a capability turned off moves the item to what stays behind', async () => {
    const report = await analyzeBytes(buildBackup(demo.spec), {
      capabilities: {
        ...CAPABILITIES,
        cron: false,
        email: { ...CAPABILITIES.email, mailboxes: false },
        databaseEngines: ['mariadb'],
      },
    });
    const status = (kind: string) =>
      report.items.filter((i) => i.kind === kind).map((i) => i.status);
    expect(status('cron')).toEqual(['not_migrated']);
    expect(status('email_domain')).toEqual(['not_migrated']);
    const dbs = report.items.filter((i): i is DatabaseItem => i.kind === 'database');
    expect(dbs.map((d) => [d.engine, d.status])).toEqual([
      ['mariadb', 'supported'],
      ['mysql', 'not_migrated'],
    ]);
    expect(report.requirements?.emailAccounts).toBe(0);
  });
});

describe('plan recommendation', () => {
  const need = requirements({
    homeBytes: 15e9,
    mailBytes: 0,
    databaseBytes: 1e9,
    databases: 1,
    databaseEngine: 'mysql',
    sites: 1,
    emailAccounts: 0,
  });
  const plan = (id: number, diskGb: number | null, brl: number | null, locations = 1) => ({
    partnerName: 'BladeCP',
    partnerPlanId: id,
    planName: `Plan ${id}`,
    diskGb,
    prices:
      brl === null
        ? []
        : [
            { currency: 'BRL', priceMonthly: brl },
            { currency: 'USD', priceMonthly: brl / 5 },
          ],
    locations: Array.from({ length: locations }, (_, i) => ({
      locationId: i + 1,
      name: 'Sao Paulo',
      countryCode: 'BR',
    })),
  });

  it('needs 25% more disk than the files and twice the dumps', () => {
    expect(need.diskGb).toBe(19);
    expect(need.databaseGb).toBe(2);
  });

  it('picks the cheapest plan that fits, never one without price or place', () => {
    const rec = recommend(
      need,
      [
        plan(1, 10, 20),
        plan(2, 20, 49),
        plan(3, 40, 49),
        plan(4, 80, 30, 0),
        plan(5, 60, null),
        plan(6, null, 10),
      ],
      'BRL',
    );
    expect(rec.mode).toBe('live');
    if (rec.mode !== 'live') return;
    expect(rec.best?.partnerPlanId).toBe(3);
    expect(rec.alternatives.map((c) => c.partnerPlanId)).toEqual([2]);
    expect(rec.unknownDisk.map((c) => c.partnerPlanId)).toEqual([6]);
    expect(rec.best?.price).toEqual({ currency: 'BRL', priceMonthly: 49 });
  });
});

describe('privacy: secrets found in the backup never reach the report', () => {
  const PEM = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  const secrets = [
    'Fixture-Password-123',
    'fixture-auth-key-value',
    '$6$fixture',
    'contato',
    'vendas',
    'backup.sh',
    'wp-cron',
    'v=spf1',
    'MAILTO',
    PEM,
    'fixture certificate',
    'IDENTIFIED BY',
    '203.0.113.20',
  ];
  it('the demo backup, and one with keys and grants, keep their secrets', async () => {
    const demo = demoBackups().find((d) => d.file === 'cpmove-demo.tar.gz')!;
    const extra = [
      { name: 'cpmove-demo/sslkeys/demo.key', data: `${PEM}\nMIIfixture\n` },
      {
        name: 'cpmove-demo/mysql.sql',
        data: "GRANT USAGE ON *.* TO 'demo'@'localhost' IDENTIFIED BY PASSWORD '*00';\n",
      },
      { name: 'cpmove-demo/shadow', data: '$6$fixture$account' },
    ];
    for (const data of [
      buildBackup(demo.spec),
      buildBackup({ ...demo.spec, entries: [...demo.spec.entries, ...extra] }),
    ]) {
      const report = await analyzeBytes(data);
      const json = JSON.stringify(report);
      for (const secret of secrets) expect(json, secret).not.toContain(secret);
      const mail = report.items.filter((i): i is EmailItem => i.kind === 'email_domain');
      expect(mail[0]?.accounts).toBe(2);
    }
  });

  it('only the kinds of secrets are named', async () => {
    const demo = demoBackups().find((d) => d.file === 'cpmove-demo.tar.gz')!;
    const report = await analyzeBytes(buildBackup(demo.spec));
    expect(report.privacy).toEqual({
      network: false,
      sensitive: ['database_credentials', 'password_hashes', 'private_keys'],
    });
  });
});

describe('binary strings', () => {
  it('keep every byte', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...binary(bytes)].map((c) => c.charCodeAt(0))).toEqual([...bytes]);
    expect(gzipSync(bytes).length).toBeGreaterThan(0);
  });
});
