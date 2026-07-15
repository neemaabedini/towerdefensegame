# Tickets

Lightweight tracker for features, bugs, and balance work. One line per
ticket; details inline or linked to ROADMAP.md / UI_PLAN.md sections.

Format:
`- [ ] CD-<n> (<type>, <priority>) — <title> — <notes>`
Types: feature | bug | balance | tech-debt. Priority: P1 (next) → P3 (later).
Mark done with `[x]` and append the date. Record actual numbers, not
adjectives — a future session compares against figures.

Agent pipeline (definitions in `.claude/agents/`): **product-manager** owns
this file and ROADMAP.md — audits done-vs-claimed, files roadmap work that
has no ticket, reconciles conflicts, and hands off to the **architect**, who
designs multi-module features as a doc in `docs/`; the **coder** implements;
the **code-reviewer** reads the coder's diff and sends findings back to the
coder; the **qa-engineer** verifies end-to-end, reviews balance, and appends
new bug/balance tickets here. Opus plans and checks (PM, architect,
reviewer); Sonnet does (coder, QA).

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
- [ ] CD-7 (feature, P2) — Economy rework: mining near crystals + Plasma
  Wells + one research slot (ROADMAP Phase 2). Designed 2026-07-15 —
  `docs/design-economy-rework.md`. **Steps 1-3 implemented 2026-07-15
  (coder session) — awaiting qa-engineer verification.** `barracks`/
  `refinery` are deleted (zero source refs remain, grep-verified); both
  levels run on the new `mining_facility`/`plasma_tap` economy; the DEV
  `validate.ts` contract check passes clean on boot for both levels.
  **Step 4 (research facility + tree) remains PARKED** on ROADMAP Open
  Question 1 (global tree vs roguelite draft) — user decision still
  pending. `s1` (Outpost) and `s1` (Ridge) are authored with only
  `["sensor_array"]`; `research_facility` joins that list the day Step 4
  lands (no placeholder def was invented). `BuildingDef.unique`/`.research`
  ship typed but unused, same rationale.
  Verified this session: derived node counts match a hand-count of the
  authored `levels.json` crystal/plasma coordinates (Outpost m1=4, m2=5,
  a2(plasma)=1; Ridge m1=3, a1=5, d3(plasma)=1); best-case L1 income is
  exactly Outpost 211₡/day (56+70+85) and Ridge 197₡/day (42+70+85), both
  inside the 190-230 band; `BuildRing` shows `56₡/dawn` etc. on the button
  face (live DOM, no hover); a live-DOM check of the selected-building panel
  confirms it shows the real total (`Income 56 credits at dawn (4 × 14₡
  node)`), not the per-node figure `scaledStats` alone would show; a
  from-scratch, fully-upgraded build clears both levels (Outpost 6/6 waves,
  Ridge 5/5, zero HQ damage in either); `npx tsc --noEmit` is clean; zero
  console errors across the whole session. **One deliberate deviation from
  a literal reading of design R4, flagged for the architect/QA to sign off
  on:** the validator's 20px obstacle-clearance rule is scoped to `kind:
  "rock"` only (not crystal/plasma) — a literal all-kinds reading fails on
  the design doc's OWN authored coordinates (e.g. Ridge's Outpost `m2` site
  sits ~10px from its own Rift Field crystal, and Ridge's Far Field has a
  crystal ~19px from a `south_west` path waypoint), because resource sites
  are deliberately placed inside/near the fields they mine. See the comment
  block atop `src/data/validate.ts` for the reasoning.
  QA focus per design §12: items 1, 2, 3, 11 are in scope for this slice
  (income invariant, idle-money discipline, contested-mine-not-a-trap,
  requirement filtering); items 4-10 and 13-14 are research-dependent and
  belong to Step 4. Also worth a deeper pass than this session's ad hoc
  scripts: Ridge's new `a1`/`d5` lane coverage under a *modest* (non-maxed)
  build — an early quick script misread its own `waveIndex` logging and
  looked like an early defeat; corrected reading showed both levels clear
  most waves cleanly with a modest build and only struggle near the
  respective finale, which matches this project's known difficulty-curve
  history, but a real qa-engineer pass should confirm rather than take my
  correction at face value.
  Knock-on to track: CD-40 is blocked on Step 4's
  research facility, so the Godot port gate is blocked on that decision too.
  Design in one line: income is derived from
  the count of crystal obstacles within a mining facility's radius, so the
  map becomes the budget. Five steps, each playable + typecheck-clean:
  (1) resource model + derivation + a DEV `validate.ts` (no gameplay
  change); (2) new defs + `× nodes` income + Outpost layout (Ridge stays on
  the old economy, so both are A/B-able in one build); (3) Ridge layout +
  retire the old defs; (4) research facility + tree + a `Game.resolveOption`
  refactor that moves build-vs-branch-vs-research dispatch out of the
  browser input handler into the sim (port-facing win); (5) cosmetics.
  **Two decisions needing sign-off:** (a) it answers ROADMAP Open Question 1
  in favor of a *global track tree, one purchase per day*, rejecting the
  roguelite pick-1-of-3 draft — the draft needs an RNG in a sim path (CD-20
  is still open), and it collides with CD-30, which already owns the
  build-variety slot; the draft stays available later as a pure
  presentation layer once CD-20 lands a seeded RNG. (b) it DELETES
  `barracks` and `refinery` outright rather than repurposing their ids
  (CD-38's D1 precedent), and rewrites both levels' obstacle/site layouts;
  no save migration is needed (`SaveDataV1` stores no building ids). Also
  argues, from the live data, that ROADMAP's proposed Weapons and Servos
  tracks cannot both exist under the no-trap-picks rule (+% damage is a
  strict no-op at our small integer HP/armor values — a gun tower needs 2
  shots for a swarmling at both 10 and 10.7 damage) and merges them into one
  track granting both.
  **QA verdict on Steps 1-3, 2026-07-15 (qa-engineer session): feature verified PASS; balance review
  surfaces a real regression — see CD-41.** Design §12 items in scope: **item 1 (income invariant)
  independently reproduced PASS** (Outpost 211/day, Ridge 197/day, both in [190,230]); **item 2 (idle
  money ≤70₡/dawn) PASS** on every scripted build tried, both levels — idle never exceeded 70₡ at any
  dawn across ~18 scripted playthroughs; **item 3 (contested mine not a trap) PASS on Outpost, SOFT-FAIL
  on Ridge** — Outpost `m2` (built day 2, one supporting gun_tower at `d2`) survived undamaged through
  W1-3 and paid income every dawn it stood, only falling in the general board-wide W4 collapse (not
  singled out) — the "~75px off the west lane" placement (design §5) is doing its job. Ridge `a1` is
  markedly more exposed: in a clearing 5/5-wave scripted run (`d5` gun_tower built first, then `a1`
  mining_facility, `d1` gun_tower, `d2` missile_battery, `d4` gun_tower, `m1` mining_facility, `d3`
  sniper_tower, `a2` gun_tower — idle 70/2/50/28/1₡, all ≤70), `a1` was wrecked in 3 of 5 waves (60%) —
  filed as **CD-42**, design §13's own knob ("move `d5` 20px closer" then "trim the field 5→4 and move it
  30px off-lane") is the recommended fix, applied pre-emptively rather than waiting for a live complaint.
  **Item 11 (requirement filtering) PASS, verified two ways:** live DOM/state shows every site's effective
  `options` already requires-filtered (matches authored data 1:1 in current levels — neither level actually
  exercises the filter today, since every authored mining/plasma site already clears its `min`); a
  synthetic level with a 2-mineral-node site offering `mining_facility` (dynamic-imported `buildings.ts`
  + `validate.ts` at runtime) confirms the filter itself excludes the option (`poorPasses: false`) and
  `validateLevels` throws a specific, correctly-worded error for it, while the real shipped `LEVELS` still
  pass clean — the mechanism has real teeth, not just dormant code. **Sign-off on the coder's two flagged
  items: (a) the validator's rock-only 20px clearance scoping is APPROVED** — read every crystal/plasma
  placement against its owning site in `levels.json`; each is deliberately close by design (mining sites
  sit inside the fields they mine), a literal all-kinds reading would reject the design doc's own authored
  coordinates, and rocks remain the only obstacle kind that's an unrelated terrain hazard. **(b) Ridge
  `a1`/`d5` deep-pass done** — see CD-42; it clears under a modest build but with a rough ride for the mine.
  **CD-38 all-gun-tower regression re-baselined against the new layouts** (design §12 item 10): Outpost —
  zero-AA build clears W1-3 clean (0/45/90₡ dmg) then hard-defeats W4, HQ 600→0, one building wrecked
  (`d1`); qualitatively unchanged from pre-CD-7 (still a clean AIR-badge hard defeat, still W4). Ridge —
  zero-AA (gun_tower everywhere `d3` allows it, `sniper_tower` substituted at `d3` since it lost its
  `gun_tower` option to `plasma_tap` under the 4-key cap) hard-defeats **W3** (skimmers arrive a wave
  earlier on Ridge than Outpost), HQ 600→0. Both are the expected control failure, not a regression by
  themselves — noted because **CD-41's healthy-build finding is the surprising part: an AA-equipped,
  full-coverage, non-maxed Outpost build now dies the *same way* the deliberately-broken zero-AA control
  is supposed to.** Zero console errors and zero new `Math.random()` (grep-reconfirmed, only `burst()`)
  across the full session; a winning Ridge scripted run reproduced byte-identical on rerun (determinism
  reconfirmed independently, matching CD-38's finding). Live DOM/keyboard regression spot-check (fresh
  reload, mouse through the level-select menu, `1` keydown to build) still builds `mining_facility` and
  shows `130₡` / `56₡/dawn` on the button face with no hover — the UI layer CD-7 touched is intact.
- [ ] CD-45 (bug, P2) — **FIXED 2026-07-15 via enemy separation steering (user-directed) — awaiting
  code-review + qa-engineer balance re-baseline; left open until QA signs off.** `Game.separateEnemies(dt)`
  mirrors the existing `separateUnits()` boids-lite, called from `updateNight` after the move loop (it
  must cover `engaged` enemies too — they're the ones stacked on a contact ring). Enemy↔enemy and
  same-layer only, so units still never push enemies (D5's porousness guarantee untouched) and flyers
  don't shove the ground units they overfly (D6). No RNG → CD-20-safe; determinism re-verified
  byte-identical across repeat runs.
  **The one non-obvious part, worth not "simplifying" later:** the push is capped at half a mover's step
  (`SEPARATION_STEP_FRACTION = 0.5`) instead of resolving the overlap outright the way `separateUnits`
  does. That cap is load-bearing. `moveEnemy` only advances a waypoint within **2px** of it
  (`Game.ts:712`), and an uncapped push is up to **16px/tick** for a siege walker against its
  **1.4px/tick** step — so enemies get shoved past the arrival window permanently. First implementation
  did exactly that and **deadlocked**: two siege walkers converging on one waypoint, one pushed past it,
  each then walking back at the other, forever. Caught live — Ridge W4 and W5 and Outpost W5 and W6 all
  ran 8,000 ticks without terminating (HQ 600/600, 2 enemies alive, both stuck at `pathIndex 1`). Units
  are immune to this class because a leash re-clamps them; enemies follow a path. Keeping the push below
  the step guarantees net progress toward the waypoint, so declumping can never stall a lane.
  **Measured, same probe before/after (Ridge W5, garrisons on every capable site):** same-type body
  overlap **36% of the night → 5-6%**; tightest same-type gap **0.00px → 1.5px**; the actual illusion
  condition (a wounded body sharing a pixel with a full-health, bar-less one) now occurs on **1-2% of
  ticks, worst pair 5.5px apart** (vs. the reported 71%/100% brutes at 0.00px) — far enough that two
  bodies read as two bodies. Zero HP increases throughout (there never were any). Perf is a non-issue:
  worst tick **0.3ms = 1.8% of a 16.7ms frame** at 18 concurrent enemies.
  **⚠ Balance blast radius is real and is NOT yet assessed — this is why the ticket stays open.** Spreading
  bodies changes both splash coverage and how concentrated incoming building damage is, and it moved the
  needle hard in an *unlimited-money, garrison-everywhere* script: **Outpost went from a W4 hard defeat
  to clearing W4 and W5 and only losing at W6**; Ridge now clears W4 and loses at W5. That direction is
  the opposite of intuition (spread bodies = less splash value = should be harder) — the likely cause is
  that clumped enemies previously focus-fired one building at once. It plausibly overlaps **CD-41**
  (Outpost W4 cliff), but that script is not a realistic build, so **do not close CD-41 on this** —
  QA must re-run its 15-build sweep. **The CD-36/CD-38/CD-41 per-wave damage baselines are all
  invalidated and need re-measuring against this change.**
  ---
  Original report and diagnosis, retained: **Enemies stack on the same pixel, so a dead enemy's HP bar
  "transfers" to a healthy one behind it — reads to the player as an enemy healing to full** —
  user-reported 2026-07-15
  ("on wave 5 one of the enemies is recovering all of its health after destroying a garrison"),
  root-caused and reproduced the same day. **The HP does not actually change — verified twice over:**
  statically, the only writes to `e.hp` are `def.maxHp` at spawn (`Game.ts:589`), `-= dmg` in
  `hurtEnemy`, and `= 0` on death, and `hurtEnemy` is heal-proof by construction
  (`Math.max(1, rawDamage - def.armor)` can only subtract, even given a negative input — every damage
  source, including splash, funnels through it); empirically, a tick-by-tick HP diff across both levels
  forced onto wave 5 (~3,300 ticks, 10 garrisons destroyed, warlord included) recorded **zero HP
  increases and zero over-max**. Since HP never rises, `e.hp >= e.maxHp` can never flip false→true, so a
  bar is mathematically incapable of refilling.
  **Actual mechanism — two mundane things combining:** (1) `Renderer.ts:1304` hides the bar entirely at
  full health (`if (e.hp >= e.maxHp) return;`), so a healthy enemy is visually indistinguishable from
  no enemy at all; (2) **enemies have no separation steering** — `Game` has `separateUnits()` for
  garrison squads only, so enemies walking identical waypoint paths at identical speeds stack perfectly,
  and stack *hardest* where `resolveEnemyContact` halts them all on the same contact ring
  (`def.radius + 28`) around a building. So several bodies occupy one pixel, one bar is drawn per enemy
  at the same coordinates, and the visible bar belongs to whichever draws last. Kill the wounded one and
  its bar disappears, revealing an untouched enemy that was there the whole time.
  **Measured (Ridge Pass, wave 5, garrisons on every garrison-capable site):** same-type enemy overlap
  (centres closer than one body radius) occurs on **618 of 1,729 ticks = 36% of the night**; tightest
  cluster is **two brutes at 0.00px separation, one at 71% and one at 100%** — i.e. one visible bar,
  two bodies, and the 100% one contributing no bar at all. At the instant a garrison at `a1` died,
  **4 brutes sat at an identical 41px** from it (71%/93%/89%/60%); at `d1`, 3 brutes at 42px
  (71%/93%/39%). Both wave 5s field 4 brutes, so this is reproducible on either level.
  **Why it matters beyond this report:** the player cannot count the swarm or read which enemy is nearly
  dead — it silently defeats target prioritisation and makes ROADMAP's "swarm spectacle" lever
  (They Are Billions lesson) unreadable rather than impressive. It also means every QA balance
  observation about "N enemies engaged" has been made against a display that under-shows the stack.
  **Fix needs the architect — the obvious repair is a sim change with real balance blast radius.** True
  fix is enemy separation steering, mirroring the existing `separateUnits()` boids-lite already written
  for garrison squads (ROADMAP Phase 3a describes exactly this: "radius collision + separation
  steering"). It needs no RNG, so it stays CD-20-safe — but spreading bodies out directly changes how
  many enemies a `siege_tank`/`missile_battery` splash catches, so it invalidates the CD-36/CD-38/CD-41
  damage baselines and must be measured, not eyeballed. Cheaper mitigations, each partial: always draw
  the enemy bar (removes the *vanish*, but the bar still jumps 71%→100% on the same pixel, so it trades
  one misread for another); offset stacked bars vertically; or draw a stack-count badge. **Note the
  scheduling trap:** CD-9's flow field would spread enemies naturally and dissolve this, but CD-9 sits
  in Phase 4, *after* the ROADMAP's Godot port gate — so "wait for CD-9" means shipping this misread
  through the entire port and the demo. Recommend deciding explicitly rather than by default.
- [ ] CD-43 (tech-debt, P2) — **CD-7 Steps 1-3 code-review findings** — filed 2026-07-15 by the new
  `code-reviewer` agent (first run; the seat didn't exist when Steps 1-3 went coder→QA, so this is a
  catch-up review of committed code `112efb8`). Verdict: **0 must-fix, 4 should-fix, nothing blocking** —
  the economy math is correct and matches the design doc exactly (every obstacle coordinate, both def
  blocks, all six node counts, and L3×5 = 119/day all reproduce §5/§6). Fix in one cleanup pass:
  **(1) `src/data/validate.ts:57` scopes the 20px clearance rule by the wrong axis.**
  `if (o.kind !== "rock") continue;` drops *both* the site-clearance and path-clearance checks for
  crystal/plasma, but only the site half needed dropping (resource sites are deliberately placed near
  the fields they mine — that exemption is correct and QA rightly approved it). The path half was
  discarded for free and hides a real bug — see CD-44. Fix: scope by what's measured, not by obstacle
  kind — site clearance stays `kind === "rock"`, path clearance applies to **all** kinds. Also worth
  proposing: the rule measures distance to *waypoints*, but the thing that matters is distance to path
  *segments* (an obstacle can clear every vertex and still sit on a long leg — exactly what CD-44 is).
  **(2) `src/data/buildings.ts:40` — `MiningSpec.minNodes` is inert and its comment lies about it.**
  It's authored (3/1) and typed, but nothing reads it; `Game.ts:120` gates on `def.requires.min`. The
  comment claims "below this the option is filtered out at loadLevel (D5)" — false of shipped code. Two
  authored numbers for one job with no assert they agree: raising `mining.minNodes` 3→4 silently does
  nothing. Fix: drop `minNodes` and let `requires` be the single gate, or add a `validate.ts` assert that
  the pair matches and correct the comment. (The design doc carries the same redundancy in §4 vs D5 — the
  coder transcribed it faithfully but shipped it inert without flagging.)
  **(3) `src/data/levels.json:19` — Outpost `a1` ships `"any"`; design §5 explicitly says `defense`.**
  Cosmetic only (violet ANY ring vs grey DEFENSE — `Renderer.ts:376`, `HUD.ts:234`), but it's a silent
  divergence from an explicit spec value, and `defense` is now semantically right since all of `a1`'s
  options are defense buildings.
  **(4) `src/ui/HUD.ts:283` — the income parenthetical doesn't multiply out at Lv 3.** The total is
  correct; the shown derivation isn't, because `Math.round` is applied to the per-node figure and the
  total independently: a Lv 3 facility on 5 nodes renders `Income 119 credits at dawn (5 × 24₡ node)`
  (5×24=120≠119). Every Lv 3 node count mismatches; Lv 1/2 are clean, so it only shows up late.
  **Verified clean by the same review:** the `incomePerDay`-means-per-node overload (design D3) is
  currently contained — all four consumers (`collectDawnIncome`, `previewIncome`, `HUD.renderSelected`,
  `BuildRing` via `previewIncome`) multiply by nodes correctly and the panel total always equals the
  money actually paid. But the `× nodes` rule now lives in three copies; §7 already slates `HUD` →
  `game.statsFor()` for Step 4, and folding in a `Game.incomeFor(buildingId)` at that point would give
  the rule one home. None of these need re-QA (one is DEV-only tooling, one is cosmetic, one is a text
  line, one is a no-op on current behavior).
- [ ] CD-44 (bug, P2) — **Two Ridge Pass Far Field crystals sit ON the `south_west` enemy lane, and the
  validator cannot see it** — found 2026-07-15 by the code-reviewer during CD-43, independently
  confirmed by a point-to-segment probe over `levels.json`. The coordinates come from the design doc's
  own §5 table, so this is an **architect authoring error faithfully transcribed by the coder**, not a
  coder defect. Everyone who checked this measured distance to path *waypoints*; the crystals clear every
  waypoint but sit on the *segment between* them:
  `(196,420) r14` — nearest waypoint **18.9px**, nearest segment **1.8px** (dead centre on the lane);
  `(140,432) r15` — nearest waypoint **40.0px**, nearest segment **10.8px**. For contrast the same probe
  shows every other resource obstacle is genuinely clear (Outpost's whole Rift Field ≥48.8px, both plasma
  wells 108.5px/91.5px), so this is specific to Ridge's Far Field, not a systemic authoring habit.
  **Today it's cosmetic** (crystals are set dressing that enemies walk through). **After CD-9 it is a
  blocked lane** — `ObstacleDef.blocks` defaults true, and design R6 explicitly warns fields must not
  become walls while R8's first knob is "move the field 20px further off the lane". Likely also a
  contributing cause of CD-42 (Ridge `a1`'s 60% wreck rate — the mine is parked on top of the lane it's
  supposed to sit beside). Fix: move the Far Field ~20-25px north-west off the `south_west` leg (check
  `(160,396)` too — 38.6px, clear but the closest of the rest), re-derive `a1`'s node count to confirm it
  still reaches 5, and re-run CD-43's validator fix to prove the check now catches this class. Architect
  should sign off on the new coordinates since the field's risk/reward placement is a design intent.
- [ ] CD-41 (balance, P1) — **Outpost Alpha Wave 4 is a hard, near-unavoidable difficulty cliff for any
  realistically-paced (non-maxed) build under the new CD-7 economy** — found 2026-07-15 while re-baselining
  CD-36 against the rewritten layouts. 15 independently-designed scripted builds across five strategic
  archetypes (economy-first, defense-first, cheap-full-coverage, lean-choke-at-convergence, tanky-swap,
  redundant-AA) were tried on Outpost Alpha; **every single one hard-defeats at Wave 4** (HQ 600→0 in one
  night), typically after clean, even *better-than-baseline* wave 1-3 damage (best run: 0/45/90₡ vs
  CD-36's recorded baseline of 0/55/303.3₡ for the same waves). The best full-7-site-coverage L1 build
  (a1/d2/d4/d1/a2/d3/d5 all built, `m1` mining_facility for economy, idle money disciplined at
  16-60₡/dawn) takes **990₡ of total structure damage in Wave 4 alone** (an ~11x spike over Wave 3's 90₡)
  and loses `d1`, `a2`, and `d4` in the same night — HQ dies. Adding a second dedicated `missile_battery`
  (double AA) or swapping to tankier `garrison` at `d1`/`d5` (mirroring CD-36's proven old-economy
  composition) does **not** change the outcome — same wrecked set, same magnitude of damage — which rules
  out "not enough AA" as the specific cause and points at a general L1-defense-density shortfall: the
  all-gun-tower zero-AA control build (CD-38 regression, see CD-7's note above) takes *less* total damage
  (742₡) in the same wave than several AA-equipped "healthy" builds, because it never spends money on
  buildings that then die (missile batteries are expensive HP sinks that fold to the same saturation).
  **Root cause hypothesis, numbers-backed:** pre-CD-7, the two safe rear production sites (old `p1`+`p2`)
  paid up to 110₡/dawn (`barracks` 40 + `refinery` 70) from day 1 for a defense-first player. Post-CD-7,
  old `p1`'s slot is now `s1` (sensor-only, **cannot produce income at all**), so the only fully-safe
  income site is `m1` at 56₡/dawn — **almost exactly half** the old safe-play income. The design's own
  §12 item 1 income-ceiling check (Outpost 211₡/day) is real, but it requires committing to *both* risky
  slots (`m2` contested mine + `a2`/plasma, which costs a defense building) — exactly the risk a
  defense-first player is trying to avoid by day 3-4, and exactly the risk this ticket's scripted builds
  found not worth the trade under wave-4 time pressure. Net effect: a build that plays it safe now arrives
  at Wave 4 with roughly half the old economy's war chest, and Wave 4's composition (skimmer×6 +
  siege_walker×2 + brute×4 + raider×8, **unchanged** by CD-7 — waves.json wasn't touched) was tuned
  against the old, richer safe-income curve. Compare to CD-36's closure evidence (mixed build, old
  economy, HQ never below 400/600 through all 6 waves) — that build is no longer reproducible group-for-
  group under the new economy. **Suggested fix, cheapest knob first per design §13's spirit:** raise `m1`
  and equivalent safe-mineral-field income before touching enemy waves (retuning waves would hide the real
  cause, same principle as design §13's own warning) — concretely, `mining_facility.incomePerDay` 14→17
  or lower `m1`'s `requires.min`/raise its node count so the safe site alone approaches the old ~80-90₡/
  dawn safe floor; alternatively lower `mining_facility` cost 130→110 so `m1` lands one day earlier.
  Re-run this ticket's 15-build sweep (or a subset) after any knob change — the pass criterion is: at
  least a majority of the five build archetypes above should clear Wave 4 without a maxed/rushed
  build. Full per-wave numbers for the reference build (full 7-site L1 coverage + `m1`) are in this
  session's transcript; happy to hand the exact scripted build order to the next session on request.
  **Reviewer note (2026-07-15, added when filing): the primary suggested knob above conflicts with this
  same design's §12 item 1, so this ticket needs an architect pass, not a direct knob application.**
  Verified by probe over `levels.json`+`buildings.json`: `mining_facility.incomePerDay` 14→17 puts
  Outpost at **238₡/day (56→68 at m1, 70→85 at m2, +85 plasma), outside the design's own 190-230 band**
  and hence a §12 item 1 FAIL — the two criteria cannot both be satisfied by that knob. (Ridge survives
  it at 221/day.) The `cost` 130→110 alternative keeps the band intact but is a one-off 20₡ saving, not
  a per-dawn fix, so it barely touches the diagnosis. **The deeper problem this exposes is that §12 item
  1 measures the wrong quantity:** it gates *total best-case* income, which is blind to how that income
  is distributed across risk. Both 211/day-all-safe and 211/day-only-if-you-hold-two-contested-slots pass
  it identically, and QA's finding is precisely that CD-7 shifted Outpost from the former toward the
  latter (safe income 110→56₡/dawn) while leaving W4 tuned for the former. Suggest the architect either
  add a *safe-income floor* criterion alongside the ceiling band (e.g. "income reachable without holding
  a contested site must be ≥X₡/dawn"), or restore an income option at Outpost `s1`, or widen the band
  deliberately — a judgment call about what the invariant is for, which is above a knob twiddle.
  **Also entangled with the parked Step 4:** the design hands `s1` to `research_facility`, so with Step 4
  parked `s1` is currently a near-dead site (sensor-only) — the player has already paid `p1`'s income
  cost without yet receiving the research facility it was traded for. Landing Step 4 restores `s1`'s
  *purpose* but NOT its income (a tech lab earns nothing), so the 56₡/dawn safe floor is real either way
  and this ticket is not merely an artifact of the park — but the current build is strictly worse than
  the design's intended end state, and any re-measurement should say which of the two it is measuring.
- [ ] CD-42 (balance, P3) — **Ridge Pass `a1` (the far/contested mineral mine) has a 60% per-wave wreck
  rate** even in a build that goes on to win — found 2026-07-15 alongside CD-7's item-3 re-verification.
  Scripted 5/5-wave victory (build order: `d5` gun_tower, `a1` mining_facility, `d1` gun_tower, `d2`
  missile_battery, `d4` gun_tower, `m1` mining_facility, `d3` sniper_tower, `a2` gun_tower; idle money
  70/2/50/28/1₡, all within the ≤70 guard) still lost `a1` in waves 2, 4, and 5 of 5 — it earned income
  only on the two dawns it survived. Net credits stayed technically positive over the run (the build won),
  but a 60% wreck rate is a rough ride for a "contested but viable" site design intent, and contrasts with
  Outpost's equivalent `m2` (0% wreck rate outside the board-wide Wave 4 collapse — see CD-7's note). `a1`
  sits ~38px from the `south_west` path waypoint `(180,430)`, versus `m2`'s deliberate "~75px off the west
  lane" (design §5) — `a1` never got the same lane-offset treatment. **Design §13 already names the exact
  fix, in order:** move `d5` 20px closer to the field; then trim the field 5→4 nodes and move it 30px
  off-lane. Recommend applying the first knob pre-emptively rather than waiting for a sharper complaint,
  since CD-41 (Outpost's Wave 4 cliff) means the economy can't currently afford to lose `a1`'s income
  repeatedly without compounding that problem.
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
  handlers. **Seam reserved by
  CD-7's design (`docs/design-economy-rework.md` §9): the research tree's
  `ResearchEffect` union already includes `{ kind: "unlock"; abilityId }`,
  and `Game.unlockedAbilities()`/`hasResearch()` ship with CD-7 — so
  airstrike and the nuke capstone hook up as two JSON nodes in an
  `ordnance` track, with zero changes to `research.ts`, `buildings.json`, or
  the research UI (tracks render from data; the ≤4-track cap reserves the
  key). Sensor Pulse is Command-Center-native and needs no research at
  all.** Anti-spam: long cooldowns or caster energy. Note the naming
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
