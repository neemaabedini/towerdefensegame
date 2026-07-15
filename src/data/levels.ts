import rawLevels from "./levels.json";

export type SiteCategory = "defense" | "resource" | "any";
export type ResourceKind = "mineral" | "plasma";

export interface BuildSiteDef {
  id: string;
  x: number;
  y: number;
  category: SiteCategory;
  /** Building IDs authored for this site. See BuildSiteState.options
   *  (game/types.ts) for the requires-filtered EFFECTIVE list used at
   *  runtime — this raw list can include options a site doesn't actually
   *  qualify for yet (see validate.ts, which flags that as an authoring
   *  error rather than silently dropping it). */
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
  kind: "rock" | "crystal" | "plasma";
  /** How many resource "nodes" a single obstacle is worth — an art escape
   *  hatch (one fat crystal worth 2). Default 1; unused today (see
   *  docs/design-economy-rework.md D1). */
  yield?: number;
  /** Whether this obstacle blocks movement. Default true; read by the
   *  future CD-9 nav grid — unused until Phase 4 ships. */
  blocks?: boolean;
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

/**
 * Total resource "nodes" of `kind` within `radius` px of (x,y) — the pure
 * function the map's economy is derived from (docs/design-economy-rework.md
 * D1/D2a: "mineral field = a cluster of crystal obstacles"). Deterministic,
 * no RNG (C3); a Godot port reimplements this over the same JSON (~8 lines).
 */
export function countResourcesNear(
  level: LevelDef,
  x: number,
  y: number,
  kind: ResourceKind,
  radius: number,
): number {
  const obstacleKind = kind === "mineral" ? "crystal" : "plasma";
  let total = 0;
  for (const o of level.obstacles) {
    if (o.kind !== obstacleKind) continue;
    if (Math.hypot(o.x - x, o.y - y) <= radius) total += o.yield ?? 1;
  }
  return total;
}
