import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMANDS, GLOBAL_OPTIONS, OPTIONS, parseCli, resolveCommand } from '../src/args.js';
import { ApiError, describeApiError, ExitCode } from '../src/errors.js';
import { catalogs, LANGS, type MessageKey } from '../src/i18n/index.js';
import {
  buildReference,
  ERROR_CODES,
  exitCodeDescriptions,
  formatReference,
} from '../src/reference.js';

const root = new URL('..', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const EM_DASH = String.fromCodePoint(0x2014);
const EXIT_BY_NAME = ExitCode as Record<string, number>;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}

interface ThrowSite {
  file: string;
  code: string;
  exits: number[];
  keys: string[];
  hint?: string;
  /** The call fills `{url}` itself instead of leaving it to the API keys page. */
  urlVar?: boolean;
}

/** Every `new CliError(...)` call of the source, with its code, exit codes, keys and hint. */
function cliErrorSites(): ThrowSite[] {
  const sites: ThrowSite[] = [];
  for (const file of sourceFiles('src')) {
    if (file.endsWith('reference.ts')) continue;
    const text = read(file);
    let start = text.indexOf('new CliError(');
    while (start !== -1) {
      let depth = 0;
      let end = start + 'new CliError'.length;
      for (; end < text.length; end += 1) {
        if (text[end] === '(') depth += 1;
        else if (text[end] === ')' && --depth === 0) break;
      }
      let call = text.slice(start, end + 1);
      // `const key = cond ? 'a' : 'b'` right before the call (credentials.ts).
      if (/new CliError\(\s*key,/.test(call)) {
        call = text.slice(text.lastIndexOf('const key', start), end + 1);
      }
      const code = /code: '([a-z_]+)'/.exec(call)?.[1];
      if (!code) throw new Error(`${file}: a CliError without a code`);
      const exitLine = /exitCode: ([^\n]+)/.exec(call)?.[1] ?? '';
      const exits = [...exitLine.matchAll(/ExitCode\.(\w+)/g)].map((m) => EXIT_BY_NAME[m[1]!]!);
      const hint = /hint: \{ key: '([^']+)'/.exec(call)?.[1];
      const keys = [...call.matchAll(/'([a-z]+\.[A-Za-z]+)'/g)]
        .map((m) => m[1]!)
        .filter((key) => key !== hint && key in catalogs.en);
      const urlVar = /[{,]\s*url:/.test(call);
      sites.push({ file, code, exits, keys, urlVar, ...(hint ? { hint } : {}) });
      start = text.indexOf('new CliError(', end);
    }
  }
  return sites;
}

/** The codes `describe()` in src/cli.ts reports for non-CliError failures. */
function cliDescribeSites(): ThrowSite[] {
  const text = read('src/cli.ts');
  const body = text.slice(text.indexOf('function describe('), text.indexOf('function report('));
  return [
    ...body.matchAll(/key: '([^']+)',[\s\S]*?exitCode: ExitCode\.(\w+),\s*code: '([a-z_]+)'/g),
  ].map((m) => ({ file: 'src/cli.ts', keys: [m[1]!], exits: [EXIT_BY_NAME[m[2]!]!], code: m[3]! }));
}

/** Every outcome of `describeApiError` over the statuses and API codes it knows. */
function apiOutcomes() {
  const source = read('src/errors.ts');
  const apiCodes = new Set<string | undefined>([undefined, 'some_other_code']);
  for (const m of source.matchAll(/case '([^']+)'/g)) apiCodes.add(m[1]);
  for (const m of source.matchAll(/apiCode === '([^']+)'/g)) apiCodes.add(m[1]);
  const statuses = [400, 401, 402, 403, 404, 409, 410, 418, 422, 429, 500, 502, 503, 504];
  const messages = [undefined, "Not allowed in phase 'parsing'"];
  const outcomes = [];
  for (const status of statuses) {
    for (const apiCode of apiCodes) {
      for (const message of messages) {
        outcomes.push(describeApiError(new ApiError(status, apiCode, message, 30)));
      }
    }
  }
  return outcomes;
}

describe('reference.json', () => {
  const reference = buildReference();

  it('is the current output of the sources (run "pnpm run export:reference")', () => {
    expect(JSON.parse(read('reference.json'))).toEqual(reference);
    expect(read('reference.json')).toBe(formatReference(reference));
  });

  it('lists every command, option and global option with the three catalogs', () => {
    expect(reference.commands.map((command) => command.id)).toEqual(
      COMMANDS.map((spec) => spec.id),
    );
    expect(reference.options.map((option) => option.name)).toEqual(Object.keys(OPTIONS));
    expect(reference.globalOptions).toEqual([...GLOBAL_OPTIONS]);
    expect(reference.languages).toEqual([...LANGS]);
    for (const command of reference.commands) {
      expect(command.usage.startsWith(`bladecp ${command.command}`), command.id).toBe(true);
      for (const lang of LANGS) expect(command.summary[lang], command.id).toBeTruthy();
    }
    const destinations = reference.commands.find((command) => command.id === 'destinations.list');
    expect(destinations?.usage).toBe('bladecp destinations list [--currency <code>]');
    const watch = reference.options.find((option) => option.name === 'watch');
    expect(watch).toMatchObject({ flag: '--watch', short: '-w', value: null, global: false });
    expect(watch?.commands).toEqual(['migrations.status']);
    const lang = reference.options.find((option) => option.name === 'lang');
    expect(lang).toMatchObject({ value: '<en|pt-BR|es>', global: true, type: 'string' });
  });

  it('documents aliases that the parser really accepts', () => {
    const aliases = reference.aliases.map(({ alias, target }) => `${alias} = ${target}`);
    expect(aliases).toEqual([
      '-h = --help',
      '-v = --version',
      '-y = --yes',
      '-w = --watch',
      'bladecp help <command> = bladecp <command> --help',
      'bladecp servers = bladecp servers list',
      'bladecp destinations = bladecp destinations list',
      'bladecp migrations = bladecp migrations list',
    ]);
    for (const alias of reference.aliases.filter((entry) => entry.kind === 'short-option')) {
      const long = alias.target.slice(2) as keyof typeof OPTIONS;
      expect(parseCli([alias.alias]).values[long], alias.alias).toBe(true);
    }
    expect(resolveCommand(['help', 'migrations', 'status'])).toMatchObject({
      kind: 'help',
      topic: { id: 'migrations.status' },
    });
    for (const alias of reference.aliases.filter((entry) => entry.kind === 'group-default')) {
      const resolved = resolveCommand(alias.alias.split(' ').slice(1));
      expect(resolved.kind === 'command' && `bladecp ${resolved.spec.path.join(' ')}`).toBe(
        alias.target,
      );
    }
  });

  it('describes every exit code in the three languages', () => {
    const values = Object.values(ExitCode).sort((a, b) => a - b);
    expect(reference.exitCodes.map((exit) => exit.code)).toEqual(values);
    for (const lang of LANGS)
      expect([...exitCodeDescriptions(lang).keys()].sort((a, b) => a - b)).toEqual(values);
    expect(reference.exitCodes.find((exit) => exit.code === 10)?.description.en).toBe(
      'waiting for your action',
    );
  });

  it('never uses the em dash', () => {
    expect(formatReference(reference)).not.toContain(EM_DASH);
  });
});

describe('error code registry', () => {
  const registry = new Map(ERROR_CODES.map((spec) => [spec.code, spec]));

  it('has one entry per code, with catalog keys and known exit codes', () => {
    expect(registry.size).toBe(ERROR_CODES.length);
    const exits = new Set<number>(Object.values(ExitCode));
    for (const spec of ERROR_CODES) {
      expect(spec.message in catalogs.en, spec.code).toBe(true);
      if (spec.hint) expect(spec.hint in catalogs.en, spec.code).toBe(true);
      for (const exit of spec.exitCodes) expect(exits.has(exit), spec.code).toBe(true);
    }
  });

  it('matches every answer describeApiError can give', () => {
    const produced = new Set<string>();
    for (const outcome of apiOutcomes()) {
      produced.add(outcome.code);
      const spec = registry.get(outcome.code);
      expect(spec, `missing ${outcome.code} in ERROR_CODES`).toBeDefined();
      expect(spec?.origin, outcome.code).toBe('api');
      expect(spec?.exitCodes, outcome.code).toContain(outcome.exitCode);
      expect(spec?.message, outcome.code).toBe(outcome.key);
      expect(spec?.hint, outcome.code).toBe(outcome.hint?.key);
    }
    const declared = ERROR_CODES.filter((spec) => spec.origin === 'api').map((spec) => spec.code);
    expect([...produced].sort()).toEqual(declared.sort());
  });

  it('matches every error the CLI raises itself', () => {
    const sites = [...cliErrorSites(), ...cliDescribeSites()];
    expect(sites.length).toBeGreaterThan(40);
    const byCode = new Map<string, ThrowSite[]>();
    for (const site of sites) byCode.set(site.code, [...(byCode.get(site.code) ?? []), site]);
    for (const [code, found] of byCode) {
      const spec = registry.get(code);
      expect(spec, `missing ${code} (${found[0]!.file}) in ERROR_CODES`).toBeDefined();
      expect(spec?.origin, code).toBe('cli');
      for (const site of found) {
        expect(site.exits.length, `${site.file} ${code}`).toBeGreaterThan(0);
        for (const exit of site.exits)
          expect(spec?.exitCodes, `${site.file} ${code}`).toContain(exit);
      }
      const keys = found.flatMap((site) => site.keys);
      expect(keys, code).toContain(spec?.message as MessageKey);
      if (spec?.hint)
        expect(
          found.map((site) => site.hint),
          code,
        ).toContain(spec.hint);
    }
    const declared = ERROR_CODES.filter((spec) => spec.origin === 'cli').map((spec) => spec.code);
    expect([...byCode.keys()].sort()).toEqual(declared.sort());
  });

  it('uses {url} in error messages and hints only for the API keys page', () => {
    // The reporter fills {url} with the Hub API keys page; the documentation
    // renders it as that link, so no error may give {url} another meaning.
    const withUrl = new Set(
      ERROR_CODES.filter((spec) =>
        [spec.message, spec.hint].some((key) => key && catalogs.en[key].includes('{url}')),
      ).map((spec) => spec.code),
    );
    expect(withUrl.size).toBeGreaterThan(0);
    for (const site of cliErrorSites()) {
      expect(site.urlVar && withUrl.has(site.code), `${site.file} ${site.code}`).toBe(false);
    }
    for (const outcome of apiOutcomes()) {
      expect('url' in outcome.vars, outcome.code).toBe(false);
    }
  });
});
