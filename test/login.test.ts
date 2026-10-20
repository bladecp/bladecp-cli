import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { looksLikeJsonLiteral, randomState } from '../src/auth/pkce.js';
import { ISSUED_KEY, LIVE_KEY, type MockApi, s256, startMockApi } from './helpers/mock-api.js';
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

/** Simulates the person approving in the browser: follow the Hub redirect. */
const browserApproves = async (url: string) => {
  const res = await fetch(url);
  await res.text();
  return true;
};

function savedConfig() {
  return JSON.parse(readFileSync(join(dir.path, 'config.json'), 'utf8'));
}

describe('login with the browser', () => {
  it('opens the Hub with PKCE S256 and state, then saves the issued key', async () => {
    const result = await runCli(['login'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
    });
    expect(result.code).toBe(0);
    expect(result.opened).toHaveLength(1);

    const connect = new URL(result.opened[0]!);
    expect(connect.pathname).toBe('/connect');
    expect(connect.searchParams.get('client')).toBe('cli');
    expect(connect.searchParams.get('intent')).toBe('account');
    expect(connect.searchParams.get('code_challenge_method')).toBe('S256');
    // state: 32 random bytes in base64url, never a value a JSON query parser
    // would turn into a number (the Hub parses query values as JSON).
    const state = connect.searchParams.get('state')!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(looksLikeJsonLiteral(state)).toBe(false);
    expect(Number.isNaN(Number(state))).toBe(true);
    expect(connect.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const redirect = new URL(connect.searchParams.get('redirect_uri')!);
    expect(redirect.hostname).toBe('127.0.0.1');
    expect(redirect.pathname).toBe('/callback');
    expect(Number(redirect.port)).toBeGreaterThan(0);

    // The token request proves possession of the verifier behind the challenge.
    const [exchange] = api.apiCalls('POST', /connect\/token$/);
    const body = exchange!.body as { codeVerifier: string; redirectUri: string; client: string };
    expect(body.client).toBe('cli');
    expect(s256(body.codeVerifier)).toBe(connect.searchParams.get('code_challenge'));
    expect(body.redirectUri).toBe(redirect.toString());
    expect(exchange!.headers.authorization).toBeUndefined();

    const config = savedConfig();
    expect(config.credentials.apiKey).toBe(ISSUED_KEY);
    expect(config.credentials.apiUrl).toBe(api.baseUrl);
    expect(config.credentials.expiresAt).toBe('2026-11-14T12:00:00.000Z');
    if (process.platform !== 'win32') {
      expect(statSync(join(dir.path, 'config.json')).mode & 0o777).toBe(0o600);
    }
    expect(result.stdout).toContain('Signed in as owner@example.com.');
    expect(result.stdout + result.stderr).not.toContain(ISSUED_KEY);
  });

  it('prints the address with --no-browser and completes when it is visited', async () => {
    let visited = false;
    const result = await runCli(['login', '--no-browser'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      onStderr: (text) => {
        const match = /(http:\/\/127\.0\.0\.1:\d+\/connect\?\S+)/.exec(text);
        if (match && !visited) {
          visited = true;
          void browserApproves(match[1]!);
        }
      },
    });
    expect(result.code).toBe(0);
    expect(result.opened).toHaveLength(0);
    expect(result.stderr).toContain('Open this address in your browser');
    expect(savedConfig().credentials.apiKey).toBe(ISSUED_KEY);
  });

  it('ignores a callback whose state does not match, saves nothing, and says why at the timeout', async () => {
    api.hubOverride = () => 'code=stolen&state=not-the-right-state';
    const result = await runCli(['login', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
      loginTimeoutMs: 300,
    });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error?.code).toBe('state_mismatch');
    expect(api.apiCalls('POST', /connect\/token$/)).toHaveLength(0);
    expect(() => savedConfig()).toThrow();
  });

  it('a forged callback from another program does not cancel the sign-in', async () => {
    // Another local program hits the callback first with a wrong state; the
    // real browser answer that follows still completes the sign-in.
    const result = await runCli(['login'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: async (url) => {
        const redirect = new URL(new URL(url).searchParams.get('redirect_uri')!);
        const forged = await fetch(`${redirect.origin}/callback?state=forged&error=access_denied`);
        expect(forged.status).toBe(400);
        await forged.text();
        return browserApproves(url);
      },
    });
    expect(result.code).toBe(0);
    expect(savedConfig().credentials.apiKey).toBe(ISSUED_KEY);
  });

  it('reports a refusal in the browser', async () => {
    api.hubOverride = (params) =>
      `error=access_denied&state=${encodeURIComponent(params.get('state') ?? '')}`;
    const result = await runCli(['login'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
    });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('Sign-in was cancelled in the browser');
  });

  it('times out when nobody authorizes', async () => {
    const result = await runCli(['login', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: async () => true,
      loginTimeoutMs: 150,
    });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error?.code).toBe('login_timeout');
  });

  it('fails cleanly when the code exchange is refused (invalid_grant)', async () => {
    // A challenge that does not match the verifier the CLI will send.
    api.hubOverride = (params) => {
      api.connectCodes.set('bad', {
        challenge: 'x',
        redirectUri: params.get('redirect_uri') ?? '',
        used: false,
      });
      return `code=bad&state=${encodeURIComponent(params.get('state') ?? '')}`;
    };
    const result = await runCli(['login', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
    });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error).toMatchObject({ code: 'invalid_grant', status: 400 });
  });
});

describe('token exchange errors', () => {
  it('409 api_key_cap_reached tells where to revoke a key and saves nothing', async () => {
    api.keyCapReached = true;
    const result = await runCli(['login', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
    });
    expect(result.code).toBe(3);
    const error = parseJson(result.stdout).error!;
    expect(error).toMatchObject({ code: 'api_key_cap_reached', status: 409 });
    expect(error.message).toContain(`${api.baseUrl}/account/api-keys`);
    expect(() => savedConfig()).toThrow();
  });

  it('a callback with an empty code is refused before reaching the API', async () => {
    api.hubOverride = (params) => `code=&state=${encodeURIComponent(params.get('state') ?? '')}`;
    const result = await runCli(['login', '--json'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      openUrl: browserApproves,
    });
    expect(result.code).toBe(3);
    expect(parseJson(result.stdout).error?.code).toBe('invalid_callback');
    expect(api.apiCalls('POST', /connect\/token$/)).toHaveLength(0);
  });
});

describe('login with a key', () => {
  it('validates and saves --token', async () => {
    const result = await runCli(['login', '--token', LIVE_KEY], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
    });
    expect(result.code).toBe(0);
    expect(savedConfig().credentials).toMatchObject({ apiKey: LIVE_KEY, source: 'token' });
    expect(api.apiCalls('GET', /customer\/me$/)[0]!.headers.authorization).toBe(
      `Bearer ${LIVE_KEY}`,
    );
  });

  it('reads the key from stdin with --token -', async () => {
    const result = await runCli(['login', '--token', '-'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      stdin: `${LIVE_KEY}\n`,
    });
    expect(result.code).toBe(0);
    expect(savedConfig().credentials.apiKey).toBe(LIVE_KEY);
  });

  it('a pasted key with the terminal paste markers is accepted', async () => {
    const result = await runCli(['login', '--token', `\u001b[200~${LIVE_KEY}\u001b[201~`], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
    });
    expect(result.code).toBe(0);
    expect(savedConfig().credentials.apiKey).toBe(LIVE_KEY);
  });

  it('a partner key gets the partner tools as next steps, every scope in words', async () => {
    api.setPartner();
    api.me = {
      ...api.me,
      scopes: [...api.me.scopes, 'provisions:write', 'webhooks:write', 'vibe:sso'],
    };
    const result = await runCli(['login', '--token', LIVE_KEY], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      tty: true,
      columns: 100,
    });
    expect(result.code).toBe(0);
    const screen = result.stdout + result.stderr;
    expect(screen).toContain('bladecp partner servers');
    expect(screen).not.toMatch(/partner:read|provisions:write|webhooks:write|vibe:sso/);
  });

  it('refuses a value that is not a BladeCP key without calling the API', async () => {
    const result = await runCli(['login', '--token', 'not-a-key'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
    });
    expect(result.code).toBe(2);
    expect(api.requests).toHaveLength(0);
  });

  it('does not save a key the API rejects', async () => {
    const result = await runCli(['login', '--token', 'bcp_live_REVOKED000000000000'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
    });
    expect(result.code).toBe(3);
    expect(() => savedConfig()).toThrow();
  });

  it('uses BLADECP_API_KEY without saving it', async () => {
    const result = await runCli(['login'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      env: { BLADECP_API_KEY: LIVE_KEY },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Using the key from BLADECP_API_KEY');
    expect(() => savedConfig()).toThrow();
    expect(result.opened).toHaveLength(0);
  });
});

describe('connect parameters', () => {
  it('state is always base64url and never a JSON literal', () => {
    for (let i = 0; i < 500; i += 1) {
      const state = randomState();
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(looksLikeJsonLiteral(state)).toBe(false);
    }
    expect(looksLikeJsonLiteral('12345')).toBe(true);
    expect(looksLikeJsonLiteral('-1e5')).toBe(true);
    expect(looksLikeJsonLiteral('null')).toBe(true);
    expect(looksLikeJsonLiteral('a1b2')).toBe(false);
  });
});
