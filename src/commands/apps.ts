// `bladecp apps`: the apps BladeCP installs for you (WordPress and others),
// what each one needs, and installing one on a domain of a server. On a
// terminal the install asks for the settings that were not given; in
// scripts every setting comes with --option name=value.

import { randomUUID } from 'node:crypto';

import {
  type BladecpApi,
  dataList,
  dataObject,
  invalidResponse,
  isRecord,
  type Json,
} from '../api.js';
import type { Ctx } from '../context.js';
import { ApiError, CliError, ExitCode } from '../errors.js';
import type { MessageKey } from '../i18n/index.js';
import { safeText } from '../sanitize.js';
import { select } from '../ui/interact.js';
import { kit } from '../ui/kit.js';
import { type Column, type DetailRow, showDetail, showDone, showList } from '../ui/views.js';
import {
  confirmAction,
  emitData,
  type Handlers,
  optFlag,
  optList,
  optString,
  serverId,
  signedInApi,
  usageError,
} from './common.js';
import { hostArg, serverDomains, serverWord } from './domains.js';

interface AppVersion {
  version: string;
  isDefault: boolean;
  supported: boolean;
}

interface App {
  slug: string;
  name: string;
  category: string;
  description: string;
  defaultVersion: string;
  /** BladeCP can install it today (`availableInWorker`). */
  installable: boolean;
  versions: AppVersion[];
}

interface InputSpec {
  type: string;
  label: string;
  options: string[];
  minLen?: number;
  maxLen?: number;
}

interface AppDetail extends App {
  requiredInputs: string[];
  inputSpecs: Record<string, InputSpec>;
  adminUserDenylist: string[];
  runtime: Json | null;
  stores: Json | null;
  adminPath: string | null;
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function readApp(entry: Json): App {
  if (typeof entry.slug !== 'string' || entry.slug === '') throw invalidResponse();
  const versions = (Array.isArray(entry.versions) ? entry.versions : [])
    .filter(isRecord)
    .map((v) => ({
      version: text(v.version),
      isDefault: v.isDefault === true,
      supported: v.supported !== false,
    }))
    .filter((v) => v.version !== '');
  return {
    slug: entry.slug,
    name: text(entry.displayName) || entry.slug,
    category: text(entry.category),
    description: text(entry.description),
    defaultVersion: text(entry.defaultVersion) || versions.find((v) => v.isDefault)?.version || '',
    installable: entry.availableInWorker !== false,
    versions,
  };
}

function readSpec(raw: unknown): InputSpec {
  const spec = isRecord(raw) ? raw : {};
  return {
    type: text(spec.type, 'text'),
    label: text(spec.label),
    options: texts(spec.options),
    ...(typeof spec.minLen === 'number' ? { minLen: spec.minLen } : {}),
    ...(typeof spec.maxLen === 'number' ? { maxLen: spec.maxLen } : {}),
  };
}

function readDetail(entry: Json): AppDetail {
  const specs = isRecord(entry.inputSpecs) ? entry.inputSpecs : {};
  return {
    ...readApp(entry),
    requiredInputs: texts(entry.requiredInputs),
    inputSpecs: Object.fromEntries(
      Object.entries(specs).map(([name, spec]) => [name, readSpec(spec)]),
    ),
    adminUserDenylist: texts(entry.adminUserDenylist).map((name) => name.toLowerCase()),
    runtime: isRecord(entry.runtime) ? entry.runtime : null,
    stores: isRecord(entry.stores) ? entry.stores : null,
    adminPath: text(entry.adminPath) || null,
  };
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function slugArg(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG.test(slug)) throw usageError('apps.error.slug', { app: raw });
  return slug;
}

/** One app with its install spec; an unknown app says where the list is. */
async function fetchApp(api: BladecpApi, slug: string): Promise<{ raw: Json; app: AppDetail }> {
  try {
    const raw = dataObject(await api.request('getAppsBySlug', { params: { slug } }));
    return { raw, app: readDetail(raw) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      error.extraHint = { key: 'apps.hint.list' };
    }
    throw error;
  }
}

const CATEGORY_KEYS: Record<string, MessageKey> = {
  'content-management': 'apps.category.cms',
  cms: 'apps.category.cms',
  'e-commerce': 'apps.category.shop',
  ecommerce: 'apps.category.shop',
  blog: 'apps.category.blog',
  forum: 'apps.category.forum',
  wiki: 'apps.category.wiki',
};

/**
 * The catalog describes apps in English only; the apps the CLI knows read in
 * the person's language, and a new one shows the catalog's own text.
 */
const DESCRIPTION_KEYS: Record<string, MessageKey> = {
  wordpress: 'apps.description.wordpress',
};

function descriptionText(ctx: Ctx, app: { slug: string; description: string }): string {
  const key = DESCRIPTION_KEYS[app.slug];
  return key ? ctx.out.t(key) : app.description;
}

function categoryLabel(ctx: Ctx, category: string): string {
  const key = CATEGORY_KEYS[category];
  if (key) return ctx.out.t(key);
  return category ? safeText(category.replace(/[-_]+/g, ' ')) : '-';
}

const INPUT_KEYS: Record<string, MessageKey> = {
  admin_email: 'apps.input.adminEmail',
  admin_user: 'apps.input.adminUser',
  site_title: 'apps.input.siteTitle',
  locale: 'apps.input.locale',
  language: 'apps.input.locale',
};

/** The name of a setting in words: the CLI's own for the known ones, the API label otherwise. */
function inputLabel(ctx: Ctx, app: AppDetail, name: string): string {
  const key = INPUT_KEYS[name];
  if (key) return ctx.out.t(key);
  return safeText(app.inputSpecs[name]?.label || name);
}

const LANG_LOCALE = { en: 'en_US', 'pt-BR': 'pt_BR', es: 'es_ES' } as const;

const isLocaleInput = (name: string) => name === 'locale' || name === 'language';

/** The language of the CLI as the app writes it, when the app offers it. */
function localeDefault(ctx: Ctx, app: AppDetail, name: string): string | null {
  if (!isLocaleInput(name)) return null;
  const wanted = LANG_LOCALE[ctx.lang];
  const options = app.inputSpecs[name]?.options ?? [];
  return options.length === 0 || options.includes(wanted) ? wanted : null;
}

const isEmailInput = (app: AppDetail, name: string) => app.inputSpecs[name]?.type === 'email';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lengthRule(ctx: Ctx, spec: InputSpec): string | null {
  const t = ctx.out.t;
  if (spec.minLen !== undefined && spec.maxLen !== undefined)
    return t('apps.spec.length', { min: spec.minLen, max: spec.maxLen });
  if (spec.minLen !== undefined) return t('apps.spec.min', { min: spec.minLen });
  if (spec.maxLen !== undefined) return t('apps.spec.max', { max: spec.maxLen });
  return null;
}

/** Why a value does not fit the setting, or null when it fits. */
function invalidReason(ctx: Ctx, app: AppDetail, name: string, value: string): string | null {
  const t = ctx.out.t;
  const trimmed = value.trim();
  if (trimmed === '') return t('apps.invalid.empty');
  const spec = app.inputSpecs[name];
  if (!spec) return null;
  if (spec.type === 'email' && !EMAIL.test(trimmed)) return t('apps.invalid.email');
  if (spec.options.length > 0 && !spec.options.includes(trimmed))
    return t('apps.invalid.option', { options: spec.options.join(', ') });
  const length = [...trimmed].length;
  if (
    (spec.minLen !== undefined && length < spec.minLen) ||
    (spec.maxLen !== undefined && length > spec.maxLen)
  )
    return t('apps.invalid.length', { rule: lengthRule(ctx, spec) ?? '' });
  if (name === 'admin_user' && app.adminUserDenylist.includes(trimmed.toLowerCase()))
    return t('apps.invalid.denied', { value: trimmed });
  return null;
}

/** What a setting is and accepts, for `bladecp apps show`. */
function inputHelp(ctx: Ctx, app: AppDetail, name: string): string {
  const t = ctx.out.t;
  const spec = app.inputSpecs[name];
  const parts = [inputLabel(ctx, app, name)];
  if (spec?.type === 'email') parts.push(t('apps.spec.email'));
  if (spec && spec.options.length > 0)
    parts.push(t('apps.spec.options', { options: spec.options.join(', ') }));
  const rule = spec ? lengthRule(ctx, spec) : null;
  if (rule) parts.push(rule);
  if (name === 'admin_user' && app.adminUserDenylist.length > 0)
    parts.push(t('apps.spec.denied', { names: app.adminUserDenylist.join(', ') }));
  const locale = localeDefault(ctx, app, name);
  if (locale) parts.push(t('apps.spec.defaultLocale', { value: locale }));
  if (isEmailInput(app, name)) parts.push(t('apps.spec.defaultEmail'));
  return parts.join(' · ');
}

const RUNTIME_NAMES: Record<string, string> = {
  php: 'PHP',
  node: 'Node.js',
  nodejs: 'Node.js',
  python: 'Python',
  ruby: 'Ruby',
};

const STORE_NAMES: Record<string, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  redis: 'Redis',
};

/** "PHP 8.1 or newer · MySQL 5.7 or newer", from the runtime and stores of the spec. */
function needsText(ctx: Ctx, app: AppDetail): string | null {
  const t = ctx.out.t;
  const parts: string[] = [];
  const named = (names: Record<string, string>, raw: string) => names[raw] ?? safeText(raw);
  if (app.runtime && typeof app.runtime.language === 'string') {
    const name = named(RUNTIME_NAMES, app.runtime.language);
    const version = text(app.runtime.minVersion);
    parts.push(version ? t('apps.needs.version', { name, version }) : name);
  }
  for (const [store, raw] of Object.entries(app.stores ?? {})) {
    if (isRecord(raw) && raw.required === false) continue;
    const name = named(STORE_NAMES, store);
    const version = isRecord(raw) ? text(raw.minVersion) : '';
    parts.push(version ? t('apps.needs.version', { name, version }) : name);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function versionsText(ctx: Ctx, app: App): string {
  const supported = app.versions.filter((v) => v.supported).map((v) => v.version);
  if (supported.length === 0) return app.defaultVersion || '-';
  return supported
    .map((version) =>
      version === app.defaultVersion ? ctx.out.t('apps.versionDefault', { version }) : version,
    )
    .join(', ');
}

/** `--option name=value`, repeated: the settings given on the command line. */
function parseSettings(list: string[]): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const item of list) {
    const at = item.indexOf('=');
    const name = at > 0 ? item.slice(0, at).trim() : '';
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) {
      throw usageError('apps.error.setting', { value: item });
    }
    settings[name] = item.slice(at + 1).trim();
  }
  return settings;
}

/** The account email, the default administrator email of an app. */
async function accountEmail(api: BladecpApi): Promise<string | null> {
  try {
    return (await api.me()).customer_email || null;
  } catch {
    return null;
  }
}

/** Asks the settings still missing, one by one, on the terminal. */
async function askSettings(
  ctx: Ctx,
  app: AppDetail,
  names: string[],
  inputs: Record<string, string>,
  railOpen: boolean,
): Promise<void> {
  const t = ctx.out.t;
  const k = kit(ctx.out, 'err');
  ctx.out.infoLines([
    ...(railOpen ? [] : ['']),
    `  ${k.violet(k.glyph.active)}  ${t('apps.ask.title', { app: app.name })}`,
  ]);
  for (const name of names) {
    const label = inputLabel(ctx, app, name);
    const options = app.inputSpecs[name]?.options ?? [];
    if (options.length > 1) {
      const index = await select(ctx, k, {
        title: label,
        items: options.map((option) => safeText(option)),
      });
      inputs[name] = options[index]!;
      continue;
    }
    for (;;) {
      const prompter = ctx.createPrompter();
      let answer: string;
      try {
        const asked = ctx.out.promptLines(
          `  ${k.rail(k.glyph.bar)}  ${t('apps.ask.setting', { label })}`,
        );
        if (asked.length > 1) ctx.out.infoLines(asked.slice(0, -1));
        answer = await prompter.ask(ctx.out.renderPrompt(asked.at(-1) ?? label));
      } finally {
        prompter.close();
      }
      const reason = invalidReason(ctx, app, name, answer);
      if (!reason) {
        inputs[name] = answer.trim();
        break;
      }
      ctx.out.info(k.railLine(k.warn(reason)));
    }
  }
}

/** The domain to install on: the one asked for, the only one, or a choice on a terminal. */
async function pickHost(
  ctx: Ctx,
  app: AppDetail,
  hosts: string[],
): Promise<{ host: string | undefined; asked: boolean }> {
  if (hosts.length <= 1 || !ctx.interactive) return { host: hosts[0], asked: false };
  const k = kit(ctx.out, 'err');
  ctx.out.info('');
  const index = await select(ctx, k, {
    title: ctx.out.t('apps.ask.domain', { app: app.name }),
    items: hosts.map((host) => safeText(host)),
  });
  return { host: hosts[index], asked: true };
}

/** Adds what the person can do about a refusal of the install that the CLI understands. */
function explainInstallFailure(error: unknown, server: string, host: string, slug: string): void {
  if (!(error instanceof ApiError)) return;
  switch (error.apiCode) {
    case 'host_has_active_install':
      error.extraHint = { key: 'apps.hint.hostBusy', vars: { host } };
      return;
    case 'provision_not_ready':
      error.extraHint = { key: 'apps.hint.notReady', vars: { server } };
      return;
    case 'invalid_host':
      error.extraHint = { key: 'apps.hint.addDomain', vars: { server, host } };
      return;
    case 'admin_user_denylisted':
      error.extraHint = { key: 'apps.hint.denied' };
      return;
    case 'unknown_slug':
      error.extraHint = { key: 'apps.hint.list' };
      return;
    case 'unsupported_version':
    case 'missing_required_input':
      error.extraHint = { key: 'apps.hint.show', vars: { slug } };
      return;
    default:
  }
}

export const handlers: Handlers = {
  'apps.list': async (ctx) => {
    const api = await signedInApi(ctx);
    const raw = dataList(await api.request('getAppsCatalog'));
    const apps = raw.map(readApp);
    if (ctx.json) return emitData(ctx, raw);
    const t = ctx.out.t;
    const columns: Column<App>[] = [
      {
        header: t('apps.column.app'),
        value: (app) => app.slug,
        paint: (k, value) => k.violet(value),
        priority: 5,
      },
      { header: t('apps.column.name'), value: (app) => app.name, priority: 4, flex: true, min: 10 },
      {
        header: t('apps.column.category'),
        value: (app) => categoryLabel(ctx, app.category),
        paint: (k, value) => k.muted(value),
        priority: 1,
        flex: true,
        min: 10,
      },
      {
        header: t('apps.column.version'),
        value: (app) => (app.installable ? app.defaultVersion || '-' : t('apps.soon')),
        paint: (k, value, app) => (app.installable ? value : k.faint(value)),
        priority: 3,
      },
    ];
    const first = apps.find((app) => app.installable) ?? apps[0];
    showList(ctx.out, {
      items: apps,
      columns,
      empty: t('apps.empty'),
      summary: apps.length === 1 ? t('apps.countOne') : t('apps.countMany', { count: apps.length }),
      ...(first
        ? {
            next: [
              { text: t('apps.next.show'), command: `bladecp apps show ${first.slug}` },
              {
                text: t('apps.next.install'),
                command: `bladecp apps install <server> ${first.slug}`,
              },
            ],
          }
        : {}),
    });
    return ExitCode.OK;
  },

  'apps.show': async (ctx, { args }) => {
    const slug = slugArg(args[0]!);
    const api = await signedInApi(ctx);
    const { raw, app } = await fetchApp(api, slug);
    if (ctx.json) return emitData(ctx, raw);
    const t = ctx.out.t;
    const needs = needsText(ctx, app);
    const rows: DetailRow[] = [
      [t('apps.label.app'), app.slug],
      [t('apps.label.category'), categoryLabel(ctx, app.category)],
      ...(app.description
        ? [[t('apps.label.description'), descriptionText(ctx, app)] as DetailRow]
        : []),
      [t('apps.label.versions'), versionsText(ctx, app)],
      ...(needs ? [[t('apps.label.needs'), needs] as DetailRow] : []),
      ...(app.adminPath ? [[t('apps.label.adminPage'), app.adminPath] as DetailRow] : []),
    ];
    showDetail(ctx.out, {
      title: app.name,
      status: app.installable
        ? { label: t('label.status'), text: t('apps.status.ready'), tone: 'ok' }
        : { label: t('label.status'), text: t('apps.soon'), tone: 'faint' },
      rows,
      sections: [
        {
          title: t('apps.section.settings'),
          rows: app.requiredInputs.map((name) => [name, inputHelp(ctx, app, name)]),
        },
      ],
      ...(app.installable
        ? {
            notes: [t('apps.showNote')],
            next: [
              {
                text: t('apps.next.install'),
                command: `bladecp apps install <server> ${app.slug}`,
              },
            ],
          }
        : {}),
    });
    return ExitCode.OK;
  },

  'apps.install': async (ctx, { args, values }) => {
    const t = ctx.out.t;
    const server = serverWord(args[0]!);
    const slug = slugArg(args[1]!);
    const given = parseSettings(optList(values, 'option'));
    const domainOption = optString(values, 'domain');
    const wanted = domainOption === undefined ? undefined : hostArg(domainOption);
    const versionOption = optString(values, 'app-version')?.trim() || undefined;

    const api = await signedInApi(ctx);
    const uuid = await serverId(api, args[0]!);
    const { app } = await fetchApp(api, slug);

    const supported = app.versions.filter((v) => v.supported).map((v) => v.version);
    if (versionOption && supported.length > 0 && !supported.includes(versionOption)) {
      throw usageError('apps.error.version', {
        app: app.name,
        version: versionOption,
        versions: supported.join(', '),
      });
    }
    const version = versionOption ?? app.defaultVersion;

    const domains = await serverDomains(api, uuid);
    const hosts = [domains.primary, ...domains.additional].filter((host) => host !== '');
    if (wanted && !hosts.includes(wanted)) {
      throw new CliError(
        'apps.error.host',
        { host: wanted },
        {
          exitCode: ExitCode.USAGE,
          code: 'usage',
          hint: { key: 'apps.hint.addDomain', vars: { server, host: wanted } },
        },
      );
    }
    const picked = wanted ? { host: wanted, asked: false } : await pickHost(ctx, app, hosts);
    const host = picked.host;
    if (!host) throw usageError('apps.error.noDomain', { server });

    // Settings: what was given, then the defaults (the CLI language, the
    // account email), then questions on a terminal for what is still missing.
    const inputs: Record<string, string> = { ...given };
    for (const [name, value] of Object.entries(given)) {
      const reason = invalidReason(ctx, app, name, value);
      if (reason) {
        throw usageError('apps.error.value', { label: inputLabel(ctx, app, name), name, reason });
      }
    }
    let email: string | null | undefined;
    for (const name of app.requiredInputs) {
      if (inputs[name]) continue;
      const locale = localeDefault(ctx, app, name);
      if (locale) {
        inputs[name] = locale;
        continue;
      }
      if (isEmailInput(app, name)) {
        if (email === undefined) email = await accountEmail(api);
        if (email) inputs[name] = email;
      }
    }
    const missing = app.requiredInputs.filter((name) => !inputs[name]);
    if (missing.length > 0) {
      if (!ctx.interactive) {
        throw new CliError(
          'apps.error.missing',
          { app: app.name, names: missing.join(', ') },
          {
            exitCode: ExitCode.USAGE,
            code: 'usage',
            hint: { key: 'apps.hint.options', vars: { slug } },
          },
        );
      }
      await askSettings(ctx, app, missing, inputs, picked.asked);
    }

    const shown = [...app.requiredInputs, ...Object.keys(inputs)].filter(
      (name, i, all) => all.indexOf(name) === i && inputs[name] !== undefined,
    );
    const { go, asked } = await confirmAction(ctx, {
      question: t('apps.confirm', { app: app.name, version }),
      detail: [
        t('apps.settingLine', { label: t('label.domain'), value: host }),
        ...shown.map((name) =>
          t('apps.settingLine', { label: inputLabel(ctx, app, name), value: inputs[name]! }),
        ),
      ],
      yes: optFlag(values, 'yes'),
      defaultYes: true,
    });
    if (!go) {
      showDone(ctx.out, { text: t('apps.declined'), tone: 'faint', afterQuestion: asked });
      return ExitCode.OK;
    }

    let data: Json;
    try {
      data = dataObject(
        await api.request('postProvisionsByUuidAppsInstall', {
          params: { uuid },
          body: { slug: app.slug, ...(version ? { version } : {}), host, inputs },
          idempotencyKey: randomUUID(),
        }),
      );
    } catch (error) {
      explainInstallFailure(error, server, host, slug);
      throw error;
    }
    if (ctx.json) return emitData(ctx, data);
    const installedHost = text(data.host) || host;
    const path = app.adminPath
      ? app.adminPath.startsWith('/')
        ? app.adminPath
        : `/${app.adminPath}`
      : '/';
    showDone(ctx.out, {
      text: t('apps.installing', {
        app: app.name,
        version: text(data.version) || version || '',
        host: installedHost,
      }),
      afterQuestion: asked,
      next: [
        {
          text: app.adminPath ? t('apps.installingAdmin') : t('apps.installingSite'),
          command: `https://${installedHost}${path}`,
        },
      ],
    });
    return ExitCode.OK;
  },
};
