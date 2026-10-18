// Daily check for a new version of the CLI. Only the npm registry is asked,
// for the latest version number and nothing else; no data about the person or
// the command is sent. The answer is kept in the config folder (0600) and
// read by the next interactive run, which shows one quiet line.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FetchLike } from '../api.js';
import { ensurePrivateDir, type Preferences, writeFileAtomic } from '../config.js';
import { envFlag } from '../ui/term.js';

export const PACKAGE_NAME = '@bladecp/cli';
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
/** At most one check a day. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 4000;

type Env = Record<string, string | undefined>;

export interface UpdateJob {
  configDir: string;
  registryUrl: string;
  current: string;
}

export interface UpdateCache {
  /** When the registry was last asked (even when it did not answer). */
  checkedAt: string;
  /** Latest version the registry reported, or null when unknown. */
  latest: string | null;
}

export function cachePath(configDir: string): string {
  return join(configDir, 'update-check.json');
}

/** Registry of the package, honoring a custom npm registry. */
export function registryUrl(env: Env): string {
  const base = (env.npm_config_registry || env.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY).replace(
    /\/+$/,
    '',
  );
  return `${base}/${PACKAGE_NAME.replace('/', '%2f')}`;
}

/** Turned off by BLADECP_NO_UPDATE_CHECK, NO_UPDATE_NOTIFIER or `config set update-check off`. */
export function updateCheckDisabled(env: Env, preferences: Preferences): boolean {
  return (
    envFlag(env.BLADECP_NO_UPDATE_CHECK) ||
    env.NO_UPDATE_NOTIFIER !== undefined ||
    preferences.updateCheck === false
  );
}

export async function readUpdateCache(configDir: string): Promise<UpdateCache | null> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(configDir), 'utf8')) as UpdateCache;
    if (!parsed || typeof parsed.checkedAt !== 'string') return null;
    return {
      checkedAt: parsed.checkedAt,
      latest: typeof parsed.latest === 'string' ? parsed.latest : null,
    };
  } catch {
    return null;
  }
}

export async function writeUpdateCache(configDir: string, cache: UpdateCache): Promise<void> {
  await ensurePrivateDir(configDir);
  await writeFileAtomic(cachePath(configDir), `${JSON.stringify(cache, null, 2)}\n`);
}

/** Whether the last check is older than a day (or never happened). */
export function checkIsDue(cache: UpdateCache | null, now: number): boolean {
  if (!cache) return true;
  const at = Date.parse(cache.checkedAt);
  return Number.isNaN(at) || now - at >= CHECK_INTERVAL_MS || at - now > CHECK_INTERVAL_MS;
}

/**
 * Latest version from the registry. Asks for the abbreviated document (the
 * one npm itself uses to install), with a short timeout.
 */
export async function fetchLatest(
  fetch: FetchLike,
  url: string,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/vnd.npm.install-v1+json', 'User-Agent': 'bladecp-cli' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`registry answered ${response.status}`);
    const body = (await response.json()) as { 'dist-tags'?: { latest?: unknown } };
    const latest = body['dist-tags']?.latest;
    if (typeof latest !== 'string' || !/^\d+\.\d+\.\d+/.test(latest)) {
      throw new Error('registry answer without a latest version');
    }
    return latest;
  } finally {
    clearTimeout(timer);
  }
}

/** One check: ask the registry, keep the answer. Never throws. */
export async function runUpdateCheck(job: UpdateJob, fetch: FetchLike, now: number): Promise<void> {
  const previous = await readUpdateCache(job.configDir);
  let latest = previous?.latest ?? null;
  try {
    latest = await fetchLatest(fetch, job.registryUrl);
  } catch {
    // Without network the check fails silently and waits for tomorrow.
  }
  try {
    await writeUpdateCache(job.configDir, { checkedAt: new Date(now).toISOString(), latest });
  } catch {
    // A read-only config folder only means no notice.
  }
}
