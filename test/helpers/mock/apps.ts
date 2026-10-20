import { isRecord, type Json } from '../../../src/api.js';
import { type MockAnswer, type MockApi, notFound } from '../mock-api.js';
import { hostsOf } from './domains.js';

/** The fields of an app in the catalog list; the detail adds the install spec. */
const ENTRY_FIELDS = [
  'uuid',
  'slug',
  'family',
  'category',
  'displayName',
  'description',
  'iconUrl',
  'defaultVersion',
  'featured',
  'availableInWorker',
  'versions',
] as const;

export const WORDPRESS_APP: Json = {
  uuid: '01970000-0000-7000-8000-0000000a0001',
  slug: 'wordpress',
  family: 'wordpress',
  category: 'content-management',
  displayName: 'WordPress',
  description: "The world's most popular CMS.",
  iconUrl: 'https://example.com/icons/wordpress.svg',
  defaultVersion: '6.5.2',
  featured: true,
  availableInWorker: true,
  versions: [
    { version: '6.5.2', isDefault: true, supported: true },
    { version: '6.4.3', isDefault: false, supported: true },
  ],
  requiredInputs: ['admin_email', 'site_title', 'locale', 'admin_user'],
  inputSpecs: {
    admin_email: { type: 'email', label: 'Admin email' },
    site_title: { type: 'text', label: 'Site title', maxLen: 100 },
    locale: {
      type: 'enum',
      label: 'Locale',
      options: ['en_US', 'pt_BR', 'es_ES', 'fr_FR', 'de_DE'],
    },
    admin_user: { type: 'text', label: 'Admin username', minLen: 3, maxLen: 60 },
  },
  adminUserDenylist: ['admin', 'administrator', 'root', 'wpadmin'],
  runtime: { language: 'php', minVersion: '8.1' },
  stores: { mysql: { required: true, minVersion: '5.7' } },
  adminPath: '/wp-login.php',
  manifestRevision: 'v1-2026-05-08',
};

export const JOOMLA_APP: Json = {
  uuid: '01970000-0000-7000-8000-0000000a0002',
  slug: 'joomla',
  family: 'joomla',
  category: 'content-management',
  displayName: 'Joomla',
  description: 'Sites and portals with many kinds of content.',
  iconUrl: 'https://example.com/icons/joomla.svg',
  defaultVersion: '5.1.2',
  featured: false,
  availableInWorker: false,
  versions: [{ version: '5.1.2', isDefault: true, supported: true }],
  requiredInputs: ['admin_email', 'site_title', 'admin_user'],
  inputSpecs: {
    admin_email: { type: 'email', label: 'Admin email' },
    site_title: { type: 'text', label: 'Site title', maxLen: 100 },
    admin_user: { type: 'text', label: 'Admin username', minLen: 3, maxLen: 60 },
  },
  adminUserDenylist: ['admin', 'administrator'],
  runtime: { language: 'php', minVersion: '8.1' },
  stores: { mysql: { required: true, minVersion: '8.0' } },
  adminPath: '/administrator',
  manifestRevision: 'v1-2026-06-01',
};

export interface AppsState {
  /** Every app with its install spec (the detail answer). */
  catalog: Json[];
  /** Installs requested, as the API answers them. */
  installs: Json[];
  /** The install each idempotency key created. */
  byKey: Map<string, Json>;
}

export function appsState(api: MockApi): AppsState {
  return api.state<AppsState>('apps', () => ({
    catalog: [structuredClone(WORDPRESS_APP), structuredClone(JOOMLA_APP)],
    installs: [],
    byKey: new Map(),
  }));
}

/** Replaces the app catalog. */
export function seedApps(api: MockApi, catalog: Json[]): void {
  appsState(api).catalog = catalog;
}

const error = (status: number, code: string, message: string, extra: Json = {}): MockAnswer => ({
  status,
  body: { error: true, code, message, ...extra },
});

const OPERATIONAL = new Set(['active', 'running', 'succeeded']);

function installApp(api: MockApi, uuid: string, request: { body: unknown; key: unknown }) {
  const state = appsState(api);
  const server = api.provisions.find((p) => p.uuid === uuid);
  if (!server) return notFound('Provision not found');
  if (typeof request.key === 'string' && state.byKey.has(request.key)) {
    return { status: 201, body: { data: state.byKey.get(request.key) } };
  }
  const body = isRecord(request.body) ? request.body : {};
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const host = typeof body.host === 'string' ? body.host : '';
  const inputs = isRecord(body.inputs) ? (body.inputs as Record<string, string>) : null;
  if (!slug || !host || !inputs) {
    return { status: 400, body: { error: true, message: 'Validation error' } };
  }
  if (!OPERATIONAL.has(server.status)) {
    return error(
      409,
      'provision_not_ready',
      `Provision not ready for app installs (current status: ${server.status}).`,
    );
  }
  const app = state.catalog.find((entry) => entry.slug === slug);
  if (!app) return error(400, 'unknown_slug', `Unknown app slug "${slug}".`, { field: 'slug' });
  const version = typeof body.version === 'string' ? body.version : String(app.defaultVersion);
  const versions = Array.isArray(app.versions) ? app.versions.filter(isRecord) : [];
  if (!versions.some((v) => v.version === version && v.supported === true)) {
    return error(400, 'unsupported_version', `Unsupported version "${version}".`, {
      field: 'version',
    });
  }
  for (const name of (app.requiredInputs as string[]) ?? []) {
    if (!inputs[name]) {
      return error(400, 'missing_required_input', `Missing required input: ${name}`, {
        field: `inputs.${name}`,
      });
    }
  }
  const denylist = (app.adminUserDenylist as string[]) ?? [];
  if (denylist.includes(String(inputs.admin_user ?? '').toLowerCase())) {
    return error(400, 'admin_user_denylisted', 'Choose a different admin username.', {
      field: 'inputs.admin_user',
    });
  }
  if (!(hostsOf(api, uuid) ?? []).includes(host)) {
    return error(400, 'invalid_host', 'Host not registered on this provision.', {
      field: 'host',
    });
  }
  const existing = state.installs.find((i) => i.provisionUuid === uuid && i.host === host);
  if (existing) {
    return error(
      409,
      'host_has_active_install',
      'Another app is already installed on this domain.',
      {
        existingAppInstallUuid: existing.appInstallUuid,
        existingSlug: existing.slug,
      },
    );
  }
  const data: Json = {
    appInstallUuid: `01970000-0000-7000-8000-0000000b${String(state.installs.length + 1).padStart(4, '0')}`,
    provisionUuid: uuid,
    customerId: api.me.customer_uuid,
    host,
    slug,
    version,
    manifestRevision: app.manifestRevision,
    status: 'pending',
    inputs,
    createdAt: 1760702400000,
    updatedAt: 1760702400000,
  };
  state.installs.push(data);
  if (typeof request.key === 'string') state.byKey.set(request.key, data);
  return { status: 201, body: { data } };
}

/** Routes of the simulated API for the apps commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    const state = appsState(api);
    if (request.method === 'GET' && request.path === '/customer/apps/catalog') {
      const data = state.catalog.map((entry) =>
        Object.fromEntries(ENTRY_FIELDS.map((field) => [field, entry[field]])),
      );
      return { status: 200, body: { data, meta: { total: data.length } } };
    }
    let match = /^\/customer\/apps\/([^/]+)$/.exec(request.path);
    if (match && request.method === 'GET') {
      const slug = decodeURIComponent(match[1]!);
      const app = state.catalog.find((entry) => entry.slug === slug);
      return app ? { status: 200, body: { data: app } } : notFound('App not found in catalog');
    }
    match = /^\/customer\/provisions\/([^/]+)\/apps\/install$/.exec(request.path);
    if (match && request.method === 'POST') {
      return installApp(api, decodeURIComponent(match[1]!), {
        body: request.body,
        key: request.headers['idempotency-key'],
      });
    }
    return undefined;
  });
}
