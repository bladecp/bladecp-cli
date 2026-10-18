// A small virtual terminal for screen photos: it replays what the CLI wrote
// (text, colors, the live region's cursor moves) and returns the final screen
// as text plus the style of every run of cells. Only the sequences the CLI
// itself writes are understood; anything else fails the photo.

import { charWidth } from '../../src/ui/term.js';

interface Cell {
  ch: string;
  style: string;
}

export interface Screen {
  /** The screen as text, trailing blanks trimmed. */
  text: string;
  /** Style runs per row: `row: col-col style`, for styled cells only. */
  styles: string;
  /** Rows the CLI wrote past the last column (the terminal wrapped them). */
  overflow: string[];
  /** Sequences the virtual terminal did not understand. */
  unknown: string[];
}

export function renderScreen(output: string, columns: number): Screen {
  const rows: Cell[][] = [[]];
  let row = 0;
  let col = 0;
  let fg = '';
  let bg = '';
  let attrs = '';
  const overflow: string[] = [];
  const unknown: string[] = [];
  const ensure = (r: number) => {
    while (rows.length <= r) rows.push([]);
  };
  const style = () => [fg && `f${fg}`, bg && `b${bg}`, attrs].filter(Boolean).join(' ');
  const sgr = (params: string) => {
    const codes = params === '' ? [0] : params.split(';').map(Number);
    for (let i = 0; i < codes.length; i += 1) {
      const c = codes[i]!;
      if (c === 0) {
        fg = '';
        bg = '';
        attrs = '';
      } else if (c === 1) attrs = `${attrs.replace('B', '')}B`;
      else if (c === 2) attrs = `${attrs.replace('D', '')}D`;
      else if (c === 3) attrs = `${attrs.replace('I', '')}I`;
      else if (c === 4) attrs = `${attrs.replace('U', '')}U`;
      else if (c === 22) attrs = attrs.replace(/[BD]/g, '');
      else if (c === 23) attrs = attrs.replace('I', '');
      else if (c === 24) attrs = attrs.replace('U', '');
      else if (c === 39) fg = '';
      else if (c === 49) bg = '';
      else if (c === 38 || c === 48) {
        let value = '';
        if (codes[i + 1] === 2) {
          value = codes
            .slice(i + 2, i + 5)
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
          i += 4;
        } else if (codes[i + 1] === 5) {
          value = `@${codes[i + 2]}`;
          i += 2;
        }
        if (c === 38) fg = value;
        else bg = value;
      } else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) fg = `#${c}`;
      else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) bg = `#${c}`;
      else unknown.push(`SGR ${c}`);
    }
  };
  let i = 0;
  while (i < output.length) {
    const ch = output[i]!;
    if (ch === '\u001b') {
      const csi = /^\u001b\[([0-9;?]*)([A-Za-z])/.exec(output.slice(i, i + 40));
      if (csi) {
        const [whole, params = '', final] = csi;
        if (final === 'm') sgr(params);
        else if (final === 'K' && params === '2') rows[row] = [];
        else if (final === 'J' && params === '') rows.splice(row + 1);
        else if (final === 'A') row = Math.max(0, row - Number(params || 1));
        else if (final === 'B') {
          row += Number(params || 1);
          ensure(row);
        } else if (final === 'G') col = Math.max(0, Number(params || 1) - 1);
        else if (final === 'h' || final === 'l') {
          if (!['?25', '?2026'].includes(params)) unknown.push(whole);
        } else unknown.push(whole);
        if (final === 'J') rows[row] = rows[row]!.slice(0, col);
        i += whole.length;
        continue;
      }
      const osc = /^\u001b\]([^\u0007\u001b]*)(\u0007|\u001b\\)/.exec(output.slice(i, i + 4000));
      if (osc) {
        if (!/^(8;;|9;4;)/.test(osc[1]!)) unknown.push(`OSC ${osc[1]!.slice(0, 10)}`);
        i += osc[0].length;
        continue;
      }
      unknown.push(JSON.stringify(output.slice(i, i + 8)));
      i += 1;
      continue;
    }
    if (ch === '\r') {
      col = 0;
      i += 1;
      continue;
    }
    if (ch === '\n') {
      // A terminal driver turns \n into \r\n.
      row += 1;
      col = 0;
      ensure(row);
      i += 1;
      continue;
    }
    const cp = output.codePointAt(i)!;
    const char = String.fromCodePoint(cp);
    const w = charWidth(char);
    ensure(row);
    if (col + w > columns) {
      const text = rows[row]!.map((c) => c.ch).join('');
      overflow.push(text);
      row += 1;
      col = 0;
      ensure(row);
    }
    const line = rows[row]!;
    while (line.length < col) line.push({ ch: ' ', style: '' });
    line[col] = { ch: char, style: style() };
    if (w === 2) line[col + 1] = { ch: '', style: style() };
    col += w;
    i += char.length;
  }
  const text = rows
    .map((line) =>
      line
        .map((c) => c.ch)
        .join('')
        .replace(/\s+$/, ''),
    )
    .join('\n')
    .replace(/\n+$/, '');
  const styles: string[] = [];
  rows.forEach((line, r) => {
    const runs: string[] = [];
    let start = -1;
    let current = '';
    const close = (end: number) => {
      if (start >= 0 && current) runs.push(`${start}-${end} ${current}`);
    };
    line.forEach((c, x) => {
      const s = c.ch.trim() === '' && !c.style.includes('b') ? '' : c.style;
      if (s !== current) {
        close(x - 1);
        start = x;
        current = s;
      }
    });
    close(line.length - 1);
    if (runs.length > 0) styles.push(`${r}: ${runs.join(' | ')}`);
  });
  return { text, styles: styles.join('\n'), overflow, unknown };
}
