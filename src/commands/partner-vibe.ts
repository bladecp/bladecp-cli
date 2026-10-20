// `bladecp partner vibe ...`: the BladeCP Vibe accounts of a partner's
// customers, the same lifecycle the BladeCP WHMCS module drives (create,
// read, change plan, suspend, reactivate, restore serving, terminate and a
// one-time sign-in). The other Vibe routes are flows between the WHMCS module
// and BladeCP and stay reachable through `bladecp api`.

import { randomUUID } from 'node:crypto';

import type { OperationId } from '../api/operations.js';
import {
  type BladecpApi,
  dataObject,
  invalidResponse,
  isRecord,
  type Json,
  requireStrings,
} from '../api.js';
import type { OptionValues } from '../args.js';
import type { Ctx } from '../context.js';
import { ApiError, ExitCode } from '../errors.js';
import type { MessageKey } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import {
  type DetailRow,
  type Next,
  showDetail,
  showDone,
  showList,
  showOnce,
  statusTone,
} from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handler,
  type Handlers,
  optFlag,
  optString,
  partnerOnly,
  requireOption,
  signedInApi,
  usageError,
} from './common.js';

type Translate = Ctx['out']['t'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS: Record<string, MessageKey> = {
  pending: 'partnerVibe.status.pending',
  active: 'partnerVibe.status.active',
  suspended: 'partnerVibe.status.suspended',
  terminated: 'partnerVibe.status.terminated',
};
const PLAN: Record<string, MessageKey> = {
  free: 'partnerVibe.plan.free',
  pro: 'partnerVibe.plan.pro',
};
const AI: Record<string, MessageKey> = {
  managed_ai: 'partnerVibe.ai.managed',
  partner_ai: 'partnerVibe.ai.partner',
};

// ------------------------------------------------------------- arguments

/** A Vibe account ID: the whole UUID (no list exists to resolve a prefix). */
function accountArg(value: string): string {
  const trimmed = value.trim();
  if (!UUID.test(trimmed)) throw usageError('partnerVibe.error.accountId', { value });
  return trimmed.toLowerCase();
}

function planArg(value: string): string {
  const trimmed = value.trim();
  if (!UUID.test(trimmed)) throw usageError('partnerVibe.error.planId', { value });
  return trimmed.toLowerCase();
}

/** The partner's own service ID: opaque, kept exactly as given. */
function externalIdArg(value: string): string {
  if (value.trim() === '' || value.length > 191 || CONTROL.test(value)) {
    throw usageError('partnerVibe.error.externalId');
  }
  return value;
}

function requireExternalId(values: OptionValues): string {
  const value = optString(values, 'external-id');
  if (value === undefined || value.trim() === '') {
    throw usageError('error.missingOption', { option: '--external-id' });
  }
  return externalIdArg(value);
}

function emailArg(value: string): string {
  if (value.length > 320 || !EMAIL.test(value))
    throw usageError('partnerVibe.error.email', { value });
  return value;
}

function nameArg(value: string): string {
  if (value.length > 200 || CONTROL.test(value)) throw usageError('partnerVibe.error.name');
  return value;
}

/** `--email-verification`: what the partner states about the owner's email (Free plans). */
function emailVerificationArg(value: string | undefined): 'verified' | 'not_required' | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'verified' || normalized === 'not_required') return normalized;
  throw usageError('partnerVibe.error.emailVerification', { value });
}

/** A value the shell reads as one word in a suggested command. */
function shellWord(value: string): string {
  return /^[A-Za-z0-9._:@/+=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

// ------------------------------------------------------------- answers

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** An account as the API returns it: the ID and the status are what the screens need. */
function checkAccount(value: unknown): Json {
  if (!isRecord(value)) throw invalidResponse();
  requireStrings(value, ['accountId', 'status']);
  return value;
}

function statusLabel(t: Translate, status: string): string {
  const key = STATUS[status];
  return key ? t(key) : safeText(status);
}

/** "Pro", "Free", or undefined for a plan without a code. */
function planName(t: Translate, account: Json): string | undefined {
  const code = text(account.planCode);
  const key = code ? PLAN[code] : undefined;
  return key ? t(key) : undefined;
}

function showAccount(
  ctx: Ctx,
  account: Json,
  extra: { service?: string; notes?: string[] } = {},
): void {
  const t = ctx.out.t;
  const id = account.accountId as string;
  const status = account.status as string;
  const plan = planName(t, account);
  const service = text(account.externalServiceId) ?? extra.service;
  const ai = text(account.aiMode);
  const customer = text(account.customerUuid);
  const planUuid = text(account.planUuid);
  const rows: DetailRow[] = [[t('partnerVibe.label.account'), id]];
  if (service) rows.push([t('partnerVibe.label.service'), service]);
  if (plan) rows.push([t('partnerVibe.label.plan'), plan]);
  if (ai) rows.push([t('partnerVibe.label.ai'), AI[ai] ? t(AI[ai]) : ai]);
  if (customer) rows.push([t('partnerVibe.label.customer'), customer]);
  if (planUuid) rows.push([t('partnerVibe.label.planId'), planUuid]);

  const notes = [...(extra.notes ?? [])];
  const next: Next[] = [];
  if (status === 'active') {
    next.push({ text: t('partnerVibe.next.open'), command: `bladecp partner vibe open ${id}` });
  } else if (status === 'suspended') {
    next.push({
      text: t('partnerVibe.next.reactivate'),
      command: `bladecp partner vibe reactivate ${id}`,
    });
  } else if (status === 'pending') {
    notes.push(t('partnerVibe.note.pending'));
  } else if (status === 'terminated') {
    notes.push(t('partnerVibe.note.terminated'));
  }
  showDetail(ctx.out, {
    title: plan ? t('partnerVibe.titlePlan', { plan }) : t('partnerVibe.title'),
    status: {
      label: t('partnerVibe.label.status'),
      text: statusLabel(t, status),
      tone: statusTone(status),
    },
    rows,
    notes,
    next,
  });
}

async function accountCall(
  api: BladecpApi,
  operation: OperationId,
  accountId: string,
  body?: unknown,
): Promise<Json> {
  const answer = await partnerOnly(api, () =>
    api.request(operation, {
      params: { accountId },
      ...(body === undefined ? {} : { body }),
      idempotencyKey: randomUUID(),
    }),
  );
  return checkAccount(dataObject(answer));
}

// ------------------------------------------------------------- commands

const find: Handler = async (ctx, { args }) => {
  const service = externalIdArg(args[0]!);
  const api = await signedInApi(ctx);
  const data = dataObject(
    await partnerOnly(api, () =>
      api.request('getVibeAccountsBy-external-serviceByExternalServiceId', {
        params: { externalServiceId: service },
      }),
    ),
  );
  // Only found=false with account=null means there is no account.
  if (data.found === false && data.account === null) {
    if (ctx.json) return emitData(ctx, data);
    const t = ctx.out.t;
    showList(ctx.out, {
      items: [],
      columns: [],
      empty: t('partnerVibe.find.none', { service }),
      next: [
        {
          text: t('partnerVibe.next.create'),
          command: `bladecp partner vibe create --external-id ${shellWord(service)} --plan <id> --email <email> --name <name>`,
        },
      ],
    });
    return ExitCode.OK;
  }
  if (data.found !== true) throw invalidResponse();
  const account = checkAccount(data.account);
  if (ctx.json) return emitData(ctx, data);
  showAccount(ctx, account, { service });
  return ExitCode.OK;
};

const show: Handler = async (ctx, { args }) => {
  const accountId = accountArg(args[0]!);
  const api = await signedInApi(ctx);
  const account = checkAccount(
    dataObject(
      await partnerOnly(api, () =>
        api.request('getVibeAccountsByAccountId', { params: { accountId } }),
      ),
    ),
  );
  if (ctx.json) return emitData(ctx, account);
  showAccount(ctx, account);
  return ExitCode.OK;
};

const create: Handler = async (ctx, { values }) => {
  const service = requireExternalId(values);
  const plan = planArg(requireOption(values, 'plan'));
  const email = emailArg(requireOption(values, 'email'));
  const name = nameArg(requireOption(values, 'name'));
  const verification = emailVerificationArg(optString(values, 'email-verification'));
  const body = {
    owner: { email, name },
    planUuid: plan,
    externalServiceId: service,
    // Free plans: the statement the WHMCS module sends about the owner's email.
    ...(verification
      ? {
          activationContext: {
            source: 'whmcs',
            externalServiceId: service,
            emailVerification: verification,
            assertedAt: new Date(ctx.now()).toISOString(),
          },
        }
      : {}),
  };
  const api = await signedInApi(ctx);
  const t = ctx.out.t;
  const { go, asked } = await confirmAction(ctx, {
    question: t('partnerVibe.confirm.create'),
    detail: [
      t('partnerVibe.confirm.service', { service }),
      t('partnerVibe.confirm.planLine', { plan }),
      t('partnerVibe.confirm.owner', { name, email }),
    ],
    yes: optFlag(values, 'yes'),
    defaultYes: true,
  });
  if (!go) {
    showDone(ctx.out, {
      text: t('partnerVibe.declinedCreate'),
      tone: 'faint',
      afterQuestion: asked,
    });
    return ExitCode.OK;
  }
  const account = checkAccount(
    dataObject(
      await partnerOnly(api, () =>
        api
          .request('postVibeAccounts', { body, idempotencyKey: randomUUID() })
          .catch((error: unknown) => {
            // A new account needs the customer's identity, proved in the browser.
            if (error instanceof ApiError && error.apiCode === 'identity_link_required') {
              error.extraHint = { key: 'partnerVibe.hint.identityLink' };
            }
            throw error;
          }),
      ),
    ),
  );
  if (ctx.json) return emitData(ctx, account);
  showAccount(ctx, account, { service, notes: [t('partnerVibe.create.note')] });
  return ExitCode.OK;
};

const changePlan: Handler = async (ctx, { args, values }) => {
  const accountId = accountArg(args[0]!);
  const plan = planArg(args[1]!);
  const api = await signedInApi(ctx);
  const t = ctx.out.t;
  const { go, asked } = await confirmAction(ctx, {
    question: t('partnerVibe.confirm.move'),
    detail: [
      t('partnerVibe.confirm.account', { account: accountId }),
      t('partnerVibe.confirm.newPlan', { plan }),
    ],
    yes: optFlag(values, 'yes'),
    defaultYes: true,
  });
  if (!go) {
    showDone(ctx.out, { text: t('partnerVibe.declined'), tone: 'faint', afterQuestion: asked });
    return ExitCode.OK;
  }
  const account = await accountCall(api, 'patchVibeAccountsByAccountId', accountId, {
    planUuid: plan,
  });
  if (ctx.json) return emitData(ctx, account);
  showDone(ctx.out, {
    text: t('partnerVibe.done.plan', {
      plan: planName(t, account) ?? text(account.planUuid) ?? plan,
    }),
    next: [{ text: t('partnerVibe.next.show'), command: `bladecp partner vibe show ${accountId}` }],
    afterQuestion: asked,
  });
  return ExitCode.OK;
};

interface LifecycleAction {
  operation: OperationId;
  question: MessageKey;
  detail: MessageKey;
  /** Enter says no for what stops or ends the account. */
  defaultYes: boolean;
  /** The status the account has once the action happened. */
  target: string;
  done: MessageKey;
  next?: (t: Translate, accountId: string) => Next[];
}

const showNext = (t: Translate, accountId: string): Next[] => [
  { text: t('partnerVibe.next.show'), command: `bladecp partner vibe show ${accountId}` },
];

/**
 * Suspend, reactivate, restore serving and terminate: one account, a question
 * first on a terminal, and the account the API returns. Repeating an action
 * (or acting on a terminated account) changes nothing, and the screen says so.
 */
function lifecycle(action: LifecycleAction): Handler {
  return async (ctx, { args, values }) => {
    const accountId = accountArg(args[0]!);
    const api = await signedInApi(ctx);
    const t = ctx.out.t;
    const { go, asked } = await confirmAction(ctx, {
      question: t(action.question),
      detail: [t('partnerVibe.confirm.account', { account: accountId }), t(action.detail)],
      yes: optFlag(values, 'yes'),
      defaultYes: action.defaultYes,
    });
    if (!go) {
      showDone(ctx.out, { text: t('partnerVibe.declined'), tone: 'faint', afterQuestion: asked });
      return ExitCode.OK;
    }
    const account = await accountCall(api, action.operation, accountId);
    if (ctx.json) return emitData(ctx, account);
    const status = account.status as string;
    if (status === action.target) {
      showDone(ctx.out, {
        text: t(action.done),
        ...(action.next ? { next: action.next(t, accountId) } : {}),
        afterQuestion: asked,
      });
    } else {
      showDone(ctx.out, {
        text: t('partnerVibe.unchanged', { status: statusLabel(t, status) }),
        tone: 'warn',
        next: showNext(t, accountId),
        afterQuestion: asked,
      });
    }
    return ExitCode.OK;
  };
}

/** A sign-in link the browser may open: http(s) only, never another scheme. */
function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function expiryTime(ctx: Ctx, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat(ctx.lang, { timeStyle: 'medium' }).format(date);
}

const open: Handler = async (ctx, { args, values }) => {
  const accountId = accountArg(args[0]!);
  const api = await signedInApi(ctx);
  const data = dataObject(
    await partnerOnly(api, () =>
      api.request('postVibeAccountsByAccountIdSso', {
        params: { accountId },
        body: {},
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  requireStrings(data, ['url', 'expiresAt']);
  const url = data.url as string;
  if (!isWebUrl(url)) throw invalidResponse();
  // The link goes in data; --debug never logs answers, so it is not written anywhere else.
  if (ctx.json) return emitData(ctx, data);
  const t = ctx.out.t;
  const note = t('partnerVibe.open.note', { time: expiryTime(ctx, data.expiresAt as string) });
  if (ctx.interactive && !optFlag(values, 'no-browser')) {
    if (await ctx.openUrl(url)) {
      showDone(ctx.out, { text: t('partnerVibe.open.opened') });
      return ExitCode.OK;
    }
    showOnce(ctx.out, { label: t('partnerVibe.open.labelFallback'), value: url, note });
    return ExitCode.OK;
  }
  showOnce(ctx.out, { label: t('partnerVibe.open.label'), value: url, note });
  return ExitCode.OK;
};

export const handlers: Handlers = {
  'partner.vibe.find': find,
  'partner.vibe.show': show,
  'partner.vibe.create': create,
  'partner.vibe.plan': changePlan,
  'partner.vibe.suspend': lifecycle({
    operation: 'postVibeAccountsByAccountIdSuspend',
    question: 'partnerVibe.confirm.suspend',
    detail: 'partnerVibe.confirm.suspendDetail',
    defaultYes: false,
    target: 'suspended',
    done: 'partnerVibe.done.suspend',
    next: (t, accountId) => [
      {
        text: t('partnerVibe.next.reactivate'),
        command: `bladecp partner vibe reactivate ${accountId}`,
      },
    ],
  }),
  'partner.vibe.reactivate': lifecycle({
    operation: 'postVibeAccountsByAccountIdReactivate',
    question: 'partnerVibe.confirm.reactivate',
    detail: 'partnerVibe.confirm.reactivateDetail',
    defaultYes: true,
    target: 'active',
    done: 'partnerVibe.done.reactivate',
    next: showNext,
  }),
  'partner.vibe.resume': lifecycle({
    operation: 'postVibeAccountsByAccountIdReactivate-serving',
    question: 'partnerVibe.confirm.resume',
    detail: 'partnerVibe.confirm.resumeDetail',
    defaultYes: true,
    target: 'active',
    done: 'partnerVibe.done.resume',
    next: showNext,
  }),
  'partner.vibe.terminate': lifecycle({
    operation: 'deleteVibeAccountsByAccountId',
    question: 'partnerVibe.confirm.terminate',
    detail: 'partnerVibe.confirm.terminateDetail',
    defaultYes: false,
    target: 'terminated',
    done: 'partnerVibe.done.terminate',
  }),
  'partner.vibe.open': open,
};
