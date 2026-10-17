import { homedir } from 'node:os';

import { openInBrowser } from './browser.js';
import type { Deps } from './context.js';
import { InterruptedError } from './errors.js';
import { createTerminalPrompter } from './prompt.js';

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
    sleep,
    now: () => Date.now(),
    random: () => Math.random(),
    createPrompter: () => createTerminalPrompter(process.stdin, process.stderr),
    signal,
    systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
  };
}
