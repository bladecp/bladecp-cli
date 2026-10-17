import { safeText } from '../sanitize.js';
import { en } from './en.js';
import { es } from './es.js';
import { ptBR } from './pt-BR.js';

export type Lang = 'en' | 'pt-BR' | 'es';
export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;
export type Vars = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['en', 'pt-BR', 'es'];

export const catalogs: Record<Lang, Catalog> = { en, 'pt-BR': ptBR, es };

/** Accepts `pt`, `pt-BR`, `pt_BR.UTF-8`, `es_ES`, `en-US` and similar spellings. */
export function normalizeLang(value: string | undefined): Lang | undefined {
  if (!value) return undefined;
  const lower = value.trim().toLowerCase().replace('_', '-');
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return undefined;
}

/**
 * Picks the language from the POSIX locale variables (LC_ALL, LC_MESSAGES,
 * LANG, in that order), then from the system locale, then English.
 */
export function detectLang(
  env: Record<string, string | undefined>,
  systemLocale: string | undefined,
): Lang {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const value = env[name]?.trim();
    if (!value) continue;
    // The first variable that is set decides, like gettext does.
    return normalizeLang(value.split('.')[0]) ?? 'en';
  }
  return normalizeLang(systemLocale) ?? 'en';
}

export function translate(lang: Lang, key: MessageKey, vars: Vars = {}): string {
  const template = catalogs[lang][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    // Values come from outside the catalog (API answers, file names): make
    // them terminal-safe here so every translated message is.
    Object.hasOwn(vars, name) ? safeText(vars[name]) : match,
  );
}

export type Translator = (key: MessageKey, vars?: Vars) => string;

export function createTranslator(lang: Lang): Translator {
  return (key, vars) => translate(lang, key, vars);
}
