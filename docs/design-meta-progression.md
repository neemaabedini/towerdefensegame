# Design Doc — CD-30: Meta-Progression (Stars · Perks · Mutators · Unlock Gating)

Architect, 2026-07-17. Covers `TICKETS.md` **CD-30** (weapons slice shipped; this is CD-30 proper), `ROADMAP.md` Phase 5 + the ThroneFall/They-Are-Billions community-feedback sections. Status: Slices 0–4 shipped (Slice 4 unlock gating 2026-07-19 with freeze-untuned thresholds). Every number is **plausible-but-untuned** (BALANCE FREEZE, CD-37 rule); each carries a named QA metric.

Relevant files: `src/persist/save.ts`, `src/app/AppShell.ts`, `src/ui/screens/LevelSelect.ts`, `src/game/Game.ts`, `src/data/buildings.ts`, `src/data/hero.ts`/`hero.json`, `src/data/validate.ts`, and new `src/data/perks.json`/`perks.ts`, `src/data/mutators.json`/`mutators.ts`.

---

## 1. Problem statement & constraints

Meta-progression is the user's stated **#1 goal: build variety that survives multiple playthroughs**. ThroneFall's perk/mutator system is the single most-praised replayability driver in every community studied. CD-30 delivers three across-run/pre-run variety layers on top of the shipped in-run layers (branches, CC picks, hero weapons): **per-level stars**, **pre-level perks**, **pre-level mutators**, plus **unlock gating** that eventually turns the all-unlocked weapons into earned rewards.

**Binding constraints (cited):**

| # | Constraint | Source |
|---|---|---|
| M1 | Stars: win / no-HQ-damage / mutator-win. Star 1+2 derivable from existing save (`cleared`, `bestHqHpPct`) with zero new writes; only mutator-win needs new state | CD-30 ticket |
| M2 | Perks are **pre-level** choices; the shipped weapon-chip row is the UI pattern | `LevelSelect.ts` |
| M3 | Mutators are stat-modifier layers folding into `computeGlobalMods`; **nothing touches income (D8)** | design-wave-legibility §7c D8 |
| M4 | Weapon gating turns on later, gated on stars, **without changing the shipped selection UI or `settings.heroWeapon`** | CD-30 |
| M5 | No new `Math.random()` in sim paths; effects deterministic; no roguelite draft (OQ1 closed) | CD-20 |
| M6 | Defs in JSON; `validate.ts` covers them; save changes backward-compatible (optional-field pattern first; migrations table stays empty unless truly needed — a bump is a flagged decision) | save.ts |
| M7 | Pre-level UI is a DOM screen — keyboard/controller/touch fine; **no new in-game input verb** | UI_PLAN |
| M8 | Numbers on the chip face, no hover | UI_PLAN 6 |
| M9 | Mutators must not be the *only* difficulty dial | ROADMAP community items 2 & 4 |
| M10 | IP: original names only; user signs off on all naming | ROADMAP IP rules |

---

## 2. ThroneFall research and per-decision verdicts

| Finding | Source |
|---|---|
| **Perks: ~54 total**, unlocked by XP level. **Slots grow: 1 at start → 2 at level 8 → 3 at level 24**, up to 5 max | [Perk guide (Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3276702564), [lastwordongaming](https://lastwordongaming.com/2023/08/08/thronefall-perks/) |
| **Dominant "too good NOT to take":** Lighter Materials (+33% attack speed), Warrior Training, Castle Blueprints (+50% tower HP), Last Stand | [TheGamer strongest perks](https://www.thegamer.com/thronefall-best-strongest-perks/), [OP/UP thread](https://steamcommunity.com/app/2239150/discussions/0/4308326918580849935/) |
| **Dead perks:** Commander/Royal Training, Godly Curse | same |
| **Economy-global (Builder's Guild) is the textbook auto-pick** | design-wave-legibility §2/D8 |
| **Mutators multiply score; two families:** "God" mutators add difficulty for a multiplier; **"Pact" mutators remove entire defense categories** | [Score wiki](https://throne-fall.github.io/about/score.html), [Ice map mutators](https://steamcommunity.com/app/2239150/discussions/0/5276582961026056169/) |
| **No per-level star system** — cumulative playthrough score instead | [Score wiki](https://throne-fall.github.io/about/score.html) |

**Verdicts:**

| Decision | ThroneFall | Verdict |
|---|---|---|
| Pre-level perk loadout as main across-run variety | Yes (top praise) | **ADOPT** |
| Perk slots grow with progression | Yes (1→2→3→5) | **ADOPT the shape, shrink numbers** — 2 levels = 6 stars max, so 1→2 slots v1; growth is a data threshold, expands with CD-31 |
| Economy-global perk | Yes | **REJECT by construction** — D8; `StatMods` cannot express `incomePerDay`. The auto-pick class is unrepresentable |
| Flat +%-damage perk | Yes | **REJECT damage-alone; bundle fireRate** — CD-7 D6: +% damage alone is a no-op at small integer HP/armor |
| Mutators as difficulty modifiers | Yes | **ADOPT the modifier idea, REJECT score-as-progression** |
| Cumulative playthrough score | Yes | **REJECT v1** — no leaderboard; discrete stars gate concrete unlocks and read on the card face. Score = named seam |
| "Pact" restriction mutators | Yes | **DEFER, name the seam** — a restriction can make a level unwinnable (Outpost W4 needs AA); belongs with CD-31 authoring |
| Trigger perks (Last Stand) | Yes | **DEFER** — needs new event-trigger sim path |

---

## 3. Considered options + recommendation

**(A) Star model.** A1 cumulative score (ThroneFall) — rejected: no leaderboard, gates nothing discretely, needs hover. **A2 (recommended, ticket-locked): 3 discrete stars per level** — Star 1 (Clear) = `cleared`; Star 2 (Flawless) = `bestHqHpPct === 100`; Star 3 (Hardened) = won with ≥1 mutator. Stars 1+2 derive from existing save (zero new writes); Star 3 adds one optional boolean. Total stars = the single progression currency.
*Caveat:* `bestHqHpPct` rounds, so ~99.6% → 100 could grant Flawless on a scratch. Ship the zero-write proxy; if QA finds it lenient, add optional `flawless?: boolean` (one field, no migration).

**(B) Where effects apply.** B1 parallel ad-hoc math — rejected (`buildings.ts` comment explicitly forbids it). **B2 (recommended): seed `computeGlobalMods`** with perk + mutator `StatMods` layers alongside the CC pick. One channel, memoized at `loadLevel`, never per tick (CD-7's call-count spy is the regression guard).

**(C) Difficulty mutators can't express as a player-side StatMod.** Two v1 mechanisms, registry-dispatched by field presence:
- **Wave-table transform** (pure data): deep-copy `level.waves` at `loadLevel`, apply `countMul`/`intervalMul`/`delayMul`. Deterministic, no sim change. The non-stat difficulty dial (M9) and the swarm-spectacle lever.
- **Player-debuff global mod** (reuses B2).
- **Enemy stat scale** (seam; ship in Slice 3 only if it lands clean): one multiply at `spawnEnemy`.

**(D) Loadout plumbing.** `game.setLoadout({ perks, mutators })` called in `startLevel` before `loadLevel`, mirroring the shipped `setHeroLoadout`.

---

## 4. Answers to the six questions

**Q1 — Stars.** Exactly 3 per level (A2). Total-star count gates: (a) perk slot count, (b) weapon unlocks (M4), (c) perk unlocks. Thresholds are **USER-set data**.

**Q2 — Perks.** Slots: **1 at 0 stars → 2 at a user-set threshold** (v1 max 2). v1 list, every effect in an existing mechanism:

| Perk (placeholder name — USER) | Effect | Mechanism | No-trap metric |
|---|---|---|---|
| Standing Orders | +8% damage **and** +8% fire rate, all structures & squads | `globalStatMods` | Must cross a real HP breakpoint on ≥1 level |
| Reinforced Plating | +12% maxHp, all structures & squads | `globalStatMods` | Changes ≥1 building's survival wave in a swap test |
| Long Guns | +12% range, all structures | `globalStatMods` | Real trade alone; must not let a rear tower cover the map |
| Rapid Response | +12% fire rate, all structures & squads | `globalStatMods` | Moves per-wave damage on ≥1 archetype |
| War Chest | +90 starting credits (one-time) | `startingMoney` add at `loadLevel` | Bounded: ~1 early building; D8-safe (flat one-time grant doesn't compound) |

Non-dominance rule: **no perk may be correct regardless of build/level** (the Builder's-Guild test).

**Deferred (need new sim code — seams named):** hero-buff perks (apply mod in `parkHero`/`updateHero`; `heroMods` field reserved); garrison-count perks (squadSpec override channel); trigger perks (Last Stand class); kill-reward perks (rejected outright — no kill-reward system, and it's economy/D8).

**Q3 — Mutators.** v1 (none touch income):

| Mutator (placeholder — USER) | Effect | Mechanism |
|---|---|---|
| Swarm | +30% enemy count per wave entry (round up) | wave `countMul` |
| Blitz | −25% spawn interval + earlier first delay | wave `intervalMul`/`delayMul` |
| Fragile Command | −15% structure & squad maxHp | player-debuff `globalStatMods` |
| Hardened Foe *(if the spawn multiply lands clean, else defer)* | +20% enemy HP | enemy scale at `spawnEnemy` |

**Mutator win:** `levels[id].mutatorWin = true` on a ≥1-mutator victory → Star 3. **M9:** mutators are opt-in on top of the base curve; base difficulty (CD-41/48 work) stays the primary dial; Star 3 earnable from a fresh save.

**Q4 — Save schema.** All optional, **no version bump** (heroWeapon precedent; first real bump stays a flagged future decision):
- `levels[id].mutatorWin?: boolean` (written by `recordVictory`).
- `settings.perks?: string[]` (equipped ids; one optional-array check in `isValidSave`; unknown/over-slot ids trimmed at read).
- **Unlocks are NOT stored** — `totalStars()`, `isWeaponUnlocked`, `isPerkUnlocked`, `perkSlots` are pure functions of `levels`. One source of truth, no migration.

**Q5 — UI.** The chip-row pattern scales: a **Perks row** (selectable up to slot count, locked chips greyed, "2/2" counter) and a **Mutators row** (multi-select toggles, effect + "+Hardened star" on face) above the level cards; each card gains **3 star glyphs**. Chip text derived mechanically from `mods` (no drift, M8). Weapon row gains a locked-chip state only — selection mechanism and `settings.heroWeapon` untouched (M4). DOM screen → zero new input verbs (M7).

**Q6 — Slices.** §7.

---

## 5. Data model & module changes

**New:** `perks.json`/`perks.ts` — `PerkDef { id, name, blurb, mods?: StatMods, startingCredits?, unlockStars, heroMods? /* seam */ }`. `mutators.json`/`mutators.ts` — `MutatorDef { id, name, blurb, mods?, wave?: { countMul?, intervalMul?, delayMul? }, enemyMods? /* seam */, restrict? /* Pact seam */, scoreMult? /* score seam */ }`. Effects registry-dispatched by field presence.

**`Game.ts`:** `setLoadout({perks, mutators})`; `loadLevel` deep-copies `level.waves` + applies wave transforms, seeds perk/mutator mods into `computeGlobalMods`, adds `startingCredits`; *(Slice 3, optional)* enemy-HP multiply at `spawnEnemy`.

**`AppShell.ts`:** `selectedPerks` (from `settings.perks`), `selectedMutators` (persistence = USER call); `perkSlots()`, `totalStars()`, `isWeaponUnlocked`, `isPerkUnlocked`; `startLevel` calls `setLoadout`; `recordVictory` writes `mutatorWin`; `heroWeapon` getter sanitizes locked ids to rifle.

**`hero.json`:** optional `unlockStars?` per weapon (absent/0 = unlocked; rifle 0).

**`validate.ts`:** perks/mutators block — every `mods` key a valid `StatMods` field (**income unrepresentable → D8 enforced at the contract level**); `unlockStars >= 0`; wave multipliers positive; all referenced ids exist.

---

## 6. Platform impact

| Concern | Browser | Godot | Controller | Mobile |
|---|---|---|---|---|
| Defs | JSON | same files unchanged | — | — |
| Effects | `computeGlobalMods` seed + wave transform (no browser API) | GDScript same fields | — | — |
| Save | optional fields, localStorage | `StorageBackend` → ConfigFile, same shape | — | — |
| Pre-level UI | DOM chip rows + star glyphs | Control nodes | spatial nav, **no new verb** | tap; no hover |
| Determinism | pure transforms, no RNG | lockstep-safe | — | — |

---

## 7. Implementation slices (each playable + tsc-clean)

- **Slice 0 — Data + contract.** JSONs + loaders + validator. No gameplay change.
- **Slice 1 — Stars.** Derive 1/2 from save; `mutatorWin` field; star glyphs on cards; `totalStars`/`perkSlots`. Star 3 empty until Slice 3.
- **Slice 2 — Perks.** Perk row (slots from stars, selection → `settings.perks`); effects into `computeGlobalMods` + `startingCredits`. Ships all-unlocked (gating is Slice 4).
- **Slice 3 — Mutators + Star 3.** Mutator toggles; wave transform + player debuff; `recordVictory` writes `mutatorWin`. Enemy-HP multiply only if clean.
- **Slice 4 — Unlock gating on.** Weapons + perks gated by `totalStars` vs `unlockStars`; locked chips; sanitize locked ids → rifle. **SHIPPED 2026-07-19** with freeze-untuned provisional thresholds (weapons 0/1/2/3; perks 0/1/1/2/3; slot growth at 3★; mutators stay 0). Re-tune numbers only — no code change.

Order rationale: framework → stars visible → perks (useful immediately) → mutators (earns Star 3) → gating last, so every earlier slice tests with everything unlocked and scarcity is the final, reversible switch.

---

## 8. Risks + cheapest de-risk

| Risk | De-risk |
|---|---|
| A perk becomes the auto-pick | Bundle damage+fireRate; swap-test QA; numbers frozen |
| Mutators become the only hard mode (M9) | Opt-in on top of base curve; verify no-mutator clear stays challenging |
| Slot pacing coupled to level count | Thresholds are data; conservative 2-slot cap until CD-31 |
| 3-source `computeGlobalMods` double-apply | Seed once at `loadLevel`, one `restatAll`; call-count spy guard |
| Enemy-HP mutator invalidates CD-45 baselines | Opt-in, off by default; defer if it destabilizes |
| Pact mutator makes a level unwinnable | Deferred to CD-31; v1 mutators survivable-by-construction |
| Schema churn for stored unlocks | Unlocks derived from stars — nothing stored, no migration |
| `bestHqHpPct===100` rounding | Ship proxy; optional `flawless?` boolean if QA objects |

---

## 9. QA plan (named metrics)

- **Stars:** flawless clear → 2 glyphs; mutator clear → Star 3; damaged clear → 1; derivation stable across reload.
- **Perks:** each moves a metric (per-wave damage / clear-wave) on ≥1 level with-vs-without; none strictly dominant (Builder's-Guild test); damage perks must cross an integer HP breakpoint (D6).
- **Mutators:** each measurably raises difficulty for a previously-clearing build; no-mutator clear stays challenging (M9); wave transform byte-identical across runs (M5).
- **Gating:** fresh save = rifle + 1 slot; N stars unlock; locked/stale ids sanitize to rifle; save round-trips.
- **Cross-cutting:** tsc clean; no new `Math.random` (grep); zero console errors; validator passes on boot.

---

## 10. Extension seams

1. Hero-buff perks (`heroMods`, applied in `parkHero`/`updateHero`) — named, not built.
2. Enemy-stat mutators (`enemyMods`, one multiply at `spawnEnemy`).
3. "Pact" restriction mutators (`restrict`, option-filter at `loadLevel`) — needs CD-31 levels authored to survive.
4. Garrison-count perks (squadSpec override).
5. Weekly/rotating mutator sets — needs CD-20 seeded RNG.
6. Roguelite draft (OQ1) — presentation layer over perk data, post-CD-20.
7. Score/leaderboard (`scoreMult` reserved) — layers over stars later.
8. Slot growth — one threshold edit.

---

## 11. Decisions that are the user's

- **All naming** (M10): the currency (Merit / Valor / Commendations), perk names (Standing Orders / Reinforced Plating / Long Guns / Rapid Response / War Chest), mutator names (Swarm / Blitz / Fragile Command / Hardened Foe). **Listed, not finalized.**
- **All unlock pacing:** every `unlockStars` threshold, the star counts where perk slots grow, whether mutators are gated at all (recommendation: available from a fresh save so Star 3 is earnable immediately).
- Whether selected mutators persist across sessions like perks, or reset per run (recommendation: perks persist, mutators reset).

Sources:
- [ThroneFall Perk guide (Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3276702564)
- [ThroneFall Perks — lastwordongaming](https://lastwordongaming.com/2023/08/08/thronefall-perks/)
- [ThroneFall's Strongest Perks — TheGamer](https://www.thegamer.com/thronefall-best-strongest-perks/)
- [Overpowered & underpowered upgrades (Steam)](https://steamcommunity.com/app/2239150/discussions/0/4308326918580849935/)
- [ThroneFall Score wiki](https://throne-fall.github.io/about/score.html)
- [Ice Map — Mutators (Steam)](https://steamcommunity.com/app/2239150/discussions/0/5276582961026056169/)
