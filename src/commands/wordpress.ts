// `bladecp wordpress`: the WordPress tools of a server. Whether they work, an
// overview of the version, plugins and themes, updates of WordPress itself,
// of a plugin or of a theme, and how a requested task went. Every task runs
// on BladeCP in the background: --wait follows it to the end, otherwise the
// command says how to check it.
//
// On the person's own server nothing else is needed. A partner names the
// service of its billing system (`external_service_id`) with --external-id,
// and the API checks that it is this server.

import { randomUUID } from 'node:crypto';

import type { OperationId } from '../api/operations.js';
import { type BladecpApi, dataObject, invalidResponse, isRecord, type Json } from '../api.js';
import type { Ctx } from '../context.js';
import { supportUrl } from '../endpoints.js';
import { ApiError, ExitCode } from '../errors.js';
import { formatDate, formatDuration, type Tone } from '../format.js';
import type { MessageKey } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { fitTable, type Kit, kit } from '../ui/kit.js';
import { type DetailRow, type Next, showDetail, showDone } from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  type Invocation,
  optFlag,
  optString,
  serverId,
  signedInApi,
  usageError,
} from './common.js';
import { serverWord, shellArg, shortId } from './domains.js';

type Kind = 'dashboard-snapshot' | 'core-update' | 'plugin-update' | 'theme-update';

const REQUESTS = {
  'dashboard-snapshot': 'postProvisionsByUuidWordpressDashboard',
  'core-update': 'postProvisionsByUuidWordpressCoreUpdate',
  'plugin-update': 'postProvisionsByUuidWordpressPluginsBySlugUpdate',
  'theme-update': 'postProvisionsByUuidWordpressThemesBySlugUpdate',
} as const satisfies Record<Kind, OperationId>;

const KIND_KEYS: Record<string, MessageKey> = {
  'dashboard-snapshot': 'wordpress.kind.snapshot',
  'core-update': 'wordpress.kind.core',
  'plugin-update': 'wordpress.kind.plugin',
  'theme-update': 'wordpress.kind.theme',
};

const STATUS_KEYS: Record<string, MessageKey> = {
  queued: 'wordpress.taskStatus.queued',
  running: 'wordpress.taskStatus.running',
  succeeded: 'wordpress.taskStatus.succeeded',
  failed: 'wordpress.taskStatus.failed',
  timeout: 'wordpress.taskStatus.timeout',
  cancelled: 'wordpress.taskStatus.cancelled',
};

/** A task in one of these statuses will not change any more. */
const FINAL = new Set(['succeeded', 'failed', 'timeout', 'cancelled']);

/** How long --wait follows a task (BladeCP stops a task after 5 minutes). */
const MAX_WAIT_MS = 10 * 60_000;
const MAX_POLLS = 600;

interface Target {
  uuid: string;
  /** The server as the person typed it, ready for a suggested command. */
  server: string;
  /** The service in the partner's billing system, when one was given. */
  external?: string;
}

interface Item {
  slug: string;
  name: string;
  version: string;
  active: boolean;
  updateAvailable: boolean;
  updateVersion: string | null;
}

interface Snapshot {
  coreVersion: string | null;
  coreUpdates: string[];
  plugins: Item[];
  themes: Item[];
}

interface Task {
  id: string;
  command: string;
  status: string;
  errorCode: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  snapshot: Snapshot | null;
  raw: Json;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

function readItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    slug: text(item.slug),
    name: text(item.name) || text(item.slug),
    version: text(item.version),
    active: item.active === true,
    updateAvailable: item.updateAvailable === true,
    updateVersion: textOrNull(item.updateVersion),
  }));
}

function readSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value)) return null;
  const updates = isRecord(value.updates) ? value.updates : {};
  return {
    coreVersion: textOrNull(value.coreVersion),
    coreUpdates: (Array.isArray(updates.core) ? updates.core : [])
      .map((update) => (isRecord(update) ? text(update.version) : ''))
      .filter((version) => version !== ''),
    plugins: readItems(value.plugins),
    themes: readItems(value.themes),
  };
}

function readTask(data: Json): Task {
  if (typeof data.id !== 'string' || typeof data.status !== 'string') throw invalidResponse();
  return {
    id: data.id,
    command: text(data.command),
    status: data.status,
    errorCode: textOrNull(data.errorCode),
    dispatchedAt: textOrNull(data.dispatchedAt),
    completedAt: textOrNull(data.completedAt),
    snapshot: data.status === 'succeeded' ? readSnapshot(data.result) : null,
    raw: data,
  };
}

/** --external-id, which a partner sends; the owner of the server leaves it out. */
function externalId(values: Invocation['values']): string | undefined {
  return optString(values, 'external-id')?.trim() || undefined;
}

/** The query that names the billing service, when there is one. */
const serviceQuery = (target: Target) =>
  target.external ? { external_service_id: target.external } : {};

const SLUG = /^[a-z0-9][a-z0-9-]{0,190}$/;

function slugArg(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG.test(slug)) throw usageError('wordpress.error.slug', { slug: raw });
  return slug;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function taskArg(raw: string): string {
  const id = raw.trim();
  if (!UUID.test(id)) throw usageError('wordpress.error.task', { task: raw });
  return id.toLowerCase();
}

const externalFlag = (target: Target) =>
  target.external ? ` --external-id ${shellArg(target.external)}` : '';

const statusCommand = (target: Target) =>
  `bladecp wordpress status ${target.server}${externalFlag(target)}`;

const dashboardCommand = (target: Target) =>
  `bladecp wordpress dashboard ${target.server}${externalFlag(target)} --wait`;

const taskCommand = (target: Target, id: string) =>
  `bladecp wordpress task ${target.server} ${id}${externalFlag(target)} --wait`;

const updateCommand = (target: Target, what: 'core' | 'plugin' | 'theme', slug?: string) =>
  `bladecp wordpress update ${what} ${target.server}${slug ? ` ${slug}` : ''}${externalFlag(target)}`;

/** Adds what to check when the API does not find the server or the task. */
function explain(error: unknown, target: Target, task: boolean): void {
  if (!(error instanceof ApiError)) return;
  if (error.status === 404) {
    error.extraHint = { key: task ? 'wordpress.hint.taskNotFound' : 'wordpress.hint.notFound' };
  } else if (error.status === 400 && error.apiCode === 'external_service_id_required') {
    error.extraHint = { key: 'wordpress.hint.externalRequired' };
  } else if (
    error.status === 409 &&
    ['toolkit_unavailable', 'docroot_unavailable', 'command_unavailable'].includes(
      error.apiCode ?? '',
    )
  ) {
    error.extraHint = {
      key: 'wordpress.hint.unavailable',
      vars: { command: statusCommand(target) },
    };
  }
}

async function explained<T>(target: Target, task: boolean, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    explain(error, target, task);
    throw error;
  }
}

async function resolveTarget(
  ctx: Ctx,
  invocation: Invocation,
  external: string | undefined,
): Promise<{ api: BladecpApi; target: Target }> {
  const api = await signedInApi(ctx);
  const uuid = await serverId(api, invocation.args[0]!);
  return { api, target: { uuid, server: serverWord(invocation.args[0]!), external } };
}

interface Status {
  available: boolean;
  reason: string | null;
  primaryDomain: string | null;
  raw: Json;
}

async function readStatus(api: BladecpApi, target: Target): Promise<Status> {
  const data = await explained(target, false, async () =>
    dataObject(
      await api.request('getProvisionsByUuidWordpress', {
        params: { uuid: target.uuid },
        query: serviceQuery(target),
      }),
    ),
  );
  if (typeof data.available !== 'boolean') throw invalidResponse();
  return {
    available: data.available,
    reason: textOrNull(data.reason),
    primaryDomain: textOrNull(data.primaryDomain),
    raw: data,
  };
}

async function getTask(api: BladecpApi, target: Target, id: string): Promise<Task> {
  return readTask(
    await explained(target, true, async () =>
      dataObject(
        await api.request('getProvisionsByUuidWordpressCommandsById', {
          params: { uuid: target.uuid, id },
          query: serviceQuery(target),
        }),
      ),
    ),
  );
}

/**
 * Follows a task until it ends, with a quiet spinner on a terminal. Stops
 * following after MAX_WAIT_MS and returns the task as it last was.
 */
async function waitTask(
  ctx: Ctx,
  api: BladecpApi,
  target: Target,
  id: string,
  what: string,
): Promise<Task> {
  const base = ctx.pollIntervalMs ?? 2000;
  const started = ctx.now();
  const live = !ctx.json && ctx.out.caps.errTTY && ctx.out.richErr;
  const k = kit(ctx.out, 'err');
  if (!live) ctx.out.info(what);
  let frame = 0;
  try {
    for (let polls = 0; ; polls += 1) {
      const task = await getTask(api, target, id);
      if (FINAL.has(task.status)) return task;
      if (polls >= MAX_POLLS || ctx.now() - started >= MAX_WAIT_MS) return task;
      const delay = polls < 10 ? base : base * 2;
      if (!live) {
        await ctx.sleep(delay, ctx.signal);
        continue;
      }
      let waited = false;
      const sleeping = ctx.sleep(delay, ctx.signal).then(() => {
        waited = true;
      });
      do {
        ctx.out.live([
          `  ${k.accent(k.spin[frame % k.spin.length]!)}  ${what} ${k.faint(`${k.glyph.dot} ${formatDuration(ctx.now() - started)}`)}`,
        ]);
        frame += 1;
        await Promise.race([sleeping, ctx.frame(100)]);
      } while (!waited);
      await sleeping;
    }
  } finally {
    if (live) ctx.out.clearLiveLine();
  }
}

const exitFor = (task: Task) => (task.status === 'succeeded' ? ExitCode.OK : ExitCode.GENERAL);

function kindLabel(ctx: Ctx, command: string): string {
  const key = KIND_KEYS[command];
  return key ? ctx.out.t(key) : ctx.out.t('wordpress.kind.other');
}

function statusLabel(ctx: Ctx, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? ctx.out.t(key) : safeText(status);
}

function taskTone(status: string): Tone {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'cancelled') return 'faint';
  return 'violet';
}

function failureText(ctx: Ctx, task: Task): string {
  const t = ctx.out.t;
  if (task.status === 'cancelled') return t('wordpress.failure.cancelled');
  if (task.status === 'timeout' || task.errorCode === 'timeout')
    return t('wordpress.failure.timeout');
  return t('wordpress.failure.failed');
}

function doneText(ctx: Ctx, command: string, slug?: string): string {
  const t = ctx.out.t;
  switch (command) {
    case 'core-update':
      return t('wordpress.done.core');
    case 'plugin-update':
      return slug ? t('wordpress.done.plugin', { slug }) : t('wordpress.done.pluginAny');
    case 'theme-update':
      return slug ? t('wordpress.done.theme', { slug }) : t('wordpress.done.themeAny');
    default:
      return t('wordpress.done.any');
  }
}

/** The lines of what to do next, painted like every other screen of the CLI. */
function nextLines(k: Kit, next: Next[]): string[] {
  return next.flatMap((line) => [
    ...k.wrap(line.text, k.width - 4, '').map((part) => `  ${k.muted(part)}`),
    ...(line.command ? [`  ${k.violet(k.glyph.arrow)} ${k.accent(safeText(line.command))}`] : []),
  ]);
}

function itemTable(ctx: Ctx, k: Kit, items: Item[], header: string): string[] {
  const t = ctx.out.t;
  return fitTable(
    k,
    [
      { header, priority: 5, flex: true, min: 10 },
      { header: t('wordpress.column.name'), priority: 1, flex: true, min: 10 },
      { header: t('wordpress.column.version'), priority: 4 },
      { header: t('wordpress.column.update'), priority: 3 },
      { header: t('wordpress.column.state'), priority: 2 },
    ],
    items.map((item) => [
      { text: safeText(item.slug), paint: k.violet },
      { text: safeText(item.name) },
      { text: safeText(item.version || '-') },
      item.updateAvailable
        ? { text: safeText(item.updateVersion ?? t('wordpress.updateYes')), paint: k.warn }
        : { text: '-', paint: k.faint },
      {
        text: `* ${item.active ? t('wordpress.active') : t('wordpress.inactive')}`,
        paint: (cell: string) =>
          `${item.active ? k.ok(k.glyph.bullet) : k.faint(k.glyph.ring)}${item.active ? cell.slice(1) : k.muted(cell.slice(1))}`,
      },
    ]),
  ).lines;
}

/** The overview a dashboard snapshot brings: the version, the plugins, the themes. */
function showSnapshot(ctx: Ctx, task: Task, snap: Snapshot, target: Target): void {
  const t = ctx.out.t;
  const coreNext = snap.coreUpdates[0] ?? null;
  const pluginUpdates = snap.plugins.filter((item) => item.updateAvailable);
  const themeUpdates = snap.themes.filter((item) => item.updateAvailable);
  const count = (items: Item[], updates: number) =>
    items.length === 0
      ? t('wordpress.countNone')
      : updates === 0
        ? t('wordpress.countUpToDate', { count: items.length })
        : t('wordpress.countUpdates', { count: items.length, updates });
  const rows: DetailRow[] = [
    [t('wordpress.label.plugins'), count(snap.plugins, pluginUpdates.length)],
    [t('wordpress.label.themes'), count(snap.themes, themeUpdates.length)],
    ...(task.completedAt
      ? [[t('wordpress.label.readAt'), formatDate(task.completedAt, ctx.lang)] as DetailRow]
      : []),
  ];
  const next: Next[] = [];
  if (coreNext)
    next.push({ text: t('wordpress.next.updateCore'), command: updateCommand(target, 'core') });
  if (pluginUpdates[0])
    next.push({
      text: t('wordpress.next.updatePlugin'),
      command: updateCommand(target, 'plugin', pluginUpdates[0].slug),
    });
  if (themeUpdates[0])
    next.push({
      text: t('wordpress.next.updateTheme'),
      command: updateCommand(target, 'theme', themeUpdates[0].slug),
    });
  const sections: [string, string, Item[]][] = [
    [t('wordpress.label.plugins'), t('wordpress.column.plugin'), snap.plugins],
    [t('wordpress.label.themes'), t('wordpress.column.theme'), snap.themes],
  ];
  const k = kit(ctx.out, 'out');
  const version = snap.coreVersion ? safeText(snap.coreVersion) : null;
  const coreState = coreNext
    ? t('wordpress.coreUpdate', { version: coreNext })
    : snap.coreVersion
      ? t('wordpress.upToDate')
      : '';

  if (!ctx.out.rich) {
    ctx.out.lines(
      k.plainRows([
        ['WordPress', coreState ? `${version ?? '-'} (${coreState})` : (version ?? '-')],
        ...rows.map(([label, value]): [string, string] => [label, safeText(value)]),
      ]),
    );
    for (const [title, header, items] of sections) {
      if (items.length === 0) continue;
      ctx.out.print();
      ctx.out.print(title);
      ctx.out.print(
        k.plainTable(
          [
            header,
            t('wordpress.column.name'),
            t('wordpress.column.version'),
            t('wordpress.column.update'),
            t('wordpress.column.state'),
          ],
          items.map((item) => [
            item.slug,
            item.name,
            item.version || '-',
            item.updateAvailable ? (item.updateVersion ?? t('wordpress.updateYes')) : '-',
            item.active ? t('wordpress.active') : t('wordpress.inactive'),
          ]),
        ),
      );
    }
    for (const line of next) {
      ctx.out.print(line.text);
      if (line.command) ctx.out.print(`  ${safeText(line.command)}`);
    }
    return;
  }

  const badge = coreNext
    ? `${k.warn(k.glyph.warning)} ${k.warn(coreState)}`
    : coreState
      ? `${k.ok(k.glyph.bullet)} ${coreState}`
      : '';
  const lines = [
    '',
    `  ${k.bold(version ? `WordPress ${version}` : 'WordPress')}${badge ? `   ${badge}` : ''}`,
    ` ${k.horizon(k.width, { at: 0.1, spread: 0.6 })}`,
    ...k.rows(rows.map(([label, value]): [string, string] => [label, safeText(value)])),
  ];
  for (const [title, header, items] of sections) {
    if (items.length === 0) continue;
    lines.push('', `  ${k.ruler(title)}`, ...itemTable(ctx, k, items, header));
  }
  if (next.length > 0) lines.push('', ...nextLines(k, next));
  ctx.out.lines(lines);
}

/** How a task went: the overview, a finished update, or where it stands. */
function showTask(ctx: Ctx, task: Task, target: Target, slug?: string): void {
  const t = ctx.out.t;
  if (task.status === 'succeeded') {
    if (task.snapshot) {
      showSnapshot(ctx, task, task.snapshot, target);
      return;
    }
    showDone(ctx.out, {
      text: doneText(ctx, task.command, slug),
      next: [{ text: t('wordpress.next.overview'), command: dashboardCommand(target) }],
    });
    return;
  }
  const final = FINAL.has(task.status);
  const rows: DetailRow[] = [[t('wordpress.label.task'), task.id]];
  if (slug) {
    rows.push([
      task.command === 'theme-update' ? t('wordpress.label.theme') : t('wordpress.label.plugin'),
      slug,
    ]);
  }
  if (task.dispatchedAt)
    rows.push([t('wordpress.label.started'), formatDate(task.dispatchedAt, ctx.lang)]);
  if (task.completedAt)
    rows.push([t('wordpress.label.finished'), formatDate(task.completedAt, ctx.lang)]);
  if (final) rows.push([t('label.reason'), failureText(ctx, task)]);
  showDetail(ctx.out, {
    title: kindLabel(ctx, task.command),
    status: {
      label: t('label.status'),
      text: statusLabel(ctx, task.status),
      tone: taskTone(task.status),
    },
    rows,
    next: final
      ? [{ text: t('wordpress.next.support'), command: supportUrl(ctx.hubUrl) }]
      : [{ text: t('wordpress.next.again'), command: taskCommand(target, task.id) }],
  });
}

function requestedText(ctx: Ctx, kind: Kind, slug?: string): string {
  const t = ctx.out.t;
  switch (kind) {
    case 'dashboard-snapshot':
      return t('wordpress.requested.snapshot');
    case 'core-update':
      return t('wordpress.requested.core');
    case 'plugin-update':
      return t('wordpress.requested.plugin', { slug: slug ?? '' });
    case 'theme-update':
      return t('wordpress.requested.theme', { slug: slug ?? '' });
  }
}

function waitingText(ctx: Ctx, kind: Kind | null, slug?: string): string {
  const t = ctx.out.t;
  switch (kind) {
    case 'dashboard-snapshot':
      return t('wordpress.waiting.snapshot');
    case 'core-update':
      return t('wordpress.waiting.core');
    case 'plugin-update':
      return t('wordpress.waiting.plugin', { slug: slug ?? '' });
    case 'theme-update':
      return t('wordpress.waiting.theme', { slug: slug ?? '' });
    default:
      return t('wordpress.waiting.task');
  }
}

function confirmQuestion(ctx: Ctx, kind: Kind, slug?: string): string {
  const t = ctx.out.t;
  if (kind === 'plugin-update') return t('wordpress.confirm.plugin', { slug: slug ?? '' });
  if (kind === 'theme-update') return t('wordpress.confirm.theme', { slug: slug ?? '' });
  return t('wordpress.confirm.core');
}

/** Requests a task (the overview or an update), then waits for it or says how to check it. */
async function requestTask(ctx: Ctx, invocation: Invocation, kind: Kind): Promise<number> {
  const { values } = invocation;
  const t = ctx.out.t;
  const external = externalId(values);
  const slug =
    kind === 'plugin-update' || kind === 'theme-update' ? slugArg(invocation.args[1]!) : undefined;
  const { api, target } = await resolveTarget(ctx, invocation, external);
  const wait = optFlag(values, 'wait');

  let asked = false;
  if (kind !== 'dashboard-snapshot') {
    const yes = optFlag(values, 'yes');
    // On a terminal the question names the site. When the tools do not work
    // there is nothing to confirm: the request says why right away.
    const status = ctx.interactive && !yes ? await readStatus(api, target) : null;
    if (!status || status.available) {
      const site = status?.primaryDomain ?? shortId(target.uuid);
      const answer = await confirmAction(ctx, {
        question: confirmQuestion(ctx, kind, slug),
        detail: [
          t(
            kind === 'core-update'
              ? 'wordpress.confirm.coreDetail'
              : 'wordpress.confirm.itemDetail',
            { site },
          ),
        ],
        yes,
        defaultYes: true,
      });
      asked = answer.asked;
      if (!answer.go) {
        showDone(ctx.out, { text: t('wordpress.declined'), tone: 'faint', afterQuestion: asked });
        return ExitCode.OK;
      }
    }
  }

  const op = REQUESTS[kind];
  const data = await explained(target, false, async () =>
    dataObject(
      await api.request(op, {
        params: { uuid: target.uuid, ...(slug ? { slug } : {}) },
        query: serviceQuery(target),
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  if (typeof data.commandId !== 'string' || data.commandId === '') throw invalidResponse();
  const id = data.commandId;

  if (!wait) {
    if (ctx.json) return emitData(ctx, { commandId: id, command: kind, status: 'queued' });
    showDone(ctx.out, {
      text: requestedText(ctx, kind, slug),
      afterQuestion: asked,
      next: [{ text: t('wordpress.next.task'), command: taskCommand(target, id) }],
    });
    return ExitCode.OK;
  }
  const task = await waitTask(ctx, api, target, id, waitingText(ctx, kind, slug));
  if (ctx.json) {
    emitData(ctx, task.raw);
    return exitFor(task);
  }
  showTask(ctx, task, target, slug);
  return exitFor(task);
}

const UNAVAILABLE_KEYS: Record<string, MessageKey> = {
  toolkit_unavailable: 'wordpress.reason.toolkit',
  docroot_unavailable: 'wordpress.reason.docroot',
};

export const handlers: Handlers = {
  'wordpress.status': async (ctx, invocation) => {
    const external = externalId(invocation.values);
    const { api, target } = await resolveTarget(ctx, invocation, external);
    const status = await readStatus(api, target);
    if (ctx.json) return emitData(ctx, status.raw);
    const t = ctx.out.t;
    const reasonKey = status.reason ? UNAVAILABLE_KEYS[status.reason] : undefined;
    showDetail(ctx.out, {
      title: status.primaryDomain ?? shortId(target.uuid),
      status: status.available
        ? { label: t('wordpress.label.tools'), text: t('wordpress.status.ready'), tone: 'ok' }
        : {
            label: t('wordpress.label.tools'),
            text: t('wordpress.status.unavailable'),
            tone: 'warn',
          },
      rows: [
        [t('label.id'), target.uuid],
        ...(status.primaryDomain
          ? [[t('wordpress.label.site'), `https://${status.primaryDomain}`] as DetailRow]
          : []),
        ...(status.available
          ? []
          : [
              [
                t('label.reason'),
                reasonKey ? t(reasonKey) : t('wordpress.reason.unknown'),
              ] as DetailRow,
            ]),
      ],
      next: status.available
        ? [{ text: t('wordpress.next.dashboard'), command: dashboardCommand(target) }]
        : [{ text: t('wordpress.next.support'), command: supportUrl(ctx.hubUrl) }],
    });
    return ExitCode.OK;
  },

  'wordpress.dashboard': (ctx, invocation) => requestTask(ctx, invocation, 'dashboard-snapshot'),
  'wordpress.update.core': (ctx, invocation) => requestTask(ctx, invocation, 'core-update'),
  'wordpress.update.plugin': (ctx, invocation) => requestTask(ctx, invocation, 'plugin-update'),
  'wordpress.update.theme': (ctx, invocation) => requestTask(ctx, invocation, 'theme-update'),

  'wordpress.task': async (ctx, invocation) => {
    const external = externalId(invocation.values);
    const id = taskArg(invocation.args[1]!);
    const { api, target } = await resolveTarget(ctx, invocation, external);
    const wait = optFlag(invocation.values, 'wait');
    const task = wait
      ? await waitTask(ctx, api, target, id, waitingText(ctx, null))
      : await getTask(api, target, id);
    if (ctx.json) {
      emitData(ctx, task.raw);
      return wait ? exitFor(task) : ExitCode.OK;
    }
    showTask(ctx, task, target);
    return wait ? exitFor(task) : ExitCode.OK;
  },
};
