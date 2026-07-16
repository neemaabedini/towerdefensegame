import rawTuning from "./tuning.json";

/**
 * Sim tuning constants — the RULES of the game, as data (CD-51).
 *
 * The *defs* (buildings, enemies, units, levels) already live in JSON so a
 * future Godot port loads the same files unchanged. The *rules* did not: the
 * level-scaling curve, the armor floor, the slow multiplier, the contact
 * radii and the sensor aura were magic numbers scattered through
 * `buildings.ts` and `Game.ts`. A port had to read TypeScript and hand-copy
 * them, and a single transcription slip would make the ported game *feel*
 * different with nothing to catch it.
 *
 * Nothing here is a per-entity stat — those belong on the entity's own def.
 * This is only for numbers that describe how the sim itself behaves.
 *
 * NOT balance data in the day-to-day sense: changing these changes every
 * building/enemy at once. The BALANCE FREEZE (see TICKETS.md) applies —
 * this file was created by a pure extract with zero behaviour change.
 */
export interface Tuning {
  /** Per-level multipliers: stat × (1 + (level − 1) × perLevel). */
  levelScaling: {
    damagePerLevel: number;
    maxHpPerLevel: number;
    rangePerLevel: number;
    fireRatePerLevel: number;
    splashRadiusPerLevel: number;
    incomePerLevel: number;
  };
  economy: {
    /** Fraction of `invested` returned when selling (day only, never the HQ). */
    sellRefund: number;
  };
  combat: {
    /** Armor can never fully negate a hit — `max(this, raw − armor)`. */
    minDamageAfterArmor: number;
    /** Splash deals this fraction of the primary hit. */
    splashFalloff: number;
    /** How long the white hit-flash sprite variant shows, in seconds. */
    hitFlashSeconds: number;
    /** Speed of enemy standoff projectiles (px/sec). */
    enemyProjectileSpeed: number;
  };
  enemies: {
    /** Move-speed multiplier while `slowTimer > 0`. */
    slowMultiplier: number;
    /** How close an enemy must get to a waypoint to advance to the next one.
     *  Load-bearing: `separationStepFraction` must keep the separation push
     *  below an enemy's step, or bodies get shoved past this window forever
     *  and a lane deadlocks (CD-45). */
    waypointArrivalPx: number;
    /** Added to an enemy's radius to find its contact range vs a building. */
    buildingContactPadPx: number;
    /** Added to an enemy's radius to find its contact range vs the HQ. */
    hqContactPadPx: number;
    /** Fraction of its own step that separation may move an enemy per tick.
     *  MUST stay below 1 — see `Game.separateEnemies` (CD-45). */
    separationStepFraction: number;
  };
  /** Local aura the sensor array grants nearby buildings, per its own level. */
  sensorArray: {
    rangeBonusBase: number;
    rangeBonusPerLevel: number;
    fireRateBonusBase: number;
    fireRateBonusPerLevel: number;
  };
  /** Input debounce, not a sim rule — kept here so `Game` needs no host clock
   *  constants of its own. See `Game.sellOrUndo` and CD-52. */
  input: {
    sellLockoutMs: number;
  };
}

export const TUNING = rawTuning as unknown as Tuning;
