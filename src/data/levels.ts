import rawLevels from "./levels.json";

export type SiteCategory = "defense" | "production" | "any";

export interface BuildSiteDef {
  id: string;
  x: number;
  y: number;
  category: SiteCategory;
  /** Building IDs available at this site */
  options: string[];
}

export interface SpawnPointDef {
  id: string;
  x: number;
  y: number;
}

export interface ObstacleDef {
  x: number;
  y: number;
  /** Approximate footprint radius */
  r: number;
  kind: "rock" | "crystal";
}

export interface WaveEntry {
  enemyId: string;
  count: number;
  /** Delay before this group starts spawning (seconds into wave) */
  delay: number;
  /** Seconds between each unit in the group */
  interval: number;
  /** Optional spawn point id; cycles if omitted */
  spawnId?: string;
}

export interface WaveDef {
  entries: WaveEntry[];
  /** Bonus credits for clearing the wave */
  clearBonus: number;
}

export interface LevelDef {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  startingMoney: number;
  hq: { x: number; y: number };
  sites: BuildSiteDef[];
  spawns: SpawnPointDef[];
  /** Impassable terrain, purely visual — paths are routed around them */
  obstacles: ObstacleDef[];
  waves: WaveDef[];
  /** Path waypoints from each spawn to HQ (simple polyline per spawn index) */
  paths: Record<string, { x: number; y: number }[]>;
}

// Level data lives in levels.json so other engines can load the same data.
export const LEVELS = rawLevels as unknown as LevelDef[];

export function getLevel(index: number): LevelDef {
  return LEVELS[Math.min(index, LEVELS.length - 1)]!;
}
