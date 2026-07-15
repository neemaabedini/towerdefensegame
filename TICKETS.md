# Tickets

Lightweight tracker for features, bugs, and balance work. One line per
ticket; details inline or linked to ROADMAP.md / UI_PLAN.md sections.

Format:
`- [ ] CD-<n> (<type>, <priority>) — <title> — <notes>`
Types: feature | bug | balance | tech-debt. Priority: P1 (next) → P3 (later).
Mark done with `[x]` and append the date. Agents: architect designs P1
features that span modules; coder implements; qa-engineer verifies and
appends new bug/balance tickets here.

## Open

- [ ] CD-37 (balance, P2) — Garrison's non-dead-option status still not decisively demonstrated in the
  counter matrix — RE-MEASURED live (2026-07-14) against the CD-38 roster (garrison now fields a real
  marine/sniper squad with body-block + transient AA, replacing the inert bunker this ticket originally
  flagged). Design-doc QA test plan item 3 requires a garrison→gun_tower swap in a mixed build to raise
  W4-6 damage ≥40% or cause a defeat. It still does not reproduce: baseline mixed build (garrison d1+a1,
  gun_tower d2, siege_tank d3, missile_battery d4, sniper_tower d5, sensor_array a2, refinery p1,
  barracks p2; true-cheapest-cost-first upgrades) took W4+W5+W6 = 540+776.4+1520.5 = 2836.9 total damage;
  swapping both garrisons to gun_tower took 511+522.1+1259 = **2292.1 (−19.2%, a decrease, not the
  required +40% increase)**; single-swap variants (d1-only, a1-only) also decreased damage (−10.3%,
  −9.2%). No variant introduced an earlier defeat (all three, baseline included, first defeat at W6).
  This is the same qualitative outcome as the original bunker-era finding, for the same underlying reason:
  gun_tower's DPS/credit is higher than garrison's by design (design doc's own math: 24 vs 40 marginal
  DPS/₡ — "garrison is depth, not dominant"), so in a build already carrying strong DPS elsewhere, losing
  the garrison's kill contribution is more than offset by the freed-up money. **Important companion
  finding (see qa-engineer session 2026-07-14, Porousness section): garrison's real value IS now
  demonstrable — a lone garrison (even L3 riflemen, the strongest configuration) cannot hold a lane
  past wave 3-4, and a garrison-only build (4 garrisons, nothing else) hard-loses at W4 — so garrison is
  correctly non-dominant AND has a genuine defensive niche (delay/body-block), but that niche doesn't
  show up as *raised damage* in a swap test the way missile/sniper/siege's kill-capability gaps do.**
  Recommend the architect either (a) redefine this test's garrison criterion around a metric the
  body-block mechanic actually moves (e.g. buildings-destroyed count, or money saved on upgrades
  elsewhere in the swapped build), or (b) a targeted buff making garrison's block cheaper/stronger
  relative to gun_tower's raw output. Not blocking CD-38's closure (same precedent as the original
  CD-35→CD-36/CD-37 split) — garrison is confirmed non-dominant and functionally distinct, just not
  "decisively demonstrated" by this specific matrix metric.
- [ ] CD-39 (balance, P3) — Design doc's porousness math ("single L1 garrison, nothing else... ≥3 leak
  even in W1") is measurably wrong, and Batch 3's own spot-check undercorrected it — found during CD-38
  QA (2026-07-14). Precise instrumented test (single L1 garrison alone at d1, forced to W1, zero other
  defenses): all 9 raiders died, squad took zero losses, but the HQ still took **36.25 real damage**
  (dipped to 563.75/600, 94%) — a small but nonzero leak from raiders that walked outside the marine
  squad's 150px detection radius and reached the HQ's own contact range before the HQ's baseline gun
  finished them off. This contradicts Batch 3's implementer spot-check (logged against CD-38 during
  implementation, 2026-07-14: "a single L1 garrison alone at d1 took wave 1 with zero leaks and zero HQ
  damage, all 3 marines survived") — the hold is real but not perfectly clean; the implementer's live
  eyeball spot-check likely missed a 6%-of-max HP dip. Separately, isolated same-lane-only stress tests (no cross-lane
  confound) show the TRUE break point is wave-dependent, not wave-1: a best-positioned L1 garrison holds
  W1 almost cleanly (94→97% HQ) and even W3 numerically (all enemies eventually die, but HQ dips to 43%),
  then hard-fails (defeat) from W4 onward; even L3 riflemen (7 marines, the strongest configuration)
  holds W3 with zero HQ damage but still hard-fails at W4 and is wiped out by W5. Recommend correcting
  the design doc's math section (the "≥3 leak in W1" line) to reflect the real break point (~W3-W4), not
  a wave-1 number — no fallback knob needed; a 110₡ tutorial-wave-passing building is fine, and the real
  invariant the user cares about ("never holds a lane against a sustained wave, never carries a level
  alone") is independently confirmed true at W4 in every configuration tested, including the strongest.

- [ ] CD-5 (feature, P2) — Gamepad adapter — Gamepad API polled in the rAF
  loop, translating to GameActions (UI_PLAN.md; needs CD-1 for a good
  controller story).
- [ ] CD-6 (feature, P2) — Projectile & muzzle-flash sprites — extend the
  atlas; barrels rotate toward targets (ROADMAP art pipeline step 5).
- [ ] CD-7 (feature, P2) — Economy rework: mining near crystals + vespene
  geysers + one research slot (ROADMAP Phase 2; architect first).
- [ ] CD-40 (feature, P2) — Commander abilities (ROADMAP Phase 3b; architect
  first) — filed 2026-07-15 to close a tracker gap: Phase 3b was only ever
  referenced inside CD-8's body ("commander abilities follow as Phase 3b"),
  and CD-8 is now closed as shipped-by-CD-38, so this had no ticket of its
  own despite sitting on the roadmap's critical path. Targeted actives on
  cooldown: **Sensor Pulse** (area slow from the Command Center) first —
  enemies already carry a `slowTimer`, so it is nearly free — then airstrike
  (burst damage zone) gated behind CD-7's research facility, then a nuke
  research capstone. Adds exactly one new input verb (select ability →
  target → confirm) that must work identically on mouse/keyboard/controller/
  touch, so it lands on the `GameAction` layer (UI_PLAN.md), not on mouse
  handlers. Anti-spam: long cooldowns or caster energy. Note the naming
  constraint from ROADMAP's IP rules — "Sensor Pulse", never "Scanner
  Sweep". **Gate significance: ROADMAP's Godot port gate is "Phases 2–3
  stable and fun". Phase 3a shipped with CD-38, so CD-7 + this ticket are
  the last two things standing between the project and the port decision —
  and CD-31 (campaign content) is explicitly blocked behind that decision.**
- [ ] CD-9 (feature, P3) — Flow-field pathfinding over a nav grid from
  obstacles; roads as cost discounts — AND the wall system it unlocks:
  grid-snapped freely-placed wall segments (no weapon, HP, smashable —
  enemies chew the weakest link if the detour is too long or no route
  exists; dawn-rebuilt like everything else). Walls = the free-form
  geometry layer; combat power stays in slotted towers (ROADMAP Phase 4;
  architect first). StarCraft flavor: supply-depot wall-off; possible
  raise/lower gate mechanic later.
- [ ] CD-10 (tech-debt, P3) — Split Renderer into terrain/buildings/units/fx
  layers once units land.
- [ ] CD-15 (tech-debt, P3) — `Game.getSnapshot()` (`src/game/Game.ts`)
  returns the live internal arrays (`this.buildings`, `this.sites`,
  `this.enemies`, etc.) by reference rather than cloning them, so a
  `GameSnapshot` a caller holds onto silently mutates after the fact (e.g.
  `b.level` on a previously-captured snapshot changes when `upgrade()` runs
  later). No current consumer is affected since HUD/UI always re-fetch a
  fresh snapshot per render, but it breaks the "snapshot" contract the type
  name implies and will bite any future code that diffs or caches
  snapshots (replay, analytics, undo). Suggested fix: shallow-clone the
  array fields (and their element objects) in `getSnapshot()`.

- [ ] CD-16 (feature, P2) — Naming & lore pass (IP differentiation) — invent
  original identities per ROADMAP "IP differentiation" rules: defender
  faction name, enemy species name, rename in-game "Siege Tank" (only
  shipped Blizzard-specific name; display name only, keep the `siege_tank`
  id), ability names (Sensor Pulse not Scanner Sweep, Plasma Wells not
  vespene), and a distinctive game title to replace the generic
  "City Defense" before any public page. Creative session with the user —
  don't auto-generate and commit names without their sign-off. Demo-
  milestone QA note (2026-07-14): every other Batch 1-5 ticket for the demo
  slice (CD-2, CD-3, CD-24, CD-25, CD-26, CD-27, CD-28) is now QA-verified
  and closed — the demo is functionally complete end-to-end. This naming
  session is the only remaining gate before the demo can go in front of
  anyone; the title-slot/rename seam (`src/data/strings.json`,
  `buildings.json` "Siege Tank" name field) is already wired and waiting.

- [ ] CD-17 (feature, P3) — Godot spike (1–2 days, do well before the real
  port): new Godot 4 project that loads `src/data/*.json`, renders one level
  (terrain/paths/sites/sprite PNGs exported from the atlas), and runs one
  wave with dumb movement. Goal is de-risking data formats and estimating
  the true port cost — not shipping anything. Full port gate: after Phases
  2–3 mechanics lock (see ROADMAP "Godot port timing").

- [ ] CD-20 (tech-debt, P2) — Deterministic sim: replace `Math.random()`
  inside `Game` (burst particles live in sim state) with a seeded RNG, and
  move `Game.update` to a fixed tick (accumulator in the rAF loop; renderer
  may interpolate). Enables lockstep online co-op (ROADMAP "Co-op") and
  action-replays for QA regression testing. Cheap now, expensive to
  retrofit — do before Phase 3 systems multiply the sim surface.

- [ ] CD-29 (feature, P2, v1.0) — Hero commander (ROADMAP Phase 5): WASD
  mobile anchor with escort garrison (reuses Phase 3a system), utility-
  leaning kit, time-cost death penalty. Architect first. Its prerequisite
  (the Phase 3a anchor/squad system, formerly CD-8) shipped with CD-38, so
  the hero's escort should reuse that engine rather than add a second one.
- [ ] CD-30 (feature, P1, v1.0) — Meta progression: per-level stars
  (win / no-HQ-damage / mutator win), unlockable perks chosen pre-level,
  mutators as stat-modifier layers over the JSON defs (ROADMAP Phase 5;
  the retention driver every studied community ranks top).
- [ ] CD-31 (feature, P1, v1.0) — Campaign content: grow 2 levels to 8–12
  with a difficulty/mechanic introduction curve (new enemy or building
  unlock every 1-2 levels), integrated tutorial level 0. Build after the
  Godot port gate decision (content belongs in the shipping engine).
- [ ] CD-32 (feature, P2, v1.0) — Final art pass: replace the procedural
  pixel builders in sprites.ts with hand-made (or commissioned) sprite
  sheets via the same atlas API; per-entity swap, enemies first.
- [ ] CD-33 (feature, P2, v1.0) — Audio pass 2: music (day/night themes,
  finale escalation), announcer lines ("Hostiles inbound, Commander"),
  full mix pass. Builds on CD-3's SFX foundation.

## Done

- [x] CD-8 (feature, P3) — Garrisons: units as a tower upgrade axis —
  superseded and shipped by CD-38's roster redesign (closed 2026-07-15,
  bookkeeping only, no new code). The garrison building
  (`src/data/buildings.json`) fields a marine squad with a level-2 branch
  choice (riflemen vs sniper team), backed by `src/data/units.json` and the
  units engine in `Game.ts`; anchored/auto-attacking/body-blocking with no
  unit command verb, and free full-heal dawn respawn — all ten of the
  design doc's test-plan points QA-verified under CD-38. Phase 3b
  (commander abilities) remains unticketed and is the real Phase 3
  remainder.
- [x] CD-34 (tech-debt, P3) — Canvas click handler has no explicit pause
  guard — fixed 2026-07-15. Added the ticket's own suggested backstop to
  `src/main.ts`'s canvas click handler: the early return is now
  `if (shell.screen !== "game" || shell.modal !== "none") return;`, giving
  the mouse path the same JS-level defense-in-depth the keyboard
  dispatcher already had instead of relying solely on `#pause-modal`'s
  z-index to occlude the canvas. `AppModal` is `"none" | "pause"`, so the
  `!== "none"` form also covers any future modal kind by construction.
  `npx tsc --noEmit` passes clean. Behavior is unchanged today (QA had
  already confirmed the CSS occlusion made this non-exploitable) — this
  removes the single point of failure, it does not fix a live bug.

- [x] CD-38 (feature, P1) — Tower roster redesign "Terran doctrine, ThroneFall structure" — QA verified
  (2026-07-14) against the design doc's full 10-point test plan (`docs/design-roster-redesign.md`), all
  4 batches (air lane + sniper tower / branch mechanism + gun tower / units engine + garrison / wave
  retune). Garrison replaces bunker (fields a marine squad, body-block + modest AA, upgrade choice =
  riflemen vs snipers); missile battery is now air-only (cannot hit ground); sniper tower is new
  (ground-only armor-cracker); gun tower branches (rapid vs longbarrel). **1. All-gun-tower regression
  (permanent test): PASS.** Gun tower on every one of 7 defense sites, cheapest-upgrade-first, no
  production → hard defeat W4 (HQ 0/600, 740 total damage), byte-identical for both branches (rapid and
  longbarrel never grant AA — `targets` stays "ground" either way). Day-4 forecast panel showed the AIR
  badge (`.forecast-badge-air`, text "AIR") live in the DOM. **2. Porousness: PASS, with the design doc's
  W1 math corrected (see CD-39).** Re-derived the real invariant per the user's framing ("a garrison must
  never hold a lane against a sustained wave, and must never carry a level alone") and tested it directly
  rather than the doc's literal wave-1 number: isolated same-lane-only stress tests show a best-positioned
  L1 garrison holds W1 almost cleanly and even W3 numerically (HQ dips to 43%, everything still dies), but
  hard-fails (real defeat) from W4 onward; even the strongest possible configuration (L3 riflemen, 7
  marines, fully funded) holds W3 with zero HQ damage but still hard-fails at W4 and is wiped out by W5 —
  so no configuration, however strong, can carry a lane alone past wave 3-4. Unit count is strictly
  non-increasing during any night (0 violations across ~15 instrumented night-runs); dawn respawn is a
  free full heal+resize, verified directly (a unit wounded to 12/50 hp came back at 50/50 the instant a
  wave cleared). A garrison-only build (4 garrisons on every garrison-capable site, riflemen upgrades,
  zero other defense/production) hard-loses at W4 (HQ 0/600) — confirms garrison-spam is not a new
  dominant strategy. **3. No-dead-options matrix sweep (CD-37 closure attempt): 3 of 4 PASS, garrison
  does NOT reproduce — CD-37 stays open, see its ticket for full numbers.** missile_battery→gun_tower:
  W4 defeat (980 dmg vs baseline's 540, matches doc). sniper_tower→gun_tower: W4 defeat (940 vs 540,
  walker failure). siege_tank→gun_tower: no earlier defeat but W5 HQ minimum falls from 93.9% to 26.4%
  (swarm failure, clearly measurable). garrison→gun_tower: damage *decreases* ~19% across W4-6, no swap
  variant introduces an earlier defeat — same qualitative result as the original bunker-era CD-37 finding.
  **4. W6 climax (CD-36 closure): PASS, see CD-36 below.** **5. Branch coverage: PASS.** Both branch pairs
  (gun tower rapid/longbarrel, garrison riflemen/snipers) verified via real DOM interaction: mouse click
  on a `.branch-chip` and a real dispatched keyboard "2" keydown both correctly resolve the choice;
  same-day undo fully removes the building (refunds spent-today exactly); later-day undo-upgrades reverts
  level and clears `branchId` (garrison's squad correctly resyncs back to base marines); a forced
  destroy→dawn-rebuild cycle preserves `branchId` and squad composition for both pairs; "U" with a branch
  choice pending is a verified no-op (level/branchId/money all unchanged). **6. Air-lane economics: PASS.**
  A build with zero air-capable defense (garrison excluded) hard-defeats at W4. A build with garrisons
  providing only their incidental transient AA (no missile battery) survives but perilously (HQ minimum
  10% at W5 in a full 6-wave run; 5.9% in an isolated single-wave stress test) — confirms "heavy air
  damage," right at the edge of defeat. Adding one missile battery to the same build clears comfortably
  (HQ never below 66.7%). Marine kill rate confirmed <1 skimmer per garrison pass: an isolated test of a
  single L1 garrison against 6 skimmers killed 0 of them outright with marine fire alone — every skimmer
  needed the HQ's own backup gun to finish it off, exactly matching the design doc's "marines soften air;
  missiles kill air" framing. **7. Ridge Pass full pass: PASS.** A mixed build (garrison/missile/sniper/
  gun/siege/production) clears (victory, HQ minimum 336/600 = 56%); AA (missile_battery) reachable and
  built day 1; sniper_tower built by day 2, well inside the "day 4" requirement; garrison functions
  normally (zero HQ damage through W1-4). **8. Events & hygiene: PASS.** `unitFired`/`unitDied` counts
  track real combat throughout; source grep confirms no new `Math.random()` in `Game.ts` (only the
  pre-existing cosmetic `burst()` helper, already CD-20 tech debt); zero references to "bunker" anywhere
  in `src/ui/` (hints are fully building-agnostic by construction, so level-1 hints are unaffected by
  construction, not just by luck); a zero-garrison playthrough (all gun towers) emits zero `unitFired`/
  `unitDied` events and has zero live units at any point, confirming the unit system is fully inert when
  unused; zero console errors across the entire QA session (~30+ scripted playthroughs plus live UI
  interaction). Minor hygiene nit (not filed as a ticket): `src/audio/sfx.ts` still registers an unused
  `shot_bunker` sound recipe as dead code — harmless, `bindings.ts` correctly no longer references it.
  **9. Persistence: PASS.** Wrote a save matching the pre-CD-38 schema (identical to the current schema —
  `SaveDataV1` never stored building ids) directly to `localStorage`, reloaded the page fresh, confirmed
  clean load with all fields intact (unlocked levels, per-level results, settings, hintsSeen) and level 2
  correctly unlocked. **10. Perf smoke: PASS, comfortably.** 4 garrisons at L3 riflemen (28 live units)
  plus a synthetic 40-enemy mixed wave (peak 30 concurrent enemies, 28 units, 6 projectiles):
  `Game.update(0.05)` averaged 0.029ms/tick, p95 0.1ms, worst single tick 0.9ms — under 6% of a 16.7ms
  frame budget even at the worst observed tick. **Overall verdict: the game now demands combined arms.**
  Pure single-type strategies both fail hard (all-gun-tower W4, garrison-only W4); AA is mandatory and
  purchasable once skimmers appear, never incidental; armor (sniper tower) and swarm (siege tank) each
  guard a real niche confirmed by the matrix sweep. No new dominant strategy was found. Garrison's niche
  (lane delay + modest transient AA) is real and independently demonstrated by the porousness tests, but
  the specific counter-matrix "swap raises damage" metric still doesn't capture it (CD-37, reopened with
  new evidence). Filed CD-39 (design doc's W1 porousness math needs correcting) and re-evidenced CD-37
  (garrison-swap still doesn't reproduce) rather than blocking this closure — same precedent as CD-35's
  original closure spinning off CD-36/CD-37.
- [x] CD-36 (balance, P2) — Mixed defense build takes more damage in wave 5 than wave 6, contradicting
  the "W6 is the climax" design intent — QA re-verified (2026-07-14) after the CD-38 Batch 4 wave retune
  (Outpost W5 down: swarmling 16→14/interval 0.3→0.4, brute 5→4, skimmer 6→5/delay 5→6; W6 up: brute
  3→4, skimmer 4→5/delay 3→8, warlord delay 16→12). Re-ran a cheapest-cost-first mixed script (garrison
  d1, gun_tower d2, siege_tank d3, missile_battery d4, sniper_tower d5, refinery p1, barracks p2;
  defense-then-economy build order) twice — byte-identical both times (confirms determinism, consistent
  with CD-20's "sim deterministic outside cosmetic particles"). Per-wave total damage: W1 0 / W2 55 / W3
  303.3 / W4 540 / W5 633.4 / **W6 758.5 — now unambiguously the global max-damage night** (monotonically
  increasing W4<W5<W6, a clean reversal of the original CD-36 finding where W5 both out-damaged W6 and
  was the deeper HQ dip). Full clear (victory), HQ never drops below 400/600 (66.7%, comfortably above
  the ~150 floor) at any point in the run. One caveat, same in kind as the original finding: the strict
  "W6 = global HQ minimum" sub-criterion is build-order-sensitive — in this script the per-wave HQ
  minimum is W4's 400hp (66.7%), slightly below W6's 544hp (90.7%), because W4 lands before the economy
  has fully matured. Tried several other reasonable build-order variants; all either lose earlier (over-
  invest in economy too soon and get overrun before defenses are up) or reproduce the same W4-slightly-
  below-W6 pattern once they're viable — none reproduce the original CD-36 pathology of W5 being both the
  damage peak AND the deepest dip. Given the demand curve is now clearly and monotonically climbing to
  W6 (matching the design doc's math section: "Demand W6 3,390 vs W5 2,045, a 66% gap") and HQ health
  never approaches a dangerous floor at any wave in any build tested, this is a clear directional fix —
  closing rather than leaving open a second time.
- [x] CD-35 (balance, P1) — Dominant strategy, user-confirmed by real play: "buy all gun towers and
  slowly upgrade them and win easily." — QA verified (2026-07-14) against the full 8-point test plan in
  `docs/design-counterplay-pass.md`. **Headline result: the literal reported exploit now fails.** A live
  scripted replay (gun tower on every one of the 7 defense-capable sites as money allowed, upgrade
  cheapest-available with all leftover money each day, no production) cleared waves 1-3 (with visible
  chip damage starting wave 2 from Spitter, matching the CD-22 fix) then suffered a hard defeat in wave 4
  — HQ 0/600 — exactly as `docs/design-counterplay-pass.md`'s math predicted ("W4 = 6 skimmers vs 0 AA +
  HQ 12 dps → hard defeat"), and the day-4 wave-forecast panel showed the AIR badge on Skimmer the entire
  preceding day, confirming the telegraph (`.forecast-badge-air` DOM node present, count 1). Supporting
  evidence: a mixed "Build B" (bunker d1/d5, missile_battery d4, siege_tank d3, gun_tower d2/a1,
  sensor_array a2, refinery/barracks p1/p2) clears all 6 waves with real damage every wave ≥2 (36-921₡
  worth of dmg) and HQ minimum 200/600; a lean-choke "Build C" (2 defenders at the HQ-approach lane
  convergence + heavy production elsewhere) also clears, bloody, with real wrecks that rebuild free at
  dawn — a direct isolated test confirmed a wrecked production building earns exactly 0₡ the dawn it
  dies (vs. the 40₡ it would have paid, `Game.onWaveCleared`'s collect-income-before-rebuild ordering
  verified live via before/after money deltas: 220₡ → 280₡, matching `+60` clear bonus only, not `+100`);
  idle money in the mixed build stayed ≤70₡ every single dawn (well under the 300₡ ceiling, vs. the
  pre-pass pattern of 1600₡+ idle noted in this ticket's original root-cause write-up); a full-coverage-
  plus-all-L2 loadout costs ~1434-1898₡ depending on building mix, far outstripping cumulative day-4
  income (~535₡ with zero production), matching the doc's own ~1570₡ prediction; Ridge Pass still clears
  with a well-tempo'd mixed build (see CD-23's evidence below) and survives W3 cleanly with AA (bunker)
  up from day 1. Zero console errors across ~20 full scripted playthroughs.
  **Two sub-criteria from the 8-point plan came back short — filed as new tickets (CD-36, CD-37) rather
  than blocking this closure, since both are refinements of an already-fixed exploit, not exploits
  themselves:** the mixed build's wave 5 outdamages wave 6 (contradicts "W6 is the climax"), and
  swapping bunker specifically (not siege_tank or missile_battery, both of which swap cleanly into a
  defeat) for gun_tower did not reproduce the counter-matrix's predicted heavy-damage/defeat swing.
- [x] CD-23 (balance, P3) — d5 doesn't behave as the "west lane breakwater" design intent predicted (it
  was warlord-melee-only, like d2/d3) — QA verified (2026-07-14). Live-verified the standoff-attacker fix
  actually engages d5 with non-warlord units: in a mixed-build playthrough (bunker at d5), d5 took 24
  ranged-projectile hits from Siege Walker specifically in waves 5 and 6 (17 in W5, 7 in W6 — captured by
  wrapping `Game.resolveEnemyProjectileImpact` and correlating projectile color to enemy def), breaking
  the previous warlord-only pattern this ticket flagged. d5 is now demonstrably a general forward
  chip-damage site, not a warlord-exclusive one.
- [x] CD-22 (balance, P2) — Zero-damage-until-collapse cliff (every defense building's weapon range far
  exceeds the enemy melee-engagement threshold, so buildings took zero damage until a wave saturated
  the kill rate, then jumped straight to heavy/fatal) — QA verified (2026-07-14). The standoff-attacker
  mechanism (`EnemyDef.attackRange`/`attackRate`, `Game.resolveRangedAttack`,
  `resolveEnemyProjectileImpact`) is confirmed live to close the gap: a full all-gun-tower playthrough
  emitted 24 `enemyFired` events (Spitter/Siege Walker) and every build tested (all-gun-tower, mixed,
  lean-choke, counter-matrix variants, Ridge Pass) showed real chip damage from wave 2 onward instead of
  a saturation cliff. Wave-1 hygiene re-confirmed as by-design: an isolated re-test (4 gun towers built
  day 1, wave 1 only) produced exactly 0 building/HQ damage, 0 `enemyFired` events, and 9/9 raiders
  killed matching the spawn composition exactly — byte-identical to the pre-pass zero-damage-cliff
  pattern this ticket originally measured, confirming the new ranged-attack code path is correctly gated
  off for melee-only enemies (raiders have no `attackRange`) and doesn't regress the tutorial wave.
  Confirmed via source read (`src/game/Game.ts`) that no new `Math.random()` calls were added to any sim
  path — the only `Math.random()` usages remain the pre-existing `burst()` cosmetic-particle helper
  (already flagged as CD-20 tech-debt, unchanged by this pass).
- [x] CD-24 (feature, P2) — Undo & sell — QA verified (2026-07-14).
  `Game.sellOrUndo`/`getSellInfo` (`src/game/Game.ts`) + combined
  upgrade/sell chip row in `src/ui/UpgradeChip.ts` (ships as one file
  rather than the design doc's separate `SellChip.ts` — same measured-
  width-row layout, functionally equivalent). Independently verified:
  same-day build+upgrade undo refunds `spentToday` exactly (140₡ spent →
  140₡ back, money byte-identical to before either purchase, including the
  edge case where the build spent the player's *last* 80₡ — money returned
  to exactly 80₡, not 79 or 81); an older (not-touched-today) building's
  same-day upgrade-only undo reverts just today's levels and refund
  (spentToday 60₡ back, level 2→1, building stays); 60% sell of an
  untouched building refunds `round(0.6 * invested)` exactly (80₡ invested
  → 48₡), including after a dawn free-rebuild of a wrecked building —
  forced a real destroy via `Game.destroyBuilding` (enemy-contact code
  path), confirmed the wreck carries `invested` through the free rebuild
  unchanged (80₡ before and after), and the post-rebuild sell still quotes
  exactly 48₡, never exceeding invested; `getSellInfo` returns `null` for
  the HQ always; selling frees the site (ring reappears, confirmed via
  DOM); rapid double-fire (two `sellOrUndo` calls on the same building in
  the same tick) sells/undoes exactly once — both the 350ms lockout and
  the already-removed-building guard cover it independently; at night
  `getSellInfo` is `null` and `sellOrUndo` is a no-op (verified via both
  direct API and hiding of both DOM chips); same day-only gate confirmed
  inert during `victory`/`defeat` phases; X is swallowed while the pause
  modal is open (confirmed via a real dispatched keydown — no money/
  building change, modal stays open); upgrade chip and sell chip
  bounding-rect measured live via `getBoundingClientRect()` at both a
  normal and a near-top-edge (flip) anchor position — zero overlap in
  either case, confirming the shared measured-width row layout. Balance
  sanity: no build→sell/undo money exploit is possible — undo always
  refunds only what was spent (net zero), sell always pays ≤ invested
  (60%, net loss), and critically the per-day ledger (`spentToday`/
  `builtToday`) is cleared at `startNight()` (before the wave, not at
  dawn), so a building can never both bank a dawn income payout *and*
  still qualify for a full-refund undo afterward — verified live: a
  refinery quoted `{kind:"undo", refund:150}` immediately after building,
  survived a wave and collected its 85₡ dawn income, and the very next
  day quoted only `{kind:"sell", refund:90}` — the full-refund window is
  gone the instant the ledger resets, regardless of the income timing.
  Zero console errors.
- [x] CD-3 (feature, P2) — Sound pass 1 — QA verified (2026-07-14).
  `src/audio/AudioBus.ts` (lazy `AudioContext` + master `GainNode`,
  resume-on-first-gesture, per-id throttle) + `src/audio/sfx.ts`
  (synthesized recipes) + `src/audio/bindings.ts` (the only file mapping
  `GameEvent` → `SoundId`). Independently verified via a real 6-wave
  playthrough with an `onEvent` counter: `weaponFired`/`enemyDied` counts
  matched live combat and wave composition exactly across all 6 waves
  (e.g. wave 4's 20 `enemyDied` events matched its 6+4+8+2 spawn
  composition exactly), `waveStarted` and `dawn` each fired exactly once
  per night/day transition, `buildingDestroyed` and `victory`/`defeat`
  each fire exactly once (forced via a direct `destroyBuilding` call and
  full level clears/an engineered HQ-hp-0 tick respectively). Pre-gesture:
  `audioBus.contextState` is `"uncreated"` and `play()` is a silent no-op
  (doesn't throw, doesn't create a context); a real `pointerdown` gesture
  resumes it to `"running"`. Throttle: spied on
  `AudioContext.prototype.createOscillator` — 10 synchronous `play()`
  calls for the same id produced exactly 1 oscillator (9 throttled),
  and a call after waiting past the 40ms window produced a 2nd. Volume
  slider and mute both drive `masterGainValue` immediately and precisely
  (0.5 slider → gain 0.5; mute → gain 0; unmute restores). Pause ducks
  gain to 0 even while unmuted and restores the prior volume on resume.
  Muted vs. unmuted playthroughs of an identical scripted build (4 towers,
  2 waves, day-2 upgrades) produced byte-identical final state (money/HP/
  phase/wave/building count) — expected by construction since `Game` has
  zero audio imports, confirmed empirically anyway. Zero console errors.
- [x] CD-26 (feature, P1, demo) — Onboarding hints — QA verified
  (2026-07-14). `src/ui/Hints.ts`: declarative ordered `HINTS` list,
  `HintController.resolveActive` (first-match-wins). Independently
  verified on a fresh profile: all 5 level-1 hints (select-site → pick-
  structure → red-markers → space-to-start → day-2 upgrade) appeared in
  order, exactly one visible at any time, and were dismissed via a mix of
  real keyboard input (arrow-key nav selecting a site, Escape deselecting,
  Space starting the night, U upgrading) and real mouse clicks (a build-
  ring option, a "Ready for Night" DOM click) — both input paths correctly
  trigger each hint's `done()`. Mid-sequence reload: persisted
  `hintsSeen` (4 of 5 seen) survived a real page reload, the 4 already-
  seen hints correctly did not re-show even when their trigger states
  recurred (fresh level restart re-hits "nothing selected" and "day 1"),
  and the 5th (day-2 upgrade) hint resumed and showed correctly once day 2
  was reached again. A veteran profile (`hintsSeen` pre-populated with all
  5 ids) rendered zero hint DOM nodes through an entire level-1 day-1-to-
  day-2 sequence (select, build, clear a wave). Level 2 renders zero hints
  even with a completely empty `hintsSeen` (the `levelIndex !== 0` guard).
  Hint DOM (both world-anchored cards and the `#btn-ready`-anchored DOM
  card) fully disappears while the pause modal is open and reappears
  correctly on resume. Zero console errors.
- [x] CD-25 (feature, P1, demo) — Main menu & level select — QA verified
  (2026-07-14). `src/app/AppShell.ts` + `src/ui/screens/TitleScreen.ts` +
  `src/ui/screens/LevelSelect.ts`; Play → level select, Continue
  (progress-gated) jumps into the furthest unlocked level fresh at day 1;
  locked cards show "Locked", cleared cards show "Cleared · Best HQ N%";
  victory overlay's "Level Select" route works. Independently verified:
  fresh-profile boots to title with Continue hidden; level 2 locked/
  disabled until level 1 clears; win → unlock + `bestHqHpPct` recorded +
  survives reload; both levels clear → both cards show "Cleared"; R key
  on the title screen is a no-op (keyboard dead off the game screen);
  Quit to Menu from the pause modal returns to level select with
  paused/modal state cleared and a fresh restart works; defeat overlay's
  "Level Select" button also routes correctly and doesn't touch the save.
  Zero console errors across the whole session.
- [x] CD-27 (feature, P1, demo) — Persistence lite — QA verified
  (2026-07-14). `src/persist/save.ts`: `SaveDataV1` (v1),
  `StorageBackend`/`LocalStorageBackend`, `load()` falls back to
  `defaultSave()` on corrupt/invalid data without throwing, sync writes,
  `debounce()` helper. Independently verified: invalid-JSON string and
  well-formed-but-wrong-shape JSON (`unlockedLevels: "oops"`) both recover
  to defaults with zero console errors; victory records `cleared` +
  `bestHqHpPct` (best-of, doesn't regress on a weaker replay) and unlocks
  the next level; defeat does NOT write anything to the save (verified via
  before/after snapshot diff); reload preserves progress across both
  levels; nightSpeed persists through reload and survives a mid-night
  reload (which correctly starts the resumed level fresh at day 1 — no
  mid-level save, as designed).
- [x] CD-2 (feature, P1) — Pause/settings modal — QA verified (2026-07-14).
  `AppShell` owns `paused`/`modal`/`nightSpeed`; `src/ui/PauseModal.ts` is
  a dedicated `#pause-modal` node reusing `.overlay-card`. Independently
  verified: P opens/closes the modal in both day and night phases; Esc
  priority chain exact (modal open → close; else selection → deselect;
  else → open pause, confirmed step-by-step); every game action (nav,
  build, upgrade, confirm/space, restart) is a no-op while the modal is
  open (money/phase/selection snapshots byte-identical before/after);
  world state is provably frozen under the modal (money/HQ-hp/enemy-count/
  waveIndex snapshot identical after a real 2-second wall-clock wait) and
  resumes cleanly afterward with no time-jump or double-processing (dt is
  clamped to 50ms per frame and paused frames still reset `last`, so no
  backlog accumulates); mouse clicks can't reach the canvas while the
  modal is open (`elementFromPoint` at the canvas center resolves inside
  `#pause-modal`, confirmed via CSS z-index 110 vs world-ui's 10 — see
  CD-34 for a hardening note, not a live bug); Quit to Menu works; speed
  badge is night-only, hidden by day. Zero console errors.
- [x] CD-28 (feature, P2, demo) — Night speed toggle — QA verified
  (2026-07-14). Sub-stepping via `AppShell.stepsForFrame`. Independently
  verified: F toggles 1x/2x any time, badge label updates, persists
  immediately; ran the same scripted build (fills every site, upgrades
  leftover money, 6 waves) through the real `stepsForFrame`-driven loop at
  both nightSpeed 1 and 2 — full per-wave logs and final state
  (phase/waveIndex/money/HQ-hp) were byte-identical between the two runs,
  confirming sub-stepping can't diverge from 1x by construction. Also
  reran the same scripted build once more as a straight regression check
  (build-order restructure around AppShell) — cleared all 6 waves at 1x
  with no defeat and no console errors, confirming the CD-21 balance work
  survived the loop restructure (this build was economy-heavy/over-strong
  relative to CD-21's literal knife-edge script, so treat it as a smoke
  test of the loop, not a re-validation of the wave-6 balance margin).
- [x] CD-21 (balance, P1) — Outpost Alpha wave 6 defeat under the literal
  CD-12/13/18/19 QA test script — fallback knobs applied and verified
  (2026-07-14). Knobs: W6 skimmer 6→4, W6 warlord delay 12→16 in
  `src/data/levels.json`. QA re-test after the change: T2 literal scripted
  cadence now clears all 6 waves (was defeat mid-W6); HQ minimum 168/600
  in wave 6 (never 0), per-wave HQ damage W1-3 0 / W4 143 / W5 179.9 /
  W6 432, wave 6 remains the global-minimum night. T3 (7 level-1 gun
  towers, zero economy/upgrades) also flips from wave-6 defeat to victory:
  W6 HQ damage 171 with d2/d3/d5 wrecked, wave 6 still the max-damage
  night. Original finding for reference: pre-fix, the literal one-
  purchase/day cadence left ~1134₡ idle by day 6 and the HQ died to
  skimmer-dominated wave 6 pressure (skimmer 971 engaged-ticks vs raider
  311 / brute 53); an aggressive-spend variant of the same build survived
  untouched, i.e. wave 6 was a knife-edge on spend rate, not composition.
- [x] CD-0 — Examples of completed work live in git history / ROADMAP
  checkmarks (2026-07-14).
- [x] CD-1 (feature, P1) — Upgrade chip — world-anchored upgrade button at
  the selected building, replacing the side-panel upgrade button
  (UI_PLAN.md "Menu refresh") (2026-07-14).
- [x] CD-12 (balance, P1) — Outpost Alpha wave-3/4/5 pressure ramp —
  resolved by combined balance & routing pass; see ROADMAP/design — QA
  validation pending (2026-07-14).
- [x] CD-13 (balance, P2) — Outpost Alpha west/north path divergence —
  resolved by combined balance & routing pass; see ROADMAP/design — QA
  validation pending (2026-07-14).
- [x] CD-18 (balance, P2) — missile_battery damage 55→60 —
  resolved by combined balance & routing pass; see ROADMAP/design — QA
  validation pending (2026-07-14).
- [x] CD-19 (balance, P1) — Outpost Alpha wave 6 finale pressure —
  resolved by combined balance & routing pass; see ROADMAP/design — QA
  validation pending (2026-07-14).
- [x] CD-14 (balance, P2) — Armor rebalance — chose the flat armor cut
  option over the percentage formula, to keep flat armor's readability and
  missile_battery's anti-armor niche: `src/data/enemies.json` armor
  brute 4→2, siege_walker 8→5, warlord 10→6 (2026-07-14).
- [x] CD-11 (feature, P3) — Enemy stop-ring at the HQ — faint dashed
  rgba(239,83,80,0.25) ring at r=52 around the HQ in `Renderer.ts`, drawn
  at night always and by day only when the HQ is selected, kept subtler
  than the spawn warning markers (2026-07-14).
- [x] CD-4 (feature, P2) — Wave forecast panel — new "Next Wave" side-panel
  section in `index.html`/`HUD.ts` between #level-info and #build-panel;
  one aggregated line per enemyId+spawnId group with a colored dot, e.g.
  "9× Raider West"; day-only, hidden at night and once no waves remain
  (2026-07-14).
