import rawEnemies from "./enemies.json";

export type EnemyArchetype =
  | "raider"
  | "brute"
  | "swarm"
  | "siege"
  | "flyer"
  | "boss"
  | "ranged";

export interface EnemyDef {
  id: string;
  name: string;
  archetype: EnemyArchetype;
  maxHp: number;
  speed: number;
  damage: number; // melee: dmg/s on contact. Ranged (attackRange set): dmg PER SHOT.
  reward: number;
  radius: number;
  color: string;
  accent: string;
  armor: number; // flat damage reduction
  /** Standoff range in px. Absent/0 = melee (engages at radius+28/+40, see
   *  Game.resolveEnemyContact). When set, the enemy stops at this range and
   *  fires projectiles at buildings instead of contact damage. */
  attackRange?: number;
  /** Shots per second, only meaningful when attackRange is set. */
  attackRate?: number;
}

// Definitions live in enemies.json so other engines can load the same data.
export const ENEMIES = rawEnemies as unknown as Record<string, EnemyDef>;

export function getEnemy(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}
