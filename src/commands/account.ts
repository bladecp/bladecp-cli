import { assertApiKeyFormat, resolveAuth, storedFor } from '../auth/credentials.js';
import { startLoopbackServer } from '../auth/loopback.js';
import { createPkce, randomState } from '../auth/pkce.js';
import {
  type ConfigFile,
  clearCredentials,
  configFilePath,
  readConfig,
  writeConfig,
} from '../config.js';
import { type Ctx, createApi } from '../context.js';
import { ExitCode } from '../errors.js';
import { formatDate } from '../format.js';
import { safeText } from '../sanitize.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginFlags {
  token?: string | undefined;
  noBrowser?: boolean | undefined;
}

async function readAllStdin(ctx: Ctx): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of ctx.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function buildConnectUrl(
  hubUrl: string,
  params: { redirectUri: string; state: string; challenge: string },
): string {
  const query = new URLSearchParams({
    client: 'cli',
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    intent: 'account',
  });
  return `${hubUrl}/connect?${query.toString()}`;
}

interface LoginResult {
  apiUrl: string;
  source: 'browser' | 'token' | 'env';
  customer: { uuid: string | null; email: string | null; name: string | null };
  keyUuid: string | null;
  scopes: string[];
  expiresAt: string | null;
}

function printLogin(ctx: Ctx, result: LoginResult, saved: boolean): void {
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: result });
    return;
  }
  const t = ctx.out.t;
  ctx.out.print(
    ctx.out.style('green', t('login.success', { email: result.customer.email ?? '-' })),
  );
  if (result.expiresAt)
    ctx.out.print(t('login.expires', { date: formatDate(result.expiresAt, ctx.lang) }));
  if (saved)
    ctx.out.print(
      ctx.out.style('dim', t('login.savedTo', { path: configFilePath(ctx.configDir) })),
    );
}

export async function loginCommand(ctx: Ctx, flags: LoginFlags): Promise<number> {
  // 1. Explicit key.
  if (flags.token !== undefined) {
    const raw = flags.token === '-' ? await readAllStdin(ctx) : flags.token;
    const apiKey = raw.trim();
    ctx.out.addSecret(apiKey);
    assertApiKeyFormat(apiKey, 'token');
    const me = await createApi(ctx, apiKey).me();
    const result: LoginResult = {
      apiUrl: ctx.apiUrl,
      source: 'token',
      customer: { uuid: me.customer_uuid, email: me.customer_email, name: null },
      keyUuid: me.api_key_uuid,
      scopes: me.scopes,
      expiresAt: null,
    };
    await writeConfig(ctx.configDir, {
      version: 1,
      credentials: {
        apiUrl: ctx.apiUrl,
        apiKey,
        keyUuid: me.api_key_uuid,
        scopes: me.scopes,
        expiresAt: null,
        customer: { uuid: me.customer_uuid, email: me.customer_email, name: null },
        source: 'token',
        savedAt: new Date(ctx.now()).toISOString(),
      },
    });
    printLogin(ctx, result, true);
    return ExitCode.OK;
  }

  // 2. Key from the environment: nothing to save.
  const envKey = ctx.env.BLADECP_API_KEY?.trim();
  if (envKey) {
    const auth = await resolveAuth(ctx);
    const me = await createApi(ctx, auth.apiKey).me();
    if (ctx.json) {
      ctx.out.emitJson({
        ok: true,
        data: {
          apiUrl: ctx.apiUrl,
          source: 'env',
          customer: { uuid: me.customer_uuid, email: me.customer_email, name: null },
          keyUuid: me.api_key_uuid,
          scopes: me.scopes,
          expiresAt: null,
        } satisfies LoginResult,
      });
    } else {
      ctx.out.say('login.envInUse', { email: me.customer_email });
    }
    return ExitCode.OK;
  }

  // 3. Browser connect flow (PKCE S256 + state, loopback redirect).
  const t = ctx.out.t;
  const pkce = createPkce();
  const state = randomState();
  const server = await startLoopbackServer({ expectedState: state, t, lang: ctx.lang });
  try {
    const url = buildConnectUrl(ctx.hubUrl, {
      redirectUri: server.redirectUri,
      state,
      challenge: pkce.challenge,
    });
    let opened = false;
    if (!flags.noBrowser) opened = await ctx.openUrl(url);
    ctx.out.notice(opened ? t('login.browserOpened') : t('login.openThisUrl'));
    ctx.out.notice(`  ${url}`);
    ctx.out.notice(t('login.waiting'));
    if (flags.noBrowser) ctx.out.notice(t('login.remoteHint'));

    const code = await server.waitForCode(ctx.loginTimeoutMs ?? LOGIN_TIMEOUT_MS, ctx.signal);
    const api = createApi(ctx, undefined);
    const token = await api.exchangeConnectCode({
      client: 'cli',
      code,
      codeVerifier: pkce.verifier,
      redirectUri: server.redirectUri,
    });
    ctx.out.addSecret(token.apiKey);
    assertApiKeyFormat(token.apiKey, 'response');
    const customer = {
      uuid: token.customer?.uuid ?? null,
      email: token.customer?.email ?? null,
      name: token.customer?.name ?? null,
    };
    await writeConfig(ctx.configDir, {
      version: 1,
      credentials: {
        apiUrl: ctx.apiUrl,
        apiKey: token.apiKey,
        keyUuid: token.keyUuid ?? null,
        scopes: token.scopes ?? [],
        expiresAt: token.expiresAt ?? null,
        customer,
        source: 'browser',
        savedAt: new Date(ctx.now()).toISOString(),
      },
    });
    printLogin(
      ctx,
      {
        apiUrl: ctx.apiUrl,
        source: 'browser',
        customer,
        keyUuid: token.keyUuid ?? null,
        scopes: token.scopes ?? [],
        expiresAt: token.expiresAt ?? null,
      },
      true,
    );
    return ExitCode.OK;
  } finally {
    await server.close();
  }
}

export async function logoutCommand(ctx: Ctx): Promise<number> {
  const config: ConfigFile = await readConfig(ctx.configDir).catch(
    (): ConfigFile => ({ version: 1 }),
  );
  const keyUuid = config.credentials?.keyUuid ?? null;
  const removed = await clearCredentials(ctx.configDir);
  const envKeyActive = Boolean(ctx.env.BLADECP_API_KEY?.trim());
  if (ctx.json) {
    ctx.out.emitJson({
      ok: true,
      data: { removed, keyUuid, envKeyActive, apiKeysUrl: ctx.keysUrl },
    });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  ctx.out.print(removed ? t('logout.done') : t('logout.nothing'));
  if (removed) ctx.out.print(t('logout.revokeHint', { url: ctx.keysUrl }));
  if (envKeyActive) ctx.out.warn(t('logout.envStillSet'));
  return ExitCode.OK;
}

export async function whoamiCommand(ctx: Ctx): Promise<number> {
  const auth = await resolveAuth(ctx);
  const me = await createApi(ctx, auth.apiKey).me();
  const stored =
    auth.source === 'config' ? storedFor(await readConfig(ctx.configDir), ctx.apiUrl) : undefined;
  const expiresAt = stored?.expiresAt ?? null;
  const data = {
    apiUrl: ctx.apiUrl,
    source: auth.source,
    customer: { uuid: me.customer_uuid, email: me.customer_email },
    keyUuid: me.api_key_uuid,
    scopes: me.scopes,
    tier: me.tier,
    rateLimit: {
      tier: me.rate_limit?.tier ?? me.tier,
      limitPerMinute: me.rate_limit?.limit_per_minute ?? null,
    },
    expiresAt,
  };
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  ctx.out.print(t('whoami.signedInAs', { email: me.customer_email }));
  const rows: [string, string][] = [
    [t('label.customer'), me.customer_uuid],
    [
      t('label.key'),
      `${me.api_key_uuid} (${auth.source === 'env' ? t('whoami.sourceEnv') : t('whoami.sourceConfig')})`,
    ],
    [t('label.scopes'), me.scopes.join(', ') || '-'],
    [t('label.rateLimit'), t('whoami.perMinute', { count: data.rateLimit.limitPerMinute ?? '-' })],
    [t('label.expires'), expiresAt ? formatDate(expiresAt, ctx.lang) : '-'],
    [t('label.api'), ctx.apiUrl],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows)
    ctx.out.print(`  ${ctx.out.style('dim', label.padEnd(width))}  ${safeText(value)}`);
  return ExitCode.OK;
}
