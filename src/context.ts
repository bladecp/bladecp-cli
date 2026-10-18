import type { FetchLike, Sleep } from './api.js';
import { ApiClient, BladecpApi } from './api.js';
import type { Preferences } from './config.js';
import type { Lang } from './i18n/index.js';
import { kit } from './ui/kit.js';
import type { Output, OutStream } from './ui/output.js';
import type { Prompter } from './ui/prompt.js';
import type { UpdateJob } from './update/check.js';
import type { PutPart } from './upload/put.js';
import { cliVersion } from './version.js';

export interface InStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
}

export interface ProcessResult {
  /** Exit status, or null when the command could not start. */
  code: number | null;
  /** Everything the command printed (stdout and stderr), for diagnosis. */
  output: string;
  /** Why the command could not start (ENOENT, EACCES, ...). */
  startError?: string;
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
  /** Copies text to the clipboard; false when no clipboard tool answers. */
  copyText(text: string): Promise<boolean>;
  sleep: Sleep;
  /** Real-time wait used only to pace animations. */
  frame(ms: number): Promise<void>;
  now(): number;
  random(): number;
  createPrompter(): Prompter;
  signal: AbortSignal;
  systemLocale?: string | undefined;
  /** Real path of the running `bin.js`, to tell how the CLI was installed. */
  binPath: string;
  /** Starts the daily version check in the background; never waits for it. */
  startUpdateCheck(job: UpdateJob): void;
  /** Runs a program (for `bladecp update`), passing each line it prints. */
  runProcess(
    command: string,
    args: string[],
    onLine: (line: string) => void,
  ): Promise<ProcessResult>;
  /** Runs this CLI again with the same arguments (after an automatic update). */
  rerun(argv: string[], env: Record<string, string | undefined>): Promise<number>;
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
  /** True when the CLI may ask questions (terminal on both ends, no --json, not CI). */
  interactive: boolean;
  /** Continuous integration (`CI` and similar): never ask, never animate. */
  ci: boolean;
  preferences: Preferences;
}

export function createApi(ctx: Ctx, apiKey: string | undefined): BladecpApi {
  ctx.out.addSecret(apiKey);
  const t = ctx.out.t;
  return new BladecpApi(
    new ApiClient({
      baseUrl: ctx.apiUrl,
      apiKey,
      fetch: ctx.fetch,
      sleep: ctx.sleep,
      userAgent: ctx.userAgent,
      cliVersion: cliVersion(),
      signal: ctx.signal,
      onRateLimited: (seconds) => ctx.out.info(t('progress.rateLimited', { seconds })),
      onRetry: ({ attempt, of, seconds }) => {
        const k = kit(ctx.out, 'err');
        const text = t('progress.retrying', { seconds, attempt, of });
        // On a terminal one quiet line that is replaced; elsewhere one line per retry.
        if (ctx.out.caps.errTTY) ctx.out.live([`  ${k.faint(k.glyph.dot)}  ${k.faint(text)}`]);
        else ctx.out.info(text);
      },
      onDebug: (line) => ctx.out.debug(line),
    }),
  );
}
