// `bladecp partner servers ...`: the servers a BladeCP partner sells to its
// customers, operated the way the BladeCP WHMCS module does it: create one
// for a customer, change its plan or options, suspend, cancel, delete, and
// open the customer's panel with a one-time link.

import { randomUUID } from 'node:crypto';

import {
  type BladecpApi,
  dataList,
  dataObject,
  invalidResponse,
  isRecord,
  type Json,
  provisionDomain,
  provisionProduct,
  requireStrings,
} from '../api.js';
import { assertUuidArg, type OptionName, type OptionValues } from '../args.js';
import type { Ctx } from '../context.js';
import { ApiError, ExitCode } from '../errors.js';
import {
  isValidDomain,
  normalizeDomain,
  productLabel,
  serverStatusLabel,
  serverTone,
  shortIds,
} from '../format.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import type { Provision } from '../types.js';
import {
  type DetailRow,
  type Next,
  showDetail,
  showDone,
  showList,
  showOnce,
  statusColumn,
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
  serverId,
  signedInApi,
  usageError,
} from './common.js';
import {
  allOptions,
  checkOptionGroups,
  money,
  optionValues,
  unitValue,
  valueWord,
} from './partner.js';

/** How long the sign-in link of `open` lasts, as the WHMCS module asks for it. */
const SSO_TTL_SECONDS = 300;
const CONTRACT_TERMS = [12, 24, 36, 48];
const CANCEL_CATEGORIES = [
  'too_expensive',
  'no_longer_needed',
  'technical_issues',
  'found_better',
  'temporary',
  'other',
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ shared

/** A whole number above zero given as an option the command needs. */
function requiredNumber(values: OptionValues, name: OptionName): number {
  requireOption(values, name);
  const number = optInteger(values, name)!;
  if (number === 0) {
    throw usageError('error.invalidNumber', { option: `--${name}`, value: String(values[name]) });
  }
  return number;
}

/** A positive option (`--page 2`), or undefined. */
function positiveNumber(values: OptionValues, name: OptionName): number | undefined {
  const number = optInteger(values, name);
  if (number === 0) {
    throw usageError('error.invalidNumber', { option: `--${name}`, value: String(values[name]) });
  }
  return number;
}

/** The server an action is about: its ID (short ones work) and how people know it. */
interface Target {
  uuid: string;
  /** The domain, or the ID when it has none. */
  name: string;
  /** What the person typed, for the next commands. */
  arg: string;
  server: Provision;
}

async function findTarget(api: BladecpApi, raw: string): Promise<Target> {
  const arg = assertUuidArg(raw);
  const uuid = await serverId(api, arg);
  const server = await api.getProvision(uuid);
  return { uuid: server.uuid, name: provisionDomain(server) ?? server.uuid, arg, server };
}

/** The server already has a cancellation asked for (at the end of the cycle or now). */
function hasCancellation(server: Provision): boolean {
  const record = server as unknown as Json;
  return (
    typeof record.cancellationRequestedAt === 'string' ||
    (isRecord(record.cancellation) && typeof record.cancellation.requestedAt === 'string')
  );
}

function declined(ctx: Ctx, asked: boolean): number {
  showDone(ctx.out, {
    text: ctx.out.t('partnerServers.declined'),
    tone: 'faint',
    afterQuestion: asked,
  });
  return ExitCode.OK;
}

/** The lifecycle answer of an action: an object with the server ID. */
function lifecycle(body: unknown): Json {
  const data = dataObject(body);
  requireStrings(data, ['uuid']);
  return data;
}

/** Cents as money in the currency of the answer. */
function cents(amount: number, currency: unknown, ctx: Ctx): string {
  return money(Math.abs(amount) / 100, typeof currency === 'string' ? currency : null, ctx.lang);
}

// ----------------------------------------------------------------- options

interface OptionPair {
  option: string;
  value: string;
}

/** `--option memory=4`: the option (slug or ID) and the value (value, label or ID). */
function parseOptionPairs(list: string[]): OptionPair[] {
  return list.map((raw) => {
    const match = /^\s*([^=\s]+)\s*=\s*(\S(?:.*\S)?)\s*$/.exec(raw);
    if (!match) throw usageError('partnerServers.error.optionFormat', { value: raw });
    return { option: match[1]!, value: match[2]! };
  });
}

interface Chosen {
  option: Json;
  value: Json;
  quantity: number;
  /** The plan default: nothing to send, the server keeps the base. */
  isDefault: boolean;
}

/** Every `--option` checked against the option groups, as the API takes them. */
function resolveOptions(groups: Json[], pairs: OptionPair[], plan?: number): Chosen[] {
  const options = allOptions(groups);
  const chosen: Chosen[] = [];
  for (const pair of pairs) {
    const key = pair.option.toLowerCase();
    const matches = options.filter(
      (o) => String(o.uuid).toLowerCase() === key || String(o.slug).toLowerCase() === key,
    );
    if (matches.length === 0) {
      throw plan === undefined
        ? usageError('partnerServers.error.optionUnknown', { option: pair.option })
        : usageError('partnerServers.error.optionNotInPlan', { option: pair.option, plan });
    }
    if (matches.length > 1) {
      throw usageError('partnerServers.error.optionAmbiguous', { option: pair.option });
    }
    const option = matches[0]!;
    const slug = String(option.slug);
    if (chosen.some((c) => c.option.uuid === option.uuid)) {
      throw usageError('partnerServers.error.optionTwice', { option: slug });
    }
    if (option.inputType === 'quantity') {
      const unit = unitValue(option);
      if (!unit) throw usageError('partnerServers.error.optionUnknown', { option: pair.option });
      const min = typeof option.minQty === 'number' ? option.minQty : 1;
      const max = typeof option.maxQty === 'number' ? option.maxQty : null;
      const quantity = /^\d{1,6}$/.test(pair.value) ? Number(pair.value) : Number.NaN;
      if (
        Number.isNaN(quantity) ||
        (quantity > 0 && (quantity < min || (max !== null && quantity > max)))
      ) {
        throw max === null
          ? usageError('partnerServers.error.quantity', { option: slug, value: pair.value, min })
          : usageError('partnerServers.error.quantityRange', {
              option: slug,
              value: pair.value,
              min,
              max,
            });
      }
      chosen.push({ option, value: unit, quantity, isDefault: quantity === 0 });
      continue;
    }
    const wanted = pair.value.toLowerCase();
    const values = optionValues(option);
    const value =
      values.find((v) => String(v.uuid).toLowerCase() === wanted) ??
      values.find((v) => String(v.value ?? '').toLowerCase() === wanted) ??
      values.find((v) => String(v.label ?? '').toLowerCase() === wanted);
    if (!value) {
      throw usageError('partnerServers.error.valueUnknown', {
        option: slug,
        value: pair.value,
        values: values.map(valueWord).join(', '),
      });
    }
    chosen.push({ option, value, quantity: 1, isDefault: value.isDefault === true });
  }
  return chosen;
}

/** "Memory: 4 GB", for the question before the change. */
function optionLine(c: Chosen, t: Translator): string {
  const option = String(c.option.name ?? c.option.slug);
  const value = String(c.value.label ?? c.value.value ?? c.value.uuid);
  if (c.isDefault) return t('partnerServers.optionDefault', { option, value });
  if (c.option.inputType === 'quantity')
    return t('partnerServers.optionQuantity', { option, quantity: c.quantity });
  return t('partnerServers.optionLine', { option, value });
}

async function optionGroups(api: BladecpApi, plan?: number): Promise<Json[]> {
  return checkOptionGroups(await api.request('getPartnerOption-groups', { query: { plan } }));
}

// -------------------------------------------------------------------- list

function quoted(value: string): string {
  return /^[\w.@:/-]+$/.test(value) ? value : JSON.stringify(value);
}

async function listCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const status = optString(values, 'status')?.trim() || undefined;
  const domain = optString(values, 'domain')?.trim().toLowerCase() || undefined;
  const externalId = optString(values, 'external-id')?.trim() || undefined;
  const page = positiveNumber(values, 'page');
  const limit = positiveNumber(values, 'limit');
  if (limit !== undefined && limit > 100) {
    throw usageError('partnerServers.error.limit', { value: limit });
  }
  const api = await signedInApi(ctx);
  const body = await partnerOnly(api, () =>
    api.request('getProvisions', {
      query: { status, domain, external_service_id: externalId, page, limit },
    }),
  );
  const servers = dataList(body).map((server) => {
    requireStrings(server, ['uuid']);
    return server as unknown as Provision;
  });
  const meta = isRecord(body) && isRecord(body.meta) ? body.meta : null;
  if (ctx.json) return emitData(ctx, { servers, meta });

  const t = ctx.out.t;
  const ids = shortIds(servers.map((s) => s.uuid));
  const filtered = status !== undefined || domain !== undefined || externalId !== undefined;
  const filters = [
    ...(status ? ['--status', quoted(status)] : []),
    ...(domain ? ['--domain', quoted(domain)] : []),
    ...(externalId ? ['--external-id', quoted(externalId)] : []),
    ...(limit ? ['--limit', String(limit)] : []),
  ];
  const next: Next[] = [];
  if (meta?.hasMore === true) {
    const current = typeof meta.page === 'number' ? meta.page : (page ?? 1);
    next.push({
      text: t('partnerServers.list.more'),
      command: ['bladecp partner servers list', ...filters, '--page', String(current + 1)].join(
        ' ',
      ),
    });
  } else if (servers.length === 0 && !filtered) {
    next.push({
      text: t('partnerServers.list.createHint'),
      command: 'bladecp partner servers create --help',
    });
  }
  const first = servers[0];
  showList(ctx.out, {
    items: servers,
    columns: [
      {
        header: t('column.id'),
        value: (s) => ids.get(s.uuid) ?? s.uuid,
        plain: (s) => s.uuid,
        paint: (k, text) => k.violet(text),
        priority: 5,
      },
      {
        header: t('column.domain'),
        value: (s) => provisionDomain(s) ?? '-',
        priority: 4,
        flex: true,
        min: 12,
      },
      {
        header: t('column.product'),
        value: (s) => productLabel(provisionProduct(s), t),
        paint: (k, text) => k.muted(text),
        priority: 1,
        flex: true,
        min: 8,
      },
      statusColumn<Provision>(
        t('column.status'),
        (s) => serverStatusLabel(s.status, t),
        (s) => serverTone(s.status),
      ),
    ],
    empty: filtered ? t('partnerServers.list.emptyFiltered') : t('partnerServers.list.empty'),
    summary: [
      t(servers.length === 1 ? 'partnerServers.list.countOne' : 'partnerServers.list.count', {
        count: servers.length,
      }),
      ...(page !== undefined && page > 1 ? [t('partnerServers.list.page', { page })] : []),
    ].join(' · '),
    ...(first
      ? {
          notes: [
            t('partnerServers.list.hint', {
              command: `bladecp servers show ${ids.get(first.uuid) ?? first.uuid}`,
            }),
          ],
        }
      : {}),
    next,
  });
  return ExitCode.OK;
}

// ------------------------------------------------------------------ create

function parseComponents(list: string[]): Json[] {
  const bySlug = new Map<string, Json>();
  for (const raw of list) {
    const match = /^\s*([a-z0-9][a-z0-9._-]*)(?:@(\d{1,9}))?\s*$/i.exec(raw);
    if (!match || match[2] === '0')
      throw usageError('partnerServers.error.component', { value: raw });
    const slug = match[1]!.toLowerCase();
    const version = match[2] ? Number(match[2]) : undefined;
    const known = bySlug.get(slug);
    if (
      known &&
      known.component_version !== undefined &&
      version !== undefined &&
      known.component_version !== version
    ) {
      throw usageError('partnerServers.error.componentTwice', { component: slug });
    }
    if (!known || version !== undefined) {
      bySlug.set(slug, { slug, ...(version !== undefined ? { component_version: version } : {}) });
    }
  }
  return [...bySlug.values()];
}

function contractTerm(values: OptionValues): number | undefined {
  const raw = optString(values, 'contract');
  if (raw === undefined) return undefined;
  const months = /^\s*\d{1,3}\s*$/.test(raw) ? Number(raw) : Number.NaN;
  if (!CONTRACT_TERMS.includes(months)) {
    throw usageError('partnerServers.error.contract', { value: raw });
  }
  return months;
}

/** What to do after a catalog refusal of the create (the API code, then the hint). */
const CREATE_HINTS: Record<string, MessageKey> = {
  COMPONENTS_REQUIRED: 'partnerServers.hint.componentsRequired',
  COMPONENT_NOT_FOUND: 'partnerServers.hint.catalog',
  OPTION_NOT_FOUND: 'partnerServers.hint.catalog',
  OPTION_VALUE_NOT_FOUND: 'partnerServers.hint.catalog',
  LOCATION_NOT_FOUND: 'partnerServers.hint.location',
  LOCATION_NOT_AVAILABLE_FOR_PLAN: 'partnerServers.hint.location',
  CONTRACT_TERM_REQUIRED: 'partnerServers.hint.contract',
  CONTRACT_ACCEPTANCE_REQUIRED: 'partnerServers.hint.contract',
  CONTRACT_TERM_NOT_AVAILABLE: 'partnerServers.hint.contract',
};

/** The plan is a Stack Container (it needs components). Unknown plans are left to the API. */
async function isStackContainerPlan(api: BladecpApi, plan: number): Promise<boolean> {
  const plans = dataList(await api.request('getPartnerPlans'));
  const found = plans.find((p) => p.id === plan);
  return found?.customerApiProductType === 'stack-container' || found?.productType === 'container';
}

async function createCommand(ctx: Ctx, values: OptionValues): Promise<number> {
  const t = ctx.out.t;
  const plan = requiredNumber(values, 'plan');
  const location = requiredNumber(values, 'location');
  const domainRaw = requireOption(values, 'domain');
  const domain = normalizeDomain(domainRaw);
  if (!isValidDomain(domain)) throw usageError('partnerServers.error.domain', { value: domainRaw });
  const email = requireOption(values, 'email');
  if (!EMAIL.test(email)) throw usageError('partnerServers.error.email', { value: email });
  const name = requireOption(values, 'name');
  const externalRaw = optString(values, 'external-id');
  if (externalRaw !== undefined && externalRaw.trim() === '') {
    throw usageError('error.missingOption', { option: '--external-id' });
  }
  const externalId = externalRaw?.trim();
  const pairs = parseOptionPairs(optList(values, 'option'));
  const components = parseComponents(optList(values, 'component'));
  const contract = contractTerm(values);

  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    // A Stack Container is created with its components: say so before sending.
    if (components.length === 0 && (await isStackContainerPlan(api, plan))) {
      throw usageError('partnerServers.error.componentsRequired', { plan });
    }
    const chosen =
      pairs.length > 0 ? resolveOptions(await optionGroups(api, plan), pairs, plan) : [];
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerServers.create.confirm', { domain }),
      detail: [
        t('partnerServers.create.detailOwner', { name, email }),
        t('partnerServers.create.detailPlan', { plan, location }),
        ...chosen.map((c) => optionLine(c, t)),
        ...(components.length > 0
          ? [
              t('partnerServers.create.detailComponents', {
                components: components
                  .map((c) =>
                    c.component_version ? `${c.slug}@${c.component_version}` : String(c.slug),
                  )
                  .join(', '),
              }),
            ]
          : []),
        ...(contract ? [t('partnerServers.create.detailContract', { months: contract })] : []),
        ...(externalId ? [t('partnerServers.create.detailExternal', { id: externalId })] : []),
      ],
      yes: optFlag(values, 'yes'),
      defaultYes: true,
    });
    if (!go) return declined(ctx, asked);

    const options = chosen
      .filter((c) => !c.isDefault)
      .map((c) => ({
        option_id: c.option.uuid,
        option_value_id: c.value.uuid,
        quantity: c.quantity,
      }));
    const body = {
      partner_plan_id: plan,
      location_id: location,
      domain,
      owner: { email, name },
      ...(externalId ? { external_service_id: externalId } : {}),
      ...(options.length > 0 ? { options } : {}),
      ...(components.length > 0 ? { components } : {}),
      ...(contract ? { contract_term_months: contract, contract_accepted: true } : {}),
    };
    const data = dataObject(
      await api
        .request('postProvisionsSimple', { body, idempotencyKey: randomUUID() })
        .catch((error: unknown) => {
          // The API answers several catalog problems with one generic sentence.
          const hint = error instanceof ApiError ? CREATE_HINTS[error.apiCode ?? ''] : undefined;
          if (hint && error instanceof ApiError) error.extraHint = { key: hint, vars: { plan } };
          throw error;
        }),
    );
    requireStrings(data, ['uuid']);
    if (ctx.json) return emitData(ctx, data);

    const server = data as unknown as Provision;
    const status = typeof data.status === 'string' ? data.status : 'pending';
    const product =
      provisionProduct(server) ??
      (typeof data.customerApiProductType === 'string' ? data.customerApiProductType : null);
    const title = provisionDomain(server) ?? domain;
    const rows: DetailRow[] = [
      // The plain layout has no title: the domain goes in a row of its own.
      ...(ctx.out.rich ? [] : ([[t('label.domain'), title]] as DetailRow[])),
      [t('label.id'), server.uuid],
      [t('label.product'), productLabel(product, t)],
      [t('partnerServers.label.customer'), t('partnerServers.customer', { name, email })],
      ...(externalId ? ([[t('partnerServers.label.externalId'), externalId]] as DetailRow[]) : []),
    ];
    const manual = data.manual_delivery === true || data.activationMode === 'manual';
    showDetail(ctx.out, {
      afterQuestion: asked,
      title,
      status: {
        label: t('label.status'),
        text: serverStatusLabel(status, t),
        tone: serverTone(status),
      },
      rows,
      ...(manual ? { notes: [t('partnerServers.create.manualNote')] } : {}),
      next: [
        { text: t('partnerServers.create.next'), command: `bladecp servers show ${server.uuid}` },
        {
          text: t('partnerServers.create.nextOpen'),
          command: `bladecp partner servers open ${server.uuid}`,
        },
      ],
    });
    return ExitCode.OK;
  });
}

// -------------------------------------------------------------------- plan

async function planCommand(ctx: Ctx, args: string[], values: OptionValues): Promise<number> {
  const t = ctx.out.t;
  const raw = args[1]!.trim();
  const plan = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  if (plan === 0) throw usageError('partnerServers.error.plan', { value: args[1]! });
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerServers.plan.confirm', { domain: target.name, plan }),
      detail: [t('partnerServers.plan.detail')],
      yes: optFlag(values, 'yes'),
      defaultYes: true,
    });
    if (!go) return declined(ctx, asked);
    const data = lifecycle(
      await api.request('patchProvisionsByUuid', {
        params: { uuid: target.uuid },
        body: { partnerPlanId: plan },
        idempotencyKey: randomUUID(),
      }),
    );
    if (ctx.json) return emitData(ctx, data);
    showDone(ctx.out, {
      text: t('partnerServers.plan.done', { domain: target.name, plan }),
      afterQuestion: asked,
      next: [
        { text: t('partnerServers.plan.next'), command: `bladecp partner options --plan ${plan}` },
      ],
    });
    return ExitCode.OK;
  });
}

// ----------------------------------------------------------------- options

async function optionsCommand(ctx: Ctx, args: string[], values: OptionValues): Promise<number> {
  const t = ctx.out.t;
  const pairs = parseOptionPairs(optList(values, 'option'));
  if (pairs.length === 0) throw usageError('error.missingOption', { option: '--option' });
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const chosen = resolveOptions(await optionGroups(api), pairs);
    const kept = chosen.filter((c) => !c.isDefault);
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerServers.options.confirm', { domain: target.name }),
      detail: [
        ...chosen.map((c) => optionLine(c, t)),
        kept.length === 0
          ? t('partnerServers.options.allDefault')
          : t('partnerServers.options.replaceNote'),
      ],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) return declined(ctx, asked);
    const data = lifecycle(
      await api.request('patchProvisionsByUuidOptions', {
        params: { uuid: target.uuid },
        body: {
          options: kept.map((c) => ({
            optionUuid: c.option.uuid,
            optionValueUuid: c.value.uuid,
            quantity: c.quantity,
          })),
        },
        idempotencyKey: randomUUID(),
      }),
    );
    if (ctx.json) return emitData(ctx, data);
    const proration = typeof data.prorationAmountCents === 'number' ? data.prorationAmountCents : 0;
    const next: Next[] =
      proration > 0
        ? [
            {
              text: t('partnerServers.options.charge', {
                amount: cents(proration, data.currency, ctx),
              }),
            },
          ]
        : proration < 0
          ? [
              {
                text: t('partnerServers.options.credit', {
                  amount: cents(proration, data.currency, ctx),
                }),
              },
            ]
          : [];
    showDone(ctx.out, {
      text: t('partnerServers.options.done', { domain: target.name }),
      afterQuestion: asked,
      next,
    });
    return ExitCode.OK;
  });
}

// ------------------------------------------------------ suspend, unsuspend

async function suspendCommand(
  ctx: Ctx,
  args: string[],
  values: OptionValues,
  suspend: boolean,
): Promise<number> {
  const t = ctx.out.t;
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const { go, asked } = await confirmAction(ctx, {
      question: t(suspend ? 'partnerServers.suspend.confirm' : 'partnerServers.unsuspend.confirm', {
        domain: target.name,
      }),
      detail: [t(suspend ? 'partnerServers.suspend.detail' : 'partnerServers.unsuspend.detail')],
      yes: optFlag(values, 'yes'),
      defaultYes: !suspend,
    });
    if (!go) return declined(ctx, asked);
    const call = { params: { uuid: target.uuid }, idempotencyKey: randomUUID() };
    const data = lifecycle(
      suspend
        ? await api.request('postProvisionsByUuidSuspend', call)
        : await api.request('postProvisionsByUuidUnsuspend', call),
    );
    if (ctx.json) return emitData(ctx, data);
    showDone(ctx.out, {
      text: t(suspend ? 'partnerServers.suspend.done' : 'partnerServers.unsuspend.done', {
        domain: target.name,
      }),
      afterQuestion: asked,
      ...(suspend
        ? {
            next: [
              {
                text: t('partnerServers.suspend.next'),
                command: `bladecp partner servers unsuspend ${target.arg}`,
              },
            ],
          }
        : {}),
    });
    return ExitCode.OK;
  });
}

// ------------------------------------------------------------------ cancel

function cancelCategory(values: OptionValues): string {
  const raw = optString(values, 'reason-category');
  if (raw === undefined) return 'other';
  const category = raw.trim().toLowerCase().replace(/-/g, '_');
  if (!CANCEL_CATEGORIES.includes(category)) {
    throw usageError('partnerServers.error.category', {
      value: raw,
      categories: CANCEL_CATEGORIES.map((c) => c.replace(/_/g, '-')).join(', '),
    });
  }
  return category;
}

async function cancelCommand(ctx: Ctx, args: string[], values: OptionValues): Promise<number> {
  const t = ctx.out.t;
  const now = optFlag(values, 'now');
  const reason = optString(values, 'reason')?.trim();
  if (reason !== undefined && (reason.length < 20 || reason.length > 2000)) {
    throw usageError('partnerServers.error.reason', { count: reason.length });
  }
  const category = cancelCategory(values);
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const { go, asked } = await confirmAction(ctx, {
      question: t(now ? 'partnerServers.cancel.confirmNow' : 'partnerServers.cancel.confirmCycle', {
        domain: target.name,
      }),
      detail: [
        t(now ? 'partnerServers.cancel.detailNow' : 'partnerServers.cancel.detailCycle'),
        ...(reason ? [t('partnerServers.cancel.detailReason', { reason })] : []),
      ],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) return declined(ctx, asked);
    const data = lifecycle(
      await api
        .request('postProvisionsByUuidCancel', {
          params: { uuid: target.uuid },
          body: {
            when: now ? 'now' : 'cycle_end',
            reasonCategory: category,
            reasonText: reason ?? t('partnerServers.cancel.defaultReason'),
          },
          idempotencyKey: randomUUID(),
        })
        .catch((error: unknown) => {
          // A cancellation already asked for (at the end of the cycle) is not
          // brought forward by asking again.
          if (error instanceof ApiError && error.status === 409 && hasCancellation(target.server)) {
            error.extraHint = { key: 'partnerServers.hint.cancelAlreadyRequested' };
          }
          throw error;
        }),
    );
    if (ctx.json) return emitData(ctx, data);
    const next: Next[] = [];
    if (typeof data.ticketId === 'number') {
      next.push({ text: t('partnerServers.cancel.ticket', { ticket: data.ticketId }) });
    }
    const penalty = isRecord(data.earlyTerminationPenalty) ? data.earlyTerminationPenalty : null;
    if (penalty && typeof penalty.amount === 'number') {
      next.push({
        text: t('partnerServers.cancel.penalty', {
          amount: cents(penalty.amount, penalty.currency, ctx),
          months: typeof penalty.remainingMonths === 'number' ? penalty.remainingMonths : 0,
        }),
      });
    }
    if (now) {
      next.push({
        text: t('partnerServers.cancel.undoNow'),
        command: `bladecp partner servers unsuspend ${target.arg}`,
      });
    }
    const mode = data.cancellationMode === 'now' || (data.cancellationMode === undefined && now);
    showDone(ctx.out, {
      text: t(mode ? 'partnerServers.cancel.doneNow' : 'partnerServers.cancel.doneCycle', {
        domain: target.name,
      }),
      afterQuestion: asked,
      next,
    });
    return ExitCode.OK;
  });
}

// ------------------------------------------------------------------ delete

async function deleteCommand(ctx: Ctx, args: string[], values: OptionValues): Promise<number> {
  const t = ctx.out.t;
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const { go, asked } = await confirmAction(ctx, {
      question: t('partnerServers.delete.confirm', { domain: target.name }),
      detail: [t('partnerServers.delete.detail')],
      yes: optFlag(values, 'yes'),
      defaultYes: false,
    });
    if (!go) return declined(ctx, asked);
    const data = lifecycle(
      await api
        .request('deleteProvisionsByUuid', {
          params: { uuid: target.uuid },
          idempotencyKey: randomUUID(),
        })
        .catch((error: unknown) => {
          // A server that never reached the infrastructure (pending) has
          // nothing to tear down, and the API refuses to delete it.
          if (error instanceof ApiError && error.status === 409) {
            const status = String(target.server.status ?? '');
            error.extraHint = {
              key:
                status === 'pending' || status === 'provisioning'
                  ? 'partnerServers.hint.deletePending'
                  : 'partnerServers.hint.deleteState',
              vars: { status },
            };
          }
          throw error;
        }),
    );
    if (ctx.json) return emitData(ctx, data);
    const status = data.targetStatus ?? data.status;
    const key: MessageKey =
      data.reused === true
        ? 'partnerServers.delete.reused'
        : status === 'deleted'
          ? 'partnerServers.delete.deleted'
          : 'partnerServers.delete.deleting';
    showDone(ctx.out, { text: t(key, { domain: target.name }), afterQuestion: asked });
    return ExitCode.OK;
  });
}

// -------------------------------------------------------------------- open

async function openCommand(ctx: Ctx, args: string[]): Promise<number> {
  const t = ctx.out.t;
  const api = await signedInApi(ctx);
  return partnerOnly(api, async () => {
    const target = await findTarget(api, args[0]!);
    const data = dataObject(
      await api.request('postProvisionsByUuidSso-link', {
        params: { uuid: target.uuid },
        body: { ttl_seconds: SSO_TTL_SECONDS },
        idempotencyKey: randomUUID(),
      }),
    );
    requireStrings(data, ['url']);
    const url = String(data.url);
    // Only an https address is opened or shown: anything else breaks the contract.
    if (!/^https:\/\/[^\s/]+/i.test(url)) throw invalidResponse();
    if (ctx.json) {
      return emitData(ctx, { uuid: target.uuid, url, expiresInSeconds: SSO_TTL_SECONDS });
    }
    if (ctx.interactive && (await ctx.openUrl(url))) {
      showDone(ctx.out, {
        text: t('partnerServers.open.opened', { domain: target.name }),
        next: [{ text: t('partnerServers.open.note') }],
      });
      return ExitCode.OK;
    }
    showOnce(ctx.out, {
      label: t('partnerServers.open.label', { domain: target.name }),
      value: url,
      note: t('partnerServers.open.note'),
    });
    return ExitCode.OK;
  });
}

export const handlers: Handlers = {
  'partner.servers.list': (ctx, { values }) => listCommand(ctx, values),
  'partner.servers.create': (ctx, { values }) => createCommand(ctx, values),
  'partner.servers.plan': (ctx, { args, values }) => planCommand(ctx, args, values),
  'partner.servers.options': (ctx, { args, values }) => optionsCommand(ctx, args, values),
  'partner.servers.suspend': (ctx, { args, values }) => suspendCommand(ctx, args, values, true),
  'partner.servers.unsuspend': (ctx, { args, values }) => suspendCommand(ctx, args, values, false),
  'partner.servers.cancel': (ctx, { args, values }) => cancelCommand(ctx, args, values),
  'partner.servers.delete': (ctx, { args, values }) => deleteCommand(ctx, args, values),
  'partner.servers.open': (ctx, { args }) => openCommand(ctx, args),
};
