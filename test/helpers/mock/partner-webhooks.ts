import { forbidden, type MockApi, type MockRequest, notFound } from '../mock-api.js';

// Webhook endpoints and deliveries of a partner as the Customer API answers
// them (/customer/webhook-endpoints, /customer/webhook-deliveries). The
// signing secret is returned only on create and on rotate-secret.

export const EVENT_TYPES = [
  'provision.created',
  'provision.status.changed',
  'provision.suspended',
  'provision.unsuspended',
  'provision.terminated',
  'invoice.paid',
  'invoice.failed',
  'subscription.upgraded',
  'subscription.downgraded',
  'vibe.account.activated',
  'vibe.account.plan_changed',
  'vibe.account.suspended',
  'vibe.account.reactivated',
  'vibe.account.terminated',
];

export interface MockEndpoint {
  uuid: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Not in the answers: the current secret and the soft delete. */
  secret: string;
  deleted: boolean;
}

export interface MockDelivery {
  uuid: string;
  /** Not in the answers: the endpoint the delivery went to. */
  endpoint: string;
  eventId: string;
  eventType: string;
  status: string;
  attempt: number;
  responseCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhooksData {
  endpoints: MockEndpoint[];
  deliveries: MockDelivery[];
  /** How many IDs and secrets were handed out (keeps them stable). */
  issued: number;
}

/** The webhooks of the simulated API (empty until a test seeds or creates some). */
export function webhooks(api: MockApi): WebhooksData {
  return api.state('partner-webhooks', () => ({ endpoints: [], deliveries: [], issued: 0 }));
}

export const ENDPOINT = '0198c2a0-0000-7000-8000-000000000201';
export const PAUSED_ENDPOINT = '0198b7e5-0000-7000-8000-000000000202';
export const DELIVERED = '0198d4b1-0000-7000-8000-000000000301';
export const FAILED_DELIVERY = '0198d3a7-0000-7000-8000-000000000302';
export const DEAD_DELIVERY = '0198d2c9-0000-7000-8000-000000000303';
export const QUEUED_DELIVERY = '0198d1f0-0000-7000-8000-000000000304';
export const EVENT_ID = '7c1e2f30-0000-7000-8000-000000000402';

/** Two endpoints (one paused) and four deliveries, one of each kind. */
export function seedWebhooks(api: MockApi): WebhooksData {
  const data = webhooks(api);
  data.endpoints = [
    {
      uuid: ENDPOINT,
      url: 'https://billing.example.com/bladecp',
      events: ['invoice.paid', 'provision.created', 'provision.status.changed'],
      active: true,
      description: 'Production WHMCS',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-15T08:30:00.000Z',
      secret: 'whsec_EXAMPLE-0002-production-endpoint',
      deleted: false,
    },
    {
      uuid: PAUSED_ENDPOINT,
      url: 'https://hooks.example.org/staging',
      events: ['provision.created'],
      active: false,
      description: null,
      createdAt: '2026-09-20T16:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
      secret: 'whsec_EXAMPLE-0003-paused-endpoint',
      deleted: false,
    },
  ];
  const at = '2026-10-19T09:00:00.000Z';
  data.deliveries = [
    {
      uuid: DELIVERED,
      endpoint: ENDPOINT,
      eventId: '7c1e2f30-0000-7000-8000-000000000401',
      eventType: 'invoice.paid',
      status: 'succeeded',
      attempt: 1,
      responseCode: 200,
      lastError: null,
      nextAttemptAt: null,
      createdAt: at,
      updatedAt: '2026-10-19T09:00:01.000Z',
    },
    {
      uuid: FAILED_DELIVERY,
      endpoint: ENDPOINT,
      eventId: EVENT_ID,
      eventType: 'provision.created',
      status: 'failed',
      attempt: 3,
      responseCode: 503,
      lastError: 'HTTP 503 from the receiver',
      nextAttemptAt: '2026-10-19T09:40:00.000Z',
      createdAt: '2026-10-19T08:00:00.000Z',
      updatedAt: '2026-10-19T08:50:00.000Z',
    },
    {
      uuid: DEAD_DELIVERY,
      endpoint: PAUSED_ENDPOINT,
      eventId: '7c1e2f30-0000-7000-8000-000000000403',
      eventType: 'provision.created',
      status: 'dead',
      attempt: 8,
      responseCode: null,
      lastError: 'Connection timed out',
      nextAttemptAt: null,
      createdAt: '2026-10-17T08:00:00.000Z',
      updatedAt: '2026-10-18T08:00:00.000Z',
    },
    {
      uuid: QUEUED_DELIVERY,
      endpoint: ENDPOINT,
      eventId: '7c1e2f30-0000-7000-8000-000000000404',
      eventType: 'provision.status.changed',
      status: 'pending',
      attempt: 0,
      responseCode: null,
      lastError: null,
      nextAttemptAt: null,
      createdAt: '2026-10-19T09:05:00.000Z',
      updatedAt: '2026-10-19T09:05:00.000Z',
    },
  ];
  return data;
}

function issue(data: WebhooksData, kind: 'endpoint' | 'delivery'): string {
  data.issued += 1;
  const n = data.issued;
  const head = (0x51a0 + n * 0x1357).toString(16).padStart(4, '0').slice(-4);
  const tail = String(kind === 'endpoint' ? 500 + n : 600 + n).padStart(12, '0');
  return `0198${head}-0000-7000-8000-${tail}`;
}

const secretFor = (n: number) => `whsec_EXAMPLE-mock${String(n).padStart(4, '0')}Zk7Qm2xV9pL4s`;

function publicEndpoint(endpoint: MockEndpoint) {
  const { secret: _secret, deleted: _deleted, ...rest } = endpoint;
  return rest;
}

function publicDelivery(delivery: MockDelivery) {
  const { endpoint: _endpoint, ...rest } = delivery;
  return rest;
}

function invalid(message: string) {
  return { status: 400, body: { error: true, code: 'validation_error', message } };
}

/** The body checks of the API: https address, known event types, a short description. */
function validate(body: Record<string, unknown>, partial: boolean) {
  if (!partial || body.url !== undefined) {
    if (typeof body.url !== 'string' || !body.url.startsWith('https://')) {
      return invalid('url must use https');
    }
  }
  if (!partial || body.events !== undefined) {
    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      return invalid('events must subscribe to at least one event type');
    }
    if (!events.every((event) => typeof event === 'string' && EVENT_TYPES.includes(event))) {
      return invalid('events has an unknown event type');
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 255) {
      return invalid('description must have up to 255 characters');
    }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return invalid('active must be a boolean');
  }
  if (partial && Object.keys(body).length === 0) {
    return invalid('at least one field must be provided');
  }
  return null;
}

function endpointsRoute(api: MockApi, request: MockRequest) {
  const data = webhooks(api);
  const now = '2026-10-19T10:00:00.000Z';
  const rest = request.path.slice('/customer/webhook-endpoints'.length);
  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<
    string,
    unknown
  >;
  if (rest === '' || rest === '/') {
    if (request.method === 'GET') {
      return {
        status: 200,
        body: { data: data.endpoints.filter((e) => !e.deleted).map(publicEndpoint) },
      };
    }
    if (request.method === 'POST') {
      const problem = validate(body, false);
      if (problem) return problem;
      const endpoint: MockEndpoint = {
        uuid: issue(data, 'endpoint'),
        url: body.url as string,
        events: body.events as string[],
        active: body.active === undefined ? true : (body.active as boolean),
        description: typeof body.description === 'string' ? body.description : null,
        createdAt: now,
        updatedAt: now,
        secret: secretFor(data.issued),
        deleted: false,
      };
      data.endpoints.push(endpoint);
      return {
        status: 201,
        body: {
          data: {
            ...publicEndpoint(endpoint),
            secret: endpoint.secret,
            warning:
              'The signing secret is shown only once. Store it securely, it cannot be retrieved later.',
          },
        },
      };
    }
    return notFound();
  }
  const match = /^\/([^/]+)(\/rotate-secret)?$/.exec(rest);
  if (!match) return notFound();
  const endpoint = data.endpoints.find((e) => e.uuid === match[1] && !e.deleted);
  if (!endpoint) return notFound('Webhook endpoint not found');
  if (match[2]) {
    if (request.method !== 'POST') return notFound();
    data.issued += 1;
    endpoint.secret = secretFor(data.issued);
    endpoint.updatedAt = now;
    return {
      status: 200,
      body: {
        data: {
          uuid: endpoint.uuid,
          secret: endpoint.secret,
          warning: 'The new signing secret is shown only once. The previous secret is now invalid.',
        },
      },
    };
  }
  if (request.method === 'GET') return { status: 200, body: { data: publicEndpoint(endpoint) } };
  if (request.method === 'PATCH') {
    const problem = validate(body, true);
    if (problem) return problem;
    if (typeof body.url === 'string') endpoint.url = body.url;
    if (Array.isArray(body.events)) endpoint.events = body.events as string[];
    if (typeof body.active === 'boolean') endpoint.active = body.active;
    if (typeof body.description === 'string') endpoint.description = body.description;
    endpoint.updatedAt = now;
    return { status: 200, body: { data: publicEndpoint(endpoint) } };
  }
  if (request.method === 'DELETE') {
    endpoint.deleted = true;
    endpoint.active = false;
    return { status: 200, body: { data: { uuid: endpoint.uuid, deleted: true } } };
  }
  return notFound();
}

function deliveriesRoute(api: MockApi, request: MockRequest) {
  const data = webhooks(api);
  const rest = request.path.slice('/customer/webhook-deliveries'.length);
  if ((rest === '' || rest === '/') && request.method === 'GET') {
    const page = Math.max(1, Number(request.query.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.get('limit')) || 20));
    const endpointId = request.query.get('endpoint_id');
    const status = request.query.get('status');
    const owned = new Set(data.endpoints.map((e) => e.uuid));
    const matching = data.deliveries.filter(
      (d) =>
        owned.has(d.endpoint) &&
        (!endpointId || d.endpoint === endpointId) &&
        (!status || d.status === status),
    );
    return {
      status: 200,
      body: {
        data: matching.slice((page - 1) * limit, page * limit).map(publicDelivery),
        meta: {
          page,
          limit,
          total: matching.length,
          totalPages: Math.ceil(matching.length / limit),
        },
      },
    };
  }
  const replay = /^\/([^/]+)\/replay$/.exec(rest);
  if (replay && request.method === 'POST') {
    const original = data.deliveries.find((d) => d.uuid === replay[1]);
    if (!original) return notFound('Delivery not found');
    const now = '2026-10-19T10:00:00.000Z';
    const copy: MockDelivery = {
      ...original,
      uuid: issue(data, 'delivery'),
      status: 'pending',
      attempt: 0,
      responseCode: null,
      lastError: null,
      nextAttemptAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.deliveries.unshift(copy);
    return {
      status: 201,
      body: {
        data: {
          uuid: copy.uuid,
          eventId: copy.eventId,
          status: 'pending',
          replayOf: original.uuid,
        },
      },
    };
  }
  return notFound();
}

/** Routes of the simulated API for the partner webhooks commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    const endpoints = request.path.startsWith('/customer/webhook-endpoints');
    const deliveries = request.path.startsWith('/customer/webhook-deliveries');
    if (!endpoints && !deliveries) return undefined;
    if (!api.partner) return forbidden();
    return endpoints ? endpointsRoute(api, request) : deliveriesRoute(api, request);
  });
}
