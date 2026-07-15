import { BUILDINGS, deriveSiteResources } from "./buildings";
import { LEVELS, type LevelDef, type SiteCategory } from "./levels";

const VALID_CATEGORIES: readonly SiteCategory[] = ["defense", "resource", "any"];
const MIN_OBSTACLE_CLEARANCE = 20;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
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
 * Obstacle-clearance is checked against `kind: "rock"` only. Crystal/plasma
 * obstacles are deliberately close to (sometimes well under 20px of) the
 * resource sites that mine them and, per Ridge Pass's Far Field, can sit
 * near a path waypoint too — that's the map-is-the-economy premise working
 * as designed, not a placement mistake. Rocks are the real terrain hazard
 * (impassable, unrelated to any site's function), so they're what this
 * check actually guards against.
 */
export function validateLevels(levels: LevelDef[] = LEVELS): void {
  const errors: string[] = [];

  for (const level of levels) {
    for (const site of level.sites) {
      if (!VALID_CATEGORIES.includes(site.category)) {
        errors.push(`${level.id}/${site.id}: unknown category "${site.category}"`);
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
      if (o.kind !== "rock") continue;
      for (const site of level.sites) {
        if (dist(o.x, o.y, site.x, site.y) < MIN_OBSTACLE_CLEARANCE) {
          errors.push(
            `${level.id}: rock at (${o.x},${o.y}) sits within ${MIN_OBSTACLE_CLEARANCE}px of site ${site.id}`,
          );
        }
      }
      for (const [spawnId, path] of Object.entries(level.paths)) {
        for (const wp of path) {
          if (dist(o.x, o.y, wp.x, wp.y) < MIN_OBSTACLE_CLEARANCE) {
            errors.push(
              `${level.id}: rock at (${o.x},${o.y}) sits within ${MIN_OBSTACLE_CLEARANCE}px of ${spawnId}'s path`,
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
