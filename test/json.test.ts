import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  dir = tempDir();
  api.addMigration({
    uuid: '01970000-0000-7000-8000-00000000m001',
    phase: 'awaiting_approval',
    primaryDomain: 'example.com',
    sourcePrimaryDomain: 'example.com',
    stagingUrl: 'https://01970000-0000-7000-8000-00000000m001.preview.example.net/',
    components: [
      { name: 'files', status: 'completed' },
      { name: 'database', status: 'completed' },
    ],
  });
});

afterEach(async () => {
  await api.stop();
  dir.cleanup();
});

/** The JSON contract: stdout is exactly one JSON document and stderr stays silent. */
async function json(argv: string[]) {
  const result = await runCli([...argv, '--json'], {
    configDir: dir.path,
    apiUrl: api.baseUrl,
    env: { BLADECP_API_KEY: LIVE_KEY },
  });
  expect(result.stderr).toBe('');
  const parsed = JSON.parse(result.stdout);
  // Replace the random local port so snapshots are stable.
  return {
    code: result.code,
    body: JSON.parse(JSON.stringify(parsed).replaceAll(api.baseUrl, 'http://127.0.0.1:PORT')),
  };
}

describe('--json output is stable', () => {
  it('whoami', async () => {
    expect(await json(['whoami'])).toMatchSnapshot();
  });

  it('servers list', async () => {
    expect(await json(['servers', 'list'])).toMatchSnapshot();
  });

  it('servers show', async () => {
    expect(
      await json(['servers', 'show', '01970000-0000-7000-8000-00000000s001']),
    ).toMatchSnapshot();
  });

  it('destinations list', async () => {
    expect(await json(['destinations', 'list'])).toMatchSnapshot();
  });

  it('migrations list', async () => {
    expect(await json(['migrations', 'list'])).toMatchSnapshot();
  });

  it('migrations status', async () => {
    expect(
      await json(['migrations', 'status', '01970000-0000-7000-8000-00000000m001']),
    ).toMatchSnapshot();
  });

  it('migrations approve', async () => {
    expect(
      await json(['migrations', 'approve', '01970000-0000-7000-8000-00000000m001']),
    ).toMatchSnapshot();
  });

  it('error envelope', async () => {
    expect(
      await json(['migrations', 'status', '01970000-0000-7000-8000-00000000ffff']),
    ).toMatchSnapshot();
  });

  it('usage error envelope', async () => {
    expect(await json(['servers', 'show'])).toMatchSnapshot();
  });
});
