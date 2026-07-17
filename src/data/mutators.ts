import type { StatMods } from "./buildings";
import { describeStatMods } from "./buildings";
import rawMutators from "./mutators.json";

/**
 * Pre-level mutator definitions (CD-30 meta-progression, design doc
 * docs/design-meta-progression.md §5 Q3). Same loader pattern as
 * perks.ts. Two v1 mechanisms (design doc option C), registry-dispatched by
 * field presence — a def can carry either, both, or neither:
 * - `wave`: pure-data transform applied to a DEEP COPY of `level.waves` at
 *   `loadLevel` (`Game.buildRunWaves`). Deterministic, no sim change — the
 *   non-stat difficulty dial (M9) so mutators are never the only knob.
 * - `mods`: a player-side debuff folded into the same `globalStatMods`
 *   merge perks use (`Game.computeLoadoutMods`) — reuses B2, no parallel
 *   math.
 * `enemyMods` (Hardened Foe) is a third, narrower seam: one multiply at
 * `Game.spawnEnemy`, shipped only because it landed as a clean one-liner
 * (design doc §7 Slice 3 note — otherwise it would have been deferred).
 * `restrict` (Pact-style restriction mutators) and `scoreMult` (a future
 * score layer) are named-but-unbuilt seams (design doc Extension seams
 * 3/7) — no v1 def sets either.
 *
 * A win with >=1 mutator active writes `levels[id].mutatorWin = true`
 * (`AppShell.recordVictory`), lighting Star 3. Selected mutators are
 * SESSION-ONLY (design doc §11's recommendation) — `AppShell` keeps them in
 * an in-memory field, never `settings`, so they reset on reload while
 * perks persist.
 *
 * NAMING: every `name` below is a design-doc PLACEHOLDER (§11) — not yet
 * signed off. Do not treat these as final.
 */
export interface MutatorDef {
  id: string;
  name: string; // placeholder — pending user sign-off (design doc §11)
  blurb: string;
  /** Player-side debuff, folded into globalStatMods like a perk. */
  mods?: StatMods;
  /** Paired with `mods` for derived chip text (M8). */
  scope?: string;
  /** Wave-table transform multipliers, applied per-entry to a deep copy of
   *  `level.waves` (never mutates the shared LEVELS[] def). Counts round UP
   *  so a fractional bump never rounds away to zero extra enemies. */
  wave?: { countMul?: number; intervalMul?: number; delayMul?: number };
  /** Enemy-stat scale seam (design doc Extension seam 2) — one multiply at
   *  `Game.spawnEnemy`. Only `maxHp` is wired in v1. */
  enemyMods?: { maxHp?: number };
  /** Pact-style restriction seam (design doc Extension seam 3) — named,
   *  not built; no v1 def sets it. */
  restrict?: unknown;
  /** Score/leaderboard seam (design doc Extension seam 7) — named, not
   *  built; no v1 def sets it. */
  scoreMult?: number;
  /** Total-star gate (design doc §4 Q1/Q4) — 0 = unlocked from a fresh
   *  save. Slice 4 is out of scope for this ticket, so every v1 mutator
   *  ships at 0 (the doc's own recommendation: mutators available from a
   *  fresh save so Star 3 is earnable immediately). */
  unlockStars: number;
}

export const MUTATORS = rawMutators as unknown as Record<string, MutatorDef>;

export function getMutator(id: string): MutatorDef | undefined {
  return MUTATORS[id];
}

function pctOf(mul: number): string {
  const pct = Math.round((mul - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/**
 * Chip-face text (UI_PLAN 6, no hover) derived mechanically from `mods`/
 * `wave`/`enemyMods` — never hand-typed (M8). Includes the "+3rd star"
 * qualifier the design doc's Q5 UI answer calls for on every mutator chip.
 */
export function formatMutatorBlurb(def: MutatorDef): string {
  const parts = describeStatMods(def.mods);
  if (def.wave?.countMul !== undefined) parts.push(`${pctOf(def.wave.countMul)} enemy count`);
  if (def.wave?.intervalMul !== undefined) {
    parts.push(`${pctOf(def.wave.intervalMul)} spawn interval`);
  }
  if (def.wave?.delayMul !== undefined) parts.push(`${pctOf(def.wave.delayMul)} first delay`);
  if (def.enemyMods?.maxHp !== undefined) parts.push(`${pctOf(def.enemyMods.maxHp)} enemy HP`);
  const numeric = parts.length > 0 ? (def.scope ? `${parts.join(", ")} — ${def.scope}` : parts.join(", ")) : def.blurb;
  return `${numeric} · +3rd star`;
}
