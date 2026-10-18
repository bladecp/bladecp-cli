import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { copyToClipboard, openInBrowser } from './browser.js';
import type { Deps, ProcessResult } from './context.js';
import { InterruptedError } from './errors.js';
import { createTerminalPrompter } from './ui/prompt.js';
import type { UpdateJob } from './update/check.js';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new InterruptedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new InterruptedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function binPath(): string {
  const path = fileURLToPath(new URL('./bin.js', import.meta.url));
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * The daily version check runs in a detached process that only asks the npm
 * registry for the latest version and writes it to the config folder. The
 * command never waits for it; the next run reads the answer.
 */
function startUpdateCheck(job: UpdateJob): void {
  try {
    const worker = fileURLToPath(new URL('./update/worker.js', import.meta.url));
    const child = spawn(process.execPath, [worker, JSON.stringify(job)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Silent: a missing check never affects the command.
  }
}

function runProcess(
  command: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let output = '';
    let pending = '';
    const windows = process.platform === 'win32';
    let child: ReturnType<typeof spawn>;
    try {
      // Package managers are .cmd scripts on Windows, which need a shell.
      child = spawn(windows ? `${command}.cmd` : command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: windows,
        windowsHide: true,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
      });
    } catch (error) {
      resolve({ code: null, output, startError: (error as NodeJS.ErrnoException).code ?? 'ERROR' });
      return;
    }
    const take = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine(line);
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('error', (error: NodeJS.ErrnoException) =>
      resolve({ code: null, output, startError: error.code ?? 'ERROR' }),
    );
    child.on('close', (code) => {
      if (pending.trim()) onLine(pending);
      resolve({ code, output });
    });
  });
}

function rerun(argv: string[], env: Record<string, string | undefined>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binPath(), ...argv], { stdio: 'inherit', env });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Real-world dependencies for the `bladecp` binary. */
export function nodeDeps(signal: AbortSignal): Deps {
  return {
    env: process.env,
    platform: process.platform,
    homedir: homedir(),
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    fetch: (input, init) => fetch(input, init),
    openUrl: (url) => openInBrowser(url, process.platform),
    copyText: (text) => copyToClipboard(text, process.platform),
    sleep,
    frame: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    random: () => Math.random(),
    createPrompter: () => createTerminalPrompter(process.stdin, process.stderr),
    signal,
    systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    binPath: binPath(),
    startUpdateCheck,
    runProcess,
    rerun,
  };
}
