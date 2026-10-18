import { type Preferences, readConfig, writePreferences } from '../config.js';
import type { Ctx } from '../context.js';
import { CliError, ExitCode } from '../errors.js';
import { LANGS, type MessageKey, normalizeLang } from '../i18n/index.js';
import { kit } from '../ui/kit.js';

interface Setting {
  values: string[];
  fallback: string;
  read(p: Preferences): string;
  write(p: Preferences, value: string): Preferences;
  note?: MessageKey;
}

const onOff = ['on', 'off'];

/** The settings `bladecp config` knows, with their accepted values. */
export const SETTINGS: Record<string, Setting> = {
  'auto-update': {
    values: onOff,
    fallback: 'off',
    read: (p) => (p.autoUpdate ? 'on' : 'off'),
    write: (p, value) => ({ ...p, autoUpdate: value === 'on' }),
    note: 'config.noteAutoUpdate',
  },
  'update-check': {
    values: onOff,
    fallback: 'on',
    read: (p) => (p.updateCheck === false ? 'off' : 'on'),
    write: (p, value) => ({ ...p, updateCheck: value === 'on' }),
  },
  lang: {
    values: ['auto', ...LANGS],
    fallback: 'auto',
    read: (p) => normalizeLang(p.lang) ?? 'auto',
    write: (p, value) => {
      const { lang: _old, ...rest } = p;
      const lang = normalizeLang(value);
      return lang ? { ...rest, lang } : rest;
    },
  },
};

function setting(key: string): Setting {
  const found = SETTINGS[key];
  if (!found) {
    throw new CliError(
      'error.configKey',
      { key, keys: Object.keys(SETTINGS).join(', ') },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  return found;
}

async function preferences(ctx: Ctx): Promise<Preferences> {
  return (await readConfig(ctx.configDir)).preferences ?? {};
}

export async function configListCommand(ctx: Ctx): Promise<number> {
  const prefs = await preferences(ctx);
  const values = Object.fromEntries(
    Object.entries(SETTINGS).map(([key, s]) => [key, s.read(prefs)]),
  );
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: values });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  if (!ctx.out.rich) {
    for (const [key, value] of Object.entries(values)) ctx.out.print(`${key}=${value}`);
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  ctx.out.lines([
    '',
    `  ${k.ruler(t('config.title'))}`,
    ...k.rows(
      Object.entries(SETTINGS).map(([key, s]) => {
        const value = s.read(prefs);
        return [
          key,
          `${k.violet(value)}${value === s.fallback ? ` ${k.muted(`(${t('config.default')})`)}` : ''}`,
        ];
      }),
    ),
    '',
    `  ${k.muted(t('config.setHint'))}`,
  ]);
  return ExitCode.OK;
}

export async function configGetCommand(ctx: Ctx, key: string): Promise<number> {
  const s = setting(key);
  const value = s.read(await preferences(ctx));
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { key, value } });
    return ExitCode.OK;
  }
  ctx.out.print(value);
  return ExitCode.OK;
}

export async function configSetCommand(ctx: Ctx, key: string, raw: string): Promise<number> {
  const s = setting(key);
  const value = raw.trim();
  const accepted = s.values.find((v) => v.toLowerCase() === value.toLowerCase());
  if (!accepted) {
    throw new CliError(
      'error.configValue',
      { key, value, values: s.values.join(', ') },
      { exitCode: ExitCode.USAGE, code: 'usage' },
    );
  }
  const next = s.write(await preferences(ctx), accepted);
  await writePreferences(ctx.configDir, next);
  const saved = s.read(next);
  if (ctx.json) {
    ctx.out.emitJson({ ok: true, data: { key, value: saved } });
    return ExitCode.OK;
  }
  const t = ctx.out.t;
  if (!ctx.out.rich) {
    ctx.out.print(t('config.saved', { key, value: saved }));
    if (s.note && saved === 'on') ctx.out.print(t(s.note));
    return ExitCode.OK;
  }
  const k = kit(ctx.out, 'out');
  ctx.out.lines([
    '',
    `  ${k.ok(k.glyph.done)}  ${t('config.saved', { key, value: saved })}`,
    ...(s.note && saved === 'on'
      ? k.wrap(t(s.note), k.width - 3, '').map((line) => k.railLine(k.muted(line)))
      : []),
  ]);
  return ExitCode.OK;
}
