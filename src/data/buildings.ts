import { countResourcesNear, type LevelDef, type ResourceKind } from "./levels";
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

/** A mining-type building's placement gate + node math (docs/design-economy-
 *  rework.md D1/D3/D5). `incomePerDay` on the def means PER NODE when
 *  `mining` is present — see `deriveSiteResources` and `Game.previewIncome`/
 *  `collectDawnIncome`. */
export interface MiningSpec {
  resource: ResourceKind;
  /** px from the site */
  radius: number;
  /** Below this the option is filtered out of the site at loadLevel (D5) —
   *  a field too small to be worth building on is never offered. */
  minNodes: number;
  /** The income ceiling: node count is capped here regardless of how rich
   *  an author makes the field (R2 knob #1). */
  maxNodes: number;
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
  /** Credits paid as a lump sum at dawn after each cleared wave (production
   *  only). Means PER NODE when `mining` is present — see `mining` below. */
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
    | "sniper"
    | "tap";
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
  /** Placement gate + node math for a resource-extracting building (D1/D3).
   *  Absent = building never mines (pays incomePerDay flat, if at all). */
  mining?: MiningSpec;
  /** Filters this option out of a site's effective list at loadLevel unless
   *  the site has >= `min` of `resource` in range (D5) — this is what keeps
   *  a 1-node field from ever offering `mining_facility`. */
  requires?: { resource: ResourceKind; min: number };
  /** At most one built per level (D9). Typed now; no def sets it until the
   *  research facility ships — see TICKETS.md CD-7 (Step 4 is PARKED on
   *  ROADMAP Open Question 1). */
  unique?: boolean;
  /** This building hosts the research tree (Step 4 — PARKED, see above).
   *  Typed now so UpgradeChip's future early-return has a stable flag to
   *  check, rather than a fragile id-string comparison. */
  research?: boolean;
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

const RESOURCE_KINDS: readonly ResourceKind[] = ["mineral", "plasma"];

/** Whichever def's `mining.resource` matches `kind` is the authority on that
 *  resource's radius/cap — today that's exactly one def per kind
 *  (mining_facility/mineral, plasma_tap/plasma). Centralizing the lookup
 *  here means Game.loadLevel and validate.ts derive identical node counts
 *  from the same source instead of two hand-synced copies. */
function miningDefFor(kind: ResourceKind): BuildingDef | null {
  for (const def of Object.values(BUILDINGS)) {
    if (def.mining?.resource === kind) return def;
  }
  return null;
}

/**
 * A site's node count per resource kind, derived once at load (D1) and
 * capped at the owning mining def's maxNodes (R2 knob #1). Zero for a kind
 * no def mines yet — dormant until a `mining` def exists (Step 1 no-op).
 * Pure, no RNG (C3).
 */
export function deriveSiteResources(
  level: LevelDef,
  x: number,
  y: number,
): Record<ResourceKind, number> {
  const result = {} as Record<ResourceKind, number>;
  for (const kind of RESOURCE_KINDS) {
    const def = miningDefFor(kind);
    result[kind] = def?.mining
      ? Math.min(countResourcesNear(level, x, y, kind, def.mining.radius), def.mining.maxNodes)
      : 0;
  }
  return result;
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
