import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addTask, linkService, SERVICE_ID, wordpressState } from './helpers/mock/wordpress.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

/** The first server of the simulated account (example.com), linked to service 1042. */
const SERVER = '01970000-0000-7000-8000-00000000s001';
const EXT = ['--external-id', SERVICE_ID];
const TASK = '01979c4e-0000-7000-8000-0000000000aa';

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

const posts = () => api.apiCalls('POST');

describe('bladecp wordpress status', () => {
  it('asks with the service ID and says the tools are ready', async () => {
    const result = await cli(['wordpress', 'status', SERVER, ...EXT]);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /\/wordpress$/).at(-1)).toMatchObject({
      path: `/api/v1/customer/provisions/${SERVER}/wordpress`,
      search: `?external_service_id=${SERVICE_ID}`,
    });
    expect(result.stdout).toMatch(/WordPress tools\s+ready/);
    expect(result.stdout).toContain('https://example.com');
    expect(result.stdout).toContain(
      `bladecp wordpress dashboard ${SERVER} --external-id ${SERVICE_ID} --wait`,
    );
    const json = await cli(['wordpress', 'status', SERVER, ...EXT, '--json']);
    expect(parseJson(json.stdout)).toEqual({
      ok: true,
      data: { available: true, reason: null, primaryDomain: 'example.com' },
    });
  });

  it('says why the tools are not available', async () => {
    wordpressState(api).unavailable.set(SERVER, 'toolkit_unavailable');
    const result = await cli(['wordpress', 'status', SERVER, ...EXT]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/WordPress tools\s+not available/);
    expect(result.stdout).toContain('not active on this server yet');
  });

  it('on your own server it needs no --external-id, and suggestions leave it out', async () => {
    const result = await cli(['wordpress', 'status', SERVER]);
    expect(result.code).toBe(0);
    expect(api.apiCalls().at(-1)?.search ?? '').not.toContain('external_service_id');
    expect(result.stdout).not.toContain('--external-id');
    expect(result.stdout).toContain(`bladecp wordpress dashboard ${SERVER} --wait`);
  });

  it('a partner without --external-id hears that the server is not theirs and what to add', async () => {
    api.setPartner();
    const result = await cli(['wordpress', 'status', SERVER, '--json']);
    expect(result.code).not.toBe(0);
    expect(parseJson(result.stdout).error?.hint).toContain('--external-id');
  });

  it('an ID of another service is not found, with what to check', async () => {
    const result = await cli(['wordpress', 'status', SERVER, '--external-id', '9999', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error?.hint).toContain('--external-id');
  });

  it('takes the first characters of a server ID and quotes odd IDs in suggestions', async () => {
    const uuid = '0197a1c4-0000-7000-8000-000000000001';
    api.provisions.push({ uuid, status: 'active', primary_domain: 'site.example.net' });
    linkService(api, uuid, 'svc 77');
    const result = await cli(['wordpress', 'status', '0197a1c4', '--external-id', 'svc 77']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /\/wordpress$/).at(-1)?.path).toContain(uuid);
    expect(result.stdout).toContain("--external-id 'svc 77' --wait");
  });
});

describe('bladecp wordpress dashboard', () => {
  it('requests the overview and says how to follow it', async () => {
    const result = await cli(['wordpress', 'dashboard', SERVER, ...EXT]);
    expect(result.code).toBe(0);
    const post = posts().at(-1)!;
    expect(post).toMatchObject({
      path: `/api/v1/customer/provisions/${SERVER}/wordpress/dashboard`,
      search: `?external_service_id=${SERVICE_ID}`,
    });
    expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.stdout).toContain('BladeCP is reading the WordPress of the server.');
    expect(result.stdout).toContain(
      `bladecp wordpress task ${SERVER} 01979c4e-0000-7000-8000-000000000001 --external-id ${SERVICE_ID} --wait`,
    );
    const json = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--json']);
    expect(parseJson(json.stdout)).toEqual({
      ok: true,
      data: {
        commandId: '01979c4e-0000-7000-8000-000000000002',
        command: 'dashboard-snapshot',
        status: 'queued',
      },
    });
  });

  it('--wait follows the task with the virtual clock and shows the overview', async () => {
    const result = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--wait'], {
      pollIntervalMs: 2000,
    });
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /\/commands\//)).toHaveLength(2);
    expect(result.sleeps).toContain(2000);
    expect(result.stdout).toContain('WordPress  6.5.2 (6.6.2 available)');
    expect(result.stdout).toMatch(/akismet\s+Akismet Anti-spam\s+5\.3\s+5\.3\.1\s+active/);
    expect(result.stdout).toMatch(/hello-dolly\s+Hello Dolly\s+1\.7\.2\s+-\s+inactive/);
    expect(result.stdout).toMatch(/Plugins\s+4 · 2 with updates/);
    expect(result.stdout).toContain(
      `bladecp wordpress update plugin ${SERVER} akismet --external-id ${SERVICE_ID}`,
    );
    const json = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--wait', '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({
      command: 'dashboard-snapshot',
      status: 'succeeded',
      result: { coreVersion: '6.5.2' },
    });
  });

  it('--wait on a task that fails ends with exit 1 and the reason', async () => {
    wordpressState(api).script = ['running', 'timeout'];
    const result = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--wait']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('took too long');
    expect(result.stdout).toContain('BladeCP stopped it');
    const json = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--wait', '--json']);
    expect(json.code).toBe(1);
    expect(parseJson(json.stdout).data).toMatchObject({ status: 'timeout', errorCode: 'timeout' });
  });

  it('a server without the tools is refused with the way to see why', async () => {
    wordpressState(api).unavailable.set(SERVER, 'docroot_unavailable');
    const result = await cli(['wordpress', 'dashboard', SERVER, ...EXT, '--json']);
    expect(result.code).toBe(6);
    expect(parseJson(result.stdout).error).toMatchObject({
      apiCode: 'docroot_unavailable',
      hint: expect.stringContaining(`bladecp wordpress status ${SERVER} --external-id`),
    });
  });
});

describe('bladecp wordpress update', () => {
  it('alone it is a group with help', async () => {
    const result = await cli(['wordpress', 'update']);
    expect(result.code).toBe(0);
    for (const word of ['core', 'plugin', 'theme']) expect(result.stdout).toContain(word);
    expect(api.apiCalls()).toHaveLength(0);
  });

  it('core asks first on a terminal, naming the site; no sends nothing', async () => {
    const result = await cli(['wordpress', 'update', 'core', SERVER, ...EXT], {
      tty: true,
      answers: ['n'],
    });
    expect(result.code).toBe(0);
    expect(result.prompts.at(-1)).toContain('Update WordPress?');
    expect(result.prompts.at(-1)).toContain('updates WordPress on example.com');
    expect(result.stdout).toContain('Nothing was changed.');
    expect(posts()).toHaveLength(0);
  });

  it('core: Enter is yes; without a terminal or with --yes it runs', async () => {
    const asked = await cli(['wordpress', 'update', 'core', SERVER, ...EXT], {
      tty: true,
      answers: [''],
    });
    expect(asked.code).toBe(0);
    expect(asked.stdout).toContain('BladeCP is updating WordPress.');
    expect(posts().at(-1)?.path).toBe(
      `/api/v1/customer/provisions/${SERVER}/wordpress/core/update`,
    );
    const script = await cli(['wordpress', 'update', 'core', SERVER, ...EXT, '--json']);
    expect(parseJson(script.stdout).data).toMatchObject({
      command: 'core-update',
      status: 'queued',
    });
    await cli(['wordpress', 'update', 'core', SERVER, ...EXT, '--yes'], { tty: true });
    expect(posts()).toHaveLength(3);
  });

  it('plugin and theme send the slug, and --wait says it was updated', async () => {
    const plugin = await cli(
      ['wordpress', 'update', 'plugin', SERVER, 'Akismet', ...EXT, '--wait', '--yes'],
      { tty: true },
    );
    expect(plugin.code).toBe(0);
    expect(posts().at(-1)?.path).toBe(
      `/api/v1/customer/provisions/${SERVER}/wordpress/plugins/akismet/update`,
    );
    expect(plugin.stdout).toContain('The plugin akismet was updated.');
    const theme = await cli(['wordpress', 'update', 'theme', SERVER, 'astra', ...EXT, '--wait']);
    expect(theme.code).toBe(0);
    expect(posts().at(-1)?.path).toBe(
      `/api/v1/customer/provisions/${SERVER}/wordpress/themes/astra/update`,
    );
    expect(theme.stdout).toContain('The theme astra was updated.');
  });

  it('a name that is not a slug is a usage error, before any request', async () => {
    for (const slug of ['my_plugin', '-akismet', 'a/b']) {
      const result = await cli(['wordpress', 'update', 'plugin', SERVER, slug, ...EXT, '--json']);
      expect(result.code, slug).toBe(2);
    }
    expect(api.apiCalls()).toHaveLength(0);
  });

  it('when the tools do not work there is no question: the refusal says why', async () => {
    wordpressState(api).unavailable.set(SERVER, 'toolkit_unavailable');
    const result = await cli(['wordpress', 'update', 'core', SERVER, ...EXT], {
      tty: true,
      answers: [],
    });
    expect(result.code).toBe(6);
    expect(result.prompts).toEqual([]);
    expect(result.stderr).toContain('bladecp wordpress status');
  });
});

describe('bladecp wordpress task', () => {
  it('shows a task that is still running and how to follow it', async () => {
    addTask(api, { id: TASK, uuid: SERVER, command: 'core-update', script: ['running'] });
    const result = await cli(['wordpress', 'task', SERVER, TASK, ...EXT]);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET').at(-1)).toMatchObject({
      path: `/api/v1/customer/provisions/${SERVER}/wordpress/commands/${TASK}`,
      search: `?external_service_id=${SERVICE_ID}`,
    });
    expect(result.stdout).toMatch(/Status\s+running/);
    expect(result.stdout).toContain(`bladecp wordpress task ${SERVER} ${TASK}`);
    const json = await cli(['wordpress', 'task', SERVER, TASK, ...EXT, '--json']);
    expect(parseJson(json.stdout).data).toMatchObject({ id: TASK, status: 'running' });
  });

  it('a failed task says why, and --wait ends with exit 1', async () => {
    addTask(api, { id: TASK, uuid: SERVER, command: 'plugin-update', script: ['failed'] });
    const read = await cli(['wordpress', 'task', SERVER, TASK, ...EXT]);
    expect(read.code).toBe(0);
    expect(read.stdout).toContain('WordPress could not finish it.');
    const waited = await cli(['wordpress', 'task', SERVER, TASK, ...EXT, '--wait']);
    expect(waited.code).toBe(1);
  });

  it('--wait follows a task to the end', async () => {
    addTask(api, {
      id: TASK,
      uuid: SERVER,
      command: 'dashboard-snapshot',
      script: ['queued', 'running', 'succeeded'],
    });
    const result = await cli(['wordpress', 'task', SERVER, TASK, ...EXT, '--wait']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET', /\/commands\//)).toHaveLength(3);
    expect(result.stdout).toContain('twentytwentyfour');
  });

  it('an ID that is not a task is a usage error; an unknown one is not found', async () => {
    const bad = await cli(['wordpress', 'task', SERVER, '01979c4e', ...EXT, '--json']);
    expect(bad.code).toBe(2);
    expect(api.apiCalls()).toHaveLength(0);
    const unknown = await cli(['wordpress', 'task', SERVER, TASK, ...EXT, '--json']);
    expect(unknown.code).toBe(5);
    expect(parseJson(unknown.stdout).error?.hint).toContain('task ID');
  });
});

describe('the wordpress commands', () => {
  it('never show the key', async () => {
    addTask(api, { id: TASK, uuid: SERVER, command: 'core-update', script: ['succeeded'] });
    for (const argv of [
      ['wordpress', 'status', SERVER, ...EXT],
      ['wordpress', 'dashboard', SERVER, ...EXT, '--wait'],
      ['wordpress', 'update', 'core', SERVER, ...EXT, '--json'],
      ['wordpress', 'task', SERVER, TASK, ...EXT],
      ['wordpress', 'status', SERVER, '--external-id', 'nope'],
    ]) {
      const result = await cli(argv);
      expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
    }
  });
});
