#!/usr/bin/env node
/**
 * Export the web sprite atlas (src/render/sprites.ts) to Godot assets.
 *
 * Writes:
 *   godot/assets/sprites/atlas.png   — packed sheet (nearest-neighbor)
 *   godot/assets/sprites/atlas.json  — frame rects + anchors
 *
 * Uses the same packAtlasData() builders the browser Renderer uses, so
 * Godot stays pixel-identical without maintaining a second art pipeline.
 *
 *   node tools/export-atlas.mjs
 *   npm run export-atlas
 */
import { createServer } from "vite";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "godot", "assets", "sprites");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encode raw RGBA (no premultiply) as PNG. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < stride; x++) {
      raw[rowStart + 1 + x] = rgba[y * stride + x];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const server = await createServer({
  root,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const mod = await server.ssrLoadModule("/src/render/sprites.ts");
  if (typeof mod.packAtlasData !== "function") {
    throw new Error("sprites.ts did not export packAtlasData");
  }
  const packed = mod.packAtlasData();
  const { width, height, pixels, frames, pixelScale } = packed;

  mkdirSync(outDir, { recursive: true });

  const png = encodePng(width, height, pixels);
  const pngPath = join(outDir, "atlas.png");
  writeFileSync(pngPath, png);

  const meta = {
    image: "atlas.png",
    width,
    height,
    pixelScale,
    frameCount: Object.keys(frames).length,
    frames,
  };
  const jsonPath = join(outDir, "atlas.json");
  writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

  console.log(`export-atlas: ${meta.frameCount} frames → ${width}×${height}`);
  console.log(`  ${pngPath}`);
  console.log(`  ${jsonPath}`);
} catch (err) {
  console.error("export-atlas failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}
