// The photo machinery of the screen tests (test/screens*.test.ts): the
// simulated API with the shared seed, the official addresses answered by it,
// a terminal of 40, 80 or 120 columns in the three languages, with and
// without color. Each group of commands keeps its photos in its own
// test/screens-<group>.test.ts, so its snapshots live in their own file.

process.env.TZ = 'UTC';

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { LANGS, type Lang } from '../../src/i18n/index.js';
import { LIVE_KEY, type MockApi, startMockApi } from './mock-api.js';
import { type RunOptions, runCli, tempDir } from './run.js';
import { renderScreen } from './vt.js';

export const OFFICIAL = 'https://api.bladecp.com';
export const HUB = 'https://hub.bladecp.com';
export const WIDTHS = [40, 80, 120] as const;
export const MODES = ['plain', 'color'] as const;

export const SERVER = '0197a1c4-0000-7000-8000-000000000001';
export const READY = '01979f2c-0000-7000-8000-000000000002';
export const FAILED = '01979e11-0000-7000-8000-000000000003';
export const DONE = '01979d00-0000-7000-8000-000000000004';
export const SLOW = '01979c00-0000-7000-8000-000000000005';

const CHANGELOG = `# Changelog

## [0.5.0] - 2026-11-20

### Added

- \`bladecp servers\` shows the disk of each server.
- Faster uploads on slow links.

## [0.4.0] - 2026-10-19
`;

export interface Env {
  api: MockApi;
  dir: string;
  backup: string;
}

export interface Scenario {
  name: string;
  argv: (env: Env) => string[];
  setup?: (env: Env) => void | Promise<void>;
  options?: (env: Env) => Partial<RunOptions>;
  /** Without a key (signed out). */
  signedOut?: boolean;
  /** Another key than the valid one (an expired key, for example). */
  apiKey?: string;
}

export function seed(api: MockApi): void {
  api.provisions = [
    {
      uuid: SERVER,
      status: 'active',
      primary_domain: 'example.com',
      product_type: 'stack-container',
    },
    {
      uuid: '0197a2b9-0000-7000-8000-000000000006',
      status: 'pending',
      primaryDomain: 'shop.example.org',
      product_type: 'edge-cloud',
    },
    {
      uuid: '01969f10-0000-7000-8000-000000000007',
      status: 'deleted',
      primary_domain: 'old.example.net',
      product_type: 'stack-container',
    },
  ];
  api.usage[SERVER] = {
    provisionUuid: SERVER,
    plan: { diskGb: 20, bandwidthGbMonth: null, emailAccounts: 10, sqlDatabases: 5 },
    usage: { diskGb: 16.4, bandwidthGbMonth: 41.7, emailAccounts: null, sqlDatabases: 2 },
    status: 'healthy',
    asOf: '2026-10-17T12:00:00.000Z',
  };
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
  api.addMigration({
    uuid: READY,
    phase: 'awaiting_approval',
    primaryDomain: 'shop.example.org',
    sourcePrimaryDomain: 'shop.example.org',
    stagingUrl: 'https://01979f2c.preview.example.net',
    components: [
      { name: 'files', status: 'completed' },
      { name: 'database', status: 'completed' },
    ],
    createdAt: '2026-10-16T18:20:00.000Z',
  });
}

/** The network of a photo: the official addresses answered by the mock. */
function network(api: MockApi): RunOptions['fetch'] {
  return async (input, init) => {
    if (input.startsWith('https://registry.npmjs.org/')) {
      return new Response(JSON.stringify({ 'dist-tags': { latest: '0.5.0' } }), { status: 200 });
    }
    if (input.startsWith('https://raw.githubusercontent.com/')) {
      return new Response(CHANGELOG, { status: 200 });
    }
    return fetch(input.replace(OFFICIAL, api.baseUrl).replace(HUB, api.baseUrl), init);
  };
}

export async function photo(
  scenario: Scenario,
  lang: Lang,
  width: number,
  mode: (typeof MODES)[number],
) {
  const api = await startMockApi();
  const dir = tempDir('bladecp-photo-');
  try {
    seed(api);
    const backup = join(dir.path, 'cpmove-site.tar.gz');
    writeFileSync(backup, gzipSync(randomBytes(640), { level: 0 }));
    const env: Env = { api, dir: dir.path, backup };
    await scenario.setup?.(env);
    let screen = '';
    const extra = scenario.options?.(env) ?? {};
    const result = await runCli(scenario.argv(env), {
      configDir: join(dir.path, 'config'),
      apiUrl: OFFICIAL,
      tty: true,
      columns: width,
      rows: 40,
      fetch: network(api),
      env: {
        BLADECP_API_KEY: scenario.signedOut ? undefined : (scenario.apiKey ?? LIVE_KEY),
        BLADECP_HUB_URL: undefined,
        LANG: lang === 'pt-BR' ? 'pt_BR.UTF-8' : lang === 'es' ? 'es_ES.UTF-8' : 'en_US.UTF-8',
        ...(mode === 'plain'
          ? { NO_COLOR: '1' }
          : { NO_COLOR: undefined, COLORTERM: 'truecolor', FORCE_HYPERLINK: '1' }),
      },
      screen: (chunk) => {
        screen += chunk;
      },
      ...extra,
    });
    // The callback port of the sign-in address changes on every run.
    const stable = screen
      .replace(/127\.0\.0\.1%3A\d+/g, '127.0.0.1%3A50505')
      .replace(/state=[A-Za-z0-9_-]{43}/g, `state=${'S'.repeat(43)}`)
      .replace(/code_challenge=[A-Za-z0-9_-]{43}/g, `code_challenge=${'C'.repeat(43)}`);
    const view = renderScreen(stable, width);
    return { result, view };
  } finally {
    await api.stop();
    dir.cleanup();
  }
}

/** The photos of a list of scenarios, in every language, width and color mode. */
export function screenSuite(scenarios: Scenario[]): void {
  describe.each(scenarios)('screen: $name', (scenario) => {
    for (const lang of LANGS) {
      for (const width of WIDTHS) {
        for (const mode of MODES) {
          it(`${lang} ${width} ${mode}`, async () => {
            const { view } = await photo(scenario, lang, width, mode);
            expect(view.unknown, 'sequences the CLI should not write').toEqual([]);
            // Only a word longer than the line (an address, a path) may run past
            // the last column; a terminal wraps it and it can still be copied.
            for (const row of view.overflow) expect(row, `wider than ${width}`).toMatch(/\S{16,}$/);
            expect(
              mode === 'plain' ? view.text : `${view.text}\n\n--- styles ---\n${view.styles}`,
            ).toMatchSnapshot();
          });
        }
      }
    }
  });
}
