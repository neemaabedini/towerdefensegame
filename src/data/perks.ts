import type { StatMods } from "./buildings";
import { describeStatMods } from "./buildings";
import rawPerks from "./perks.json";

/**
 * Pre-level perk definitions (CD-30 meta-progression, design doc
 * docs/design-meta-progression.md §5 Q2). Same loader pattern as
 * buildings.ts/hero.ts — data lives in perks.json so a Godot port loads it
 * unchanged. Effects fold into `Game.globalStatMods` alongside branch picks
 * (B2 in the design doc) via `Game.setLoadout`; `startingCredits` is the one
 * exception — it's a flat one-time credit grant at `loadLevel`, not a
 * StatMods multiplier (D8: income stays unrepresentable in `StatMods` by
 * construction, so a perk that wants to touch money uses this field
 * instead, and it can't compound like a per-day mod could).
 *
 * NAMING: every `name` below is a design-doc PLACEHOLDER (§11 "All naming
 * is the user's") — not yet signed off. Do not treat these as final.
 */
export interface PerkDef {
  id: string;
  name: string; // placeholder — pending user sign-off (design doc §11)
  blurb: string;
  mods?: StatMods;
  /** Paired with `mods` for derived chip text (M8), mirrors
   *  `BranchOption.scope` — e.g. "all structures & squads". */
  scope?: string;
  /** One-time flat credit grant added to `startingMoney` at `loadLevel`. */
  startingCredits?: number;
  /** Total-star gate (design doc §4 Q1/Q4) — 0 = unlocked from a fresh
   *  save. Slice 4 (unlock gating) is out of scope for this ticket, so
   *  every v1 perk ships at 0; the field exists so Slice 4 is data+UI only. */
  unlockStars: number;
  /** Hero-buff seam (design doc §5/Extension seam 1) — applied in
   *  `parkHero`/`updateHero` once a hero-targeted perk exists. Unused,
   *  typed-but-dormant like `BuildingDef.unique`. */
  heroMods?: StatMods;
}

export const PERKS = rawPerks as unknown as Record<string, PerkDef>;

export function getPerk(id: string): PerkDef | undefined {
  return PERKS[id];
}

/**
 * Chip-face text (UI_PLAN 6, no hover) derived mechanically from `mods`/
 * `startingCredits` — never hand-typed, so it can't drift from what the
 * perk actually does (M8, same discipline as `formatBranchBlurb`).
 */
export function formatPerkBlurb(def: PerkDef): string {
  const parts = describeStatMods(def.mods);
  if (def.startingCredits) {
    parts.push(`+${def.startingCredits}₡ starting credits (one-time)`);
  }
  if (parts.length === 0) return def.blurb;
  const numeric = parts.length === 2 ? parts.join(" and ") : parts.join(", ");
  return def.scope ? `${numeric} — ${def.scope}` : numeric;
}
