import { readFileSync } from 'node:fs';

let cached: string | undefined;

/** Version from the package manifest shipped next to `dist/`. */
export function cliVersion(): string {
  if (cached) return cached;
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      version?: string;
    };
    cached = manifest.version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}

/** `1.2.3` or `1.2.3-rc.1` as comparable parts, or null when it is not a version. */
function parseVersion(value: string): { core: number[]; pre: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** True when `candidate` is a newer version than `current` (semantic versioning). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i]! !== b.core[i]!) return a.core[i]! > b.core[i]!;
  }
  // 1.0.0 is newer than 1.0.0-rc.1; two pre-releases compare as text.
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true;
  if (b.pre === null) return false;
  return a.pre.localeCompare(b.pre, 'en', { numeric: true }) > 0;
}
