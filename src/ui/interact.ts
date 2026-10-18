// Questions on an interactive terminal, drawn on the rail of steps and
// answered with single keys. Every question has an option equivalent, and
// none is ever asked without a terminal on both ends.

import type { Ctx } from '../context.js';
import type { Kit } from './kit.js';
import type { Key } from './prompt.js';

export interface SelectOptions {
  title: string;
  /** Composed lines, one per option. */
  items: string[];
  /** What the collapsed step shows once chosen (defaults to the item). */
  chosen?: (index: number) => string;
  initial?: number;
}

/** Arrow keys (or j/k) move, a digit picks directly, Enter confirms. */
export async function select(ctx: Ctx, k: Kit, options: SelectOptions): Promise<number> {
  const t = ctx.out.t;
  let index = Math.max(0, Math.min(options.items.length - 1, options.initial ?? 0));
  const draw = () =>
    ctx.out.live([
      `  ${k.violet(k.glyph.active)}  ${options.title}`,
      ...options.items.map((item, i) =>
        i === index
          ? k.railLine(`${k.violet(k.glyph.bullet)} ${item}`)
          : k.railLine(`${k.faint(k.glyph.ring)} ${k.muted(ctx.out.plain(item))}`),
      ),
      `  ${k.rail(k.glyph.end)}  ${k.faint(t('ui.selectHint'))}`,
    ]);
  const prompter = ctx.createPrompter();
  try {
    for (;;) {
      draw();
      const key: Key = await prompter.key(`${options.title} (1-${options.items.length})`);
      if (key === 'up' || key === 'k') index = Math.max(0, index - 1);
      else if (key === 'down' || key === 'j' || key === 'tab') {
        index = Math.min(options.items.length - 1, index + 1);
      } else if (/^[1-9]$/.test(key) && Number(key) <= options.items.length) {
        index = Number(key) - 1;
        break;
      } else if (key === 'enter' || key === 'space') break;
    }
  } finally {
    prompter.close();
  }
  ctx.out.live([
    `  ${k.ok(k.glyph.done)}  ${options.title}`,
    k.railLine(options.chosen ? options.chosen(index) : (options.items[index] ?? '')),
    k.railLine(),
  ]);
  ctx.out.liveDone();
  return index;
}

export interface ConfirmOptions {
  title: string;
  /** Lines shown between the question and the answer (what is being confirmed). */
  detail?: string[];
  defaultYes?: boolean;
  /** Text appended to the collapsed step after the answer. */
  after?: (yes: boolean) => string;
  /** Leave the rail open below the answer (default); false when a line follows at once. */
  tail?: boolean;
}

/** Yes or no with ← → (or y, s and n), Enter confirms. */
export async function confirmStep(ctx: Ctx, k: Kit, options: ConfirmOptions): Promise<boolean> {
  const t = ctx.out.t;
  let yes = options.defaultYes ?? true;
  const yesText = t('ui.yes');
  const noText = t('ui.no');
  const draw = () =>
    ctx.out.live([
      `  ${k.violet(k.glyph.active)}  ${options.title}`,
      ...(options.detail ?? []).map((line) => k.railLine(line)),
      k.railLine(
        yes
          ? `${k.violet(k.glyph.bullet)} ${yesText} ${k.faint('/')} ${k.faint(k.glyph.ring)} ${k.muted(noText)}`
          : `${k.faint(k.glyph.ring)} ${k.muted(yesText)} ${k.faint('/')} ${k.violet(k.glyph.bullet)} ${noText}`,
      ),
      `  ${k.rail(k.glyph.end)}`,
    ]);
  const prompter = ctx.createPrompter();
  try {
    for (;;) {
      draw();
      const key = await prompter.key(
        [options.title, ...(options.detail ?? []).map((line) => ctx.out.plain(line))].join(' '),
      );
      if (key === 'y' || key === 's') {
        yes = true;
        break;
      }
      if (key === 'n') {
        yes = false;
        break;
      }
      if (key === 'left' || key === 'right' || key === 'tab') yes = !yes;
      else if (key === 'enter') break;
      else if (key === 'esc') {
        yes = false;
        break;
      }
    }
  } finally {
    prompter.close();
  }
  const answer = yes ? yesText : noText;
  const tail = options.after ? options.after(yes) : '';
  ctx.out.live([
    `  ${yes ? k.ok(k.glyph.done) : k.faint(k.glyph.done)}  ${options.title} ${k.muted(answer)}`,
    ...(tail ? [k.railLine(tail)] : []),
    ...(options.tail === false ? [] : [k.railLine()]),
  ]);
  ctx.out.liveDone();
  return yes;
}

/** A step answered by one of a few letters (for example o, a or d). */
export async function keyMenu(
  ctx: Ctx,
  k: Kit,
  options: { title: string; hint: string; keys: string[]; extra?: () => string[] },
): Promise<string> {
  const prompter = ctx.createPrompter();
  try {
    for (;;) {
      ctx.out.live([
        `  ${k.violet(k.glyph.active)}  ${options.title}`,
        k.railLine(k.faint(options.hint)),
        ...(options.extra?.() ?? []).map((line) => k.railLine(line)),
      ]);
      const key = await prompter.key(options.title);
      if (options.keys.includes(key)) return key;
      if (key === 'esc') return 'esc';
    }
  } finally {
    prompter.close();
  }
}
