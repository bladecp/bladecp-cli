// What changed between the installed version and the latest one, read from
// the CHANGELOG published with the release on GitHub.

import type { FetchLike } from '../api.js';
import { isNewerVersion } from '../version.js';

export const RELEASES_URL = 'https://github.com/bladecp/bladecp-cli/releases';

export function changelogUrl(version: string): string {
  return `https://raw.githubusercontent.com/bladecp/bladecp-cli/v${version}/CHANGELOG.md`;
}

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

/**
 * The first lines of each change listed for versions newer than `current`
 * and up to `latest`, newest first. Markdown is reduced to plain text.
 */
export function changesBetween(
  changelog: string,
  current: string,
  latest: string,
  max = 6,
): string[] {
  const items: string[] = [];
  let take = false;
  let bullet: string | null = null;
  const flush = () => {
    if (bullet && items.length < max) items.push(bullet);
    bullet = null;
  };
  for (const line of changelog.split('\n')) {
    const heading = /^## \[([^\]]+)\]/.exec(line);
    if (heading) {
      flush();
      const version = heading[1]!;
      take =
        version !== 'Unreleased' &&
        isNewerVersion(version, current) &&
        !isNewerVersion(version, latest);
      continue;
    }
    if (!take) continue;
    if (/^- /.test(line)) {
      flush();
      bullet = line.slice(2).trim();
    } else if (bullet && /^ {2}\S/.test(line) && bullet.length < 160) {
      bullet = `${bullet} ${line.trim()}`;
    } else if (line.trim() === '' || /^#/.test(line)) {
      flush();
    }
  }
  flush();
  return items.map((item) => {
    const plain = item.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1');
    const sentence = /^(.+?[.:])(\s|$)/.exec(plain)?.[1] ?? plain;
    return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
  });
}

export async function fetchChanges(
  fetch: FetchLike,
  current: string,
  latest: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(changelogUrl(latest), {
      method: 'GET',
      headers: { 'User-Agent': 'bladecp-cli' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return [];
    return changesBetween(await response.text(), current, latest);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
