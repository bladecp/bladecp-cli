import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { run } from '../../src/cli.js';
import type { Deps, ProcessResult } from '../../src/context.js';
import type { Prompter } from '../../src/ui/prompt.js';
import { runUpdateCheck, type UpdateJob } from '../../src/update/check.js';

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
  sleeps: number[];
  prompts: string[];
  opened: string[];
  copied: string[];
  /** Background version checks the run started. */
  updateChecks: UpdateJob[];
  /** Programs the run started (for `bladecp update`). */
  processes: string[];
  /** Runs of the CLI started again after an automatic update. */
  reruns: string[][];
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  configDir: string;
  apiUrl?: string;
  /** Answers given to prompts and key questions, in order ('' is Enter). */
  answers?: string[];
  tty?: boolean;
  /** Terminal size when `tty` is on. */
  columns?: number;
  rows?: number;
  stdin?: string;
  openUrl?: (url: string) => Promise<boolean>;
  loginTimeoutMs?: number;
  /** Each animation frame moves the virtual clock on by its length. */
  clockOnFrames?: boolean;
  signal?: AbortSignal;
  upload?: Deps['upload'];
  platform?: NodeJS.Platform;
  /** Base polling interval for follow loops (default 0 in tests). */
  pollIntervalMs?: number;
  /** Lets a test read stderr while the command is still running. */
  onStderr?: (text: string) => void;
  /** Replaces the network, for example to answer an official address from the mock. */
  fetch?: Deps['fetch'];
  /** Path of the running bin.js, to simulate an install method. */
  binPath?: string;
  /** Run the background version check in place, against `fetch`. */
  runUpdateCheck?: boolean;
  /** Receives stdout and stderr in the order they were written, like a terminal. */
  screen?: (chunk: string) => void;
  /** Answers a program started by `bladecp update`. */
  runProcess?: (command: string, args: string[]) => ProcessResult;
}

export function tempDir(prefix = 'bladecp-cli-'): { path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

class Sink {
  text = '';
  isTTY: boolean;
  columns: number;
  rows: number | undefined;
  constructor(
    tty: boolean,
    columns: number,
    rows: number | undefined,
    private readonly onWrite?: (text: string) => void,
    private readonly onChunk?: (chunk: string) => void,
  ) {
    this.isTTY = tty;
    this.columns = columns;
    this.rows = rows;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    this.onChunk?.(chunk);
    this.onWrite?.(this.text);
    return true;
  }
}

/** Fake package install path used unless a test gives another one. */
export const DEFAULT_BIN = '/usr/local/lib/node_modules/@bladecp/cli/dist/bin.js';

export async function runCli(argv: string[], options: RunOptions): Promise<Captured> {
  const stdout = new Sink(
    Boolean(options.tty),
    options.columns ?? 120,
    options.rows,
    undefined,
    options.screen,
  );
  const stderr = new Sink(
    Boolean(options.tty),
    options.columns ?? 120,
    options.rows,
    options.onStderr,
    options.screen,
  );
  const sleeps: number[] = [];
  const prompts: string[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const updateChecks: UpdateJob[] = [];
  const processes: string[] = [];
  const reruns: string[][] = [];
  const pendingChecks: Promise<void>[] = [];
  const answers = [...(options.answers ?? [])];
  let clock = Date.now();
  const stdin = Readable.from(
    options.stdin !== undefined ? [Buffer.from(options.stdin)] : [],
  ) as Readable & {
    isTTY?: boolean;
  };
  stdin.isTTY = Boolean(options.tty);
  const fetcher: Deps['fetch'] = options.fetch ?? ((input, init) => fetch(input, init));

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
    fetch: fetcher,
    openUrl: async (url) => {
      opened.push(url);
      return options.openUrl ? options.openUrl(url) : false;
    },
    copyText: async (text) => {
      copied.push(text);
      return true;
    },
    // Virtual clock: sleeping advances time instantly.
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      clock += ms;
      if (signal?.aborted) throw new Error('aborted');
    },
    // Animations never wait in tests, but they let other work run.
    // Animation frames never wait; with `clockOnFrames` each one moves the
    // clock on by its length, so time-driven effects (the twinkle) advance.
    frame: (ms) => {
      if (options.clockOnFrames) clock += ms ?? 0;
      return new Promise((resolve) => setImmediate(resolve));
    },
    now: () => clock,
    random: () => 0.5,
    createPrompter: (): Prompter => ({
      async ask(question) {
        prompts.push(question);
        const answer = answers.shift();
        if (answer === undefined) throw new Error(`Unexpected prompt: ${question}`);
        // A terminal shows the question and echoes what was typed.
        if (options.tty) stderr.write(`${question}${answer}\n`);
        return answer;
      },
      key(question, signal) {
        prompts.push(question);
        const answer = answers.shift();
        if (answer === undefined) {
          // A key reader that waits in the background (the login) just waits.
          if (signal) {
            return new Promise((_resolve, reject) => {
              const stop = () => reject(new Error('stopped'));
              if (signal.aborted) stop();
              else signal.addEventListener('abort', stop, { once: true });
            });
          }
          return Promise.reject(new Error(`Unexpected prompt: ${question}`));
        }
        return Promise.resolve(answer === '' ? 'enter' : answer);
      },
      close() {},
    }),
    signal: options.signal ?? new AbortController().signal,
    systemLocale: 'en-US',
    binPath: options.binPath ?? DEFAULT_BIN,
    startUpdateCheck: (job) => {
      updateChecks.push(job);
      if (options.runUpdateCheck) pendingChecks.push(runUpdateCheck(job, fetcher, clock));
    },
    runProcess: async (command, args, onLine) => {
      processes.push([command, ...args].join(' '));
      const result = options.runProcess
        ? options.runProcess(command, args)
        : { code: 0, output: `added 1 package\n` };
      for (const line of result.output.split('\n')) if (line.trim()) onLine(line);
      return result;
    },
    rerun: async (argv) => {
      reruns.push(argv);
      return 0;
    },
    pollIntervalMs: options.pollIntervalMs ?? 0,
    ...(options.loginTimeoutMs !== undefined ? { loginTimeoutMs: options.loginTimeoutMs } : {}),
    upload: { baseDelayMs: 10, ...options.upload },
  };
  const code = await run(argv, deps);
  await Promise.all(pendingChecks);
  return {
    code,
    stdout: stdout.text,
    stderr: stderr.text,
    sleeps,
    prompts,
    opened,
    copied,
    updateChecks,
    processes,
    reruns,
  };
}

/** Parses the single JSON document a `--json` run prints. */
export function parseJson(text: string): {
  ok: boolean;
  data?: unknown;
  error?: Record<string, unknown>;
} {
  return JSON.parse(text);
}
