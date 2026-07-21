#!/usr/bin/env node
/**
 * Sanity-check exported atlas against data ids the Godot port draws.
 *   node tools/verify-atlas.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const atlas = JSON.parse(readFileSync(join(root, "godot/assets/sprites/atlas.json"), "utf8"));
const buildings = JSON.parse(readFileSync(join(root, "src/data/buildings.json"), "utf8"));
const enemies = JSON.parse(readFileSync(join(root, "src/data/enemies.json"), "utf8"));
const units = JSON.parse(readFileSync(join(root, "src/data/units.json"), "utf8"));

const keys = new Set(Object.keys(atlas.frames));
const missing = [];

for (const id of Object.keys(enemies)) {
  for (const f of [0, 1]) {
    const k = `${id}:${f}`;
    if (!keys.has(k)) missing.push(k);
  }
}
for (const def of Object.values(buildings)) {
  const shape = def.shape;
  if (!shape) continue;
  for (const f of [0, 1]) {
    const k = `bld:${shape}:${f}`;
    if (!keys.has(k)) missing.push(k);
  }
}
for (const id of Object.keys(units)) {
  for (const f of [0, 1]) {
    const k = `unit:${id}:${f}`;
    // sniper unit exists in atlas but may not be in units.json — only check data ids
    if (!keys.has(k)) missing.push(k);
  }
}
for (const d of [0, 1, 2, 3, 4, 5, 6, 7]) {
  if (!keys.has(`hero:d${d}`)) missing.push(`hero:d${d}`);
}
for (const fx of ["bullet", "shell", "missile", "bolt", "muzzle"]) {
  if (!keys.has(`fx:${fx}:0`)) missing.push(`fx:${fx}:0`);
}
for (const t of ["rock:s:0", "rock:m:0", "rock:l:0", "crystal:s:0", "crystal:m:0"]) {
  if (!keys.has(t)) missing.push(t);
}

if (missing.length) {
  console.error("verify-atlas: MISSING", missing);
  process.exitCode = 1;
} else {
  console.log(
    `verify-atlas: ok — ${keys.size} frames, ${atlas.width}×${atlas.height}, covers all enemy/building/unit/hero/fx/terrain keys`,
  );
}
