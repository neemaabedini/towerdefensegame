import type { StatMods, TargetMode } from "./buildings";
import rawUnits from "./units.json";

/**
 * Garrison squad member definitions (docs/design-roster-redesign.md). Same
 * loader pattern as enemies.ts — data lives in units.json so other engines
 * (e.g. a future Godot port) can load it unchanged.
 */
export interface UnitDef {
  id: string;
  name: string;
  maxHp: number;
  damage: number; // instant-hit, per shot (same armor math as buildings — see Game.hurtEnemy)
  fireRate: number; // shots per second
  range: number;
  targets: TargetMode;
  radius: number;
  moveSpeed: number;
  /** Max distance a unit will stray from its owning building's position (D5/D7) */
  leash: number;
  color: string;
  accent: string;
  kind: "ranged"; // "melee" reserved for a future Firebat
}

export const UNITS = rawUnits as unknown as Record<string, UnitDef>;

export function getUnit(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unknown unit: ${id}`);
  return def;
}

/**
 * `unitStats` is `scaledStats`'s counterpart for garrison squad members
 * (docs/design-wave-legibility.md §7c/§8) — units don't level independently
 * of their anchor building, so there's no level-scaling math here, just the
 * same global-mods multiplier applied to the def's base stats. Range/leash/
 * moveSpeed/radius/targets are untouched by any pick today (Weapons only
 * covers damage+fireRate, Plating only maxHp — D6/D8) so they're not part
 * of this shape; callers keep reading those straight off `UnitDef`.
 */
export function unitStats(def: UnitDef, mods?: StatMods) {
  let maxHp = def.maxHp;
  let damage = def.damage;
  let fireRate = def.fireRate;
  if (mods?.maxHp) maxHp *= mods.maxHp;
  if (mods?.damage) damage *= mods.damage;
  if (mods?.fireRate) fireRate *= mods.fireRate;
  return {
    maxHp: Math.round(maxHp),
    damage: Math.round(damage),
    fireRate,
  };
}
