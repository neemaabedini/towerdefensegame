import { HERO_SHEET_DIRS, HERO_SHEET_FRAMES } from "./heroSheet.generated";

/**
 * Pixel-sprite engine + enemy sprite atlas.
 *
 * Sprites are composed from primitives on a small pixel grid, auto-outlined
 * and auto-shaded (Brotato-style: chunky, 1px dark outline, 3-tone shading),
 * then baked at PIXEL_SCALE into one atlas canvas. Each enemy gets 2 walk
 * frames plus pre-baked white hit-flash variants.
 *
 * The atlas API (frame rects into a canvas) matches what a PNG+JSON sprite
 * sheet would provide, so hand-drawn art can replace these builders
 * per-enemy later without touching the Renderer (see ROADMAP.md).
 */

const PIXEL_SCALE = 2;
const OUTLINE = "#0c0d14";

/* ---------------- pixel grid primitives ---------------- */

interface Grid {
  w: number;
  h: number;
  data: (string | null)[];
}

function makeGrid(w: number, h: number): Grid {
  return { w, h, data: new Array<string | null>(w * h).fill(null) };
}

function px(g: Grid, x: number, y: number, c: string): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= g.w || yi >= g.h) return;
  g.data[yi * g.w + xi] = c;
}

function fillEllipse(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: string,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1.05) px(g, x, y, c);
    }
  }
}

function fillRect(
  g: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  c: string,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px(g, xx, yy, c);
  }
}

function line(
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: string,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(g, x, y, c);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillTriangle(
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c: string,
): void {
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    pxx: number,
    pyy: number,
  ): number => (bx - ax) * (pyy - ay) - (by - ay) * (pxx - ax);
  const minX = Math.floor(Math.min(x0, x1, x2));
  const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2));
  const maxY = Math.ceil(Math.max(y0, y1, y2));
  const area = edge(x0, y0, x1, y1, x2, y2);
  if (area === 0) return;
  const sign = area > 0 ? 1 : -1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = edge(x0, y0, x1, y1, x, y) * sign;
      const w1 = edge(x1, y1, x2, y2, x, y) * sign;
      const w2 = edge(x2, y2, x0, y0, x, y) * sign;
      if (w0 >= -0.5 && w1 >= -0.5 && w2 >= -0.5) px(g, x, y, c);
    }
  }
}

/** Rim shading: base-colored pixels open to the sky get highlight, pixels
 *  resting on empty space get shadow. */
function shadeAuto(
  g: Grid,
  base: string,
  highlight: string,
  shadow: string,
): void {
  const get = (x: number, y: number): string | null =>
    x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.data[y * g.w + x]!;
  const out = g.data.slice();
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (get(x, y) !== base) continue;
      if (get(x, y - 1) === null) out[y * g.w + x] = highlight;
      else if (get(x, y + 1) === null) out[y * g.w + x] = shadow;
    }
  }
  g.data = out;
}

/** 1px outline around every filled pixel (grids need a 1px margin). */
function outlineAuto(g: Grid): void {
  const get = (x: number, y: number): string | null =>
    x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.data[y * g.w + x]!;
  const out = g.data.slice();
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (get(x, y) !== null) continue;
      if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) {
        out[y * g.w + x] = OUTLINE;
      }
    }
  }
  g.data = out;
}

/* ---------------- enemy sprite builders ---------------- */
/* All face RIGHT (+x). frame is 0 or 1 (walk cycle). */

interface Palette {
  base: string;
  shadow: string;
  highlight: string;
  accent: string;
  eye: string;
}

type Builder = (frame: number) => Grid;

function finish(g: Grid, p: Palette): Grid {
  shadeAuto(g, p.base, p.highlight, p.shadow);
  outlineAuto(g);
  return g;
}

/** Swarmling: small scuttling critter, four legs, back spines */
function swarmling(frame: number): Grid {
  const p: Palette = {
    base: "#ad1457",
    shadow: "#6d0c36",
    highlight: "#e04a86",
    accent: "#f48fb1",
    eye: "#ffd54f",
  };
  const g = makeGrid(16, 12);
  fillEllipse(g, 6.5, 6, 3.8, 2.4, p.base); // abdomen
  fillEllipse(g, 11, 5.2, 2.4, 2, p.base); // head
  // back spines
  px(g, 4, 3, p.accent);
  px(g, 6, 2.6, p.accent);
  px(g, 8, 2.8, p.accent);
  // eye + mandible
  px(g, 12, 4.6, p.eye);
  px(g, 13, 6, p.accent);
  // legs (alternate splay per frame)
  const a = frame === 0;
  line(g, 5, 8, a ? 3 : 4.6, 10.4, p.shadow);
  line(g, 7, 8.4, a ? 7.6 : 6.4, 10.6, p.shadow);
  line(g, 9, 8.2, a ? 10.6 : 9, 10.4, p.shadow);
  line(g, 11, 7.4, a ? 12 : 13, 9.8, p.shadow);
  return finish(g, p);
}

/** Raider: serpentine torso, scythe arms */
function raider(frame: number): Grid {
  const p: Palette = {
    base: "#c62828",
    shadow: "#7f1a1a",
    highlight: "#ef6350",
    accent: "#ffcdd2",
    eye: "#ffe082",
  };
  const g = makeGrid(20, 15);
  fillEllipse(g, 5, 10, 3.4, 2.4, p.base); // tail mass
  fillEllipse(g, 10, 8, 4, 3.2, p.base); // torso
  fillEllipse(g, 14.5, 4.4, 2.6, 2.2, p.base); // head
  // crest
  px(g, 12.6, 2.4, p.accent);
  px(g, 14.4, 1.8, p.accent);
  // eye
  px(g, 15.6, 4, p.eye);
  // scythe arms (swing with walk)
  const a = frame === 0;
  line(g, 12, 7, a ? 16 : 15, a ? 9 : 10.4, p.shadow);
  px(g, a ? 17 : 16, a ? 9.6 : 11, p.accent);
  line(g, 11, 8.4, a ? 13.4 : 14.4, a ? 11.4 : 10.6, p.shadow);
  px(g, a ? 14 : 15, a ? 12 : 11.2, p.accent);
  // ground ripple under tail
  line(g, 3, 12.4, a ? 6 : 7, 12.6, p.shadow);
  return finish(g, p);
}

/** Brute: hulking quadruped with tusks and armor plates */
function brute(frame: number): Grid {
  const p: Palette = {
    base: "#5d4037",
    shadow: "#36241d",
    highlight: "#8d6e63",
    accent: "#ff8a65",
    eye: "#ffab40",
  };
  const g = makeGrid(26, 19);
  fillEllipse(g, 11.5, 9.5, 8.2, 5.2, p.base); // body
  fillEllipse(g, 20, 8, 3.6, 3, p.base); // head
  // armor plates along the spine
  fillEllipse(g, 7, 5.4, 2.6, 1.3, p.accent);
  fillEllipse(g, 12, 4.6, 2.8, 1.4, p.accent);
  fillEllipse(g, 16.6, 5, 2.2, 1.2, p.accent);
  // tusks
  line(g, 22.4, 9.4, 24.6, 8, "#eceff1");
  line(g, 22, 10.4, 24, 10.8, "#eceff1");
  // eye
  px(g, 21.4, 6.8, p.eye);
  // legs: thick columns, alternating pairs
  const a = frame === 0;
  fillRect(g, a ? 5 : 7, 13, 2, 5, p.shadow);
  fillRect(g, a ? 10 : 9, 14, 2, 4, p.shadow);
  fillRect(g, a ? 14 : 15, 14, 2, 4, p.shadow);
  fillRect(g, a ? 18 : 17, 13, 2, 5, p.shadow);
  return finish(g, p);
}

/** Siege Walker: armored dome on spindly legs */
function siegeWalker(frame: number): Grid {
  const p: Palette = {
    base: "#455a64",
    shadow: "#263238",
    highlight: "#78909c",
    accent: "#ffd54f",
    eye: "#ffd54f",
  };
  const g = makeGrid(28, 21);
  fillEllipse(g, 13.5, 8.5, 9.4, 5.6, p.base); // dome
  fillEllipse(g, 13.5, 6.6, 5.8, 2.8, p.highlight); // upper carapace
  // glowing seam vents
  px(g, 8, 10, p.accent);
  px(g, 12, 11, p.accent);
  px(g, 16, 11, p.accent);
  px(g, 20, 10, p.accent);
  // eye cluster front
  px(g, 21.6, 8, p.eye);
  px(g, 20.6, 9.2, p.eye);
  // six spindly legs
  const a = frame === 0;
  line(g, 7, 12, a ? 3.4 : 5, 18.6, p.shadow);
  line(g, 11, 13.4, a ? 10 : 8.6, 19.4, p.shadow);
  line(g, 15, 13.6, a ? 13.6 : 15.6, 19.6, p.shadow);
  line(g, 18, 13, a ? 20 : 18.4, 19, p.shadow);
  line(g, 21, 12, a ? 24 : 22.4, 18, p.shadow);
  line(g, 9, 12.8, a ? 7 : 8, 19, p.shadow);
  return finish(g, p);
}

/** Skimmer: winged flyer, wings flap between frames */
function skimmer(frame: number): Grid {
  const p: Palette = {
    base: "#1e88e5",
    shadow: "#0d47a1",
    highlight: "#64b5f6",
    accent: "#81d4fa",
    eye: "#ffffff",
  };
  const g = makeGrid(20, 15);
  fillEllipse(g, 10, 8, 4.4, 2.6, p.base); // body
  fillEllipse(g, 14.6, 7, 2, 1.7, p.base); // head
  px(g, 15.6, 6.6, p.eye);
  // tail barb
  line(g, 5.6, 8.6, 3, 10, p.shadow);
  px(g, 2.4, 10.4, p.accent);
  // wings: up on frame 0, swept down on frame 1
  if (frame === 0) {
    fillEllipse(g, 8, 3.4, 4.4, 1.6, p.accent);
    fillEllipse(g, 12.6, 3.8, 3.2, 1.3, p.accent);
  } else {
    fillEllipse(g, 7.4, 11, 4.4, 1.5, p.accent);
    fillEllipse(g, 12, 11.2, 3.2, 1.2, p.accent);
  }
  return finish(g, p);
}

/** Warlord: massive crowned boss */
function warlord(frame: number): Grid {
  const p: Palette = {
    base: "#6a1b9a",
    shadow: "#3e1065",
    highlight: "#9c4dcc",
    accent: "#e040fb",
    eye: "#ffea00",
  };
  const g = makeGrid(34, 27);
  fillEllipse(g, 15, 14, 11.4, 7.4, p.base); // bulk
  fillEllipse(g, 25.4, 9.4, 4.4, 3.8, p.base); // head
  // crown spikes
  line(g, 8, 7.4, 6.4, 3.4, p.accent);
  line(g, 13, 5.6, 12.4, 1.8, p.accent);
  line(g, 18, 5.6, 19, 2, p.accent);
  line(g, 23, 6.6, 24.6, 3.4, p.accent);
  // twin eyes
  px(g, 27, 8.4, p.eye);
  px(g, 27.6, 10.2, p.eye);
  // mandibles
  line(g, 29, 11.4, 31.4, 12.6, p.accent);
  line(g, 28.6, 12.6, 30.4, 14, p.accent);
  // legs: heavy stumps alternating
  const a = frame === 0;
  fillRect(g, a ? 7 : 9, 20, 3, 6, p.shadow);
  fillRect(g, a ? 13 : 12, 21, 3, 5, p.shadow);
  fillRect(g, a ? 19 : 20, 21, 3, 5, p.shadow);
  fillRect(g, a ? 24 : 23, 20, 3, 6, p.shadow);
  return finish(g, p);
}

const ENEMY_BUILDERS: Record<string, Builder> = {
  swarmling,
  raider,
  brute,
  siege_walker: siegeWalker,
  skimmer,
  warlord,
};

/* ---------------- garrison unit sprite builders ---------------- */
/* Keyed by UnitDef.id. Small human silhouettes, 2-frame walk/aim cycle. */

/** Marine: helmet, armored torso, rifle. */
function marineUnit(frame: number): Grid {
  const p: Palette = {
    base: "#1565c0",
    shadow: "#0d3c74",
    highlight: "#42a5f5",
    accent: "#90caf9",
    eye: "#fff59d",
  };
  const g = makeGrid(10, 12);
  // legs (alternate stride)
  const a = frame === 0;
  line(g, 4, 11, a ? 3 : 5, 8, p.shadow);
  line(g, 6, 11, a ? 7 : 5, 8, p.shadow);
  // torso
  fillRect(g, 3, 4, 4, 5, p.base);
  // shoulder pad
  px(g, 3, 4, p.accent);
  // helmet
  fillEllipse(g, 5, 2.2, 2.2, 1.8, p.base);
  px(g, 6, 2, p.eye); // visor glint
  // rifle, muzzle bobs slightly between frames
  line(g, 7, 5, a ? 9 : 9.4, a ? 4.4 : 4.2, p.accent);
  px(g, a ? 9 : 9.4, a ? 4.4 : 4.2, "#37474f");
  return finish(g, p);
}

/** Sniper: taller, darker silhouette with a long scoped barrel. */
function sniperUnit(frame: number): Grid {
  const p: Palette = {
    base: "#37474f",
    shadow: "#1c262b",
    highlight: "#607d8b",
    accent: "#4dd0e1",
    eye: "#4dd0e1",
  };
  const g = makeGrid(13, 12);
  const a = frame === 0;
  line(g, 4, 11, a ? 3 : 5, 8, p.shadow);
  line(g, 6, 11, a ? 7 : 5, 8, p.shadow);
  fillRect(g, 3, 4, 4, 5, p.base);
  px(g, 3, 4, p.accent);
  fillEllipse(g, 5, 2.2, 2.2, 1.8, p.base);
  px(g, 6, 2, p.eye);
  // long barrel — noticeably longer than the marine's, with a scope block
  line(g, 7, 5, 12.4, 3.6, p.shadow);
  px(g, 12.4, 3.6, "#0e1417");
  fillRect(g, 8, 3.6, 2, 1, p.accent); // scope
  return finish(g, p);
}

const UNIT_BUILDERS: Record<string, Builder> = {
  marine: marineUnit,
  sniper: sniperUnit,
};

/* ---------------- building sprite builders ---------------- */
/* Keyed by BuildingDef.shape. frame is 0/1 idle animation. */

/** Command Post: pad, slab, dome, side pods, blinking antenna, energy core */
function hqSprite(frame: number): Grid {
  const base = "#1e88e5";
  const g = makeGrid(40, 32);
  fillEllipse(g, 20, 26.5, 17, 4, "#2c3a45"); // landing pad
  fillEllipse(g, 20, 20, 16, 6.5, base); // main slab
  fillRect(g, 4, 17, 32, 6, base);
  fillRect(g, 1, 16, 5, 8, "#10529e"); // side pods
  fillRect(g, 34, 16, 5, 8, "#10529e");
  fillEllipse(g, 20, 12, 9, 6, "#64b5f6"); // dome
  fillRect(g, 14, 10, 12, 2, "#0d1826"); // window band
  line(g, 29, 8, 29, 2, "#90a4ae"); // antenna
  px(g, 29, 1, frame === 0 ? "#ff5252" : "#5d1a1a"); // blinking light
  // energy core
  const core = frame === 0 ? "#b3e5fc" : "#4fc3f7";
  fillRect(g, 19, 21, 2, 2, core);
  return (() => {
    shadeAuto(g, base, "#5aa9ec", "#10529e");
    outlineAuto(g);
    return g;
  })();
}

/** Gun Tower: splayed legs, column, boxy head, twin angled barrels */
function towerSprite(frame: number): Grid {
  const base = "#546e7a";
  const g = makeGrid(22, 24);
  line(g, 5, 22, 8, 15, base); // legs
  line(g, 16, 22, 13, 15, base);
  fillRect(g, 8, 10, 6, 11, base); // column
  fillRect(g, 5, 5, 12, 6, "#78909c"); // head
  line(g, 13, 6, 19, 2, "#263238"); // barrels
  line(g, 14, 8, 20, 4, "#263238");
  px(g, 19, 2, frame === 0 ? "#eceff1" : "#90a4ae"); // muzzle tips
  px(g, 20, 4, frame === 0 ? "#90a4ae" : "#eceff1");
  px(g, 9, 12, frame === 0 ? "#4fc3f7" : "#1e5a75"); // status light
  return (() => {
    shadeAuto(g, base, "#78909c", "#37474f");
    outlineAuto(g);
    return g;
  })();
}

/** Missile Battery: pedestal + tilted rack with four red-tipped tubes */
function missileSprite(frame: number): Grid {
  const base = "#455a64";
  const g = makeGrid(24, 22);
  fillRect(g, 6, 16, 12, 4, "#2c3a45"); // pedestal
  // tilted rack (a fat diagonal slab)
  fillTriangle(g, 4, 15, 16, 3, 20, 8, base);
  fillTriangle(g, 4, 15, 20, 8, 9, 18, base);
  // tubes with warheads
  const tip = frame === 0 ? "#ef5350" : "#ff8a80";
  px(g, 9, 11, "#1c262b");
  px(g, 12, 8, "#1c262b");
  px(g, 12, 13, "#1c262b");
  px(g, 15, 10, "#1c262b");
  px(g, 10, 10, tip);
  px(g, 13, 7, tip);
  px(g, 13, 12, tip);
  px(g, 16, 9, tip);
  return (() => {
    shadeAuto(g, base, "#607d8b", "#2c3a45");
    outlineAuto(g);
    return g;
  })();
}

/** Bunker: low pillbox, firing slit, sandbags */
function bunkerSprite(frame: number): Grid {
  const base = "#5d4037";
  const g = makeGrid(28, 18);
  fillTriangle(g, 2, 14, 6, 4, 22, 4, base);
  fillTriangle(g, 2, 14, 22, 4, 26, 14, base);
  fillRect(g, 2, 13, 24, 3, base);
  fillRect(g, 8, 8, 12, 3, "#191210"); // firing slit
  line(g, 14, 9, frame === 0 ? 19 : 18, 9, "#263238"); // gun barrel
  // sandbag row
  for (let i = 0; i < 5; i++) {
    fillEllipse(g, 5 + i * 4.5, 16, 2.2, 1.4, "#a1887f");
  }
  return (() => {
    shadeAuto(g, base, "#8d6e63", "#3e2723");
    outlineAuto(g);
    return g;
  })();
}

/** Artillery Platform (deployed): outriggers, hull, turret, long elevated barrel */
function tankSprite(frame: number): Grid {
  const base = "#37474f";
  const g = makeGrid(28, 22);
  line(g, 6, 13, 2, 19, "#263238"); // outriggers
  line(g, 21, 13, 25, 19, "#263238");
  fillEllipse(g, 13.5, 14, 9.5, 4, base); // hull
  fillEllipse(g, 12, 9.5, 4, 2.8, "#546e7a"); // turret
  line(g, 13, 8, 23, 2, "#ff8a65"); // barrel
  fillRect(g, 22, 1, 2, 3, "#ff8a65"); // muzzle brake
  px(g, 5, 12, frame === 0 ? "#ffcc80" : "#8d5524"); // exhaust glow
  return (() => {
    shadeAuto(g, base, "#546e7a", "#22303a");
    outlineAuto(g);
    return g;
  })();
}

/** Barracks: garrison block, lit door, windows, waving flag */
function factorySprite(frame: number): Grid {
  const base = "#2e7d32";
  const g = makeGrid(28, 26);
  fillRect(g, 2, 10, 24, 13, base); // block
  fillRect(g, 2, 10, 24, 3, "#1b5e20"); // roof band
  fillRect(g, 12, 16, 4, 7, "#fff176"); // lit door
  fillRect(g, 5, 14, 3, 2, "#ffe082"); // windows
  fillRect(g, 20, 14, 3, 2, "#ffe082");
  line(g, 23, 9, 23, 2, "#90a4ae"); // flag pole
  // flag waves between frames
  if (frame === 0) {
    fillTriangle(g, 23, 2, 27, 3.5, 23, 6, "#81c784");
  } else {
    fillTriangle(g, 23, 2, 26.4, 4.6, 23, 6, "#66bb6a");
  }
  return (() => {
    shadeAuto(g, base, "#4caf50", "#1b5e20");
    outlineAuto(g);
    return g;
  })();
}

/** Refinery: twin vats, connecting pipe, bubbling glow */
function siloSprite(frame: number): Grid {
  const base = "#f9a825";
  const g = makeGrid(26, 24);
  fillRect(g, 3, 8, 8, 13, base); // left vat
  fillRect(g, 15, 8, 8, 13, base); // right vat
  fillEllipse(g, 7, 8, 4, 1.8, "#ffd54f"); // caps
  fillEllipse(g, 19, 8, 4, 1.8, "#ffd54f");
  line(g, 11, 14, 15, 14, "#90a4ae"); // pipe
  px(g, 13, 14, "#546e7a"); // valve
  line(g, 3, 17, 10, 17, "#c17900"); // ring seams
  line(g, 15, 17, 22, 17, "#c17900");
  // rising bubble
  px(g, 7, frame === 0 ? 5 : 3, "#ffee58");
  return (() => {
    shadeAuto(g, base, "#ffd54f", "#c17900");
    outlineAuto(g);
    return g;
  })();
}

/** Sensor Array: tripod, pivot ball, tilted dish, blinking feed */
function radarSprite(frame: number): Grid {
  const base = "#6a1b9a";
  const g = makeGrid(22, 24);
  line(g, 6, 22, 11, 14, base); // tripod
  line(g, 16, 22, 11, 14, base);
  line(g, 11, 22, 11, 14, base);
  fillEllipse(g, 11, 13, 3, 2.6, base); // pivot ball
  fillEllipse(g, 11, 7.5, 6.5, 3.6, "#ce93d8"); // dish
  fillEllipse(g, 11.6, 8, 3.6, 1.9, "#4a148c"); // dish bowl
  line(g, 11, 7, 15, 2, "#eceff1"); // feed arm
  px(g, 15.6, 1.4, frame === 0 ? "#e040fb" : "#7b1fa2"); // blinking tip
  return (() => {
    shadeAuto(g, base, "#8e24aa", "#4a148c");
    outlineAuto(g);
    return g;
  })();
}

/** Sniper Tower: tripod legs, compact body, one long thin barrel with a
 *  scope mounted just behind the muzzle; scope glints on the idle blink. */
function sniperSprite(frame: number): Grid {
  const base = "#37474f";
  const g = makeGrid(30, 20);
  // tripod legs
  line(g, 6, 19, 11, 12, base);
  line(g, 24, 19, 19, 12, base);
  line(g, 15, 19.5, 15, 12, base);
  // compact body
  fillRect(g, 9, 7, 10, 6, base);
  fillEllipse(g, 14, 7, 5, 2.6, "#546e7a"); // turret cap
  // long thin barrel, angled up-right
  line(g, 17, 7, 28, 3, "#1a2226");
  line(g, 17, 8, 27, 4.4, "#1a2226");
  px(g, 27.6, 3, "#eceff1"); // muzzle tip
  // scope mounted above the breach, glint blinks between frames
  fillRect(g, 19, 4.6, 3, 2, "#263238");
  px(g, 20.4, 5.4, frame === 0 ? "#4dd0e1" : "#1a5f66");
  return (() => {
    shadeAuto(g, base, "#546e7a", "#1c262b");
    outlineAuto(g);
    return g;
  })();
}

const BUILDING_BUILDERS: Record<string, Builder> = {
  hq: hqSprite,
  tower: towerSprite,
  missile: missileSprite,
  bunker: bunkerSprite,
  tank: tankSprite,
  factory: factorySprite,
  silo: siloSprite,
  radar: radarSprite,
  sniper: sniperSprite,
};

/* ---------------- terrain sprite builders ---------------- */

function rockSprite(w: number, h: number): Builder {
  return () => {
    const base = "#3e4a52";
    const g = makeGrid(w, h);
    const cx = w / 2;
    const cy = h * 0.55;
    fillEllipse(g, cx - w * 0.16, cy, w * 0.3, h * 0.32, base);
    fillEllipse(g, cx + w * 0.18, cy + h * 0.06, w * 0.26, h * 0.26, base);
    fillEllipse(g, cx + 1, cy - h * 0.18, w * 0.22, h * 0.22, base);
    // cracks
    line(g, cx - 2, cy - 2, cx + 1, cy + h * 0.24, "#2b343b");
    line(g, cx + w * 0.2, cy, cx + w * 0.26, cy + h * 0.2, "#2b343b");
    shadeAuto(g, base, "#55636d", "#2b343b");
    outlineAuto(g);
    return g;
  };
}

function crystalSprite(w: number, h: number): Builder {
  return () => {
    const g = makeGrid(w, h);
    const cx = w / 2;
    const baseY = h - 3;
    // rocky base
    fillEllipse(g, cx, baseY, w * 0.36, 2, "#2b343b");
    // main shard
    fillTriangle(g, cx, 1, cx - w * 0.18, baseY, cx + w * 0.18, baseY, "#4dd0e1");
    // bright inner face
    fillTriangle(g, cx, 2, cx - w * 0.07, baseY - 1, cx + w * 0.04, baseY * 0.6, "#b2ebf2");
    // side shards
    fillTriangle(g, cx - w * 0.3, h * 0.35, cx - w * 0.42, baseY, cx - w * 0.13, baseY, "#26c6da");
    fillTriangle(g, cx + w * 0.32, h * 0.45, cx + w * 0.16, baseY, cx + w * 0.44, baseY, "#26c6da");
    outlineAuto(g);
    return g;
  };
}

const TERRAIN_BUILDERS: Record<string, Builder> = {
  "rock:s": rockSprite(24, 16),
  "rock:m": rockSprite(30, 20),
  "rock:l": rockSprite(38, 24),
  "crystal:s": crystalSprite(20, 22),
  "crystal:m": crystalSprite(24, 26),
};

/* ---------------- atlas ---------------- */

export interface SpriteFrame {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** anchor (sprite center) offset from the frame's top-left, in atlas px */
  ax: number;
  ay: number;
}

export class SpriteAtlas {
  constructor(
    readonly canvas: HTMLCanvasElement,
    private frames: Map<string, SpriteFrame>,
  ) {}

  get(key: string): SpriteFrame | undefined {
    return this.frames.get(key);
  }

  get frameCount(): number {
    return this.frames.size;
  }
}

/**
 * Bake every sprite into one atlas canvas.
 * Keys: enemies "<enemyId>:<frame>" (+ ":flash" variants),
 * garrison units "unit:<unitId>:<frame>" (+ ":flash" variants),
 * buildings "bld:<shape>:<frame>", terrain "rock:s|m|l:0" / "crystal:s|m:0".
 */
export function buildAtlas(): SpriteAtlas {
  interface Baked {
    key: string;
    grid: Grid;
    flash: boolean;
  }
  const baked: Baked[] = [];
  for (const [id, build] of Object.entries(ENEMY_BUILDERS)) {
    for (const frame of [0, 1]) {
      const grid = build(frame);
      baked.push({ key: `${id}:${frame}`, grid, flash: false });
      baked.push({ key: `${id}:${frame}:flash`, grid, flash: true });
    }
  }
  for (const [shape, build] of Object.entries(BUILDING_BUILDERS)) {
    for (const frame of [0, 1]) {
      baked.push({ key: `bld:${shape}:${frame}`, grid: build(frame), flash: false });
    }
  }
  for (const [id, build] of Object.entries(UNIT_BUILDERS)) {
    for (const frame of [0, 1]) {
      const grid = build(frame);
      baked.push({ key: `unit:${id}:${frame}`, grid, flash: false });
      baked.push({ key: `unit:${id}:${frame}:flash`, grid, flash: true });
    }
  }
  for (const [key, build] of Object.entries(TERRAIN_BUILDERS)) {
    baked.push({ key: `${key}:0`, grid: build(0), flash: false });
  }

  // Imported hero sprite sheet (CD-32 art pipeline) — frames come from
  // tools/import-hero-sheet.mjs as ready-made pixel grids. Zero frames =
  // no hero:* keys = the renderer's vector fallback keeps drawing, per the
  // standing per-entity-swap rule. If only one frame was imported it doubles
  // as both idle frames.
  HERO_SHEET_FRAMES.forEach((frame, i) => {
    const grid: Grid = { w: frame.w, h: frame.h, data: frame.data };
    baked.push({ key: `hero:${i}`, grid, flash: false });
    baked.push({ key: `hero:${i}:flash`, grid, flash: true });
  });
  if (HERO_SHEET_FRAMES.length === 1) {
    const frame = HERO_SHEET_FRAMES[0]!;
    const grid: Grid = { w: frame.w, h: frame.h, data: frame.data };
    baked.push({ key: "hero:1", grid, flash: false });
    baked.push({ key: "hero:1:flash", grid, flash: true });
  }
  // 8-direction standing set (hero:d<octant>) — takes precedence over the
  // 2-frame idle keys in Renderer.drawHeroSprite when present.
  HERO_SHEET_DIRS.forEach((frame, d) => {
    const grid: Grid = { w: frame.w, h: frame.h, data: frame.data };
    baked.push({ key: `hero:d${d}`, grid, flash: false });
    baked.push({ key: `hero:d${d}:flash`, grid, flash: true });
  });

  // Simple row packing
  const pad = 2;
  const maxRowW = 512;
  let x = pad;
  let y = pad;
  let rowH = 0;
  let atlasW = 0;
  const places: { x: number; y: number }[] = [];
  for (const b of baked) {
    const w = b.grid.w * PIXEL_SCALE;
    const h = b.grid.h * PIXEL_SCALE;
    if (x + w + pad > maxRowW) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    places.push({ x, y });
    x += w + pad;
    rowH = Math.max(rowH, h);
    atlasW = Math.max(atlasW, x);
  }
  const atlasH = y + rowH + pad;

  const canvas = document.createElement("canvas");
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext("2d")!;

  const frames = new Map<string, SpriteFrame>();
  baked.forEach((b, i) => {
    const at = places[i]!;
    const { grid } = b;
    for (let gy = 0; gy < grid.h; gy++) {
      for (let gx = 0; gx < grid.w; gx++) {
        const c = grid.data[gy * grid.w + gx];
        if (!c) continue;
        ctx.fillStyle = b.flash ? "#f4f8ff" : c;
        ctx.fillRect(
          at.x + gx * PIXEL_SCALE,
          at.y + gy * PIXEL_SCALE,
          PIXEL_SCALE,
          PIXEL_SCALE,
        );
      }
    }
    frames.set(b.key, {
      sx: at.x,
      sy: at.y,
      sw: grid.w * PIXEL_SCALE,
      sh: grid.h * PIXEL_SCALE,
      ax: (grid.w * PIXEL_SCALE) / 2,
      ay: (grid.h * PIXEL_SCALE) / 2,
    });
  });

  return new SpriteAtlas(canvas, frames);
}
