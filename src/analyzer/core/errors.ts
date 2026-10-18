// Why the migration parser refuses a backup. Codes are stable (they appear in
// the `--json` report); `reason` is a machine token that narrows the code, and
// `params` carries only values that are safe to show (a domain, a constant
// name), never a password, a hash or an email address.

export type EngineErrorCode =
  | 'archive_invalid'
  | 'archive_truncated'
  | 'parse_cap_exceeded'
  | 'unrecognized_layout'
  | 'not_wordpress'
  | 'multisite_unsupported'
  | 'no_primary_domain'
  | 'invalid_primary_domain'
  | 'invalid_database_name'
  | 'invalid_table_prefix'
  | 'invalid_db_charset'
  | 'invalid_db_collation'
  | 'invalid_email_local_part';

export type ErrorParams = Record<string, string | number>;

export class AnalyzerError extends Error {
  readonly code: EngineErrorCode;
  readonly reason: string | null;
  readonly params: ErrorParams;

  constructor(code: EngineErrorCode, reason: string | null = null, params: ErrorParams = {}) {
    super(reason ? `${code}:${reason}` : code);
    this.name = 'AnalyzerError';
    this.code = code;
    this.reason = reason;
    this.params = params;
  }
}

/** archive/tar ErrHeader (and the other errors of a malformed archive). */
export const headerError = (reason = 'header') => new AnalyzerError('archive_invalid', reason);

/** io.ErrUnexpectedEOF: the archive ends in the middle of an entry. */
export const truncatedError = () => new AnalyzerError('archive_truncated', 'unexpected_eof');

/** An aggregate limit of the parser (a hostile or out-of-shape backup). */
export const capError = (reason: string, params: ErrorParams = {}) =>
  new AnalyzerError('parse_cap_exceeded', reason, params);

/** The analysis was cancelled (Ctrl+C, a closed page). */
export function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}
