import rawBuildings from "./buildings.json";

export type BuildingCategory = "defense" | "production" | "support";

/** "all" hits flyers and ground units; "ground" cannot target flyers at all
 *  (see docs/design-counterplay-pass.md — the air lane); "air" is the
 *  mirror image — flak batteries that can ONLY hit flyers and are unable
 *  to target anything on the ground (docs/design-roster-redesign.md). */
export type TargetMode = "all" | "ground" | "air";

/**
 * One branch choice offered at `BuildingDef.branch.atLevel`. `mods` are
 * MULTIPLIERS applied on top of the normal level-scaled stats (see
 * `scaledStats`) — e.g. `fireRate: 1.35` means "35% faster than this
 * building would otherwise be at this level", not an absolute value.
 * `squad` is unused until Batch 3 (garrison) but typed now per the design
 * doc's data model so both branch consumers share one shape.
 */
export interface BranchOption {
  id: string;
  name: string;
  blurb: string;
  mods?: Partial<
    Record<"damage" | "range" | "fireRate" | "splashRadius" | "maxHp", number>
  >;
  squad?: { unitId: string; countByLevel: number[] };
}

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  description: string;
  cost: number;
  /** Base stats at level 1 */
  maxHp: number;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  splashRadius: number;
  /** Credits paid as a lump sum at dawn after each cleared wave (production only) */
  incomePerDay: number;
  /** Max upgrade level (1 = no upgrades beyond base) */
  maxLevel: number;
  /** Cost multiplier per level: cost * level * upgradeCostMult */
  upgradeCostMult: number;
  /** Visual */
  color: string;
  accent: string;
  size: number;
  shape:
    | "tower"
    | "bunker"
    | "tank"
    | "factory"
    | "silo"
    | "missile"
    | "radar"
    | "hq"
    | "sniper";
  /** Which enemies this building's weapon can target. Loader defaults to "all"
   *  when absent from JSON, so existing data keeps working unchanged. */
  targets: TargetMode;
  /** A one-time fork offered when upgrading to `atLevel` (see
   *  docs/design-roster-redesign.md D4). Absent = building never branches. */
  branch?: { atLevel: number; options: BranchOption[] };
  /** Garrison squad (Batch 3): the unit fielded at each level, index = level-1.
   *  A branch option's own `squad` (if the building has branched) overrides
   *  this — see `Game.squadSpecFor`. Absent = building never fields units. */
  squad?: { unitId: string; countByLevel: number[] };
}

/** Shape of a buildings.json entry before the loader default is applied. */
type RawBuildingDef = Omit<BuildingDef, "targets"> & { targets?: TargetMode };

// Definitions live in buildings.json so other engines (e.g. a Godot port)
// can load the same data. See UI_PLAN.md.
const RAW_BUILDINGS = rawBuildings as unknown as Record<string, RawBuildingDef>;
export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(RAW_BUILDINGS).map(([id, d]) => [
    id,
    { ...d, targets: d.targets ?? "all" },
  ]),
);

export function getBuilding(id: string): BuildingDef {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`Unknown building: ${id}`);
  return def;
}

export function upgradeCost(def: BuildingDef, currentLevel: number): number {
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.round(def.cost * def.upgradeCostMult * currentLevel);
}

/** Sell (CD-24) refunds this fraction of a building's total invested credits */
export const SELL_REFUND = 0.6;

/**
 * Stats scale with level: +20% damage/income, +15% hp/range per level above
 * 1; a branch pick (if any) then multiplies its `mods` on top of that.
 *
 * This is the single stats-resolution seam for the whole game — every call
 * site that needs a building's live stats goes through here. Phase 2
 * research buffs and CD-30 mutators are expected to layer in as further
 * multipliers on the same result, not as parallel ad-hoc math elsewhere.
 */
export function scaledStats(def: BuildingDef, level: number, branchId?: string | null) {
  const l = Math.max(1, level);
  const dmgMul = 1 + (l - 1) * 0.22;
  const hpMul = 1 + (l - 1) * 0.18;
  const rangeMul = 1 + (l - 1) * 0.12;
  const rateMul = 1 + (l - 1) * 0.1;
  const incomeMul = 1 + (l - 1) * 0.35;

  const stats = {
    maxHp: def.maxHp * hpMul,
    damage: def.damage * dmgMul,
    range: def.range * rangeMul,
    fireRate: def.fireRate * rateMul,
    splashRadius: def.splashRadius * (1 + (l - 1) * 0.08),
    incomePerDay: def.incomePerDay * incomeMul,
  };

  const mods = branchId
    ? def.branch?.options.find((o) => o.id === branchId)?.mods
    : null;
  if (mods) {
    if (mods.maxHp) stats.maxHp *= mods.maxHp;
    if (mods.damage) stats.damage *= mods.damage;
    if (mods.range) stats.range *= mods.range;
    if (mods.fireRate) stats.fireRate *= mods.fireRate;
    if (mods.splashRadius) stats.splashRadius *= mods.splashRadius;
  }

  return {
    maxHp: Math.round(stats.maxHp),
    damage: Math.round(stats.damage),
    range: Math.round(stats.range),
    fireRate: stats.fireRate,
    splashRadius: stats.splashRadius,
    incomePerDay: stats.incomePerDay,
  };
}
