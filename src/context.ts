import type { FetchLike, Sleep } from './api.js';
import { ApiClient, BladecpApi } from './api.js';
import type { Lang } from './i18n/index.js';
import type { Output, OutStream } from './output.js';
import type { Prompter } from './prompt.js';
import type { PutPart } from './upload/put.js';

export interface InStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
}

/** Everything the CLI touches in the outside world, injectable for tests. */
export interface Deps {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homedir: string;
  stdout: OutStream;
  stderr: OutStream;
  stdin: InStream;
  fetch: FetchLike;
  openUrl(url: string): Promise<boolean>;
  sleep: Sleep;
  now(): number;
  random(): number;
  createPrompter(): Prompter;
  signal: AbortSignal;
  systemLocale?: string | undefined;
  /** Test hooks with production defaults. */
  loginTimeoutMs?: number;
  pollIntervalMs?: number;
  upload?: {
    concurrency?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    putPart?: PutPart;
  };
}

export interface Ctx extends Deps {
  out: Output;
  lang: Lang;
  json: boolean;
  apiUrl: string;
  /** Hub paired with the API address. */
  hubUrl: string;
  /** Hub page where API keys are created and revoked. */
  keysUrl: string;
  configDir: string;
  userAgent: string;
  /** True when the CLI may ask questions (terminal on both ends, no --json). */
  interactive: boolean;
}

export function createApi(ctx: Ctx, apiKey: string | undefined): BladecpApi {
  ctx.out.addSecret(apiKey);
  return new BladecpApi(
    new ApiClient({
      baseUrl: ctx.apiUrl,
      apiKey,
      fetch: ctx.fetch,
      sleep: ctx.sleep,
      userAgent: ctx.userAgent,
      signal: ctx.signal,
      onRateLimited: (seconds) => ctx.out.info(ctx.out.t('progress.rateLimited', { seconds })),
    }),
  );
}
