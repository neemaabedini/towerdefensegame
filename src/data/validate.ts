import { BUILDINGS, deriveSiteResources, type StatMods, type TargetMode } from "./buildings";
import { ENEMIES } from "./enemies";
import { ABILITIES } from "./abilities";
import { HEROES, type HeroDef } from "./hero";
import { LEVELS, type LevelDef, type SiteCategory } from "./levels";
import { MUTATORS } from "./mutators";
import { PERKS } from "./perks";
import { UNITS } from "./units";

const VALID_CATEGORIES: readonly SiteCategory[] = ["defense", "resource", "any"];
const VALID_TARGET_MODES: readonly TargetMode[] = ["all", "ground", "air"];
const MIN_OBSTACLE_CLEARANCE = 20;
/** The complete StatMods field set — kept as a runtime whitelist (not just
 *  the TS type) because perks.json/mutators.json load through an `as
 *  unknown as` cast (same pattern as buildings.json/levels.json) that
 *  erases compile-time checking of the JSON's actual keys. This is what
 *  makes D8 ("income is unrepresentable") a CONTRACT enforced at boot,
 *  not just a type that a raw JSON edit could quietly violate. */
const VALID_STAT_MOD_KEYS: readonly (keyof StatMods)[] = [
  "damage",
  "range",
  "fireRate",
  "splashRadius",
  "maxHp",
];

function checkStatMods(mods: StatMods | undefined, label: string, errors: string[]): void {
  if (!mods) return;
  for (const key of Object.keys(mods)) {
    if (!(VALID_STAT_MOD_KEYS as readonly string[]).includes(key)) {
      errors.push(
        `${label}: mods has key "${key}", not a valid StatMods field ` +
          `(income is deliberately unrepresentable — design-meta-progression.md D8)`,
      );
    }
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Distance from a point to a line SEGMENT, not to its endpoints (CD-43/CD-44).
 * Measuring to waypoints alone is what let Ridge's Far Field ship: its crystals
 * clear every waypoint by 19-40px while sitting 1.8px and 10.8px from the lane
 * enemies actually walk. An obstacle can clear every vertex and still be parked
 * mid-leg.
 */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * vx, ay + t * vy);
}

/**
 * DEV-only data contract check (docs/design-economy-rework.md R4). The
 * `as unknown as` casts in levels.ts:63/buildings.ts:78 erase tsc's ability
 * to catch a stale category string or a dangling building id in the JSON —
 * this is the only thing standing between a bad data edit and a silent
 * runtime bug, and per the design doc it's also the ONLY data contract a
 * future Godot port gets (Godot has no TS types at all). Fails loud on boot
 * rather than degrading gracefully, by design.
 *
 * Clearance is scoped by WHAT IS MEASURED, not by obstacle kind (CD-43 #1):
 *
 * - SITE clearance → rocks only. Crystal/plasma obstacles are deliberately
 *   close to (sometimes well under 20px of) the resource sites that mine them.
 *   That's the map-is-the-economy premise working as designed.
 * - PATH clearance → every kind. Nothing should sit on a lane enemies walk,
 *   whatever it's made of. Exempting crystals here bought nothing and hid a
 *   real bug (CD-44): Ridge's Far Field crystals clear every waypoint by
 *   19-40px but sit 1.8px and 10.8px from the segment between them. Measured
 *   against segments, not vertices — see distToSegment.
 *
 * Today this is cosmetic (obstacles have no collision), but `ObstacleDef.blocks`
 * defaults true and goes live with CD-9's nav grid, at which point anything on
 * a lane becomes a wall.
 */
export function validateLevels(levels: LevelDef[] = LEVELS): void {
  const errors: string[] = [];

  // R9 (docs/design-wave-legibility.md): a def with maxLevel > 1 but no real
  // upgrade cost silently upgrades for free — the Command Post's cost: 0
  // is exactly this trap (its own `upgradeCosts` override is what saves it).
  // Level-independent, so this runs once, not once per level.
  for (const def of Object.values(BUILDINGS)) {
    if (def.maxLevel <= 1) continue;
    const hasFormulaCost = def.cost > 0 && def.upgradeCostMult > 0;
    const overrides = def.upgradeCosts;
    const hasOverrideCost =
      overrides !== undefined &&
      overrides.length >= def.maxLevel - 1 &&
      overrides.every((c) => c > 0);
    if (!hasFormulaCost && !hasOverrideCost) {
      errors.push(
        `${def.id}: maxLevel ${def.maxLevel} but no real upgrade cost ` +
          `(cost*upgradeCostMult formula is zero and upgradeCosts is absent/incomplete) — upgrades would be free`,
      );
    }
  }

  // CD-40: ability data contract.
  const ABILITY_EFFECT_KINDS = new Set([
    "slow",
    "damage",
    "damage_and_slow",
    "damage_single",
    "damage_air",
  ]);
  for (const def of Object.values(ABILITIES)) {
    if (def.targeting !== "self" && def.targeting !== "point") {
      errors.push(`ability ${def.id}: targeting must be "self" or "point"`);
    }
    if (!(def.cooldown >= 0)) {
      errors.push(`ability ${def.id}: cooldown must be >= 0`);
    }
    if (!(def.radius > 0)) {
      errors.push(`ability ${def.id}: radius must be > 0`);
    }
    if (!ABILITY_EFFECT_KINDS.has(def.effect.kind)) {
      errors.push(`ability ${def.id}: unknown effect.kind "${def.effect.kind}"`);
    }
    if (
      (def.effect.kind === "slow" || def.effect.kind === "damage_and_slow") &&
      !(def.effect.slowSeconds > 0)
    ) {
      errors.push(`ability ${def.id}: slowSeconds must be > 0`);
    }
    if (
      (def.effect.kind === "damage" ||
        def.effect.kind === "damage_and_slow" ||
        def.effect.kind === "damage_single" ||
        def.effect.kind === "damage_air") &&
      !(def.effect.damage > 0)
    ) {
      errors.push(`ability ${def.id}: damage must be > 0`);
    }
  }

  // CD-29 / CD-40: hero data contract (docs/design-hero-commander.md §10).
  const HERO_POSITIVE_FIELDS: readonly (keyof HeroDef)[] = [
    "maxHp",
    "moveSpeed",
    "damage",
    "fireRate",
    "range",
    "radius",
  ];
  for (const def of Object.values(HEROES)) {
    if (def.splashRadius !== undefined && !(def.splashRadius > 0)) {
      errors.push(`hero ${def.id}: splashRadius must be > 0 when present`);
    }
    if (def.unlockStars !== undefined && !(def.unlockStars >= 0)) {
      errors.push(`hero ${def.id}: unlockStars must be >= 0 when present (got ${def.unlockStars})`);
    }
    for (const field of HERO_POSITIVE_FIELDS) {
      const v = def[field];
      if (typeof v !== "number" || !(v > 0)) {
        errors.push(`${def.id}: ${field} must be a positive number (got ${v})`);
      }
    }
    if (!VALID_TARGET_MODES.includes(def.targets)) {
      errors.push(`${def.id}: unknown targets "${def.targets}"`);
    }
    if (typeof def.respawn?.atDawn !== "boolean") {
      errors.push(`${def.id}: respawn.atDawn must be a boolean`);
    }
    for (const abId of def.abilities) {
      if (!ABILITIES[abId]) {
        errors.push(`hero ${def.id}: abilities references missing ability "${abId}"`);
      }
    }
  }

  // CD-30 Slice 0: perk/mutator data contract (docs/design-meta-progression.md
  // §5). Level-independent, runs once. `checkStatMods` is the D8 enforcement
  // point — see its own comment.
  for (const def of Object.values(PERKS)) {
    checkStatMods(def.mods, `perk ${def.id}`, errors);
    checkStatMods(def.heroMods, `perk ${def.id} (heroMods)`, errors);
    if (!(def.unlockStars >= 0)) {
      errors.push(`perk ${def.id}: unlockStars must be >= 0 (got ${def.unlockStars})`);
    }
  }
  for (const def of Object.values(MUTATORS)) {
    checkStatMods(def.mods, `mutator ${def.id}`, errors);
    if (!(def.unlockStars >= 0)) {
      errors.push(`mutator ${def.id}: unlockStars must be >= 0 (got ${def.unlockStars})`);
    }
    if (def.wave) {
      for (const [key, v] of Object.entries(def.wave)) {
        if (v !== undefined && !(v > 0)) {
          errors.push(`mutator ${def.id}: wave.${key} must be > 0 (got ${v})`);
        }
      }
    }
    if (def.enemyMods?.maxHp !== undefined && !(def.enemyMods.maxHp > 0)) {
      errors.push(`mutator ${def.id}: enemyMods.maxHp must be > 0 (got ${def.enemyMods.maxHp})`);
    }
  }

  // CD-53: cross-file reference checks. `enemies.json` and `units.json` had no
  // coverage at all, so a wave naming a missing enemy, or a garrison squad
  // naming a missing unit, only surfaced as a mid-wave `getEnemy`/`getUnit`
  // throw — and in a Godot port, which has no TS types and treats this
  // validator as the whole data contract, as silence.
  for (const def of Object.values(BUILDINGS)) {
    const squads = [
      def.squad,
      ...(def.branch?.options ?? []).map((o) => o.squad),
    ].filter((s): s is NonNullable<typeof s> => !!s);
    for (const squad of squads) {
      if (!UNITS[squad.unitId]) {
        errors.push(`${def.id}: squad references unknown unit "${squad.unitId}"`);
      }
      if (squad.countByLevel.length === 0) {
        errors.push(`${def.id}: squad.countByLevel is empty`);
      }
    }
    for (const opt of def.branch?.options ?? []) {
      if (!opt.id) errors.push(`${def.id}: a branch option has no id`);
    }
    if (def.branch && def.branch.atLevel > def.maxLevel) {
      errors.push(
        `${def.id}: branch.atLevel ${def.branch.atLevel} is beyond maxLevel ${def.maxLevel} — unreachable`,
      );
    }
  }

  for (const level of levels) {
    for (const wave of level.waves) {
      for (const entry of wave.entries) {
        if (!ENEMIES[entry.enemyId]) {
          errors.push(`${level.id}: wave references unknown enemy "${entry.enemyId}"`);
        }
        if (entry.spawnId && !level.spawns.some((s) => s.id === entry.spawnId)) {
          errors.push(
            `${level.id}: wave entry "${entry.enemyId}" references unknown spawn "${entry.spawnId}"`,
          );
        }
      }
    }

    for (const spawnId of Object.keys(level.paths)) {
      if (!level.spawns.some((s) => s.id === spawnId)) {
        errors.push(`${level.id}: path "${spawnId}" has no matching spawn`);
      }
    }
    for (const spawn of level.spawns) {
      if (!level.paths[spawn.id]) {
        errors.push(`${level.id}: spawn "${spawn.id}" has no path — its enemies cannot move`);
      }
    }

    for (const site of level.sites) {
      if (!VALID_CATEGORIES.includes(site.category)) {
        errors.push(`${level.id}/${site.id}: unknown category "${site.category}"`);
      }
      // A site whose only option(s) get deleted from buildings.json silently
      // becomes unselectable-productively rather than throwing — this is
      // exactly the class of mistake CD-54 (deleting sensor_array/plasma_tap)
      // could have shipped if a site's replacement had been missed.
      if (site.options.length === 0) {
        errors.push(`${level.id}/${site.id}: has zero build options — dead site`);
      }

      for (const optId of site.options) {
        const def = BUILDINGS[optId];
        if (!def) {
          errors.push(`${level.id}/${site.id}: unknown building option "${optId}"`);
          continue;
        }
        if (def.requires) {
          const resources = deriveSiteResources(level, site.x, site.y);
          const have = resources[def.requires.resource];
          if (have < def.requires.min) {
            errors.push(
              `${level.id}/${site.id}: offers "${optId}" but only has ${have} ` +
                `${def.requires.resource} in range (needs ${def.requires.min})`,
            );
          }
        }
      }
    }

    for (const o of level.obstacles) {
      // Site clearance: rocks only — resource obstacles belong near their sites.
      if (o.kind === "rock") {
        for (const site of level.sites) {
          if (dist(o.x, o.y, site.x, site.y) < MIN_OBSTACLE_CLEARANCE) {
            errors.push(
              `${level.id}: rock at (${o.x},${o.y}) sits within ${MIN_OBSTACLE_CLEARANCE}px of site ${site.id}`,
            );
          }
        }
      }

      // Path clearance: every kind, measured to the segment, not the vertices.
      for (const [spawnId, path] of Object.entries(level.paths)) {
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i]!;
          const b = path[i + 1]!;
          const d = distToSegment(o.x, o.y, a.x, a.y, b.x, b.y);
          if (d < MIN_OBSTACLE_CLEARANCE) {
            errors.push(
              `${level.id}: ${o.kind} at (${o.x},${o.y}) sits ${d.toFixed(1)}px from ` +
                `${spawnId}'s lane (needs ${MIN_OBSTACLE_CLEARANCE}px) — on the path enemies walk`,
            );
          }
        }
      }
    }

    // Research trackId check intentionally omitted — no research.json until
    // Step 4 (PARKED, see TICKETS.md CD-7).
  }

  if (errors.length > 0) {
    throw new Error(`Level data validation failed:\n${errors.join("\n")}`);
  }
}
