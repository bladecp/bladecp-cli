// Short IDs: any command that takes a migration or server ID also accepts
// the first characters of it (at least 4), as long as only one of your
// migrations or servers starts with them.

import { ApiError, CliError, ExitCode } from './errors.js';

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Hexadecimal digits, with the dashes a UUID has, shorter than a whole UUID. */
const PREFIX = /^[0-9a-f]{4,}(?:-[0-9a-f]*)*$/i;

export function isIdPrefix(value: string): boolean {
  return !FULL_UUID.test(value) && PREFIX.test(value) && value.length < 36;
}

/**
 * Turns a prefix into the whole ID by listing what the account has. A whole
 * UUID, or a value that is not a hexadecimal prefix, is used as given.
 */
export async function resolveId(
  value: string,
  list: () => Promise<{ uuid: string }[]>,
): Promise<string> {
  if (!isIdPrefix(value)) return value;
  const prefix = value.toLowerCase();
  const matches = (await list()).filter((item) =>
    String(item.uuid).toLowerCase().startsWith(prefix),
  );
  if (matches.length === 1) return matches[0]!.uuid;
  if (matches.length === 0) throw new ApiError(404, undefined, undefined);
  throw new CliError(
    'error.ambiguousId',
    { value, count: matches.length },
    {
      exitCode: ExitCode.USAGE,
      code: 'ambiguous_id',
      details: { matches: matches.slice(0, 10).map((item) => item.uuid) },
    },
  );
}
