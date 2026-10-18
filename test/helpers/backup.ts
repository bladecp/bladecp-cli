// Synthetic cPanel backups for the analyzer tests: a small tar writer (USTAR,
// GNU, PAX, V7, STAR, long names, old and PAX sparse files, malformed headers
// on purpose) and the cases the conformance test runs. Everything is
// deterministic and fictitious (example domains, documentation addresses).
// No relative imports: tools can load this file with Node's type stripping.

import { gzipSync } from 'node:zlib';

export type Format = 'ustar' | 'gnu' | 'pax' | 'v7' | 'star';

export interface Entry {
  name: string;
  data?: string | Uint8Array;
  /** Declared size, when it differs from the data (truncation tests). */
  size?: number;
  type?: string;
  format?: Format;
  /** Extra PAX records written in an 'x' header before this entry. */
  pax?: Record<string, string>;
  /** Write the name with a GNU 'L' header. */
  longName?: boolean;
  /** Write the size in base-256. */
  base256?: boolean;
  /** Changes the header block before the checksum is computed. */
  mutate?: (block: Uint8Array) => void;
  /** Breaks the checksum. */
  badChecksum?: boolean;
  /** Old GNU sparse: data fragments [offset, length] and the real size. */
  oldSparse?: { map: [number, number][]; realSize: number };
  /** Raw bytes written as they are, in place of an entry. */
  raw?: Uint8Array;
}

export interface BackupSpec {
  entries: Entry[];
  format?: Format;
  gzip?: boolean | 'multi';
  /** How the archive ends. */
  end?: 'two' | 'one' | 'none' | 'garbage';
  /** Cut the tar stream (before gzip) at this byte. */
  truncateAt?: number;
  /** Raw bytes before the archive (a file that is not a tar). */
  raw?: Uint8Array;
}

const enc = new TextEncoder();
const bytes = (data: string | Uint8Array | undefined) =>
  data === undefined ? new Uint8Array(0) : typeof data === 'string' ? enc.encode(data) : data;

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function put(block: Uint8Array, offset: number, width: number, value: string | Uint8Array): void {
  const b = typeof value === 'string' ? enc.encode(value) : value;
  block.set(b.subarray(0, width), offset);
}

function base256(block: Uint8Array, offset: number, width: number, value: number): void {
  let x = BigInt(value);
  for (let i = width - 1; i >= 0; i -= 1) {
    block[offset + i] = Number(x & 0xffn);
    x >>= 8n;
  }
  block[offset] = block[offset]! | 0x80;
}

function checksum(block: Uint8Array): void {
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const c of block) sum += c;
  put(block, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
}

function header(
  name: string,
  type: string,
  size: number,
  format: Format,
  entry: Partial<Entry> = {},
): Uint8Array {
  const block = new Uint8Array(512);
  let prefix = '';
  let short = name;
  const nameBytes = enc.encode(name);
  if (nameBytes.length > 100 && (format === 'ustar' || format === 'pax' || format === 'star')) {
    const cut = name.lastIndexOf('/', name.length - 1);
    if (cut > 0 && enc.encode(name.slice(cut + 1)).length <= 100) {
      prefix = name.slice(0, cut);
      short = name.slice(cut + 1);
    }
  }
  put(block, 0, 100, short);
  put(block, 100, 8, octal(0o644, 8));
  put(block, 108, 8, octal(1001, 8));
  put(block, 116, 8, octal(1001, 8));
  if (entry.base256) base256(block, 124, 12, size);
  else put(block, 124, 12, octal(size, 12));
  put(block, 136, 12, octal(1760000000, 12));
  block[156] = type.charCodeAt(0);
  if (format === 'gnu') {
    put(block, 257, 6, 'ustar ');
    put(block, 263, 2, ' \0');
  } else if (format !== 'v7') {
    put(block, 257, 6, 'ustar\0');
    put(block, 263, 2, '00');
  }
  if (format !== 'v7') {
    put(block, 265, 32, 'demo');
    put(block, 297, 32, 'demo');
    put(block, 329, 8, octal(0, 8));
    put(block, 337, 8, octal(0, 8));
  }
  if (format === 'star') {
    put(block, 345, 131, prefix);
    put(block, 476, 12, octal(1760000000, 12));
    put(block, 488, 12, octal(1760000000, 12));
    put(block, 508, 4, 'tar\0');
  } else if (format === 'ustar' || format === 'pax') {
    put(block, 345, 155, prefix);
  }
  entry.mutate?.(block);
  checksum(block);
  if (entry.badChecksum) block[148] = 0x37;
  return block;
}

function padded(data: Uint8Array): Uint8Array[] {
  const pad = (512 - (data.length % 512)) % 512;
  return pad ? [data, new Uint8Array(pad)] : [data];
}

function paxData(records: Record<string, string>): Uint8Array {
  let out = '';
  for (const [key, value] of Object.entries(records)) {
    const body = ` ${key}=${value}\n`;
    let len = enc.encode(body).length + 1;
    while (String(len).length + enc.encode(body).length !== len) len += 1;
    out += `${len}${body}`;
  }
  return enc.encode(out);
}

/** The tar (and gzip) bytes of a backup. */
export function buildBackup(spec: BackupSpec): Uint8Array {
  const parts: Uint8Array[] = [];
  if (spec.raw) parts.push(spec.raw);
  for (const entry of spec.entries) {
    if (entry.raw) {
      parts.push(entry.raw);
      continue;
    }
    const format = entry.format ?? spec.format ?? 'ustar';
    const data = bytes(entry.data);
    const type = entry.type ?? '0';
    let name = entry.name;
    const pax = { ...(entry.pax ?? {}) };
    if (format === 'pax' && enc.encode(name).length > 100) pax.path = name;
    if (Object.keys(pax).length > 0) {
      const records = paxData(pax);
      parts.push(header('PaxHeaders/entry', 'x', records.length, 'pax'), ...padded(records));
      if (pax.path) name = name.slice(-90);
    }
    if (entry.longName || (format === 'gnu' && enc.encode(name).length > 100)) {
      const long = enc.encode(`${name}\0`);
      parts.push(header('././@LongLink', 'L', long.length, 'gnu'), ...padded(long));
      name = name.slice(0, 99);
    }
    if (entry.oldSparse) {
      const block = header(name, 'S', data.length, 'gnu', {
        ...entry,
        mutate: (b) => {
          entry.oldSparse!.map.slice(0, 4).forEach(([offset, length], i) => {
            put(b, 386 + i * 24, 12, octal(offset, 12));
            put(b, 386 + i * 24 + 12, 12, octal(length, 12));
          });
          put(b, 483, 12, octal(entry.oldSparse!.realSize, 12));
          entry.mutate?.(b);
        },
      });
      parts.push(block, ...padded(data));
      continue;
    }
    const size = entry.size ?? data.length;
    parts.push(header(name, type, size, format, entry), ...padded(data));
  }
  if (spec.end !== 'none') parts.push(new Uint8Array(512));
  if (spec.end === undefined || spec.end === 'two' || spec.end === 'garbage') {
    parts.push(new Uint8Array(512 * 19));
  }
  if (spec.end === 'garbage') parts.push(enc.encode('trailing bytes that are not a tar'));
  let tar = Buffer.concat(parts);
  if (spec.truncateAt !== undefined) tar = tar.subarray(0, spec.truncateAt);
  if (!spec.gzip) return new Uint8Array(tar);
  if (spec.gzip === 'multi') {
    const half = Math.floor(tar.length / 2 / 512) * 512;
    return new Uint8Array(
      Buffer.concat([gzipSync(tar.subarray(0, half)), gzipSync(tar.subarray(half))]),
    );
  }
  return new Uint8Array(gzipSync(tar, { level: 6 }));
}

// ------------------------------------------------------------------ cases

const ROOT = 'cpmove-demo';
const DOMAIN = 'demo.example.com';

export const WP_CONFIG = `<?php
define( 'DB_NAME', 'demo_wp' );
define( 'DB_USER', 'demo_wp' );
define( 'DB_PASSWORD', 'Fixture-Password-123' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
define( 'AUTH_KEY', 'fixture-auth-key-value' );
define( 'WP_HOME', 'https://demo.example.com' );
$table_prefix = 'wp_';
require_once ABSPATH . 'wp-settings.php';
`;

export const DUMP_HEADER = `-- MariaDB dump 10.19  Distrib 10.11.10-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: demo_wp
-- ------------------------------------------------------
-- Server version\t10.11.10-MariaDB

/*!40101 SET NAMES utf8mb4 */;
`;

const DUMP = `${DUMP_HEADER}
DROP TABLE IF EXISTS \`wp_options\`;
CREATE TABLE \`wp_options\` (\`option_id\` bigint(20), \`option_value\` longtext);
INSERT INTO \`wp_options\` VALUES (1,'siteurl https://demo.example.com; INSERT INTO \`wp_blogs\` VALUES (9)'),(2,'it''s fine');
`;

const MAIN = `---
addon_domains: {}
main_domain: ${DOMAIN}
parked_domains: []
sub_domains: []
`;

const home = (rest: string) => ['', 'home', 'demo', rest].join('/');

function vhost(domain: string, php = 'ea-php82', docroot = 'public_html'): string {
  return `---
documentroot: ${home(docroot)}
homedir: ${home('').slice(0, -1)}
phpversion: ${php}
serveralias: www.${domain}
servername: ${domain}
user: demo
`;
}

/** A small, valid WordPress cpmove tree. */
export function baseEntries(overrides: Record<string, string | null> = {}, root = ROOT): Entry[] {
  const files: Record<string, string | null> = {
    'cp/demo': `DNS=${DOMAIN}\nIP=203.0.113.20\nUSER=demo\n`,
    'userdata/main': MAIN,
    [`userdata/${DOMAIN}`]: vhost(DOMAIN),
    'homedir/public_html/index.php': '<?php require __DIR__ . "/wp-blog-header.php";\n',
    'homedir/public_html/wp-config.php': WP_CONFIG,
    'homedir/public_html/wp-includes/version.php': "<?php\n$wp_version = '6.8.1';\n",
    'mysql/demo_wp.sql': DUMP,
    [`homedir/etc/${DOMAIN}/passwd`]: '',
    [`homedir/etc/${DOMAIN}/shadow`]: '',
    [`dnszones/${DOMAIN}.db`]: `$TTL 14400\n${DOMAIN}. 86400 IN SOA ns1.example.com. admin.example.com. ( 2026101701 3600 1800 1209600 86400 )\n${DOMAIN}. 14400 IN A 203.0.113.20\nwww 14400 IN CNAME ${DOMAIN}.\n`,
    ...overrides,
  };
  return Object.entries(files)
    .filter(([, data]) => data !== null)
    .map(([name, data]) => ({ name: `${root}/${name}`, data: data! }));
}

function blogsInsert(rows: [number, string, string][], columns = false): string {
  const tuples = rows
    .map(
      ([id, domain, path]) =>
        `(${id},1,'${domain}','${path}','2026-01-01 00:00:00','2026-01-01 00:00:00',1,0,0,0,0,0)`,
    )
    .join(',');
  const cols = columns
    ? ' (`blog_id`, `site_id`, `domain`, `path`, `registered`, `last_updated`, `public`, `archived`, `mature`, `spam`, `deleted`, `lang_id`)'
    : '';
  return `INSERT INTO \`wp_blogs\`${cols} VALUES ${tuples};\n`;
}

const MULTISITE_CONFIG = (extra: string) =>
  WP_CONFIG.replace(
    '$table_prefix',
    `define( 'MULTISITE', true );\ndefine( 'SUBDOMAIN_INSTALL', true );\ndefine( 'DOMAIN_CURRENT_SITE', '${DOMAIN}' );\ndefine( 'PATH_CURRENT_SITE', '/' );\ndefine( 'SITE_ID_CURRENT_SITE', 1 );\ndefine( 'BLOG_ID_CURRENT_SITE', 1 );\n${extra}$table_prefix`,
  );

function network(count: number, sql = ''): Record<string, string> {
  const rows: [number, string, string][] = Array.from({ length: count }, (_, i) => [
    i + 1,
    i === 0 ? DOMAIN : `site${i}.${DOMAIN}`,
    '/',
  ]);
  return {
    'homedir/public_html/wp-config.php': MULTISITE_CONFIG(''),
    'mysql/demo_wp.sql': `${DUMP}${blogsInsert(rows)}INSERT INTO \`wp_site\` VALUES (1,'${DOMAIN}','/');\n${sql}`,
  };
}

const big = (n: number, ch = 'x') => ch.repeat(n);
const SPARSE_MAP = '2\n0\n100\n9000\n50\n';

export interface Case {
  id: string;
  spec: BackupSpec;
}

/** The synthetic conformance cases (each also read by the engine parser for the golden). */
export function cases(): Case[] {
  const list: Case[] = [];
  const add = (id: string, spec: BackupSpec) => list.push({ id, spec });
  add('s01-basic', { entries: baseEntries(), gzip: true });
  add('s02-gnu-longnames', {
    format: 'gnu',
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/${'pasta-longa/'.repeat(12)}foto.jpg`, data: big(3000) },
    ],
    gzip: true,
  });
  add('s03-pax-longnames', {
    format: 'pax',
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/${'pasta-longa/'.repeat(12)}foto.jpg`, data: big(3000) },
    ],
    gzip: true,
  });
  add('s04-ustar-prefix', {
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/${'sub/'.repeat(30)}x.txt`, data: 'prefix' },
    ],
  });
  add('s05-v7', { format: 'v7', entries: baseEntries(), gzip: true });
  add('s06-star', { format: 'star', entries: baseEntries(), gzip: true });
  add('s07-pax-size', {
    format: 'pax',
    entries: [
      ...baseEntries(),
      {
        name: `${ROOT}/homedir/public_html/padded.bin`,
        data: big(1500),
        size: 9,
        pax: { size: '1500' },
      },
    ],
    gzip: true,
  });
  add('s08-base256-size', {
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/b256.bin`, data: big(777), base256: true },
    ],
    gzip: true,
  });
  add('s09-bad-checksum', {
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/bad.txt`, data: 'x', badChecksum: true },
    ],
    gzip: true,
  });
  add('s10-bad-mode', {
    entries: [
      ...baseEntries(),
      {
        name: `${ROOT}/homedir/public_html/mode.txt`,
        data: 'x',
        mutate: (b) => put(b, 100, 8, '0009999\0'),
      },
    ],
    gzip: true,
  });
  add('s11-one-zero-block', { entries: baseEntries(), end: 'one', gzip: true });
  add('s12-no-end-blocks', { entries: baseEntries(), end: 'none', gzip: true });
  add('s13-trailing-garbage', { entries: baseEntries(), end: 'garbage', gzip: true });
  const base = buildBackup({ entries: baseEntries(), end: 'none' });
  add('s14-cut-in-padding', { entries: baseEntries(), end: 'none', truncateAt: base.length - 100 });
  add('s15-cut-in-data', {
    entries: [...baseEntries(), { name: `${ROOT}/homedir/public_html/z.bin`, data: big(4000) }],
    end: 'none',
    truncateAt: base.length + 512 + 2000,
  });
  add('s16-zero-then-header', {
    entries: [
      ...baseEntries(),
      { name: '', raw: new Uint8Array(512) },
      { name: `${ROOT}/homedir/public_html/after.txt`, data: 'x' },
    ],
    gzip: true,
  });
  add('s17-rega-dir', {
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/legacy/`, data: '', type: '\0' },
      { name: `${ROOT}/homedir/public_html/legacy.txt`, data: 'old', type: '\0' },
    ],
    gzip: true,
  });
  add('s18-contiguous-wpconfig', {
    entries: baseEntries({ 'homedir/public_html/wp-config.php': null }).concat([
      { name: `${ROOT}/homedir/public_html/wp-config.php`, data: WP_CONFIG, type: '7' },
    ]),
    gzip: true,
  });
  add('s19-empty-wpconfig', {
    entries: baseEntries({ 'homedir/public_html/wp-config.php': '' }),
    gzip: true,
  });
  add('s20-bare-root', {
    entries: baseEntries({}, 'backup-10.17.2026_12-00-00_demo').map((e) => e),
    gzip: true,
  });
  add('s21-cp-dns-fallback', { entries: baseEntries({ 'userdata/main': null }), gzip: true });
  add('s22-db-name-mismatch', {
    entries: baseEntries({
      'mysql/demo_wp.sql': null,
      'mysql/other_small.sql': `${DUMP_HEADER}-- small\n`,
      'mysql/other_big.sql': `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n-- Server version\t8.0.36\n${big(5000, ' ')}\n`,
    }),
    gzip: true,
  });
  add('s23-define-in-comment', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': `<?php\n// define('DB_NAME', 'old_db');\n${WP_CONFIG.replace("$table_prefix = 'wp_';", "/* $table_prefix = 'old_'; */\n$table_prefix = 'wp_';")}`,
    }),
    gzip: true,
  });
  add('s24-bad-prefix', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': WP_CONFIG.replace("'wp_'", "'wp-x_'"),
    }),
    gzip: true,
  });
  add('s25-bad-charset', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': WP_CONFIG.replace(
        "'DB_CHARSET', 'utf8mb4'",
        "'DB_CHARSET', 'utf8 mb4'",
      ),
    }),
    gzip: true,
  });
  add('s26-uppercase-domain', {
    entries: baseEntries({
      'userdata/main': MAIN.replace(`main_domain: ${DOMAIN}`, 'main_domain: Demo.Example.com'),
    }),
    gzip: true,
  });
  add('s27-nbsp-domain', {
    entries: baseEntries({
      'userdata/main': MAIN.replace(`main_domain: ${DOMAIN}`, `main_domain: ${DOMAIN}\u00a0\u3000`),
    }),
    gzip: true,
  });
  add('s28-bom-domain', {
    entries: baseEntries({
      'userdata/main': MAIN.replace(`main_domain: ${DOMAIN}`, `main_domain: \ufeff${DOMAIN}`),
    }),
    gzip: true,
  });
  add('s29-bad-local-part', {
    entries: baseEntries({
      [`homedir/etc/${DOMAIN}/passwd`]: 'contato:x:1001:1001::/x:/y\njoão:x:1001:1001::/x:/y\n',
    }),
    gzip: true,
  });
  add('s30-mailboxes', {
    entries: [
      ...baseEntries({
        [`homedir/etc/${DOMAIN}/passwd`]:
          '# comment\ncontato:x:1:1::/x:/y\nvendas:x:1:1::/x:/y\n\n',
        [`homedir/etc/${DOMAIN}/shadow`]: 'contato:$6$fixture$hash:1::::::\n',
        'homedir/etc/other.example.org/passwd': 'info:x:1:1::/x:/y\n',
      }),
      { name: `${ROOT}/homedir/mail/${DOMAIN}/contato/cur/1.M1:2,S`, data: big(2048) },
      { name: `${ROOT}/homedir/mail/${DOMAIN}/vendas/new/2.M2`, data: big(1024) },
      { name: `${ROOT}/homedir/mail/other.example.org/info/new/3.M3`, data: big(512) },
    ],
    gzip: true,
  });
  add('s31-mailbox-over-cap', {
    format: 'pax',
    entries: [
      ...baseEntries({
        [`homedir/etc/${DOMAIN}/passwd`]: 'big:x:1:1::/x:/y\nsmall:x:1:1::/x:/y\n',
      }),
      {
        name: `${ROOT}/homedir/mail/${DOMAIN}/big/cur/huge`,
        data: 'abc',
        pax: {
          'GNU.sparse.major': '0',
          'GNU.sparse.minor': '1',
          'GNU.sparse.size': String(6 * 1024 ** 3),
          'GNU.sparse.numblocks': '1',
          'GNU.sparse.map': '0,3',
        },
      },
      { name: `${ROOT}/homedir/mail/${DOMAIN}/small/cur/one`, data: big(100) },
    ],
    gzip: true,
  });
  add('s32-old-gnu-sparse', {
    format: 'gnu',
    entries: [
      ...baseEntries(),
      {
        name: `${ROOT}/homedir/public_html/sparse.img`,
        data: big(1024),
        oldSparse: {
          map: [
            [0, 512],
            [4096, 512],
          ],
          realSize: 8192,
        },
      },
    ],
    gzip: true,
  });
  add('s33-pax-sparse-1x0', {
    format: 'pax',
    entries: [
      ...baseEntries(),
      {
        name: `${ROOT}/homedir/public_html/sparse10.img`,
        data: `${SPARSE_MAP}${'\0'.repeat(512 - SPARSE_MAP.length)}${big(150)}`,
        pax: {
          'GNU.sparse.major': '1',
          'GNU.sparse.minor': '0',
          'GNU.sparse.name': `${ROOT}/homedir/public_html/renamed-sparse.img`,
          'GNU.sparse.realsize': '10000',
        },
      },
    ],
    gzip: true,
  });
  add('s34-sparse-wpconfig-unref', {
    format: 'pax',
    entries: [
      ...baseEntries({ 'homedir/public_html/wp-config.php': null }),
      {
        name: `${ROOT}/homedir/public_html/wp-config.php`,
        data: `${WP_CONFIG}EXTRA`,
        pax: {
          'GNU.sparse.major': '0',
          'GNU.sparse.minor': '1',
          'GNU.sparse.size': String(WP_CONFIG.length),
          'GNU.sparse.numblocks': '1',
          'GNU.sparse.map': `0,${WP_CONFIG.length}`,
        },
      },
    ],
    gzip: true,
  });
  add('s35-pax-bad-record', {
    format: 'pax',
    entries: [
      ...baseEntries(),
      { name: `${ROOT}/homedir/public_html/p.txt`, data: 'x', pax: { mtime: 'soon' } },
    ],
    gzip: true,
  });
  add('s36-global-pax', {
    entries: [
      {
        name: 'pax_global_header',
        type: 'g',
        data: paxRecordsText({ path: `${ROOT}/homedir/public_html/ghost.php`, comment: 'g' }),
      },
      ...baseEntries(),
    ],
    gzip: true,
  });
  add('s37-multisite-network', {
    entries: baseEntries(network(3)),
    gzip: true,
  });
  add('s38-multisite-subdir-complete-insert', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': MULTISITE_CONFIG('').replace(
        "'SUBDOMAIN_INSTALL', true",
        "'SUBDOMAIN_INSTALL', false",
      ),
      'mysql/demo_wp.sql': `${DUMP}${blogsInsert([[1, DOMAIN, '/']], true)}INSERT INTO wp_blogs (blog_id,site_id,domain,path,registered,last_updated,public,archived,mature,spam,deleted,lang_id) VALUES (2,1,'${DOMAIN}','/loja/','x','y',0,0,0,1,0,0);\nINSERT INTO \`wp_site\` VALUES (1,'${DOMAIN}','/');\n`,
    }),
    gzip: true,
  });
  add('s39-multisite-domain-mapping', {
    entries: baseEntries(
      network(2, "INSERT INTO `wp_domain_mapping` VALUES (1,2,'shop.example.net',1);\n"),
    ),
    gzip: true,
  });
  add('s40-multisite-two-networks', {
    entries: baseEntries(
      network(2, `INSERT INTO \`wp_site\` VALUES (2,'other.example.net','/');\n`),
    ),
    gzip: true,
  });
  add('s41-multisite-too-many', { entries: baseEntries(network(25)), gzip: true });
  add('s42-multisite-nfr-cap', { entries: baseEntries(network(102)), gzip: true });
  add('s43-multisite-huge-statement', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': MULTISITE_CONFIG(''),
      'mysql/demo_wp.sql': `${DUMP}INSERT INTO \`wp_blogs\` VALUES (1,1,'${DOMAIN}','/','${big(300 * 1024)}','x',1,0,0,0,0,0);\n`,
    }),
    gzip: true,
  });
  add('s44-multisite-ansi-quotes', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': MULTISITE_CONFIG(''),
      'mysql/demo_wp.sql': `${DUMP}INSERT INTO "wp_blogs" VALUES (1,1,'${DOMAIN}','/','x','y',1,0,0,0,0,0);\n`,
    }),
    gzip: true,
  });
  add('s45-multisite-sunrise', {
    entries: [
      ...baseEntries(network(2)),
      { name: `${ROOT}/homedir/public_html/wp-content/sunrise.php`, data: '<?php' },
    ],
    gzip: true,
  });
  add('s46-multisite-subdomain-path', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': MULTISITE_CONFIG(''),
      'mysql/demo_wp.sql': `${DUMP}${blogsInsert([
        [1, DOMAIN, '/'],
        [2, DOMAIN, '/blog/'],
      ])}`,
    }),
    gzip: true,
  });
  add('s47-multisite-slug-collision', {
    entries: baseEntries({
      'homedir/public_html/wp-config.php': MULTISITE_CONFIG(''),
      'mysql/demo_wp.sql': `${DUMP}${blogsInsert([
        [1, DOMAIN, '/'],
        [2, `a-b.${DOMAIN}`, '/'],
        [3, `a.b.${DOMAIN}`, '/'],
      ])}INSERT INTO wp_site VALUES (1,'x','/');\n`,
    }),
    gzip: true,
  });
  add('s48-plugin-site-tables-budget', {
    entries: baseEntries({
      'mysql/demo_wp.sql': `${DUMP}${Array.from({ length: 270 }, (_, i) => `INSERT INTO \`wp_plugin${i % 3}_site\` VALUES (${i},'${big(250 * 1024)}');\n`).join('')}`,
    }),
    gzip: true,
  });
  add('s49-too-many-vhosts', {
    entries: [
      ...baseEntries(),
      ...Array.from({ length: 501 }, (_, i) => ({
        name: `${ROOT}/userdata/s${i}.${DOMAIN}`,
        data: 'documentroot: x\n',
      })),
    ],
    gzip: true,
  });
  add('s50-php-inherit-and-old', {
    entries: baseEntries({ [`userdata/${DOMAIN}`]: vhost(DOMAIN, 'inherit') }),
    gzip: true,
  });
  add('s51-gzip-multi', { entries: baseEntries(), gzip: 'multi' });
  add('s52-one-byte', { entries: [], end: 'none', raw: new Uint8Array([0x41]) });
  add('s53-empty-archive', { entries: [], gzip: true });
  add('s54-dotslash', {
    entries: baseEntries().map((e) => ({ ...e, name: `./${e.name}` })),
    gzip: true,
  });
  add('s55-pax-too-long', {
    format: 'pax',
    entries: [
      ...baseEntries(),
      {
        name: `${ROOT}/homedir/public_html/q.txt`,
        data: 'x',
        pax: { comment: big(1024 * 1024 + 10) },
      },
    ],
    gzip: true,
  });
  add('s56-sites', {
    entries: [
      ...baseEntries({
        'userdata/main': `---\naddon_domains:\n  loja.example.net: loja.${DOMAIN}\nmain_domain: ${DOMAIN}\nparked_domains:\n  - demo.example.org\nsub_domains:\n  - loja.${DOMAIN}\n  - blog.${DOMAIN}\n`,
        [`userdata/loja.${DOMAIN}`]: vhost(`loja.${DOMAIN}`, 'ea-php81', 'loja.example.net'),
        [`userdata/blog.${DOMAIN}`]: vhost(`blog.${DOMAIN}`, 'ea-php84', 'public_html/blog'),
        'homedir/loja.example.net/wp-config.php': WP_CONFIG,
        'homedir/public_html/blog/index.html': '<h1>blog</h1>',
        'cron/demo':
          'MAILTO=""\nSHELL=/bin/bash\n# comment\n*/5 * * * * php ~/public_html/wp-cron.php\n0 3 * * * ~/bin/backup.sh --token=fixture\n',
        proftpdpasswd:
          'demo:$6$fixture$x:1001:1001::/x:/bin/ftpsh\nftpuser@example.com:$6$fixture$y:1001:1001::/x:/bin/ftpsh\n',
        'dnszones/loja.example.net.db': `loja.example.net. IN SOA ns1.example.com. admin.example.com. 1 2 3 4 5\n@ IN MX 0 mail.loja.example.net.\nmail IN A 203.0.113.30\n@ IN TXT "v=spf1 include:_spf.example.com ~all; not a comment"\n`,
        'apache_tls/demo.example.com': 'fixture certificate and key',
        'sslkeys/demo.key': 'fixture key',
        'psql/demo_pg.tar': 'fixture',
        'mysql/demo_loja.sql': `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n-- Server version\t8.0.36\n`,
      }),
    ],
    gzip: true,
  });
  return list;
}

function paxRecordsText(records: Record<string, string>): Uint8Array {
  return paxData(records);
}

// ------------------------------------------------------------ demo backups

/** The backups of the screen photos (committed in test/fixtures/analyzer/). */
export function demoBackups(): { file: string; spec: BackupSpec }[] {
  const shop = `loja.${DOMAIN}`;
  const rich = baseEntries({
    'userdata/main': `---\naddon_domains:\n  loja.example.net: ${shop}\nmain_domain: ${DOMAIN}\nparked_domains:\n  - demo.example.org\nsub_domains:\n  - ${shop}\n  - blog.${DOMAIN}\n`,
    [`userdata/${shop}`]: vhost(shop, 'ea-php81', 'loja.example.net'),
    [`userdata/blog.${DOMAIN}`]: vhost(`blog.${DOMAIN}`, 'ea-php82', 'public_html/blog'),
    'homedir/loja.example.net/wp-config.php': WP_CONFIG.replace("'demo_wp'", "'demo_loja'"),
    'homedir/loja.example.net/wp-includes/version.php': "<?php\n$wp_version = '6.7.2';\n",
    'homedir/loja.example.net/index.php': '<?php require __DIR__ . "/wp-blog-header.php";\n',
    'homedir/public_html/blog/index.html': '<h1>Blog</h1>\n',
    [`homedir/etc/${DOMAIN}/passwd`]: 'contato:x:1001:1001::/x:/y\nvendas:x:1001:1001::/x:/y\n',
    [`homedir/etc/${DOMAIN}/shadow`]:
      'contato:$6$fixture$hash:20000::::::\nvendas:$6$fixture$hash:20000::::::\n',
    'cron/demo':
      'MAILTO=""\n*/5 * * * * php ~/public_html/wp-cron.php\n0 3 * * * ~/bin/backup.sh\n',
    proftpdpasswd: 'demo:$6$fixture$x:1001:1001::/x:/bin/ftpsh\n',
    [`dnszones/${DOMAIN}.db`]: `$TTL 14400\n${DOMAIN}. 86400 IN SOA ns1.example.com. admin.example.com. ( 2026101701 3600 1800 1209600 86400 )\n${DOMAIN}. 14400 IN A 203.0.113.20\nwww 14400 IN CNAME ${DOMAIN}.\n${DOMAIN}. 14400 IN MX 0 mail.${DOMAIN}.\nmail 14400 IN A 203.0.113.20\n${DOMAIN}. 14400 IN TXT "v=spf1 +a +mx ~all"\n`,
    'dnszones/loja.example.net.db': `loja.example.net. 86400 IN SOA ns1.example.com. admin.example.com. 1 3600 1800 1209600 86400\nloja.example.net. 14400 IN A 203.0.113.21\n`,
    [`apache_tls/${DOMAIN}`]: 'fixture certificate',
    'mysql/demo_loja.sql': `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)\n-- Server version\t8.0.36\n${'-- data\n'.repeat(400)}`,
  });
  const mail = [
    {
      name: `${ROOT}/homedir/mail/${DOMAIN}/contato/cur/1760000000.M1:2,S`,
      data: 'x'.repeat(40_000),
    },
    { name: `${ROOT}/homedir/mail/${DOMAIN}/vendas/new/1760000001.M2`, data: 'y'.repeat(12_000) },
    { name: `${ROOT}/homedir/public_html/wp-content/uploads/logo.png`, data: 'z'.repeat(180_000) },
  ];
  return [
    { file: 'cpmove-demo.tar.gz', spec: { entries: [...rich, ...mail], gzip: true } },
    {
      file: 'cpmove-multisite.tar.gz',
      spec: {
        entries: baseEntries({
          'homedir/public_html/wp-config.php': WP_CONFIG.replace(
            '$table_prefix',
            "define( 'WP_ALLOW_MULTISITE', true );\n$table_prefix",
          ),
        }),
        gzip: true,
      },
    },
    {
      file: 'cpmove-notes.tar.gz',
      spec: {
        entries: [
          ...baseEntries({ [`userdata/${DOMAIN}`]: vhost(DOMAIN, 'ea-php84') }),
          { name: '../homedir/public_html/extra.php', data: '<?php' },
        ],
        gzip: true,
      },
    },
  ];
}

/** One USTAR header block, for archives written by hand (the large sparse file test). */
export function entryHeader(name: string, size: number): Uint8Array {
  return header(name, '0', size, 'ustar');
}
