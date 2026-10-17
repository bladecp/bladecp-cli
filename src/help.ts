import {
  argumentSyntax,
  COMMANDS,
  type CommandSpec,
  GLOBAL_OPTIONS,
  OPTION_HELP,
  type OptionName,
} from './args.js';
import { DOCS_URL } from './endpoints.js';
import type { Translator } from './i18n/index.js';

function optionLines(t: Translator, names: readonly OptionName[]): string[] {
  const width = Math.max(...names.map((name) => OPTION_HELP[name].syntax.length));
  return names.map(
    (name) => `  ${OPTION_HELP[name].syntax.padEnd(width)}  ${t(OPTION_HELP[name].key)}`,
  );
}

export function globalHelp(t: Translator, version: string): string {
  const entries = COMMANDS.map((spec) => {
    const syntax = [spec.path.join(' '), ...spec.args.map(argumentSyntax)].join(' ');
    return [syntax, t(spec.summary)] as const;
  });
  const width = Math.max(...entries.map(([syntax]) => syntax.length));
  return [
    `BladeCP CLI ${version}`,
    '',
    `${t('help.usageLabel')} bladecp <command> [options]`,
    '',
    t('help.commandsLabel'),
    ...entries.map(([syntax, summary]) => `  ${syntax.padEnd(width)}  ${summary}`),
    '',
    t('help.globalOptionsLabel'),
    ...optionLines(t, GLOBAL_OPTIONS),
    '',
    t('help.envLabel'),
    `  BLADECP_API_KEY   ${t('help.envApiKey')}`,
    `  BLADECP_API_URL   ${t('help.envApiUrl')}`,
    '',
    t('help.exitCodesLabel'),
    `  ${t('help.exitCodes')}`,
    '',
    t('help.moreInfo', { command: 'bladecp <command> --help', url: DOCS_URL }),
  ].join('\n');
}

export function commandHelp(t: Translator, spec: CommandSpec): string {
  const lines = [`${t('help.usageLabel')} ${spec.usage}`, '', t(spec.summary)];
  if (spec.options.length > 0) {
    lines.push('', t('help.optionsLabel'), ...optionLines(t, spec.options));
  }
  lines.push('', t('help.globalOptionsLabel'), ...optionLines(t, GLOBAL_OPTIONS));
  return lines.join('\n');
}

export function groupHelp(t: Translator, group: string): string {
  const specs = COMMANDS.filter((spec) => spec.path[0] === group);
  const width = Math.max(...specs.map((spec) => spec.usage.length));
  return [
    t('help.commandsLabel'),
    ...specs.map((spec) => `  ${spec.usage.padEnd(width)}  ${t(spec.summary)}`),
  ].join('\n');
}
