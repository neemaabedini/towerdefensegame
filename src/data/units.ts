import type { TargetMode } from "./buildings";
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
