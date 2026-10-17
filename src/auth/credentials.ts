import { type ConfigFile, readConfig, type StoredCredentials } from '../config.js';
import type { Ctx } from '../context.js';
import { CliError, ExitCode } from '../errors.js';

const KEY_FORMAT = /^bcp_(live|sand)_[A-Za-z0-9_-]{8,}$/;

export function isApiKeyFormat(value: string): boolean {
  return KEY_FORMAT.test(value);
}

export function assertApiKeyFormat(
  value: string,
  source: 'token' | 'env' | 'config' | 'response',
): void {
  if (isApiKeyFormat(value)) return;
  if (source === 'response') {
    throw new CliError(
      'error.invalidKeyFromApi',
      {},
      { exitCode: ExitCode.GENERAL, code: 'invalid_response' },
    );
  }
  const key =
    source === 'env'
      ? 'error.invalidKeyEnv'
      : source === 'config'
        ? 'error.invalidKeyConfig'
        : 'error.invalidKeyFormat';
  throw new CliError(
    key,
    {},
    {
      exitCode: source === 'config' ? ExitCode.AUTH : ExitCode.USAGE,
      code: 'invalid_key_format',
      hint: { key: 'hint.login' },
    },
  );
}

export interface ResolvedAuth {
  apiKey: string;
  source: 'env' | 'config';
  stored?: StoredCredentials | undefined;
}

/** Saved credentials only apply to the API address they were issued for. */
export function storedFor(config: ConfigFile, apiUrl: string): StoredCredentials | undefined {
  const credentials = config.credentials;
  if (!credentials || credentials.apiUrl !== apiUrl) return undefined;
  return credentials;
}

/**
 * Key precedence: `BLADECP_API_KEY`, then the credentials saved by
 * `bladecp login` for the current API address.
 */
export async function resolveAuth(ctx: Ctx): Promise<ResolvedAuth> {
  const envKey = ctx.env.BLADECP_API_KEY?.trim();
  if (envKey) {
    ctx.out.addSecret(envKey);
    assertApiKeyFormat(envKey, 'env');
    return { apiKey: envKey, source: 'env' };
  }
  const config = await readConfig(ctx.configDir);
  const stored = storedFor(config, ctx.apiUrl);
  if (!stored) {
    const otherApi = config.credentials?.apiUrl;
    throw new CliError(
      otherApi ? 'error.notSignedInForApi' : 'error.notSignedIn',
      { apiUrl: ctx.apiUrl },
      { exitCode: ExitCode.AUTH, code: 'not_signed_in', hint: { key: 'hint.login' } },
    );
  }
  ctx.out.addSecret(stored.apiKey);
  assertApiKeyFormat(stored.apiKey, 'config');
  return { apiKey: stored.apiKey, source: 'config', stored };
}
