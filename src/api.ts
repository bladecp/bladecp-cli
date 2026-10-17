import { ApiError, InterruptedError, NetworkError } from './errors.js';
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

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface ApiClientOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  fetch: FetchLike;
  sleep: Sleep;
  userAgent: string;
  signal?: AbortSignal | undefined;
  /** Called before waiting out a 429 so the UI can say why it paused. */
  onRateLimited?: ((seconds: number) => void) | undefined;
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

    let rateLimitRetries = 0;
    let transientRetries = 0;
    for (;;) {
      if (outer?.aborted) throw new InterruptedError();
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 30_000);
      const linked = linkSignals([outer, timeout.signal]);
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
        if (retry === 'safe' && transientRetries < maxTransientRetries) {
          await sleep(retryBaseMs * 2 ** transientRetries, outer);
          transientRetries += 1;
          continue;
        }
        throw new NetworkError(host, error);
      } finally {
        clearTimeout(timer);
        linked.dispose();
      }

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
        await sleep(retryBaseMs * 2 ** transientRetries, outer);
        transientRetries += 1;
        continue;
      }

      if (!response.ok) {
        const fields = errorFields(body);
        throw new ApiError(response.status, fields.code, fields.message);
      }
      if (body === undefined) {
        throw new ApiError(
          response.status,
          'invalid_response',
          'The API answered with an unexpected body',
        );
      }
      return body as T;
    }
  }
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function unwrap<T>(body: { data: T }): T {
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new ApiError(200, 'invalid_response', 'The API answered with an unexpected body');
  }
  return body.data;
}

/** Typed Customer API calls used by the CLI. */
export class BladecpApi {
  constructor(readonly client: ApiClient) {}

  async me(): Promise<MeData> {
    return unwrap(await this.client.call<{ data: MeData }>('GET', '/customer/me'));
  }

  async listProvisions(): Promise<Provision[]> {
    return unwrap(await this.client.call<{ data: Provision[] }>('GET', '/customer/provisions'));
  }

  async getProvision(uuid: string): Promise<Provision> {
    return unwrap(
      await this.client.call<{ data: Provision }>('GET', `/customer/provisions/${seg(uuid)}`),
    );
  }

  async getProvisionUsage(uuid: string): Promise<UsageData> {
    return unwrap(
      await this.client.call<{ data: UsageData }>('GET', `/customer/provisions/${seg(uuid)}/usage`),
    );
  }

  /** `currency` narrows plans and prices to one currency, like the Hub selector. */
  async listDestinations(currency?: string): Promise<Destination[]> {
    const query = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const body = await this.client.call<{ data?: { destinations?: Destination[] } }>(
      'GET',
      `/customer/me/migration-destinations${query}`,
    );
    const list = body.data?.destinations;
    if (!Array.isArray(list)) {
      throw new ApiError(200, 'invalid_response', 'The API answered with an unexpected body');
    }
    return list;
  }

  async listMigrations(): Promise<Migration[]> {
    return unwrap(await this.client.call<{ data: Migration[] }>('GET', '/customer/me/migrations'));
  }

  async getMigration(uuid: string): Promise<Migration> {
    return unwrap(
      await this.client.call<{ data: Migration }>('GET', `/customer/me/migrations/${seg(uuid)}`),
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
    return unwrap(
      await this.client.call<{ data: CreatedMigration }>('POST', '/customer/me/migrations', {
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
        // The idempotency key makes a repeated create return the same migration.
        retry: 'safe',
      }),
    );
  }

  async requestUploadUrls(
    uuid: string,
    body: { sizeBytes: number; filename?: string; resume?: boolean },
  ): Promise<UploadUrlResponse> {
    return unwrap(
      await this.client.call<{ data: UploadUrlResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/upload-url`,
        {
          body,
          retry: 'safe',
          timeoutMs: 60_000,
        },
      ),
    );
  }

  async completeUpload(
    uuid: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<CompleteUploadResponse> {
    return unwrap(
      await this.client.call<{ data: CompleteUploadResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/complete-upload`,
        // Assembling hundreds of parts can take a while on the storage side.
        { body: { parts }, retry: 'safe', timeoutMs: 300_000 },
      ),
    );
  }

  async confirmUpload(uuid: string): Promise<PhaseResponse> {
    return unwrap(
      await this.client.call<{ data: PhaseResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/confirm-upload`,
        {
          retry: 'safe',
        },
      ),
    );
  }

  async reviewDiscovery(uuid: string, primaryDomain: string): Promise<PhaseResponse> {
    return unwrap(
      await this.client.call<{ data: PhaseResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/discovery-review`,
        {
          body: { primaryDomain },
          retry: 'safe',
        },
      ),
    );
  }

  async approve(uuid: string): Promise<PhaseResponse> {
    return unwrap(
      await this.client.call<{ data: PhaseResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/approve`,
      ),
    );
  }

  async cancel(uuid: string, reason?: string): Promise<PhaseResponse> {
    return unwrap(
      await this.client.call<{ data: PhaseResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/cancel`,
        {
          body: reason ? { reason } : {},
        },
      ),
    );
  }

  async retry(uuid: string): Promise<RetryResponse> {
    return unwrap(
      await this.client.call<{ data: RetryResponse }>(
        'POST',
        `/customer/me/migrations/${seg(uuid)}/retry`,
      ),
    );
  }

  async exchangeConnectCode(body: {
    client: 'cli';
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<ConnectTokenResponse> {
    return unwrap(
      await this.client.call<{ data: ConnectTokenResponse }>('POST', '/customer/connect/token', {
        body,
        auth: false,
      }),
    );
  }
}
