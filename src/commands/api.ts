// `bladecp api <path>`: one request to any Customer API route with the key in
// use, the answer printed as JSON. `bladecp api list`: the routes this version
// knows and the command that covers each one.

import { readFile } from 'node:fs/promises';

import { COVERAGE } from '../api/coverage.js';
import { OPERATIONS, type OperationId } from '../api/operations.js';
import type { HttpMethod } from '../api.js';
import { COMMANDS } from '../args.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ExitCode } from '../errors.js';
import { showDone, showList } from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  type Invocation,
  optFlag,
  optString,
  usageError,
} from './common.js';

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * The route as the API reads it: under /api/v1, a Customer API path, no
 * host, no `..`, nothing that could take the key elsewhere.
 */
export function normalizeApiPath(raw: string): string | null {
  let path = raw.trim();
  if (path.startsWith('/api/v1/')) path = path.slice('/api/v1'.length);
  if (!path.startsWith('/customer/') && path !== '/customer') return null;
  const [route = '', query] = path.split(/\?(.*)/s, 2);
  if (/[\s#\\]|\/\/|%2e|%2f/i.test(route)) return null;
  if (route.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  if (query !== undefined && /[\s#]/.test(query)) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

/** The operation a method and route match, when the table has it. */
export function matchOperation(method: string, path: string): OperationId | undefined {
  const route = path.split('?')[0] ?? path;
  for (const [id, op] of Object.entries(OPERATIONS)) {
    if (op.method !== method) continue;
    const pattern = new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (pattern.test(route)) return id as OperationId;
  }
  return undefined;
}

async function readBody(ctx: Ctx, data: string | undefined, input: string | undefined) {
  if (data !== undefined && input !== undefined) throw usageError('api.error.bodyTwice');
  let text: string | undefined = data;
  if (input !== undefined) {
    try {
      if (input === '-') {
        const chunks: Buffer[] = [];
        for await (const chunk of ctx.stdin) chunks.push(Buffer.from(chunk as Buffer));
        text = Buffer.concat(chunks).toString('utf8');
      } else {
        text = await readFile(input, 'utf8');
      }
    } catch {
      throw usageError('api.error.input', { file: input });
    }
  }
  if (text === undefined) return undefined;
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    throw usageError('api.error.json', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function callCommand(ctx: Ctx, invocation: Invocation): Promise<number> {
  const { values } = invocation;
  const raw = invocation.args[0]!;
  const path = normalizeApiPath(raw);
  if (!path) throw usageError('api.error.path', { path: raw });
  const body = await readBody(ctx, optString(values, 'data'), optString(values, 'input'));
  const given = optString(values, 'method')?.trim().toUpperCase();
  const method = (given ?? (body ? 'POST' : 'GET')) as HttpMethod;
  if (!METHODS.includes(method)) {
    throw usageError('api.error.method', { method: given ?? '' });
  }
  if (body && (method === 'GET' || method === 'DELETE')) {
    throw usageError('api.error.bodyNotAllowed', { method });
  }

  const operation = matchOperation(method, path);
  let apiKey: string | undefined;
  try {
    apiKey = (await resolveAuth(ctx)).apiKey;
  } catch (error) {
    // The routes that answer without a key (the connectivity check) run signed out too.
    if (!(operation && OPERATIONS[operation].public)) throw error;
  }
  const api = createApi(ctx, apiKey);

  if (method === 'DELETE') {
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t('api.confirm.delete', { path }),
      detail: [t('api.confirm.detail')],
      yes: optFlag(values, 'yes'),
    });
    if (!go) {
      showDone(ctx.out, { text: t('api.declined'), tone: 'faint', afterQuestion: asked });
      return ExitCode.OK;
    }
  }

  const answer = await api.client.call<unknown>(method, path, {
    ...(body ? { body: body.value } : {}),
    allowEmpty: true,
    retry: method === 'GET' ? 'safe' : 'once',
  });
  if (ctx.json) return emitData(ctx, answer ?? null);
  if (answer === undefined) {
    showDone(ctx.out, { text: ctx.out.t('api.empty') });
    return ExitCode.OK;
  }
  ctx.out.print(JSON.stringify(answer, null, 2));
  return ExitCode.OK;
}

interface Route {
  operationId: OperationId;
  method: string;
  path: string;
  command: string | null;
}

function routes(): Route[] {
  return (Object.keys(OPERATIONS) as OperationId[])
    .map((id) => {
      const coverage = COVERAGE[id];
      const spec =
        'command' in coverage ? COMMANDS.find((c) => c.id === coverage.command) : undefined;
      return {
        operationId: id,
        method: OPERATIONS[id].method,
        path: OPERATIONS[id].path,
        command: spec ? `bladecp ${spec.path.join(' ')}` : null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

async function listCommand(ctx: Ctx): Promise<number> {
  const list = routes();
  if (ctx.json) {
    return emitData(
      ctx,
      list.map((route) => {
        const op = OPERATIONS[route.operationId];
        const coverage = COVERAGE[route.operationId];
        return {
          ...route,
          group: op.tag,
          summary: op.summary,
          scopes: [...op.scopes],
          pathParams: [...op.pathParams],
          query: [...op.query],
          body: op.body,
          ...('api' in coverage ? { apiOnly: coverage.api } : {}),
        };
      }),
    );
  }
  const t = ctx.out.t;
  showList(ctx.out, {
    items: list,
    columns: [
      {
        header: t('api.list.column.method'),
        value: (r) => r.method,
        paint: (k, text) => k.violet(text),
        priority: 5,
      },
      { header: t('api.list.column.path'), value: (r) => r.path, priority: 4, flex: true, min: 30 },
      {
        header: t('api.list.column.command'),
        // Without the leading "bladecp", which every row would repeat.
        value: (r) => (r.command ?? 'bladecp api').replace(/^bladecp /, ''),
        paint: (k, text, r) => (r.command ? k.accent(text) : k.faint(text)),
        priority: 2,
        flex: true,
        min: 14,
      },
    ],
    empty: '',
    summary: t('api.list.summary', {
      count: list.length,
      covered: list.filter((r) => r.command).length,
    }),
    notes: [t('api.list.hint')],
  });
  return ExitCode.OK;
}

export const handlers: Handlers = {
  api: callCommand,
  'api.list': (ctx) => listCommand(ctx),
};
