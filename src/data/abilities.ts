import rawAbilities from "./abilities.json";

/**
 * Commander ability defs (CD-40). Data lives in abilities.json so a Godot
 * port loads the same files. Each weapon in hero.json references ability
 * ids; Sensor Pulse was cancelled — actives are weapon-specific.
 */
export type AbilityTargeting = "self" | "point";

export type AbilityEffect =
  | { kind: "slow"; slowSeconds: number }
  | { kind: "damage"; damage: number }
  | { kind: "damage_and_slow"; damage: number; slowSeconds: number }
  /** Highest-armor (then highest-HP) enemy in radius — railgun active. */
  | { kind: "damage_single"; damage: number }
  /** Only flyer-archetype enemies in radius — machine-pistols active. */
  | { kind: "damage_air"; damage: number };

export interface AbilityDef {
  id: string;
  name: string;
  blurb: string;
  targeting: AbilityTargeting;
  cooldown: number;
  radius: number;
  effect: AbilityEffect;
}

export const ABILITIES = rawAbilities as unknown as Record<string, AbilityDef>;

export function getAbility(id: string): AbilityDef {
  const def = ABILITIES[id];
  if (!def) throw new Error(`Unknown ability: ${id}`);
  return def;
}
