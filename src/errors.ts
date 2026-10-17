import type { MessageKey, Vars } from './i18n/index.js';

/**
 * Process exit codes. Documented in the READMEs and in `bladecp --help`;
 * treat them as a public contract.
 */
export const ExitCode = {
  OK: 0,
  GENERAL: 1,
  USAGE: 2,
  AUTH: 3,
  FORBIDDEN: 4,
  NOT_FOUND: 5,
  REJECTED: 6,
  RATE_LIMITED: 7,
  NETWORK: 8,
  MIGRATION_FAILED: 9,
  ACTION_REQUIRED: 10,
  INTERRUPTED: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface CliErrorOptions {
  exitCode?: ExitCodeValue;
  /** Stable machine code, emitted in `--json` output. */
  code?: string;
  /** Optional follow-up hint shown below the message. */
  hint?: { key: MessageKey; vars?: Vars };
  /** Extra machine-readable fields for `--json` output. */
  details?: Record<string, unknown>;
}

/** A user-facing failure whose message is a translated catalog entry. */
export class CliError extends Error {
  readonly key: MessageKey;
  readonly vars: Vars;
  readonly exitCode: ExitCodeValue;
  readonly code: string;
  readonly hint: CliErrorOptions['hint'];
  readonly details: Record<string, unknown> | undefined;

  constructor(key: MessageKey, vars: Vars = {}, options: CliErrorOptions = {}) {
    super(key);
    this.name = 'CliError';
    this.key = key;
    this.vars = vars;
    this.exitCode = options.exitCode ?? ExitCode.GENERAL;
    this.code = options.code ?? 'error';
    this.hint = options.hint;
    this.details = options.details;
  }
}

/** Non-2xx answer from the BladeCP API. */
export class ApiError extends Error {
  readonly status: number;
  readonly apiCode: string | undefined;
  readonly apiMessage: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    apiCode: string | undefined,
    apiMessage: string | undefined,
    retryAfterSeconds?: number,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.apiCode = apiCode;
    this.apiMessage = apiMessage;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The request never produced an HTTP answer (DNS, TLS, reset, timeout). */
export class NetworkError extends Error {
  readonly host: string;

  constructor(host: string, cause?: unknown) {
    super(`Network error while contacting ${host}`, { cause });
    this.name = 'NetworkError';
    this.host = host;
  }
}

/** The user pressed Ctrl+C (or the run was aborted). */
export class InterruptedError extends Error {
  constructor() {
    super('Interrupted');
    this.name = 'InterruptedError';
  }
}

export function isAbortLike(error: unknown): boolean {
  return (
    error instanceof InterruptedError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}

export interface DescribedError {
  key: MessageKey;
  vars: Vars;
  exitCode: ExitCodeValue;
  code: string;
  hint?: { key: MessageKey; vars?: Vars };
  status?: number;
  apiCode?: string;
}

const PHASE_IN_MESSAGE = /phase '([a-z_]+)'/;

/** Maps an API failure to a translated message, a stable code and an exit code. */
export function describeApiError(error: ApiError): DescribedError {
  const { status, apiCode } = error;
  const base = { status, ...(apiCode ? { apiCode } : {}) };
  const apiMessage = error.apiMessage ?? '';
  // `{url}` in key hints is filled with the Hub API keys page by the reporter.
  const keyHint = { key: 'hint.newKey' as const };

  if (status === 401) {
    const expired = apiCode === 'api_key_expired';
    return {
      ...base,
      key: expired ? 'error.keyExpired' : 'error.unauthorized',
      vars: {},
      exitCode: ExitCode.AUTH,
      code: expired ? 'api_key_expired' : 'unauthorized',
      hint: keyHint,
    };
  }
  if (status === 403) {
    switch (apiCode) {
      case 'COMMERCE_RESTRICTED':
        return {
          ...base,
          key: 'error.commerceRestricted',
          vars: {},
          exitCode: ExitCode.FORBIDDEN,
          code: 'commerce_restricted',
        };
      case 'insufficient_scope':
      case 'restricted_scope':
        return {
          ...base,
          key: 'error.insufficientScope',
          vars: {},
          exitCode: ExitCode.FORBIDDEN,
          code: 'insufficient_scope',
          hint: keyHint,
        };
      case 'KEY_BOUND_TO_MIGRATION':
        return {
          ...base,
          key: 'error.keyBoundToMigration',
          vars: {},
          exitCode: ExitCode.FORBIDDEN,
          code: 'key_bound_to_migration',
          hint: keyHint,
        };
      case 'environment_mismatch':
        return {
          ...base,
          key: 'error.environmentMismatch',
          vars: {},
          exitCode: ExitCode.FORBIDDEN,
          code: 'environment_mismatch',
        };
      default:
        return {
          ...base,
          key: 'error.forbidden',
          vars: {},
          exitCode: ExitCode.FORBIDDEN,
          code: 'forbidden',
        };
    }
  }
  if (status === 404) {
    return {
      ...base,
      key: 'error.notFound',
      vars: {},
      exitCode: ExitCode.NOT_FOUND,
      code: 'not_found',
    };
  }
  if (status === 429 && apiCode === 'daily_quota_exceeded') {
    return {
      ...base,
      key: 'error.dailyQuota',
      vars: {},
      exitCode: ExitCode.RATE_LIMITED,
      code: 'daily_quota_exceeded',
    };
  }
  if (status === 429) {
    return {
      ...base,
      key: 'error.rateLimited',
      vars: { seconds: error.retryAfterSeconds ?? 60 },
      exitCode: ExitCode.RATE_LIMITED,
      code: 'rate_limited',
    };
  }
  if (status === 400 || status === 409 || status === 422) {
    const rejected = (key: MessageKey, code: string, vars: Vars = {}): DescribedError => ({
      ...base,
      key,
      vars,
      exitCode: ExitCode.REJECTED,
      code,
    });
    switch (apiCode) {
      case 'invalid_grant':
        return { ...rejected('error.invalidGrant', 'invalid_grant'), exitCode: ExitCode.AUTH };
      case 'api_key_cap_reached':
        return {
          ...rejected('error.apiKeyCapReached', 'api_key_cap_reached'),
          exitCode: ExitCode.AUTH,
        };
      case 'MIGRATION_DESTINATION_UNAVAILABLE':
        return {
          ...rejected('error.destinationUnavailable', 'destination_unavailable'),
          hint: { key: 'hint.destinations' },
        };
      case 'MIGRATION_DOMAIN_UNAVAILABLE':
        return rejected('error.domainUnavailable', 'domain_unavailable');
      case 'MIGRATION_UPLOAD_NOT_ALLOWED':
        return rejected('error.uploadNotAllowed', 'upload_not_allowed');
      case 'MIGRATION_DISCOVERY_REVIEW_UNAVAILABLE':
        return rejected('error.reviewUnavailable', 'review_unavailable');
      case 'MIGRATION_DISCOVERY_CHOICE_CONFLICT':
        return rejected('error.reviewConflict', 'review_conflict');
      case 'MIGRATION_RETRY_UNAVAILABLE':
        return rejected('error.retryUnavailable', 'retry_unavailable');
      case 'MIGRATION_BACKUP_UNAVAILABLE':
        return rejected('error.backupUnavailable', 'backup_unavailable');
      case 'idempotency_key_reused':
      case 'IDEMPOTENCY_KEY_REUSED':
        return rejected('error.idempotencyConflict', 'idempotency_conflict');
      default: {
        const phase = PHASE_IN_MESSAGE.exec(apiMessage)?.[1];
        if (status === 409 && phase) {
          return rejected('error.phaseConflict', 'phase_conflict', { phase });
        }
        const fallback =
          status === 409 ? 'conflict' : status === 422 ? 'unprocessable' : 'invalid_request';
        return rejected(
          'error.rejected',
          apiCode === 'invalid_request' ? 'invalid_request' : fallback,
          {
            status,
            message: apiMessage || `HTTP ${status}`,
          },
        );
      }
    }
  }
  if (
    status === 503 &&
    (apiCode === 'MIGRATION_DISCOVERY_REVIEW_PENDING' ||
      apiCode === 'MIGRATION_RETRY_DISPATCH_PENDING')
  ) {
    return {
      ...base,
      key: 'error.tryAgainShortly',
      vars: {},
      exitCode: ExitCode.NETWORK,
      code: 'try_again',
    };
  }
  return {
    ...base,
    key: 'error.server',
    vars: { status },
    exitCode: status >= 500 ? ExitCode.NETWORK : ExitCode.GENERAL,
    code: status >= 500 ? 'server_error' : 'http_error',
  };
}
