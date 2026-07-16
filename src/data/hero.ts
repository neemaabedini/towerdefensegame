import type { TargetMode } from "./buildings";
import rawHero from "./hero.json";

/**
 * Hero commander definitions (docs/design-hero-commander.md §10). Same
 * loader pattern as units.ts/enemies.ts — data lives in hero.json so other
 * engines (a future Godot port) can load it unchanged. Keyed by id (not a
 * single hardcoded shape) because CD-30's loadout selection wants to pick
 * among more than one hero later; v1 ships one default, "commander".
 */
export interface HeroDef {
  id: string;
  name: string;
  maxHp: number;
  moveSpeed: number;
  damage: number; // instant-hit, per shot (same armor-free math as hurtUnit)
  fireRate: number; // shots per second
  range: number;
  targets: TargetMode;
  radius: number;
  /** Ability ids this hero can cast — empty in Slice 1 (CD-29); CD-40
   *  Slice 2 adds abilities.json and starts populating this. */
  abilities: string[];
  /** Death penalty seam (design §5). v1 ships atDawn-only (out for the
   *  rest of the current night, restored free at dawn); midWaveSeconds is
   *  an unused seam for a softer respawn-timer penalty later. */
  respawn: { atDawn: boolean; midWaveSeconds?: number };
  color: string;
  accent: string;
}

export const HEROES = rawHero as unknown as Record<string, HeroDef>;

export function getHero(id: string): HeroDef {
  const def = HEROES[id];
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}
