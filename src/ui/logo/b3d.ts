// The BladeCP "B" in 3D for terminals, rendered at run time (no frames are
// shipped). Pipeline: SVG path of the official icon -> flattened polygon ->
// 2D signed distance field on a grid -> extruded, round-edged 3D shape ->
// ray marching with a key light, a fill light, Blinn-Phong specular, a
// fresnel rim and a glint band -> pixels -> terminal cells (half blocks, two
// square pixels per cell, or a luminance ramp when there is no color).
//
// Only `login` loads this module, and only on an interactive terminal.

/** Path of the official icon (BladeCP Auth, bladecp-icon.svg, viewBox 0 0 118.16 85.75). */
export const ICON_PATH_D =
  'M102.85,41.53c9.31-3.92,15.31-11.15,15.31-21.44,0-12.86-10.41-20.09-29.77-20.09h-43.37l-10.16,50.84h59.06l-1.85,8.61c-1.02,4.74-5.73,8.61-10.46,8.61h-2.08c-1.05.11-2.1.17-3.15.17l-53.49-.02c-12.61.86-19.71,7.25-22.89,17.54h75.03c22.05,0,39.32-8.57,39.32-27.2,0-7.96-4.17-13.84-11.52-17.03h.02ZM82.64,17.52c6.37,0,10.17,2.08,10.17,6.74,0,6.37-4.66,9.8-13.23,9.8h-17.4l3.31-16.54h17.15Z';
export const ICON_VIEWBOX = [0, 0, 118.16, 85.75] as const;

type Vec3 = [number, number, number];
export type Rgb = readonly [number, number, number];
/** One terminal cell: character, foreground and background (null = default). */
export type Cell = [string, Rgb | null, Rgb | null];
export type LogoMode = 'half' | 'ramp';

export interface Pose {
  yaw: number;
  pitch: number;
  roll: number;
  zoom: number;
  glint: number | null;
}

/** Brand stops on the face: violet 500, indigo 500, indigo 600. */
const BRAND = {
  violet: [0x8b, 0x5c, 0xf6] as Vec3,
  indigo: [0x63, 0x66, 0xf1] as Vec3,
  deep: [0x4f, 0x46, 0xe5] as Vec3,
};

// ---------------------------------------------------------------- geometry

/** Parses an SVG path (M L H V C S Q Z, absolute and relative) into polylines. */
export function parsePath(d: string, curveSteps = 24): [number, number][][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const subpaths: [number, number][][] = [];
  // Mutable cursor in one object, so closures and the switch share it.
  const at = {
    x: 0,
    y: 0,
    sx: 0,
    sy: 0,
    cur: null as [number, number][] | null,
    lastC: null as [number, number] | null,
  };
  let i = 0;
  let cmd = '';
  const num = () => Number.parseFloat(tokens[i++] ?? '0');
  const start = (): [number, number][] => {
    if (!at.cur) {
      at.cur = [[at.x, at.y]];
      subpaths.push(at.cur);
    }
    return at.cur;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const path = start();
    const { x, y } = at;
    for (let k = 1; k <= curveSteps; k += 1) {
      const t = k / curveSteps;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      path.push([a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3]);
    }
    at.lastC = [x2, y2];
    at.x = x3;
    at.y = y3;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? at.x : 0;
    const oy = rel ? at.y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        at.x = num() + ox;
        at.y = num() + oy;
        at.sx = at.x;
        at.sy = at.y;
        at.cur = [[at.x, at.y]];
        subpaths.push(at.cur);
        cmd = rel ? 'l' : 'L';
        at.lastC = null;
        break;
      case 'L': {
        const path = start();
        at.x = num() + ox;
        at.y = num() + oy;
        path.push([at.x, at.y]);
        at.lastC = null;
        break;
      }
      case 'H': {
        const path = start();
        at.x = num() + ox;
        path.push([at.x, at.y]);
        at.lastC = null;
        break;
      }
      case 'V': {
        const path = start();
        at.y = num() + oy;
        path.push([at.x, at.y]);
        at.lastC = null;
        break;
      }
      case 'C': {
        const v = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
        cubic(v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!);
        break;
      }
      case 'S': {
        const c1: [number, number] = at.lastC
          ? [2 * at.x - at.lastC[0], 2 * at.y - at.lastC[1]]
          : [at.x, at.y];
        const v = [num() + ox, num() + oy, num() + ox, num() + oy];
        cubic(c1[0], c1[1], v[0]!, v[1]!, v[2]!, v[3]!);
        break;
      }
      case 'Q': {
        const qx = num() + ox;
        const qy = num() + oy;
        const ex = num() + ox;
        const ey = num() + oy;
        const { x, y } = at;
        cubic(
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          ex + (2 / 3) * (qx - ex),
          ey + (2 / 3) * (qy - ey),
          ex,
          ey,
        );
        break;
      }
      case 'Z':
        at.x = at.sx;
        at.y = at.sy;
        at.cur?.push([at.sx, at.sy]);
        at.cur = null;
        at.lastC = null;
        break;
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  return subpaths;
}

interface Segments {
  segs: Float64Array;
  halfH: number;
}

/** Segments in a normalized space: x in [-1, 1], y up, centered on the viewBox. */
export function normalizedSegments(
  d: string = ICON_PATH_D,
  viewBox: readonly number[] = ICON_VIEWBOX,
): Segments {
  const [vx = 0, vy = 0, vw = 1, vh = 1] = viewBox;
  const cx = vx + vw / 2;
  const cy = vy + vh / 2;
  const s = 2 / vw;
  const segs: number[] = [];
  for (const poly of parsePath(d)) {
    for (let k = 0; k + 1 < poly.length; k += 1) {
      const [ax, ay] = poly[k]!;
      const [bx, by] = poly[k + 1]!;
      if (ax === bx && ay === by) continue;
      segs.push((ax - cx) * s, -(ay - cy) * s, (bx - cx) * s, -(by - cy) * s);
    }
  }
  return { segs: Float64Array.from(segs), halfH: vh / vw };
}

export interface Field {
  nx: number;
  ny: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  dx: number;
  dy: number;
  data: Float32Array;
  halfH: number;
}

/** Exact 2D signed distance (even-odd fill) sampled on a grid. */
export function buildField({ segs, halfH }: Segments, res = 360, pad = 0.14): Field {
  const minX = -1 - pad;
  const maxX = 1 + pad;
  const minY = -halfH - pad;
  const maxY = halfH + pad;
  const nx = res;
  const ny = Math.round((res * (maxY - minY)) / (maxX - minX));
  const dx = (maxX - minX) / (nx - 1);
  const dy = (maxY - minY) / (ny - 1);
  const data = new Float32Array(nx * ny);
  const n = segs.length;
  for (let j = 0; j < ny; j += 1) {
    const py = minY + j * dy;
    for (let i = 0; i < nx; i += 1) {
      const px = minX + i * dx;
      let best = Number.POSITIVE_INFINITY;
      let inside = false;
      for (let k = 0; k < n; k += 4) {
        const ax = segs[k]!;
        const ay = segs[k + 1]!;
        const bx = segs[k + 2]!;
        const by = segs[k + 3]!;
        const ex = bx - ax;
        const ey = by - ay;
        const wx = px - ax;
        const wy = py - ay;
        let t = (wx * ex + wy * ey) / (ex * ex + ey * ey);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = wx - ex * t;
        const qy = wy - ey * t;
        const dd = qx * qx + qy * qy;
        if (dd < best) best = dd;
        if (ay > py !== by > py && px < ax + ((py - ay) * ex) / ey) inside = !inside;
      }
      data[j * nx + i] = inside ? -Math.sqrt(best) : Math.sqrt(best);
    }
  }
  return { nx, ny, minX, minY, maxX, maxY, dx, dy, data, halfH };
}

function sample2d(f: Field, x: number, y: number): number {
  let ox = 0;
  let oy = 0;
  let cx = x;
  let cy = y;
  if (cx < f.minX) {
    ox = f.minX - cx;
    cx = f.minX;
  } else if (cx > f.maxX) {
    ox = cx - f.maxX;
    cx = f.maxX;
  }
  if (cy < f.minY) {
    oy = f.minY - cy;
    cy = f.minY;
  } else if (cy > f.maxY) {
    oy = cy - f.maxY;
    cy = f.maxY;
  }
  const gx = (cx - f.minX) / f.dx;
  const gy = (cy - f.minY) / f.dy;
  let i = Math.floor(gx);
  let j = Math.floor(gy);
  if (i >= f.nx - 1) i = f.nx - 2;
  if (j >= f.ny - 1) j = f.ny - 2;
  const tx = gx - i;
  const ty = gy - j;
  const d = f.data;
  const k = j * f.nx + i;
  const v =
    (d[k]! * (1 - tx) + d[k + 1]! * tx) * (1 - ty) +
    (d[k + f.nx]! * (1 - tx) + d[k + f.nx + 1]! * tx) * ty;
  return ox || oy ? v + Math.hypot(ox, oy) : v;
}

/** Extruded shape with rounded edges: half depth h, edge radius r. */
function sdf3(f: Field, x: number, y: number, z: number, h: number, r: number): number {
  const a = sample2d(f, x, y) + r;
  const b = Math.abs(z) - (h - r);
  const ax = a > 0 ? a : 0;
  const bx = b > 0 ? b : 0;
  const m = a > b ? a : b;
  return Math.sqrt(ax * ax + bx * bx) + (m < 0 ? m : 0) - r;
}

// ------------------------------------------------------------------ render

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Face gradient along the object's own x, so it turns with the B. */
function brandAt(t: number): Vec3 {
  const c = clamp01(t);
  return c < 0.55
    ? mix(BRAND.violet, BRAND.indigo, c / 0.55)
    : mix(BRAND.indigo, BRAND.deep, (c - 0.55) / 0.45);
}

interface Image {
  width: number;
  height: number;
  cov: Float32Array;
  rgb: Float32Array;
  lum: Float32Array;
}

interface RenderOptions extends Pose {
  width: number;
  height: number;
  /** Pixel height/width ratio (1 for half blocks, about 2 for whole cells). */
  aspect: number;
  ssx: number;
  ssy: number;
}

function renderImage(f: Field, o: RenderOptions): Image {
  const { width, height, aspect, yaw, pitch, roll, zoom, glint, ssx, ssy } = o;
  const h = 0.2;
  const r = Math.min(0.045, h * 0.9);
  const viewW = 2.34;
  const camDist = 6;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  const a = [
    [cz, -sz, 0],
    [cx * sz, cx * cz, -sx],
    [sx * sz, sx * cz, cx],
  ] as const;
  const R = [
    [cy * a[0][0] + sy * a[2][0], cy * a[0][1] + sy * a[2][1], cy * a[0][2] + sy * a[2][2]],
    [a[1][0], a[1][1], a[1][2]],
    [-sy * a[0][0] + cy * a[2][0], -sy * a[0][1] + cy * a[2][1], -sy * a[0][2] + cy * a[2][2]],
  ] as const;
  const toObj = (v: Vec3): Vec3 => [
    R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
    R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
    R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
  ];
  const toWorld = (v: Vec3): Vec3 => [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
  const keyPos: Vec3 = [-2.6, 3.0, 3.6];
  const L2 = norm([0.8, -0.35, 0.5]);
  const spanX = viewW / zoom;
  const spanY = (spanX * height * aspect) / width;
  const camO = toObj([0, 0, camDist]);
  const bounds = [1.03, f.halfH + 0.03, h + 0.01];
  const out: Image = {
    width,
    height,
    cov: new Float32Array(width * height),
    rgb: new Float32Array(width * height * 3),
    lum: new Float32Array(width * height),
  };
  const wallDark: Vec3 = [0x1e / 255, 0x1b / 255, 0x4b / 255];
  const wallLit: Vec3 = [0x43 / 255, 0x38 / 255, 0xca / 255];
  const eps = 0.0035;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      let hits = 0;
      let cr = 0;
      let cg = 0;
      let cb = 0;
      let cl = 0;
      for (let sj = 0; sj < ssy; sj += 1) {
        for (let si = 0; si < ssx; si += 1) {
          const u = ((px + (si + 0.5) / ssx) / width - 0.5) * spanX;
          const v = (0.5 - (py + (sj + 0.5) / ssy) / height) * spanY;
          const dw = norm([u, v, -camDist]);
          const d = toObj(dw);
          let t0 = 0;
          let t1 = 1e9;
          let miss = false;
          for (let ax = 0; ax < 3; ax += 1) {
            const lim = bounds[ax]!;
            const da = d[ax]!;
            const oa = camO[ax]!;
            if (Math.abs(da) < 1e-9) {
              if (oa < -lim || oa > lim) {
                miss = true;
                break;
              }
              continue;
            }
            let ta = (-lim - oa) / da;
            let tb = (lim - oa) / da;
            if (ta > tb) [ta, tb] = [tb, ta];
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 > t1) {
              miss = true;
              break;
            }
          }
          if (miss) continue;
          let t = t0;
          let hit = false;
          let X = 0;
          let Y = 0;
          let Z = 0;
          for (let k = 0; k < 140; k += 1) {
            X = camO[0] + d[0] * t;
            Y = camO[1] + d[1] * t;
            Z = camO[2] + d[2] * t;
            const dist = sdf3(f, X, Y, Z, h, r);
            if (dist < 0.0009) {
              hit = true;
              break;
            }
            t += dist * 0.85 + 0.0004;
            if (t > t1 + 0.02) break;
          }
          if (!hit) continue;
          const no = norm([
            sdf3(f, X + eps, Y, Z, h, r) - sdf3(f, X - eps, Y, Z, h, r),
            sdf3(f, X, Y + eps, Z, h, r) - sdf3(f, X, Y - eps, Z, h, r),
            sdf3(f, X, Y, Z + eps, h, r) - sdf3(f, X, Y, Z - eps, h, r),
          ]);
          const n = toWorld(no);
          const V: Vec3 = [-dw[0], -dw[1], -dw[2]];
          const Pw = toWorld([X, Y, Z]);
          const L1 = norm([keyPos[0] - Pw[0], keyPos[1] - Pw[1], keyPos[2] - Pw[2]]);
          const diff1 = Math.max(0, n[0] * L1[0] + n[1] * L1[1] + n[2] * L1[2]);
          const diff2 = Math.max(0, n[0] * L2[0] + n[1] * L2[1] + n[2] * L2[2]);
          const H = norm([L1[0] + V[0], L1[1] + V[1], L1[2] + V[2]]);
          const nh = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
          const spec = nh ** 64 * 0.95 + nh ** 12 * 0.1;
          const nv = Math.max(0, n[0] * V[0] + n[1] * V[1] + n[2] * V[2]);
          const rim = (1 - nv) ** 3 * 0.6;
          const face = Math.abs(no[2]);
          const wall = clamp01((0.94 - face) / 0.5);
          const studio = 0.8 + 0.42 * clamp01(0.5 + (-0.4 * X + 0.85 * Y) * 0.55);
          const fb = brandAt((X + 1) / 2 - Y * 0.06);
          const faceC: Vec3 = [fb[0] / 255, fb[1] / 255, fb[2] / 255];
          const up = clamp01(0.5 + no[1] * 0.5 - no[0] * 0.15);
          const base = mix(faceC, mix(wallDark, wallLit, up), wall);
          let g = 0;
          if (glint !== null && face > 0.6) {
            const q = (X + 0.45 * Y - glint) / 0.14;
            g = Math.exp(-q * q) * 0.7 * face;
          }
          const lit = (0.2 + diff1 * 0.85) * (wall > 0.5 ? 1 : studio) + diff2 * 0.18;
          const r0 = base[0] * lit + spec * 0.9 * 0.85 + rim * 0.62 * 0.3 + g * 0.95;
          const g0 = base[1] * lit + spec * 0.92 * 0.85 + rim * 0.48 * 0.3 + g * 0.93;
          const b0 = base[2] * lit + spec * 0.85 + rim * 0.3 + g;
          const lum =
            0.06 +
            diff1 * 0.62 * (wall > 0.5 ? 0.55 : studio) +
            diff2 * 0.1 +
            spec * 0.95 +
            rim * 0.18 +
            g * 0.9;
          hits += 1;
          cr += clamp01(r0);
          cg += clamp01(g0);
          cb += clamp01(b0);
          cl += clamp01(lum);
        }
      }
      const idx = py * width + px;
      out.cov[idx] = hits / (ssx * ssy);
      if (hits) {
        out.rgb[idx * 3] = cr / hits;
        out.rgb[idx * 3 + 1] = cg / hits;
        out.rgb[idx * 3 + 2] = cb / hits;
        out.lum[idx] = cl / hits;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------- cells

const to255 = (v: number) => Math.round(clamp01(v) ** (1 / 1.12) * 255);

/** Pixel height of the image for a width in columns. */
function pixelHeight(width: number, aspect: number): number {
  return Math.max(2, Math.round((width * 1.78) / 2.34 / aspect));
}

/** Terminal rows the logo takes at a width. */
export function logoRows(cols: number, mode: LogoMode): number {
  if (mode === 'ramp') return pixelHeight(cols, 2.05);
  const h = pixelHeight(cols, 1);
  return (h + (h % 2)) / 2;
}

function halfBlockCells(img: Image, threshold = 0.42): Cell[][] {
  const rows: Cell[][] = [];
  const color = (i: number): Rgb => [
    to255(img.rgb[i * 3]!),
    to255(img.rgb[i * 3 + 1]!),
    to255(img.rgb[i * 3 + 2]!),
  ];
  for (let y = 0; y < img.height; y += 2) {
    const row: Cell[] = [];
    for (let x = 0; x < img.width; x += 1) {
      const i1 = y * img.width + x;
      const i2 = (y + 1) * img.width + x;
      const up = img.cov[i1]! >= threshold;
      const dn = y + 1 < img.height && img.cov[i2]! >= threshold;
      if (up && dn) row.push(['▀', color(i1), color(i2)]);
      else if (up) row.push(['▀', color(i1), null]);
      else if (dn) row.push(['▄', color(i2), null]);
      else row.push([' ', null, null]);
    }
    rows.push(row);
  }
  return rows;
}

const RAMP = ' .:-=+*#%@';

function rampCells(img: Image): Cell[][] {
  const rows: Cell[][] = [];
  const n = RAMP.length - 1;
  for (let y = 0; y < img.height; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < img.width; x += 1) {
      const i = y * img.width + x;
      const cov = img.cov[i]!;
      if (cov < 0.18) {
        row.push([' ', null, null]);
        continue;
      }
      const l = clamp01(img.lum[i]! * 1.6 * (0.5 + 0.5 * cov)) ** 0.75;
      const ch = RAMP[Math.max(1, Math.min(n, Math.round(l * n)))]!;
      // Characters are thin: lift the color so the shape keeps its weight.
      row.push([
        ch,
        [
          to255(img.rgb[i * 3]! * 1.3 * 0.8 + 0.2 * 0.62),
          to255(img.rgb[i * 3 + 1]! * 1.3 * 0.8 + 0.2 * 0.5),
          to255(img.rgb[i * 3 + 2]! * 1.3 * 0.8 + 0.2),
        ],
        null,
      ]);
    }
    rows.push(row);
  }
  return rows;
}

/** Renders the cells of one pose. */
export function renderCells(field: Field, cols: number, mode: LogoMode, pose: Pose): Cell[][] {
  const aspect = mode === 'half' ? 1 : 2.05;
  let height = pixelHeight(cols, aspect);
  if (mode === 'half' && height % 2) height += 1;
  const img = renderImage(field, {
    width: cols,
    height,
    aspect,
    ...pose,
    ssx: 3,
    ssy: mode === 'half' ? 3 : 5,
  });
  return mode === 'half' ? halfBlockCells(img) : rampCells(img);
}

// --------------------------------------------------------------- animation

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeOutBack = (p: number, s: number) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;

/** Final pose: facing the viewer, with a slight angle so the depth shows. */
export const HERO_POSE: Pose = { yaw: -0.24, pitch: 0.2, roll: 0, zoom: 1, glint: null };

/**
 * Poses of the intro: a spin that lands facing the viewer (about 1.05 s),
 * then a glint that crosses the face (about 0.35 s). 44 frames at 30 fps,
 * 1.47 s in total.
 */
export function introPoses(fps = 30, spinMs = 1050, glintMs = 360): { poses: Pose[]; fps: number } {
  const poses: Pose[] = [];
  const spinFrames = Math.round((spinMs / 1000) * fps);
  const glintFrames = Math.round((glintMs / 1000) * fps);
  const startYaw = HERO_POSE.yaw - Math.PI * 1.55;
  for (let k = 0; k < spinFrames; k += 1) {
    const p = (k + 1) / spinFrames;
    poses.push({
      yaw: startYaw + (HERO_POSE.yaw - startYaw) * easeOutBack(p, 0.9),
      pitch: 0.55 + (HERO_POSE.pitch - 0.55) * easeOutCubic(p),
      roll: -0.18 * (1 - easeOutCubic(p)),
      zoom: 0.62 + 0.38 * easeOutCubic(Math.min(1, p * 1.25)),
      glint: null,
    });
  }
  for (let k = 0; k < glintFrames; k += 1) {
    const p = (k + 1) / glintFrames;
    poses.push({ ...HERO_POSE, glint: -1.6 + 3.4 * easeOutCubic(p) });
  }
  poses.push({ ...HERO_POSE });
  return { poses, fps };
}

/** Widths of the B, largest first. The owner chose 80 columns as the maximum. */
export const LOGO_STEPS = [80, 72, 64, 56, 44, 34, 26, 18] as const;

/**
 * Rows the B takes on screen at each step (its final pose, empty rows left
 * out): the area of the logo. Measured from the renderer; a test keeps them
 * in step with it.
 */
export const LOGO_AREA_ROWS: Record<LogoMode, readonly number[]> = {
  half: [27, 24, 21, 18, 15, 11, 8, 7],
  ramp: [26, 23, 21, 19, 14, 11, 8, 7],
};

/**
 * The width the B is drawn at inside that area: about 87% of its height, so
 * there is room above it and above the horizon, with the same proportions.
 * Chosen by the rule in the logo test (closest to 87%, even room above and
 * below preferred, at least one free row on each side when the area allows).
 */
export const LOGO_INNER_COLS: Record<LogoMode, readonly number[]> = {
  half: [70, 64, 59, 48, 38, 28, 23, 15],
  ramp: [69, 61, 57, 50, 38, 29, 20, 15],
};

/**
 * Rows the waiting screen of the login takes besides the B: the blank row
 * above it, the horizon and its reflection, the wordmark, the tagline, a blank
 * row, the steps (title, rail, browser, address, keys, rail, "Waiting") and
 * the row of the cursor. The waiting screen fits the window, so the B and its
 * points of light stay in view while the login waits; once it ends, the
 * result may scroll. Measured by the logo test.
 */
export const LOGIN_WAIT_ROWS = 14;

/** The area of the logo at a step and the width of the B inside it. */
export function logoArea(cols: number, mode: LogoMode): { rows: number; inner: number } {
  const i = Math.max(0, LOGO_STEPS.indexOf(cols as (typeof LOGO_STEPS)[number]));
  return { rows: LOGO_AREA_ROWS[mode][i]!, inner: LOGO_INNER_COLS[mode][i]! };
}

/**
 * The largest B that fits the window: its width plus a side margin within
 * the columns, and the waiting screen of the login (the B and the rows under
 * it, plus `extraRows` when the address wraps or there is one more hint)
 * within the rows. A window too short for that gets the next step down.
 * Below 24 columns there is no B; when no size fits the height, the smallest
 * one is used.
 */
export function pickLogoSize(
  columns: number,
  rows: number,
  mode: LogoMode,
  extraRows = 0,
): number | null {
  for (const cols of LOGO_STEPS) {
    const height = logoArea(cols, mode).rows + LOGIN_WAIT_ROWS + extraRows;
    if (cols + 8 <= columns - 2 && height <= rows) return cols;
  }
  return columns >= 24 ? 18 : null;
}

let cachedField: Field | null = null;

/** The distance field of the official icon (built once, about 70 ms). */
export function iconField(): Field {
  cachedField ??= buildField(normalizedSegments());
  return cachedField;
}
