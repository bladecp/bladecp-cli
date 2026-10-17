import { CliError, ExitCode } from './errors.js';

export const DEFAULT_API_URL = 'https://api.bladecp.com';
export const DEFAULT_HUB_URL = 'https://hub.bladecp.com';
export const DOCS_URL = 'https://developers.bladecp.com/cli';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Validates and normalizes an API base address. Keys travel in the
 * Authorization header, so plain HTTP is only accepted on this computer.
 */
export function normalizeApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CliError(
      'error.invalidApiUrl',
      { address: raw },
      { exitCode: ExitCode.USAGE, code: 'invalid_api_url' },
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CliError(
      'error.invalidApiUrl',
      { address: raw },
      { exitCode: ExitCode.USAGE, code: 'invalid_api_url' },
    );
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new CliError(
      'error.insecureApiUrl',
      { address: raw },
      { exitCode: ExitCode.USAGE, code: 'insecure_api_url' },
    );
  }
  if (url.username || url.password) {
    throw new CliError(
      'error.invalidApiUrl',
      { address: raw },
      { exitCode: ExitCode.USAGE, code: 'invalid_api_url' },
    );
  }
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/api\/v1$/, '');
  return `${url.origin}${path}`;
}

export function resolveApiUrl(
  flag: string | undefined,
  env: Record<string, string | undefined>,
): string {
  const raw = flag ?? env.BLADECP_API_URL ?? DEFAULT_API_URL;
  return normalizeApiUrl(raw.trim() === '' ? DEFAULT_API_URL : raw);
}

/**
 * The Hub that pairs with an API address: `api.<domain>` becomes
 * `hub.<domain>`. `BLADECP_HUB_URL` overrides it (local development).
 */
export function resolveHubUrl(apiUrl: string, env: Record<string, string | undefined>): string {
  const override = env.BLADECP_HUB_URL?.trim();
  if (override) return normalizeApiUrl(override);
  const url = new URL(apiUrl);
  if (url.hostname.startsWith('api.')) {
    return `${url.protocol}//hub.${url.hostname.slice(4)}${url.port ? `:${url.port}` : ''}`;
  }
  return DEFAULT_HUB_URL;
}

/** Nameservers of the BladeCP DNS, the ones the Hub shows for the official API. */
export const OFFICIAL_NAMESERVERS = ['kant.ns.bladecp.com', 'hegel.ns.bladecp.com'] as const;

/**
 * Nameservers a migrated domain can point to. Only the official API has
 * known ones; for any other address the CLI shows none instead of guessing.
 */
export function nameserversFor(apiUrl: string): readonly string[] {
  return new URL(apiUrl).hostname === new URL(DEFAULT_API_URL).hostname ? OFFICIAL_NAMESERVERS : [];
}

/** Hub page where the person creates and revokes API keys. */
export function apiKeysPageUrl(hubUrl: string): string {
  return `${hubUrl}/account/api-keys`;
}
