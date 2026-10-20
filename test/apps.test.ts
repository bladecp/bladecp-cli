import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedApps } from './helpers/mock/apps.js';
import { seedDomains } from './helpers/mock/domains.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

/** The first server of the simulated account (example.com, active). */
const SERVER = '01970000-0000-7000-8000-00000000s001';
/** A server still being prepared (shop.example.org, pending). */
const PENDING = '01970000-0000-7000-8000-00000000s002';

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

const installs = () => api.apiCalls('POST', /\/apps\/install$/);

const ALL = [
  '--option',
  'admin_user=maria',
  '--option',
  'site_title=Maria blog',
  '--option',
  'admin_email=maria@example.com',
  '--option',
  'locale=pt_BR',
];

describe('bladecp apps list', () => {
  it('lists the apps with the version BladeCP installs', async () => {
    const result = await cli(['apps', 'list']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET').at(-1)?.path).toBe('/api/v1/customer/apps/catalog');
    expect(result.stdout).toMatch(/^APP\s+NAME\s+CATEGORY\s+VERSION$/m);
    expect(result.stdout).toMatch(/wordpress\s+WordPress\s+content management\s+6\.5\.2/);
    expect(result.stdout).toMatch(/joomla\s+Joomla\s+content management\s+coming soon/);
  });

  it('"bladecp apps" alone is the list, and --json is the data of the API', async () => {
    const alone = await cli(['apps']);
    const list = await cli(['apps', 'list']);
    expect(alone.stdout).toBe(list.stdout);
    const json = await cli(['apps', '--json']);
    const data = parseJson(json.stdout).data as { slug: string; availableInWorker: boolean }[];
    expect(data.map((app) => app.slug)).toEqual(['wordpress', 'joomla']);
    expect(data[1]).toMatchObject({ availableInWorker: false });
  });

  it('an empty catalog says so', async () => {
    seedApps(api, []);
    const result = await cli(['apps', 'list'], { tty: true });
    expect(result.stdout).toContain('No apps can be installed yet.');
  });
});

describe('bladecp apps show', () => {
  it('shows what the app needs and the settings it asks for', async () => {
    const result = await cli(['apps', 'show', 'WordPress']);
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET').at(-1)?.path).toBe('/api/v1/customer/apps/wordpress');
    expect(result.stdout).toContain('6.5.2 (recommended), 6.4.3');
    expect(result.stdout).toContain('PHP 8.1 or newer · MySQL 5.7 or newer');
    expect(result.stdout).toContain('/wp-login.php');
    expect(result.stdout).toMatch(/admin_user\s+Administrator username · 3 to 60 characters/);
    expect(result.stdout).toContain('not admin, administrator, root, wpadmin');
    expect(result.stdout).toContain('your account email when left out');
    expect(result.stdout).toContain('the CLI language when left out (en_US)');
  });

  it('--json is the install spec of the API', async () => {
    const result = await cli(['apps', 'show', 'wordpress', '--json']);
    expect(parseJson(result.stdout).data).toMatchObject({
      slug: 'wordpress',
      requiredInputs: ['admin_email', 'site_title', 'locale', 'admin_user'],
    });
  });

  it('an unknown app is not found and points to the list', async () => {
    const result = await cli(['apps', 'show', 'drupal', '--json']);
    expect(result.code).toBe(5);
    expect(parseJson(result.stdout).error?.hint).toContain('bladecp apps list');
  });

  it('a name that cannot be an app is a usage error, before any request', async () => {
    const result = await cli(['apps', 'show', '../etc', '--json']);
    expect(result.code).toBe(2);
    expect(api.apiCalls()).toHaveLength(0);
  });
});

describe('bladecp apps install', () => {
  it('in a script: every setting given, sent once with an idempotency key', async () => {
    const result = await cli(['apps', 'install', SERVER, 'wordpress', ...ALL, '--json']);
    expect(result.code).toBe(0);
    const post = installs().at(-1)!;
    expect(post).toMatchObject({
      path: `/api/v1/customer/provisions/${SERVER}/apps/install`,
      body: {
        slug: 'wordpress',
        version: '6.5.2',
        host: 'example.com',
        inputs: {
          admin_user: 'maria',
          site_title: 'Maria blog',
          admin_email: 'maria@example.com',
          locale: 'pt_BR',
        },
      },
    });
    expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(parseJson(result.stdout).data).toMatchObject({
      provisionUuid: SERVER,
      host: 'example.com',
      slug: 'wordpress',
      status: 'pending',
    });
  });

  it('the language follows the CLI and the administrator email is the account email', async () => {
    const result = await cli([
      'apps',
      'install',
      SERVER,
      'wordpress',
      '--option',
      'admin_user=maria',
      '--option',
      'site_title=Blog',
      '--lang',
      'es',
    ]);
    expect(result.code).toBe(0);
    expect(installs().at(-1)?.body).toMatchObject({
      inputs: { locale: 'es_ES', admin_email: api.me.customer_email },
    });
    expect(result.stdout).toContain('https://example.com/wp-login.php');
  });

  it('--domain picks another domain of the server, --app-version another version', async () => {
    seedDomains(api, SERVER, ['blog.example.com']);
    const result = await cli([
      'apps',
      'install',
      SERVER,
      'wordpress',
      ...ALL,
      '--domain',
      'Blog.Example.com',
      '--app-version',
      '6.4.3',
    ]);
    expect(result.code).toBe(0);
    expect(installs().at(-1)?.body).toMatchObject({ host: 'blog.example.com', version: '6.4.3' });
    expect(result.stdout).toContain('WordPress 6.4.3 is being installed on blog.example.com.');
  });

  it('without a terminal, missing settings are a usage error that names them', async () => {
    const result = await cli([
      'apps',
      'install',
      SERVER,
      'wordpress',
      '--option',
      'admin_email=maria@example.com',
      '--json',
    ]);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error).toMatchObject({
      code: 'usage',
      message: 'WordPress needs these settings: site_title, admin_user.',
      hint: expect.stringContaining('bladecp apps show wordpress'),
    });
    expect(installs()).toHaveLength(0);
  });

  it('values that do not fit are usage errors, nothing installed', async () => {
    const cases: [string[], RegExp][] = [
      [['--option', 'admin_user=Admin'], /among the first names attackers try/],
      [['--option', 'admin_email=maria'], /valid email/],
      [['--option', 'locale=xx_XX'], /Choose one of en_US/],
      [['--option', 'admin_user=ab'], /3 to 60 characters/],
      [['--app-version', '1.0'], /no version 1\.0\. Choose one of 6\.5\.2, 6\.4\.3/],
      [['--domain', 'other.example.com'], /not a domain of this server/],
    ];
    for (const [extra, message] of cases) {
      const result = await cli([
        'apps',
        'install',
        SERVER,
        'wordpress',
        ...ALL,
        ...extra,
        '--json',
      ]);
      expect(result.code, extra.join(' ')).toBe(2);
      expect(parseJson(result.stdout).error?.message, extra.join(' ')).toMatch(message);
    }
    expect(installs()).toHaveLength(0);
  });

  it('a malformed --option or app name fails before any request', async () => {
    for (const argv of [
      ['apps', 'install', SERVER, 'wordpress', '--option', 'admin_user'],
      ['apps', 'install', SERVER, 'wordpress', '--option', '=maria'],
      ['apps', 'install', SERVER, 'word press'],
      ['apps', 'install', SERVER, 'wordpress', '--domain', 'localhost'],
    ]) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(2);
    }
    expect(api.apiCalls()).toHaveLength(0);
  });

  it('on a terminal it asks the missing settings, then confirms (Enter is yes)', async () => {
    const result = await cli(['apps', 'install', SERVER, 'wordpress'], {
      tty: true,
      answers: ['Maria blog', 'admin', 'maria', ''],
    });
    expect(result.code).toBe(0);
    expect(result.prompts.slice(0, 3)).toEqual([
      expect.stringContaining('Site title: '),
      expect.stringContaining('Administrator username: '),
      expect.stringContaining('Administrator username: '),
    ]);
    expect(result.stderr).toContain('among the first names attackers try');
    expect(result.prompts.at(-1)).toContain('Install WordPress 6.5.2?');
    expect(result.prompts.at(-1)).toContain('Domain: example.com');
    expect(result.prompts.at(-1)).toContain('Administrator email: owner@example.com');
    expect(installs().at(-1)?.body).toMatchObject({
      inputs: { site_title: 'Maria blog', admin_user: 'maria', locale: 'en_US' },
    });
  });

  it('on a terminal a server with several domains offers them', async () => {
    seedDomains(api, SERVER, ['blog.example.com']);
    const result = await cli(['apps', 'install', SERVER, 'wordpress', ...ALL], {
      tty: true,
      answers: ['2', ''],
    });
    expect(result.code).toBe(0);
    expect(result.prompts[0]).toContain('Domain for WordPress?');
    expect(installs().at(-1)?.body).toMatchObject({ host: 'blog.example.com' });
  });

  it('no on the confirmation sends nothing; --yes skips it', async () => {
    const declined = await cli(['apps', 'install', SERVER, 'wordpress', ...ALL], {
      tty: true,
      answers: ['n'],
    });
    expect(declined.code).toBe(0);
    expect(declined.stdout).toContain('Nothing was installed.');
    expect(installs()).toHaveLength(0);
    const yes = await cli(['apps', 'install', SERVER, 'wordpress', ...ALL, '--yes'], { tty: true });
    expect(yes.code).toBe(0);
    expect(yes.prompts).toEqual([]);
    expect(installs()).toHaveLength(1);
  });

  it('refusals of the API say what to do', async () => {
    await cli(['apps', 'install', SERVER, 'wordpress', ...ALL]);
    const busy = await cli(['apps', 'install', SERVER, 'wordpress', ...ALL, '--json']);
    expect(busy.code).toBe(6);
    expect(parseJson(busy.stdout).error).toMatchObject({
      apiCode: 'host_has_active_install',
      hint: expect.stringContaining('Another app is already on example.com'),
    });
    const pending = await cli(['apps', 'install', PENDING, 'wordpress', ...ALL, '--json']);
    expect(pending.code).toBe(6);
    expect(parseJson(pending.stdout).error?.hint).toContain(`bladecp servers show ${PENDING}`);
    const unknown = await cli(['apps', 'install', SERVER, 'drupal', ...ALL, '--json']);
    expect(unknown.code).toBe(5);
    expect(parseJson(unknown.stdout).error?.hint).toContain('bladecp apps list');
  });

  it('never shows the key', async () => {
    for (const argv of [
      ['apps'],
      ['apps', 'show', 'wordpress'],
      ['apps', 'install', SERVER, 'wordpress', ...ALL],
      ['apps', 'install', SERVER, 'wordpress', ...ALL, '--json'],
    ]) {
      const result = await cli(argv);
      expect(result.stdout + result.stderr).not.toContain(LIVE_KEY);
    }
  });
});
