import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { CliError, ExitCode, InterruptedError } from '../errors.js';
import type { Translator } from '../i18n/index.js';
import { callbackPage as page, sendPage as send } from '../ui/callback-page.js';
import { safeEqual } from './pkce.js';

export interface LoopbackServer {
  port: number;
  redirectUri: string;
  /** Resolves with the authorization code delivered to `/callback`. */
  waitForCode(timeoutMs: number, signal?: AbortSignal): Promise<string>;
  close(): Promise<void>;
}

/**
 * Starts the one-shot callback receiver on 127.0.0.1 with a random port.
 * Only a request with the right `state` settles the sign-in: it carries the
 * code, or `error=access_denied` for a refusal. A request with another
 * `state` (another program on this computer, an old browser tab) gets an
 * error page and is ignored, so it cannot cancel the sign-in; if the wait
 * then times out, the error says such a request arrived.
 */
export async function startLoopbackServer(options: {
  expectedState: string;
  t: Translator;
  lang: string;
}): Promise<LoopbackServer> {
  const { expectedState, t, lang } = options;
  let settled = false;
  /** Requests that reached /callback with a state this terminal did not start. */
  let foreign = 0;
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
      foreign += 1;
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
              foreign > 0
                ? new CliError(
                    'error.loginStateMismatch',
                    {},
                    { exitCode: ExitCode.AUTH, code: 'state_mismatch' },
                  )
                : new CliError(
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
