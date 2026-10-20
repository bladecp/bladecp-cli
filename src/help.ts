import {
  argumentsSyntax,
  type BaseCommandId,
  COMMANDS,
  type CommandSpec,
  GLOBAL_OPTIONS,
  GROUP_DEFAULTS,
  GROUP_EXTRAS,
  HELP_GROUPS,
  type HelpExtras,
  type HelpGroup,
  OPTION_HELP,
  type OptionName,
  TOPICS,
  type Topic,
  YES_HELP,
} from './args.js';
import { DOCS_URL } from './endpoints.js';
import { exitCodeDescriptions } from './exits.js';
import type { MessageKey } from './i18n/index.js';
import { type Kit, kit } from './ui/kit.js';
import { padEnd, twoColumns } from './ui/layout.js';
import type { Output } from './ui/output.js';

const GROUP_TITLES: Record<HelpGroup, MessageKey> = {
  account: 'help.group.account',
  servers: 'help.group.servers',
  sites: 'help.group.sites',
  migrations: 'help.group.migrations',
  partner: 'help.group.partner',
  automation: 'help.group.automation',
  cli: 'help.group.cli',
};

/** Environment variables, in the order the help lists them. */
export const ENVIRONMENT: [string, MessageKey][] = [
  ['BLADECP_API_KEY', 'help.envApiKey'],
  ['BLADECP_API_URL', 'help.envApiUrl'],
  ['BLADECP_HUB_URL', 'help.envHubUrl'],
  ['BLADECP_CONFIG_DIR', 'help.envConfigDir'],
  ['BLADECP_NO_UPDATE_CHECK', 'help.envNoUpdateCheck'],
  ['BLADECP_MOTION', 'help.envMotion'],
  ['NO_COLOR', 'help.envNoColor'],
  ['FORCE_COLOR', 'help.envForceColor'],
  ['CI', 'help.envCi'],
];

const EXAMPLES: [string, MessageKey][] = [
  ['bladecp login', 'help.ex.login'],
  ['bladecp analyze cpmove-site.tar.gz', 'help.ex.analyze'],
  ['bladecp migrate cpmove-site.tar.gz', 'help.ex.migrate'],
  ['bladecp migrate cpmove-site.tar.gz --yes --json', 'help.ex.ci'],
  ['bladecp migrations status <uuid> --watch', 'help.ex.watch'],
];

type Extras = HelpExtras;

const ID_NOTE: MessageKey = 'help.note.shortIds';

const BASE_EXTRAS: Partial<Record<BaseCommandId, Extras>> = {
  login: {
    examples: [
      ['bladecp login', 'help.ex.login'],
      ['bladecp login --no-browser', 'help.ex.loginRemote'],
      ['bladecp login --token -', 'help.ex.loginStdin'],
    ],
  },
  'servers.list': { notes: ['help.note.serversAll'] },
  'servers.show': { notes: [ID_NOTE] },
  analyze: {
    desc: 'ahelp.desc',
    args: [['<backup.tar.gz>', 'ahelp.backupArg']],
    examples: [
      ['bladecp analyze cpmove-site.tar.gz', 'ahelp.ex1'],
      ['bladecp analyze cpmove-site.tar.gz --prices', 'ahelp.ex2'],
      ['bladecp analyze cpmove-site.tar.gz --json', 'ahelp.ex3'],
    ],
    exits: [
      [0, 'ahelp.exit0'],
      [2, 'ahelp.exit2'],
      [6, 'ahelp.exit6'],
    ],
    notes: ['ahelp.note'],
    seeAlso: ['bladecp migrate <backup.tar.gz>'],
  },
  migrate: {
    desc: 'mhelp.desc',
    args: [['<backup.tar.gz>', 'mhelp.backupArg']],
    flow: [
      'mhelp.flow1',
      'mhelp.flow2',
      'mhelp.flow3',
      'mhelp.flow4',
      'mhelp.flow5',
      'mhelp.flow6',
    ],
    examples: [
      ['bladecp migrate cpmove-site.tar.gz', 'mhelp.ex1'],
      ['bladecp migrate cpmove-site.tar.gz --plan 12 --location 3', 'mhelp.ex2'],
      ['bladecp migrate cpmove-site.tar.gz --yes --no-wait --json', 'mhelp.ex3'],
    ],
    exits: [
      [0, 'mhelp.exit0'],
      [9, 'mhelp.exit9'],
      [10, 'mhelp.exit10'],
      [130, 'mhelp.exit130'],
    ],
    seeAlso: [
      'bladecp analyze <backup.tar.gz>',
      'bladecp destinations',
      'bladecp migrations status <uuid> --watch',
    ],
  },
  'migrations.status': {
    notes: [ID_NOTE],
    examples: [['bladecp migrations status 0197a5d1 --watch', 'help.ex.watch']],
  },
  'migrations.review': { notes: [ID_NOTE] },
  'migrations.approve': { notes: ['help.note.approve', ID_NOTE] },
  'migrations.cancel': { notes: [ID_NOTE] },
  'migrations.retry': { notes: [ID_NOTE] },
  update: {
    desc: 'help.updateDesc',
    examples: [
      ['bladecp update', 'help.ex.update'],
      ['bladecp update --check --json', 'help.ex.updateCheck'],
    ],
    notes: ['help.note.autoUpdate'],
  },
  'config.list': { notes: ['help.note.configKeys'] },
  'config.get': { notes: ['help.note.configKeys'] },
  'config.set': {
    notes: ['help.note.configKeys'],
    examples: [['bladecp config set auto-update on', 'help.ex.autoUpdate']],
  },
};

const EXTRAS: Record<string, Extras> = { ...BASE_EXTRAS, ...GROUP_EXTRAS };

function optionHelpKey(spec: CommandSpec | null, name: OptionName): MessageKey {
  const own = spec?.optionHelp?.[name];
  if (own) return own;
  if (spec && name === 'yes') return YES_HELP[spec.id as BaseCommandId] ?? OPTION_HELP.yes.key;
  return OPTION_HELP[name].key;
}

function commandSyntax(spec: CommandSpec): string {
  return [spec.path.join(' '), ...argumentsSyntax(spec)].join(' ');
}

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.length <= path.length && prefix.every((segment, i) => path[i] === segment);

/** The topic a command is listed under in the help of `prefix`, if any. */
function topicOf(path: readonly string[], prefix: readonly string[]): Topic | undefined {
  return TOPICS.find(
    (topic) =>
      topic.path.length > prefix.length &&
      startsWith(topic.path, prefix) &&
      startsWith(path, topic.path) &&
      path.length > topic.path.length,
  );
}

/**
 * The lines of a list of commands under `prefix`: each command not inside a
 * topic, and each topic once, as "<words> <command>".
 */
function entries(
  c: Ctx,
  prefix: readonly string[],
  specs: CommandSpec[],
): { left: string; right: string; width: number }[] {
  const { k } = c;
  const seen = new Set<Topic>();
  const rows: { left: string; right: string; width: number }[] = [];
  for (const spec of specs) {
    const topic = topicOf(spec.path, prefix);
    if (topic) {
      if (seen.has(topic)) continue;
      seen.add(topic);
      const words = topic.path.slice(prefix.length).join(' ');
      const arg = c.out.t('help.cmdArg');
      rows.push({
        left: `${k.accent(words)} ${k.violet(arg)}`,
        right: c.out.t(topic.summary),
        width: words.length + 1 + arg.length,
      });
      continue;
    }
    const words = spec.path.slice(prefix.length).join(' ');
    const args = argumentsSyntax(spec).join(' ');
    rows.push({
      left: `${k.accent(words)}${args ? ` ${k.violet(args)}` : ''}`,
      right: c.out.t(spec.summary),
      width: words.length + (args ? args.length + 1 : 0),
    });
  }
  return rows;
}

interface Ctx {
  out: Output;
  k: Kit;
  /** Wrap width (Infinity without a terminal: nothing is wrapped). */
  width: number;
}

function setup(out: Output): Ctx {
  const k = kit(out, 'out');
  return {
    out,
    k,
    width: Number.isFinite(out.columns) ? Math.min(out.columns, 100) - 1 : Number.POSITIVE_INFINITY,
  };
}

function wrap(c: Ctx, text: string, width: number): string[] {
  return Number.isFinite(width) ? c.k.wrap(text, width, '').map((l) => l) : [text];
}

function ruler(c: Ctx, key: MessageKey): string {
  return `  ${c.k.ruler(c.out.t(key), Math.min(44, Number.isFinite(c.width) ? c.width - 2 : 44))}`;
}

function optionLines(c: Ctx, spec: CommandSpec | null, names: readonly OptionName[]): string[] {
  return twoColumns(
    c.out,
    names.map((name) => [OPTION_HELP[name].syntax, c.out.t(optionHelpKey(spec, name))]),
    { width: c.width, paintLeft: c.k.accent, paintRight: c.k.muted, wrap: (t, w) => wrap(c, t, w) },
  );
}

function prose(c: Ctx, text: string, paint: (s: string) => string = (s) => s): string[] {
  return wrap(c, text, c.width - 2).map((line) => `  ${paint(line)}`);
}

function exampleLines(c: Ctx, examples: [string, MessageKey][]): string[] {
  return examples.flatMap(([command, key]) => [
    `  ${c.k.violet(c.k.glyph.arrow)} ${command}`,
    ...wrap(c, c.out.t(key), c.width - 4).map((line) => `    ${c.k.muted(line)}`),
  ]);
}

/** Usage line, broken at option groups on a narrow terminal. */
function usageLines(c: Ctx, usage: string): string[] {
  if (!Number.isFinite(c.width) || usage.length + 2 <= c.width) return [`  ${usage}`];
  const parts = usage.match(/\[[^\]]+\]|\S+/g) ?? [usage];
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    if (line && line.length + 1 + part.length + 2 > c.width) {
      lines.push(line);
      line = `    ${part}`;
    } else line = line ? `${line} ${part}` : part;
  }
  lines.push(line);
  return lines.map((l, i) => (i === 0 ? `  ${l}` : `  ${l}`));
}

function exitLines(c: Ctx, codes: [number, string][]): string[] {
  const k = c.k;
  const tone = (code: number) =>
    code === 0
      ? k.ok
      : code === 9 || code === 130
        ? k.err
        : code === 10 || code === 11
          ? k.warn
          : k.violet;
  const cell = ([code, text]: [number, string]) =>
    `${tone(code)(String(code).padStart(3))} ${text}`;
  const leftWidth = Math.max(
    ...codes.map(([code, text]) => String(code).padStart(3).length + 1 + c.out.width(text)),
  );
  if (!Number.isFinite(c.width) || c.width >= leftWidth * 2 + 6) {
    const half = Math.ceil(codes.length / 2);
    const lines: string[] = [];
    for (let i = 0; i < half; i += 1) {
      const a = codes[i]!;
      const b = codes[i + half];
      lines.push(`  ${b ? padEnd(c.out, cell(a), leftWidth + 4) : cell(a)}${b ? cell(b) : ''}`);
    }
    return lines;
  }
  return codes.flatMap(([code, text]) =>
    wrap(c, text, c.width - 8).map((part, i) =>
      i === 0 ? `  ${cell([code, part])}` : `      ${part}`,
    ),
  );
}

export function globalHelp(out: Output, version: string): string {
  const c = setup(out);
  const { k } = c;
  const t = out.t;
  const W = Number.isFinite(c.width) ? Math.min(c.width - 1, 78) : 78;
  const lines = [
    `  ${k.wordmark(version)}`,
    ` ${k.horizon(W, { at: 0.18, spread: 0.5 })}`,
    ...prose(c, t('brand.tagline'), k.muted),
    '',
    `  ${k.muted(`${t('help.usageLabel')}:`)} bladecp ${k.accent(t('help.cmdArg'))} ${k.muted(t('help.optsArg'))}`,
  ];
  const sections = HELP_GROUPS.map((group) => ({
    group,
    rows: entries(
      c,
      [],
      COMMANDS.filter((spec) => spec.group === group),
    ),
  }));
  const commandWidth = Math.max(...sections.flatMap((s) => s.rows.map((row) => row.width)));
  for (const section of sections) {
    if (section.rows.length === 0) continue;
    lines.push('', ruler(c, GROUP_TITLES[section.group]));
    lines.push(
      ...twoColumns(
        out,
        section.rows.map((row) => [row.left, row.right]),
        { width: c.width, minLeft: commandWidth, wrap: (text, w) => wrap(c, text, w) },
      ),
    );
  }
  lines.push('', ruler(c, 'help.examples'), ...exampleLines(c, EXAMPLES));
  lines.push('', ruler(c, 'help.globalOptionsLabel'), ...optionLines(c, null, GLOBAL_OPTIONS));
  lines.push(
    '',
    ruler(c, 'help.envLabel'),
    ...twoColumns(
      out,
      ENVIRONMENT.map(([name, key]) => [name, t(key)]),
      {
        width: c.width,
        paintLeft: k.accent,
        paintRight: k.muted,
        wrap: (text, w) => wrap(c, text, w),
      },
    ),
  );
  const codes = [...exitCodeDescriptions(out.lang).entries()].sort((a, b) => a[0] - b[0]);
  lines.push('', ruler(c, 'help.exitCodesLabel'), ...exitLines(c, codes));
  lines.push(
    '',
    ...prose(c, t('help.json'), k.violet),
    '',
    ...prose(
      c,
      t('help.moreInfo', { command: 'bladecp <command> --help', url: DOCS_URL }),
      k.muted,
    ),
  );
  return lines.join('\n');
}

export function commandHelp(out: Output, spec: CommandSpec): string {
  const c = setup(out);
  const { k } = c;
  const t = out.t;
  const extras = EXTRAS[spec.id] ?? {};
  const W = Number.isFinite(c.width) ? Math.min(c.width - 1, 78) : 78;
  const title = `${k.bold(`bladecp ${spec.path.join(' ')}`)}${spec.args.length ? ` ${k.violet(argumentsSyntax(spec).join(' '))}` : ''}`;
  const lines = [
    `  ${title}`,
    ` ${k.horizon(W, { at: 0.12, spread: 0.45 })}`,
    ...prose(c, t(extras.desc ?? spec.summary), extras.desc ? k.muted : (s) => s),
    '',
    `  ${k.ruler(t('help.usageLabel'), 44)}`,
    ...usageLines(c, spec.usage),
  ];
  if (extras.args) {
    lines.push(
      '',
      ruler(c, 'mhelp.args'),
      ...twoColumns(
        out,
        extras.args.map(([name, key]) => [name, t(key)]),
        {
          width: c.width,
          paintLeft: k.violet,
          wrap: (text, w) => wrap(c, text, w),
        },
      ),
    );
  }
  if (spec.options.length > 0) {
    lines.push('', ruler(c, 'help.optionsLabel'), ...optionLines(c, spec, spec.options));
  }
  if (extras.flow) {
    lines.push('', ruler(c, 'mhelp.flow'));
    extras.flow.forEach((key, i) => {
      const last = i === extras.flow!.length - 1;
      lines.push(`  ${last ? k.ok(k.glyph.done) : k.violet(k.glyph.active)}  ${t(key)}`);
      if (!last) lines.push(`  ${k.rail(k.glyph.bar)}`);
    });
  }
  if (extras.notes) {
    lines.push('');
    for (const note of extras.notes) lines.push(...prose(c, t(note), k.muted));
  }
  if (extras.examples)
    lines.push('', ruler(c, 'help.examples'), ...exampleLines(c, extras.examples));
  if (extras.exits) {
    lines.push(
      '',
      ruler(c, 'help.exitCodesLabel'),
      ...exitLines(
        c,
        extras.exits.map(([code, key]) => [code, t(key)]),
      ),
    );
  }
  lines.push('', ruler(c, 'help.globalOptionsLabel'), ...optionLines(c, null, GLOBAL_OPTIONS));
  if (extras.seeAlso) {
    lines.push(
      '',
      `  ${k.muted(t('help.seeAlso'))}  ${extras.seeAlso.map((s) => k.accent(s)).join(k.muted(' · '))}`,
    );
  }
  return lines.join('\n');
}

export function groupHelp(out: Output, group: string): string {
  const c = setup(out);
  const { k } = c;
  const t = out.t;
  const prefix = group.split(' ');
  const specs = COMMANDS.filter(
    (spec) => spec.path.length > prefix.length && startsWith(spec.path, prefix),
  );
  const topic = TOPICS.find((candidate) => candidate.path.join(' ') === group);
  const W = Number.isFinite(c.width) ? Math.min(c.width - 1, 78) : 78;
  const lines = [
    `  ${k.bold(`bladecp ${group}`)}`,
    ` ${k.horizon(W, { at: 0.12, spread: 0.45 })}`,
    ...(topic ? [...prose(c, t(topic.summary), k.muted), ''] : []),
    `  ${k.muted(`${t('help.usageLabel')}:`)} bladecp ${group} ${k.accent(t('help.cmdArg'))} ${k.muted(t('help.optsArg'))}`,
    '',
    ruler(c, 'help.commandsLabel'),
    ...twoColumns(
      out,
      entries(c, prefix, specs).map((row) => [row.left, row.right]),
      { width: c.width, wrap: (text, w) => wrap(c, text, w) },
    ),
    '',
  ];
  const fallback = COMMANDS.find((spec) => spec.id === GROUP_DEFAULTS[group]);
  if (fallback)
    lines.push(
      ...prose(
        c,
        t('help.groupDefault', { group, command: `bladecp ${commandSyntax(fallback)}` }),
        k.muted,
      ),
    );
  if (group === 'migrations') {
    lines.push(`  ${k.muted(t('help.seeAlso'))}  ${k.accent('bladecp migrate <backup.tar.gz>')}`);
  }
  lines.push(
    ...prose(
      c,
      t('help.groupMore', { command: `bladecp ${group} ${t('help.cmdArg')} --help` }),
      k.muted,
    ),
  );
  return lines.join('\n');
}

// --------------------------------------------------------------------- JSON

/** `--help --json`: the same help as one JSON document, for scripts and agents. */
export function helpDocument(
  out: Output,
  version: string,
  topic: { spec?: CommandSpec | undefined; group?: string | undefined },
): unknown {
  const t = out.t;
  const option = (spec: CommandSpec | null, name: OptionName) => ({
    syntax: OPTION_HELP[name].syntax,
    description: t(optionHelpKey(spec, name)),
  });
  const command = (spec: CommandSpec) => ({
    command: spec.path.join(' '),
    usage: spec.usage,
    summary: t(spec.summary),
  });
  if (topic.spec) {
    const spec = topic.spec;
    return {
      ok: true,
      data: {
        ...command(spec),
        options: spec.options.map((name) => option(spec, name)),
        globalOptions: GLOBAL_OPTIONS.map((name) => option(null, name)),
      },
    };
  }
  if (topic.group) {
    return {
      ok: true,
      data: {
        group: topic.group,
        commands: COMMANDS.filter(
          (spec) =>
            spec.path.length > topic.group!.split(' ').length &&
            startsWith(spec.path, topic.group!.split(' ')),
        ).map(command),
      },
    };
  }
  return {
    ok: true,
    data: {
      name: 'BladeCP CLI',
      version,
      usage: 'bladecp <command> [options]',
      commands: COMMANDS.map(command),
      globalOptions: GLOBAL_OPTIONS.map((name) => option(null, name)),
      environment: ENVIRONMENT.map(([name, key]) => ({ name, description: t(key) })),
      exitCodes: [...exitCodeDescriptions(out.lang).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([code, description]) => ({ code, description })),
      docs: DOCS_URL,
    },
  };
}
