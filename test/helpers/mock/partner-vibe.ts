import { forbidden, type MockAnswer, type MockApi } from '../mock-api.js';

/** Routes of the simulated API for the partner vibe commands. */

export const VIBE_PARTNER = '0197a000-0000-7000-8000-0000000000f1';
export const VIBE_CUSTOMER = '0197a000-0000-7000-8000-0000000000c1';
export const VIBE_PRO_PLAN = '0197b000-0000-7000-8000-00000000a001';
export const VIBE_FREE_PLAN = '0197b000-0000-7000-8000-00000000a002';
/** The active Pro account of service 4821 (seeded by seedVibe). */
export const VIBE_ACCOUNT = '0197c3a0-0000-7000-8000-00000000b001';
/** The suspended Free account of service 4822 (seeded by seedVibe). */
export const VIBE_SUSPENDED = '0197c3a0-0000-7000-8000-00000000b002';
/** The terminated account of service 4823 (seeded by seedVibe). */
export const VIBE_TERMINATED = '0197c3a0-0000-7000-8000-00000000b003';

export interface MockVibeAccount {
  accountId: string;
  externalServiceId: string;
  customerUuid: string;
  partnerUuid: string;
  planUuid: string;
  planCode: 'free' | 'pro' | null;
  aiMode: 'partner_ai' | 'managed_ai';
  status: 'pending' | 'active' | 'suspended' | 'terminated';
  activationMode: 'automatic';
  resourceVersion: number;
  entitlementVersion: number;
}

export interface VibeState {
  accounts: MockVibeAccount[];
  plans: { uuid: string; code: 'free' | 'pro' | null }[];
  /** New accounts need the identity link of the WHMCS module (409 identity_link_required). */
  identityLinkRequired: boolean;
  /** Accounts that sign in through partner federation (409 federation_required). */
  federated: Set<string>;
  /** When the one-time sign-in links expire. */
  ssoExpiresAt: string;
  ssoCount: number;
  createdCount: number;
}

export function vibeState(api: MockApi): VibeState {
  return api.state<VibeState>('partnerVibe', () => ({
    accounts: [],
    plans: [
      { uuid: VIBE_PRO_PLAN, code: 'pro' },
      { uuid: VIBE_FREE_PLAN, code: 'free' },
    ],
    identityLinkRequired: false,
    federated: new Set(),
    ssoExpiresAt: '2026-10-19T12:01:00.000Z',
    ssoCount: 0,
    createdCount: 0,
  }));
}

export function addVibeAccount(
  api: MockApi,
  account: Partial<MockVibeAccount> & { accountId: string; externalServiceId: string },
): MockVibeAccount {
  const full: MockVibeAccount = {
    customerUuid: VIBE_CUSTOMER,
    partnerUuid: VIBE_PARTNER,
    planUuid: VIBE_PRO_PLAN,
    planCode: 'pro',
    aiMode: 'managed_ai',
    status: 'active',
    activationMode: 'automatic',
    resourceVersion: 1,
    entitlementVersion: 1,
    ...account,
  };
  vibeState(api).accounts.push(full);
  return full;
}

/** An active Pro account, a suspended Free one and a terminated one. */
export function seedVibe(api: MockApi): void {
  addVibeAccount(api, { accountId: VIBE_ACCOUNT, externalServiceId: '4821' });
  addVibeAccount(api, {
    accountId: VIBE_SUSPENDED,
    externalServiceId: '4822',
    planUuid: VIBE_FREE_PLAN,
    planCode: 'free',
    aiMode: 'partner_ai',
    status: 'suspended',
    resourceVersion: 3,
  });
  addVibeAccount(api, {
    accountId: VIBE_TERMINATED,
    externalServiceId: '4823',
    status: 'terminated',
    resourceVersion: 5,
  });
}

/** The account as the API returns it (VibeAccount: no service ID). */
function wire(a: MockVibeAccount) {
  const { externalServiceId: _service, ...account } = a;
  return account;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vibeError(status: number, code: string, message: string): MockAnswer {
  return { status, body: { error: true, code, message } };
}

const accountNotFound = () => vibeError(404, 'account_not_found', 'Vibe account not found');

function createAccount(state: VibeState, body: unknown): MockAnswer {
  const owner = isRecord(body) ? body.owner : undefined;
  if (
    !isRecord(body) ||
    !isRecord(owner) ||
    typeof owner.email !== 'string' ||
    typeof owner.name !== 'string' ||
    owner.name === '' ||
    typeof body.planUuid !== 'string' ||
    !UUID.test(body.planUuid) ||
    typeof body.externalServiceId !== 'string' ||
    body.externalServiceId === '' ||
    body.externalServiceId.length > 191
  ) {
    return vibeError(400, 'invalid_request', 'Invalid request');
  }
  const service = body.externalServiceId;
  const existing = state.accounts.find((a) => a.externalServiceId === service);
  if (existing) return { status: 200, body: { data: wire(existing) } };
  const plan = state.plans.find((p) => p.uuid === body.planUuid);
  if (!plan) return vibeError(422, 'plan_not_available', 'Plan not available');
  if (state.identityLinkRequired) {
    return vibeError(409, 'identity_link_required', 'Identity link required');
  }
  if (plan.code === 'free') {
    const context = body.activationContext;
    if (
      !isRecord(context) ||
      context.source !== 'whmcs' ||
      context.externalServiceId !== service ||
      (context.emailVerification !== 'verified' && context.emailVerification !== 'not_required') ||
      typeof context.assertedAt !== 'string' ||
      Number.isNaN(Date.parse(context.assertedAt))
    ) {
      return vibeError(422, 'free_activation_context_invalid', 'Activation context required');
    }
  }
  state.createdCount += 1;
  const account: MockVibeAccount = {
    accountId: `0197c3a0-0000-7000-8000-${String(0xc000 + state.createdCount).padStart(12, '0')}`,
    externalServiceId: service,
    customerUuid: VIBE_CUSTOMER,
    partnerUuid: VIBE_PARTNER,
    planUuid: plan.uuid,
    planCode: plan.code,
    aiMode: 'managed_ai',
    status: 'active',
    activationMode: 'automatic',
    resourceVersion: 1,
    entitlementVersion: 1,
  };
  state.accounts.push(account);
  return { status: 201, body: { data: wire(account) } };
}

function changePlan(state: VibeState, account: MockVibeAccount, body: unknown): MockAnswer {
  if (!isRecord(body) || typeof body.planUuid !== 'string' || !UUID.test(body.planUuid)) {
    return vibeError(400, 'invalid_request', 'Invalid request');
  }
  if (account.status === 'terminated') return accountNotFound();
  const plan = state.plans.find((p) => p.uuid === body.planUuid);
  if (!plan) return vibeError(422, 'plan_not_available', 'Plan not available');
  if (account.planCode === 'pro' && plan.code === 'free') {
    return vibeError(422, 'vibe_plan_downgrade_unavailable', 'Downgrade from Pro to Free');
  }
  if (account.planUuid !== plan.uuid) {
    account.planUuid = plan.uuid;
    account.planCode = plan.code;
    account.resourceVersion += 1;
    account.entitlementVersion += 1;
  }
  return { status: 200, body: { data: wire(account) } };
}

function setStatus(account: MockVibeAccount, status: MockVibeAccount['status']): MockAnswer {
  // Repeating an action, or acting on a terminated account, changes nothing.
  if (account.status !== 'terminated' && account.status !== status) {
    account.status = status;
    account.resourceVersion += 1;
  }
  return { status: 200, body: { data: wire(account) } };
}

export function install(api: MockApi): void {
  api.routes.push((request) => {
    const { method, path, body } = request;
    if (path !== '/customer/vibe/accounts' && !path.startsWith('/customer/vibe/accounts/')) {
      return undefined;
    }
    if (!api.partner) return forbidden();
    const state = vibeState(api);

    const lookup = /^\/customer\/vibe\/accounts\/by-external-service\/([^/]+)$/.exec(path);
    if (lookup && method === 'GET') {
      const service = decodeURIComponent(lookup[1]!);
      const account = state.accounts.find((a) => a.externalServiceId === service);
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: { data: account ? { found: true, account } : { found: false, account: null } },
      };
    }
    if (path === '/customer/vibe/accounts' && method === 'POST') return createAccount(state, body);

    const match = /^\/customer\/vibe\/accounts\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
    if (!match) return undefined;
    const id = decodeURIComponent(match[1]!);
    const action = match[2];
    const account = state.accounts.find((a) => a.accountId === id);
    if (!account) return accountNotFound();

    if (!action && method === 'GET') return { status: 200, body: { data: wire(account) } };
    if (!action && method === 'PATCH') return changePlan(state, account, body);
    if (!action && method === 'DELETE') return setStatus(account, 'terminated');
    if (method !== 'POST') return undefined;
    if (action === 'suspend') return setStatus(account, 'suspended');
    if (action === 'reactivate') {
      return account.status === 'suspended'
        ? setStatus(account, 'active')
        : { status: 200, body: { data: wire(account) } };
    }
    if (action === 'reactivate-serving') {
      if (account.status !== 'active') return accountNotFound();
      return { status: 200, body: { data: wire(account) } };
    }
    if (action === 'sso') {
      if (account.status !== 'active') return accountNotFound();
      if (state.federated.has(account.accountId)) {
        return vibeError(409, 'federation_required', 'Federation required');
      }
      state.ssoCount += 1;
      return {
        status: 200,
        body: {
          data: {
            url: `https://vibe.example.com/sso/consume?ticket=st${state.ssoCount}Qm7Xc2Vb9Lr4Tz8Np1Hd6Ks3Wf5Gy0`,
            expiresAt: state.ssoExpiresAt,
          },
        },
      };
    }
    return undefined;
  });
}
