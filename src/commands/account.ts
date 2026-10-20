import { assertApiKeyFormat, cleanApiKey, resolveAuth, storedFor } from '../auth/credentials.js';
import { startLoopbackServer } from '../auth/loopback.js';
import { createPkce, randomState } from '../auth/pkce.js';
import {
  type ConfigFile,
  clearCredentials,
  configFilePath,
  readConfig,
  type StoredCredentials,
  writeConfig,
} from '../config.js';
import { type Ctx, createApi } from '../context.js';
import { DEFAULT_API_URL } from '../endpoints.js';
import { CliError, ExitCode, InterruptedError } from '../errors.js';
import { formatDate, tildePath } from '../format.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { type Kit, kit } from '../ui/kit.js';
import { twoColumns } from '../ui/layout.js';
// Type only: the logo itself is loaded on demand, only by the login.
import type { LoginLogo } from '../ui/logo/show.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginFlags {
  token?: string | undefined;
  noBrowser?: boolean | undefined;
}

/**
 * `--token -`: from a pipe, everything until the end; on a terminal, the
 * first line, so Enter is enough after pasting (no Ctrl+D).
 */
async function readKeyFromStdin(ctx: Ctx): Promise<string> {
  if (!ctx.stdin.isTTY) return readAllStdin(ctx);
  ctx.out.info(ctx.out.t('login.pasteKey'));
  let text = '';
  for await (const chunk of ctx.stdin) {
    text += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
    const end = text.indexOf('\n');
    if (end !== -1) return text.slice(0, end);
  }
  return text;
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

const SCOPE_KEYS: Record<string, MessageKey> = {
  'customer:read': 'scope.customerRead',
  'provisions:read': 'scope.provisionsRead',
  'migrations:read': 'scope.migrationsRead',
  'migrations:write': 'scope.migrationsWrite',
  'provisions:write': 'scope.provisionsWrite',
  'provisions:lifecycle': 'scope.provisionsLifecycle',
  'provisions:sso': 'scope.provisionsSso',
  'domains:write': 'scope.domainsWrite',
  'wordpress:write': 'scope.wordpressWrite',
  'partner:read': 'scope.partnerRead',
  'components:read': 'scope.componentsRead',
  'webhooks:read': 'scope.webhooksRead',
  'webhooks:write': 'scope.webhooksWrite',
  'apps:read': 'scope.appsRead',
  'apps:install': 'scope.appsInstall',
  'vibe:read': 'scope.vibeRead',
  'vibe:write': 'scope.vibeWrite',
  'vibe:lifecycle': 'scope.vibeLifecycle',
  'vibe:sso': 'scope.vibeSso',
};

/** Permissions of a key in words; unknown scopes as the API sent them. */
export function scopesText(scopes: string[], t: Translator): string {
  return scopes
    .map((scope) => (SCOPE_KEYS[scope] ? t(SCOPE_KEYS[scope]) : safeText(scope)))
    .join(', ');
}

/** The live, designed flow: a terminal on stderr and no --json. */
function richFlow(ctx: Ctx): boolean {
  return !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Credentials this sign-in replaces, when they belong to another account or API. */
function replaced(
  config: ConfigFile,
  apiUrl: string,
  email: string | null,
): StoredCredentials | null {
  const previous = config.credentials;
  if (!previous) return null;
  if (previous.apiUrl === apiUrl && (previous.customer?.email ?? null) === email) return null;
  return previous;
}

function accountLines(ctx: Ctx, k: Kit, result: LoginResult): string[] {
  const t = ctx.out.t;
  const rows: [string, string][] = [];
  if (result.customer.name) rows.push([t('label.name'), safeText(result.customer.name)]);
  rows.push([t('label.email'), safeText(result.customer.email ?? '-')]);
  if (result.keyUuid) {
    rows.push([
      t('label.key'),
      `${safeText(result.keyUuid.slice(0, 8))} ${k.muted(`· ${tildePath(configFilePath(ctx.configDir), ctx.homedir)}`)}`,
    ]);
  }
  if (result.scopes.length > 0) rows.push([t('label.permissions'), scopesText(result.scopes, t)]);
  if (result.expiresAt) rows.push([t('label.validUntil'), formatDate(result.expiresAt, ctx.lang)]);
  if (ctx.apiUrl !== DEFAULT_API_URL) rows.push([t('label.api'), ctx.apiUrl]);
  return [
    '',
    `  ${k.ruler(t('home.account'))}`,
    ...k.rows(rows),
    '',
    `  ${k.ruler(t('next.title'))}`,
    ...twoColumns(
      ctx.out,
      // A partner key starts with the partner tools; any other key with migrations.
      result.scopes.includes('partner:read')
        ? [
            ['bladecp partner servers', t('next.partnerServers')],
            ['bladecp partner plans', t('next.partnerPlans')],
            ['bladecp partner --help', t('next.partnerHelp')],
          ]
        : [
            ['bladecp migrate <backup.tar.gz>', t('next.migrate')],
            ['bladecp servers', t('next.servers')],
            ['bladecp --help', t('next.help')],
          ],
      {
        width: k.width + 2,
        paintLeft: k.accent,
        paintRight: k.muted,
        wrap: (s, w) => k.wrap(s, w, ''),
      },
    ),
  ];
}

function printLogin(
  ctx: Ctx,
  result: LoginResult,
  previous: StoredCredentials | null,
  rail?: string[],
): void {
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: result });
    return;
  }
  const t = ctx.out.t;
  const replacedText = previous
    ? t('login.replaced', {
        email: previous.customer?.email ?? '-',
        apiUrl: previous.apiUrl,
        url: ctx.keysUrl,
      })
    : '';
  if (!rail || !ctx.out.rich) {
    ctx.out.print(t('login.success', { email: result.customer.email ?? '-' }));
    if (result.expiresAt)
      ctx.out.print(t('login.expires', { date: formatDate(result.expiresAt, ctx.lang) }));
    ctx.out.print(t('login.savedTo', { path: configFilePath(ctx.configDir) }));
    if (previous) ctx.out.warn(replacedText);
    return;
  }
  const k = kit(ctx.out, 'err');
  const first = result.customer.name?.trim().split(/\s+/)[0];
  ctx.out.live([
    ...rail,
    ...(previous ? k.wrap(replacedText, k.width, '').map((line) => k.railLine(k.warn(line))) : []),
    k.railLine(),
    `  ${k.rail(k.glyph.end)}  ${k.bold(first ? t('login.welcome', { name: first }) : t('login.welcomeNoName'))}`,
  ]);
  ctx.out.liveDone();
  ctx.out.lines(accountLines(ctx, kit(ctx.out, 'out'), result));
}

async function saveCredentials(
  ctx: Ctx,
  credentials: StoredCredentials,
): Promise<StoredCredentials | null> {
  const config = await readConfig(ctx.configDir).catch((): ConfigFile => ({ version: 1 }));
  const previous = replaced(config, ctx.apiUrl, credentials.customer?.email ?? null);
  await writeConfig(ctx.configDir, { ...config, version: 1, credentials });
  return previous;
}

export async function loginCommand(ctx: Ctx, flags: LoginFlags): Promise<number> {
  const t = ctx.out.t;
  const rich = richFlow(ctx);
  // 1. Explicit key.
  if (flags.token !== undefined) {
    const raw = flags.token === '-' ? await readKeyFromStdin(ctx) : flags.token;
    const apiKey = cleanApiKey(raw);
    ctx.out.addSecret(apiKey);
    assertApiKeyFormat(apiKey, 'token');
    if (rich) {
      const { showLoginLogo } = await import('../ui/logo/show.js');
      await showLoginLogo(ctx, kit(ctx.out, 'err'));
    }
    const me = await createApi(ctx, apiKey).me();
    const customer = { uuid: me.customer_uuid, email: me.customer_email, name: null };
    const result: LoginResult = {
      apiUrl: ctx.apiUrl,
      source: 'token',
      customer,
      keyUuid: me.api_key_uuid,
      scopes: me.scopes,
      expiresAt: null,
    };
    const previous = await saveCredentials(ctx, {
      apiUrl: ctx.apiUrl,
      apiKey,
      keyUuid: me.api_key_uuid,
      scopes: me.scopes,
      expiresAt: null,
      customer,
      source: 'token',
      savedAt: new Date(ctx.now()).toISOString(),
    });
    const k = kit(ctx.out, 'err');
    printLogin(ctx, result, previous, [
      `  ${k.rail(k.glyph.open)}  ${k.bold(t('login.title'))}`,
      k.railLine(),
      `  ${k.ok(k.glyph.done)}  ${t('login.keyChecked')}`,
    ]);
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
  const pkce = createPkce();
  const state = randomState();
  const server = await startLoopbackServer({ expectedState: state, t, lang: ctx.lang });
  try {
    const url = buildConnectUrl(ctx.hubUrl, {
      redirectUri: server.redirectUri,
      state,
      challenge: pkce.challenge,
    });
    let logo: LoginLogo | null = null;
    if (rich) {
      // The B is sized so the waiting screen fits the window: without links
      // in the terminal the whole address shows and may wrap, and without a
      // browser there is one more hint.
      const addressRows = ctx.out.caps.hyperlinks
        ? 1
        : Math.ceil(ctx.out.width(`  │  ${url}`) / ctx.out.errColumns);
      const extraRows = Math.max(0, addressRows - 1) + (flags.noBrowser ? 1 : 0);
      const { showLoginLogo } = await import('../ui/logo/show.js');
      logo = await showLoginLogo(ctx, kit(ctx.out, 'err'), extraRows);
    }
    let opened = false;
    if (!flags.noBrowser) opened = await ctx.openUrl(url);
    const timeoutMs = ctx.loginTimeoutMs ?? LOGIN_TIMEOUT_MS;
    let code: string;
    let rail: string[] | undefined;
    if (rich) {
      ({ code, rail } = await waitInTerminal(ctx, {
        url,
        opened,
        noBrowser: Boolean(flags.noBrowser),
        timeoutMs,
        server,
        logo,
      }));
    } else {
      ctx.out.notice(opened ? t('login.browserOpened') : t('login.openThisUrl'));
      ctx.out.notice(`  ${url}`);
      ctx.out.notice(t('login.waiting'));
      if (flags.noBrowser) ctx.out.notice(t('login.remoteHint'));
      code = await server.waitForCode(timeoutMs, ctx.signal);
    }
    const api = createApi(ctx, undefined);
    const token = await api.exchangeConnectCode({
      client: 'cli',
      code,
      codeVerifier: pkce.verifier,
      redirectUri: server.redirectUri,
    });
    ctx.out.addSecret(token.apiKey);
    assertApiKeyFormat(token.apiKey, 'response');
    const organization = token.organization?.name?.trim();
    const customer = {
      uuid: token.customer?.uuid ?? null,
      email: token.customer?.email ?? null,
      name: token.customer?.name ?? null,
    };
    const previous = await saveCredentials(ctx, {
      apiUrl: ctx.apiUrl,
      apiKey: token.apiKey,
      keyUuid: token.keyUuid ?? null,
      scopes: token.scopes ?? [],
      expiresAt: token.expiresAt ?? null,
      customer,
      source: 'browser',
      savedAt: new Date(ctx.now()).toISOString(),
    });
    printLogin(
      ctx,
      {
        apiUrl: ctx.apiUrl,
        source: 'browser',
        customer:
          organization && customer.name
            ? { ...customer, name: `${customer.name} · ${organization}` }
            : customer,
        keyUuid: token.keyUuid ?? null,
        scopes: token.scopes ?? [],
        expiresAt: token.expiresAt ?? null,
      },
      previous,
      rail,
    );
    return ExitCode.OK;
  } finally {
    await server.close();
  }
}

/**
 * The designed wait: the address stays on screen (clickable where the
 * terminal supports links), a live line counts the time, and keys act while
 * waiting: Enter opens the browser again, c copies the address, Esc cancels.
 */
async function waitInTerminal(
  ctx: Ctx,
  options: {
    url: string;
    opened: boolean;
    noBrowser: boolean;
    timeoutMs: number;
    server: { waitForCode(timeoutMs: number, signal?: AbortSignal): Promise<string> };
    /** The logo above: its points of light twinkle while this waits. */
    logo: LoginLogo | null;
  },
): Promise<{ code: string; rail: string[] }> {
  const t = ctx.out.t;
  const k = kit(ctx.out, 'err');
  const { url } = options;
  const keys = ctx.interactive;
  const shortUrl = `${new URL(url).host}/connect?client=cli&…`;
  const linked = ctx.out.caps.hyperlinks;
  ctx.out.infoLines([
    `  ${k.rail(k.glyph.open)}  ${k.bold(t('login.title'))}`,
    k.railLine(),
    `  ${k.violet(k.glyph.active)}  ${options.opened ? t('login.browser') : t('login.openThis')}`,
    k.railLine(linked ? k.link(url, k.underline(k.violet(shortUrl))) : url),
    ...(keys
      ? [k.railLine(k.faint(options.noBrowser ? t('login.keysNoBrowser') : t('login.keys')))]
      : []),
    ...(options.noBrowser ? [k.railLine(k.faint(t('login.remoteHintShort')))] : []),
    k.railLine(),
  ]);

  const waiting = new AbortController();
  const onOuterAbort = () => waiting.abort();
  ctx.signal.addEventListener('abort', onOuterAbort, { once: true });
  const codePromise = options.server.waitForCode(options.timeoutMs, waiting.signal);
  let settled = false;
  const stopKeys = new AbortController();
  const settledPromise = codePromise.then(
    () => undefined,
    () => undefined,
  );
  void settledPromise.then(() => {
    settled = true;
    stopKeys.abort();
  });
  let cancelled = false;
  const shown = { flash: null as { text: string; until: number } | null };
  const started = ctx.now();
  let frame = 0;

  const keyLoop = keys
    ? (async () => {
        const prompter = ctx.createPrompter();
        try {
          while (!settled) {
            let key: string;
            try {
              key = await prompter.key('login', stopKeys.signal);
            } catch (error) {
              if (error instanceof InterruptedError && !stopKeys.signal.aborted) {
                cancelled = true;
                waiting.abort();
              }
              break;
            }
            if (key === 'enter' && !options.noBrowser) {
              await ctx.openUrl(url);
              shown.flash = { text: t('login.reopened'), until: frame + 25 };
            } else if (key === 'c') {
              const copied = await ctx.copyText(url);
              shown.flash = {
                text: copied ? t('login.copied') : t('login.copyFailed'),
                until: frame + 25,
              };
            } else if (key === 'esc') {
              cancelled = true;
              waiting.abort();
              break;
            }
          }
        } finally {
          prompter.close();
        }
      })()
    : Promise.resolve();

  try {
    while (!settled) {
      const elapsed = ctx.now() - started;
      const info =
        shown.flash && frame < shown.flash.until
          ? k.violet(shown.flash.text)
          : k.muted(
              `${clock(elapsed)} · ${t('login.linkValid', { time: clock(options.timeoutMs - elapsed) })}`,
            );
      ctx.out.live([
        `  ${k.accent(k.spin[frame % k.spin.length]!)}  ${k.shimmer(t('login.waitingShort'), frame * 90)}  ${info}`,
      ]);
      options.logo?.twinkle();
      frame += 1;
      await Promise.race([settledPromise, ctx.frame(90)]);
    }
    await keyLoop;
    let code: string;
    try {
      code = await codePromise;
    } catch (error) {
      ctx.out.clearLiveLine();
      if (cancelled) {
        throw new CliError(
          'login.cancelled',
          {},
          { exitCode: ExitCode.INTERRUPTED, code: 'interrupted' },
        );
      }
      throw error;
    }
    ctx.out.live([`  ${k.accent(k.spin[0]!)}  ${t('login.saving')}`]);
    const took = clock(ctx.now() - started);
    return {
      code,
      rail: [
        `  ${k.ok(k.glyph.done)}  ${t('login.connectedIn', { time: took })}`,
        k.railLine(k.muted(t('login.keySaved'))),
      ],
    };
  } finally {
    ctx.signal.removeEventListener('abort', onOuterAbort);
    stopKeys.abort();
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
  if (!ctx.out.rich) {
    ctx.out.print(removed ? t('logout.done') : t('logout.nothing'));
    if (removed) ctx.out.print(t('logout.revokeHint', { url: ctx.keysUrl }));
    if (envKeyActive) ctx.out.warn(t('logout.envStillSet'));
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  const lines = [''];
  if (removed) {
    lines.push(`  ${k.ok(k.glyph.done)}  ${t('logout.done')}`);
    for (const line of k.wrap(t('logout.stillValid'), k.width - 3, ''))
      lines.push(k.railLine(k.muted(line)));
    lines.push(`  ${k.rail(k.glyph.end)}  ${k.link(ctx.keysUrl, k.accent(ctx.keysUrl))}`);
  } else {
    lines.push(`  ${k.faint(k.glyph.done)}  ${t('logout.nothing')}`);
  }
  ctx.out.lines(lines);
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
  const sourceText = auth.source === 'env' ? t('whoami.sourceEnv') : t('whoami.sourceConfig');
  const rate =
    data.rateLimit.limitPerMinute === null
      ? '-'
      : t('whoami.perMinute', { count: data.rateLimit.limitPerMinute });
  if (!ctx.out.rich) {
    ctx.out.print(t('whoami.signedInAs', { email: me.customer_email }));
    const rows: [string, string][] = [
      [t('label.customer'), me.customer_uuid],
      [t('label.key'), `${me.api_key_uuid} (${sourceText})`],
      [t('label.scopes'), me.scopes.join(', ') || '-'],
      [t('label.rateLimit'), rate],
      [t('label.expires'), expiresAt ? formatDate(expiresAt, ctx.lang) : '-'],
      [t('label.api'), ctx.apiUrl],
    ];
    ctx.out.lines(kit(ctx.out, 'out').plainRows(rows, 2));
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  const name = stored?.customer?.name;
  const account: [string, string][] = [
    [t('label.customer'), me.customer_uuid],
    [t('label.key'), `${safeText(me.api_key_uuid)} ${k.muted(`· ${sourceText}`)}`],
  ];
  if (auth.source === 'config') {
    account.push([t('label.config'), tildePath(configFilePath(ctx.configDir), ctx.homedir)]);
  }
  ctx.out.lines([
    '',
    `  ${k.ok(k.glyph.bullet)} ${ctx.out.tc('whoami.signedInAs', { email: k.bold(safeText(me.customer_email)) })}`,
    ...(name ? [`    ${safeText(name)}`] : []),
    ` ${k.horizon(k.width, { at: 0.12, spread: 0.5 })}`,
    `  ${k.ruler(t('home.account'))}`,
    ...k.rows(account),
    '',
    `  ${k.ruler(t('whoami.access'))}`,
    ...k.rows([
      [t('label.permissions'), me.scopes.length ? scopesText(me.scopes, t) : '-'],
      [t('label.rateLimit'), rate],
      [t('label.validUntil'), expiresAt ? formatDate(expiresAt, ctx.lang) : t('whoami.noExpiry')],
      [t('label.api'), ctx.apiUrl],
    ]),
  ]);
  return ExitCode.OK;
}
