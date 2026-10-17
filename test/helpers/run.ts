import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { run } from '../../src/cli.js';
import type { Deps } from '../../src/context.js';
import type { Prompter } from '../../src/prompt.js';

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
  sleeps: number[];
  prompts: string[];
  opened: string[];
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  configDir: string;
  apiUrl?: string;
  /** Answers given to prompts, in order. */
  answers?: string[];
  tty?: boolean;
  stdin?: string;
  openUrl?: (url: string) => Promise<boolean>;
  loginTimeoutMs?: number;
  signal?: AbortSignal;
  upload?: Deps['upload'];
  platform?: NodeJS.Platform;
  /** Base polling interval for follow loops (default 0 in tests). */
  pollIntervalMs?: number;
  /** Lets a test read stderr while the command is still running. */
  onStderr?: (text: string) => void;
  /** Replaces the network, for example to answer an official address from the mock. */
  fetch?: Deps['fetch'];
}

export function tempDir(prefix = 'bladecp-cli-'): { path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

class Sink {
  text = '';
  isTTY: boolean;
  columns = 120;
  constructor(
    tty: boolean,
    private readonly onWrite?: (text: string) => void,
  ) {
    this.isTTY = tty;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    this.onWrite?.(this.text);
    return true;
  }
}

export async function runCli(argv: string[], options: RunOptions): Promise<Captured> {
  const stdout = new Sink(Boolean(options.tty));
  const stderr = new Sink(Boolean(options.tty), options.onStderr);
  const sleeps: number[] = [];
  const prompts: string[] = [];
  const opened: string[] = [];
  const answers = [...(options.answers ?? [])];
  let clock = Date.now();
  const stdin = Readable.from(
    options.stdin !== undefined ? [Buffer.from(options.stdin)] : [],
  ) as Readable & {
    isTTY?: boolean;
  };
  stdin.isTTY = Boolean(options.tty);

  const deps: Deps = {
    env: {
      BLADECP_CONFIG_DIR: options.configDir,
      BLADECP_API_URL: options.apiUrl,
      BLADECP_HUB_URL: options.apiUrl,
      LANG: 'en_US.UTF-8',
      NO_COLOR: '1',
      ...options.env,
    },
    platform: options.platform ?? process.platform,
    homedir: options.configDir,
    stdout,
    stderr,
    stdin,
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    openUrl: async (url) => {
      opened.push(url);
      return options.openUrl ? options.openUrl(url) : false;
    },
    // Virtual clock: sleeping advances time instantly.
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      clock += ms;
      if (signal?.aborted) throw new Error('aborted');
    },
    now: () => clock,
    random: () => 0.5,
    createPrompter: (): Prompter => ({
      async ask(question) {
        prompts.push(question);
        const answer = answers.shift();
        if (answer === undefined) throw new Error(`Unexpected prompt: ${question}`);
        return answer;
      },
      close() {},
    }),
    signal: options.signal ?? new AbortController().signal,
    systemLocale: 'en-US',
    pollIntervalMs: options.pollIntervalMs ?? 0,
    ...(options.loginTimeoutMs !== undefined ? { loginTimeoutMs: options.loginTimeoutMs } : {}),
    upload: { baseDelayMs: 10, ...options.upload },
  };
  const code = await run(argv, deps);
  return { code, stdout: stdout.text, stderr: stderr.text, sleeps, prompts, opened };
}

/** Parses the single JSON document a `--json` run prints. */
export function parseJson(text: string): {
  ok: boolean;
  data?: unknown;
  error?: Record<string, unknown>;
} {
  return JSON.parse(text);
}
