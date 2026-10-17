import { createInterface } from 'node:readline/promises';

import { InterruptedError } from './errors.js';
import type { Output } from './output.js';
import { safeText } from './sanitize.js';

export interface Prompter {
  /** Asks a question on the terminal and resolves with the trimmed answer. */
  ask(question: string): Promise<string>;
  close(): void;
}

export function createTerminalPrompter(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Prompter {
  const controller = new AbortController();
  const rl = createInterface({ input, output, terminal: true });
  rl.on('SIGINT', () => controller.abort());
  return {
    async ask(question) {
      try {
        const answer = await rl.question(question, { signal: controller.signal });
        return answer.trim();
      } catch {
        throw new InterruptedError();
      }
    },
    close() {
      rl.close();
    },
  };
}

/** Yes/no question. An empty answer takes the default. */
export async function confirm(
  prompter: Prompter,
  out: Output,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const suffix = defaultYes ? out.t('prompt.yesNoDefaultYes') : out.t('prompt.yesNoDefaultNo');
  for (;;) {
    const answer = (await prompter.ask(`${question} ${suffix} `)).toLowerCase();
    if (answer === '') return defaultYes;
    if (out.t('prompt.yesWords').split(',').includes(answer)) return true;
    if (out.t('prompt.noWords').split(',').includes(answer)) return false;
  }
}

/** Numbered choice. Returns the zero-based index. */
export async function choose(
  prompter: Prompter,
  out: Output,
  title: string,
  items: string[],
): Promise<number> {
  out.info(title);
  items.forEach((item, index) => {
    out.info(`  ${index + 1}) ${safeText(item)}`);
  });
  for (;;) {
    const answer = await prompter.ask(out.t('prompt.chooseNumber', { max: items.length }));
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
    out.info(out.t('prompt.invalidChoice', { max: items.length }));
  }
}
