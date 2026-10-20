// `bladecp partner plans | locations | options | branding` against the
// simulated API: the request sent, the --json envelope, the screen basics,
// partner-only keys and usage errors.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAN_START, partnerCatalog } from './helpers/mock/partner.js';
import { LIVE_KEY, type MockApi, startMockApi } from './helpers/mock-api.js';
import { parseJson, type RunOptions, runCli, tempDir } from './helpers/run.js';

let api: MockApi;
let dir: ReturnType<typeof tempDir>;

beforeEach(async () => {
  api = await startMockApi();
  api.setPartner();
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

const last = () => api.requests.at(-1);

describe('bladecp partner plans', () => {
  it('lists the plans with their price and availability', async () => {
    const result = await cli(['partner', 'plans']);
    expect(result.code).toBe(0);
    expect(last()).toMatchObject({ method: 'GET', path: '/api/v1/customer/partner/plans' });
    expect(result.stdout).toContain('Start');
    expect(result.stdout).toContain('$9.00/month');
    expect(result.stdout).toMatch(/Dedicated Pro.*not ready/);
  });

  it('a ready plan delivered by hand says so', async () => {
    const dedicated = partnerCatalog(api).plans[2]!;
    dedicated.availability = {
      ...(dedicated.availability as object),
      readiness: 'ready',
      salesEligible: true,
    };
    const result = await cli(['partner', 'plans']);
    expect(result.stdout).toMatch(/Dedicated Pro.*manual delivery/);
  });

  it('--json returns the plans as the API sends them', async () => {
    const result = await cli(['partner', 'plans', '--json']);
    expect(parseJson(result.stdout)).toEqual({ ok: true, data: partnerCatalog(api).plans });
  });

  it('--currency keeps the prices of one currency, also in --json', async () => {
    const human = await cli(['partner', 'plans', '--currency', 'brl']);
    expect(human.stdout).toContain('R$49.00/month');
    expect(human.stdout).not.toContain('$9.00');
    const json = await cli(['partner', 'plans', '--currency', 'BRL', '--json']);
    const plans = parseJson(json.stdout).data as { currencies: { currency: string }[] }[];
    expect(plans.every((p) => p.currencies.every((c) => c.currency === 'BRL'))).toBe(true);
    expect(plans[0]!.currencies).toHaveLength(1);
  });

  it('a currency that is not a code is a usage error, before any request', async () => {
    const result = await cli(['partner', 'plans', '--currency', 'reais', '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'usage' });
    expect(api.requests).toHaveLength(0);
  });

  it('the plain layout has every column and a whole price', async () => {
    const result = await cli(['partner', 'plans']);
    expect(result.stdout.split('\n')[0]).toMatch(/^ID\s+PLAN\s+PRODUCT\s+PRICE\s+STATUS/);
    expect(result.stdout).toMatch(/30\s+Dedicated Pro\s+Dedicated\s+\$1,990\.00\/year/);
  });

  it('says when there are no plans', async () => {
    partnerCatalog(api).plans = [];
    const result = await cli(['partner', 'plans']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Your account has no plans yet.');
  });
});

describe('bladecp partner locations', () => {
  it('lists every location, or the ones of a plan', async () => {
    const all = await cli(['partner', 'locations']);
    expect(all.code).toBe(0);
    expect(last()).toMatchObject({ path: '/api/v1/customer/partner/locations', search: '' });
    expect(all.stdout).toContain('Sao Paulo, BR');
    expect(all.stdout).toContain('Frankfurt, DE');

    const one = await cli(['partner', 'locations', '--plan', '21', '--json']);
    expect(last()).toMatchObject({ search: '?plan_id=21' });
    const data = parseJson(one.stdout).data as { id: number }[];
    expect(data.map((l) => l.id)).toEqual([8]);
  });

  it('a plan that is not a number is a usage error', async () => {
    const result = await cli(['partner', 'locations', '--plan', 'start']);
    expect(result.code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });

  it('says when a plan has no locations', async () => {
    const result = await cli(['partner', 'locations', '--plan', '30']);
    expect(result.stdout).toContain('Plan 30 has no locations.');
  });
});

describe('bladecp partner options', () => {
  it('lists every option of the account with its values', async () => {
    const result = await cli(['partner', 'options']);
    expect(result.code).toBe(0);
    expect(last()).toMatchObject({ path: '/api/v1/customer/partner/option-groups', search: '' });
    expect(result.stdout).toMatch(/memory\s+4\s+4 GB/);
    expect(result.stdout).toMatch(/memory\s+2\s+2 GB\s+default/);
    expect(result.stdout).toMatch(/extra-ip\s+1-4\s+1 IP\s+\$3\.00\/month each/);
    expect(result.stdout).toMatch(/backups\s+daily\s+Daily/);
  });

  it('--plan takes the plan ID or its UUID, and --currency goes to the API', async () => {
    await cli(['partner', 'options', '--plan', '21', '--currency', 'BRL']);
    expect(last()).toMatchObject({
      path: '/api/v1/customer/partner/option-groups',
      search: '?plan=21&currency=BRL',
    });
    const byUuid = await cli(['partner', 'options', '--plan', PLAN_START, '--json']);
    expect(last()).toMatchObject({
      path: `/api/v1/customer/partner/plans/${PLAN_START}/option-groups`,
    });
    const groups = parseJson(byUuid.stdout).data as { slug: string; planIds?: unknown }[];
    expect(groups.map((g) => g.slug)).toEqual(['resources', 'backups']);
  });

  it('a plan that is neither an ID nor a UUID is a usage error', async () => {
    const result = await cli(['partner', 'options', '--plan', 'start', '--json']);
    expect(result.code).toBe(2);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'usage' });
    expect(api.requests).toHaveLength(0);
  });

  it('says when a plan has no options', async () => {
    const result = await cli(['partner', 'options', '--plan', '30']);
    expect(result.stdout).toContain('This plan has no configurable options.');
  });
});

describe('bladecp partner branding', () => {
  it('shows the brand, and the API data with --json', async () => {
    const human = await cli(['partner', 'branding']);
    expect(human.code).toBe(0);
    expect(last()).toMatchObject({ method: 'GET', path: '/api/v1/customer/branding/assets' });
    expect(human.stdout).toContain('Example Hosting');
    expect(human.stdout).toContain('https://cdn.example.com/brand/logo.svg');
    expect(human.stdout).toContain('not set');
    const json = await cli(['partner', 'branding', '--json']);
    expect(parseJson(json.stdout)).toEqual({ ok: true, data: partnerCatalog(api).branding });
  });
});

describe('partner only', () => {
  it('a customer key gets partner_only (exit 4) from every catalog command', async () => {
    api.setPartner(false);
    for (const argv of [
      ['partner', 'plans'],
      ['partner', 'locations'],
      ['partner', 'options'],
      ['partner', 'options', '--plan', PLAN_START],
      ['partner', 'branding'],
    ]) {
      const result = await cli([...argv, '--json']);
      expect(result.code, argv.join(' ')).toBe(4);
      expect(parseJson(result.stdout).error, argv.join(' ')).toMatchObject({
        code: 'partner_only',
      });
      const human = await cli(argv);
      expect(human.code).toBe(4);
      expect(human.stderr).toContain('for BladeCP partners');
    }
  });

  it('the key never reaches the output', async () => {
    const outputs: string[] = [];
    for (const argv of [
      ['partner', 'plans'],
      ['partner', 'plans', '--json'],
      ['partner', 'locations', '--debug'],
      ['partner', 'options', '--json'],
      ['partner', 'branding'],
    ]) {
      const result = await cli(argv);
      outputs.push(result.stdout, result.stderr);
    }
    api.setPartner(false);
    const denied = await cli(['partner', 'plans']);
    outputs.push(denied.stdout, denied.stderr);
    expect(outputs.join('\n')).not.toContain(LIVE_KEY);
  });
});

describe('help', () => {
  it('"bladecp partner --help" lists the catalog commands', async () => {
    const result = await cli(['partner', '--help']);
    expect(result.code).toBe(0);
    for (const word of ['plans', 'locations', 'options', 'branding']) {
      expect(result.stdout).toContain(word);
    }
  });
});
