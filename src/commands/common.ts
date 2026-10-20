// What every command of the groups in src/commands/specs/ shares: the shape
// of a handler, reading options, the API with the saved sign-in, short IDs,
// the question before an action that changes something, and the JSON answer.
// Screens are built with the kit (src/ui/views.ts and src/ui/kit.ts).

import type { BladecpApi } from '../api.js';
import type { CommandSpec, OptionName, OptionValues } from '../args.js';
import { resolveAuth } from '../auth/credentials.js';
import { type Ctx, createApi } from '../context.js';
import { ApiError, CliError, ExitCode } from '../errors.js';
import type { MessageKey, Vars } from '../i18n/index.js';
import { resolveId } from '../ids.js';
import { confirmStep } from '../ui/interact.js';
import { kit } from '../ui/kit.js';

export interface Invocation {
  spec: CommandSpec;
  /** Positional arguments after the command words. */
  args: string[];
  values: OptionValues;
}

export type Handler = (ctx: Ctx, invocation: Invocation) => Promise<number>;

/** The handlers of one group, by command ID. */
export type Handlers = Record<string, Handler>;

/** A string option, or undefined. */
export function optString(values: OptionValues, name: OptionName): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

/** Every value of an option that may be repeated (or the single one given). */
export function optList(values: OptionValues, name: OptionName): string[] {
  const value = values[name];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

export function optFlag(values: OptionValues, name: OptionName): boolean {
  return values[name] === true;
}

/**
 * A usage error (exit 2, code `usage`) with a message of the catalog. An error
 * with a code of its own is thrown as a CliError written out with its code
 * literal, so test/reference.test.ts finds it and the reference lists it.
 */
export function usageError(message: MessageKey, vars: Vars = {}): CliError {
  return new CliError(message, vars, { exitCode: ExitCode.USAGE, code: 'usage' });
}

/** Where the number of an option that takes a catalog ID is listed. */
const NUMERIC_ID_LISTS: Partial<Record<OptionName, string>> = {
  plan: 'bladecp partner plans',
  location: 'bladecp partner locations',
};

/** A whole number option (`--plan 12`), or a usage error. */
export function optInteger(values: OptionValues, name: OptionName): number | undefined {
  const raw = optString(values, name);
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!/^\d{1,9}$/.test(trimmed)) {
    // The catalog shows a UUID next to the number: the CLI test of 20/10
    // passed the UUID twice before finding the number.
    const list = NUMERIC_ID_LISTS[name];
    throw new CliError(
      'error.invalidNumber',
      { option: `--${name}`, value: raw },
      {
        exitCode: ExitCode.USAGE,
        code: 'usage',
        ...(list !== undefined ? { hint: { key: 'hint.numericId', vars: { list } } } : {}),
      },
    );
  }
  return Number(trimmed);
}

/** An option the command cannot run without. */
export function requireOption(values: OptionValues, name: OptionName): string {
  const value = optString(values, name);
  if (value === undefined || value.trim() === '') {
    throw usageError('error.missingOption', { option: `--${name}` });
  }
  return value.trim();
}

/** The API with the saved sign-in (or BLADECP_API_KEY). */
export async function signedInApi(ctx: Ctx): Promise<BladecpApi> {
  const auth = await resolveAuth(ctx);
  return createApi(ctx, auth.apiKey);
}

/**
 * A server ID or the first characters of one (at least 4), resolved against
 * the servers the key can see.
 */
export async function serverId(api: BladecpApi, value: string): Promise<string> {
  return resolveId(value, () => api.listProvisions());
}

/** `{ ok: true, data }`, the success envelope of `--json`. */
export function emitData(ctx: Ctx, data: unknown): number {
  ctx.out.emitJson({ ok: true, data });
  return ExitCode.OK;
}

export interface ConfirmRequest {
  /** The question, already translated (it names what the action touches). */
  question: string;
  /** Lines under the question: what will happen. */
  detail?: string[];
  /** `--yes` was given. */
  yes: boolean;
  /** The answer Enter picks: no for what removes, stops or cannot be undone. */
  defaultYes?: boolean;
}

/**
 * On a terminal, an action that changes something asks first; `--yes` skips
 * the question. Without a terminal (scripts, CI, `--json`) the command itself
 * is the explicit act and runs, as `bladecp migrations cancel` does.
 * Returns whether to go on and whether the question was shown.
 */
export async function confirmAction(
  ctx: Ctx,
  request: ConfirmRequest,
): Promise<{ go: boolean; asked: boolean }> {
  if (!ctx.interactive || request.yes) return { go: true, asked: false };
  const k = kit(ctx.out, 'out');
  ctx.out.info('');
  const go = await confirmStep(ctx, k, {
    title: request.question,
    detail: (request.detail ?? []).flatMap((line) =>
      k.wrap(line, k.width - 6, '').map((part) => k.muted(part)),
    ),
    defaultYes: request.defaultYes ?? false,
  });
  return { go, asked: true };
}

/**
 * Partner commands answer 403 for a key without the partner:read scope. The
 * error then says the command is for partners, instead of a missing scope.
 */
export async function partnerOnly<T>(api: BladecpApi, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) throw error;
    let partner = true;
    try {
      partner = (await api.me()).scopes.includes('partner:read');
    } catch {
      // Keep the original error when the key cannot even be read.
    }
    if (partner) throw error;
    throw new CliError(
      'error.partnerOnly',
      {},
      { exitCode: ExitCode.FORBIDDEN, code: 'partner_only', hint: { key: 'hint.partnerOnly' } },
    );
  }
}

/** The key has the partner:read scope (a BladeCP partner key). */
export function isPartnerScopes(scopes: readonly string[]): boolean {
  return scopes.includes('partner:read');
}
