// `bladecp partner webhooks`: the HTTPS endpoints that receive the events
// BladeCP sends to a partner's systems (the same ones the BladeCP WHMCS module
// uses), their signing secrets and the deliveries. A signing secret shows only
// once, when the endpoint is created or the secret is replaced; with --json it
// is in `data`. A replayed delivery keeps the event ID, so receivers dedupe.

import { randomUUID } from 'node:crypto';

import {
  type BladecpApi,
  dataList,
  dataObject,
  invalidResponse,
  isRecord,
  type Json,
  requireStrings,
} from '../api.js';
import { assertUuidArg, type OptionValues } from '../args.js';
import type { Ctx } from '../context.js';
import { ApiError, ExitCode } from '../errors.js';
import { formatDate, shortIds } from '../format.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import { resolveId } from '../ids.js';
import {
  type Column,
  type DetailRow,
  type Next,
  showDetail,
  showDone,
  showList,
  showOnce,
  statusColumn,
  statusTone,
  type Tone,
} from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  optFlag,
  optInteger,
  optList,
  optString,
  partnerOnly,
  requireOption,
  signedInApi,
  usageError,
} from './common.js';

// ------------------------------------------------------------------ values

interface Endpoint extends Json {
  uuid: string;
  url: string;
  events: unknown[];
  active?: unknown;
  description?: unknown;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function checkEndpoint(value: unknown): Endpoint {
  if (!isRecord(value)) throw invalidResponse();
  requireStrings(value, ['uuid', 'url']);
  if (!Array.isArray(value.events)) throw invalidResponse();
  return value as Endpoint;
}

const isActive = (endpoint: Endpoint) => endpoint.active !== false;

function eventsText(endpoint: Endpoint): string {
  const events = endpoint.events.filter((event): event is string => typeof event === 'string');
  return events.length > 0 ? events.join(', ') : '-';
}

function activeLabel(t: Translator, endpoint: Endpoint): string {
  return t(isActive(endpoint) ? 'partnerWebhooks.status.active' : 'partnerWebhooks.status.paused');
}

const activeTone = (endpoint: Endpoint): Tone => (isActive(endpoint) ? 'ok' : 'warn');

/** BladeCP cannot seal signing secrets right now (its key): say so, not "try again". */
function signingUnavailable(error: unknown): never {
  if (error instanceof ApiError && error.apiCode === 'webhook_secrets_unavailable') {
    error.extraHint = { key: 'partnerWebhooks.hint.signingUnavailable' };
  }
  throw error;
}

/** The short form of one ID, as the lists show it. */
const short = (uuid: string) => shortIds([uuid]).get(uuid) ?? uuid;

/** An https address (the API refuses any other). */
function checkUrl(raw: string): string {
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw usageError('partnerWebhooks.error.url', { value: raw });
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw usageError('partnerWebhooks.error.url', { value: raw });
  }
  return value;
}

/** Event types look like provision.created; the API checks the list itself. */
const EVENT_TYPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/** `--event a --event b` or `--event a,b`, without repeats. */
function readEvents(values: OptionValues): string[] {
  const events = optList(values, 'event')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '');
  for (const event of events) {
    if (!EVENT_TYPE.test(event)) throw usageError('partnerWebhooks.error.event', { value: event });
  }
  return [...new Set(events)];
}

/** `--name`: saved as the description of the endpoint (up to 255 characters). */
function readName(values: OptionValues): string | undefined {
  const name = optString(values, 'name');
  if (name === undefined) return undefined;
  const value = name.trim();
  if (value.length > 255) throw usageError('partnerWebhooks.error.nameLong');
  return value;
}

// ------------------------------------------------------------------- calls

async function listEndpoints(api: BladecpApi): Promise<Endpoint[]> {
  return dataList(await api.request('getWebhook-endpoints')).map(checkEndpoint);
}

/** An endpoint by its ID or the first characters of it (at least 4). */
async function findEndpoint(api: BladecpApi, arg: string): Promise<Endpoint> {
  const value = assertUuidArg(arg);
  let listed: Endpoint[] | undefined;
  const uuid = await resolveId(value, async () => {
    listed = await listEndpoints(api);
    return listed;
  });
  const found = listed?.find((endpoint) => endpoint.uuid === uuid);
  if (found) return found;
  return checkEndpoint(
    dataObject(await api.request('getWebhook-endpointsById', { params: { id: uuid } })),
  );
}

function declined(ctx: Ctx, asked: boolean): number {
  showDone(ctx.out, {
    text: ctx.out.t('partnerWebhooks.declined'),
    tone: 'faint',
    afterQuestion: asked,
  });
  return ExitCode.OK;
}

// --------------------------------------------------------------- endpoints

async function listCommand(ctx: Ctx): Promise<number> {
  const api = await signedInApi(ctx);
  const endpoints = await partnerOnly(api, () => listEndpoints(api));
  if (ctx.json) return emitData(ctx, endpoints);
  const t = ctx.out.t;
  const ids = shortIds(endpoints.map((endpoint) => endpoint.uuid));
  const columns: Column<Endpoint>[] = [
    {
      header: t('column.id'),
      value: (e) => ids.get(e.uuid) ?? e.uuid,
      plain: (e) => e.uuid,
      paint: (k, value) => k.violet(value),
      priority: 5,
    },
    // Flexible columns give up width in order: the name before the address.
    {
      header: t('partnerWebhooks.column.name'),
      value: (e) => text(e.description) ?? '-',
      priority: 1,
      flex: true,
      min: 8,
    },
    {
      header: t('partnerWebhooks.column.url'),
      value: (e) => e.url,
      priority: 4,
      flex: true,
      min: 12,
    },
    {
      header: t('partnerWebhooks.column.events'),
      value: (e) => String(e.events.length),
      plain: (e) => eventsText(e),
      priority: 2,
      align: 'right',
    },
    statusColumn<Endpoint>(t('column.status'), (e) => activeLabel(t, e), activeTone, 3),
  ];
  const count = endpoints.length;
  showList(ctx.out, {
    items: endpoints,
    columns,
    empty: t('partnerWebhooks.list.empty'),
    summary: t(count === 1 ? 'partnerWebhooks.list.countOne' : 'partnerWebhooks.list.countMany', {
      count,
    }),
    next:
      count > 0
        ? [
            {
              text: t('partnerWebhooks.next.deliveries'),
              command: 'bladecp partner webhooks deliveries',
            },
          ]
        : [
            {
              text: t('partnerWebhooks.next.create'),
              command:
                'bladecp partner webhooks create --url https://example.com/bladecp --event invoice.paid',
            },
          ],
  });
  return ExitCode.OK;
}

async function showCommand(ctx: Ctx, arg: string): Promise<number> {
  const api = await signedInApi(ctx);
  const endpoint = await partnerOnly(api, () => findEndpoint(api, arg));
  if (ctx.json) return emitData(ctx, endpoint);
  const t = ctx.out.t;
  const name = text(endpoint.description);
  const rows: DetailRow[] = [
    [t('label.id'), endpoint.uuid],
    // The address is the title on a terminal; the plain layout has no title.
    ...(ctx.out.rich ? [] : [[t('partnerWebhooks.label.url'), endpoint.url] as DetailRow]),
    ...(name ? [[t('partnerWebhooks.label.name'), name] as DetailRow] : []),
    [t('partnerWebhooks.label.events'), eventsText(endpoint)],
    [t('partnerWebhooks.label.created'), formatDate(text(endpoint.createdAt), ctx.lang)],
    [t('partnerWebhooks.label.updated'), formatDate(text(endpoint.updatedAt), ctx.lang)],
  ];
  showDetail(ctx.out, {
    title: endpoint.url,
    status: {
      label: t('label.status'),
      text: activeLabel(t, endpoint),
      tone: activeTone(endpoint),
    },
    rows,
    next: [
      {
        text: t('partnerWebhooks.next.deliveries'),
        command: `bladecp partner webhooks deliveries --endpoint ${short(endpoint.uuid)}`,
      },
    ],
  });
  return ExitCode.OK;
}

/** The new signing secret, set apart; without a terminal, alone on stdout. */
function showSecret(ctx: Ctx, secret: string, note: string): void {
  showOnce(ctx.out, { label: ctx.out.t('partnerWebhooks.secret.label'), value: secret, note });
}

async function createCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const url = checkUrl(requireOption(values, 'url'));
  const events = readEvents(values);
  if (events.length === 0) throw usageError('error.missingOption', { option: '--event' });
  const name = readName(values);
  const api = await signedInApi(ctx);
  const data = dataObject(
    await partnerOnly(api, () =>
      api
        .request('postWebhook-endpoints', {
          body: { url, events, ...(name ? { description: name } : {}) },
          idempotencyKey: randomUUID(),
        })
        .catch(signingUnavailable),
    ),
  );
  requireStrings(data, ['uuid', 'secret']);
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const uuid = data.uuid as string;
  const shown = text(data.url) ?? url;
  if (ctx.out.rich) {
    showDone(ctx.out, { text: t('partnerWebhooks.created', { url: shown }) });
    showSecret(ctx, data.secret as string, t('partnerWebhooks.secret.note', { id: short(uuid) }));
  } else {
    // stdout gets the secret alone (`secret=$(bladecp partner webhooks create ...)`).
    ctx.out.info(t('partnerWebhooks.createdPlain', { id: uuid, url: shown }));
    showSecret(ctx, data.secret as string, t('partnerWebhooks.secret.note', { id: uuid }));
  }
  return ExitCode.OK;
}

async function updateCommand(ctx: Ctx, arg: string, values: OptionValues): Promise<number> {
  const body: Record<string, unknown> = {};
  const rawUrl = optString(values, 'url');
  if (rawUrl !== undefined) body.url = checkUrl(rawUrl);
  const events = readEvents(values);
  if (optList(values, 'event').length > 0) {
    if (events.length === 0) throw usageError('error.missingOption', { option: '--event' });
    body.events = events;
  }
  const name = readName(values);
  if (name !== undefined) body.description = name;
  if (Object.keys(body).length === 0) throw usageError('partnerWebhooks.error.nothing');
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const endpoint = await findEndpoint(api, arg);
    const t = ctx.out.t;
    const detail: string[] = [];
    if (typeof body.url === 'string')
      detail.push(t('partnerWebhooks.update.url', { url: body.url }));
    if (body.events) detail.push(t('partnerWebhooks.update.events', { events: events.join(', ') }));
    if (name !== undefined) {
      detail.push(
        name ? t('partnerWebhooks.update.name', { name }) : t('partnerWebhooks.update.noName'),
      );
    }
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerWebhooks.update.question', { url: endpoint.url }),
      detail,
      yes: optFlag(values, 'yes'),
      defaultYes: true,
    });
    if (!go) return declined(ctx, asked);
    const updated = checkEndpoint(
      dataObject(
        await api.request('patchWebhook-endpointsById', {
          params: { id: endpoint.uuid },
          body,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    if (ctx.json) return emitData(ctx, updated);
    showDone(ctx.out, {
      text: t('partnerWebhooks.updated', { url: updated.url }),
      afterQuestion: asked,
      next: [
        {
          text: t('partnerWebhooks.next.show'),
          command: `bladecp partner webhooks show ${short(updated.uuid)}`,
        },
      ],
    });
    return ExitCode.OK;
  });
}

/** `pause` and `resume`: the `active` field of the endpoint. */
async function setActiveCommand(
  ctx: Ctx,
  arg: string,
  values: OptionValues,
  active: boolean,
): Promise<number> {
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const endpoint = await findEndpoint(api, arg);
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t(active ? 'partnerWebhooks.resume.question' : 'partnerWebhooks.pause.question', {
        url: endpoint.url,
      }),
      detail: [t(active ? 'partnerWebhooks.resume.detail' : 'partnerWebhooks.pause.detail')],
      yes: optFlag(values, 'yes'),
      // Pausing stops deliveries (events in the meantime are not sent later).
      defaultYes: active,
    });
    if (!go) return declined(ctx, asked);
    const updated = checkEndpoint(
      dataObject(
        await api.request('patchWebhook-endpointsById', {
          params: { id: endpoint.uuid },
          body: { active },
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    if (ctx.json) return emitData(ctx, updated);
    showDone(ctx.out, {
      text: t(active ? 'partnerWebhooks.resumed' : 'partnerWebhooks.paused', { url: updated.url }),
      afterQuestion: asked,
      next: active
        ? []
        : [
            {
              text: t('partnerWebhooks.next.resume'),
              command: `bladecp partner webhooks resume ${short(updated.uuid)}`,
            },
          ],
    });
    return ExitCode.OK;
  });
}

async function deleteCommand(ctx: Ctx, arg: string, values: OptionValues): Promise<number> {
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const endpoint = await findEndpoint(api, arg);
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerWebhooks.delete.question', { url: endpoint.url }),
      detail: [t('partnerWebhooks.delete.detail')],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) return declined(ctx, asked);
    const data = dataObject(
      await api.request('deleteWebhook-endpointsById', {
        params: { id: endpoint.uuid },
        idempotencyKey: randomUUID(),
      }),
    );
    if (ctx.json) return emitData(ctx, data);
    showDone(ctx.out, {
      text: t('partnerWebhooks.deleted', { url: endpoint.url }),
      afterQuestion: asked,
    });
    return ExitCode.OK;
  });
}

async function rotateCommand(ctx: Ctx, arg: string, values: OptionValues): Promise<number> {
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const endpoint = await findEndpoint(api, arg);
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerWebhooks.rotate.question', { url: endpoint.url }),
      detail: [t('partnerWebhooks.rotate.detail')],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) return declined(ctx, asked);
    const data = dataObject(
      await api
        .request('postWebhook-endpointsByIdRotate-secret', {
          params: { id: endpoint.uuid },
          idempotencyKey: randomUUID(),
        })
        .catch(signingUnavailable),
    );
    requireStrings(data, ['secret']);
    if (ctx.json) return emitData(ctx, data);
    const done = t('partnerWebhooks.rotated', { url: endpoint.url });
    if (ctx.out.rich) showDone(ctx.out, { text: done, afterQuestion: asked });
    else ctx.out.info(done);
    showSecret(ctx, data.secret as string, t('partnerWebhooks.secret.rotatedNote'));
    return ExitCode.OK;
  });
}

// -------------------------------------------------------------- deliveries

const DELIVERY: Record<string, [MessageKey, Tone]> = {
  pending: ['partnerWebhooks.delivery.pending', 'warn'],
  delivering: ['partnerWebhooks.delivery.delivering', 'warn'],
  succeeded: ['partnerWebhooks.delivery.succeeded', 'ok'],
  failed: ['partnerWebhooks.delivery.failed', 'err'],
  dead: ['partnerWebhooks.delivery.dead', 'err'],
};

function deliveryLabel(t: Translator, status: unknown): string {
  const value = text(status) ?? '';
  const known = DELIVERY[value];
  return known ? t(known[0]) : value || '-';
}

function deliveryTone(status: unknown): Tone {
  const value = text(status) ?? '';
  return DELIVERY[value]?.[1] ?? statusTone(value);
}

/** `--page` and `--limit` (the API caps a page at 100). */
function paging(values: OptionValues): { page?: number; limit?: number } {
  const page = optInteger(values, 'page');
  if (page !== undefined && page < 1) {
    throw usageError('partnerWebhooks.error.page', { value: optString(values, 'page') ?? '' });
  }
  const limit = optInteger(values, 'limit');
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw usageError('partnerWebhooks.error.limit', { value: optString(values, 'limit') ?? '' });
  }
  return {
    ...(page !== undefined ? { page } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function checkDeliveries(body: unknown): Json[] {
  const items = dataList(body);
  for (const item of items) requireStrings(item, ['uuid']);
  return items;
}

/** The recent deliveries a short delivery ID is looked up in (the API's largest page). */
async function recentDeliveries(api: BladecpApi): Promise<Json[]> {
  return checkDeliveries(await api.request('getWebhook-deliveries', { query: { limit: 100 } }));
}

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

async function deliveriesCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const rawStatus = optString(values, 'status');
  const status = rawStatus?.trim().toLowerCase();
  if (status !== undefined && !(status in DELIVERY)) {
    throw usageError('partnerWebhooks.error.status', { value: rawStatus ?? '' });
  }
  const { page, limit } = paging(values);
  const endpointArg = optString(values, 'endpoint')?.trim();
  if (endpointArg !== undefined) assertUuidArg(endpointArg);
  const api = await signedInApi(ctx);
  const { items, meta } = await partnerOnly(api, async () => {
    const endpointId = endpointArg
      ? await resolveId(endpointArg, () => listEndpoints(api))
      : undefined;
    const body = await api.request('getWebhook-deliveries', {
      query: { endpoint_id: endpointId, status, page, limit },
    });
    return {
      items: checkDeliveries(body),
      meta: isRecord(body) && isRecord(body.meta) ? body.meta : null,
    };
  });
  if (ctx.json) return emitData(ctx, { items, meta });
  const t = ctx.out.t;
  const lang = ctx.lang;
  const ids = shortIds(items.map((item) => item.uuid as string));
  const id = (item: Json) => ids.get(item.uuid as string) ?? (item.uuid as string);
  const total = amount(meta?.total) ?? items.length;
  const current = amount(meta?.page) ?? 1;
  const pages = Math.max(1, amount(meta?.totalPages) ?? 1);
  const counted = t(
    total === 1 ? 'partnerWebhooks.deliveries.countOne' : 'partnerWebhooks.deliveries.countMany',
    { count: total },
  );
  const next: Next[] = [];
  const failed = items.find((item) => item.status === 'failed' || item.status === 'dead');
  if (failed) {
    next.push({
      text: t('partnerWebhooks.next.replay'),
      command: `bladecp partner webhooks replay ${id(failed)}`,
    });
  }
  if (current < pages) {
    const parts = ['bladecp partner webhooks deliveries'];
    if (endpointArg) parts.push(`--endpoint ${endpointArg}`);
    if (status) parts.push(`--status ${status}`);
    if (limit !== undefined) parts.push(`--limit ${limit}`);
    parts.push(`--page ${current + 1}`);
    next.push({ text: t('partnerWebhooks.next.page'), command: parts.join(' ') });
  }
  const columns: Column<Json>[] = [
    {
      header: t('column.id'),
      value: id,
      plain: (d) => d.uuid as string,
      paint: (k, value) => k.violet(value),
      priority: 5,
    },
    {
      header: t('partnerWebhooks.column.event'),
      value: (d) => text(d.eventType) ?? '-',
      priority: 4,
      flex: true,
      min: 10,
    },
    statusColumn<Json>(
      t('column.status'),
      (d) => deliveryLabel(t, d.status),
      (d) => deliveryTone(d.status),
      3,
    ),
    {
      header: t('partnerWebhooks.column.attempts'),
      value: (d) => String(amount(d.attempt) ?? '-'),
      priority: 1,
      align: 'right',
    },
    {
      header: t('partnerWebhooks.column.answer'),
      value: (d) => String(amount(d.responseCode) ?? '-'),
      priority: 2,
    },
    {
      header: t('partnerWebhooks.column.when'),
      value: (d) => formatDate(text(d.updatedAt) ?? text(d.createdAt), lang),
      priority: 2,
    },
    {
      header: t('partnerWebhooks.column.next'),
      value: (d) => formatDate(text(d.nextAttemptAt), lang),
      priority: 0,
    },
    {
      header: t('partnerWebhooks.column.error'),
      value: (d) => text(d.lastError) ?? '-',
      priority: 0,
      flex: true,
      min: 10,
    },
  ];
  showList(ctx.out, {
    items,
    columns,
    empty:
      status || endpointArg
        ? t('partnerWebhooks.deliveries.emptyFiltered')
        : t('partnerWebhooks.deliveries.empty'),
    summary:
      pages > 1
        ? `${counted} · ${t('partnerWebhooks.deliveries.page', { page: current, pages })}`
        : counted,
    next,
  });
  return ExitCode.OK;
}

async function replayCommand(ctx: Ctx, arg: string, values: OptionValues): Promise<number> {
  const value = assertUuidArg(arg);
  const yes = optFlag(values, 'yes');
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    let recent: Json[] | undefined;
    const lookup = async () => {
      recent ??= await recentDeliveries(api);
      return recent as { uuid: string }[];
    };
    const uuid = await resolveId(value, lookup);
    const t = ctx.out.t;
    let event: string | null = null;
    // The question names the event when the delivery is among the recent ones.
    if (ctx.interactive && !yes) {
      await lookup();
      event = text(recent?.find((d) => d.uuid === uuid)?.eventType);
    }
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerWebhooks.replay.question', { id: short(uuid) }),
      detail: [
        event
          ? t('partnerWebhooks.replay.detailEvent', { event })
          : t('partnerWebhooks.replay.detail'),
      ],
      yes,
      defaultYes: true,
    });
    if (!go) return declined(ctx, asked);
    const data = dataObject(
      await api.request('postWebhook-deliveriesByIdReplay', {
        params: { id: uuid },
        idempotencyKey: randomUUID(),
      }),
    );
    requireStrings(data, ['uuid']);
    if (ctx.json) return emitData(ctx, data);
    showDone(ctx.out, {
      text: t('partnerWebhooks.replayed', {
        id: short(data.uuid as string),
        event: short(text(data.eventId) ?? '-'),
      }),
      afterQuestion: asked,
      next: [
        { text: t('partnerWebhooks.next.follow'), command: 'bladecp partner webhooks deliveries' },
      ],
    });
    return ExitCode.OK;
  });
}

export const handlers: Handlers = {
  'partner.webhooks.list': (ctx) => listCommand(ctx),
  'partner.webhooks.show': (ctx, { args }) => showCommand(ctx, args[0]!),
  'partner.webhooks.create': (ctx, { values }) => createCommand(ctx, values),
  'partner.webhooks.update': (ctx, { args, values }) => updateCommand(ctx, args[0]!, values),
  'partner.webhooks.pause': (ctx, { args, values }) =>
    setActiveCommand(ctx, args[0]!, values, false),
  'partner.webhooks.resume': (ctx, { args, values }) =>
    setActiveCommand(ctx, args[0]!, values, true),
  'partner.webhooks.delete': (ctx, { args, values }) => deleteCommand(ctx, args[0]!, values),
  'partner.webhooks.rotate-secret': (ctx, { args, values }) => rotateCommand(ctx, args[0]!, values),
  'partner.webhooks.deliveries': (ctx, { values }) => deliveriesCommand(ctx, values),
  'partner.webhooks.replay': (ctx, { args, values }) => replayCommand(ctx, args[0]!, values),
};
