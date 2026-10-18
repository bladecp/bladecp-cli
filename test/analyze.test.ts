import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBackup, demoBackups } from './helpers/backup.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

const DEMO = 'test/fixtures/analyzer/cpmove-demo.tar.gz';
const MULTISITE = 'test/fixtures/analyzer/cpmove-multisite.tar.gz';
const NOTES = 'test/fixtures/analyzer/cpmove-notes.tar.gz';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

/** No key, and a network that fails the test if anything is asked. */
const offline = (extra: Partial<RunOptions> = {}) => {
  const asked: string[] = [];
  return {
    asked,
    options: {
      configDir: join(dir.path, 'config'),
      apiUrl: api.baseUrl,
      env: { BLADECP_NO_UPDATE_CHECK: '1' },
      fetch: async (input: string) => {
        asked.push(input);
        throw new Error(`unexpected request to ${input}`);
      },
      ...extra,
    } satisfies RunOptions,
  };
};

describe('bladecp analyze', () => {
  it('the committed demo backups are the ones the builder makes', async () => {
    const { gunzipSync } = await import('node:zlib');
    const { readFileSync } = await import('node:fs');
    for (const demo of demoBackups()) {
      const committed = gunzipSync(readFileSync(join('test/fixtures/analyzer', demo.file)));
      expect(Buffer.compare(committed, gunzipSync(buildBackup(demo.spec))), demo.file).toBe(0);
    }
  });

  it('a backup that migrates: exit 0, the report on stdout, nothing sent', async () => {
    const run = offline();
    const result = await runCli(['analyze', DEMO, '--lang', 'en'], run.options);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('cpmove-demo.tar.gz: Migrates to BladeCP');
    expect(result.stdout).toContain('Comes to BladeCP:');
    expect(result.stdout).toContain('Main site demo.example.com: WordPress 6.8.1 · PHP 8.2');
    expect(result.stdout).toContain('To migrate:');
    expect(result.stdout).toContain(`bladecp migrate ${DEMO}`);
    expect(run.asked).toEqual([]);
  });

  it('never asks the network without --prices, even signed in', async () => {
    const run = offline({ env: { BLADECP_API_KEY: LIVE_KEY, BLADECP_NO_UPDATE_CHECK: '1' } });
    const result = await runCli(['analyze', DEMO, '--json'], run.options);
    expect(result.code).toBe(0);
    expect(run.asked).toEqual([]);
    expect(api.requests).toHaveLength(0);
  });

  it('a backup that does not migrate: exit 6, and --json still answers ok with the verdict', async () => {
    const run = offline();
    const human = await runCli(['analyze', MULTISITE, '--lang', 'en'], run.options);
    expect(human.code).toBe(6);
    expect(human.stdout).toContain('WordPress Multisite (WP_ALLOW_MULTISITE)');
    const json = await runCli(['analyze', MULTISITE, '--json'], run.options);
    expect(json.code).toBe(6);
    expect(json.stderr).toBe('');
    const body = parseJson(json.stdout) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.data.verdict).toBe('blocked');
    expect(body.data.blockers).toEqual([
      expect.objectContaining({
        code: 'multisite_unsupported',
        reason: 'not_default_network',
        params: { constant: 'WP_ALLOW_MULTISITE', define: 'BLOG_ID_CURRENT_SITE' },
        message: expect.stringContaining('WP_ALLOW_MULTISITE'),
        fix: expect.stringContaining('wp-config.php'),
      }),
    ]);
  });

  it('the --json contract (bladecp.analyze.v1)', async () => {
    const run = offline();
    for (const file of [DEMO, MULTISITE, NOTES]) {
      const result = await runCli(['analyze', file, '--json', '--lang', 'en'], run.options);
      expect(result.stderr).toBe('');
      expect({ code: result.code, body: JSON.parse(result.stdout) }).toMatchSnapshot(file);
    }
  });

  it('--prices without a key explains how to sign in, and the analysis stands', async () => {
    const run = offline();
    const human = await runCli(['analyze', DEMO, '--prices', '--lang', 'en'], run.options);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain('sign in with bladecp login, then run it again with --prices');
    const json = await runCli(['analyze', DEMO, '--prices', '--json'], run.options);
    expect(parseJson(json.stdout).data).toMatchObject({
      recommendation: { mode: 'signed_out' },
      privacy: { network: false },
    });
    expect(run.asked).toEqual([]);
  });

  it('--prices signed in: the cheapest plan that fits and the command to migrate to it', async () => {
    api.destinations.push({
      partnerUuid: 'p2',
      partnerName: 'BladeCP',
      partnerPlanId: 21,
      planName: 'Edge Cloud 2',
      diskGb: 60,
      prices: [
        { currency: 'BRL', priceMonthly: 129 },
        { currency: 'USD', priceMonthly: 24 },
      ],
      locations: [{ locationId: 8, name: 'Frankfurt', countryCode: 'DE' }],
    });
    const options: RunOptions = {
      configDir: join(dir.path, 'config'),
      apiUrl: api.baseUrl,
      env: { BLADECP_API_KEY: LIVE_KEY, BLADECP_NO_UPDATE_CHECK: '1' },
    };
    const json = await runCli(
      ['analyze', DEMO, '--prices', '--currency', 'brl', '--json'],
      options,
    );
    expect(json.code).toBe(0);
    const data = parseJson(json.stdout).data as {
      privacy: { network: boolean };
      recommendation: unknown;
    };
    expect(data.privacy.network).toBe(true);
    expect(data.recommendation).toMatchObject({
      mode: 'live',
      currency: 'BRL',
      best: {
        partnerPlanId: 12,
        planName: 'Stack Container S',
        price: { currency: 'BRL', priceMonthly: 49 },
      },
      alternatives: [{ partnerPlanId: 21 }],
    });
    // The only request: the plans of the account, with the currency and nothing of the backup.
    const asked = api.requests.map((r) => `${r.method} ${r.path}${r.search}`);
    expect(asked).toEqual(['GET /api/v1/customer/me/migration-destinations?currency=BRL']);
    const human = await runCli(['analyze', DEMO, '--prices', '--lang', 'en'], options);
    expect(human.stdout).toContain('Stack Container S');
    expect(human.stdout).toContain(`bladecp migrate ${DEMO} --plan 12 --location 3`);
  });

  it('--prices when the network fails: the minimum plan stays and the exit code too', async () => {
    const run = offline({
      env: { BLADECP_API_KEY: LIVE_KEY, BLADECP_NO_UPDATE_CHECK: '1' },
      fetch: async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        });
      },
      upload: { baseDelayMs: 0 },
    });
    const result = await runCli(['analyze', DEMO, '--prices', '--json'], run.options);
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({
      recommendation: { mode: 'unavailable', reason: 'network_error' },
      requirements: { diskGb: 1 },
    });
  });

  it('usage errors: a missing file, a folder, an empty file, --currency alone', async () => {
    const run = offline();
    const empty = join(dir.path, 'empty.tar.gz');
    writeFileSync(empty, '');
    const folder = join(dir.path, 'folder');
    mkdirSync(folder);
    const cases: [string[], string][] = [
      [['analyze', join(dir.path, 'nothing.tar.gz')], 'file_not_found'],
      [['analyze', folder], 'not_a_file'],
      [['analyze', empty], 'empty_file'],
      [['analyze', DEMO, '--currency', 'BRL'], 'usage'],
      [['analyze', DEMO, '--prices', '--currency', 'reais'], 'usage'],
    ];
    for (const [argv, code] of cases) {
      const result = await runCli([...argv, '--json'], run.options);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.code, argv.join(' ')).toBe(code);
    }
  });

  it('a file that is not a backup is a refusal with a reason, not a crash', async () => {
    const run = offline();
    const result = await runCli(
      ['analyze', 'test/fixtures/site-old.zip', '--json', '--lang', 'en'],
      run.options,
    );
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).data).toMatchObject({
      verdict: 'blocked',
      blockers: [
        {
          code: 'archive_truncated',
          message: 'This file is not a cPanel backup: it is not a tar or tar.gz archive.',
        },
      ],
    });
  });

  it('Ctrl+C stops the reading (exit 130)', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = offline({ signal: controller.signal });
    const result = await runCli(['analyze', DEMO, '--json'], run.options);
    expect(result.code).toBe(130);
    expect(parseJson(result.stdout).error?.code).toBe('interrupted');
  });
});

describe('bladecp analyze never shows a secret of the backup', () => {
  const PEM = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
  const SECRETS = [
    'Fixture-Password-123',
    'fixture-auth-key-value',
    '$6$fixture',
    'contato',
    'vendas',
    PEM,
    'MIIfixture',
    'IDENTIFIED BY',
    'backup.sh',
  ];

  it('in every mode: plain, terminal with and without color, --json, --prices', async () => {
    const demo = demoBackups().find((d) => d.file === 'cpmove-demo.tar.gz')!;
    const file = join(dir.path, 'cpmove-demo.tar.gz');
    writeFileSync(
      file,
      buildBackup({
        ...demo.spec,
        entries: [
          ...demo.spec.entries,
          { name: 'cpmove-demo/sslkeys/demo.key', data: `${PEM}\nMIIfixture\n` },
          {
            name: 'cpmove-demo/mysql.sql',
            data: "GRANT ALL ON *.* TO 'demo'@'localhost' IDENTIFIED BY PASSWORD '*00';\n",
          },
        ],
      }),
    );
    const base = { configDir: join(dir.path, 'config'), apiUrl: api.baseUrl };
    const runs = [
      await runCli(['analyze', file], { ...base, env: { BLADECP_NO_UPDATE_CHECK: '1' } }),
      await runCli(['analyze', file], {
        ...base,
        tty: true,
        columns: 80,
        env: { BLADECP_NO_UPDATE_CHECK: '1' },
      }),
      await runCli(['analyze', file], {
        ...base,
        tty: true,
        columns: 120,
        env: { NO_COLOR: undefined, COLORTERM: 'truecolor', BLADECP_NO_UPDATE_CHECK: '1' },
      }),
      await runCli(['analyze', file, '--json'], { ...base, env: { BLADECP_NO_UPDATE_CHECK: '1' } }),
      await runCli(['analyze', file, '--prices', '--json'], {
        ...base,
        env: { BLADECP_API_KEY: LIVE_KEY, BLADECP_NO_UPDATE_CHECK: '1' },
      }),
    ];
    for (const result of runs) {
      expect(result.code).toBe(0);
      for (const secret of SECRETS) {
        expect(result.stdout, secret).not.toContain(secret);
        expect(result.stderr, secret).not.toContain(secret);
      }
    }
    // The request of --prices carries nothing of the backup.
    for (const request of api.requests) {
      for (const secret of [...SECRETS, 'demo.example.com', 'cpmove']) {
        expect(JSON.stringify(request), secret).not.toContain(secret);
      }
    }
  });
});
