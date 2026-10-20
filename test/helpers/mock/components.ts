import type { Json } from '../../../src/api.js';
import type { MockApi } from '../mock-api.js';

const versions = (image: string, count: number, firstId: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: firstId + i,
    version: i + 1,
    image: `${image}:${i + 1}.0.${i}-alpine`,
    is_default: i === count - 1,
  }));

export const COMPONENTS: Json[] = [
  {
    slug: 'php',
    name: 'PHP',
    category: 'Runtime',
    latest_version: 3,
    versions: versions('example/php', 3, 101),
    featured: true,
    allowed_for_tier: true,
  },
  {
    slug: 'mysql',
    name: 'MySQL',
    category: 'Database',
    latest_version: 2,
    versions: versions('example/mysql', 2, 201),
    featured: true,
    allowed_for_tier: true,
  },
  {
    slug: 'redis',
    name: 'Redis',
    category: 'Cache',
    latest_version: 1,
    versions: versions('example/redis', 1, 301),
    featured: false,
    allowed_for_tier: true,
  },
  {
    slug: 'nodejs',
    name: 'Node.js',
    category: 'Runtime',
    latest_version: 2,
    versions: versions('example/node', 2, 401),
    featured: false,
    allowed_for_tier: true,
  },
  {
    slug: 'wp-cli-toolkit',
    name: 'WordPress Toolkit',
    category: 'Tools',
    latest_version: 1,
    versions: versions('example/wp-cli', 1, 501),
    featured: false,
    allowed_for_tier: true,
  },
];

export interface ComponentsState {
  catalog: Json[];
}

export function componentsState(api: MockApi): ComponentsState {
  return api.state<ComponentsState>('components', () => ({
    catalog: structuredClone(COMPONENTS),
  }));
}

/** Replaces the component catalog. */
export function seedComponents(api: MockApi, catalog: Json[]): void {
  componentsState(api).catalog = catalog;
}

/** Routes of the simulated API for the components commands. */
export function install(api: MockApi): void {
  api.routes.push((request) => {
    if (request.method !== 'GET' || request.path !== '/customer/components/catalog') {
      return undefined;
    }
    return {
      status: 200,
      body: { data: componentsState(api).catalog, meta: { tier_gating: 'per_product' } },
    };
  });
}
