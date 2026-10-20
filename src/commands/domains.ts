// `bladecp domains`: the domains of a server (the main one, the additional
// ones and the preview address), adding and removing additional domains, and
// checking whether a domain can be used on BladeCP before adding it.

import { randomUUID } from 'node:crypto';

import { type BladecpApi, dataObject, invalidResponse, isRecord, type Json } from '../api.js';
import type { Ctx } from '../context.js';
import { supportUrl } from '../endpoints.js';
import { ApiError, ExitCode } from '../errors.js';
import { shortIds } from '../format.js';
import { type Column, showDone, showList } from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  optFlag,
  serverId,
  signedInApi,
  usageError,
} from './common.js';

/** The domains of a server, as GET /customer/provisions/{uuid}/domains answers. */
export interface ServerDomains {
  primary: string;
  additional: string[];
  preview: string;
}

/** Reads the domains answer; the main domain is the one field the CLI cannot do without. */
export function readDomains(body: unknown): ServerDomains {
  const data = dataObject(body);
  if (typeof data.primary !== 'string') throw invalidResponse();
  const additional = Array.isArray(data.additional)
    ? data.additional.filter((host): host is string => typeof host === 'string' && host !== '')
    : [];
  return {
    primary: data.primary,
    additional,
    preview: typeof data.preview === 'string' ? data.preview : '',
  };
}

/** The domains of a server (also used by `bladecp apps install` to place an app). */
export async function serverDomains(api: BladecpApi, uuid: string): Promise<ServerDomains> {
  return readDomains(await api.request('getProvisionsByUuidDomains', { params: { uuid } }));
}

const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * A domain as the API reads it: trimmed, lowercase, without a scheme, path
 * or trailing dot, international names in their ASCII form. Null when what
 * is left is not a domain (an IP address, a port, a single word).
 */
export function normalizeHost(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.split(/[/?#]/, 1)[0] ?? '';
  value = value.replace(/\.$/, '');
  if (value === '' || /[@:\s]/.test(value)) return null;
  let host: string;
  try {
    host = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  return HOST.test(host) ? host : null;
}

/** The domain argument of a command, or a usage error that says how to write it. */
export function hostArg(raw: string): string {
  const host = normalizeHost(raw);
  if (!host) throw usageError('domains.error.host', { host: raw });
  return host;
}

/**
 * A value typed in a suggested command: kept as is when the shell reads it
 * the same way, quoted otherwise.
 */
export function shellArg(value: string): string {
  return /^[A-Za-z0-9._:@/=+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The server as the person typed it, ready to be part of a suggested command. */
export function serverWord(raw: string): string {
  return shellArg(raw.trim());
}

/** A short form of a whole ID, for questions and titles. */
export function shortId(uuid: string): string {
  return shortIds([uuid]).get(uuid) ?? uuid;
}

type Kind = 'primary' | 'additional' | 'preview';

interface Row {
  host: string;
  kind: Kind;
}

const KIND_KEYS = {
  primary: 'domains.kind.primary',
  additional: 'domains.kind.additional',
  preview: 'domains.kind.preview',
} as const;

function domainRows(domains: ServerDomains): Row[] {
  return [
    ...(domains.primary ? [{ host: domains.primary, kind: 'primary' as const }] : []),
    ...domains.additional.map((host) => ({ host, kind: 'additional' as const })),
    ...(domains.preview ? [{ host: domains.preview, kind: 'preview' as const }] : []),
  ];
}

function additionalCount(ctx: Ctx, count: number): string {
  const t = ctx.out.t;
  if (count === 0) return t('domains.additionalNone');
  return count === 1 ? t('domains.additionalOne') : t('domains.additionalMany', { count });
}

/** Adds what the person can do about an answer of the API that the CLI understands. */
function explainAddFailure(ctx: Ctx, error: unknown, host: string): void {
  if (!(error instanceof ApiError)) return;
  if (error.apiCode === 'zone_owned_by_other') {
    error.extraHint = { key: 'domains.hint.zone', vars: { support: supportUrl(ctx.hubUrl) } };
  } else if (error.apiCode === 'addon_domain_limit') {
    error.extraHint = { key: 'domains.hint.limit' };
  } else if (error.status === 409) {
    error.extraHint = { key: 'domains.hint.inUse', vars: { host } };
  }
}

/** The answer of an add or a remove: the API data, with the domain it was about. */
function actionData(body: unknown, host: string): Json {
  const data = isRecord(body) && isRecord(body.data) ? body.data : {};
  return { ...data, host: typeof data.host === 'string' && data.host ? data.host : host };
}

export const handlers: Handlers = {
  'domains.list': async (ctx, { args }) => {
    const api = await signedInApi(ctx);
    const uuid = await serverId(api, args[0]!);
    const domains = await serverDomains(api, uuid);
    if (ctx.json) return emitData(ctx, domains);
    const t = ctx.out.t;
    const columns: Column<Row>[] = [
      {
        header: t('column.domain'),
        value: (row) => row.host,
        paint: (k, text, row) => (row.kind === 'preview' ? k.muted(text) : text),
        priority: 5,
        flex: true,
        min: 16,
      },
      {
        header: t('domains.column.kind'),
        value: (row) => t(KIND_KEYS[row.kind]),
        paint: (k, text, row) => (row.kind === 'primary' ? k.violet(text) : k.muted(text)),
        priority: 3,
      },
    ];
    showList(ctx.out, {
      items: domainRows(domains),
      columns,
      empty: additionalCount(ctx, 0),
      summary: additionalCount(ctx, domains.additional.length),
      ...(domains.preview ? { notes: [t('domains.previewNote')] } : {}),
      next: [
        {
          text: t('domains.next.add'),
          command: `bladecp domains add ${serverWord(args[0]!)} <host>`,
        },
      ],
    });
    return ExitCode.OK;
  },

  'domains.add': async (ctx, { args }) => {
    const host = hostArg(args[1]!);
    const api = await signedInApi(ctx);
    const uuid = await serverId(api, args[0]!);
    let answer: unknown;
    try {
      answer = await api.request('postProvisionsByUuidDomains', {
        params: { uuid },
        body: { host },
        idempotencyKey: randomUUID(),
      });
    } catch (error) {
      explainAddFailure(ctx, error, host);
      throw error;
    }
    const data = actionData(answer, host);
    if (ctx.json) return emitData(ctx, data);
    const t = ctx.out.t;
    showDone(ctx.out, {
      text: t('domains.added', { host: String(data.host) }),
      next: [
        {
          text: t('domains.addedNext'),
          command: `bladecp domains list ${serverWord(args[0]!)}`,
        },
      ],
    });
    return ExitCode.OK;
  },

  'domains.remove': async (ctx, { args, values }) => {
    const host = hostArg(args[1]!);
    const api = await signedInApi(ctx);
    const uuid = await serverId(api, args[0]!);
    const before = await serverDomains(api, uuid);
    if (host === before.primary) throw usageError('domains.error.primary', { host });
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t('domains.removeAsk', { host }),
      detail: [t('domains.removeDetail', { server: before.primary || shortId(uuid) })],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) {
      showDone(ctx.out, { text: t('domains.declined'), tone: 'faint', afterQuestion: asked });
      return ExitCode.OK;
    }
    let answer: unknown;
    try {
      answer = await api.request('deleteProvisionsByUuidDomainsByHost', {
        params: { uuid, host },
        idempotencyKey: randomUUID(),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        error.extraHint = { key: 'domains.hint.list', vars: { server: serverWord(args[0]!) } };
      }
      throw error;
    }
    const data = actionData(answer, host);
    if (ctx.json) return emitData(ctx, data);
    showDone(ctx.out, {
      text: t('domains.removed', { host: String(data.host) }),
      afterQuestion: asked,
      next: [
        {
          text: t('domains.removedNext'),
          command: `bladecp domains list ${serverWord(args[0]!)}`,
        },
      ],
    });
    return ExitCode.OK;
  },

  'domains.check': async (ctx, { args }) => {
    const host = hostArg(args[0]!);
    const api = await signedInApi(ctx);
    const data = dataObject(
      await api.request('getProvisionsDomainsAvailability', { query: { host } }),
    );
    if (typeof data.available !== 'boolean') throw invalidResponse();
    const shown = typeof data.host === 'string' && data.host ? data.host : host;
    if (ctx.json) return emitData(ctx, { ...data, host: shown });
    const t = ctx.out.t;
    if (data.available) {
      showDone(ctx.out, {
        text: t('domains.available', { host: shown }),
        next: [
          {
            text: t('domains.availableNext'),
            command: `bladecp domains add <server> ${shellArg(shown)}`,
          },
        ],
      });
      return ExitCode.OK;
    }
    const reason = typeof data.reason === 'string' ? data.reason : '';
    showDone(ctx.out, {
      text: t('domains.unavailable', { host: shown }),
      tone: 'warn',
      next:
        reason === 'host_taken'
          ? [{ text: t('domains.reason.hostTaken'), command: 'bladecp servers' }]
          : reason === 'zone_owned_by_other'
            ? [{ text: t('domains.reason.zoneOther'), command: supportUrl(ctx.hubUrl) }]
            : [{ text: t('domains.reason.unknown') }],
    });
    return ExitCode.OK;
  },
};
