import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';

import { InterruptedError } from '../errors.js';
import { safeText } from '../sanitize.js';
import type { Output } from './output.js';

/** A key the interactive screens understand. Letters and digits come as themselves. */
export type Key =
  | 'enter'
  | 'esc'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'tab'
  | 'backspace'
  | 'space'
  | (string & {});

export interface Prompter {
  /** Asks a question on the terminal and resolves with the trimmed answer. */
  ask(question: string): Promise<string>;
  /**
   * Waits for one key press. `question` only describes what is being asked
   * (the screen already shows it). Ctrl+C rejects with InterruptedError; an
   * aborted `signal` stops waiting.
   */
  key(question: string, signal?: AbortSignal): Promise<Key>;
  close(): void;
}

interface RawInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
}

const NAMES: Record<string, Key> = {
  return: 'enter',
  enter: 'enter',
  escape: 'esc',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  tab: 'tab',
  backspace: 'backspace',
  space: 'space',
};

export function createTerminalPrompter(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Prompter {
  const raw = input as RawInput;
  let keypressReady = false;
  return {
    async ask(question) {
      const controller = new AbortController();
      const rl = createInterface({ input, output, terminal: true });
      rl.on('SIGINT', () => controller.abort());
      try {
        const answer = await rl.question(question, { signal: controller.signal });
        return answer.trim();
      } catch {
        throw new InterruptedError();
      } finally {
        rl.close();
      }
    },
    key(_question, signal) {
      return new Promise<Key>((resolve, reject) => {
        if (!keypressReady) {
          emitKeypressEvents(input);
          keypressReady = true;
        }
        const wasRaw = Boolean(raw.isRaw);
        raw.setRawMode?.(true);
        input.resume();
        const finish = () => {
          input.removeListener('keypress', onKey);
          signal?.removeEventListener('abort', onAbort);
          raw.setRawMode?.(wasRaw);
          input.pause();
        };
        const onKey = (text: string | undefined, info: { name?: string; ctrl?: boolean } = {}) => {
          if (info.ctrl && info.name === 'c') {
            finish();
            reject(new InterruptedError());
            return;
          }
          const named = info.name ? NAMES[info.name] : undefined;
          const key: Key | undefined =
            named ?? (text && text.length === 1 ? text.toLowerCase() : undefined);
          if (!key) return;
          finish();
          resolve(key);
        };
        const onAbort = () => {
          finish();
          reject(new InterruptedError());
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        input.on('keypress', onKey);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    close() {
      if (raw.isRaw) raw.setRawMode?.(false);
    },
  };
}

/** Yes/no question as a line of text (kept for terminals without the key reader). */
export async function confirm(
  prompter: Prompter,
  out: Output,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const suffix = defaultYes ? out.t('prompt.yesNoDefaultYes') : out.t('prompt.yesNoDefaultNo');
  for (;;) {
    const answer = (await prompter.ask(out.renderPrompt(`${question} ${suffix} `))).toLowerCase();
    if (answer === '') return defaultYes;
    if (out.t('prompt.yesWords').split(',').includes(answer)) return true;
    if (out.t('prompt.noWords').split(',').includes(answer)) return false;
  }
}

/** Numbered choice as a line of text. Returns the zero-based index. */
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
    const answer = await prompter.ask(
      out.renderPrompt(out.t('prompt.chooseNumber', { max: items.length })),
    );
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
    out.info(out.t('prompt.invalidChoice', { max: items.length }));
  }
}
