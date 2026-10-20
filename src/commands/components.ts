// `bladecp components`: the components of the BladeCP catalog, what a server
// can run besides the site (a database, a cache, the WordPress tools).

import { dataList, invalidResponse, isRecord, type Json } from '../api.js';
import { ExitCode } from '../errors.js';
import type { MessageKey, Translator } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { type Column, showList } from '../ui/views.js';
import { emitData, type Handlers, signedInApi } from './common.js';

interface Component {
  slug: string;
  name: string;
  type: string;
  version: string;
  allowed: boolean;
}

/**
 * The version people know (8.4.0, 20) from the image of the default version:
 * the API's `version` and `latest_version` are positions in the list (0, 1),
 * not versions. The image itself (a registry address) is never shown.
 */
export function componentVersion(entry: Json): string {
  const list = Array.isArray(entry.versions) ? entry.versions.filter(isRecord) : [];
  const chosen =
    list.find((v) => v.is_default === true) ??
    list.find((v) => v.version === entry.latest_version) ??
    list[0];
  const image = typeof chosen?.image === 'string' ? chosen.image : '';
  const colon = image.lastIndexOf(':');
  const tag = colon > image.lastIndexOf('/') ? image.slice(colon + 1) : '';
  const version = tag.split('-')[0] ?? '';
  return /^v?\d[\w.]*$/.test(version) ? version.replace(/^v/, '') : '';
}

function readComponent(entry: Json): Component {
  if (typeof entry.slug !== 'string' || entry.slug === '') throw invalidResponse();
  return {
    slug: entry.slug,
    name: typeof entry.name === 'string' && entry.name ? entry.name : entry.slug,
    type: typeof entry.category === 'string' ? entry.category : '',
    version: componentVersion(entry),
    allowed: entry.allowed_for_tier !== false,
  };
}

/** The categories the catalog uses, in words; another one shows as the API sent it. */
const CATEGORY_KEYS: Record<string, MessageKey> = {
  databases: 'components.category.databases',
  cache: 'components.category.cache',
  webservers: 'components.category.webservers',
  languages: 'components.category.languages',
};

function categoryLabel(category: string, t: Translator): string {
  const key = CATEGORY_KEYS[category.trim().toLowerCase()];
  return key ? t(key) : safeText(category);
}

export const handlers: Handlers = {
  'components.list': async (ctx) => {
    const api = await signedInApi(ctx);
    const raw = dataList(await api.request('getComponentsCatalog'));
    const components = raw.map(readComponent);
    if (ctx.json) return emitData(ctx, raw);
    const t = ctx.out.t;
    const columns: Column<Component>[] = [
      {
        header: t('components.column.component'),
        value: (c) => c.slug,
        paint: (k, text) => k.violet(text),
        priority: 5,
        flex: true,
        min: 10,
      },
      {
        header: t('components.column.name'),
        value: (c) => c.name,
        priority: 4,
        flex: true,
        min: 10,
      },
      {
        header: t('components.column.type'),
        value: (c) => (c.type ? categoryLabel(c.type, t) : '-'),
        paint: (k, text) => k.muted(text),
        priority: 2,
        flex: true,
        min: 8,
      },
      {
        header: t('components.column.version'),
        value: (c) => c.version || '-',
        paint: (k, text) => k.muted(text),
        priority: 1,
      },
    ];
    // The catalog is global; a component outside the plan of the key is marked.
    if (components.some((c) => !c.allowed)) {
      columns.push({
        header: t('components.column.plan'),
        value: (c) =>
          `* ${c.allowed ? t('components.plan.included') : t('components.plan.notIncluded')}`,
        plain: (c) =>
          c.allowed ? t('components.plan.included') : t('components.plan.notIncluded'),
        paint: (k, text, c) =>
          c.allowed
            ? `${k.ok(k.glyph.bullet)}${text.slice(1)}`
            : `${k.faint(k.glyph.ring)}${k.muted(text.slice(1))}`,
        // Above the name: on a narrow terminal what the plan lacks matters more.
        priority: 4.5,
      });
    }
    showList(ctx.out, {
      items: components,
      columns,
      empty: t('components.empty'),
      summary:
        components.length === 1
          ? t('components.countOne')
          : t('components.countMany', { count: components.length }),
      notes: components.length > 0 ? [t('components.note')] : [],
    });
    return ExitCode.OK;
  },
};
