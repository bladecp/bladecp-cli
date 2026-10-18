// The smallest plan a backup needs, and the cheapest plan that fits among the
// destinations of an account. Pure: the plans come in as data (the CLI fetches
// them only with --prices; the site gets them with the page), never from a
// table kept here, so a price shown is always a price of now.

import type { PlanChoice, Recommendation, Requirements } from './report.js';

export interface DestinationLike {
  partnerName: string;
  partnerPlanId: number;
  planName: string;
  diskGb?: number | null;
  prices?: { currency: string; priceMonthly: number }[];
  locations: { locationId: number; name: string; countryCode?: string | null }[];
}

const GB = 1e9;

export function requirements(input: {
  homeBytes: number;
  mailBytes: number;
  databaseBytes: number;
  databases: number;
  databaseEngine: 'mysql' | 'mariadb' | null;
  sites: number;
  emailAccounts: number;
}): Requirements {
  return {
    diskGb: Math.max(1, Math.ceil(((input.homeBytes + input.mailBytes) * 1.25) / GB)),
    databaseGb: input.databases > 0 ? Math.max(1, Math.ceil((input.databaseBytes * 2) / GB)) : 0,
    databases: input.databases,
    databaseEngine: input.databaseEngine,
    sites: input.sites,
    emailAccounts: input.emailAccounts,
  };
}

/** The price in the wanted currency when the plan has it, else its first price. */
export function preferredPrice(
  prices: DestinationLike['prices'],
  currency: string,
): { currency: string; priceMonthly: number } | null {
  if (!prices || prices.length === 0) return null;
  return prices.find((p) => p.currency === currency) ?? prices[0]!;
}

export function recommend(
  need: Requirements,
  destinations: DestinationLike[],
  currency: string,
): Recommendation {
  const choices = destinations
    .map((d) => ({ d, price: preferredPrice(d.prices, currency) }))
    .filter(({ d, price }) => price !== null && d.locations.length > 0)
    .filter(({ d }) => typeof d.diskGb !== 'number' || d.diskGb >= need.diskGb)
    .sort(
      (a, b) =>
        a.price!.priceMonthly - b.price!.priceMonthly ||
        (b.d.diskGb ?? 0) - (a.d.diskGb ?? 0) ||
        a.d.partnerPlanId - b.d.partnerPlanId,
    )
    .map(
      ({ d, price }): PlanChoice => ({
        partnerPlanId: d.partnerPlanId,
        planName: d.planName,
        partnerName: d.partnerName,
        diskGb: typeof d.diskGb === 'number' ? d.diskGb : null,
        price,
        locations: d.locations.map((l) => ({
          locationId: l.locationId,
          name: l.name,
          countryCode: l.countryCode ?? null,
        })),
      }),
    );
  const known = choices.filter((c) => c.diskGb !== null);
  return {
    mode: 'live',
    currency,
    best: known[0] ?? null,
    alternatives: known.slice(1, 3),
    unknownDisk: choices.filter((c) => c.diskGb === null),
  };
}
