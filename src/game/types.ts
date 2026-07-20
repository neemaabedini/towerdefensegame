import type { BuildingDef, StatMods, TargetMode } from "../data/buildings";
import type { BuildSiteDef, LevelDef, ResourceKind } from "../data/levels";

export type Phase = "day" | "night" | "victory" | "defeat";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlacedBuilding {
  id: string;
  siteId: string;
  defId: string;
  level: number;
  /** Branch chosen at def.branch.atLevel, or null if not yet branched (or
   *  the def doesn't branch). Cleared if an undo/revert drops the level
   *  back below atLevel. */
  branchId: string | null;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  cooldown: number;
  isHq: boolean;
  /** Total credits sunk into this building (build cost + every upgrade paid), across its life */
  invested: number;
  /** Credits spent on it during the CURRENT day phase; cleared at startNight() */
  spentToday: number;
  /** Upgrade levels bought during the CURRENT day phase; cleared at startNight() */
  levelsToday: number;
  /** True if this building was placed (not just upgraded) during the CURRENT day phase */
  builtToday: boolean;
  /** Radians, screen-y-down: where the barrel points (CD-6). Presentation —
   *  updated when a target is in range; does not affect damage math. */
  aimAngle: number;
  /** Seconds of muzzle flash remaining after fire (CD-6). 0 = none. */
  muzzleFlash: number;
}

/**
 * A single squad member fielded by a garrison building (Batch 3, see
 * docs/design-roster-redesign.md D5-D7). Anchored to its building — units
 * never exist without one and always read the anchor's LIVE position
 * (D7: never cache it, so a future mobile anchor like the hero escort
 * (CD-29) plugs in without touching this shape).
 */
export interface GarrisonUnit {
  id: string;
  unitDefId: string;
  buildingId: string;
  x: number;
  y: number;
  /** Deterministic home slot index within the squad (no Math.random — CD-20) */
  slot: number;
  hp: number;
  maxHp: number;
  /** Seconds until this unit's weapon can fire again */
  cooldown: number;
  /** Seconds remaining of white hit-flash after taking damage */
  hitTimer: number;
}

/**
 * The hero commander (docs/design-hero-commander.md, CD-29). WASD-driven in
 * BOTH phases — day movement is pre-positioning before the next wave
 * (2026-07-16 revision); combat/body-block only matter at night since
 * enemies only exist then. Dies → out until dawn; a living hero heals in
 * place at dawn and keeps its position.
 */
export interface HeroState {
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Always true while a level is active (kept for the snapshot contract;
   *  pre-day-positioning it distinguished the day park). */
  deployed: boolean;
  facing: 1 | -1;
  /** 8-way facing octant (0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE, screen-y
   *  down) — derived from the last nonzero move vector, drives the
   *  8-direction sprite set. Starts at 2 (facing the camera). */
  dir: number;
  /** Seconds until the hero's auto-attack can fire again */
  cooldown: number;
  /**
   * Ability id → remaining cooldown seconds (CD-40). Missing keys mean
   * ready. Cloned on snapshot with the rest of HeroState.
   */
  abilityCooldowns: Record<string, number>;
}

export interface EnemyUnit {
  id: string;
  defId: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  path: Vec2[];
  pathIndex: number;
  slowTimer: number;
  /** True while attacking a building this frame; recomputed each tick */
  engaged: boolean;
  /** Seconds remaining of white hit-flash after taking damage */
  hitTimer: number;
  /** Seconds until this ranged enemy (def.attackRange > 0) can fire again */
  attackCooldown: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  damage: number;
  splash: number;
  speed: number;
  color: string;
  /** If set, follow enemy until impact (player projectiles only) */
  targetId: string | null;
  alive: boolean;
  /** Who fired it — determines impact behavior (hurt enemy vs hurt building) */
  faction: "player" | "enemy";
  /** Player projectiles: which enemies this weapon can hit (from firing
   *  building's `targets`); irrelevant for enemy-faction projectiles, which
   *  always resolve against a locked building instead. */
  targets: TargetMode;
  /** Enemy projectiles: the building this shot is locked onto (buildings are
   *  static, so no homing — just a fizzle check if the building dies first) */
  targetBuildingId?: string | null;
  /** Enemy projectiles targeting a garrison unit instead (D6 contact-priority
   *  insert): units move, so this homes like player projectiles do, and
   *  fizzles if the unit is dead on impact. Resolved BEFORE targetBuildingId
   *  in resolveEnemyProjectileImpact. */
  targetUnitId?: string | null;
  /** Enemy projectiles targeting the hero instead of a garrison unit (CD-29
   *  Slice 1 extension of the same D6 contact-priority insert — the hero is
   *  a blocker candidate exactly like a unit). Homes on the hero's live
   *  position; fizzles if the hero died before impact. Mutually exclusive
   *  with targetUnitId (nearestLivingBlocker returns at most one). */
  targetHero?: boolean;
  /** Atlas projectile style (CD-6). Presentation only — no sim effect. */
  style?: "bullet" | "shell" | "missile" | "bolt";
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface BuildSiteState extends BuildSiteDef {
  buildingId: string | null;
  /** Derived once at loadLevel from `obstacles` (docs/design-economy-rework
   *  .md D1), never mutated after — safe to expose by reference from
   *  getSnapshot() (unlike research's `purchased`, this has no CD-15 bite).
   *  `options` (inherited from BuildSiteDef) is overwritten with the
   *  requires-filtered EFFECTIVE list at loadLevel — see D5. */
  resources: Record<ResourceKind, number>;
}

/** A building destroyed during the current night; rebuilt free at dawn */
export interface WreckState {
  siteId: string;
  defId: string;
  level: number;
  /** Branch chosen before destruction — dawn rebuild restores it */
  branchId: string | null;
  x: number;
  y: number;
  /** Total invested carried over from the destroyed building so a dawn rebuild preserves sell value */
  invested: number;
}

export interface GameSnapshot {
  level: LevelDef;
  levelIndex: number;
  phase: Phase;
  money: number;
  waveIndex: number;
  totalWaves: number;
  sites: BuildSiteState[];
  buildings: PlacedBuilding[];
  wrecks: WreckState[];
  enemies: EnemyUnit[];
  units: GarrisonUnit[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  particles: Particle[];
  selectedSiteId: string | null;
  selectedBuildingId: string | null;
  waveActive: boolean;
  enemiesRemainingToSpawn: number;
  /** Spawn points that will emit (day: next wave) or still have pending units (night) */
  upcomingSpawnIds: string[];
  /** Enemy counts per spawn id, matching upcomingSpawnIds */
  upcomingSpawnCounts: Record<string, number>;
  dayTime: number;
  nightTime: number;
  hqId: string;
  /** Shallow-cloned per snapshot (the CD-15 rule for NEW fields — the
   *  legacy arrays above stay live-ref until that cleanup). Never null
   *  after boot — drivable day and night; starts each level at the HQ. */
  hero: HeroState | null;
  /**
   * Active global stat multipliers (perks + CC global branch + mutator mods).
   * Cloned so render can resolve combat-accurate ranges without importing Game
   * (CD-59). Empty object when nothing is active.
   */
  globalStatMods: StatMods;
  /**
   * Pre-buy range ghost at the selected empty site (CD-58). Null when no
   * site is selected or the previewed option has no weapon range.
   */
  rangePreview: { x: number; y: number; range: number } | null;
}

export interface BuildingRuntime extends BuildingDef {
  // resolved at use site via scaledStats
}

/**
 * Sim vocabulary emitted by `Game.onEvent` (see design-demo-milestone.md
 * Problem 5). Game never imports audio — this is a plain semantic event
 * stream that any consumer (audio bindings, screen shake, replay logging,
 * a future announcer) can subscribe to independently.
 */
export type GameEvent =
  | { type: "weaponFired"; defId: string }
  | { type: "enemyFired"; defId: string }
  | { type: "enemyDied"; defId: string }
  | { type: "unitFired"; unitDefId: string }
  | { type: "unitDied"; unitDefId: string }
  | { type: "heroDied" }
  | { type: "heroRespawned" }
  | { type: "abilityCast"; abilityId: string }
  | { type: "buildingDestroyed"; defId: string }
  | { type: "waveStarted"; waveIndex: number }
  | { type: "dawn" }
  | { type: "victory" }
  | { type: "defeat" }
  | { type: "built" }
  | { type: "upgraded" }
  | { type: "sold" }
  | { type: "undone" };
