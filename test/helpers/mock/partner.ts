// The partner catalog of the simulated API: plans with per-currency prices,
// the locations of each plan, configurable option groups and the brand.
// Shapes follow openapi/customer-v1.json (PartnerPlan, PartnerLocation,
// PartnerOptionGroup, branding assets).
import { forbidden, type MockApi, type MockRoute, notFound } from '../mock-api.js';

type Json = Record<string, unknown>;

export interface MockOptionGroup extends Json {
  /** Plans the group is linked to (kept in the mock only, never answered). */
  planIds: number[];
  options: Json[];
}

export interface PartnerCatalog {
  plans: Json[];
  locations: Json[];
  groups: MockOptionGroup[];
  branding: Json;
}

export const PLAN_START = '0197b0a1-0000-7000-8000-0000000000a1';
export const PLAN_BUSINESS = '0197b0a1-0000-7000-8000-0000000000a2';
export const PLAN_DEDICATED = '0197b0a1-0000-7000-8000-0000000000a3';
export const OPTION_MEMORY = '0197b0c1-0000-7000-8000-000000000001';
export const OPTION_EXTRA_IP = '0197b0c1-0000-7000-8000-000000000002';
export const OPTION_BACKUPS = '0197b0c1-0000-7000-8000-000000000003';
export const VALUE_MEMORY_2 = '0197b0d1-0000-7000-8000-000000000001';
export const VALUE_MEMORY_4 = '0197b0d1-0000-7000-8000-000000000002';
export const VALUE_MEMORY_8 = '0197b0d1-0000-7000-8000-000000000003';
export const VALUE_EXTRA_IP = '0197b0d1-0000-7000-8000-000000000004';
export const VALUE_BACKUPS_WEEKLY = '0197b0d1-0000-7000-8000-000000000005';
export const VALUE_BACKUPS_DAILY = '0197b0d1-0000-7000-8000-000000000006';

const PARTNER_UUID = '0197b0a0-0000-7000-8000-000000000001';

function prices(currency: string, monthly: number | null, yearly: number | null = null): Json {
  return {
    currency,
    priceMonthly: monthly,
    priceQuarterly: monthly === null ? null : monthly * 3,
    priceHalfYearly: monthly === null ? null : monthly * 6,
    priceYearly: yearly ?? (monthly === null ? null : monthly * 12),
    priceTwoYears: null,
    priceThreeYears: null,
  };
}

function valuePrices(currency: string, monthly: number): Json {
  return { ...prices(currency, monthly), priceHourly: null, setupFee: null };
}

function availability(readiness: string, blockers: Json[] = []): Json {
  return {
    schemaVersion: 1,
    channel: 'whmcs',
    channelSupported: true,
    automaticProvisioningReady: readiness === 'ready',
    salesEligible: readiness === 'ready',
    locationRequirement: 'required',
    readiness,
    blockers,
    checkedAt: '2026-10-17T12:00:00.000Z',
    validUntil: '2026-10-17T12:05:00.000Z',
  };
}

function plan(fields: Json): Json {
  return {
    planType: 'hosting',
    productType: 'hosting',
    customerApiProvisioningSupported: true,
    migration: { destinationEligible: true },
    activationMode: 'auto',
    channelSupported: true,
    vibe: null,
    requiresContract: false,
    supportsContractTerms: false,
    earlyTerminationPenaltyPct: null,
    contractTerms: [],
    contracts: { supported: false, required: false, earlyTerminationPenaltyPct: null, terms: [] },
    limits: {},
    ...fields,
  };
}

function value(fields: Json): Json {
  return { isDefault: false, resourceValue: null, currencies: [], ...fields };
}

function option(fields: Json): Json {
  return {
    resourceKey: null,
    unit: null,
    required: false,
    allowDowngrade: true,
    minQty: null,
    maxQty: null,
    ...fields,
  };
}

function defaults(): PartnerCatalog {
  return {
    plans: [
      plan({
        id: 12,
        uuid: PLAN_START,
        name: 'Start',
        productName: 'Stack Container',
        customerApiProductType: 'stack-container',
        availability: availability('ready'),
        limits: { diskGb: 20 },
        currencies: [prices('BRL', 49), prices('USD', 9)],
      }),
      plan({
        id: 21,
        uuid: PLAN_BUSINESS,
        name: 'Business',
        productName: 'Edge Cloud',
        customerApiProductType: 'edge-cloud',
        availability: availability('ready'),
        requiresContract: true,
        supportsContractTerms: true,
        earlyTerminationPenaltyPct: 30,
        contracts: {
          supported: true,
          required: true,
          earlyTerminationPenaltyPct: 30,
          terms: [{ months: 12 }, { months: 24 }],
        },
        limits: { diskGb: 60 },
        currencies: [prices('BRL', 129), prices('USD', 24)],
      }),
      plan({
        id: 30,
        uuid: PLAN_DEDICATED,
        name: 'Dedicated Pro',
        productName: 'Dedicated',
        customerApiProductType: 'dedicated',
        activationMode: 'manual',
        availability: availability('not_ready', [
          { code: 'automation_not_ready', retryable: false, action: 'wait_for_automation' },
        ]),
        currencies: [prices('BRL', null, 9900), prices('USD', null, 1990)],
      }),
    ],
    locations: [
      {
        id: 3,
        uuid: '0197b0b1-0000-7000-8000-000000000003',
        planId: 12,
        region: 'sa-east-1',
        city: 'Sao Paulo',
        countryCode: 'BR',
      },
      {
        id: 4,
        uuid: '0197b0b1-0000-7000-8000-000000000004',
        planId: 12,
        region: 'us-east-1',
        city: 'Ashburn',
        countryCode: 'US',
      },
      {
        id: 8,
        uuid: '0197b0b1-0000-7000-8000-000000000008',
        planId: 21,
        region: 'eu-central-1',
        city: 'Frankfurt',
        countryCode: 'DE',
      },
    ],
    groups: [
      {
        uuid: '0197b0e1-0000-7000-8000-000000000001',
        partnerUuid: PARTNER_UUID,
        name: 'Resources',
        slug: 'resources',
        description: null,
        displayOrder: 1,
        planIds: [12, 21],
        options: [
          option({
            uuid: OPTION_MEMORY,
            name: 'Memory',
            slug: 'memory',
            inputType: 'dropdown',
            resourceKey: 'ram_gb',
            unit: 'GB',
            displayOrder: 1,
            values: [
              value({
                uuid: VALUE_MEMORY_2,
                label: '2 GB',
                value: '2',
                isDefault: true,
                displayOrder: 1,
                resourceValue: 2,
                currencies: [valuePrices('BRL', 0), valuePrices('USD', 0)],
              }),
              value({
                uuid: VALUE_MEMORY_4,
                label: '4 GB',
                value: '4',
                displayOrder: 2,
                resourceValue: 4,
                currencies: [valuePrices('BRL', 20), valuePrices('USD', 4)],
              }),
              value({
                uuid: VALUE_MEMORY_8,
                label: '8 GB',
                value: '8',
                displayOrder: 3,
                resourceValue: 8,
                currencies: [valuePrices('BRL', 40), valuePrices('USD', 8)],
              }),
            ],
          }),
          option({
            uuid: OPTION_EXTRA_IP,
            name: 'Extra IPv4',
            slug: 'extra-ip',
            inputType: 'quantity',
            unit: 'IP',
            minQty: 1,
            maxQty: 4,
            displayOrder: 2,
            values: [
              value({
                uuid: VALUE_EXTRA_IP,
                label: '1 IP',
                value: '1',
                displayOrder: 1,
                currencies: [valuePrices('BRL', 15), valuePrices('USD', 3)],
              }),
            ],
          }),
        ],
      },
      {
        uuid: '0197b0e1-0000-7000-8000-000000000002',
        partnerUuid: PARTNER_UUID,
        name: 'Backups',
        slug: 'backups',
        description: 'Copies of the sites and databases',
        displayOrder: 2,
        planIds: [12],
        options: [
          option({
            uuid: OPTION_BACKUPS,
            name: 'Backups',
            slug: 'backups',
            inputType: 'radio',
            displayOrder: 1,
            values: [
              value({
                uuid: VALUE_BACKUPS_WEEKLY,
                label: 'Weekly',
                value: 'weekly',
                isDefault: true,
                displayOrder: 1,
                currencies: [valuePrices('BRL', 0), valuePrices('USD', 0)],
              }),
              value({
                uuid: VALUE_BACKUPS_DAILY,
                label: 'Daily',
                value: 'daily',
                displayOrder: 2,
                currencies: [valuePrices('BRL', 10), valuePrices('USD', 2)],
              }),
            ],
          }),
        ],
      },
    ],
    branding: {
      publicName: 'Example Hosting',
      logoUrl: 'https://cdn.example.com/brand/logo.svg',
      logoDarkUrl: null,
      faviconUrl: 'https://cdn.example.com/brand/favicon.ico',
    },
  };
}

/** The partner catalog of this simulated API (tests change it before running a command). */
export function partnerCatalog(api: MockApi): PartnerCatalog {
  return api.state('partner', defaults);
}

/** A group as the API answers it, with prices only in `currency` when asked. */
function answerGroup(group: MockOptionGroup, currency: string | null): Json {
  const { planIds: _planIds, ...rest } = group;
  if (!currency) return rest;
  return {
    ...rest,
    options: group.options.map((o) => ({
      ...o,
      values: (o.values as Json[]).map((v) => ({
        ...v,
        currencies: (v.currencies as Json[]).filter(
          (c) => String(c.currency).toUpperCase() === currency.toUpperCase(),
        ),
      })),
    })),
  };
}

/** Routes of the simulated API for the partner commands. */
export function install(api: MockApi): void {
  const route: MockRoute = ({ method, path, query }) => {
    if (method !== 'GET') return undefined;
    const catalog = () => partnerCatalog(api);
    if (path === '/customer/partner/plans') {
      if (!api.partner) return forbidden();
      return { status: 200, body: { data: catalog().plans } };
    }
    if (path === '/customer/partner/locations') {
      if (!api.partner) return forbidden();
      const planId = query.get('plan_id');
      const locations = catalog().locations.filter(
        (l) => planId === null || String(l.planId) === planId,
      );
      return { status: 200, body: { data: locations } };
    }
    if (path === '/customer/partner/option-groups') {
      if (!api.partner) return forbidden();
      const plan = query.get('plan');
      const groups = catalog().groups.filter(
        (g) => plan === null || !/^\d+$/.test(plan) || g.planIds.includes(Number(plan)),
      );
      return {
        status: 200,
        body: { data: groups.map((g) => answerGroup(g, query.get('currency'))) },
      };
    }
    const byPlan = /^\/customer\/partner\/plans\/([^/]+)\/option-groups$/.exec(path);
    if (byPlan) {
      if (!api.partner) return forbidden();
      const found = catalog().plans.find((p) => p.uuid === decodeURIComponent(byPlan[1]!));
      if (!found) return notFound();
      const groups = catalog().groups.filter((g) => g.planIds.includes(Number(found.id)));
      return {
        status: 200,
        body: { data: groups.map((g) => answerGroup(g, query.get('currency'))) },
      };
    }
    if (path === '/customer/branding/assets') {
      if (!api.partner && !api.me.scopes.includes('vibe:read')) return forbidden();
      return { status: 200, body: { data: catalog().branding } };
    }
    return undefined;
  };
  api.routes.push(route);
}
