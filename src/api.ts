import { ApiError, CliError, ExitCode, InterruptedError, NetworkError } from './errors.js';
import type {
  CompleteUploadResponse,
  ConnectTokenResponse,
  CreatedMigration,
  Destination,
  MeData,
  Migration,
  PhaseResponse,
  Provision,
  RetryResponse,
  UploadUrlResponse,
  UsageData,
} from './types.js';
import { isNewerVersion } from './version.js';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Response header the API may send with the oldest CLI version it accepts. */
export const MIN_VERSION_HEADER = 'BladeCP-Min-CLI-Version';

export interface RetryNotice {
  /** The attempt about to start (2 for the first retry). */
  attempt: number;
  /** Total attempts, counting the first. */
  of: number;
  seconds: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  fetch: FetchLike;
  sleep: Sleep;
  userAgent: string;
  /** Version of this CLI, compared with the minimum the API asks for. */
  cliVersion?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Called before waiting out a 429 so the UI can say why it paused. */
  onRateLimited?: ((seconds: number) => void) | undefined;
  /** Called before repeating a request after a network or server failure. */
  onRetry?: ((notice: RetryNotice) => void) | undefined;
  /** One line per request for `--debug` (never headers, never the key). */
  onDebug?: ((line: string) => void) | undefined;
  /** How many 429 answers to wait out before giving up. */
  maxRateLimitRetries?: number;
  /** How many network/5xx failures to retry for safe requests. */
  maxTransientRetries?: number;
  /** Base delay for transient retries, doubled each time. */
  retryBaseMs?: number;
}

/** `safe` requests may be repeated after a network or 5xx failure. */
type RetryPolicy = 'safe' | 'once';

interface CallOptions {
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  retry?: RetryPolicy;
  timeoutMs?: number;
}

const MAX_RATE_LIMIT_WAIT_SECONDS = 120;

export function parseRetryAfter(
  header: string | null,
  bodySeconds: unknown,
  now: number = Date.now(),
): number | undefined {
  if (header) {
    const trimmed = header.trim();
    if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
  }
  if (typeof bodySeconds === 'number' && Number.isFinite(bodySeconds)) {
    return Math.max(0, Math.ceil(bodySeconds));
  }
  return undefined;
}

/** Combines abort signals without relying on `AbortSignal.any` (Node 20.3+). */
function linkSignals(signals: (AbortSignal | undefined)[]): {
  signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const listeners: [AbortSignal, () => void][] = [];
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    listeners.push([signal, onAbort]);
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
    },
  };
}

function errorFields(body: unknown): { code?: string; message?: string; retryAfter?: unknown } {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : undefined;
  let code = typeof record.code === 'string' ? record.code : undefined;
  if (!code && typeof record.error === 'string') code = record.error;
  // Several migration routes put a stable UPPER_SNAKE code in `message`.
  if (!code && message && /^[A-Z][A-Z0-9_]+$/.test(message)) code = message;
  return { code, message, retryAfter: record.retry_after_seconds };
}

/** The API answered with something that does not follow its contract. */
export function invalidResponse(): CliError {
  return new CliError(
    'error.invalidResponse',
    {},
    { exitCode: ExitCode.GENERAL, code: 'invalid_response' },
  );
}

function updateRequired(current: string, minimum: string): CliError {
  return new CliError(
    'error.updateRequired',
    { current, minimum },
    { exitCode: ExitCode.UPDATE_REQUIRED, code: 'update_required', hint: { key: 'hint.update' } },
  );
}

export class ApiClient {
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  get hasKey(): boolean {
    return Boolean(this.options.apiKey);
  }

  async call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: CallOptions = {},
  ): Promise<T> {
    const {
      fetch,
      sleep,
      signal: outer,
      maxRateLimitRetries = 3,
      maxTransientRetries = 3,
      retryBaseMs = 1000,
    } = this.options;
    const url = `${this.options.baseUrl}/api/v1${path}`;
    const host = new URL(url).host;
    const retry: RetryPolicy = options.retry ?? (method === 'GET' ? 'safe' : 'once');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.options.userAgent,
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth !== false && this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    const debug = this.options.onDebug;
    const retryLater = async (seconds: number, attempt: number) => {
      this.options.onRetry?.({ attempt: attempt + 2, of: maxTransientRetries + 1, seconds });
      await sleep(seconds * 1000, outer);
    };

    let rateLimitRetries = 0;
    let transientRetries = 0;
    for (;;) {
      if (outer?.aborted) throw new InterruptedError();
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 30_000);
      const linked = linkSignals([outer, timeout.signal]);
      const started = Date.now();
      let response: Response;
      let text: string;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: linked.signal,
          redirect: 'error',
        });
        text = await response.text();
      } catch (error) {
        if (outer?.aborted) throw new InterruptedError();
        const failure = new NetworkError(host, error);
        debug?.(`${method} ${path} -> ${failure.systemCode ?? 'NETWORK'}`);
        if (retry === 'safe' && transientRetries < maxTransientRetries) {
          await retryLater((retryBaseMs * 2 ** transientRetries) / 1000, transientRetries);
          transientRetries += 1;
          continue;
        }
        throw failure;
      } finally {
        clearTimeout(timer);
        linked.dispose();
      }
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('cf-ray');
      debug?.(
        `${method} ${path} -> ${response.status} (${Date.now() - started} ms${requestId ? `, ${requestId}` : ''})`,
      );

      const minimum = response.headers.get(MIN_VERSION_HEADER)?.trim();
      const current = this.options.cliVersion;
      if (current && minimum && isNewerVersion(minimum, current)) {
        throw updateRequired(current, minimum);
      }
      if (response.status === 426) throw updateRequired(current ?? '0.0.0', minimum || '?');

      let body: unknown;
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
      }

      if (response.status === 429) {
        const fields = errorFields(body);
        const wait = parseRetryAfter(response.headers.get('retry-after'), fields.retryAfter) ?? 5;
        // A daily quota resets in hours: waiting here would only look stuck.
        const daily = fields.code === 'daily_quota_exceeded';
        if (
          !daily &&
          rateLimitRetries < maxRateLimitRetries &&
          wait <= MAX_RATE_LIMIT_WAIT_SECONDS
        ) {
          rateLimitRetries += 1;
          this.options.onRateLimited?.(wait);
          await sleep(wait * 1000, outer);
          continue;
        }
        throw new ApiError(429, fields.code ?? 'rate_limited', fields.message, wait);
      }

      if (
        response.status >= 500 &&
        response.status !== 501 &&
        retry === 'safe' &&
        transientRetries < maxTransientRetries
      ) {
        await retryLater((retryBaseMs * 2 ** transientRetries) / 1000, transientRetries);
        transientRetries += 1;
        continue;
      }

      if (!response.ok) {
        const fields = errorFields(body);
        throw new ApiError(response.status, fields.code, fields.message);
      }
      // A success that is not JSON (a maintenance page, a cut answer).
      if (body === undefined) throw invalidResponse();
      return body as T;
    }
  }
}

// -------------------------------------------------------------- validation

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `data` member of an answer, which must be an object. */
function dataObject(body: unknown): Json {
  if (!isRecord(body) || !isRecord(body.data)) throw invalidResponse();
  return body.data;
}

/** The `data` member of an answer, which must be a list of objects. */
function dataList(body: unknown): Json[] {
  if (!isRecord(body) || !Array.isArray(body.data)) throw invalidResponse();
  if (!body.data.every(isRecord)) throw invalidResponse();
  return body.data as Json[];
}

function requireStrings(record: Json, fields: string[]): void {
  for (const field of fields) {
    if (typeof record[field] !== 'string' || record[field] === '') throw invalidResponse();
  }
}

/** `primary_domain` (documented) or `primaryDomain` (what some API versions send). */
export function provisionDomain(p: Provision): string | null {
  const snake = p.primary_domain;
  if (typeof snake === 'string' && snake !== '') return snake;
  const camel = (p as { primaryDomain?: unknown }).primaryDomain;
  return typeof camel === 'string' && camel !== '' ? camel : null;
}

/** `product_type` or `productType`. */
export function provisionProduct(p: Provision): string | null {
  const snake = p.product_type;
  if (typeof snake === 'string' && snake !== '') return snake;
  const camel = (p as { productType?: unknown }).productType;
  return typeof camel === 'string' && camel !== '' ? camel : null;
}

function checkProvision(p: Json): Provision {
  requireStrings(p, ['uuid']);
  if (p.status !== undefined && p.status !== null && typeof p.status !== 'string')
    throw invalidResponse();
  return p as unknown as Provision;
}

function checkMigration(m: Json): Migration {
  requireStrings(m, ['uuid', 'phase']);
  if (m.components !== undefined && m.components !== null) {
    if (!Array.isArray(m.components) || !m.components.every(isRecord)) throw invalidResponse();
  }
  return m as unknown as Migration;
}

function checkDestination(d: unknown): Destination {
  if (!isRecord(d)) throw invalidResponse();
  if (typeof d.partnerPlanId !== 'number' || typeof d.planName !== 'string')
    throw invalidResponse();
  if (!Array.isArray(d.locations)) throw invalidResponse();
  for (const location of d.locations) {
    if (!isRecord(location) || typeof location.locationId !== 'number') throw invalidResponse();
    if (typeof location.name !== 'string') throw invalidResponse();
  }
  if (d.prices !== undefined && d.prices !== null && !Array.isArray(d.prices))
    throw invalidResponse();
  return d as unknown as Destination;
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

/** Typed Customer API calls used by the CLI. Answers are checked before use. */
export class BladecpApi {
  constructor(readonly client: ApiClient) {}

  async me(): Promise<MeData> {
    const data = dataObject(await this.client.call('GET', '/customer/me'));
    requireStrings(data, ['customer_uuid', 'customer_email', 'api_key_uuid']);
    const scopes = Array.isArray(data.scopes)
      ? data.scopes.filter((s): s is string => typeof s === 'string')
      : [];
    const rate = isRecord(data.rate_limit) ? data.rate_limit : null;
    return {
      ...(data as unknown as MeData),
      scopes,
      tier: typeof data.tier === 'string' ? data.tier : '',
      rate_limit: {
        tier:
          typeof rate?.tier === 'string'
            ? rate.tier
            : typeof data.tier === 'string'
              ? data.tier
              : '',
        limit_per_minute: typeof rate?.limit_per_minute === 'number' ? rate.limit_per_minute : null,
      },
    };
  }

  async listProvisions(): Promise<Provision[]> {
    return dataList(await this.client.call('GET', '/customer/provisions')).map(checkProvision);
  }

  async getProvision(uuid: string): Promise<Provision> {
    return checkProvision(
      dataObject(await this.client.call('GET', `/customer/provisions/${seg(uuid)}`)),
    );
  }

  async getProvisionUsage(uuid: string): Promise<UsageData> {
    const data = dataObject(
      await this.client.call('GET', `/customer/provisions/${seg(uuid)}/usage`),
    );
    for (const field of ['plan', 'usage'] as const) {
      if (data[field] !== undefined && data[field] !== null && !isRecord(data[field]))
        throw invalidResponse();
    }
    return data as unknown as UsageData;
  }

  /** `currency` narrows plans and prices to one currency, like the Hub selector. */
  async listDestinations(currency?: string): Promise<Destination[]> {
    const query = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const data = dataObject(
      await this.client.call('GET', `/customer/me/migration-destinations${query}`),
    );
    if (!Array.isArray(data.destinations)) throw invalidResponse();
    return data.destinations.map(checkDestination);
  }

  async listMigrations(): Promise<Migration[]> {
    return dataList(await this.client.call('GET', '/customer/me/migrations')).map(checkMigration);
  }

  async getMigration(uuid: string): Promise<Migration> {
    return checkMigration(
      dataObject(await this.client.call('GET', `/customer/me/migrations/${seg(uuid)}`)),
    );
  }

  async createMigration(
    body: {
      sourcePanel: 'cpanel';
      primaryDomain?: string;
      partnerPlanId: number;
      locationId: number;
    },
    idempotencyKey: string,
  ): Promise<CreatedMigration> {
    const data = dataObject(
      await this.client.call('POST', '/customer/me/migrations', {
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
        // The idempotency key makes a repeated create return the same migration.
        retry: 'safe',
      }),
    );
    requireStrings(data, ['migrationUuid']);
    return data as unknown as CreatedMigration;
  }

  async requestUploadUrls(
    uuid: string,
    body: { sizeBytes: number; filename?: string; resume?: boolean },
  ): Promise<UploadUrlResponse> {
    return dataObject(
      await this.client.call('POST', `/customer/me/migrations/${seg(uuid)}/upload-url`, {
        body,
        retry: 'safe',
        timeoutMs: 60_000,
      }),
    ) as unknown as UploadUrlResponse;
  }

  async completeUpload(
    uuid: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<CompleteUploadResponse> {
    return dataObject(
      await this.client.call('POST', `/customer/me/migrations/${seg(uuid)}/complete-upload`, {
        body: { parts },
        retry: 'safe',
        // Assembling hundreds of parts can take a while on the storage side.
        timeoutMs: 300_000,
      }),
    ) as unknown as CompleteUploadResponse;
  }

  private async phaseCall(path: string, options: CallOptions = {}): Promise<PhaseResponse> {
    const data = dataObject(await this.client.call('POST', path, options));
    return { ...data, phase: typeof data.phase === 'string' ? data.phase : '' } as PhaseResponse;
  }

  confirmUpload(uuid: string): Promise<PhaseResponse> {
    return this.phaseCall(`/customer/me/migrations/${seg(uuid)}/confirm-upload`, {
      retry: 'safe',
    });
  }

  reviewDiscovery(uuid: string, primaryDomain: string): Promise<PhaseResponse> {
    return this.phaseCall(`/customer/me/migrations/${seg(uuid)}/discovery-review`, {
      body: { primaryDomain },
      retry: 'safe',
    });
  }

  approve(uuid: string): Promise<PhaseResponse> {
    return this.phaseCall(`/customer/me/migrations/${seg(uuid)}/approve`);
  }

  cancel(uuid: string, reason?: string): Promise<PhaseResponse> {
    return this.phaseCall(`/customer/me/migrations/${seg(uuid)}/cancel`, {
      body: reason ? { reason } : {},
    });
  }

  async retry(uuid: string): Promise<RetryResponse> {
    const data = dataObject(
      await this.client.call('POST', `/customer/me/migrations/${seg(uuid)}/retry`),
    );
    requireStrings(data, ['migrationUuid']);
    return data as unknown as RetryResponse;
  }

  async exchangeConnectCode(body: {
    client: 'cli';
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<ConnectTokenResponse> {
    const data = dataObject(
      await this.client.call('POST', '/customer/connect/token', { body, auth: false }),
    );
    if (typeof data.apiKey !== 'string') throw invalidResponse();
    return data as unknown as ConnectTokenResponse;
  }
}
