import { countResourcesNear, type LevelDef, type ResourceKind } from "./levels";
import { TUNING } from "./tuning";
import rawBuildings from "./buildings.json";

export type BuildingCategory = "defense" | "production" | "support";

/** "all" hits flyers and ground units; "ground" cannot target flyers at all
 *  (see docs/design-counterplay-pass.md — the air lane); "air" is the
 *  mirror image — flak batteries that can ONLY hit flyers and are unable
 *  to target anything on the ground (docs/design-roster-redesign.md). */
export type TargetMode = "all" | "ground" | "air";

/**
 * Multipliers layered on top of level-scaled stats (see `scaledStats`) —
 * e.g. `fireRate: 1.35` means "35% faster than this would otherwise be at
 * this level", not an absolute value. `incomePerDay` is deliberately NOT a
 * key here (D8, docs/design-wave-legibility.md §7c): no branch pick, local
 * or global, may ever touch income — economy-wide income multipliers are
 * deliberately unrepresentable (they tend to become must-pick traps).
 */
export type StatMods = Partial<
  Record<"damage" | "range" | "fireRate" | "splashRadius" | "maxHp", number>
>;

/**
 * One branch choice offered at `BuildingDef.branch.atLevel`. `mods` are
 * MULTIPLIERS applied on top of the normal level-scaled stats (see
 * `scaledStats`) — e.g. `fireRate: 1.35` means "35% faster than this
 * building would otherwise be at this level", not an absolute value.
 * Optional `squad` overrides the building's default garrison when branched.
 */
export interface BranchOption {
  id: string;
  name: string;
  blurb: string;
  mods?: StatMods;
  squad?: { unitId: string; countByLevel: number[] };
  /** Non-numeric qualifier appended after the chip's DERIVED numeric text
   *  (see `formatBranchBlurb`) — e.g. "all structures & squads". Kept
   *  separate from `blurb` so the numeric portion is computed mechanically
   *  from `mods` and can never drift from the data it describes (CD-37's
   *  lesson, applied to chip text). Only options that set BOTH `mods` and
   *  `scope` get the derived treatment; options without `scope` (e.g. a
   *  squad-swap branch with no stat mods to derive from) fall back to
   *  `blurb` verbatim, unchanged from before this field existed. */
  scope?: string;
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
  /** Per-level upgrade cost overrides, index = currentLevel - 1 (cost to go
   *  FROM that level to the next). When present, `upgradeCost()` reads this
   *  instead of the `cost * upgradeCostMult * level` formula — needed for
   *  any def with `cost: 0` (the Command Post: it's placed automatically,
   *  never bought, so the formula would make every upgrade free). A
   *  validate.ts assert enforces that any def with `maxLevel > 1` has a
   *  real upgrade cost one way or the other. */
  upgradeCosts?: number[];
  /** Visual */
  color: string;
  accent: string;
  size: number;
  shape: "tower" | "bunker" | "tank" | "silo" | "missile" | "hq" | "sniper";
  /** Which enemies this building's weapon can target. Loader defaults to "all"
   *  when absent from JSON, so existing data keeps working unchanged. */
  targets: TargetMode;
  /** A one-time fork offered when upgrading to `atLevel` (see
   *  docs/design-roster-redesign.md D4). Absent = building never branches.
   *  `global: true` (docs/design-wave-legibility.md §7c) marks a branch
   *  whose `mods` apply to EVERY building/squad via globalStatMods,
   *  not just this building's own stats — `scaledStats` skips the normal
   *  branchId-driven local-mods lookup for a global branch so the owning
   *  building doesn't double-apply its own pick. */
  branch?: { atLevel: number; options: BranchOption[]; global?: boolean };
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
  /** At most one built per level (D9). Typed now; no def sets it yet — CD-31
   *  is the first expected consumer. */
  unique?: boolean;
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
 *  resource's radius/cap — today only `mining_facility` claims "mineral";
 *  no def claims "plasma" since CD-54 deleted `plasma_tap` (Plasma Well
 *  obstacles are now decorative terrain, like rocks). Centralizing the
 *  lookup here means Game.loadLevel and validate.ts derive identical node
 *  counts from the same source instead of two hand-synced copies. */
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
  const override = def.upgradeCosts?.[currentLevel - 1];
  if (override !== undefined) return override;
  return Math.round(def.cost * def.upgradeCostMult * currentLevel);
}

/** Sell (CD-24) refunds this fraction of a building's total invested credits.
 *  Value lives in `tuning.json` so the Godot port loads it rather than
 *  transcribing it (CD-51); re-exported here so existing call sites don't move. */
export const SELL_REFUND = TUNING.economy.sellRefund;

function applyMods(
  stats: { maxHp: number; damage: number; range: number; fireRate: number; splashRadius: number },
  mods: StatMods | null | undefined,
): void {
  if (!mods) return;
  if (mods.maxHp) stats.maxHp *= mods.maxHp;
  if (mods.damage) stats.damage *= mods.damage;
  if (mods.range) stats.range *= mods.range;
  if (mods.fireRate) stats.fireRate *= mods.fireRate;
  if (mods.splashRadius) stats.splashRadius *= mods.splashRadius;
}

/**
 * Stats scale with level: +20% damage/income, +15% hp/range per level above
 * 1; a branch pick (if any) then multiplies its `mods` on top of that; the
 * optional `mods` param (globalStatMods — docs/design-wave-legibility.md
 * §7c) layers a further multiplier on top of THAT, for every building, not
 * just the one that earned the pick. A `def.branch.global` branch's own
 * `branchId` mods are skipped here on purpose (see the `branch` field's
 * doc comment) — they arrive through the `mods` param instead, applied
 * uniformly like every other building's, so the picking building doesn't
 * double-count its own choice.
 *
 * This is the single stats-resolution seam for the whole game — every call
 * site that needs a building's live stats goes through here. CD-30 mutators
 * are expected to layer in as further multipliers on the same result, not
 * as parallel ad-hoc math elsewhere.
 */
export function scaledStats(
  def: BuildingDef,
  level: number,
  branchId?: string | null,
  mods?: StatMods,
) {
  const l = Math.max(1, level);
  const s = TUNING.levelScaling;
  const dmgMul = 1 + (l - 1) * s.damagePerLevel;
  const hpMul = 1 + (l - 1) * s.maxHpPerLevel;
  const rangeMul = 1 + (l - 1) * s.rangePerLevel;
  const rateMul = 1 + (l - 1) * s.fireRatePerLevel;
  const incomeMul = 1 + (l - 1) * s.incomePerLevel;

  const stats = {
    maxHp: def.maxHp * hpMul,
    damage: def.damage * dmgMul,
    range: def.range * rangeMul,
    fireRate: def.fireRate * rateMul,
    splashRadius: def.splashRadius * (1 + (l - 1) * s.splashRadiusPerLevel),
    incomePerDay: def.incomePerDay * incomeMul,
  };

  const branchMods =
    branchId && !def.branch?.global
      ? def.branch?.options.find((o) => o.id === branchId)?.mods
      : null;
  applyMods(stats, branchMods);
  applyMods(stats, mods);

  return {
    maxHp: Math.round(stats.maxHp),
    damage: Math.round(stats.damage),
    range: Math.round(stats.range),
    fireRate: stats.fireRate,
    splashRadius: stats.splashRadius,
    incomePerDay: stats.incomePerDay,
  };
}

const STAT_LABELS: Record<keyof StatMods, string> = {
  damage: "damage",
  fireRate: "fire rate",
  range: "range",
  splashRadius: "splash radius",
  maxHp: "max HP",
};
const STAT_ORDER: (keyof StatMods)[] = ["damage", "fireRate", "range", "splashRadius", "maxHp"];

/**
 * Mechanical "+8% damage" / "-15% max HP" strings derived from a StatMods
 * multiplier set — the shared primitive behind `formatBranchBlurb` and
 * CD-30's perk/mutator chip text (`formatPerkBlurb`/`formatMutatorBlurb` in
 * `perks.ts`/`mutators.ts`). Numbers on the chip face can never drift from
 * the data they describe (UI_PLAN 6, CD-37's lesson) because nothing hand-
 * types a percentage anywhere. Handles both buffs (>1) and debuffs (<1,
 * e.g. Fragile Command's 0.85) — the sign falls out of the multiplier.
 */
export function describeStatMods(mods: StatMods | undefined): string[] {
  if (!mods) return [];
  return STAT_ORDER.filter((k) => mods[k] !== undefined).map((k) => {
    const pct = Math.round((mods[k]! - 1) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}% ${STAT_LABELS[k]}`;
  });
}

/**
 * Numbers-on-the-face chip text (UI_PLAN 6: no hover exists on
 * controller/mobile). When an option sets BOTH `mods` and `scope`, the
 * numeric portion is derived mechanically from `mods` here rather than
 * hand-typed in JSON, so it cannot drift from the data the pick actually
 * applies (docs/design-wave-legibility.md §7c, CD-37's lesson a third
 * time). Options without both fall back to `blurb` verbatim — e.g.
 * Garrison's Sniper Team, a squad swap with no `mods` to derive from.
 */
export function formatBranchBlurb(opt: BranchOption): string {
  if (!opt.mods || !opt.scope) return opt.blurb;
  const parts = describeStatMods(opt.mods);
  const numeric = parts.length === 2 ? parts.join(" and ") : parts.join(", ");
  return `${numeric} — ${opt.scope}`;
}
