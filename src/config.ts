import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { CliError, ExitCode } from './errors.js';

type Env = Record<string, string | undefined>;

/**
 * Where credentials and upload state live:
 * - `BLADECP_CONFIG_DIR` when set;
 * - Windows: `%APPDATA%\bladecp`;
 * - elsewhere: `$XDG_CONFIG_HOME/bladecp`, default `~/.config/bladecp`.
 */
export function resolveConfigDir(env: Env, platform: NodeJS.Platform, homedir: string): string {
  const override = env.BLADECP_CONFIG_DIR?.trim();
  if (override) return resolve(override);
  if (platform === 'win32') {
    return join(env.APPDATA?.trim() || join(homedir, 'AppData', 'Roaming'), 'bladecp');
  }
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir, '.config'), 'bladecp');
}

export interface StoredCredentials {
  apiUrl: string;
  apiKey: string;
  keyUuid?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  customer?: { uuid?: string | null; email?: string | null; name?: string | null };
  source: 'browser' | 'token';
  savedAt: string;
}

export interface ConfigFile {
  version: 1;
  credentials?: StoredCredentials;
}

export function configFilePath(dir: string): string {
  return join(dir, 'config.json');
}

/** Writes through a temporary file so a crash never leaves half a file. */
export async function writeFileAtomic(path: string, data: string, mode = 0o600): Promise<void> {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, data, { mode });
    // The umask can widen the mode passed to writeFile on some systems.
    await chmod(tmp, mode).catch(() => undefined);
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function readConfig(dir: string): Promise<ConfigFile> {
  const path = configFilePath(dir);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 };
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as ConfigFile;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return { version: 1, ...(parsed.credentials ? { credentials: parsed.credentials } : {}) };
  } catch {
    throw new CliError(
      'error.configInvalid',
      { path },
      { exitCode: ExitCode.GENERAL, code: 'config_invalid' },
    );
  }
}

export async function writeConfig(dir: string, config: ConfigFile): Promise<void> {
  await ensurePrivateDir(dir);
  await writeFileAtomic(configFilePath(dir), `${JSON.stringify(config, null, 2)}\n`);
}

/** Removes the saved credentials. Returns whether anything was removed. */
export async function clearCredentials(dir: string): Promise<boolean> {
  let config: ConfigFile;
  try {
    config = await readConfig(dir);
  } catch {
    // A broken file cannot hold a usable key; remove it entirely.
    await rm(configFilePath(dir), { force: true });
    return true;
  }
  if (!config.credentials) return false;
  const { credentials: _removed, ...rest } = config;
  if (Object.keys(rest).length <= 1) {
    await rm(configFilePath(dir), { force: true });
  } else {
    await writeConfig(dir, rest);
  }
  return true;
}
