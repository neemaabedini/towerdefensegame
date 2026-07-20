import type { TargetMode } from "./buildings";
import rawHero from "./hero.json";

/**
 * Hero commander definitions (docs/design-hero-commander.md §10). Same
 * loader pattern as units.ts/enemies.ts — data lives in hero.json so other
 * engines (a future Godot port) can load it unchanged. Keyed by id: each
 * def is a WEAPON loadout (CD-30 hero weapons, user-approved roster
 * 2026-07-16) — rifle (default) / scattergun / railgun / machine_pistols —
 * selected pre-level on the level-select screen. Unlock gating is
 * `unlockStars` vs total stars (CD-30 Slice 4).
 */
export interface HeroDef {
  id: string;
  name: string;
  /** Tradeoff line shown on the weapon picker (numbers-on-face, UI_PLAN 6) */
  blurb: string;
  maxHp: number;
  moveSpeed: number;
  damage: number; // instant-hit, per shot (same armor-free math as hurtUnit)
  fireRate: number; // shots per second
  range: number;
  targets: TargetMode;
  radius: number;
  /** Splash radius on hit (px) — scattergun-style area damage, routed
   *  through the same applyDamage path units/buildings use. Omit for
   *  single-target weapons. */
  splashRadius?: number;
  /** Ability ids this weapon can cast (CD-40) — see abilities.json. */
  abilities: string[];
  /** Death penalty seam (design §5). v1 ships atDawn-only (out for the
   *  rest of the current night, restored free at dawn); midWaveSeconds is
   *  an unused seam for a softer respawn-timer penalty later. */
  respawn: { atDawn: boolean; midWaveSeconds?: number };
  color: string;
  accent: string;
  /** Total-star gate (CD-30 Slice 4). Absent/0 = unlocked from a fresh
   *  save; the rifle is always 0. Thresholds are freeze-untuned data. */
  unlockStars?: number;
}

export const HEROES = rawHero as unknown as Record<string, HeroDef>;

export function getHero(id: string): HeroDef {
  const def = HEROES[id];
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}
