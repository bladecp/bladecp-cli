// `bladecp` alone on a terminal: who is signed in, what needs attention right
// now, and the shortcuts. The account is read with short timeouts and no
// retries, so the screen never waits long; without a key or a network it
// still shows the shortcuts.

import { ApiClient, BladecpApi } from '../api.js';
import { resolveAuth } from '../auth/credentials.js';
import type { Ctx } from '../context.js';
import { DEFAULT_API_URL } from '../endpoints.js';
import { ExitCode } from '../errors.js';
import {
  isGoneServer,
  migrationPhaseLabel,
  needsYou,
  reviewAnswered,
  serverStatusCount,
  shortIds,
} from '../format.js';
import { safeText } from '../sanitize.js';
import type { MeData, Migration, Provision } from '../types.js';
import { kit } from '../ui/kit.js';
import { twoColumns } from '../ui/layout.js';
import { findLocalUpload } from '../upload/state.js';
import { cliVersion } from '../version.js';
import { discoveredDomain } from './follow.js';

function quickApi(ctx: Ctx, apiKey: string): BladecpApi {
  ctx.out.addSecret(apiKey);
  return new BladecpApi(
    new ApiClient({
      baseUrl: ctx.apiUrl,
      apiKey,
      fetch: ctx.fetch,
      sleep: ctx.sleep,
      userAgent: ctx.userAgent,
      cliVersion: cliVersion(),
      signal: ctx.signal,
      maxTransientRetries: 0,
      maxRateLimitRetries: 0,
      onDebug: (line) => ctx.out.debug(line),
    }),
  );
}

export async function homeCommand(ctx: Ctx): Promise<number> {
  const t = ctx.out.t;
  const k = kit(ctx.out, 'out');
  const auth = await resolveAuth(ctx).catch(() => null);
  let me: MeData | null = null;
  let migrations: Migration[] | null = null;
  let servers: Provision[] | null = null;
  let reachable = true;
  if (auth) {
    const errK = kit(ctx.out, 'err');
    ctx.out.live([`  ${errK.accent(errK.spin[0]!)}  ${errK.muted(t('home.loading'))}`]);
    const api = quickApi(ctx, auth.apiKey);
    const [a, b, c] = await Promise.allSettled([
      api.me(),
      api.listMigrations(),
      api.listProvisions(),
    ]);
    ctx.out.clearLiveLine();
    me = a.status === 'fulfilled' ? a.value : null;
    migrations = b.status === 'fulfilled' ? b.value : null;
    servers = c.status === 'fulfilled' ? c.value : null;
    reachable = a.status === 'fulfilled';
  }
  const host = new URL(ctx.apiUrl).host;
  const lines = ['', `  ${k.wordmark(cliVersion())}`];
  if (me) {
    lines.push(`  ${safeText(me.customer_email)} ${k.muted(`· ${host}`)}`);
  } else if (auth) {
    lines.push(`  ${k.muted(`${t('home.offline')} · ${host}`)}`);
  } else {
    lines.push(
      `  ${k.muted(t('home.notSignedIn'))}${ctx.apiUrl !== DEFAULT_API_URL ? k.muted(` · ${host}`) : ''}`,
    );
  }
  lines.push(` ${k.horizon(k.width, { at: 0.18, spread: 0.55 })}`);

  const command = (text: string) => `  ${k.rail(k.glyph.end)}  ${k.accent(text)}`;
  if (me && reachable) {
    lines.push('', `  ${k.ruler(t('home.now'))}`);
    const ids = shortIds((migrations ?? []).map((m) => m.uuid));
    const id = (m: Migration) => safeText(ids.get(m.uuid) ?? m.uuid);
    const active = (migrations ?? []).filter(
      (m) =>
        needsYou(m) ||
        !['failed', 'cancelled', 'live', 'cutover_pending', 'cutover_stalled'].includes(m.phase),
    );
    for (const m of active.slice(0, 3)) {
      const domain = safeText(m.primaryDomain ?? discoveredDomain(m) ?? id(m));
      if (m.phase === 'awaiting_approval') {
        lines.push(
          `  ${k.warn(k.glyph.active)}  ${t('home.ready', { domain })}`,
          command(`bladecp migrations approve ${id(m)}`),
        );
      } else if (m.phase === 'discovery_review' && !reviewAnswered(m)) {
        lines.push(
          `  ${k.warn(k.glyph.active)}  ${t('home.confirmDomain', { domain })}`,
          command(
            `bladecp migrations review ${id(m)} --domain ${safeText(discoveredDomain(m) ?? 'example.com')}`,
          ),
        );
      } else if (m.phase === 'draft' || m.phase === 'uploading') {
        const local = await findLocalUpload(ctx.configDir, m.uuid);
        lines.push(
          `  ${k.warn(k.glyph.active)}  ${t('home.uploadPaused', { domain })}`,
          command(
            local
              ? `bladecp migrate ${safeText(local.filePath)}`
              : `bladecp migrations status ${id(m)}`,
          ),
        );
      } else {
        lines.push(
          `  ${k.violet(k.glyph.done)}  ${domain} ${k.muted(`· ${migrationPhaseLabel(m, t)}`)}`,
          command(`bladecp migrations status ${id(m)} --watch`),
        );
      }
    }
    if (active.length === 0)
      lines.push(`  ${k.faint(k.glyph.ring)}  ${k.muted(t('home.noMigrations'))}`);
    if (servers) {
      const present = servers.filter((s) => !isGoneServer(s.status));
      if (present.length === 0) {
        lines.push(`  ${k.faint(k.glyph.ring)}  ${k.muted(t('servers.empty'))}`);
      } else {
        const counts = new Map<string, number>();
        for (const s of present) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
        const text = [
          t(present.length === 1 ? 'servers.countOne' : 'servers.countMany', {
            count: present.length,
          }),
          ...[...counts.entries()].map(([status, count]) => serverStatusCount(status, count, t)),
        ].join(' · ');
        lines.push(`  ${k.ok(k.glyph.bullet)}  ${text}`);
      }
    }
  } else if (!auth) {
    lines.push(
      '',
      `  ${k.ruler(t('home.start'))}`,
      `  ${k.violet(k.glyph.active)}  ${t('home.signIn')}`,
      command('bladecp login'),
    );
  }

  lines.push(
    '',
    `  ${k.ruler(t('home.shortcuts'))}`,
    ...twoColumns(
      ctx.out,
      [
        ['bladecp migrate <backup.tar.gz>', t('next.migrate')],
        ['bladecp migrations', t('next.migrations')],
        ['bladecp servers', t('next.servers')],
        ['bladecp destinations', t('next.destinations')],
        ['bladecp --help', t('next.help')],
      ],
      {
        width: k.width + 2,
        paintLeft: k.accent,
        paintRight: k.muted,
        wrap: (s, w) => k.wrap(s, w, ''),
      },
    ),
    '',
    `  ${k.ruler(t('home.tip'))}`,
    ...k.wrap(t('home.tipText'), k.width + 2, '  '),
  );
  ctx.out.lines(lines);
  return ExitCode.OK;
}
