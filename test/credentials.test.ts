import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveConfigDir } from '../src/config.js';
import {
  apiKeysPageUrl,
  nameserversFor,
  normalizeApiUrl,
  resolveHubUrl,
} from '../src/endpoints.js';
import { LIVE_KEY, type MockApi, OTHER_KEY, startMockApi } from './helpers/mock-api.js';
import { parseJson, runCli, tempDir } from './helpers/run.js';

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

function saveKey(apiUrl: string, apiKey: string) {
  mkdirSync(dir.path, { recursive: true });
  writeFileSync(
    join(dir.path, 'config.json'),
    JSON.stringify({
      version: 1,
      credentials: { apiUrl, apiKey, source: 'token', savedAt: '2026-10-01T00:00:00Z' },
    }),
  );
}

describe('key precedence', () => {
  it('prefers BLADECP_API_KEY over the saved key', async () => {
    saveKey(api.baseUrl, LIVE_KEY);
    const result = await runCli(['whoami'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      env: { BLADECP_API_KEY: OTHER_KEY },
    });
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET')[0]!.headers.authorization).toBe(`Bearer ${OTHER_KEY}`);
    expect(result.stdout).toContain('from BLADECP_API_KEY');
  });

  it('uses the saved key when no environment key is set', async () => {
    saveKey(api.baseUrl, LIVE_KEY);
    const result = await runCli(['whoami'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(0);
    expect(api.apiCalls('GET')[0]!.headers.authorization).toBe(`Bearer ${LIVE_KEY}`);
    expect(result.stdout).toContain('saved by bladecp login');
  });

  it('never sends a saved key to a different API address', async () => {
    saveKey('https://api.example.net', LIVE_KEY);
    const result = await runCli(['whoami', '--json'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error?.code).toBe('not_signed_in');
    expect(api.requests).toHaveLength(0);
  });

  it('asks to sign in when nothing is configured', async () => {
    const result = await runCli(['servers', 'list'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('You are not signed in.');
    expect(result.stderr).toContain('bladecp login');
  });

  it('rejects a malformed BLADECP_API_KEY before any request', async () => {
    const result = await runCli(['whoami'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      env: { BLADECP_API_KEY: 'oops' },
    });
    expect(result.code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });

  it('--api-url wins over BLADECP_API_URL', async () => {
    const result = await runCli(['whoami', '--api-url', api.baseUrl], {
      configDir: dir.path,
      env: { BLADECP_API_URL: 'https://api.example.invalid', BLADECP_API_KEY: LIVE_KEY },
    });
    expect(result.code).toBe(0);
    expect(api.requests).toHaveLength(1);
  });

  it('refuses plain HTTP outside this computer', () => {
    expect(() => normalizeApiUrl('http://api.example.com')).toThrow();
    expect(normalizeApiUrl('http://localhost:8787/api/v1/')).toBe('http://localhost:8787');
    expect(normalizeApiUrl('https://api.bladecp.com/')).toBe('https://api.bladecp.com');
  });

  it('pairs the Hub with the API address', () => {
    expect(resolveHubUrl('https://api.bladecp.com', {})).toBe('https://hub.bladecp.com');
    expect(apiKeysPageUrl(resolveHubUrl('https://api.bladecp.com', {}))).toBe(
      'https://hub.bladecp.com/account/api-keys',
    );
    expect(resolveHubUrl('http://127.0.0.1:9', { BLADECP_HUB_URL: 'http://127.0.0.1:10' })).toBe(
      'http://127.0.0.1:10',
    );
    expect(resolveHubUrl('https://gateway.example.com', {})).toBe('https://hub.bladecp.com');
  });

  it('knows the nameservers only for the official API', () => {
    expect(nameserversFor('https://api.bladecp.com')).toEqual([
      'kant.ns.bladecp.com',
      'hegel.ns.bladecp.com',
    ]);
    expect(nameserversFor('https://gateway.example.com')).toEqual([]);
    expect(nameserversFor('http://127.0.0.1:8787')).toEqual([]);
  });
});

describe('config location', () => {
  it('follows the platform conventions', () => {
    expect(resolveConfigDir({}, 'darwin', '/Users/a')).toBe('/Users/a/.config/bladecp');
    expect(resolveConfigDir({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/a')).toBe('/x/bladecp');
    expect(
      resolveConfigDir({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', 'C:\\Users\\a'),
    ).toContain('bladecp');
    expect(resolveConfigDir({ BLADECP_CONFIG_DIR: '/custom' }, 'linux', '/home/a')).toBe('/custom');
  });

  it.skipIf(process.platform === 'win32')(
    'writes the credentials file with mode 0600',
    async () => {
      const result = await runCli(['login', '--token', LIVE_KEY], {
        configDir: join(dir.path, 'nested'),
        apiUrl: api.baseUrl,
      });
      expect(result.code).toBe(0);
      expect(statSync(join(dir.path, 'nested', 'config.json')).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir.path, 'nested')).mode & 0o777).toBe(0o700);
    },
  );
});

describe('logout', () => {
  it('removes the saved key and points to the Hub to revoke it', async () => {
    saveKey(api.baseUrl, LIVE_KEY);
    const result = await runCli(['logout'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(0);
    expect(existsSync(join(dir.path, 'config.json'))).toBe(false);
    expect(result.stdout).toContain('revoke the key itself');
    expect(result.stdout).toContain(`${api.baseUrl}/account/api-keys`);
    expect(api.requests).toHaveLength(0);
  });

  it('says when there was nothing to remove and warns about the environment key', async () => {
    const result = await runCli(['logout', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      env: { BLADECP_API_KEY: LIVE_KEY },
    });
    expect(result.code).toBe(0);
    expect(parseJson(result.stdout).data).toMatchObject({ removed: false, envKeyActive: true });
  });

  it('removes a damaged config file', async () => {
    writeFileSync(join(dir.path, 'config.json'), '{not json');
    const result = await runCli(['logout'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(0);
    expect(existsSync(join(dir.path, 'config.json'))).toBe(false);
  });

  it('a damaged config file gives a clear error', async () => {
    writeFileSync(join(dir.path, 'config.json'), '{not json');
    const result = await runCli(['whoami'], { configDir: dir.path, apiUrl: api.baseUrl });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('is damaged');
    expect(readFileSync(join(dir.path, 'config.json'), 'utf8')).toBe('{not json');
  });
});

describe('a pasted key', () => {
  it('loses the bracketed-paste markers, the spaces and matching quotes', async () => {
    const { cleanApiKey } = await import('../src/auth/credentials.js');
    const key = 'bcp_live_TESTKEY0123456789ABCDEFGHIJKLMNOP';
    expect(cleanApiKey(`\u001b[200~${key}\u001b[201~`)).toBe(key);
    expect(cleanApiKey(`  ${key}\n`)).toBe(key);
    expect(cleanApiKey(`"${key}"`)).toBe(key);
    expect(cleanApiKey(`'${key}'`)).toBe(key);
  });
});
