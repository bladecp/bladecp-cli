import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Destination, MeData, Migration, Provision, UsageData } from '../../src/types.js';

export const LIVE_KEY = 'bcp_live_TESTKEY0123456789ABCDEFGHIJKLMNOP';
export const OTHER_KEY = 'bcp_live_OTHERKEY987654321ZYXWVUTSRQPONML';
export const ISSUED_KEY = 'bcp_live_ISSUEDKEY55555555555555555555555';
export const EXPIRED_KEY = 'bcp_live_EXPIREDKEY4444444444444444444444';

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface Failure {
  method?: string;
  path: RegExp;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  times: number;
}

interface MockUpload {
  uploadId: string;
  sizeBytes: number;
  parts: Map<number, { etag: string; sizeBytes: number }>;
  open: boolean;
}

interface MockMigration extends Migration {
  idempotencyKey?: string;
  upload?: MockUpload;
  backupComplete: boolean;
  scriptIndex: number;
  /** Polls spent in discovery_review after the domain was chosen. */
  reviewWaitPolls?: number;
}

const md5 = (data: Buffer) => createHash('md5').update(data).digest('hex');

export function s256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export class MockApi {
  server!: Server;
  baseUrl = '';
  requests: RecordedRequest[] = [];
  failures: Failure[] = [];
  /** Per part number, statuses to answer before accepting the part. */
  partFailures = new Map<number, number[]>();
  validKeys = new Set<string>([LIVE_KEY, OTHER_KEY, ISSUED_KEY]);
  partSize = 64;
  supportsResume = true;
  /** Phases a confirmed migration walks through, one per GET. */
  phaseScript: string[] = [
    'parsing',
    'discovery_review',
    'provisioning',
    'importing',
    'validating',
    'awaiting_approval',
  ];
  failureMessage = 'Backup could not be imported';
  /** A record address the API returns once a migration is complete. */
  cutoverTarget: string | null = '203.0.113.10';
  connectCodes = new Map<string, { challenge: string; redirectUri: string; used: boolean }>();
  /** When set, the fake Hub answers the connect page with this callback query instead. */
  hubOverride: ((params: URLSearchParams) => string) | null = null;
  migrations = new Map<string, MockMigration>();
  private uploadCounter = 0;
  private migrationCounter = 0;

  me: MeData = {
    customer_uuid: '01970000-0000-7000-8000-000000000001',
    customer_email: 'owner@example.com',
    api_key_uuid: '01970000-0000-7000-8000-0000000000aa',
    scopes: ['customer:read', 'provisions:read', 'migrations:read', 'migrations:write'],
    tier: 'default',
    rate_limit: { tier: 'default', limit_per_minute: 60 },
  };

  provisions: Provision[] = [
    {
      uuid: '01970000-0000-7000-8000-00000000s001',
      status: 'active',
      primary_domain: 'example.com',
      product_type: 'stack-container',
      activation_mode: 'auto',
    },
    {
      uuid: '01970000-0000-7000-8000-00000000s002',
      status: 'pending',
      primary_domain: 'shop.example.org',
      product_type: 'edge-cloud',
      activation_mode: 'auto',
    },
  ];

  usage: Record<string, UsageData> = {
    '01970000-0000-7000-8000-00000000s001': {
      provisionUuid: '01970000-0000-7000-8000-00000000s001',
      plan: { diskGb: 20, bandwidthGbMonth: null, emailAccounts: 10, sqlDatabases: 5 },
      usage: { diskGb: 3.25, bandwidthGbMonth: 12.5, emailAccounts: 2, sqlDatabases: 1 },
      status: 'healthy',
      asOf: '2026-10-01T12:00:00.000Z',
    },
  };

  destinations: Destination[] = [
    {
      partnerUuid: '01970000-0000-7000-8000-0000000000p1',
      partnerName: 'BladeCP',
      partnerPlanId: 12,
      planName: 'Stack Container S',
      diskGb: 20,
      prices: [
        { currency: 'BRL', priceMonthly: 49 },
        { currency: 'USD', priceMonthly: 9 },
      ],
      locations: [
        {
          locationId: 3,
          name: 'Sao Paulo',
          countryCode: 'BR',
          city: 'Sao Paulo',
          region: 'sa-east',
        },
      ],
    },
  ];
  /** Answer the token exchange with 409 api_key_cap_reached. */
  keyCapReached = false;
  /** Polls a migration stays in discovery_review after the domain is chosen. */
  reviewResumeAfterPolls = 2;
  /** Make the engine pause for the domain even when one was given at creation. */
  pauseWithDomain = false;
  /** Number of review requests answered with 503 MIGRATION_DISCOVERY_REVIEW_PENDING. */
  reviewPublishFailures = 0;

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: String(error) }));
      });
    });
    await new Promise<void>((resolve) =>
      this.server.listen({ host: '127.0.0.1', port: 0 }, resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  fail(failure: Omit<Failure, 'times'> & { times?: number }): void {
    this.failures.push({ times: 1, ...failure });
  }

  apiCalls(method?: string, path?: RegExp): RecordedRequest[] {
    return this.requests.filter(
      (r) =>
        r.path.startsWith('/api/') &&
        (!method || r.method === method) &&
        (!path || path.test(r.path)),
    );
  }

  partPuts(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/s3/'));
  }

  addMigration(partial: Partial<MockMigration> & { uuid: string; phase: string }): MockMigration {
    const m: MockMigration = {
      primaryDomain: null,
      requestedPrimaryDomain: null,
      sourcePrimaryDomain: null,
      components: null,
      stagingUrl: null,
      message: null,
      reason: null,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
      backupComplete: false,
      scriptIndex: 0,
      ...partial,
    };
    this.migrations.set(m.uuid, m);
    return m;
  }

  private present(m: MockMigration): Migration {
    const {
      idempotencyKey: _k,
      upload: _u,
      backupComplete: _b,
      scriptIndex: _s,
      reviewWaitPolls: _w,
      ...rest
    } = m;
    // Public projection of the Customer API: no internal storage keys, plus
    // a boolean telling whether the whole backup is stored.
    return {
      ...rest,
      sourcePanel: 'cpanel',
      backupReady: m.backupComplete,
      timing: null,
      retry: {
        allowed: m.phase === 'failed',
        reason: m.phase === 'failed' ? null : 'not_failed',
        migrationUuid: null,
        published: false,
      },
    };
  }

  private advance(m: MockMigration): void {
    const active = ['queued', ...this.phaseScript];
    if (!active.includes(m.phase) || m.phase === 'awaiting_approval') return;
    if (m.phase === 'discovery_review') {
      // Unanswered: waits for the customer. Answered: stays a few polls
      // until the engine resumes, like the real worker.
      if (!m.primaryDomain) return;
      m.reviewWaitPolls = (m.reviewWaitPolls ?? 0) + 1;
      if (m.reviewWaitPolls <= this.reviewResumeAfterPolls) return;
    }
    if (m.scriptIndex >= this.phaseScript.length) return;
    let next = this.phaseScript[m.scriptIndex]!;
    m.scriptIndex += 1;
    // The engine only pauses for the domain when none was given at creation.
    if (next === 'discovery_review' && m.primaryDomain && !this.pauseWithDomain) {
      if (m.scriptIndex >= this.phaseScript.length) return;
      next = this.phaseScript[m.scriptIndex]!;
      m.scriptIndex += 1;
    }
    m.phase = next;
    if (next === 'discovery_review') {
      m.sourcePrimaryDomain = m.sourcePrimaryDomain ?? 'old-site.example.com';
    }
    if (next === 'provisioning') {
      m.primaryDomain = m.primaryDomain ?? m.sourcePrimaryDomain ?? null;
    }
    if (next === 'importing') {
      m.components = [
        { name: 'files', status: 'running' },
        { name: 'database', status: 'pending' },
        { name: 'email_accounts', status: 'skipped' },
      ];
    }
    if (next === 'validating' || next === 'awaiting_approval') {
      m.components = [
        { name: 'files', status: 'completed' },
        { name: 'database', status: 'completed' },
        { name: 'email_accounts', status: 'skipped' },
      ];
    }
    if (next === 'awaiting_approval') {
      m.stagingUrl = `https://${m.uuid}.preview.example.net/`;
    }
    if (next === 'failed') {
      m.message = this.failureMessage;
    }
    if (next === 'cutover_pending' || next === 'cutover_stalled') {
      m.cutoverTarget = this.cutoverTarget;
    }
  }

  private async readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private json(
    res: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const method = req.method ?? 'GET';
    const raw = await this.readBody(req);
    let body: unknown = null;
    if (method !== 'PUT' && raw.length > 0) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        body = raw.toString('utf8');
      }
    }
    this.requests.push({
      method,
      path: url.pathname,
      search: url.search,
      headers: req.headers,
      body: method === 'PUT' ? raw.length : body,
    });

    // Fake Hub connect page: approves immediately and redirects back.
    if (url.pathname === '/connect' && method === 'GET') {
      const params = url.searchParams;
      const redirectUri = params.get('redirect_uri') ?? '';
      const query = this.hubOverride
        ? this.hubOverride(params)
        : (() => {
            const code = `code-${this.connectCodes.size + 1}`;
            this.connectCodes.set(code, {
              challenge: params.get('code_challenge') ?? '',
              redirectUri,
              used: false,
            });
            return `code=${code}&state=${encodeURIComponent(params.get('state') ?? '')}`;
          })();
      res.writeHead(302, { Location: `${redirectUri}?${query}` });
      res.end();
      return;
    }

    // Object storage presigned PUT.
    const put = /^\/s3\/([^/]+)\/(\d+)$/.exec(url.pathname);
    if (put && method === 'PUT') {
      const partNumber = Number(put[2]);
      const queued = this.partFailures.get(partNumber);
      if (queued && queued.length > 0) {
        const status = queued.shift()!;
        res.writeHead(status, { 'Content-Type': 'application/xml' });
        res.end(
          status === 403
            ? '<Error><Code>AccessDenied</Code>Request has expired</Error>'
            : '<Error/>',
        );
        return;
      }
      const upload = [...this.migrations.values()]
        .map((m) => m.upload)
        .find((u) => u?.uploadId === put[1]);
      if (!upload?.open) {
        res.writeHead(404);
        res.end('<Error><Code>NoSuchUpload</Code></Error>');
        return;
      }
      if (Number(req.headers['content-length']) !== raw.length) {
        res.writeHead(400);
        res.end('<Error><Code>IncompleteBody</Code></Error>');
        return;
      }
      const etag = `"${md5(raw)}"`;
      upload.parts.set(partNumber, { etag, sizeBytes: raw.length });
      res.writeHead(200, { ETag: etag });
      res.end();
      return;
    }

    if (!url.pathname.startsWith('/api/v1/')) {
      this.json(res, 404, { error: true, message: 'Not found' });
      return;
    }
    const path = url.pathname.slice('/api/v1'.length);

    // Public token exchange.
    if (path === '/customer/connect/token' && method === 'POST') {
      const input = body as {
        client?: string;
        code?: string;
        codeVerifier?: string;
        redirectUri?: string;
      };
      if (
        !input ||
        typeof input !== 'object' ||
        !input.code ||
        !input.codeVerifier ||
        !input.redirectUri
      ) {
        this.json(res, 400, { error: true, message: 'Invalid request', code: 'invalid_request' });
        return;
      }
      const entry = this.connectCodes.get(input.code);
      if (
        !entry ||
        entry.used ||
        input.client !== 'cli' ||
        entry.redirectUri !== input.redirectUri ||
        s256(input.codeVerifier ?? '') !== entry.challenge
      ) {
        this.json(res, 400, { error: true, message: 'Invalid grant', code: 'invalid_grant' });
        return;
      }
      entry.used = true;
      if (this.keyCapReached) {
        this.json(res, 409, {
          error: true,
          message: 'Active key limit reached',
          code: 'api_key_cap_reached',
        });
        return;
      }
      this.json(res, 200, {
        data: {
          apiKey: ISSUED_KEY,
          keyUuid: '01970000-0000-7000-8000-0000000000bb',
          scopes: ['customer:read', 'provisions:read', 'migrations:read', 'migrations:write'],
          expiresAt: '2026-11-14T12:00:00.000Z',
          migrationUuid: null,
          customer: { uuid: this.me.customer_uuid, email: this.me.customer_email, name: 'Owner' },
        },
      });
      return;
    }

    const auth = req.headers.authorization ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (key === EXPIRED_KEY) {
      this.json(res, 401, { error: true, message: 'API key expired', code: 'api_key_expired' });
      return;
    }
    if (!this.validKeys.has(key)) {
      this.json(res, 401, { error: true, message: 'Invalid API key' });
      return;
    }

    const failure = this.failures.find(
      (f) => f.times > 0 && (!f.method || f.method === method) && f.path.test(path),
    );
    if (failure) {
      failure.times -= 1;
      this.json(
        res,
        failure.status,
        failure.body ?? { error: true, message: 'Injected failure' },
        failure.headers,
      );
      return;
    }

    await this.route(method, path, body, res, url.searchParams);
  }

  private async route(
    method: string,
    path: string,
    body: unknown,
    res: ServerResponse,
    query: URLSearchParams,
  ): Promise<void> {
    if (method === 'GET' && path === '/customer/me') return this.json(res, 200, { data: this.me });
    if (method === 'GET' && path === '/customer/provisions')
      return this.json(res, 200, { data: this.provisions });
    let match = /^\/customer\/provisions\/([^/]+)$/.exec(path);
    if (method === 'GET' && match) {
      const p = this.provisions.find((x) => x.uuid === decodeURIComponent(match![1]!));
      return p
        ? this.json(res, 200, { data: p })
        : this.json(res, 404, { error: true, message: 'Not found' });
    }
    match = /^\/customer\/provisions\/([^/]+)\/usage$/.exec(path);
    if (method === 'GET' && match) {
      const u = this.usage[decodeURIComponent(match[1]!)];
      return u
        ? this.json(res, 200, { data: u })
        : this.json(res, 404, { error: true, message: 'Not found' });
    }
    if (method === 'GET' && path === '/customer/me/migration-destinations') {
      const currency = query.get('currency');
      if (currency === null)
        return this.json(res, 200, { data: { destinations: this.destinations } });
      if (!/^[A-Za-z]{3}$/.test(currency)) {
        return this.json(res, 400, { error: true, message: 'Invalid currency' });
      }
      const wanted = currency.toUpperCase();
      const destinations = this.destinations
        .map((d) => ({ ...d, prices: (d.prices ?? []).filter((p) => p.currency === wanted) }))
        .filter((d) => d.prices.length > 0);
      return this.json(res, 200, { data: { destinations } });
    }
    if (method === 'GET' && path === '/customer/me/migrations') {
      return this.json(res, 200, {
        data: [...this.migrations.values()].map((m) => this.present(m)),
      });
    }
    if (method === 'POST' && path === '/customer/me/migrations') {
      return this.create(body as Record<string, unknown>, res);
    }

    match = /^\/customer\/me\/migrations\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
    if (!match) return this.json(res, 404, { error: true, message: 'Not found' });
    const m = this.migrations.get(decodeURIComponent(match[1]!));
    if (!m) return this.json(res, 404, { error: true, message: 'Migration not found' });
    const action = match[2];

    if (method === 'GET' && !action) {
      this.advance(m);
      return this.json(res, 200, { data: this.present(m) });
    }
    if (method !== 'POST') return this.json(res, 404, { error: true, message: 'Not found' });
    const input = (body ?? {}) as Record<string, unknown>;
    switch (action) {
      case 'upload-url':
        return this.uploadUrl(m, input, res);
      case 'complete-upload': {
        const upload = m.upload;
        if (m.phase !== 'uploading') return this.json(res, 200, { data: { phase: m.phase } });
        if (!upload) return this.json(res, 400, { error: true, message: 'No upload in progress' });
        const parts = (input.parts ?? []) as { partNumber: number; etag: string }[];
        const expected = Math.max(1, Math.ceil(upload.sizeBytes / this.partSize));
        const sorted = parts.every((p, i) => i === 0 || parts[i - 1]!.partNumber < p.partNumber);
        const valid =
          sorted &&
          parts.length === expected &&
          parts.every((p) => upload.parts.get(p.partNumber)?.etag === p.etag);
        if (!valid) return this.json(res, 400, { error: true, message: 'InvalidPart' });
        upload.open = false;
        m.backupComplete = true;
        const size = [...upload.parts.values()].reduce((sum, p) => sum + p.sizeBytes, 0);
        return this.json(res, 200, { data: { phase: m.phase, sizeBytes: size } });
      }
      case 'confirm-upload':
        if (m.phase !== 'draft' && m.phase !== 'uploading')
          return this.json(res, 200, { data: { phase: m.phase } });
        if (!m.backupComplete)
          return this.json(res, 400, {
            error: true,
            message: 'Finish the upload before confirming',
          });
        m.phase = 'queued';
        return this.json(res, 200, { data: { phase: 'queued' } });
      case 'discovery-review':
        if (m.phase !== 'discovery_review') {
          return this.json(res, 409, {
            error: true,
            message: 'MIGRATION_DISCOVERY_REVIEW_UNAVAILABLE',
          });
        }
        // Same rules as the API review service.
        if (!m.sourcePrimaryDomain || m.requestedPrimaryDomain !== null) {
          return this.json(res, 409, {
            error: true,
            message: 'MIGRATION_DISCOVERY_REVIEW_UNAVAILABLE',
          });
        }
        if (m.primaryDomain && m.primaryDomain !== input.primaryDomain) {
          return this.json(res, 409, {
            error: true,
            message: 'MIGRATION_DISCOVERY_CHOICE_CONFLICT',
          });
        }
        m.primaryDomain = String(input.primaryDomain);
        if (this.reviewPublishFailures > 0) {
          this.reviewPublishFailures -= 1;
          return this.json(res, 503, {
            error: true,
            message: 'MIGRATION_DISCOVERY_REVIEW_PENDING',
          });
        }
        return this.json(res, 202, { data: { phase: 'discovery_review' } });
      case 'approve':
        if (m.phase !== 'awaiting_approval') {
          return this.json(res, 409, {
            error: true,
            message: `Cannot approve from phase '${m.phase}'`,
          });
        }
        m.phase = 'syncing';
        return this.json(res, 200, { data: { phase: 'syncing' } });
      case 'cancel':
        m.phase = 'cancelled';
        return this.json(res, 200, { data: { phase: 'cancelled' } });
      case 'retry': {
        if (m.phase !== 'failed')
          return this.json(res, 409, { error: true, message: 'MIGRATION_RETRY_UNAVAILABLE' });
        const next = this.addMigration({
          uuid: this.nextUuid(),
          phase: 'queued',
          retryOfMigrationUuid: m.uuid,
        });
        return this.json(res, 202, { data: { migrationUuid: next.uuid, phase: next.phase } });
      }
      default:
        return this.json(res, 404, { error: true, message: 'Not found' });
    }
  }

  nextUuid(): string {
    this.migrationCounter += 1;
    return `01970000-0000-7000-8000-${String(this.migrationCounter).padStart(12, '0')}`;
  }

  private create(input: Record<string, unknown>, res: ServerResponse): void {
    const req = this.requests[this.requests.length - 1]!;
    const key = req.headers['idempotency-key'];
    if (typeof key === 'string') {
      const existing = [...this.migrations.values()].find((m) => m.idempotencyKey === key);
      if (existing)
        return this.json(res, 201, {
          data: { migrationUuid: existing.uuid, phase: existing.phase },
        });
    }
    const offered = this.destinations.some(
      (d) =>
        d.partnerPlanId === input.partnerPlanId &&
        d.locations.some((l) => l.locationId === input.locationId),
    );
    if (!offered) {
      return this.json(res, 422, { error: true, code: 'MIGRATION_DESTINATION_UNAVAILABLE' });
    }
    const m = this.addMigration({
      uuid: this.nextUuid(),
      phase: 'draft',
      partnerPlanId: input.partnerPlanId as number,
      locationId: input.locationId as number,
      primaryDomain: (input.primaryDomain as string | undefined) ?? null,
      requestedPrimaryDomain: (input.primaryDomain as string | undefined) ?? null,
      ...(typeof key === 'string' ? { idempotencyKey: key } : {}),
    });
    return this.json(res, 201, { data: { migrationUuid: m.uuid, phase: m.phase } });
  }

  private uploadUrl(m: MockMigration, input: Record<string, unknown>, res: ServerResponse): void {
    if (m.phase !== 'draft' && m.phase !== 'uploading') {
      return this.json(res, 409, { error: true, message: 'MIGRATION_UPLOAD_NOT_ALLOWED' });
    }
    const sizeBytes = Number(input.sizeBytes);
    const partCount = Math.max(1, Math.ceil(sizeBytes / this.partSize));
    const reuse =
      this.supportsResume &&
      input.resume === true &&
      m.upload?.open &&
      m.upload.sizeBytes === sizeBytes;
    if (!reuse) {
      if (m.upload) m.upload.open = false;
      this.uploadCounter += 1;
      m.upload = {
        uploadId: `upload-${this.uploadCounter}`,
        sizeBytes,
        parts: new Map(),
        open: true,
      };
    }
    const upload = m.upload!;
    m.phase = 'uploading';
    const parts = [];
    for (let n = 1; n <= partCount; n += 1) {
      if (!upload.parts.has(n))
        parts.push({ partNumber: n, url: `${this.baseUrl}/s3/${upload.uploadId}/${n}` });
    }
    const data: Record<string, unknown> = {
      uploadId: upload.uploadId,
      partSize: this.partSize,
      parts,
    };
    if (this.supportsResume) {
      data.partCount = partCount;
      data.uploadedParts = [...upload.parts.entries()].map(([partNumber, p]) => ({
        partNumber,
        etag: p.etag,
        sizeBytes: p.sizeBytes,
      }));
      data.expiresIn = 21600;
    }
    return this.json(res, 200, { data });
  }
}

export async function startMockApi(): Promise<MockApi> {
  return new MockApi().start();
}
