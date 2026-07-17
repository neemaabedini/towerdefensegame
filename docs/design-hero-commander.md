# Design Doc — CD-29 (Hero Commander) + CD-40 (Commander Abilities), one system

Architect, 2026-07-16. Covers `TICKETS.md` **CD-29** and **CD-40**, `ROADMAP.md` "Hero character" (the 2026-07-16 reversal) and "Phase 3b". Status: designed → ready to slice. Numbers herein are **plausible-but-untuned** (BALANCE FREEZE); every one is flagged and joins the end-of-project tuning pass.

Relevant files: `src/game/Game.ts`, `src/game/types.ts`, `src/input/actions.ts`, `src/main.ts`, `src/data/units.ts` / `units.json`, `src/data/tuning.json`, `src/data/validate.ts`, `src/render/Renderer.ts`, `docs/design-wave-legibility.md` (§7c/Step 5).

---

## 1. Problem statement & constraints

Without a hero, the night is pure set-and-forget: the player watches. The reversal (ROADMAP "Hero character", 2026-07-16) makes the commander **the baseline night-phase avatar** — on the map from the first second of every night, WASD-controlled, auto-attacking, with a death penalty, present from level 1. CD-40's abilities are **the hero's kit** (cast by the hero), not building-emitted. This is the missing agency layer and the last feature standing (with CD-49/CD-30) before the Godot port gate.

**Binding constraints (cited):**

| # | Constraint | Source |
|---|---|---|
| C1 | Movement arrives as a semantic `GameAction` (move-vector), never raw keys in `main.ts`; UI renders from `GameSnapshot` | UI_PLAN principles 1–2; CD-29 locked decision 3 |
| C2 | Engine-agnostic sim: hero lives in `Game`, zero browser APIs; clock seam is `nowMs` | CD-29; `Game.ts:67-72` |
| C3 | No new `Math.random()` in sim paths | CD-20 (open); grep-enforced by QA |
| C4 | Determinism: held-key movement must be identical at 1x and 2x sub-stepping | CD-28; `main.ts` `stepsForFrame` |
| C5 | All stats/defs/penalty numbers in `src/data/*.json`; `validate.ts` is the port's data contract | CD-29; UI_PLAN "Godot 2D" |
| C6 | Single-screen 960×540, no camera | CD-29 locked decision 3; ROADMAP OQ2 |
| C7 | Pause/modal discipline: movement + casts swallowed while modal open, guarded in JS not CSS | CD-34 |
| C8 | Lone fighter — hero does NOT rally troops; garrisons keep auto-anchoring; no unit-command verb | CD-29 locked decision 2 (our #1 differentiator) |
| C9 | Balance freeze — ship plausible numbers, name each mechanic's QA metric up front | CD-37 lesson; TICKETS freeze block |
| C10 | One new targeting verb works identically on mouse/keyboard/controller/touch | ROADMAP Phase 3b; CD-40 |

---

## 2. Thronefall research (king mechanics) and per-decision verdicts

What their game actually does, verified:

- **The king is on the map every level, WASD-driven, auto-attacking; you pick one weapon pre-level.** Each weapon is a **passive auto-attack + one active ability on cooldown** ([Weapons wiki](https://throne-fall.github.io/game-content/weapons/), [TheGamer ranking](https://www.thegamer.com/thronefall-best-weapons-ranked/)). This is *exactly* our CD-29 hero + CD-40 kit shape.
- **Death:** the king becomes "a ghost, floating around waiting for your respawn timer" ([TheGamer, 8 things](https://www.thegamer.com/thronefall-things-know-before-playing/)); while dead he can't command units; he respawns at base. Retrying a day carries a **score penalty** ([NamuWiki](https://en.namu.wiki/w/Thronefall)).
- **Enemy focus:** "ranged and flying enemies will focus their attacks on your king" when he's exposed ([git-gud guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3109796946)).
- **Rally:** press-R gather — their community's **#1 complaint** (micromanagement).

| Decision | Thronefall does | Verdict |
|---|---|---|
| Hero on map every night, WASD, auto-attack | Yes (king) | **ADOPT** — this is the reversal |
| Weapon = passive auto + active-on-cooldown | Yes | **ADOPT** — maps 1:1 to hero auto-attack + CD-40 ability |
| Ride-around-and-build during the **day** | Yes | **REJECT (not-applicable):** our day is site-selection driven; park hero at HQ (§4). |
| Press-R rally troops | Yes | **REJECT** — their #1 complaint; C8, our #1 differentiator |
| Mid-wave respawn timer | Yes | **REJECT for v1** — out-until-dawn (§5); simpler, anti-spiral, parallels dawn-restoration. Left as a JSON seam. |
| Ranged/flyers focus the exposed king | Yes | **ADOPT partially** — local body-block/draw-fire only; do **not** globally magnetize the wave. §7. |
| Weapon choice pre-level | Yes | **ADOPT as a seam** — one default hero v1; keyed `hero.json` ready for CD-30 loadouts. |
| Self-cast active (fires from the king) | Yes | **ADOPT** — Sensor Pulse casts where the hero stands, zero targeting UI (§6). |

StarCraft cross-reference: the **Ghost/nuke designate→arm→confirm** flow is the canonical model for the later cursor-targeted airstrike/nuke — mapped to the `targeting: "point"` seam in §6.

---

## 3. Considered options (the load-bearing choices)

**(A) Where does hero move-intent enter the sim?**
- A1 — raw keys read in `main.ts`, position mutated from the render loop. **Rejected:** violates C1/C2.
- A2 — **latched move-vector `GameAction`** set as a sim field, integrated per tick. **Recommended.** Portable (stick/joystick/keys all produce a vector), deterministic under sub-stepping (§8), engine-agnostic.
- A3 — move-to-target (click destination + pathfind). **Rejected:** needs pathfinding deferred to CD-9; reads like a unit-command (the idiom C8 rejects); doesn't map to a held analog stick.

**(B) Hero data home:** extend `units.json` vs new `hero.json`.
- **New `hero.json` (recommended)**, keyed by id, sharing only the *combat field shape*. The hero is not a garrison unit — no leash/anchor, has abilities, death penalty, (later) weapon variants. Keyed-by-id is what CD-30's loadout selection wants.

**(C) Abilities data + dispatch:** hardcoded switch vs effect registry.
- **`abilities.json` + an `AbilityEffect` discriminated union resolved by a small registry (recommended).** Airstrike and nuke are explicitly coming (two more `kind`s) — "registry over switch when a third case is plausible."

---

## 4. Day phase — where is the hero?

> **SUPERSEDED 2026-07-16 (user decision):** the hero is **drivable during the day** — pre-positioning
> before the next wave, like Thronefall/Orcs Must Die. Input split: WASD = hero in both phases, arrows =
> site/building nav (night inspection nav restored). Dawn heals a living hero **in place**; only death
> (or a fresh level) returns it to the HQ. §6's Sensor Pulse is also **cancelled** (the Breakers squad
> covers the slow role); hero power growth comes from weapon unlocks via CD-30. Original text below
> retained for the record.

**Parked at the Command Post during the day, rendered idle beside it, not controllable.** Day input stays 100% `nav` site-selection. At `startNight()` the hero **deploys** (controllable, positioned at the HQ, full HP). At dawn/victory it returns and is restored — parity with dawn restoration of buildings and squads.

Cheapest coherent answer, and it dissolves the WASD collision (§9): day WASD = `nav`, night WASD = hero.

---

## 5. Death penalty

**On death, the hero is out for the remainder of the current night — no mid-wave respawn — and returns automatically at dawn at the HQ, full HP.** The cost: you lose the hero's DPS, body-block, and casts for the rest of that night. No money loss, no permanent stat loss.

Why this over Thronefall's mid-wave ghost-timer:
- **Anti-spiral (ROADMAP KTC lesson).** The penalty caps at one night's hero contribution and cannot compound — dawn restoration applies to the hero identically to wrecks and squads.
- **Not load-bearing (C9 metric).** The hero must be *additive* power — base defenses must still win without it. If the hero is essential, an early death = guaranteed night-loss, which reads as a spiral. Tuning obligation, flagged.

**Seam:** `hero.json` carries `respawn: { atDawn: true, midWaveSeconds?: number }`. v1 ships `atDawn: true`. A softer penalty later is one JSON edit.

At 0 HP mid-wave: `alive = false` → removed from movement, combat, targeting, casts; snapshot exposes `hero.alive` so the HUD greys ability buttons and the renderer draws a downed marker.

---

## 6. Ability targeting flow (CD-40)

**Sensor Pulse v1: cast-at-hero-position ("where you stand"), zero targeting UI.** Press the ability input → pulse fires centered on the hero → every enemy within `radius` gets `slowTimer = slowSeconds`. The slow mechanism already ships (`UnitDef.slowSeconds` path; `TUNING.enemies.slowMultiplier`). Thronefall's model: one button, no cursor, identical on every device (C10). **ADOPT.**

The verb: `{ kind: "ability"; index }` → `Game.castAbility(index)` (cooldown check → apply effect at hero pos). No target step for `"self"` abilities.

**Seam for cursor-targeted airstrike/nuke later.** `AbilityDef.targeting: "self" | "point"`. A `"point"` ability enters an `aiming` sub-state holding `pendingAbility` + a reticle; `confirm` casts, `cancel` aborts. Reticle driven by the same directional semantics as movement (keys/stick nudge; mouse/touch place). StarCraft's nuke adds `armDelaySeconds` on top. v1 ships none of this — named extension seam.

---

## 7. Hero ↔ enemy interaction

**Auto-attack:** reuses the unit combat path — `findTarget(hero.x, hero.y, range, targets)` → `hurtEnemy`/`applyDamage` on cooldown. Effectively a mobile, player-positioned garrison unit with no leash. No new combat math.

**Do enemies target the hero?** v1: **local body-block only, no global aggro.** Enemies keep their shipped priority (blocking unit > building > HQ). The hero is inserted as a **candidate blocker**: a melee enemy adjacent to the hero engages and attacks it exactly as it would a garrison unit; a standoff enemy point-blank fires at it. The hero draws fire *when close* but does **not** magnetize the whole wave — avoiding the kite-the-world degenerate.

**Body-block:** an adjacent enemy becomes `engaged` (stops to attack the hero), so the hero physically stalls a lane while alive — that *is* the agency. No physics push v1.

**Flyers:** ignore the hero (overfly, per D6). Hero fights back at flyers only if its `targets` includes air. **v1 hero `targets`: `"ground"`** — keeps the hero from undercutting the missile-battery niche. Flagged tunable.

---

## 8. Determinism under sub-stepping (the subtle constraint, C4)

The rule: **hero move-intent is a latched sim field, and input mutates it only at frame boundaries — never between sub-steps.**

- `main.ts` keydown/keyup maintain a held-key `Set`; on every edge the normalized 8-way vector is emitted as `heroMove` → `game.setHeroMove(dx,dy)` stores it on `Game.heroMoveDir`.
- `Game.update(dt)` integrates `hero.x += dir.x * moveSpeed * dt`, clamped to 960×540 — structurally identical to `enemyStep`.
- At 2x, `stepsForFrame` calls `update(dt)` twice with the same `dt` and the **same latched vector** (input handled between frames, not sub-steps). Two sub-steps of one velocity ≡ two 1x frames with no input between. This is CD-28's verified invariant, inherited.
- **Ability casts are edge events** — fire once regardless of speed. Cooldowns tick by `dt` per sub-step (consistent with a 2× faster night).
- **No `Math.random`** in hero/ability paths. The 8-way vector components are fixed constants (±0.7071); analog floats are deterministic given the same input stream (the transmitted vector *is* the input — CD-20 lockstep safe).

De-risk: headless test — fixed input script at 1x for N ticks vs 2x for ⌈N/2⌉ frames, assert identical hero position (CD-28's method).

---

## 9. Input coexistence — resolving the WASD collision

Today WASD → `nav` in both phases. Resolution — **phase-gate the same keys at dispatch**:

1. `actions.ts` gains `{ kind: "heroMove"; dx; dy }` and `{ kind: "ability"; index }`.
2. **Movement adapter (`main.ts`):** held-direction-key `Set` via keydown/keyup. On every edge, derive the vector and — **only when `phase === "night"`** — emit `heroMove`. The dispatcher applies `nav` **only when `phase === "day"`**.
3. **Night building-inspection nav is demoted to mouse/touch** (`selectAt` already works). It was only "watch HP"; at night you now *do* something.
4. **Abilities on the number row at night + `Q` alias.** Day `1`–`4` = build/branch (unchanged). Night `option(n)` routes to `ability(n-1)`; `Q` = `ability(0)`. The planned controller radial and touch buttons for `option` get abilities at night for free.
5. **Phase-transition hygiene:** entering night re-emits `heroMove` from the held set; entering day emits `heroMove(0,0)`. Sim zeroes `heroMoveDir` off-night and `setHeroMove` is a no-op off-night — defense in depth.

**Pause discipline (C7):** `heroMove`/`ability` route through the existing guarded dispatcher (swallowed while modal open). The held-key `Set` keeps updating during pause (a release mid-pause can't strand a latched vector); the sim doesn't tick while paused. Re-latch on unpause. Guarded in JS, per CD-34.

---

## 10. Data model & module changes

**New — `src/data/hero.json`** (keyed by id; `commander` default):
```
commander: {
  name, maxHp, moveSpeed, damage, fireRate, range,
  targets: "ground", radius,
  abilities: ["sensor_pulse"],
  respawn: { atDawn: true },          // seam: midWaveSeconds?: number
  color, accent
  // seam (unused v1): energy?, for caster-energy anti-spam
}
```
Plausible untuned v1: `maxHp 200, moveSpeed 90, damage 12, fireRate 1.5, range 100, radius 8`.

**New — `src/data/abilities.json`:**
```
sensor_pulse: {
  name: "Sensor Pulse",
  targeting: "self",                  // seam: "point"
  cooldown: 12, radius: 130,
  effect: { kind: "slow", slowSeconds: 2.5 }
}
```
`AbilityEffect` union: `{ kind: "slow"; slowSeconds }` v1; later `{ kind: "damage"; damage; falloff }` (airstrike) + `armDelaySeconds` (nuke).

**New loaders** — `src/data/hero.ts`, `src/data/abilities.ts`, mirroring `units.ts`.

**`src/game/types.ts`:** `HeroState { defId; x; y; hp; maxHp; alive; deployed; facing; cooldowns: Record<string, number>; aiming? }`; `GameSnapshot.hero: HeroState | null`; `GameEvent += heroDied | abilityCast | heroRespawned`.

**`src/game/Game.ts`:** `hero`/`heroMoveDir` fields; `deployHero()` at `startNight`; dawn restore; `setHeroMove`, `castAbility`; `updateHero(dt)` in `updateNight`; blocker-candidate insertion at the `nearestLivingUnit` call sites.

**`src/input/actions.ts`:** two new action kinds; `Q` → `ability(0)`; WASD → `nav` unchanged.

**`src/main.ts`:** held-key `Set` + keyup listener; phase-gated dispatch; night `option(n)` → `ability`; phase-transition re-latch.

**`src/render/Renderer.ts`:** hero draw pass, vector-fallback-first (atlas key `hero:<weapon>:<frame>` later per CD-32); cast telegraph ring; downed marker. Does not depend on CD-10.

**`src/ui/HUD.ts`:** ability bar from `snapshot.hero.cooldowns` (button + cooldown ring + key badge); no hover-only info.

**`src/data/validate.ts`** gains: every `hero.abilities[]` id exists; every `effect.kind` known; `slow` ⇒ `slowSeconds > 0`; `targeting ∈ {"self","point"}`; `cooldown ≥ 0`; `radius > 0`; hero combat fields present & positive; `targets` valid.

---

## 11. Platform impact table

| Concern | Browser (now) | Godot 2D (PC) | Controller | Mobile |
|---|---|---|---|---|
| Move | Held WASD → 8-way `heroMove` vector | InputMap `hero_move` → same action | Left stick → `heroMove` (analog, no code change) | **Left-thumb virtual joystick** — new; UI_PLAN's "no joystick needed (no hero)" line is now obsolete, flag it |
| Ability | `Q` / night `1`–`4` | InputMap verbatim | Face button / night `option` radial | Bottom-right buttons (≥44px, safe-area) |
| Targeting (v1 self-cast) | one button, no cursor | same | same | same — C10 by construction |
| Targeting (point seam) | cursor + confirm | same | reticle via move-vector + A | tap-to-place + confirm |
| Render | vector fallback → atlas | Node2D, same atlas PNG | — | — |
| Sim | `Game`, no browser API | GDScript reads same `hero.json`/`abilities.json` | — | — |
| Determinism | latched vector, per-substep safe | same (lockstep co-op) | — | — |

---

## 12. Extension seams

1. **Escort garrison returns (someday).** `GarrisonUnit` reads its anchor's live position and never caches it (comment names CD-29). To attach an escort: generalize the anchor lookup to resolve a hero anchor (`anchorKind: "building" | "hero"`). **Not built** — lone-fighter model — but the door is named.
2. **Cursor-targeted airstrike + nuke (CD-40 later).** `targeting: "point"` + reticle aim flow + `damage` effect kind (+ `armDelaySeconds`). Gated behind the **Ordnance** CC pick (§7c seam). Later JSON additions.
3. **Weapon choice / hero loadout (CD-30).** `hero.json` keyed by id; pre-level `heroId` flows in like a perk. v1 = one default `commander`.
4. **Caster-energy anti-spam.** Reserve `hero.energy` + `ability.energyCost`; v1 cooldown-only (Thronefall's model).
5. **Ability bar scales to N** — `abilities: string[]` + `ability(index)` already index a list.

---

## 13. Implementation slices (each playable + tsc-clean)

**Slice 1 — Fighting avatar. Closes CD-29.** (Build order: movement+render → auto-attack → enemy-interaction+death.)
- `hero.json` + loader + validator checks; `Game` fields + `deployHero` + dawn restore + `updateHero` (integrate+clamp, auto-attack, out-until-dawn death), blocker insertion; `actions.ts` `heroMove`; `main.ts` held-key Set + phase-gated dispatch + re-latch; `GameSnapshot.hero`; Renderer vector hero + downed marker.
- **Result:** hero moves and fights every night, body-blocks, can die, restores at dawn.

**Slice 2 — Sensor Pulse. Closes CD-40 v1.**
- `abilities.json` + loader + `AbilityEffect` registry (`slow`) + validator; `hero.abilities`; `actions.ts` `ability`; `Q` + night `option(n)` routing; `Game.castAbility`; snapshot cooldowns; HUD ability button + cooldown ring; cast telegraph.
- **Result:** press Q → area slow.

**Slice 3 — LATER, explicitly deferred: airstrike + nuke.** `damage` effect kind + `targeting: "point"` aim flow + nuke `armDelaySeconds`, gated behind the Ordnance CC pick. Two JSON entries + one registry handler + the point-targeting seam.

---

## 14. Risks and cheapest de-risk

| Risk | Cheapest de-risk |
|---|---|
| Held-key movement diverges at 1x vs 2x (C4) | Headless test: fixed input script, byte-identical position at 1x (N ticks) vs 2x (⌈N/2⌉ frames) — CD-28's method |
| Hero magnetizes/kites the whole wave | v1 does not alter global targeting (local body-block only); metric "% of wave chasing hero" ≈ 0 by construction |
| Hero becomes load-bearing DPS / trivializes air | `targets:"ground"` v1; metric "win-rate without hero" — base defenses must still win (hero = margin, not pillar) |
| Death spiral across nights | Out-until-dawn caps the penalty at one night; dawn restores. Verified by the not-load-bearing metric |
| WASD day/night collision regressions | Explicit phase-gate (§9) + keyboard regression script |
| Hero walks through rocks / off-map | Clamp to bounds v1; obstacle collision deferred to CD-9 (hero ignores terrain cosmetically, like pre-CD-9 enemies) |
| Snapshot live-ref for `hero` (CD-15) | Follow the shipped pattern; flag for CD-15 cleanup |
| New `Math.random` in a sim path (CD-20) | Grep gate in QA; movement is integration, slow is a radius scan |

---

## 15. QA test plan with named metrics (C9 / CD-37)

- **Hero combat value** — *damage added per night* (hero contribution / total wave HP) and *deaths prevented* (building+HQ damage delta with hero vs without, same build + input script). Target: meaningful (~10–25%) but the build still clears **without** the hero. Grades `damage/fireRate/range`.
- **Death penalty cost** — *HQ+building damage in nights where the hero died vs survived* (same build). Must be a visible swing but not an automatic loss. Grades out-until-dawn + `maxHp`.
- **Sensor Pulse** — *average enemy time-in-slow per cast* and *damage-prevented per cast*. Every cast must produce a measurable defensive gain (no-trap). Grades `cooldown/radius/slowSeconds`.
- **Determinism** — byte-identical hero trajectory across repeat runs and across 1x/2x for a fixed input script; no new `Math.random` (grep).
- **Input coexistence** — live keyboard: day WASD selects sites; night WASD moves the hero and does not move selection; `Q`/night-`1` casts; all swallowed while paused.

---

Sources:
- [Thronefall Weapons wiki (passive + active-on-cooldown structure)](https://throne-fall.github.io/game-content/weapons/)
- [TheGamer — 8 Things Before Playing (ghost + respawn timer)](https://www.thegamer.com/thronefall-things-know-before-playing/)
- [TheGamer — All Weapons Ranked](https://www.thegamer.com/thronefall-best-weapons-ranked/)
- [Steam guide — How to git gud (enemies focus the exposed king)](https://steamcommunity.com/sharedfiles/filedetails/?id=3109796946)
- [NamuWiki — Thronefall (retry-day score penalty)](https://en.namu.wiki/w/Thronefall)
