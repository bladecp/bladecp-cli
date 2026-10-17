import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { CliError, ExitCode, InterruptedError } from '../errors.js';
import type { Translator } from '../i18n/index.js';
import { safeEqual } from './pkce.js';

export interface LoopbackServer {
  port: number;
  redirectUri: string;
  /** Resolves with the authorization code delivered to `/callback`. */
  waitForCode(timeoutMs: number, signal?: AbortSignal): Promise<string>;
  close(): Promise<void>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(lang: string, title: string, body: string, ok: boolean): string {
  const accent = ok ? '#6366f1' : '#dc2626';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BladeCP CLI</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d12; color: #e5e7eb; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 28rem; padding: 2rem; border: 1px solid #1f2430; border-radius: 12px; background: #11141b; }
  h1 { margin: 0 0 .5rem; font-size: 1.25rem; color: ${accent}; }
  p { margin: 0; color: #9ca3af; }
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body>
</html>`;
}

function send(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    Connection: 'close',
  });
  res.end(html);
}

/**
 * Starts the one-shot callback receiver on 127.0.0.1 with a random port.
 * The first request to `/callback` settles the sign-in: a wrong `state`
 * aborts it, `error=access_denied` reports a refusal, and a `code` is
 * handed to the caller.
 */
export async function startLoopbackServer(options: {
  expectedState: string;
  t: Translator;
  lang: string;
}): Promise<LoopbackServer> {
  const { expectedState, t, lang } = options;
  let settled = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Avoid an unhandled rejection if the caller stops waiting first.
  codePromise.catch(() => undefined);

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      send(
        res,
        404,
        page(lang, t('login.page.notFoundTitle'), t('login.page.notFoundBody'), false),
      );
      return;
    }
    if (req.method !== 'GET') {
      send(
        res,
        405,
        page(lang, t('login.page.notFoundTitle'), t('login.page.notFoundBody'), false),
      );
      return;
    }
    if (settled) {
      send(res, 410, page(lang, t('login.page.usedTitle'), t('login.page.usedBody'), false));
      return;
    }
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (!state || !safeEqual(state, expectedState)) {
      send(res, 400, page(lang, t('login.page.stateTitle'), t('login.page.stateBody'), false));
      settle(() =>
        rejectCode(
          new CliError(
            'error.loginStateMismatch',
            {},
            { exitCode: ExitCode.AUTH, code: 'state_mismatch' },
          ),
        ),
      );
      return;
    }
    if (error) {
      send(res, 200, page(lang, t('login.page.deniedTitle'), t('login.page.deniedBody'), false));
      settle(() =>
        rejectCode(
          new CliError('error.loginDenied', {}, { exitCode: ExitCode.AUTH, code: 'access_denied' }),
        ),
      );
      return;
    }
    if (!code) {
      send(res, 400, page(lang, t('login.page.stateTitle'), t('login.page.stateBody'), false));
      settle(() =>
        rejectCode(
          new CliError(
            'error.loginNoCode',
            {},
            { exitCode: ExitCode.AUTH, code: 'invalid_callback' },
          ),
        ),
      );
      return;
    }
    send(res, 200, page(lang, t('login.page.successTitle'), t('login.page.successBody'), true));
    settle(() => resolveCode(code));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;

  return {
    port,
    redirectUri: `http://127.0.0.1:${port}/callback`,
    waitForCode(timeoutMs, signal) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          settle(() =>
            rejectCode(
              new CliError(
                'error.loginTimeout',
                {},
                { exitCode: ExitCode.AUTH, code: 'login_timeout' },
              ),
            ),
          );
        }, timeoutMs);
        const onAbort = () => settle(() => rejectCode(new InterruptedError()));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
        codePromise.then(
          (code) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolve(code);
          },
          (error: unknown) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(error);
          },
        );
      });
    },
    close() {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
