import { ExitCode } from './errors.js';
import { catalogs, type Lang } from './i18n/index.js';

/** Names of `ExitCode`, by value. */
export const EXIT_NAMES = new Map<number, string>(
  Object.entries(ExitCode).map(([name, value]) => [value, name]),
);

/**
 * Description of each exit code in one language, read from `help.exitCodes`
 * ("0 ok, 1 unexpected error, ..."), the list `bladecp --help` prints.
 */
export function exitCodeDescriptions(lang: Lang): Map<number, string> {
  const result = new Map<number, string>();
  for (const part of catalogs[lang]['help.exitCodes'].split(', ')) {
    const match = /^(\d+) (.+)$/.exec(part);
    if (!match) throw new Error(`help.exitCodes (${lang}): cannot read "${part}"`);
    result.set(Number(match[1]), match[2]!);
  }
  const expected = [...EXIT_NAMES.keys()].sort((a, b) => a - b);
  const found = [...result.keys()].sort((a, b) => a - b);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(
      `help.exitCodes (${lang}) lists ${found.join(', ')}, ExitCode has ${expected.join(', ')}`,
    );
  }
  return result;
}
