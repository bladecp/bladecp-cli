// The partner Fast Deploy routes of the simulated API (/customer/migrations):
// requests of a WHMCS installation and client, the billing queue, the billing
// link and the account-claim address. Shapes follow openapi/customer-v1.json
// (MigrationDetail, MigrationBillingWork).

import { forbidden, type MockAnswer, type MockApi, type MockRequest } from '../mock-api.js';

export const INSTALLATION = '01980000-0000-7000-8000-0000000000a1';
export const BILLING_INSTALLATION = '01980000-0000-7000-8000-0000000000b2';
export const CLIENT = '42';

type Json = Record<string, unknown>;

export interface PartnerRequestRecord {
  requestUuid: string;
  installationId: string;
  externalClientId: string;
  nativeProductId: number;
  partnerPlanId: number;
  locationId: number;
  commercial: {
    policy: {
      mode: 'payment_before' | 'payment_after' | 'trial';
      trialDays: number | null;
      paymentDays: number | null;
      expiry: null;
    };
    state: string;
    externalServiceId: string | null;
    orderId: string | null;
    invoiceId: string | null;
    dueAt: string | null;
    graceEndsAt: string | null;
    retentionEndsAt: string | null;
    nextAction: string | null;
  };
  billingLink: { status: string; whmcs_service_id?: string; linked_at?: string };
  /** Who reads the request once the billing WHMCS linked it. */
  billing?: { installationId: string; clientId: string; serviceId: string };
  source: {
    kind: 'cpanel';
    server_hostname: string;
    username: string;
    owner: string;
    domain: string;
    initiated_by: 'root' | 'account' | 'reseller';
  } | null;
  migration: {
    phase: string;
    primaryDomain: string | null;
    requestedPrimaryDomain: string | null;
    sourcePrimaryDomain: string | null;
    discovery?: unknown;
    components: { name: string; status: string }[];
    provisionUuid: string | null;
    backupReady: boolean;
    stagingUrl: string | null;
    cutoverTarget: string | null;
    cutoverDeadlineAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** Why a failed migration cannot be tried again (null: it can). */
  retryReason: string | null;
  /** Phases the request walks through, one per GET (for --watch). */
  script: string[];
  /** The client area of the billing WHMCS, set when a claim is required. */
  clientAreaUrl?: string | null;
}

export interface PartnerMigrationsState {
  requests: Map<string, PartnerRequestRecord>;
  /** Claim addresses issued so far. */
  claims: number;
}

export function partnerMigrations(api: MockApi): PartnerMigrationsState {
  return api.state<PartnerMigrationsState>('partner-migrations', () => ({
    requests: new Map(),
    claims: 0,
  }));
}

export interface RequestSeed {
  requestUuid: string;
  phase?: string;
  installationId?: string;
  externalClientId?: string;
  primaryDomain?: string | null;
  sourcePrimaryDomain?: string | null;
  components?: { name: string; status: string }[];
  stagingUrl?: string | null;
  cutoverTarget?: string | null;
  createdAt?: string;
  mode?: 'payment_before' | 'payment_after' | 'trial';
  trialDays?: number | null;
  state?: string;
  externalServiceId?: string | null;
  dueAt?: string | null;
  billingLink?: 'not_required' | 'pending' | 'claim_required' | 'linked';
  source?: PartnerRequestRecord['source'];
  retryReason?: string | null;
  script?: string[];
  clientAreaUrl?: string | null;
}

/** Adds a request to the simulated API (tests and photos seed it here). */
export function addPartnerRequest(api: MockApi, seed: RequestSeed): PartnerRequestRecord {
  const createdAt = seed.createdAt ?? '2026-10-16T18:20:00.000Z';
  const record: PartnerRequestRecord = {
    requestUuid: seed.requestUuid,
    installationId: seed.installationId ?? INSTALLATION,
    externalClientId: seed.externalClientId ?? CLIENT,
    nativeProductId: 10,
    partnerPlanId: 12,
    locationId: 3,
    commercial: {
      policy: {
        mode: seed.mode ?? 'payment_before',
        trialDays: seed.mode === 'trial' ? (seed.trialDays ?? 14) : null,
        paymentDays: null,
        expiry: null,
      },
      state: seed.state ?? 'paid',
      externalServiceId: seed.externalServiceId ?? null,
      orderId: null,
      invoiceId: null,
      dueAt: seed.dueAt ?? null,
      graceEndsAt: null,
      retentionEndsAt: null,
      nextAction: null,
    },
    billingLink: { status: seed.billingLink ?? 'not_required' },
    source: seed.source ?? null,
    migration: {
      phase: seed.phase ?? 'queued',
      primaryDomain: seed.primaryDomain ?? null,
      requestedPrimaryDomain: null,
      sourcePrimaryDomain: seed.sourcePrimaryDomain ?? null,
      components: seed.components ?? [],
      provisionUuid: null,
      backupReady: true,
      stagingUrl: seed.stagingUrl ?? null,
      cutoverTarget: seed.cutoverTarget ?? null,
      cutoverDeadlineAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    retryReason: seed.retryReason ?? null,
    script: [...(seed.script ?? [])],
    clientAreaUrl: seed.clientAreaUrl ?? null,
  };
  if (record.billingLink.status === 'linked' && seed.externalServiceId) {
    record.billingLink = {
      status: 'linked',
      whmcs_service_id: seed.externalServiceId,
      linked_at: createdAt,
    };
  }
  partnerMigrations(api).requests.set(record.requestUuid, record);
  return record;
}

const TERMINAL = new Set(['failed', 'cancelled', 'live']);
const CANCELLABLE = new Set([
  'draft',
  'uploading',
  'queued',
  'parsing',
  'discovery_review',
  'provisioning',
  'importing',
  'validating',
  'awaiting_approval',
]);

function blocked(r: PartnerRequestRecord): boolean {
  return r.billingLink.status === 'pending' || r.billingLink.status === 'claim_required';
}

function paid(r: PartnerRequestRecord): boolean {
  return ['paid', 'regularized'].includes(r.commercial.state);
}

/** The request as the API answers it, seen by one installation. */
export function detail(r: PartnerRequestRecord, installationId = r.installationId): Json {
  const billingView = r.billing && installationId === r.billing.installationId;
  const phase = r.migration.phase;
  const failed = phase === 'failed';
  return {
    requestUuid: r.requestUuid,
    installationId,
    externalClientId: billingView ? r.billing!.clientId : r.externalClientId,
    nativeProductId: r.nativeProductId,
    partnerPlanId: r.partnerPlanId,
    locationId: r.locationId,
    commercial: r.commercial,
    billing_link: r.billingLink,
    waiting_reason: blocked(r) && !TERMINAL.has(phase) ? 'waiting_for_provider' : null,
    migration: r.migration,
    actions: {
      upload: phase === 'draft' || phase === 'uploading',
      confirmUpload: phase === 'uploading' && !blocked(r),
      review: phase === 'discovery_review' && !r.migration.primaryDomain,
      approve: phase === 'awaiting_approval' && (r.commercial.policy.mode === 'trial' || paid(r)),
      cancel: CANCELLABLE.has(phase),
      retry: failed && r.retryReason === null,
      reconcile: false,
    },
    retry: {
      allowed: failed && r.retryReason === null,
      reason: failed ? r.retryReason : 'not_failed',
      migrationUuid: null,
      published: false,
    },
  };
}

function queueItem(r: PartnerRequestRecord): Json {
  return {
    request_uuid: r.requestUuid,
    created_at: r.migration.createdAt,
    phase: r.migration.phase,
    source: r.source,
    plan: { partner_plan_id: r.partnerPlanId, location_id: r.locationId },
    commercial: {
      mode: r.commercial.policy.mode,
      trial_days: r.commercial.policy.trialDays,
      payment_days: r.commercial.policy.paymentDays,
    },
  };
}

const conflict = (code: string, status = 409): MockAnswer => ({
  status,
  body: { error: true, code, message: code },
});

const invalid = (message: string): MockAnswer => ({
  status: 400,
  body: { error: true, code: 'invalid_request', message },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATIVE_ID = /^[1-9]\d{0,15}$/;

/** The installation and client of a call (query of a GET, body of a POST). */
function scopeOf(source: { get(name: string): unknown }): Json | MockAnswer {
  const installation = source.get('installation_id');
  const client = source.get('external_client_id');
  if (typeof installation !== 'string' || !UUID.test(installation))
    return invalid('installation_id must be a UUID');
  if (typeof client !== 'string' || client.trim() === '' || client.length > 191)
    return invalid('external_client_id is required');
  return { installation_id: installation, external_client_id: client };
}

function find(
  state: PartnerMigrationsState,
  uuid: string,
  scope: Json,
): PartnerRequestRecord | undefined {
  const r = state.requests.get(uuid);
  if (!r) return undefined;
  if (r.installationId === scope.installation_id && r.externalClientId === scope.external_client_id)
    return r;
  if (
    r.billing &&
    r.billing.installationId === scope.installation_id &&
    r.billing.clientId === scope.external_client_id
  )
    return r;
  return undefined;
}

function page<T>(items: T[], limit: number): { page: T[]; more: boolean } {
  return { page: items.slice(0, limit), more: items.length > limit };
}

function limitOf(query: URLSearchParams): number | MockAnswer {
  const raw = query.get('limit');
  if (raw === null) return 50;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return invalid('limit must be 1..100');
  return limit;
}

const isAnswer = (value: unknown): value is MockAnswer =>
  typeof value === 'object' && value !== null && 'status' in value;

function route(api: MockApi, request: MockRequest): MockAnswer | undefined {
  const { method, path, query } = request;
  if (path !== '/customer/migrations' && !path.startsWith('/customer/migrations/'))
    return undefined;
  if (!api.partner) return forbidden();
  const state = partnerMigrations(api);
  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Json;
  const fromBody = { get: (name: string) => body[name] };

  if (method === 'GET' && path === '/customer/migrations') {
    const installation = query.get('installation_id');
    if (!installation || !UUID.test(installation)) return invalid('installation_id is required');
    const client = query.get('external_client_id');
    const limit = limitOf(query);
    if (isAnswer(limit)) return limit;
    const after = query.get('after');
    const all = [...state.requests.values()]
      .filter((r) => r.installationId === installation)
      .filter((r) => client === null || r.externalClientId === client)
      .sort((a, b) => b.requestUuid.localeCompare(a.requestUuid))
      .filter((r) => !after || r.requestUuid < after);
    const { page: items, more } = page(all, limit);
    return {
      status: 200,
      body: {
        data: {
          items: items.map((r) => detail(r)),
          nextCursor: more ? (items.at(-1)?.requestUuid ?? null) : null,
        },
      },
    };
  }

  if (method === 'GET' && path === '/customer/migrations/billing-queue') {
    const limit = limitOf(query);
    if (isAnswer(limit)) return limit;
    const cursor = query.get('cursor');
    const all = [...state.requests.values()]
      .filter((r) => r.billingLink.status === 'pending' && !TERMINAL.has(r.migration.phase))
      .sort((a, b) => a.requestUuid.localeCompare(b.requestUuid))
      .filter((r) => !cursor || r.requestUuid > cursor);
    const { page: items, more } = page(all, limit);
    return {
      status: 200,
      body: {
        data: {
          items: items.map(queueItem),
          next_cursor: more ? (items.at(-1)?.requestUuid ?? null) : null,
        },
      },
    };
  }

  const match = /^\/customer\/migrations\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  if (!match) return undefined;
  const uuid = decodeURIComponent(match[1]!);
  const action = match[2];
  const notFound = conflict('MIGRATION_REQUEST_NOT_FOUND', 404);

  if (method === 'GET' && !action) {
    const scope = scopeOf(query);
    if (isAnswer(scope)) return scope;
    const r = find(state, uuid, scope);
    if (!r) return notFound;
    // Each read moves a scripted request one phase on (the watch follows it).
    const next = r.script.shift();
    if (next) {
      r.migration.phase = next;
      if (next === 'awaiting_approval') {
        r.migration.components = [
          { name: 'files', status: 'completed' },
          { name: 'database', status: 'completed' },
        ];
        r.migration.stagingUrl = r.migration.stagingUrl ?? 'https://preview.example.net/';
      }
    }
    return { status: 200, body: { data: detail(r, String(scope.installation_id)) } };
  }

  if (method !== 'POST') return undefined;

  if (action === 'billing-link') {
    const installation = body.installation_id;
    const client = String(body.whmcs_client_id ?? '');
    const service = String(body.whmcs_service_id ?? '');
    const owner = body.owner as Json | undefined;
    if (typeof installation !== 'string' || !UUID.test(installation))
      return invalid('installation_id must be a UUID');
    if (!NATIVE_ID.test(client) || !NATIVE_ID.test(service))
      return invalid('whmcs ids must be positive integers');
    if (
      !owner ||
      typeof owner.email !== 'string' ||
      typeof owner.first_name !== 'string' ||
      owner.first_name === '' ||
      typeof owner.last_name !== 'string'
    )
      return invalid('owner is required');
    const r = state.requests.get(uuid);
    if (!r) return notFound;
    if (r.billingLink.status === 'linked') {
      const same =
        r.billing?.installationId === installation &&
        r.billing.clientId === client &&
        r.billing.serviceId === service;
      return same
        ? { status: 200, body: { data: detail(r, installation) } }
        : conflict('MIGRATION_BILLING_LINK_CONFLICT');
    }
    if (!blocked(r) || TERMINAL.has(r.migration.phase)) return conflict('MIGRATION_NOT_LINKABLE');
    r.billing = { installationId: installation, clientId: client, serviceId: service };
    r.billingLink = {
      status: 'linked',
      whmcs_service_id: service,
      linked_at: '2026-10-17T09:00:00.000Z',
    };
    r.commercial.externalServiceId = service;
    return { status: 200, body: { data: detail(r, installation) } };
  }

  const scope = scopeOf(fromBody);
  if (isAnswer(scope)) return scope;
  const r = find(state, uuid, scope);
  if (!r) return notFound;
  const phase = r.migration.phase;

  switch (action) {
    case 'discovery-review': {
      const domain = body.primaryDomain;
      if (typeof domain !== 'string' || domain === '' || domain.length > 63)
        return invalid('primaryDomain is required');
      if (phase !== 'discovery_review') return conflict('MIGRATION_DISCOVERY_REVIEW_UNAVAILABLE');
      r.migration.primaryDomain = domain;
      return { status: 202, body: { data: { phase: 'discovery_review' } } };
    }
    case 'approve':
      if (r.commercial.policy.mode !== 'trial' && !paid(r))
        return conflict('MIGRATION_PAYMENT_REQUIRED');
      if (phase !== 'awaiting_approval') return conflict('MIGRATION_APPROVAL_NOT_ALLOWED');
      r.migration.phase = 'syncing';
      return { status: 200, body: { data: { phase: 'syncing' } } };
    case 'cancel':
      if (!CANCELLABLE.has(phase)) return conflict('MIGRATION_CANCEL_NOT_ALLOWED');
      r.migration.phase = 'cancelled';
      return { status: 200, body: { data: { phase: 'cancelled' } } };
    case 'retry':
      if (phase !== 'failed' || r.retryReason !== null)
        return conflict('MIGRATION_RETRY_UNAVAILABLE');
      r.migration.phase = 'queued';
      r.retryReason = 'attempt_used';
      return {
        status: 202,
        body: { data: { requestUuid: r.requestUuid, migration: { phase: 'queued' } } },
      };
    case 'claim-url': {
      if (r.billingLink.status !== 'claim_required')
        return conflict('MIGRATION_CLAIM_NOT_REQUIRED');
      if (!r.clientAreaUrl) return conflict('MIGRATION_CLAIM_URL_UNAVAILABLE');
      state.claims += 1;
      const token = String(state.claims).padStart(64, 'c');
      return {
        status: 200,
        body: {
          data: {
            url: `${r.clientAreaUrl}/index.php?m=bladecp&action=claim&token=${token}`,
            expires_at: '2026-10-18T12:00:00.000Z',
          },
        },
      };
    }
    default:
      return undefined;
  }
}

/** Routes of the simulated API for the partner migrations commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => route(api, request));
}
