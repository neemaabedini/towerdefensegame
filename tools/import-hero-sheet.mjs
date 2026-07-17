#!/usr/bin/env node
/**
 * CD-32 art pipeline: import a sprite SHEET png into the game's atlas format.
 *
 *   node tools/import-hero-sheet.mjs <sheet.png> [--frames 0,1] [--height 16]
 *
 * - Decodes the PNG (dependency-free: zlib + the 5 standard filters; 8-bit
 *   RGBA/RGB, the formats every editor exports pixel art as).
 * - Auto-slices the sheet into cells using fully-transparent gutter rows/
 *   columns, trims each cell to its opaque bounding box.
 * - Picks the requested frame indices (default: 0,1 — the atlas convention
 *   is two idle frames per entity), nearest-neighbor scales them to the
 *   target GRID height (default 16 px; the atlas bakes grids at 2x, so 16
 *   grid px = 32 on-screen px — hero-sized against 12-16 px units).
 * - Emits src/render/heroSheet.generated.ts, which sprites.ts bakes into
 *   the atlas under keys hero:0 / hero:1 (+ :flash variants). If the file
 *   exports zero frames the renderer keeps its vector fallback — the
 *   standing per-entity-swap pipeline.
 *
 * Alpha handling: pixels with a<128 become transparent (null); everything
 * else is flattened to opaque #rrggbb (the Grid format has no alpha).
 */
import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node tools/import-hero-sheet.mjs <sheet.png> [--frames 0,1] [--height 16]");
  process.exit(1);
}
const srcPath = args[0];
const frameArg = (args.includes("--frames") ? args[args.indexOf("--frames") + 1] : "0,1")
  .split(",").map((n) => parseInt(n, 10));
const targetH = parseInt(args.includes("--height") ? args[args.indexOf("--height") + 1] : "16", 10);

// ---------- PNG decode ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let palette = null;
  let trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNGs unsupported — re-export without interlacing");
      if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} unsupported (8 only)`);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`color type ${colorType} unsupported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`unknown filter ${filter}`);
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (colorType === 6) {
        out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3];
      } else if (colorType === 2) {
        out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255;
      } else if (colorType === 3) {
        const idx = line[x];
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 4) {
        const v = line[x * 2];
        out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = line[x * 2 + 1];
      } else {
        const v = line[x];
        out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
      }
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

// ---------- slicing ----------
const opaqueAt = (img, x, y) => img.rgba[(y * img.w + x) * 4 + 3] >= 128;

function bands(count, isEmpty) {
  const out = [];
  let start = -1;
  for (let i = 0; i < count; i++) {
    if (!isEmpty(i)) { if (start === -1) start = i; }
    else if (start !== -1) { out.push([start, i - 1]); start = -1; }
  }
  if (start !== -1) out.push([start, count - 1]);
  return out;
}

function sliceSheet(img) {
  const rowEmpty = (y) => { for (let x = 0; x < img.w; x++) if (opaqueAt(img, x, y)) return false; return true; };
  const cells = [];
  for (const [y0, y1] of bands(img.h, rowEmpty)) {
    const colEmpty = (x) => { for (let y = y0; y <= y1; y++) if (opaqueAt(img, x, y)) return false; return true; };
    for (const [x0, x1] of bands(img.w, colEmpty)) {
      // trim to opaque bbox inside the cell
      let tx0 = x1, tx1 = x0, ty0 = y1, ty1 = y0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (opaqueAt(img, x, y)) {
          if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
          if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
        }
      }
      cells.push({ x: tx0, y: ty0, w: tx1 - tx0 + 1, h: ty1 - ty0 + 1 });
    }
  }
  return cells;
}

// ---------- scale + emit ----------
function cellToGrid(img, cell, gridH) {
  const scale = gridH / cell.h;
  const gridW = Math.max(1, Math.round(cell.w * scale));
  const data = new Array(gridW * gridH).fill(null);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const sx = cell.x + Math.min(cell.w - 1, Math.floor((gx + 0.5) / scale));
      const sy = cell.y + Math.min(cell.h - 1, Math.floor((gy + 0.5) / scale));
      const o = (sy * img.w + sx) * 4;
      if (img.rgba[o + 3] >= 128) {
        data[gy * gridW + gx] =
          "#" + [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]]
            .map((v) => v.toString(16).padStart(2, "0")).join("");
      }
    }
  }
  return { w: gridW, h: gridH, data };
}

const img = decodePng(readFileSync(srcPath));
const cells = sliceSheet(img);
if (cells.length === 0) throw new Error("no opaque cells found in the sheet");
console.log(`sheet ${img.w}x${img.h}: ${cells.length} cells → ${cells.map((c) => `${c.w}x${c.h}`).join(", ")}`);
const frames = frameArg.map((i) => {
  const cell = cells[i];
  if (!cell) throw new Error(`frame index ${i} out of range (0..${cells.length - 1})`);
  return cellToGrid(img, cell, targetH);
});

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "src", "render", "heroSheet.generated.ts");
writeFileSync(
  outPath,
  `// GENERATED by tools/import-hero-sheet.mjs — do not edit by hand.
// Source: ${srcPath.replace(/\\/g, "/")} · frames [${frameArg.join(",")}] · grid height ${targetH}
// Zero frames = renderer keeps its vector fallback (the per-entity-swap rule).
export interface HeroSheetFrame {
  w: number;
  h: number;
  data: (string | null)[];
}
export const HERO_SHEET_FRAMES: HeroSheetFrame[] = ${JSON.stringify(frames)};
`,
);
console.log(`wrote ${outPath} (${frames.length} frame(s), ${frames.map((f) => `${f.w}x${f.h}`).join(", ")})`);
