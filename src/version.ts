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
