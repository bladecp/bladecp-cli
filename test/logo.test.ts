// The 3D B of the login: the same path as the official icon, the largest
// size the window holds, the ASCII ramp without color, and no animation
// outside an interactive terminal.

import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Cell,
  HERO_POSE,
  ICON_PATH_D,
  ICON_VIEWBOX,
  iconField,
  introPoses,
  LOGIN_WAIT_ROWS,
  LOGO_AREA_ROWS,
  LOGO_INNER_COLS,
  LOGO_STEPS,
  type LogoMode,
  logoRows,
  pickLogoSize,
  renderCells,
} from '../src/ui/logo/b3d.js';
import { placeLogo } from '../src/ui/logo/show.js';
import { STAR_DOTS, STAR_LEVELS, starField, starLevel } from '../src/ui/logo/stars.js';
import { Output } from '../src/ui/output.js';
import { type MockApi, startMockApi } from './helpers/mock-api.js';
import { type RunOptions, runCli, tempDir } from './helpers/run.js';
import { renderScreen } from './helpers/vt.js';

const SYNC = '\u001b[?2026h';

describe('the B and the official icon', () => {
  it('uses exactly the path and viewBox of bladecp-icon.svg', () => {
    const svg = readFileSync(new URL('./fixtures/bladecp-icon.svg', import.meta.url), 'utf8');
    expect(/<path[^>]* d="([^"]+)"/.exec(svg)?.[1]).toBe(ICON_PATH_D);
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '';
    expect(viewBox.split(/\s+/).map(Number)).toEqual([...ICON_VIEWBOX]);
  });

  it('the intro has 44 frames in about 1.5 s and ends facing the viewer', () => {
    const { poses, fps } = introPoses();
    expect(poses).toHaveLength(44);
    expect((poses.length / fps) * 1000).toBeGreaterThan(1400);
    expect((poses.length / fps) * 1000).toBeLessThan(1550);
    expect(poses.at(-1)).toEqual(HERO_POSE);
  });

  it('renders half blocks with the brand colors, or the ramp without color', () => {
    const half = renderCells(iconField(), 26, 'half', HERO_POSE);
    expect(half).toHaveLength(logoRows(26, 'half'));
    const cells = half.flat().filter(([ch]) => ch !== ' ');
    expect(cells.length).toBeGreaterThan(50);
    expect(cells.every(([ch]) => ch === '▀' || ch === '▄')).toBe(true);
    // Violet to indigo: blue is the strongest channel of the face.
    const lit = cells.map(([, fg]) => fg!).filter((c) => c[0] + c[1] + c[2] > 300);
    expect(lit.every((c) => c[2] >= c[1])).toBe(true);
    const ramp = renderCells(iconField(), 26, 'ramp', HERO_POSE);
    expect(ramp.flat().some(([ch]) => '.:-=+*#%@'.includes(ch) && ch !== ' ')).toBe(true);
    expect(ramp.flat().some(([ch]) => ch === '▀')).toBe(false);
  });
});

describe('the size of the B', () => {
  it('the steps are the ones the owner chose, 80 columns at most', () => {
    expect([...LOGO_STEPS]).toEqual([80, 72, 64, 56, 44, 34, 26, 18]);
    expect(logoRows(80, 'half')).toBe(31);
    expect(LOGO_STEPS.map((c) => logoRows(c, 'half'))).toEqual([31, 28, 25, 22, 17, 13, 10, 7]);
  });

  const cases: [number, number, number | null][] = [
    // Columns, rows -> width of the B: its area plus the waiting screen of
    // the login (14 rows) within the rows, a side margin within the columns.
    [200, 60, 80],
    [100, 62, 80],
    [100, 50, 80],
    [100, 41, 80],
    [100, 40, 72],
    [120, 40, 72],
    [90, 50, 80],
    [89, 50, 72],
    [80, 40, 64],
    [120, 30, 44],
    [80, 24, 26],
    [60, 40, 44],
    [40, 40, 26],
    [30, 40, 18],
    // Too short for any: the smallest one still shows.
    [200, 20, 18],
    // Narrower than 24 columns: no B.
    [23, 60, null],
  ];
  for (const [columns, rows, size] of cases) {
    it(`${columns} x ${rows} -> ${size ?? 'no B'}`, () => {
      expect(pickLogoSize(columns, rows, 'half')).toBe(size);
    });
  }

  it('a window that holds the waiting screen keeps the B; one row less, a step down', () => {
    for (const cols of LOGO_STEPS) {
      const i = LOGO_STEPS.indexOf(cols);
      const rows = LOGO_AREA_ROWS.half[i]! + LOGIN_WAIT_ROWS;
      expect(pickLogoSize(200, rows, 'half')).toBe(cols);
      expect(pickLogoSize(200, rows - 1, 'half')).toBe(LOGO_STEPS[i + 1] ?? 18);
      // A wrapped address takes rows of its own.
      expect(pickLogoSize(200, rows + 2, 'half', 2)).toBe(cols);
      expect(pickLogoSize(200, rows + 1, 'half', 2)).toBe(LOGO_STEPS[i + 1] ?? 18);
    }
  });
});

const inkBox = (cells: Cell[][]) => {
  const blank = (c: Cell) => c[0] === ' ' && !c[2];
  const rows = cells.map((row, y) => (row.some((c) => !blank(c)) ? y : -1)).filter((y) => y >= 0);
  return { top: rows[0]!, bottom: rows.at(-1)!, height: rows.at(-1)! - rows[0]! + 1 };
};

describe('the B inside its area', () => {
  for (const mode of ['half', 'ramp'] as LogoMode[]) {
    it(`${mode}: the area is the height of the B at each step`, () => {
      const areas = LOGO_STEPS.map(
        (cols) => inkBox(renderCells(iconField(), cols, mode, HERO_POSE)).height,
      );
      expect(areas).toEqual([...LOGO_AREA_ROWS[mode]]);
    });

    it(`${mode}: the B is drawn at about 87% of it, by the documented rule`, () => {
      LOGO_STEPS.forEach((cols, i) => {
        const area = LOGO_AREA_ROWS[mode][i]!;
        // Closest to 87.5% of the height, an even free room above and below
        // preferred, at least one free row on each side when the area allows,
        // and a width in step with the height.
        let best: [number, number] | null = null;
        for (let c = cols - 1; c >= Math.round(cols * 0.78); c -= 1) {
          const r = inkBox(renderCells(iconField(), c, mode, HERO_POSE)).height;
          const room = area - r;
          if (room < (area >= 10 ? 2 : 1)) continue;
          const score =
            Math.abs(r / area - 0.875) +
            (room % 2 ? 0.02 : 0) +
            Math.abs(c / cols - r / area) * 0.5;
          if (!best || score < best[0] - 1e-9) best = [score, c];
        }
        expect(LOGO_INNER_COLS[mode][i]).toBe(best![1]);
      });
    });
  }

  it('centered across and down, with room above it and above the horizon', () => {
    LOGO_STEPS.forEach((cols, i) => {
      const area = LOGO_AREA_ROWS.half[i]!;
      const inner = LOGO_INNER_COLS.half[i]!;
      const cells = renderCells(iconField(), inner, 'half', HERO_POSE);
      const width = cols + 40;
      const place = placeLogo(cells, area, inner, width);
      const above = place.ink.top;
      const below = area - 1 - place.ink.bottom;
      const height = place.ink.bottom - place.ink.top + 1;
      // About 87% of the area (80% to 91%: the small steps have few rows), the
      // same proportions (a smaller render).
      expect(height / area).toBeGreaterThanOrEqual(0.8);
      expect(height / area).toBeLessThanOrEqual(0.91);
      // Down: the same room above and below, or one more row below.
      expect(below - above).toBeGreaterThanOrEqual(0);
      expect(below - above).toBeLessThanOrEqual(1);
      if (area >= 10) expect(above).toBeGreaterThanOrEqual(1);
      expect(below).toBeGreaterThanOrEqual(1);
      // Across: centered on the horizon, which spans columns 1 to width.
      const left = place.ink.left - 1;
      const right = width - place.ink.right;
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    });
  });
});

describe('the points of light', () => {
  const area = { rows: 27, left: 1, right: 110 };
  const stars = starField(area, (row, col) => row > 2 && row < 24 && col > 20 && col < 90);

  it('are single pixels (one braille dot), only in the area and never on the B', () => {
    expect(stars.length).toBeGreaterThan(20);
    for (const star of stars) {
      expect(STAR_DOTS).toContain(star.dot);
      expect(star.row).toBeLessThan(area.rows);
      expect(star.col).toBeGreaterThanOrEqual(area.left);
      expect(star.col).toBeLessThanOrEqual(area.right);
      expect(star.row > 2 && star.row < 24 && star.col > 20 && star.col < 90).toBe(false);
    }
    // The same area always gets the same points.
    expect(starField(area, () => false)).toEqual(starField(area, () => false));
  });

  it('twinkle: few lit at a time, fewer bright, and each one goes dark again', () => {
    let lit = 0;
    let bright = 0;
    let samples = 0;
    for (let time = 0; time < 30; time += 0.1) {
      for (const star of stars) {
        const level = starLevel(star, time);
        if (level > 0) lit += 1;
        if (level >= 4) bright += 1;
        samples += 1;
      }
    }
    expect(lit / samples).toBeLessThan(0.5);
    expect(bright / samples).toBeLessThan(0.25);
    for (const star of stars.slice(0, 10)) {
      const levels = new Set<number>();
      for (let time = 0; time < 8; time += 0.05) levels.add(starLevel(star, time));
      expect(levels.has(0)).toBe(true);
      expect(levels.has(STAR_LEVELS)).toBe(true);
    }
  });

  it('a cell already on screen is found again and rewritten alone', () => {
    let text = '';
    const sink = {
      isTTY: true,
      columns: 60,
      rows: 30,
      write: (s: string) => {
        text += s;
        return true;
      },
    };
    const env = { COLORTERM: 'truecolor', FORCE_COLOR: '3' };
    const out = new Output(sink, sink, { json: false, lang: 'en', env });
    out.info('');
    const row = out.screenMark();
    out.infoLines(['first', 'second', 'third']);
    text = '';
    expect(out.patchCells([{ row: row + 1, col: 7, text: '⠁' }])).toBe(true);
    // Two rows up to "second", column 8, the dot, and back down.
    expect(text).toContain('\r\u001b[2A\u001b[8G⠁\r\u001b[2B');
    // A row out of the window, or a window of another width: no more.
    expect(out.patchCells([{ row: row - 40, col: 1, text: '⠁' }])).toBe(false);
    sink.columns = 70;
    out.info('');
    expect(out.patchCells([{ row: row + 1, col: 7, text: '⠁' }])).toBe(false);
  });
});

describe('the B on the login screen', () => {
  let api: MockApi;
  let dir: ReturnType<typeof tempDir>;
  beforeEach(async () => {
    api = await startMockApi();
    dir = tempDir();
  });
  afterEach(async () => {
    await api.stop();
    dir.cleanup();
  });

  const login = (extra: Partial<RunOptions>) =>
    runCli(['login'], {
      configDir: dir.path,
      apiUrl: api.baseUrl,
      columns: 100,
      rows: 50,
      openUrl: async (url) => {
        await (await fetch(url)).text();
        return true;
      },
      ...extra,
    });

  it('spins on an interactive terminal: 44 frames of 80 columns', async () => {
    const result = await login({ tty: true, env: { NO_COLOR: undefined, COLORTERM: 'truecolor' } });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('▀');
    expect(result.stderr.split(SYNC).length - 1).toBeGreaterThanOrEqual(44);
  });

  it('over SSH or with BLADECP_MOTION=reduced it is the last frame, still', async () => {
    for (const env of [
      { SSH_CONNECTION: '192.0.2.10 50000 198.51.100.20 22' },
      { BLADECP_MOTION: 'reduced' },
    ]) {
      const result = await login({
        tty: true,
        env: { NO_COLOR: undefined, COLORTERM: 'truecolor', ...env },
      });
      expect(result.stderr).toContain('▀');
      // The B, then the waiting line: far from 44 frames.
      expect(result.stderr.split(SYNC).length - 1).toBeLessThan(10);
    }
  });

  it('NO_COLOR draws the ASCII ramp, without color and without animation', async () => {
    const result = await login({ tty: true, env: { NO_COLOR: '1' } });
    expect(result.stderr).not.toContain('▀');
    expect(result.stderr).toMatch(/[#%@]{6,}/);
    expect(result.stderr).not.toMatch(/\u001b\[[0-9;]*m/);
    expect(result.stderr.split(SYNC).length - 1).toBeLessThan(10);
  });

  it('never in CI animation, --json, a pipe or a narrow window', async () => {
    const ci = await login({
      tty: true,
      env: { NO_COLOR: undefined, COLORTERM: 'truecolor', CI: 'true' },
    });
    expect(ci.stderr.split(SYNC).length - 1).toBeLessThan(10);
    for (const extra of [{}, { tty: true, env: { NO_COLOR: undefined } }]) {
      const json = await runCli(['login', '--json'], {
        configDir: dir.path,
        apiUrl: api.baseUrl,
        openUrl: async (url) => {
          await (await fetch(url)).text();
          return true;
        },
        ...extra,
      });
      expect(json.stderr).not.toContain('▀');
      expect(json.stderr).not.toMatch(/[#%@]{6,}/);
    }
    const pipe = await login({});
    expect(pipe.stderr).not.toContain('▀');
    expect(pipe.stderr).not.toContain(SYNC);
    const narrow = await login({ tty: true, columns: 22, env: { NO_COLOR: undefined } });
    expect(narrow.stderr).not.toContain('▀');
  });

  it('the waiting screen takes the area of the B plus LOGIN_WAIT_ROWS rows', async () => {
    let screen = '';
    const result = await login({
      tty: true,
      rows: 60,
      env: { NO_COLOR: undefined, COLORTERM: 'truecolor', FORCE_HYPERLINK: '1' },
      screen: (chunk) => {
        screen += chunk;
      },
    });
    expect(result.code).toBe(0);
    const rows = renderScreen(screen, 100).text.split('\n');
    // The result of the login takes the place of the "Waiting" line.
    const waiting = rows.findIndex((row) => row.includes('Signed in through the browser'));
    // Rows 0 to that line, and the row of the cursor under it.
    expect(waiting + 2).toBe(LOGO_AREA_ROWS.half[0]! + LOGIN_WAIT_ROWS);
  });

  // A cell rewritten in place: back up some rows, then to its column.
  const PATCH = /\r\u001b\[\d+A\u001b\[\d+G/g;
  // The browser opens at once and the person authorizes a moment later, so
  // the login waits a little.
  const slowBrowser = async (url: string) => {
    setTimeout(() => {
      void fetch(url).then((response) => response.text());
    }, 150);
    return true;
  };

  it('while the login waits, the points of light twinkle, and stop when it ends', async () => {
    const result = await login({
      tty: true,
      clockOnFrames: true,
      openUrl: slowBrowser,
      env: { NO_COLOR: undefined, COLORTERM: 'truecolor' },
    });
    expect(result.code).toBe(0);
    const patches = result.stderr.match(PATCH) ?? [];
    expect(patches.length).toBeGreaterThan(5);
    // Only the cells of the points: each rewrite is one dot or a blank.
    for (const cell of result.stderr.matchAll(
      /\u001b\[\d+G((?:\u001b\[[0-9;]*m)*)(.)((?:\u001b\[[0-9;]*m)*)\r/g,
    )) {
      expect([...STAR_DOTS, ' ']).toContain(cell[2]);
    }
    // Once signed in, nothing is redrawn up there any more.
    const end = result.stderr.lastIndexOf('Signed in through the browser');
    expect(end).toBeGreaterThan(0);
    expect(result.stderr.slice(end)).not.toMatch(PATCH);
  });

  it('still without motion: reduced, SSH, CI, no color or no terminal', async () => {
    for (const env of [
      { BLADECP_MOTION: 'reduced' },
      { SSH_CONNECTION: '192.0.2.10 50000 198.51.100.20 22' },
      { CI: 'true' },
      { NO_COLOR: '1' },
    ]) {
      const result = await login({
        tty: true,
        clockOnFrames: true,
        openUrl: slowBrowser,
        env: { NO_COLOR: undefined, COLORTERM: 'truecolor', ...env },
      });
      expect(result.code).toBe(0);
      expect(result.stderr).not.toMatch(PATCH);
    }
    const pipe = await login({ clockOnFrames: true, openUrl: slowBrowser });
    expect(pipe.stderr).not.toMatch(PATCH);
  });
});
