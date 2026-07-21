import {
  HERO_ANIMS,
  HERO_SHEET_DIRS,
  HERO_SHEET_FRAMES,
} from "./heroSheet.generated";

/**
 * Pixel-sprite engine + enemy sprite atlas.
 *
 * Sprites are composed from primitives on a small pixel grid, auto-outlined
 * and auto-shaded (chunky pixel look: 1px dark outline, 3-tone shading),
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

/** Spitter: low green spit-bug with a bulbous sac and needle face (was vector-only). */
function spitter(frame: number): Grid {
  const p: Palette = {
    base: "#558b2f",
    shadow: "#33691e",
    highlight: "#7cb342",
    accent: "#c5e1a5",
    eye: "#ffeb3b",
  };
  const g = makeGrid(18, 13);
  const a = frame === 0;
  // ground contact shadow in-sprite
  fillEllipse(g, 8, 11.2, 5.5, 1.4, p.shadow);
  // body + spit sac
  fillEllipse(g, 7.5, 7.5, 5, 3.2, p.base);
  fillEllipse(g, 5.2, 7.8, 2.6, 2.4, p.highlight);
  // head / needle
  fillEllipse(g, 13, 6.5, 2.4, 2, p.base);
  line(g, 14.5, 6.5, 17, a ? 5.5 : 6.2, p.accent);
  px(g, 17, a ? 5.5 : 6.2, p.eye);
  px(g, 13.6, 5.8, p.eye);
  // legs
  line(g, 5, 9.5, a ? 3 : 4, 11.5, p.shadow);
  line(g, 8, 10, a ? 9 : 7.5, 12, p.shadow);
  line(g, 11, 9.5, a ? 12.5 : 11, 11.5, p.shadow);
  return finish(g, p);
}

const ENEMY_BUILDERS: Record<string, Builder> = {
  swarmling,
  raider,
  brute,
  siege_walker: siegeWalker,
  skimmer,
  warlord,
  spitter,
};

/* ---------------- garrison unit sprite builders ---------------- */
/* Keyed by UnitDef.id. Small human silhouettes, 2-frame walk/aim cycle.
 *  Authored facing RIGHT. Ground ellipse at feet = 2.5D contact. */

/** Shared boots-on-ground contact ellipse for infantry sprites. */
function unitGround(g: Grid, cx: number, cy: number, rx: number): void {
  fillEllipse(g, cx, cy, rx, rx * 0.35, "#1a1e24");
}

/** Rifleman: helmet, armored torso, rifle. */
function riflemanUnit(frame: number): Grid {
  const p: Palette = {
    base: "#1565c0",
    shadow: "#0d3c74",
    highlight: "#42a5f5",
    accent: "#90caf9",
    eye: "#fff59d",
  };
  const g = makeGrid(12, 14);
  const a = frame === 0;
  unitGround(g, 5.5, 12.6, 3.2);
  // legs (alternate stride)
  line(g, 4, 12, a ? 3 : 5, 8.5, p.shadow);
  line(g, 7, 12, a ? 8 : 6, 8.5, p.shadow);
  // torso + chest plate
  fillRect(g, 3, 4.5, 5, 5, p.base);
  fillRect(g, 4, 5.5, 3, 2, p.highlight);
  // shoulder pad
  fillEllipse(g, 3.2, 5, 1.6, 1.3, p.accent);
  // helmet
  fillEllipse(g, 5.5, 2.6, 2.6, 2.1, p.base);
  fillRect(g, 4, 2.8, 4, 1, p.shadow); // visor band
  px(g, 6.5, 2.4, p.eye);
  // rifle
  line(g, 8, 6, a ? 11 : 11.2, a ? 4.8 : 4.5, p.accent);
  px(g, a ? 11 : 11.2, a ? 4.8 : 4.5, "#37474f");
  return finish(g, p);
}

/** Scorcher: bulky flamer tanks + short-range projector. */
function scorcherUnit(frame: number): Grid {
  const p: Palette = {
    base: "#e65100",
    shadow: "#bf360c",
    highlight: "#ff8a50",
    accent: "#ffcc80",
    eye: "#ffeb3b",
  };
  const g = makeGrid(13, 14);
  const a = frame === 0;
  unitGround(g, 5.5, 12.6, 3.4);
  line(g, 4, 12, a ? 3 : 5, 8.5, p.shadow);
  line(g, 7, 12, a ? 8 : 6, 8.5, p.shadow);
  // twin fuel tanks on back
  fillRect(g, 2, 4, 2, 5, p.shadow);
  fillRect(g, 8, 4, 2, 5, p.shadow);
  fillEllipse(g, 3, 4, 1.2, 0.9, p.accent);
  fillEllipse(g, 9, 4, 1.2, 0.9, p.accent);
  // bulky torso
  fillRect(g, 3.5, 5, 5, 5, p.base);
  fillRect(g, 4, 6, 4, 2, p.highlight);
  // helmet
  fillEllipse(g, 6, 3, 2.4, 2, p.base);
  px(g, 7, 2.6, p.eye);
  // flamer nozzle + flame flicker
  line(g, 8.5, 7, 12, 6.2, p.shadow);
  px(g, 12, 6, a ? "#ffeb3b" : "#ff9800");
  px(g, 11.5, 5.4, a ? "#ff9800" : "#ffeb3b");
  return finish(g, p);
}

/** Breaker: heavy frame + grenade launcher. */
function breakerUnit(frame: number): Grid {
  const p: Palette = {
    base: "#4e342e",
    shadow: "#3e2723",
    highlight: "#6d4c41",
    accent: "#bcaaa4",
    eye: "#ffcc80",
  };
  const g = makeGrid(14, 14);
  const a = frame === 0;
  unitGround(g, 6, 12.6, 3.6);
  line(g, 4.5, 12, a ? 3.5 : 5.5, 8.5, p.shadow);
  line(g, 7.5, 12, a ? 8.5 : 6.5, 8.5, p.shadow);
  // heavy torso + armor plates
  fillRect(g, 3, 4.5, 6, 5.5, p.base);
  fillRect(g, 4, 5.5, 4, 2, p.highlight);
  px(g, 3, 5, p.accent);
  px(g, 8, 5, p.accent);
  // helmet
  fillEllipse(g, 6, 2.8, 2.8, 2.2, p.base);
  fillRect(g, 4.5, 3, 3.5, 1, p.shadow);
  px(g, 7, 2.5, p.eye);
  // grenade launcher
  fillRect(g, 9, 5.5, 4, 2.5, p.shadow);
  px(g, 12.5, 6.5, a ? p.accent : p.highlight);
  return finish(g, p);
}

/** Bulwark: tower shield + short carbine — tanky front-liner. */
function bulwarkUnit(frame: number): Grid {
  const p: Palette = {
    base: "#5d4037",
    shadow: "#3e2723",
    highlight: "#8d6e63",
    accent: "#ffab91",
    eye: "#ffe0b2",
  };
  const g = makeGrid(13, 14);
  const a = frame === 0;
  unitGround(g, 6, 12.6, 3.5);
  line(g, 5, 12, a ? 4 : 6, 8.5, p.shadow);
  line(g, 7.5, 12, a ? 8.5 : 6.5, 8.5, p.shadow);
  // body
  fillRect(g, 4, 5, 4, 5, p.base);
  fillEllipse(g, 6, 3, 2.3, 1.9, p.base);
  px(g, 7, 2.6, p.eye);
  // tower shield (reads as volume in front)
  fillRect(g, 1, 3.5, 3.5, 8, p.highlight);
  fillRect(g, 1.5, 4.5, 2.5, 6, p.base);
  px(g, 2.5, 5, p.accent); // shield crest
  // carbine
  line(g, 8, 6.5, 11.5, a ? 5.8 : 6.2, p.shadow);
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
  const g = makeGrid(14, 14);
  const a = frame === 0;
  unitGround(g, 5.5, 12.6, 3);
  line(g, 4, 12, a ? 3 : 5, 8.5, p.shadow);
  line(g, 7, 12, a ? 8 : 6, 8.5, p.shadow);
  fillRect(g, 3.5, 4.5, 4, 5, p.base);
  px(g, 3.5, 4.5, p.accent);
  fillEllipse(g, 5.5, 2.6, 2.3, 1.9, p.base);
  px(g, 6.5, 2.3, p.eye);
  // long barrel + scope
  line(g, 7.5, 5.5, 13, 3.8, p.shadow);
  px(g, 13, 3.8, "#0e1417");
  fillRect(g, 8.5, 3.8, 2.5, 1.2, p.accent);
  return finish(g, p);
}

const UNIT_BUILDERS: Record<string, Builder> = {
  rifleman: riflemanUnit,
  scorcher: scorcherUnit,
  breaker: breakerUnit,
  bulwark: bulwarkUnit,
  sniper: sniperUnit,
};

/* ---------------- building sprite builders ---------------- */
/* Keyed by BuildingDef.shape. frame is 0/1 idle animation.
 *  2.5D recipe: dark ground pad → shadowed lower body → lit upper faces. */

function buildingPad(g: Grid, cx: number, cy: number, rx: number, ry: number): void {
  fillEllipse(g, cx, cy, rx, ry, "#1a2228");
  fillEllipse(g, cx, cy - 0.6, rx * 0.88, ry * 0.7, "#2a343c");
}

/** Command Post: pad, extruded slab, dome, pods, antenna, energy core */
function hqSprite(frame: number): Grid {
  const base = "#1e88e5";
  const g = makeGrid(44, 36);
  buildingPad(g, 22, 31, 18, 4.5);
  // body extrusion (darker south face)
  fillRect(g, 6, 18, 32, 10, "#10529e");
  fillRect(g, 6, 16, 32, 6, base); // top face
  fillEllipse(g, 22, 17, 16, 5, base);
  // side pods (volume)
  fillRect(g, 2, 18, 5, 9, "#0d47a1");
  fillRect(g, 37, 18, 5, 9, "#0d47a1");
  fillRect(g, 2, 17, 5, 3, "#1565c0");
  fillRect(g, 37, 17, 5, 3, "#1565c0");
  // dome
  fillEllipse(g, 22, 12, 10, 7, "#64b5f6");
  fillEllipse(g, 20, 10, 5, 3.5, "#90caf9"); // lit dome face
  fillRect(g, 15, 11, 14, 2, "#0d1826");
  // antenna + blink
  line(g, 31, 9, 31, 2, "#90a4ae");
  px(g, 31, 1, frame === 0 ? "#ff5252" : "#5d1a1a");
  const core = frame === 0 ? "#b3e5fc" : "#4fc3f7";
  fillRect(g, 21, 22, 3, 3, core);
  return (() => {
    shadeAuto(g, base, "#5aa9ec", "#10529e");
    outlineAuto(g);
    return g;
  })();
}

/** Gun Tower: splayed legs, thick column, boxy head, twin barrels */
function towerSprite(frame: number): Grid {
  const base = "#546e7a";
  const g = makeGrid(26, 28);
  buildingPad(g, 13, 25.5, 9, 2.4);
  // legs as solid wedges
  fillTriangle(g, 4, 25, 9, 14, 11, 25, "#37474f");
  fillTriangle(g, 22, 25, 17, 14, 15, 25, "#37474f");
  // column with side face
  fillRect(g, 9, 10, 8, 13, base);
  fillRect(g, 9, 10, 3, 13, "#37474f"); // left shadow face
  fillRect(g, 14, 10, 3, 13, "#78909c"); // right lit strip
  // turret head
  fillRect(g, 6, 5, 14, 7, "#78909c");
  fillRect(g, 6, 5, 14, 2, "#90a4ae"); // top lid
  fillRect(g, 6, 5, 3, 7, "#455a64");
  // twin barrels
  line(g, 16, 6, 23, 2, "#263238");
  line(g, 16, 9, 24, 5, "#263238");
  px(g, 23, 2, frame === 0 ? "#eceff1" : "#90a4ae");
  px(g, 24, 5, frame === 0 ? "#90a4ae" : "#eceff1");
  px(g, 10, 13, frame === 0 ? "#4fc3f7" : "#1e5a75");
  return (() => {
    shadeAuto(g, base, "#78909c", "#37474f");
    outlineAuto(g);
    return g;
  })();
}

/** Missile Battery: pedestal + extruded rack + 4 tubes */
function missileSprite(frame: number): Grid {
  const base = "#455a64";
  const g = makeGrid(28, 26);
  buildingPad(g, 14, 23, 10, 2.6);
  // pedestal block
  fillRect(g, 7, 16, 14, 6, "#2c3a45");
  fillRect(g, 7, 15, 14, 2, base);
  // tilted rack body
  fillTriangle(g, 4, 16, 17, 3, 22, 9, base);
  fillTriangle(g, 4, 16, 22, 9, 10, 19, "#2c3a45");
  // tubes
  const tip = frame === 0 ? "#ef5350" : "#ff8a80";
  for (const [tx, ty] of [
    [10, 11],
    [13, 8],
    [13, 13],
    [16, 10],
  ] as const) {
    fillEllipse(g, tx, ty, 1.6, 1.2, "#1c262b");
    px(g, tx + 1, ty - 0.5, tip);
  }
  return (() => {
    shadeAuto(g, base, "#607d8b", "#2c3a45");
    outlineAuto(g);
    return g;
  })();
}

/** Bunker / Garrison: extruded pillbox + sandbags + slit */
function bunkerSprite(frame: number): Grid {
  const base = "#5d4037";
  const g = makeGrid(32, 22);
  buildingPad(g, 16, 19.5, 13, 2.8);
  // south face (darker)
  fillTriangle(g, 3, 16, 8, 6, 24, 6, "#3e2723");
  fillTriangle(g, 3, 16, 24, 6, 29, 16, "#3e2723");
  // top face (lighter)
  fillTriangle(g, 8, 6, 16, 3, 24, 6, base);
  fillRect(g, 8, 6, 16, 4, "#6d4c41");
  // roof ridge
  fillRect(g, 8, 5, 16, 2, "#4e342e");
  // firing slit + barrel
  fillRect(g, 10, 9, 12, 3, "#191210");
  line(g, 16, 10, frame === 0 ? 23 : 22, 10, "#263238");
  // sandbags along base
  for (let i = 0; i < 6; i++) {
    fillEllipse(g, 5 + i * 4, 17.5, 2.3, 1.5, "#a1887f");
  }
  return (() => {
    shadeAuto(g, base, "#8d6e63", "#3e2723");
    outlineAuto(g);
    return g;
  })();
}

/** Artillery platform: outriggers, hull volume, long barrel */
function tankSprite(frame: number): Grid {
  const base = "#37474f";
  const g = makeGrid(32, 26);
  buildingPad(g, 15, 22.5, 12, 2.8);
  // outriggers
  line(g, 7, 15, 2, 22, "#263238");
  line(g, 23, 15, 28, 22, "#263238");
  fillEllipse(g, 4, 22, 2, 1, "#263238");
  fillEllipse(g, 26, 22, 2, 1, "#263238");
  // hull (darker lower + lit top)
  fillEllipse(g, 15, 16, 11, 5, "#263238");
  fillEllipse(g, 15, 14, 10, 4, base);
  fillEllipse(g, 14, 12.5, 6, 2.5, "#546e7a");
  // turret + barrel
  fillEllipse(g, 13, 10, 4.5, 3, "#546e7a");
  line(g, 15, 9, 27, 3, "#ff8a65");
  fillRect(g, 26, 1.5, 3, 3, "#ff8a65");
  px(g, 6, 13, frame === 0 ? "#ffcc80" : "#8d5524");
  return (() => {
    shadeAuto(g, base, "#546e7a", "#22303a");
    outlineAuto(g);
    return g;
  })();
}

/** Mining facility: drill rig + crystal hopper */
function siloSprite(frame: number): Grid {
  const base = "#f9a825";
  const g = makeGrid(30, 28);
  buildingPad(g, 15, 25, 12, 2.8);
  // hopper body
  fillRect(g, 5, 12, 12, 11, "#c17900");
  fillRect(g, 5, 11, 12, 5, base);
  fillEllipse(g, 11, 11, 6, 2.2, "#ffd54f");
  // drill tower
  fillRect(g, 18, 6, 6, 17, "#546e7a");
  fillRect(g, 18, 6, 6, 3, "#90a4ae");
  // rotating bit
  const bitY = frame === 0 ? 22 : 23;
  fillRect(g, 19, bitY, 4, 3, "#37474f");
  px(g, 21, bitY + 3, "#4dd0e1");
  // crystal glow in hopper
  px(g, 9, frame === 0 ? 14 : 13, "#4dd0e1");
  px(g, 12, frame === 0 ? 15 : 14, "#80deea");
  line(g, 17, 14, 18, 14, "#90a4ae");
  return (() => {
    shadeAuto(g, base, "#ffd54f", "#c17900");
    outlineAuto(g);
    return g;
  })();
}

/** Sniper Tower: tripod, compact body, long barrel + scope */
function sniperSprite(frame: number): Grid {
  const base = "#37474f";
  const g = makeGrid(34, 24);
  buildingPad(g, 15, 21.5, 10, 2.4);
  line(g, 6, 21, 12, 12, base);
  line(g, 24, 21, 18, 12, base);
  line(g, 15, 22, 15, 12, base);
  fillRect(g, 10, 7, 11, 7, base);
  fillRect(g, 10, 7, 3, 7, "#1c262b");
  fillRect(g, 18, 7, 3, 7, "#546e7a");
  fillEllipse(g, 15.5, 7, 5.5, 2.8, "#546e7a");
  line(g, 19, 7, 31, 3, "#1a2226");
  line(g, 19, 9, 30, 5, "#1a2226");
  px(g, 31, 3, "#eceff1");
  fillRect(g, 21, 4.5, 3.5, 2, "#263238");
  px(g, 22.5, 5.2, frame === 0 ? "#4dd0e1" : "#1a5f66");
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
  silo: siloSprite,
  sniper: sniperSprite,
};

/* ---------------- CD-6 combat FX (projectiles + muzzle) ---------------- */

/** Small hitscan tracer / default player bolt. */
function fxBullet(_frame: number): Grid {
  const g = makeGrid(10, 6);
  fillRect(g, 1, 2, 7, 2, "#ffe082");
  fillRect(g, 7, 1, 2, 4, "#fff8e1");
  px(g, 9, 2, "#ffffff");
  px(g, 9, 3, "#ffffff");
  outlineAuto(g);
  return g;
}

/** Artillery shell — stubby oval with band. */
function fxShell(_frame: number): Grid {
  const g = makeGrid(14, 8);
  fillEllipse(g, 7, 4, 6, 3, "#8d6e63");
  fillEllipse(g, 7, 3.5, 5, 2.2, "#bcaaa4");
  fillRect(g, 4, 2, 2, 4, "#5d4037");
  fillEllipse(g, 11, 4, 2, 2, "#ef6c00");
  outlineAuto(g);
  return g;
}

/** Missile — body + fins + warhead tip. */
function fxMissile(_frame: number): Grid {
  const g = makeGrid(18, 8);
  fillRect(g, 2, 2, 12, 4, "#546e7a");
  fillRect(g, 2, 2, 12, 1, "#90a4ae");
  fillTriangle(g, 14, 1, 17, 4, 14, 7, "#ef5350");
  fillTriangle(g, 2, 1, 5, 2, 2, 3, "#37474f");
  fillTriangle(g, 2, 5, 5, 6, 2, 7, "#37474f");
  px(g, 8, 3, "#ff8a65");
  outlineAuto(g);
  return g;
}

/** Enemy energy bolt — round glow. */
function fxBolt(frame: number): Grid {
  const g = makeGrid(10, 10);
  const core = frame === 0 ? "#ff8a65" : "#ffab91";
  fillEllipse(g, 5, 5, 4, 4, "#bf360c");
  fillEllipse(g, 5, 5, 2.8, 2.8, core);
  fillEllipse(g, 4.5, 4.5, 1.2, 1.2, "#fff3e0");
  outlineAuto(g);
  return g;
}

/** Muzzle flash bloom — two frames for a short pop. */
function fxMuzzle(frame: number): Grid {
  const g = makeGrid(12, 12);
  const r = frame === 0 ? 5 : 3.5;
  fillEllipse(g, 6, 6, r, r * 0.7, "#ff6f00");
  fillEllipse(g, 6, 6, r * 0.65, r * 0.45, "#ffeb3b");
  fillEllipse(g, 6, 6, r * 0.3, r * 0.25, "#ffffff");
  // radial spikes
  if (frame === 0) {
    px(g, 6, 1, "#ffeb3b");
    px(g, 6, 10, "#ffeb3b");
    px(g, 1, 6, "#ffeb3b");
    px(g, 10, 6, "#ffeb3b");
    px(g, 2, 2, "#ff8f00");
    px(g, 10, 2, "#ff8f00");
    px(g, 2, 10, "#ff8f00");
    px(g, 10, 10, "#ff8f00");
  }
  return g;
}

const FX_BUILDERS: Record<string, Builder> = {
  bullet: fxBullet,
  shell: fxShell,
  missile: fxMissile,
  bolt: fxBolt,
  muzzle: fxMuzzle,
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
}

interface BakedGrid {
  key: string;
  grid: Grid;
  flash: boolean;
}

/** Collect every atlas key + pixel grid (no DOM). Shared by buildAtlas and
 *  tools/export-atlas.mjs for the Godot port. */
function collectBakedGrids(): BakedGrid[] {
  const baked: BakedGrid[] = [];
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
  for (const [id, build] of Object.entries(FX_BUILDERS)) {
    for (const frame of [0, 1]) {
      baked.push({ key: `fx:${id}:${frame}`, grid: build(frame), flash: false });
    }
  }
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
  HERO_SHEET_DIRS.forEach((frame, d) => {
    const grid: Grid = { w: frame.w, h: frame.h, data: frame.data };
    baked.push({ key: `hero:d${d}`, grid, flash: false });
    baked.push({ key: `hero:d${d}:flash`, grid, flash: true });
  });
  // Walk / stand_atk / walk_atk cycles (east-facing; renderer flips for west).
  for (const [name, frames] of Object.entries(HERO_ANIMS)) {
    frames.forEach((frame, i) => {
      const grid: Grid = { w: frame.w, h: frame.h, data: frame.data };
      baked.push({ key: `hero:${name}:${i}`, grid, flash: false });
      baked.push({ key: `hero:${name}:${i}:flash`, grid, flash: true });
    });
  }
  return baked;
}

function parseHexColor(c: string): [number, number, number] {
  const hex = c.startsWith("#") ? c.slice(1) : c;
  if (hex.length === 3) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    return [r, g, b];
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}

/** One packed atlas sheet as raw RGBA + frame dictionary (DOM-free). */
export interface PackedAtlasData {
  width: number;
  height: number;
  /** Row-major RGBA, length width*height*4 */
  pixels: Uint8ClampedArray;
  frames: Record<
    string,
    { sx: number; sy: number; sw: number; sh: number; ax: number; ay: number }
  >;
  pixelScale: number;
}

/**
 * Pack every sprite into one RGBA sheet. Used by the browser Renderer and
 * by tools/export-atlas.mjs for Godot (no canvas required).
 */
export function packAtlasData(): PackedAtlasData {
  const baked = collectBakedGrids();
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
  const pixels = new Uint8ClampedArray(atlasW * atlasH * 4);
  const frames: PackedAtlasData["frames"] = {};

  baked.forEach((b, i) => {
    const at = places[i]!;
    const { grid } = b;
    for (let gy = 0; gy < grid.h; gy++) {
      for (let gx = 0; gx < grid.w; gx++) {
        const c = grid.data[gy * grid.w + gx];
        if (!c) continue;
        const [r, g, bl] = b.flash ? [244, 248, 255] : parseHexColor(c);
        for (let py = 0; py < PIXEL_SCALE; py++) {
          for (let px = 0; px < PIXEL_SCALE; px++) {
            const sx = at.x + gx * PIXEL_SCALE + px;
            const sy = at.y + gy * PIXEL_SCALE + py;
            const o = (sy * atlasW + sx) * 4;
            pixels[o] = r;
            pixels[o + 1] = g;
            pixels[o + 2] = bl;
            pixels[o + 3] = 255;
          }
        }
      }
    }
    frames[b.key] = {
      sx: at.x,
      sy: at.y,
      sw: grid.w * PIXEL_SCALE,
      sh: grid.h * PIXEL_SCALE,
      ax: (grid.w * PIXEL_SCALE) / 2,
      ay: (grid.h * PIXEL_SCALE) / 2,
    };
  });

  return { width: atlasW, height: atlasH, pixels, frames, pixelScale: PIXEL_SCALE };
}

/**
 * Bake every sprite into one atlas canvas (browser).
 * Keys: enemies "<enemyId>:<frame>" (+ ":flash" variants),
 * garrison units "unit:<unitId>:<frame>" (+ ":flash" variants),
 * buildings "bld:<shape>:<frame>", terrain "rock:s|m|l:0" / "crystal:s|m:0",
 * combat FX "fx:<bullet|shell|missile|bolt|muzzle>:<frame>" (CD-6).
 */
export function buildAtlas(): SpriteAtlas {
  const packed = packAtlasData();
  const canvas = document.createElement("canvas");
  canvas.width = packed.width;
  canvas.height = packed.height;
  const ctx = canvas.getContext("2d")!;
  // Copy into a fresh ImageData buffer (TS/DOM ImageDataArray typing).
  const imageData = ctx.createImageData(packed.width, packed.height);
  imageData.data.set(packed.pixels);
  ctx.putImageData(imageData, 0, 0);

  const frames = new Map<string, SpriteFrame>();
  for (const [key, f] of Object.entries(packed.frames)) {
    frames.set(key, f);
  }
  return new SpriteAtlas(canvas, frames);
}
