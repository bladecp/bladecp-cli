import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogs, detectLang, LANGS, normalizeLang, translate } from '../src/i18n/index.js';
import { runCli, tempDir } from './helpers/run.js';

const EM_DASH = String.fromCodePoint(0x2014);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('message catalogs', () => {
  const base = Object.keys(catalogs.en).sort();

  it.each(LANGS)('%s has exactly the same keys as English', (lang) => {
    expect(Object.keys(catalogs[lang]).sort()).toEqual(base);
  });

  it.each(LANGS)('%s keeps every placeholder and has no empty message', (lang) => {
    for (const key of base) {
      const text = catalogs[lang][key as keyof typeof catalogs.en];
      expect(text.trim(), `${lang} ${key}`).not.toBe('');
      expect(placeholders(text), `${lang} ${key}`).toEqual(
        placeholders(catalogs.en[key as keyof typeof catalogs.en]),
      );
    }
  });

  it.each(LANGS)('%s never uses the em dash', (lang) => {
    for (const [key, text] of Object.entries(catalogs[lang])) {
      expect(text.includes(EM_DASH), `${lang} ${key}`).toBe(false);
    }
  });

  it('every key used in the source exists in the catalog', () => {
    const files = [
      'src/cli.ts',
      'src/errors.ts',
      'src/commands/account.ts',
      'src/commands/follow.ts',
      'src/commands/migrate.ts',
      'src/commands/migrations.ts',
      'src/commands/servers.ts',
      'src/upload/plan.ts',
      'src/upload/uploader.ts',
      'src/auth/credentials.ts',
      'src/auth/loopback.ts',
      'src/endpoints.ts',
      'src/args.ts',
      'src/prompt.ts',
      'src/format.ts',
    ];
    const used = new Set<string>();
    for (const file of files) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const m of text.matchAll(
        /'((?:error|hint|login|logout|whoami|label|column|usage|destinations|migrate|upload|review|follow|outcome|status|approve|cancel|retry|progress|prompt|phase|component|componentStatus|help|option|servers|migrations)\.[A-Za-z_.]+)'/g,
      )) {
        used.add(m[1]!);
      }
    }
    const commandIds = new Set([
      'servers.list',
      'servers.show',
      'destinations.list',
      'migrations.list',
      'migrations.status',
      'migrations.review',
      'migrations.approve',
      'migrations.cancel',
      'migrations.retry',
    ]);
    const missing = [...used].filter((key) => !commandIds.has(key) && !(key in catalogs.en));
    expect(missing).toEqual([]);
  });
});

describe('language detection', () => {
  it('normalizes common spellings', () => {
    expect(normalizeLang('pt_BR')).toBe('pt-BR');
    expect(normalizeLang('pt')).toBe('pt-BR');
    expect(normalizeLang('es-AR')).toBe('es');
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('fr')).toBeUndefined();
  });

  it('follows LC_ALL, then LC_MESSAGES, then LANG, then the system locale', () => {
    expect(detectLang({ LC_ALL: 'es_ES.UTF-8', LANG: 'pt_BR.UTF-8' }, 'en-US')).toBe('es');
    expect(detectLang({ LC_MESSAGES: 'pt_BR.UTF-8', LANG: 'es_ES.UTF-8' }, 'en-US')).toBe('pt-BR');
    expect(detectLang({ LANG: 'pt_BR.UTF-8' }, 'en-US')).toBe('pt-BR');
    expect(detectLang({ LANG: 'C' }, 'pt-BR')).toBe('en');
    expect(detectLang({ LANG: 'fr_FR.UTF-8' }, 'pt-BR')).toBe('en');
    expect(detectLang({}, 'es-MX')).toBe('es');
    expect(detectLang({}, undefined)).toBe('en');
  });

  it('interpolates variables', () => {
    expect(translate('pt-BR', 'login.success', { email: 'a@example.com' })).toBe(
      'Conectado como a@example.com.',
    );
  });

  it('--lang overrides the environment, and a bad value is a usage error', async () => {
    const dir = tempDir();
    try {
      const es = await runCli(['whoami', '--lang', 'es'], {
        configDir: dir.path,
        env: { LANG: 'pt_BR.UTF-8' },
      });
      expect(es.stderr).toContain('No iniciaste sesión.');
      const pt = await runCli(['whoami'], { configDir: dir.path, env: { LANG: 'pt_BR.UTF-8' } });
      expect(pt.stderr).toContain('Você não está conectado.');
      const bad = await runCli(['whoami', '--lang', 'klingon'], { configDir: dir.path });
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain('Unknown language "klingon"');
    } finally {
      dir.cleanup();
    }
  });

  it('help is translated', async () => {
    const dir = tempDir();
    try {
      const pt = await runCli(['--help', '--lang', 'pt-BR'], { configDir: dir.path });
      expect(pt.stdout).toContain('Códigos de saída:');
      const es = await runCli(['--help', '--lang=es'], { configDir: dir.path });
      expect(es.stdout).toContain('Códigos de salida:');
    } finally {
      dir.cleanup();
    }
  });
});
