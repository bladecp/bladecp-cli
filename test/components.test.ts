import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPONENTS, seedComponents } from './helpers/mock/components.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

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

const cli = (argv: string[], extra: Partial<RunOptions> = {}) =>
  runCli(argv, {
    configDir: dir.path,
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
    ...extra,
  });

describe('bladecp components list', () => {
  it('lists the catalog, without the internal images', async () => {
    const result = await cli(['components', 'list']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET').at(-1)?.path).toBe('/api/v1/customer/components/catalog');
    expect(result.stdout).toMatch(/^COMPONENT\s+NAME\s+TYPE\s+VERSION$/m);
    expect(result.stdout).toMatch(/php\s+PHP\s+Runtime\s+3/);
    expect(result.stdout).toMatch(/wp-cli-toolkit\s+WordPress Toolkit\s+Tools\s+1/);
    expect(result.stdout).not.toContain('example/php');
    expect(result.stdout).not.toContain('PLAN');
  });

  it('"bladecp components" alone is the list, and --json is the data of the API', async () => {
    const alone = await cli(['components']);
    const list = await cli(['components', 'list']);
    expect(alone.stdout).toBe(list.stdout);
    const json = await cli(['components', '--json']);
    expect(parseJson(json.stdout)).toEqual({ ok: true, data: COMPONENTS });
  });

  it('marks what the plan does not include, and tolerates missing fields', async () => {
    seedComponents(api, [
      { ...COMPONENTS[0]!, allowed_for_tier: false },
      { slug: 'memcached', name: 'Memcached', category: null, latest_version: null, versions: [] },
    ]);
    const result = await cli(['components', 'list']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/php\s+PHP\s+Runtime\s+3\.0\.2\s+not in your plan/);
    expect(result.stdout).toMatch(/memcached\s+Memcached\s+-\s+-\s+included/);
  });

  it('an empty catalog says so', async () => {
    seedComponents(api, []);
    const result = await cli(['components', 'list'], { tty: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('The component catalog is empty.');
  });

  it('an answer without a list is an invalid response', async () => {
    api.fail({ path: /components\/catalog$/, status: 200, body: { data: {} } });
    const result = await cli(['components', 'list', '--json']);
    expect(result.code).toBe(1);
    expect(parseJson(result.stdout).error?.code).toBe('invalid_response');
  });

  it('never shows the key', async () => {
    const result = await cli(['components']);
    expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
  });
});

describe('the version of a component', () => {
  it('is read from the image of the default version, never the position', async () => {
    const { componentVersion } = await import('../src/commands/components.js');
    const versions = [
      {
        id: 27,
        version: 0,
        image: 'registry.example.com/library/mysql:8.4.0-oraclelinux8',
        is_default: true,
      },
      {
        id: 28,
        version: 1,
        image: 'registry.example.com/library/mysql:8.3.0-oraclelinux8',
        is_default: false,
      },
    ];
    expect(componentVersion({ latest_version: 0, versions })).toBe('8.4.0');
    expect(componentVersion({ versions: [{ version: 0, image: 'example/node:20-alpine' }] })).toBe(
      '20',
    );
    expect(componentVersion({ versions: [{ version: 0, image: 'example/php:latest' }] })).toBe('');
    expect(componentVersion({ latest_version: 3 })).toBe('');
  });
});
