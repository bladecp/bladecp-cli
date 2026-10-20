// The partner side of the servers in the simulated API: the filtered list,
// the simplified create, plan and option changes, suspend, cancel, delete
// and the sign-in link. Servers live in `api.provisions` (the list every
// command resolves short IDs from); what only this group knows lives in its
// state. Shapes follow openapi/customer-v1.json (ProvisionRef,
// ProvisionLifecycleRef, CancelProvisionData, DeleteProvisionData,
// OptionsReconfiguredData).
import type { Provision } from '../../../src/types.js';
import { forbidden, type MockApi, type MockRoute, notFound } from '../mock-api.js';
import { partnerCatalog } from './partner.js';

type Json = Record<string, unknown>;

export interface PartnerServersState {
  /** The billing service ID of each server, by server ID. */
  externalIds: Map<string, string>;
  /** Non-default options of each server, by server ID. */
  options: Map<string, Json[]>;
  /** Servers with a cancellation already requested. */
  cancelled: Set<string>;
  /** Servers created by an Idempotency-Key, so a repeated request returns the same one. */
  keys: Map<string, string>;
  /** The early termination fee the next cancellation reports (null: none). */
  penalty: Json | null;
  created: number;
  tickets: number;
}

export function partnerServersState(api: MockApi): PartnerServersState {
  return api.state('partner-servers', () => ({
    externalIds: new Map<string, string>(),
    options: new Map<string, Json[]>(),
    cancelled: new Set<string>(),
    keys: new Map<string, string>(),
    penalty: null,
    created: 0,
    tickets: 4520,
  }));
}

/** Adds a server sold to a customer, with the service ID of the billing system. */
export function addCustomerServer(api: MockApi, server: Provision, externalId?: string): Provision {
  api.provisions.push(server);
  if (externalId) partnerServersState(api).externalIds.set(server.uuid, externalId);
  return server;
}

function productOf(p: Provision): string {
  return String(p.product_type ?? p.customerApiProductType ?? 'stack-container');
}

function manualOf(p: Provision): boolean {
  return p.activation_mode === 'manual';
}

/** ProvisionRef of the contract. */
export function provisionRef(p: Provision): Json {
  const manual = manualOf(p);
  const product = productOf(p);
  return {
    uuid: p.uuid,
    status: p.status,
    primary_domain: p.primary_domain ?? (p as Json).primaryDomain ?? '',
    product_type: product,
    activation_mode: manual ? 'manual' : 'auto',
    manual_delivery: manual,
    requires_contract: p.requires_contract === true,
    contract_term_months:
      typeof p.contract_term_months === 'number' ? p.contract_term_months : null,
    contract_accepted: p.contract_accepted === true,
    contract_status: p.contract_accepted === true ? 'terms_accepted' : null,
    customer_api_provisioning_supported: true,
    contract: 'customer-whmcs.v1',
    contractAmendment: 'customer-whmcs-hardening.v1',
    customerApiProductType: product,
    activationMode: manual ? 'manual' : 'auto',
    contractStatus: p.contract_accepted === true ? 'terms_accepted' : null,
    coldStart: null,
  };
}

/** ProvisionLifecycleRef of the contract. */
function lifecycleRef(p: Provision): Json {
  return {
    uuid: p.uuid,
    status: p.status,
    contract: 'customer-whmcs.v1',
    contractAmendment: 'customer-whmcs-hardening.v1',
    customerApiProductType: productOf(p),
    activationMode: manualOf(p) ? 'manual' : 'auto',
    contractStatus: p.contract_accepted === true ? 'terms_accepted' : null,
  };
}

const invalid = (message = 'Validation error') => ({
  status: 400,
  body: { error: true, message, code: 'validation_error' },
});

function unprocessable(code: string, action: string) {
  return {
    status: 422,
    body: {
      error: true,
      code,
      message: code,
      retryable: false,
      action,
      correlationId: '0197c0ff-0000-7000-8000-000000000001',
    },
  };
}

const isWhole = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Monthly price in BRL cents of a set of options, from the partner catalog. */
function monthlyCents(api: MockApi, options: Json[]): number {
  let total = 0;
  for (const chosen of options) {
    for (const group of partnerCatalog(api).groups) {
      for (const option of group.options) {
        if (option.uuid !== chosen.optionUuid) continue;
        const value = (option.values as Json[]).find((v) => v.uuid === chosen.optionValueUuid);
        const brl = (value?.currencies as Json[] | undefined)?.find((c) => c.currency === 'BRL');
        total += Number(brl?.priceMonthly ?? 0) * 100 * Number(chosen.quantity ?? 1);
      }
    }
  }
  return total;
}

function knownOption(api: MockApi, optionUuid: unknown, valueUuid: unknown): boolean {
  return partnerCatalog(api).groups.some((group) =>
    group.options.some(
      (option) =>
        option.uuid === optionUuid &&
        (option.values as Json[]).some((value) => value.uuid === valueUuid),
    ),
  );
}

const FILTERS = ['status', 'domain', 'external_service_id', 'page', 'limit', 'license'];

/** Routes of the simulated API for the partner servers commands. */
export function install(api: MockApi): void {
  const route: MockRoute = ({ method, path, query, body, headers }) => {
    const state = () => partnerServersState(api);
    const input = (body ?? {}) as Json;

    // The filtered list; without filters the shared route answers.
    if (method === 'GET' && path === '/customer/provisions') {
      if (!FILTERS.some((name) => query.has(name))) return undefined;
      const status = query.get('status');
      const domain = query.get('domain');
      const external = query.get('external_service_id');
      const page = Number(query.get('page') ?? 1);
      const limit = Number(query.get('limit') ?? 50);
      if (!(page > 0) || !(limit > 0) || limit > 100) return invalid();
      const matches = api.provisions.filter(
        (p) =>
          (status === null || p.status === status) &&
          (domain === null || (p.primary_domain ?? (p as Json).primaryDomain) === domain) &&
          (external === null || state().externalIds.get(p.uuid) === external),
      );
      const start = (page - 1) * limit;
      return {
        status: 200,
        body: {
          data: matches.slice(start, start + limit).map(provisionRef),
          meta: { page, limit, hasMore: start + limit < matches.length },
        },
      };
    }

    if (method === 'POST' && path === '/customer/provisions/simple') {
      if (!api.partner) return forbidden();
      const key = headers['idempotency-key'];
      const replay = typeof key === 'string' ? state().keys.get(key) : undefined;
      if (replay) {
        const known = api.provisions.find((p) => p.uuid === replay)!;
        return { status: 201, body: { data: provisionRef(known) } };
      }
      const owner = (input.owner ?? {}) as Json;
      if (
        !isWhole(input.partner_plan_id) ||
        !isWhole(input.location_id) ||
        typeof input.domain !== 'string' ||
        input.domain === '' ||
        typeof owner.email !== 'string' ||
        !owner.email.includes('@') ||
        typeof owner.name !== 'string' ||
        owner.name === ''
      ) {
        return invalid();
      }
      const plan = partnerCatalog(api).plans.find((p) => p.id === input.partner_plan_id);
      if (!plan) return notFound('Plan not found');
      const location = partnerCatalog(api).locations.find((l) => l.id === input.location_id);
      if (!location || location.planId !== plan.id) {
        return unprocessable('LOCATION_NOT_AVAILABLE_FOR_PLAN', 'select_available_location');
      }
      const product = String(plan.customerApiProductType ?? 'stack-container');
      const components = Array.isArray(input.components) ? input.components : [];
      if (product === 'stack-container' && components.length === 0) {
        return unprocessable('COMPONENTS_REQUIRED', 'correct_plan_configuration');
      }
      for (const option of (input.options as Json[] | undefined) ?? []) {
        if (!knownOption(api, option.option_id, option.option_value_id)) {
          return unprocessable('OPTION_NOT_FOUND', 'review_catalog');
        }
      }
      state().created += 1;
      const server: Provision = {
        uuid: `0197c0a1-0000-7000-8000-${String(state().created).padStart(12, '0')}`,
        status: 'pending',
        primary_domain: input.domain,
        product_type: product,
        activation_mode: plan.activationMode === 'manual' ? 'manual' : 'auto',
        partner_plan_id: plan.id,
        contract_term_months: input.contract_term_months ?? null,
        contract_accepted: input.contract_accepted === true,
      };
      api.provisions.push(server);
      if (typeof input.external_service_id === 'string') {
        state().externalIds.set(server.uuid, input.external_service_id);
      }
      if (typeof key === 'string') state().keys.set(key, server.uuid);
      return { status: 201, body: { data: provisionRef(server) } };
    }

    const match =
      /^\/customer\/provisions\/([^/]+)(\/options|\/suspend|\/unsuspend|\/cancel|\/sso-link)?$/.exec(
        path,
      );
    if (!match) return undefined;
    const action = match[2] ?? '';
    const writes =
      (action === '' && (method === 'PATCH' || method === 'DELETE')) ||
      (action === '/options' && method === 'PATCH') ||
      (action !== '' && action !== '/options' && method === 'POST');
    if (!writes) return undefined;
    if (!api.partner) return forbidden();
    const server = api.provisions.find((p) => p.uuid === decodeURIComponent(match[1]!));
    if (!server) return notFound();

    if (action === '' && method === 'PATCH') {
      const plan = partnerCatalog(api).plans.find((p) => p.id === input.partnerPlanId);
      if (!isWhole(input.partnerPlanId)) return invalid();
      if (!plan) return notFound('Plan not found');
      server.partner_plan_id = plan.id;
      server.product_type = String(plan.customerApiProductType ?? server.product_type);
      return { status: 200, body: { data: provisionRef(server) } };
    }

    if (action === '/options') {
      const options = Array.isArray(input.options) ? (input.options as Json[]) : [];
      for (const option of options) {
        if (typeof option.optionUuid !== 'string' || typeof option.optionValueUuid !== 'string')
          return invalid();
        if (!knownOption(api, option.optionUuid, option.optionValueUuid)) {
          return {
            status: 409,
            body: { error: true, code: 'INCOMPATIBLE_OPTION', message: 'Option not offered' },
          };
        }
      }
      const before = monthlyCents(api, state().options.get(server.uuid) ?? []);
      state().options.set(server.uuid, options);
      return {
        status: 200,
        body: {
          data: {
            uuid: server.uuid,
            prorationAmountCents: Math.round((monthlyCents(api, options) - before) / 2),
            currency: 'BRL',
          },
        },
      };
    }

    if (action === '/suspend' || action === '/unsuspend') {
      server.status = action === '/suspend' ? 'suspended' : 'active';
      return { status: 200, body: { data: lifecycleRef(server) } };
    }

    if (action === '/cancel') {
      const reason = input.reasonText;
      if (
        (input.when !== 'now' && input.when !== 'cycle_end') ||
        typeof input.reasonCategory !== 'string' ||
        typeof reason !== 'string' ||
        reason.length < 20 ||
        reason.length > 2000
      ) {
        return { status: 422, body: { error: true, message: 'Invalid cancellation request' } };
      }
      if (state().cancelled.has(server.uuid)) {
        return { status: 409, body: { error: true, message: 'Cancellation already requested' } };
      }
      state().cancelled.add(server.uuid);
      if (input.when === 'now') server.status = 'suspended';
      state().tickets += 1;
      return {
        status: 202,
        body: {
          data: {
            ...lifecycleRef(server),
            ticketId: state().tickets,
            cancellationMode: input.when,
            requestedAt: '2026-10-17T12:00:00.000Z',
            earlyTerminationPenalty: state().penalty,
          },
        },
      };
    }

    if (action === '' && method === 'DELETE') {
      const reused = server.status === 'deleting' || server.status === 'terminating';
      const target = manualOf(server) ? 'deleted' : 'deleting';
      if (!reused) server.status = target;
      return {
        status: 200,
        body: {
          data: {
            ...lifecycleRef(server),
            status: server.status,
            targetStatus: server.status,
            reused,
          },
        },
      };
    }

    // The sign-in link to the customer's panel.
    const ttl = input.ttl_seconds;
    if (ttl !== undefined && !isWhole(ttl)) return invalid();
    return {
      status: 200,
      body: { data: { url: `https://panel.example.com/sso/${server.uuid.slice(0, 8)}t0k3n` } },
    };
  };
  api.routes.push(route);
}
