import { isRecord, provisionDomain } from '../../../src/api.js';
import { type MockAnswer, type MockApi, notFound } from '../mock-api.js';

/** The domains data of the simulated API, beside the servers of `api.provisions`. */
export interface DomainsState {
  /** Additional domains per server UUID (the main one is the server's own). */
  additional: Map<string, string[]>;
  /** Hosts in use on servers of other accounts. */
  taken: Set<string>;
  /** DNS zones (example.org) that belong to another account. */
  otherZones: Set<string>;
  /** Most additional domains a server may have. */
  limit: number;
}

export function domainsState(api: MockApi): DomainsState {
  return api.state<DomainsState>('domains', () => ({
    additional: new Map(),
    taken: new Set(),
    otherZones: new Set(),
    limit: 10,
  }));
}

/** Gives a server its additional domains. */
export function seedDomains(api: MockApi, uuid: string, additional: string[]): void {
  domainsState(api).additional.set(uuid, [...additional]);
}

/** The main domain of a server, or null when the server does not exist. */
function primaryOf(api: MockApi, uuid: string): string | null {
  const server = api.provisions.find((p) => p.uuid === uuid);
  return server ? (provisionDomain(server) ?? '') : null;
}

/** Every domain of a server (the main one first), or null when it does not exist. */
export function hostsOf(api: MockApi, uuid: string): string[] | null {
  const primary = primaryOf(api, uuid);
  if (primary === null) return null;
  return [...(primary ? [primary] : []), ...(domainsState(api).additional.get(uuid) ?? [])];
}

const preview = (uuid: string) => `${uuid.slice(0, 8)}.preview.example.net`;

function domainsData(api: MockApi, uuid: string) {
  return {
    primary: primaryOf(api, uuid) ?? '',
    additional: [...(domainsState(api).additional.get(uuid) ?? [])],
    preview: preview(uuid),
  };
}

/** Same normalization as the API: trimmed, lowercase, no scheme, path or trailing dot. */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

const zoneOf = (host: string) => host.split('.').slice(-2).join('.');

const ok = (data: unknown): MockAnswer => ({ status: 200, body: { data } });
const error = (status: number, message: string, code?: string): MockAnswer => ({
  status,
  body: { error: true, message, ...(code ? { code } : {}) },
});

function inUseElsewhere(api: MockApi, uuid: string, host: string): boolean {
  if (domainsState(api).taken.has(host)) return true;
  return api.provisions.some((p) => p.uuid !== uuid && (hostsOf(api, p.uuid) ?? []).includes(host));
}

/** Routes of the simulated API for the domains commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    const state = domainsState(api);
    if (request.path === '/customer/provisions/domains/availability') {
      if (request.method !== 'GET') return undefined;
      const raw = request.query.get('host');
      if (!raw?.trim()) return error(400, 'host is required');
      const host = normalize(raw);
      if (inUseElsewhere(api, '', host))
        return ok({ host, available: false, reason: 'host_taken' });
      if (state.otherZones.has(zoneOf(host)))
        return ok({ host, available: false, reason: 'zone_owned_by_other' });
      return ok({ host, available: true });
    }

    let match = /^\/customer\/provisions\/([^/]+)\/domains$/.exec(request.path);
    if (match) {
      const uuid = decodeURIComponent(match[1]!);
      const primary = primaryOf(api, uuid);
      if (primary === null) return notFound('Provision not found');
      if (request.method === 'GET') return ok(domainsData(api, uuid));
      if (request.method !== 'POST') return undefined;
      const body = isRecord(request.body) ? request.body : {};
      const host = typeof body.host === 'string' ? body.host.trim().toLowerCase() : '';
      if (!host) return error(400, 'host is required');
      if (host === primary) return error(409, 'Host is already the primary domain');
      if (state.otherZones.has(zoneOf(host)))
        return error(409, 'This domain belongs to another customer.', 'zone_owned_by_other');
      const list = state.additional.get(uuid) ?? [];
      if (list.includes(host) || inUseElsewhere(api, uuid, host))
        return error(409, 'Domain is already in use');
      if (list.length >= state.limit)
        return error(403, 'Additional domain limit reached', 'addon_domain_limit');
      state.additional.set(uuid, [...list, host]);
      return ok(domainsData(api, uuid));
    }

    match = /^\/customer\/provisions\/([^/]+)\/domains\/([^/]+)$/.exec(request.path);
    if (match && request.method === 'DELETE') {
      const uuid = decodeURIComponent(match[1]!);
      const host = decodeURIComponent(match[2]!).trim().toLowerCase();
      const primary = primaryOf(api, uuid);
      if (primary === null) return notFound('Provision not found');
      if (host === primary) return error(400, 'Cannot remove the primary domain');
      const list = state.additional.get(uuid) ?? [];
      if (!list.includes(host)) return notFound('Domain not found');
      state.additional.set(
        uuid,
        list.filter((item) => item !== host),
      );
      return ok(domainsData(api, uuid));
    }
    return undefined;
  });
}
