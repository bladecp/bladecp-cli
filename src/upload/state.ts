import { createHash } from 'node:crypto';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { ensurePrivateDir, writeFileAtomic } from '../config.js';
import type { PartRef } from './plan.js';

/**
 * Local memory of one `bladecp migrate <file>` run, so running the same
 * command again continues the same migration instead of creating another.
 * Never holds the API key.
 */
export interface MigrateState {
  version: 1;
  key: string;
  apiUrl: string;
  filePath: string;
  fileSize: number;
  fileMtimeMs: number;
  idempotencyKey: string;
  partnerPlanId: number;
  locationId: number;
  primaryDomain: string | null;
  migrationUuid: string | null;
  uploadId: string | null;
  partSize: number | null;
  parts: PartRef[];
  uploadCompleted: boolean;
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function stateDir(configDir: string): string {
  return join(configDir, 'uploads');
}

export function stateKey(apiUrl: string, filePath: string, size: number, mtimeMs: number): string {
  return createHash('sha256')
    .update(`${apiUrl}\n${filePath}\n${size}\n${Math.trunc(mtimeMs)}`)
    .digest('hex')
    .slice(0, 32);
}

function statePath(configDir: string, key: string): string {
  return join(stateDir(configDir), `${key}.json`);
}

export async function loadState(configDir: string, key: string): Promise<MigrateState | null> {
  try {
    const parsed = JSON.parse(await readFile(statePath(configDir, key), 'utf8')) as MigrateState;
    if (parsed?.version !== 1 || parsed.key !== key || !Array.isArray(parsed.parts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveState(
  configDir: string,
  state: MigrateState,
  now: number,
): Promise<void> {
  state.updatedAt = new Date(now).toISOString();
  await ensurePrivateDir(stateDir(configDir));
  await writeFileAtomic(statePath(configDir, state.key), `${JSON.stringify(state, null, 2)}\n`);
}

export async function removeState(configDir: string, key: string): Promise<void> {
  await rm(statePath(configDir, key), { force: true });
}

/** Drops state files nobody touched for 30 days. Best effort. */
export async function pruneStates(configDir: string, now: number): Promise<void> {
  const dir = stateDir(configDir);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const path = join(dir, name);
        try {
          const info = await stat(path);
          if (now - info.mtimeMs > MAX_AGE_MS) await rm(path, { force: true });
        } catch {
          // ignore
        }
      }),
  );
}
