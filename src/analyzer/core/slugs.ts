// ComputePreviewSlugs of the migration engine: the per-site preview label of
// a multisite network. A site that is not served, or that lives on the network
// domain, gets none; a subdomain child keeps its labels, a mapped domain its
// full name, dots turned into dashes, cut to 63 characters. Colliding slugs all
// get -<blog id>. A result that is not a DNS label, or a collision that
// survives, fails (null), as it does in the engine.

import { toLowerAscii, trimChars, trimRightChars } from './go.js';

const MAX = 63;
const reSlug = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

interface Site {
  blogId: bigint;
  domain: string;
  deleted: number;
  archived: number;
  spam: number;
}

const served = (s: Site) => s.deleted === 0 && s.archived === 0 && s.spam === 0;

function slugBase(domainIn: string, networkIn: string): string {
  const domain = toLowerAscii(domainIn);
  const network = toLowerAscii(networkIn);
  if (domain === network) return '';
  const suffix = `.${network}`;
  const base = domain.endsWith(suffix) ? domain.slice(0, domain.length - suffix.length) : domain;
  let slug = base.replaceAll('.', '-');
  if (slug.length > MAX) slug = slug.slice(0, MAX);
  return trimChars(slug, '-');
}

export function computePreviewSlugs(
  sites: Site[],
  networkDomain: string,
): Map<bigint, string> | null {
  const ordered = [...sites].sort((a, b) =>
    a.blogId < b.blogId ? -1 : a.blogId > b.blogId ? 1 : 0,
  );
  const slugs = new Map<bigint, string>();
  const bySlug = new Map<string, bigint[]>();
  for (const s of ordered) {
    if (!served(s)) {
      slugs.set(s.blogId, '');
      continue;
    }
    const slug = slugBase(s.domain, networkDomain);
    slugs.set(s.blogId, slug);
    if (slug !== '') bySlug.set(slug, [...(bySlug.get(slug) ?? []), s.blogId]);
  }
  for (const [slug, ids] of bySlug) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const suffix = `-${id}`;
      let base = slug;
      if (base.length + suffix.length > MAX)
        base = trimRightChars(base.slice(0, MAX - suffix.length), '-');
      slugs.set(id, base + suffix);
    }
  }
  const seen = new Set<string>();
  for (const s of ordered) {
    const slug = slugs.get(s.blogId) ?? '';
    if (slug === '') continue;
    if (!reSlug.test(slug) || seen.has(slug)) return null;
    seen.add(slug);
  }
  return slugs;
}
