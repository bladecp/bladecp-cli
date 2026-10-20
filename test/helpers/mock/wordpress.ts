import { type Json, provisionDomain } from '../../../src/api.js';
import { type MockAnswer, type MockApi, notFound } from '../mock-api.js';

type Command = 'dashboard-snapshot' | 'core-update' | 'plugin-update' | 'theme-update';

interface MockTask {
  id: string;
  uuid: string;
  command: Command;
  args: Record<string, string>;
  /** Statuses the task walks through, one per read; it stays on the last one. */
  script: string[];
  step: number;
}

export const SNAPSHOT: Json = {
  coreVersion: '6.5.2',
  plugins: [
    {
      slug: 'akismet',
      name: 'Akismet Anti-spam',
      version: '5.3',
      active: true,
      updateAvailable: true,
      updateVersion: '5.3.1',
    },
    {
      slug: 'woocommerce',
      name: 'WooCommerce',
      version: '9.1.2',
      active: true,
      updateAvailable: false,
      updateVersion: null,
    },
    {
      slug: 'wordpress-seo',
      name: 'Yoast SEO',
      version: '23.0',
      active: true,
      updateAvailable: true,
      updateVersion: '23.4',
    },
    {
      slug: 'hello-dolly',
      name: 'Hello Dolly',
      version: '1.7.2',
      active: false,
      updateAvailable: false,
      updateVersion: null,
    },
  ],
  themes: [
    {
      slug: 'twentytwentyfour',
      name: 'Twenty Twenty-Four',
      version: '1.2',
      active: true,
      updateAvailable: false,
      updateVersion: null,
    },
    {
      slug: 'astra',
      name: 'Astra',
      version: '4.6.0',
      active: false,
      updateAvailable: true,
      updateVersion: '4.8.1',
    },
  ],
};

/** The overview as the API projects it: the inventory and what has updates. */
export function snapshotResult(snapshot: Json, coreUpdates: string[] = ['6.6.2']): Json {
  const items = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);
  return {
    ...snapshot,
    updates: {
      core: coreUpdates.map((version) => ({ version, locale: null })),
      plugins: items(snapshot.plugins).filter((item) => item.updateAvailable),
      themes: items(snapshot.themes).filter((item) => item.updateAvailable),
    },
  };
}

export interface WordpressState {
  /** The service ID of each server in the billing system (external_service_id). */
  services: Map<string, string>;
  /** Servers whose WordPress tools do not work, and why. */
  unavailable: Map<string, 'toolkit_unavailable' | 'docroot_unavailable'>;
  /** Statuses a new task walks through after it is queued, one per read. */
  script: string[];
  /** The result of a finished overview. */
  snapshot: Json;
  tasks: Map<string, MockTask>;
  byKey: Map<string, string>;
  counter: number;
}

/** The service ID the first server of the account has in the billing system. */
export const SERVICE_ID = '1042';

export function wordpressState(api: MockApi): WordpressState {
  return api.state<WordpressState>('wordpress', () => ({
    services: new Map(api.provisions[0] ? [[api.provisions[0].uuid, SERVICE_ID]] : []),
    unavailable: new Map(),
    script: ['running', 'succeeded'],
    snapshot: snapshotResult(SNAPSHOT),
    tasks: new Map(),
    byKey: new Map(),
    counter: 0,
  }));
}

/** Links a server to its service ID in the billing system. */
export function linkService(api: MockApi, uuid: string, externalId: string): void {
  wordpressState(api).services.set(uuid, externalId);
}

/** A task that already exists, as a test needs it. */
export function addTask(
  api: MockApi,
  task: { id: string; uuid: string; command: Command; script: string[] },
): void {
  wordpressState(api).tasks.set(task.id, { ...task, args: {}, step: 0 });
}

function nextId(state: WordpressState): string {
  state.counter += 1;
  return `01979c4e-0000-7000-8000-${String(state.counter).padStart(12, '0')}`;
}

const STARTED = '2026-10-17T12:00:00.000Z';
const FINISHED = '2026-10-17T12:00:04.000Z';
const FINAL = new Set(['succeeded', 'failed', 'timeout', 'cancelled']);

function present(state: WordpressState, task: MockTask): Json {
  const status = task.script[Math.min(task.step, task.script.length - 1)] ?? 'queued';
  const failed = status === 'failed' || status === 'timeout';
  return {
    id: task.id,
    command: task.command,
    status,
    errorCode: status === 'timeout' ? 'timeout' : failed ? 'command_failed' : null,
    errorMessage: failed ? 'WordPress command could not be completed.' : null,
    dispatchedAt: status === 'queued' ? null : STARTED,
    completedAt: FINAL.has(status) ? FINISHED : null,
    result: status === 'succeeded' && task.command === 'dashboard-snapshot' ? state.snapshot : null,
  };
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bad = (message: string): MockAnswer => ({ status: 400, body: { error: true, message } });

/** Routes of the simulated API for the wordpress commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    const match = /^\/customer\/provisions\/([^/]+)\/wordpress(\/.*)?$/.exec(request.path);
    if (!match) return undefined;
    const state = wordpressState(api);
    const uuid = decodeURIComponent(match[1]!);
    const rest = match[2] ?? '';
    // The owner of the server may leave the billing service out; a partner
    // always names it, and it must be this server's.
    const external = request.query.get('external_service_id');
    if (!external && api.partner) {
      return {
        status: 400,
        body: {
          error: true,
          code: 'external_service_id_required',
          message: 'external_service_id is required for a provision you do not own',
        },
      };
    }
    const server = api.provisions.find((p) => p.uuid === uuid);
    if (!server || (external && state.services.get(uuid) !== external)) {
      return notFound('Provision not found');
    }
    const reason = state.unavailable.get(uuid) ?? null;

    if (request.method === 'GET' && rest === '') {
      return {
        status: 200,
        body: {
          data: {
            available: reason === null,
            reason,
            primaryDomain: reason === 'docroot_unavailable' ? null : provisionDomain(server),
          },
        },
      };
    }

    const commandMatch = /^\/commands\/([^/]+)$/.exec(rest);
    if (request.method === 'GET' && commandMatch) {
      const id = decodeURIComponent(commandMatch[1]!);
      if (!UUID.test(id)) return bad('Invalid command id');
      const task = state.tasks.get(id);
      if (!task || task.uuid !== uuid) return notFound('Command not found');
      const answer = present(state, task);
      task.step = Math.min(task.step + 1, task.script.length - 1);
      return { status: 200, body: { data: answer } };
    }

    if (request.method !== 'POST') return undefined;
    let command: Command | null = null;
    const args: Record<string, string> = {};
    if (rest === '/dashboard') command = 'dashboard-snapshot';
    else if (rest === '/core/update') command = 'core-update';
    else {
      const item = /^\/(plugins|themes)\/([^/]+)\/update$/.exec(rest);
      if (item) {
        const slug = decodeURIComponent(item[2]!);
        if (!SLUG.test(slug)) return bad('Invalid WordPress slug');
        command = item[1] === 'plugins' ? 'plugin-update' : 'theme-update';
        args[item[1] === 'plugins' ? 'plugin_slug' : 'theme_slug'] = slug;
      }
    }
    if (!command) return undefined;
    if (reason) {
      return {
        status: 409,
        body: { error: true, code: reason, message: 'WordPress Toolkit is unavailable' },
      };
    }
    const key = request.headers['idempotency-key'];
    const known = typeof key === 'string' ? state.byKey.get(key) : undefined;
    if (known) return { status: 202, body: { data: { ok: true, commandId: known } } };
    const id = nextId(state);
    state.tasks.set(id, { id, uuid, command, args, script: ['queued', ...state.script], step: 1 });
    if (typeof key === 'string') state.byKey.set(key, id);
    return { status: 202, body: { data: { ok: true, commandId: id } } };
  });
}
