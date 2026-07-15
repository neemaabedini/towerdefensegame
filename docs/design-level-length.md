# CD-48 correction pass — "The level is 40% of the length it was built for"

Architect correction pass, 2026-07-15. Supersedes parts of `docs/design-wave-legibility.md`.
Covers **CD-48**, **CD-50**, and the sink question; touches **CD-41** (closed), **CD-47**, **CD-49**, **CD-31**.

**Headline: W6 isn't over-tuned. Outpost is under-length.** The sink measurement, CD-48's 762₡ gap, CD-50's payback failure, and CD-41's stacked-counter cause are four symptoms of one number: **a full Outpost run funds 46% of its own reference build's ceiling.** But the binary-outcome defect is a *fifth, independent* thing that length does not touch — and it is under-sampled, so we do not yet know it exists.

---

## 0. Status of the prior doc — what survives, what's dead

| Section | Verdict |
|---|---|
| §1 constraints K1–K9 | **Survives**, unchanged. |
| §2 Thronefall research | **Survives**, extended by §2 below (four new findings, three decisive). |
| §3 Finding 1 — income falsified at W4 | **CONFIRMED LIVE** by probe 1 (320→460₡, 1/5→2/5). **§3a's bound is now explicitly W4-scoped only** — folded in at §4. |
| §4 Finding 2 — Outpost stacks two counters on W4; Ridge is the control | **CONFIRMED, SHIPPED, WORKS.** The A/B (81→199→327→502 at 0/2/3/4 W3 skimmers; AA build flat at 646) is criterion (2) passing exactly as written. **CD-41 closes.** |
| §5 **Finding 3 — "CD-48 is the same defect mirrored"** | **SUPERSEDED — falsified by my own probe 2.** W6 was *not* "only passable because of a rendering-breaking defect"; CD-45 made it **1000₡ easier**. Arrival profiles are not stale. See §5. |
| §6 Finding 4 — `s1` isn't reserved, can't host mining, double-dip latent | **Survives.** CD-44 closed; R11's assert already earned its keep (two Ridge crystals at 1.8/10.8px). |
| §7a — CD-48's option ladder (stagger → counts → separation → HQ HP) | **SUPERSEDED wholesale.** Replaced by §6. Note C (`SEPARATION_STEP_FRACTION`) is now known to be a **±1000₡ difficulty lever, not inert** — still reject, for stronger reasons. |
| §7b — CD-41 re-scope + revised criterion | **Survives, vindicated.** |
| §7c — OQ1 → C1 | **Closed by user decision, recorded in ROADMAP. Not re-litigated.** Its strongest counter-argument is now dead — §7. |
| §7d — CD-47 house | **Survives on its own merits**; CD-48's correction **re-opens its relevance in the other direction** (§7). |
| §7e — 1a/1b/1c income criterion | **Survives**, but **1c's 250₡/day ceiling was derived for a 6-wave run and must be re-derived if length changes.** |
| §8/§9/§10 | **Survive.** `upgradeCosts?: number[]` now has a **second customer** (CD-50) — which justifies building it. |
| §11 Step 1 probes 1 & 2 | **Vindicated — they are the reason this pass exists.** |
| §11 Step 1 probe 3 (peak simultaneous attackers) | **Superseded before it ran.** Concurrency isn't the villain — separation *helps*. Replaced by **P4** (§8). |
| §11 Step 3 | **Dead as written.** |
| §13(4) — "more waves is CD-31's territory and non-blocking" | **Both halves wrong. Corrected in §3.** |

---

## 1. Problem statement & constraints

CD-48's planned fix was killed by its own gate. The replacement question: **is the fix to lengthen Outpost rather than nerf W6?**

Constraints unchanged (K1–K9). Reconfirmed:
- **K2** — nothing here adds `Math.random()`. The one new mechanic considered (§6) is a fixed interval, deterministic by construction. CD-20 unaffected.
- **K3** — no upkeep. Tested explicitly against §6's respawn proposal.
- **K6** — everything is `src/data/*.json` plus one optional typed field. Wave tables port to Godot byte-identically.
- **Waves are authored inline** in `levels.json` (`levels[].waves[]`). There is no `waves.json`. CD-48's own suggestion text says "`waves.json`" — wrong; note it on closure.

---

## 2. The standing rule applied — four new Thronefall findings, three decisive

| # | Finding | Source | Verdict |
|---|---|---|---|
| **T1** | **Their difficulty budget is exponential for the first 7 stages, then LINEAR.** The generator's inputs include **"simulated economy based on starting gold"**, spawn proximity to the castle, and wave length. | [Eternal Trials wiki](https://throne-fall.github.io/game-content/eternal-trials.html) | **ADOPT — this is the whole doc.** See §3. |
| **T2** | **Maps run ~13 nights / ~15 waves, 10–20 min each. The *tutorial* map (Neuland) is the abbreviated one.** | [NamuWiki](https://en.namu.wiki/w/Thronefall), [GameLuster](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/), [Getting Started](https://game.wiki/thronefall/getting-started) | **ADOPT.** Their answer to "should the first level be short?" is: **the short thing is a separate tutorial map.** A 6-wave Outpost is tutorial-length carrying a full map's board and boss. |
| **T3** | **Their night is kill-based, not timed** — it ends when every spawned enemy is dead. Same as ours. | [Steam: "Night never ends"](https://steamcommunity.com/app/2239150/discussions/0/3807283063849368527/) | **Not-applicable.** Kills the "night timer / withdraw at dawn" band mechanism as a benchmark-backed option (§6 C4). We'd be departing, not adopting. |
| **T4** | **Their Barracks units respawn *during the night*, on the building's Production Speed timer (10s at L1, 6s at L2–3), up to 4 / 8 / 12 capacity — and instantly at dawn.** | [Barracks wiki](https://throne-fall.github.io/game-content/buildings/barracks.html) | **ADOPT — our dawn-only respawn is the departure.** Strongest band-mechanism candidate (§6, C3). |
| **T5** | **Their House upgrade costs 2g — exactly the build cost — and *doubles* income 1g→2g.** Build payback: 2 nights. Upgrade payback: **2 nights.** Identical. | [House wiki](https://throne-fall.github.io/game-content/buildings/house.html) | **ADOPT as CD-50's rule:** *an income upgrade's payback must equal the building's own payback.* Ours is 2.3 dawns to build and **6.0 dawns to upgrade — 2.6× worse.** CD-50's root cause, named. |

---

## 3. The structural finding: exponential demand, linear board — and we ship only the exponential half

**The board curve (measured, realistic run, best archetype):**

| Day | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Invested ₡ | 260 | 420 | 550 | 890 | 1188 | **1738** |

**The demand curve (measured, isolated-wave minimum war chest):** W5 = **800₡**. W6 = **2500₡**.

| Wave | Board has | Wave demands | **Margin** |
|---|---|---|---|
| W5 | 1188₡ | 800₡ | **1.49× — 49% slack** |
| W6 | 1738₡ | 2500₡ | **0.70× — 30% short** |

**W5→W6: demand ×3.1. Board ×1.46.** That is the cliff, quantified — not a tuning error but **two curves with different growth laws crossing.** Demand is exponential (T1's first-7-stages regime). The board is ~linear late, because income per dawn is roughly flat.

> **Thronefall verdict — exponential-then-linear difficulty budget: ADOPT. We ship only the exponential half and terminate on it.** Their level lives through ~7 exponential stages **and then 8 linear ones, where the board catches up and the curves run parallel.** We compressed 15 waves into 6, so **every Outpost wave sits inside their exponential regime and the last one is the crossing point.** The linear tail is exactly what we cut — and it's the part that makes a long level survivable.

Two consequences:

1. **Nerfing W6 flattens one step of an exponential; it does not change the law.** You'd land W6 near 1650₡ (margin ~1.05×) — a fine two-point ramp — but the shape is unchanged, so **the moment anyone adds a W7 (CD-31 will), it spikes again.** You buy one wave, not a curve.
2. **T1's second half is the sharper indictment: their generator takes a simulated player economy as an input.** Ours never has. **The board-vs-demand table above is the first time the two curves have been in the same units.** That instrument (P4) is worth more than any knob here, and CD-31 needs it to author 8–12 levels without repeating this analysis per level.

### 3a. Correcting my own §13(4) — both halves were wrong

- **CD-31 owns level *count* (2 → 8–12 levels), not wave count inside a level.** No collision. Wave tables are `levels[].waves[]` — the same file a site edit touches, already covered by `validate.ts`.
- **"Content belongs in the shipping engine" targets geometry, art, tutorial scripting — Godot scenes.** Wave entries are JSON that ports byte-identically (K6). Four wave objects cost the port **zero**.
- **And it is not non-blocking.** The port gate is *"Phases 2–3 stable and fun."* A level whose last wave is unwinnable by **every build the economy can fund** cannot be assessed against that gate. **CD-48 is upstream of CD-31, not inside it.**
- **Real interaction:** when CD-31 lands, Outpost becomes level 1–2 and *should* get re-cut shorter, with later waves redistributed. That's a JSON edit. **Today Outpost is the whole game and must be a full level today.** T2 says the short experience belongs in CD-31's tutorial level 0 — which CD-31 already scopes.

---

## 4. The sink question, answered — with the caveat closed

Per-building full cost to max: gun **512** · siege **928** · missile **580** · sniper **510** · garrison **341** · mining **481** · plasma **629** · sensor **390**.

**Theoretical max sink, most expensive option every site: 5953₡ — correct.**

**The caveat — "a gun-tower-heavy board is shallower" — is real and changes the denominator:**

| Board | Ceiling | Day-6 board (1738₡) funds |
|---|---|---|
| Theoretical max | 5953₡ | 29% |
| **All 10 sites, realistic picks, maxed** | **5364₡** | 32% |
| **The reference build's own 7 sites, maxed** | **3742₡** | **46%** |

**Use 3742, not 5953.** The honest sentence:

> **A perfect Outpost run finishes having funded 46% of its own build's ceiling.** The player never sees more than half the upgrade depth — including CD-38's L2 branch forks and the L3/L4 tiers CD-49 wants to widen.

**Projected against length** (~340–360₡/day; implies W7+ carry `clearBonus` ~150–200 and the player holds all income sites — authoring-dependent, flag it):

| Length | Board at final wave | % of the 3742₡ focused ceiling | % of the 5364₡ full board |
|---|---|---|---|
| 6 waves (today) | 1738₡ | **46%** | 32% |
| 8 waves | ~2600₡ | 69% | 48% |
| **10 waves** | **~3244₡** | **87%** | **60%** |
| 14 waves | ~4488₡ | 120% ⚠ | 84% |

**Target ~85–90% of the focused ceiling.** Below it the upgrade layer is decoration; above it you finish maxed with money spare and re-open CD-35's snowball. **10 waves is the arithmetically-indicated length**, and 60%-of-full-board is *correct design*: you can max your chosen build, never everything — and that opportunity cost is what makes site choice mean anything.

**So: the sink is not over-built. The level is under-length.** 5953₡ is correctly sized for a mid-campaign map. **Ridge is worse: 9 sites, a 5857₡ ceiling, and only 5 waves.**

---

## 5. What survives of §5 — the sign was wrong; the model wasn't

Prior §5 point 4 claimed two opposing terms with a crossover at 33 enemies. **The two-term model is right. The crossover claim is false — "helps" wins at 33 too.** And probe 2 **measured the focus-fire term: 1000₡ of war chest (2500 ON vs 3500 OFF).** W5 control: 800₡ either way — **worth ~0₡ at W5 and ~1000₡ at W6.**

That asymmetry is a diagnosis. Separation's only mechanism is *slowing how fast buildings die*. If that's worth 1000₡ at W6 and 0₡ at W5, then **at W6 the outcome is dominated by a feedback loop through building loss.**

**The loop:** leakage → buildings destroyed → board DPS falls → more leakage. Above threshold the gain is <1 and you converge to zero leakage (**HQ 600/600, zero wrecks** — exactly what 2500₡ produced). Below, gain >1 and you converge to collapse (**HQ 0** at 2000₡). Bistable, sharp separatrix, **no stable middle**.

The HQ-minimum trace is the same tell: **600 / 597 / 474 / 440 / 381 / 0.** Smooth decline to 381, then 0. Linear extrapolation says ~320 at W6. There is no HQ-200 state, because the state producing HQ 200 is one where enemies freely reach the HQ — and then they don't stop at 200.

---

## 6. The band — the most interesting question, and the cheapest thing here

### 6a. First: the binary claim is under-sampled, and may dissolve

The ladder is **1000 · 2000 · 2500 · 4000** — 500₡ granularity at the transition. "No bloody-win band" rests on **one 500₡ step**. Nobody has looked at 2100–2400.

| World | Ladder at 100₡ granularity reads | Fix |
|---|---|---|
| **Truly binary** | 0, 0, 0, 0, 600 | **Defect C is real.** Needs a mechanism (§6b). |
| **Band exists, ~300₡ wide** | 0, 120, 310, 480, 600 | **Defect C dissolves into Defect B.** No new mechanism — land the run inside the band, which is what §3 does anyway. |

**This is a 30-minute probe (P1) and it decides whether a whole mechanic gets designed.** I will not recommend a band mechanism before it runs.

**Weigh this:** even in the binary world, 2000→2500 is a **20%** money band. For a *climax*, "play 20% worse than optimal and lose" is harsh but not absurd. **The genuinely bad property is not the width — it's that losing means HQ 0 rather than HQ 350 and three wrecks.** Keep those complaints separate; different fixes.

### 6b. If P1 says binary — the mechanism ladder

| # | Mechanism | Verdict |
|---|---|---|
| **C1** | **Flatten the demand curve so the run lands inside the band that already exists.** No mechanism — this is §3's fix. | **Try first. If P1 shows any band, this is the entire answer and C closes for free.** |
| **C2** | **Damp the loop gain via building `maxHp`.** | **Knob, not a fix.** Global — changes every wave on both levels. Hold as fallback. |
| **C3** | **Garrison units respawn during the night on a timer** — `squad.respawnSeconds`, capped at `countByLevel`. | **RECOMMENDED if a mechanism is needed. ADOPT with a citation — T4.** Thronefall's Barracks respawns on a 10s/6s timer up to 4/8/12 *and* instantly at dawn. **Our dawn-only model is the departure**, and it removes precisely the DPS/body floor that damps the spiral. `buildings.json` field; deterministic (fixed interval — K2 clean); no input, no snapshot state, no UI; **K3 intact** — *more* set-and-forget. Strengthens the garrison's authored role verbatim (*"Bodies slow the enemy — for a while."*). **Risks: rubber-banding and garrison dominance — R-E.** |
| **C4** | **Night timer + enemies withdraw at dawn.** | **REJECT.** **T3: their night is kill-based, same as ours** — a departure, not an adopt. Changes `clearBonus` semantics, adds snapshot state + HUD timer + withdrawal behavior, lets weak builds turtle. **Last resort.** |
| **C5** | **HQ `maxHp` 600→700.** | **REJECT as a band fix.** Terminal state is ~19 enemies ringing the HQ; +100 HP buys seconds. Moves the threshold, doesn't widen the band. Legitimate as a *demand* knob only. |

**Why Thronefall doesn't need C4:** T1's linear tail means their board is never 30% under demand, so the separatrix is never approached from below for long. Their band is bought by curve shape, not by a mechanism. **Another argument that C1 is the right first move.**

### 6c. Defect C blocks CD-48's own closure criterion

CD-48's criterion has a floor and no ceiling. While the band is binary the only reachable outcomes are **0** and **600** — so any nerf that clears the floor lands on **600/600, zero wrecks**, passing the letter and inverting the intent (QA's own words: *"A climax should be survivable-but-costly"*). **Unsatisfiable by any knob while the band is binary.**

> **Revised CD-48 pass criterion (two-sided).** On the reference build, at the final wave: **HQ minimum in [200, 480] of 600**, **wrecks-at-dawn in [1, 3]**, level cleared. Plus standing invariants: total damage at the final wave still exceeds the previous wave's; CD-38's all-gun-tower control still hard-defeats at W4 with the AIR badge; CD-41's W3 discrimination (zero-AA > reference) still holds.
>
> **A two-sided criterion is unsatisfiable without a band.** That is deliberate — it *detects* Defect C rather than passing over it. CD-37's "fix the criterion, not the number," fourth application.

---

## 7. Two items the new evidence moves

**OQ1's counter-argument is dead. The C1 decision stands and is now unconditional on that axis.** There is no spare cash and 5953₡ of unfilled sink. **Do not re-litigate.** Forward seam: at **≥12 waves** the board (~3890₡) exceeds the focused ceiling (3742₡) and spare money reappears — the sink argument revives *there*, and CD-49 + CD-30 + C1's picks are queued to absorb it. **10 waves does not reach that point** (3244 < 3742) — a further argument for 10 over 12.

**CD-47's relevance is re-opened in the opposite direction.** §3a's bound is **W4-only** — three dawns deep. **W6 is five dawns deep at ~100% of the run's credits.** A +30₡/dawn house is worth ~**+150₡** by W6 (20% of the gap) and ~**+270₡** at 10 waves. **Still not CD-48's fix. No longer irrelevant.** §7e's **1c ceiling must be re-derived** against whatever length ships.

**CD-49 gains a length dependency.** Thronefall's Tower branches at **L3**. If CD-49 adopts `atLevel: 3`, a gun tower costs 80+72+144 = **296₡** to reach its fork — **×5 towers = 1480₡ = 85% of the entire run's money.** **CD-49-at-L3 is unaffordable at 6 waves and comfortable at 10.** (Our shipped `atLevel: 2` forks cost +72₡ and are fine either way.) **A fourth item the length call decides.**

---

## 8. Options & recommendation

| Option | Closes | Costs | Verdict |
|---|---|---|---|
| **1. Nerf W6 ~35%** (2500 → ~1650) | CD-48 **Defect A only** | 30 min, one wave object. **Zero re-baseline.** | **Reject as the answer. Adopt as fallback** if the user keeps 6 waves. Flattens one step of an exponential; leaves B, C, CD-50. |
| **2. Lengthen Outpost 6 → 10** | **A + B + the sink question + CD-49's L3 headroom**, and makes CD-50 comfortable | 4 new wave objects. **Not a fifth re-baseline — see below.** | **RECOMMENDED. USER'S CALL** (§10). |
| **3. Widen the band** | **C** | Unknown until P1. Possibly **zero**. | **Probe first.** Do not design blind. |
| **4. Raise late income / fix CD-50** | **CD-50** | Small. | **Ship — but not as CD-48's fix.** 17% of the gap. |
| 5. Shrink Outpost's board to match its length | — | — | **Reject, but name it.** The reference build already uses only 7 of 10 sites and still reaches 46% of *that* ceiling. **The unreachable thing is depth, not breadth.** |

**Recommendation: 2 + 4, gated on P4; 3 gated on P1; 1 held as fallback.**

**The "fifth re-baseline" cost is ~zero — the decisive practical argument.** Author **additively**: **keep W1–W5 byte-identical**, re-author W6 as a *linear-phase* wave (not a climax), append W7–W10 on a linear budget, **move the warlord to W10**. Then the reference build's W1–W5 trace stands untouched; CD-38's control still fails at W4; CD-41's W3 skimmer introduction is untouched. **The only new measurements are for waves that don't exist yet.**

Target ramp, authored against P4's measured curve:

| Wave | Board (proj.) | Target demand | Margin |
|---|---|---|---|
| W6 | 1738₡ | ~1500₡ | 1.16× |
| W7 | ~2080₡ | ~1800₡ | 1.16× |
| W8 | ~2600₡ | ~2250₡ | 1.16× |
| W9 | ~2920₡ | ~2550₡ | 1.15× |
| **W10 (climax)** | **~3244₡** | **~2900₡** | **1.12×** |

Parallel curves at ~1.15×, tightening to 1.12× at the climax. **That is T1's linear tail.**

---

## 9. Data model, module changes, platform impact, seams

| File | Change | Item |
|---|---|---|
| `src/data/levels.json` | Outpost `waves[]` 6 → 10 (W1–W5 byte-identical; W6 re-authored; W7–W10 appended; warlord → W10). Ridge per P3. | CD-48 |
| `src/data/buildings.json` | `mining_facility` + `plasma_tap` += `upgradeCosts: [~45, ~45]` / `[~60, ~60]`. Optionally `garrison.squad.respawnSeconds` (C3, only if P1 demands). | CD-50, C3 |
| `src/data/buildings.ts` | `BuildingDef += upgradeCosts?: number[]`; `upgradeCost()` reads it when present, falls back to the formula. **Every existing call site keeps compiling.** `SquadDef += respawnSeconds?: number` (C3 only). | CD-50, OQ1-C1 |
| `src/game/Game.ts` | **Nothing** for lengthening or CD-50. C3 only: a respawn accumulator (fixed interval — no RNG). | C3 only |
| `src/data/validate.ts` | += assert: any def with `maxLevel > 1` has a real upgrade cost (prior R9, now load-bearing). += re-derived 1a/1b/1c against the new length. | CD-50, CD-47 |

**No new types beyond two optional fields. No new files, UI classes, snapshot state, input verbs, or `Math.random()`.** `upgradeCost` is already imported by `Game.ts` and `UpgradeChip.ts` — **the chip shows the derived number for free, so K4 holds with zero UI work.**

### Platform impact

| Concern | Browser | Godot | Controller | Mobile |
|---|---|---|---|---|
| Wave table 6 → 10 | `levels.json` | **Same file, zero port cost** | n/a | n/a |
| `upgradeCosts?: number[]` | `buildings.ts` + JSON | Same JSON | n/a | n/a |
| Chip shows the cost | **Zero change** | Control node | Inherited | Inherited |
| Garrison night respawn (C3) | Accumulator in sim | **Ports with the sim** | **Zero** — no chore (K3) | Same |
| Determinism (K2) | Fixed interval; **no RNG** | Lockstep-safe | n/a | n/a |
| **Session length 20 min** | Fine | Fine | Fine | **The one real cost.** A 20-min level on a phone needs pause/resume and 2× speed — both already ROADMAP Phase 1 backlog. **This promotes them from nice-to-have to mobile-blocking.** |
| Saves | No migration | Same schema | n/a | n/a |

### Extension seams

| Future work | Seam | Cost |
|---|---|---|
| **CD-31 campaign** | **The board-vs-demand curve (P4) becomes the authoring instrument.** T1's real prize: **`difficultyPoints` per enemy in `enemies.json` + a `validate.ts` assert that each wave's points track the board curve.** Thronefall's generator, data-side, engine-agnostic — levels 3–12 don't each need this analysis. **Named, deliberately not built.** | One number per enemy + ~15 validator lines. |
| **CD-50 / OQ1-C1** | `upgradeCosts?: number[]` — **one field, two customers** (production defs; the CC, whose `cost: 0` would make upgrades free — prior R9). | Already here. |
| **CD-49 branch widening** | Length is the gate: `atLevel: 3` costs 296₡/tower — **85% of a 6-wave run across 5 towers, ~45% of a 10-wave run.** CD-49 must pick `atLevel` *after* the length call. | Data only. |
| **CD-47 house** | +150₡ at 6 waves, +270₡ at 10. **1c needs re-deriving** either way. | Pure data. |
| **CD-30 perks/mutators** | A longer level compounds perks harder. **D8's no-income-picks rule gets *more* load-bearing at 10 waves.** | No new mechanism. |
| **CD-29 hero** | Gated on "CD-41 and CD-48 must close first." **Step 3 unblocks it.** A respawning hero is a K-floor — the same term as C3. | — |

---

## 10. Implementation steps

### Step 0 — Measure. Ships nothing. **Nothing proceeds before P1 and P4.**

| Probe | What | Decides |
|---|---|---|
| **P1** | **Fine-grained band ladder.** Isolated Outpost W6, war chest **2000 → 2600 by 100₡**, fixed greedy build rule. Record **HQ minimum**, **wrecks at dawn**, **time-of-first-building-loss**. | **Whether Defect C exists at all.** |
| **P2** | *(only if P1 is binary)* **Invulnerable-board probe.** At 2200₡, clamp building HP at 1 (dev toggle). | Bloody-wins ⇒ the feedback through building loss **is** the gain ⇒ C3 aimed correctly. Still HQ-0s ⇒ **C is not a mechanism problem, it's B**, and §6b is cancelled. |
| **P4** | **The demand curve.** Minimum war chest to clear **each wave W1–W6 in isolation**. We have W5=800, W6=2500. **Get all six.** Plot against the board curve (260/420/550/890/1188/1738). | **Everything.** Confirms or refutes §3. Every number in §8's ramp is authored against it. **The instrument, not a probe.** |
| **P3** | **Ridge's ladder.** Isolated Ridge W5 + a W1–W5 demand curve. (9 sites, 5857₡ ceiling, **5 waves**.) | Whether Ridge has the same disease. |

**Falsifier, stated plainly:** if **P4 shows the demand curve is roughly linear and only W6 is an outlier**, then §3's structural claim is wrong and **the correct fix is option 1 (nerf W6) — not lengthening.**

### Step 1 — **USER'S CALL: level length.** Blocks Step 2.

Present §3's curve + §4's 46/69/87% table. **Recommendation: Outpost 6 → 10.** Compromise: 8 (69%). Fallback: 6 + option 1.

### Step 2 — Author the level. `levels.json` only. **Closes CD-48 (A + B).**

**If length = yes:** W1–W5 **byte-identical**; W6 re-authored to ~1500₡; W7–W10 appended on §8's ramp; warlord → W10; `clearBonus` continuing the ~150–200 trend.
**If length = no:** nerf W6 to ~1650₡, aimed by P4.

*QA: **§6c's two-sided criterion**. Plus monotonic damage to the climax; **CD-38's control still hard-defeats at W4**; **CD-41's W3 discrimination still holds**; idle ≤70₡/dawn (K5); **greed must still lose**. **Re-run P4 after authoring.***

### Step 3 — The band. **Closes CD-48 (C) and unblocks CD-29.** Scope set by P1/P2.

Most likely **nothing to do**. Otherwise C3 (`squad.respawnSeconds`, T4's 10s/6s), C2 as fallback.

*QA (C3 only): the all-gun-tower control **still** hard-defeats at W4; **marginal DPS/₡ from garrisoning still trails buying a new tower** — metric named before shipping.*

### Step 4 — CD-50. **Closes CD-50.**

**Root cause, named (T5):** `upgradeCost` is **linear in level** while `incomeMul` gain is **constant** per level. **Payback grows linearly with level, so the top production level is a trap at *any* length** — 11.9 dawns for `plasma L2→L3` is dead even at 14 waves. **Never the multiplier, never the length.**

**The rule (T5): an income upgrade's payback must equal the building's own payback.** Fix: `upgradeCosts: [~45, ~45]` (flat) → **2.3 dawns at every level.**

**Closes without the length call:** at 2.3-dawn payback, an upgrade bought day 2 of a 6-wave level gets 4 paying dawns = **+33₡ net.** Positive. **Ship either way.**

**Rejected: raising `incomeMul`'s slope** (Thronefall-exact — their House *doubles*). m1-at-L3 would pay 224₡/dawn, best-case ~359₡/day — **shattering 1c and re-arming CD-35's snowball.**

> **Metric named before shipping.** A *dominated* option is fine; a **negative-expected-value** option is a trap. **Pass criterion: `net credits over the remaining run > 0` at the wave the upgrade first becomes affordable**, measured. Plus idle ≤70₡/dawn; **economy-first still dies at W3**; 1a/1b/1c re-derived.

---

## 11. Risks & the cheapest de-risk

| # | Risk | De-risk |
|---|---|---|
| **R-A** | **I'm wrong about the exponential curve** — lengthening wastes four waves of authoring. | **P4.** One hour. **Nothing authors before it.** |
| **R-B** | **Defect C is imaginary** — we design a mechanic for a band that exists. | **P1.** 30 min at 100₡ granularity. |
| **R-C** | **C3 aimed at the wrong term.** | **P2.** Sizes the feedback before building a damper. |
| **R-D** | **10 waves too long for a browser demo.** | **It is a JSON array length.** Ship 10, measure, cut to 8 in one edit. Pull ROADMAP's 2× speed forward. |
| **R-E** | **C3 makes garrison dominant / is rubber-banding.** | Cap at `countByLevel` (T4); metric named; **all-gun-tower control must still fail at W4**; DPS/₡ still trails a new tower. |
| **R-F** | **W7–W10 introduce a new cliff.** | Author against **P4's curve** at 1.12–1.16×, then **re-run P4**. |
| **R-G** | **Fifth re-baseline.** | **Append, don't re-ramp.** W1–W5 byte-identical. |
| **R-H** | **Ridge diverges** (10-wave Outpost next to a 5-wave Ridge); its post-CD-45 state is unmeasured. | **P3.** Measure, then decide — **don't ship the mismatch silently.** |
| **R-I** | **5953₡ overstates the problem.** | **Closed in §4** — use **3742₡**. Claim survives at 46%. |
| **R-J** | **Day-8/10/14 projections are assumptions.** | **Authoring-dependent ⇒ a target, not a forecast.** Verify post-Step-2. |
| **R-K** | **CD-31 later re-cuts Outpost, wasting authoring.** | Waves get **redistributed, not deleted**. **Step 2 is a down-payment on CD-31.** |
| **R-L** | **1c is stale** the moment length changes. | Re-derive in Step 4. |

---

## 12. What is the user's call vs. mine

**Mine (made):**
- **My §5/Finding 3 is retracted.** CD-45 made W6 easier; the stagger is dead; §7a withdrawn wholesale.
- **§13(4) retracted on both halves.** §3a.
- **The cause is exponential demand crossing a linear board** (T1). §3. *Falsifiable — P4.*
- **The sink denominator is 3742₡, not 5953₡.** Claim survives: **46%.** §4.
- **CD-48's criterion must go two-sided**, and that's unsatisfiable without a band. §6c.
- **The binary claim is under-sampled** and may dissolve for free. §6a.
- **CD-50's root cause is quadratic cumulative cost vs. linear income gain** — not the multiplier, not the length — and closes with `upgradeCosts` independently of Step 1.
- **C4 rejected on T3**; C3 is the mechanism **if** one is needed, on T4.
- Step ordering; **append-don't-re-ramp**; P1–P4; CD-49's `atLevel` dependency; the mobile session-length flag.
- **OQ1 is not re-opened.**

**Yours (escalated):**
1. **Does Outpost keep six waves?** — **the headline call.** Recommendation: **10**, on the arithmetic (87% vs 46%) and T1/T2. Compromise: **8** (69%). Fallback: **6 + a W6 nerf**, which closes Defect A cheaply and leaves B/C/CD-50 filed and honest. **The strongest argument against me: Thronefall's 10–20 minute maps are a paid Steam product; a browser demo that asks for 20 minutes may simply not get them. That is a product judgment, not an arithmetic one, and it's yours.** Reversal cost: one JSON edit.
2. **Does Ridge move too?** Gated on **P3**. Decided, not defaulted.
3. **Is a band mechanic (C3) in scope now, or does CD-48 close on A+B with C getting its own ticket?** Gated on P1 — **it may not be a question at all.**

**Docs to update on landing:** `ROADMAP.md` (**CD-29's hero gate is satisfied by Step 3**); `TICKETS.md` (**CD-41 → closed**; CD-48 → re-diagnosed, criterion two-sided, its "`waves.json`" text corrected; CD-50 → root cause named; CD-49 → `atLevel` gated on Step 1; CD-31 → Step 2 is a down-payment); `docs/design-wave-legibility.md` (**mark §5, §7a, §11 Step 3, §11 probe 3, §13(4) superseded**; §3a annotated W4-only); **`docs/design-roster-redesign.md` — still asserts "enemies never pushed" in two places. Third time raised.**

---

## 13. Simplifications bought

Steps 0–2 add **zero types, files, UI classes, snapshot state, input verbs, RNG** — lengthening is `levels.json`, and W1–W5 don't move. Step 4 adds **one optional field** paying for two tickets. Step 3 most likely adds nothing. And **P4 leaves behind the instrument** — a board curve and a demand curve in the same units — that CD-31 would otherwise invent eight more times.

**The whole pass is: four wave objects, one optional field, and two probes that decide whether either is needed.**

---

**Sources (new this pass):**
- [Eternal Trials wiki — exponential-then-linear budget, "simulated economy based on starting gold"](https://throne-fall.github.io/game-content/eternal-trials.html)
- [Barracks wiki — night respawn on a 10s/6s timer, 4/8/12 capacity](https://throne-fall.github.io/game-content/buildings/barracks.html)
- [House wiki — 2g build / 2g upgrade / 1g→2g income (equal payback)](https://throne-fall.github.io/game-content/buildings/house.html)
- [Tower wiki — branch at L3](https://throne-fall.github.io/game-content/buildings/tower.html)
- [Steam: "Night never ends" — night is kill-based, not timed](https://steamcommunity.com/app/2239150/discussions/0/3807283063849368527/)
- [NamuWiki — ~10–20 min per map, cleared on night 13; Neuland is the tutorial](https://en.namu.wiki/w/Thronefall)
- [Getting Started wiki](https://game.wiki/thronefall/getting-started)
- [GameLuster review — ~15 waves per level](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/)
- [New Game Network review — the final-boss cliff complaint](https://www.newgamenetwork.com/article/2820/thronefall-review/)
- [Game Developer — Mastering minimalism and layering complexity with Thronefall](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall)
