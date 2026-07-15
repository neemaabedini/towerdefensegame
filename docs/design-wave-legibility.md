# CD-41 / CD-47 / CD-48 / OQ1 — One Design Pass: "The waves grade the build"

Architect design doc, 2026-07-15. Covers TICKETS.md **CD-48**, **CD-41**, **CD-47**, and **ROADMAP Open Question 1**.
Status: designed → two user decisions pending.

**Headline: the bundle does share a single fix — but not the one the hypothesis proposed.** CD-41 and CD-48 are the same defect at opposite ends of the run (waves don't grade builds smoothly); the income diagnosis is falsified by arithmetic and by a missing baseline; CD-47 is a real feature that was mis-sold as a cliff fix; and OQ1 is genuinely independent of all three.

---

## 1. Problem statement & constraints

Four items arrived bundled on the hypothesis that killing the research *building* frees Outpost `s1` to host income again, dissolving CD-41. I tested that hypothesis first, and it broke on a measurement (§4). Testing it properly forced re-deriving CD-41's root cause from the shipped data, which changed the answer to three of the four items.

**Binding constraints, cited:**

| # | Constraint | Source |
|---|---|---|
| K1 | ≤4 options per site, keys 1–4; no hover-only info; all input as `GameAction` | UI_PLAN principles 2, 4, 6; CD-7 C7 |
| K2 | No new `Math.random()` in sim paths | CD-20 (open); CD-38 QA item 8 greps for it |
| K3 | No upkeep / micromanagement; set-and-forget is sacred | ROADMAP "Kingdom Two Crowns" lesson; CD-7 C10 |
| K4 | Every option shows explicit numbers before purchase; **no trap picks** | ROADMAP Phase 2 clarity rule; "They Are Billions" lesson; CD-7 C2 |
| K5 | Idle money ≤70₡/dawn on a healthy build | CD-35 QA; CD-7 C4 |
| K6 | Defs in `src/data/*.json`; sim engine-agnostic; UI from `GameSnapshot` | UI_PLAN "Godot 2D (PC)"; CD-7 C8 |
| K7 | IP: no Blizzard terms; "supply depot" banned; "Plasma Wells" not vespene; never copy Thronefall names/layouts/UI | ROADMAP "IP differentiation" rules 1, 6 |
| K8 | **"Pressure must be legible before it is lethal"** | ROADMAP community-feedback item 2 — this turns out to be the whole doc |
| K9 | Don't add balance surface while two P1 cliffs are open | CD-49's own sequencing note |

**Correction to a shared assumption:** there is no `waves.json`. Waves are authored inline per level in `src/data/levels.json` (`levels[].waves[]`). CD-48's suggested fix location is real, but it's a `levels.json` edit — which also means **a wave edit and a site/obstacle edit touch the same file**, and both are covered by `src/data/validate.ts`.

---

## 2. The standing rule applied: what Thronefall actually does

Research done this session, building on the record already in the brief. Every decision below carries a verdict.

| Finding | Source |
|---|---|
| Buildings occupy **predefined slots**; the devs removed free placement deliberately and say the constraint "opened design opportunities" | [Game Developer interview](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall) |
| **House**: 2g cost, 1g/night (2g at L2), 2g upgrade, 20HP (30 L2). Appears on **only 4 maps** — cheap safe income is an *authoring* decision, not a universal building | [House wiki](https://throne-fall.github.io/game-content/buildings/house.html) |
| Houses "are usually situated **near the castle**"; castle upgrades also grant **more nodes** | [Steam building guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3016836199), [Getting Started](https://game.wiki/thronefall/getting-started) |
| Economy consensus: **"Economy first, but only when you can defend it perfectly"**; priority **Houses ≥ Mines > Farms/Harbors**; "always having one extra source of income at the end of each night is better than mass spamming economy in risky positions"; build **opposite the wave direction** each day | [Steam building guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3016836199), [reactive economy guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3279612489) |
| Castle picks are their clearest **dead/dominant option** failure: Builder's Guild is "**too good NOT to take**"; Castle-Up "generates ~15 gold of discounts every night"; Godly Curse "only useful when you're holding a bow"; Commander/Royal Training "**doesn't help kill monsters any faster nor keep the base alive longer**" | [Overpowered & underpowered upgrades](https://steamcommunity.com/app/2239150/discussions/0/4308326918580849935/) |
| Difficulty is a **difficulty-point budget per wave**, exponential for the first 7 stages then linear; ~15 waves/level | [Eternal Trials wiki](https://throne-fall.github.io/game-content/eternal-trials.html), [GameLuster review](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/) |
| **Their worst-reviewed moment is a final-wave difficulty cliff**: "a difficulty spike from … reasonably tough enemies with fully upgraded towers to an almost untouchable boss who one-shots every unit and tower … **stifles build variety and pretty much guarantees you'll lose your first time** no matter how good you are" | [New Game Network review](https://www.newgamenetwork.com/article/2820/thronefall-review/), [final boss needs a nerf](https://steamcommunity.com/app/2239150/discussions/0/4693405960869523772/) |
| Player difficulty complaint: "**Between the first 5 levels of a game there cant be such a spike**"; devs state they are "more focused on making Thronefall easier than harder" | [The difficulty is too vertical](https://steamcommunity.com/app/2239150/discussions/0/4346606879506481306/), [Third stage way too hard](https://steamcommunity.com/app/2239150/discussions/0/4032475816296173250/) |
| Dawn respawn with delayed gold "makes the game forgiving, reduces frustration, and incentivizes protection — three design objectives through one elegant solution" | [Game Developer interview](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall) |

---

## 3. Finding 1 — the income diagnosis is falsified. Twice.

CD-41's root cause is *"safe income halved (110→56₡/dawn), so a safe-playing build arrives at W4 with roughly half the old war chest."* Two independent checks kill it.

### 3a. The arithmetic: W4 arrives after three dawns

Outpost W4 is day 4. A building bought on day 1 pays at the dawns after W1, W2, W3 — **three payouts**. So any income change of Δ₡/dawn is worth **at most 3Δ by W4**.

| Proposed income fix | Δ/dawn | Worth at W4 |
|---|---|---|
| QA's knob `mining_facility.incomePerDay` 14→17 (m1 56→68) | +12 | **+36₡** |
| CD-41's alternative `cost` 130→110 | one-off | **+20₡** |
| CD-47 house (70₡ → 30/dawn) built at `s1` | +30 | 90 received − 70 spent = **+20₡** |
| …same house *replacing* the 120₡ sensor array | +30 | +50 saved + 90 = **+140₡** |
| **Fully restoring the pre-CD-7 safe floor** (56→110) | +54 | **+162₡** |

Now the falsifier — **CD-41's own experiments**: adding a second dedicated `missile_battery` (**+100₡**) did not change the outcome; the double-AA + tanky variant (**+~200₡** of defense reallocated) was the **worst of five (1436.7₡)**. So ~100–200₡ of extra defense, spent by the ticket's own testers, flipped nothing.

**Every defensible income knob lands inside a range already demonstrated not to work.** Even a *complete* restoration of the old safe floor (+162₡) is inside it. This isn't a judgment call — it's a bound. There is no income knob that fixes a day-4 problem, because day 4 is only three dawns deep.

### 3b. The baseline: CD-41 compares against a measurement that was never taken

CD-41 argues CD-7 turned W4 into a cliff, citing CD-36's closure (HQ never below 400/600). But CD-36 only ever measured **one build** — the mixed defense-first build. Track that build across every re-baseline:

| Build | Economy | Sim | W4 damage | W4 outcome |
|---|---|---|---|---|
| CD-36 mixed | old (barracks/refinery) | pre-CD-45 | 540₡ | clears |
| CD-46 reference (same shape) | new (CD-7) | post-CD-45 | **570₡** | **clears**, HQ 440/600 |

**At W4 the reference build is unchanged.** 540 → 570 is noise. The four archetypes that fail at W4 — economy-first, cheap-full-coverage, lean-choke, tanky+redundant-AA — **were never measured under the old economy.** There is no evidence they ever cleared W4. CD-41's comparison has no baseline on its own subject.

What *did* regress is W6 (758.5 → 1110, victory → hard defeat) — and that already has its own ticket: **CD-48**.

### 3c. Four of the five failing archetypes are builds the design deliberately invalidates

CD-38's QA verdict, shipped and signed off: *"the game now demands combined arms. Pure single-type strategies both fail hard… AA is mandatory and purchasable once skimmers appear, never incidental… No new dominant strategy was found."*

| Archetype | W4 | Why it fails | Intended? |
|---|---|---|---|
| Defense-first / full coverage (all 5 roles) | **clears**, 570₡ | — | ✅ the design's answer |
| Economy-first (zero day-1 defense) | fails W3 | greed | **yes** — greed must lose |
| Cheap-full-coverage (7 gun towers, zero AA) | fails, 800₡ | no AA vs 6 skimmers | **yes** — this *is* CD-38's permanent regression control |
| Lean-choke (2 buildings) | fails, 1130₡ | density | **yes** — CD-38 test 2 established no 1–2 buildings hold a lane |
| Tanky + redundant AA (garrison×2, missile×2) | fails, 1436₡ | missing gun/siege/sniper — 3 of 5 roles | **yes** — combined arms |

CD-41's pass criterion ("a majority of the five archetypes should clear W4") **demands that builds CD-38 was shipped specifically to invalidate should nonetheless clear.** The criterion contradicts the roster design. This is the "fix the criterion, not the number" the brief asked for — but it applies to CD-41's *pass criterion*, not just to §12 item 1.

> **Thronefall verdict — "more income fixes a difficulty cliff": REJECT / not-applicable.** Thronefall's economy is *smaller* than ours (House = 1g/night) and its difficulty is a **wave difficulty-point budget**, tuned in the wave layer, not the economy layer. Their own difficulty complaints ("too vertical", "third stage way too hard") are answered by devs rebalancing *waves and modes* — never by raising house income. Income is not their difficulty dial and it shouldn't be ours.

---

## 4. Finding 2 — the real cause: Outpost W4 introduces two counters at once, and Ridge is the control

Read the shipped `levels.json` wave tables side by side. This is the whole ticket.

**Outpost Alpha — when each counter-requirement is introduced:**

| Wave | New enemy | New counter demanded |
|---|---|---|
| W1 | raider | — |
| W2 | swarmling, spitter | — |
| W3 | **brute** (armor 2) | armor, gently |
| **W4** | **skimmer ×6** *and* **siege_walker ×2** | **AA (mandatory) *and* armor-cracking (mandatory), simultaneously, at full strength** |
| W5 | — | — |
| W6 | warlord | — |

**Ridge Pass — same table:**

| Wave | New enemy | New counter demanded |
|---|---|---|
| W1 | raider | — |
| W2 | swarmling, spitter | — |
| **W3** | brute ×3, **skimmer ×5** | **air introduced alone** |
| **W4** | **siege_walker ×3** | **armor introduced alone, one wave later** |
| W5 | warlord | — |

**Ridge staggers its two counter-introductions across separate waves. Outpost fires both on the same night, with zero prior air exposure.** That is the cliff — not the economy.

The legibility failure is measurable in CD-41's own numbers:

| Build | W1 | W2 | W3 | W4 |
|---|---|---|---|---|
| Lean-choke (doomed) | 0 | 57.2 | **82.7** | **1130 → hard defeat** |
| Reference (correct) | 0 | 57.4 | **206.6** | 570 → clears |

**The doomed build takes 2.5× *less* damage in W3 than the correct build.** The game tells the player their thin build is working *better* than the right one — right up until it deletes them in one night. That is Thronefall complaint #4, ROADMAP community-feedback item 2 verbatim ("pressure must be legible before it is lethal"), and CD-12's original flatline-then-cliff finding, all reproducing at once.

W1–W3 contain **no air at all**, so they cannot grade a build on the one axis W4 grades lethally. A player cannot be punished at W4 for failing a test they were never shown.

> **Thronefall verdict — introduce a counter-requirement at survivable strength before it becomes lethal: ADOPT.** Their stated philosophy is *"The game starts out simple but gets more and more complex over time. This makes sure that players are never overwhelmed"* ([Game Developer](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall)), implemented as an exponential-then-linear difficulty-point ramp. Their **failures** are precisely where they broke it — the final boss that "guarantees you'll lose your first time" and the level-3 spike players call "too vertical." Outpost W4 is our version of their level-3 spike.

> **Thronefall verdict — "the wave layer is where difficulty is tuned": ADOPT.** Waves are a difficulty-point budget in their game. CD-7 §13's warning ("retuning waves hides the real cause") is a warning against tuning waves *to mask a cause located elsewhere*. Here the cause **is** in the wave layer, and Ridge is the in-repo control proving it: same sim, same economy, same roster, staggered introductions → no equivalent cliff, and its zero-AA control correctly dies at W3 instead of ambushing the player at W4. Tuning Outpost's introduction curve to match Ridge's is fixing the cause, not hiding it.

**This is an argued exception to the brief's "do not retune waves first" constraint, and it is gated on an experiment (§9 Step 1) that can prove me wrong.**

---

## 5. Finding 3 — CD-48 is the same defect, mirrored

CD-48: the one build that survives W4 now hard-defeats at W6 (1110₡). QA's hypothesis: CD-45's declumping lets more of W6's 33 enemies engage simultaneously instead of queuing.

Evidence **for** QA's hypothesis, including a prediction the data already confirms:

1. **Money is not the lever, by the ticket's own evidence.** Two *fuller* variants (1557₡ full-10-site coverage, 1274₡ upgrade-priority) also hard-defeat at W6. Spending more, differently, does not avoid the wall. This is the clean discriminator from CD-41: **CD-48 fails with money left over; CD-41 was alleged to fail for lack of money.**
2. **It hit the highest-count waves on both levels, and only those.** Outpost W6 (33 enemies: raider×10 + raider×10 at delay 0/interval 0.45 from *two* spawns — the densest simultaneous arrival in the game) → new defeat. Ridge W5 (swarmling×20 at interval **0.28** + warlord) → W4-clear became W5-defeat (CD-46). Two levels, two regressions, both at the highest-count/tightest-interval wave.
3. **It did not touch the low-count failure.** CD-38's all-gun-tower control at W4: 740₡ before, **740₡ after** — byte-comparable. Separation is inert where counts are low.
4. **The direction is explained.** Separation has two opposing terms: fewer enemies focus-firing one building (helps — reference build W4 990→570) and more enemies reaching the contact ring at once (hurts). The crossover is enemy count. At 33 it flips.

**The honest framing that dissolves §13's objection:** W6 was authored against a sim where enemies stacked on one pixel and queued behind each other. That stacking **was the CD-45 bug** — the thing that made the swarm unreadable and HP bars appear to refill. W6 was only ever passable *because of a rendering-breaking defect*. CD-45 corrected the sim; **every wave's arrival profile is now stale**, and W6/Ridge-W5 are where it shows because they have the most bodies. Re-authoring the arrival profile against the corrected sim is the fix, not a paper-over.

> **Thronefall verdict — a brutal final wave as intended design: REJECT.** Their final boss is the single most-cited difficulty complaint in the review record: *"an almost untouchable boss who one-shots every unit and tower… stifles build variety and pretty much guarantees that you'll lose your first time trying to fight him no matter how good you are"* ([New Game Network](https://www.newgamenetwork.com/article/2820/thronefall-review/)). ROADMAP already logs difficulty cliffs as their #4 complaint. Our W6 has exactly that shape: W5→W6 damage rises only +32% (838.8→1110) but the *outcome* flips 381/600 → 0. **The damage curve is smooth; the outcome is a cliff.** That is the tell that the wave overshot a threshold, not that the climax is appropriately climactic.

> **Thronefall verdict — cut the enemy count to fix it: REJECT.** Their praised property is the escalating night spectacle, and ROADMAP's They Are Billions lesson names swarm spectacle as our finale's cheap emotional lever. **Stagger, don't decimate**: change `delay`/`interval` on the two raider×10 entries so 33 enemies still arrive, but not in one 4.5-second slab. Count reduction is knob #2, not knob #1.

---

## 6. Finding 4 — testing the hypothesis: `s1` is not reserved. It's empty.

The hypothesis: *"CD-41's root cause is that `s1` is reserved for the research facility… Kill the research building and `s1` is free to host income again."* Three measurements against the shipped data:

**(a) `s1` is not full — it has three free option slots today.**
```
levels.json:17 — { "id": "s1", "x": 868, "y": 372, "category": "any", "options": ["sensor_array"] }
```
One option. K1's cap is four. Adding an income option to `s1` requires nothing to be removed, and **does not depend on OQ1's answer in either direction.** The "reservation" is a line in a design doc, not a constraint in the data.

**(b) Freeing `s1` would not produce income anyway — I measured it.** `s1` (868,372) against Outpost's Home Field, at `mining_facility.mining.radius = 95`:

| Crystal | Distance | In radius? |
|---|---|---|
| (890,455) | **85.9** | ✅ |
| (915,488) | 125.2 | ❌ |
| (858,494) | 122.4 | ❌ |
| (905,522) | 154.5 | ❌ |

**`s1` derives exactly 1 mineral node**, and `mining_facility.requires = { resource: "mineral", min: 3 }` filters the option out at `loadLevel` (`Game.ts:121-124`). Ridge `s1` (770,50) derives **0** — nearest crystal 204px. So killing the research facility hands `s1` an empty slot with nothing that can legally fill it. **The hypothesis's causal step doesn't connect.**

**(c) Re-authoring the field to fix (b) opens a latent bug.** `deriveSiteResources` counts crystals per-site *independently*; `collectDawnIncome` reads the building's own site count. **Nothing prevents two mining facilities from both counting the same crystals.** Today only authoring discipline prevents it — I verified no site double-dips, but **Ridge `d5` (250,318) already derives 1 node** from the Far Field (82.5px to `(186,370)`) and is two crystals from qualifying. Moving Outpost's Home Field so `s1` reaches 3 nodes would have `m1` and `s1` both mine it: 4×14 × 2 = **112₡/dawn from one field**, Outpost best-case 211→267. Fixing that needs a node-claiming mechanic — new state, new port surface, for a fix that §3a already proved is worth +162₡ at W4.

**Verdict on the hypothesis: rejected on the CD-41 leg, and the CD-41 leg is the load-bearing one.** `s1` was never the constraint. But the hypothesis is **strong on the OQ1 leg** — see §7c, where I recommend it on completely different grounds (scale against the benchmark, not income).

---

## 7. Options & recommendations

### 7a. CD-48 — the W6 cliff

| Option | Trade-off |
|---|---|
| **A. Stagger the high-count entries** (Outpost W6 raider×10+×10; Ridge W5 swarmling×20) via `delay`/`interval` | Pure `levels.json`. Preserves 33 on screen (spectacle intact). Directly targets the term separation unlocked. Reversible. Costs: reduces *peak* concurrency somewhat — the thing we're deliberately trading. |
| B. Cut counts (10+10 → 8+8) | Kills the spectacle lever ROADMAP names. Knob #2. |
| C. Tune `SEPARATION_STEP_FRACTION` (0.5) | Re-invalidates **every** baseline again — third re-baseline in three tickets. Also re-arms CD-45's deadlock class, whose clamp is documented as load-bearing. Reject. |
| D. Cap simultaneous attackers per building | New sim mechanic, invisible to the player, needs its own design + port surface. Restores the *bug's* behavior on purpose. Reject. |
| E. HQ `maxHp` 600→700 | Global; changes every wave on both levels. Last resort. |
| F. Accept the cliff | **Thronefall verdict: REJECT** — their final-boss complaint, verbatim. |

**Recommendation: A**, aimed by the Step 1 probe, with B then E as the knob ladder. **Closes CD-48.**

### 7b. CD-41 — the W4 cliff

| Option | Trade-off |
|---|---|
| **A. Stagger Outpost's counter-introduction: move a small skimmer group (2–3) into W3**, mirroring Ridge | One `levels.json` entry. Makes air legible *before* it's lethal (K8). Ridge is the in-repo control. Punishes zero-AA builds visibly at W3 — fixing the 82.7 vs 206.6 discrimination failure — without killing them. |
| B. Income knob (`incomePerDay` 14→17) | **Arithmetically dead (+36₡ at W4, §3a)** and it breaks §12's band (238/day) and mostly pays out at the *contested* sites — backwards for a *safe*-income complaint. **Do not ship.** |
| C. `cost` 130→110 | +20₡ at W4. Dead. |
| D. CD-47 house as the fix | +20₡ (or +140₡ if it replaces the sensor). Inside the range CD-41's own tests showed doesn't work. **CD-47 is a good feature; it is not this fix.** |
| E. Free `s1` | §6: `s1` isn't full, and can't host mining anyway. No-op. |
| F. Retire CD-41's diagnosis and re-scope to legibility | **Recommended**, together with A. |

**Recommendation: A + F.** Re-scope CD-41 from *"safe income floor"* to *"Outpost introduces AA and armor-cracking on the same wave with zero prior exposure; W1–W3 do not discriminate."* Its pass criterion changes from "majority of five archetypes clear W4" (which contradicts CD-38) to:

> **CD-41 revised pass criterion.** (1) A zero-AA build takes **visible but survivable** damage at W3 — non-zero, materially above its W2, and ideally a wrecked building — and does **not** hard-defeat before W4. (2) W3 damage **discriminates**: a build missing a required role takes *more* W3 damage than the full-coverage reference, not less. (3) CD-38's permanent all-gun-tower regression still hard-defeats at W4 with the AIR badge on day 4 — **the control must still fail.** (4) The reference build still clears W4 at ≲600₡.

Criterion (2) is the direct fix for the 82.7-vs-206.6 inversion, and it is CD-37's lesson applied a third time: **name the metric the mechanism actually moves.**

**Note this is a design-intent change → user's call (§11).**

### 7c. OQ1 — research. *User's decision; I recommend only.*

| Option | Trade-off |
|---|---|
| **A. CD-7 §5 as designed** — `research_facility` on `s1`, `research.json`, 2 tracks × 3 tiers, `ResearchRing`, `ResearchState` | Designed, costed, CD-40's seam specified. Real depth: 6 purchase decisions, budget-and-tempo. **But:** ~10× the benchmark's machinery; new JSON file + new UI class + new snapshot state + 2 new events = all port surface; §12 items 4–10, 13–14 are a large QA bill; the sell-back exploit (R7/D10) exists *only* because the facility is sellable; and ROADMAP's own worry ("a real choice, not a stat stick") is answered with a *money* argument, not a *choice* argument — six nodes of ±5% is a stat stick with a budget attached. |
| B. Roguelite pick-1-of-3 draft | Already rejected by CD-7 §2b: needs RNG in a sim path (K2, CD-20 open) and collides with CD-30. Unchanged. Still available later as pure presentation once CD-20 lands. |
| **C. Command-Center picks** (the hypothesis) — reuse CD-38's `branch` at the HQ; no `research.json`, no `ResearchRing`, no `ResearchState`, no `research_facility` | See below. |

> **Thronefall verdict on A (an in-run research tree): NOT-APPLICABLE, tending REJECT.** Thronefall has **no in-run research tree at all** — there is nothing to adopt or reject, because they solve build variety in a *different layer*: pre-run perk loadout (1 slot → 5 by level 24, [Perks wiki](https://throne-fall.github.io/game-content/perks/)) plus per-building branches (Tower: 1-of-4 at L3, [Tower wiki](https://throne-fall.github.io/game-content/buildings/tower.html)). Their entire global-effect layer is **two castle upgrades** (7g, 20g), each a choice of global picks ([Leveling](https://throne-fall.github.io/about/leveling.html), [Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3016836199)). Our two layers already exist as tickets: **CD-49** (per-building branches) and **CD-30** (pre-run perks — ROADMAP calls it "the top replayability driver every studied community ranks top"). A 6-node tree is a *third* variety system stacked on two we haven't built.

> **Thronefall verdict on C (global picks on the HQ): ADOPT the mechanism, REJECT their balance.** The castle-choice shape is exactly right and it is what their game actually ships. But their execution is the community's clearest dead/dominant-option failure: Builder's Guild "**too good NOT to take**", Castle-Up "~15 gold of discounts every night", against Godly Curse ("only useful when you're holding a bow") and Commander/Royal Training ("doesn't help kill monsters any faster nor keep the base alive longer") — [source](https://steamcommunity.com/app/2239150/discussions/0/4308326918580849935/). **Our K4 no-trap rule is stricter than what they shipped.** Adopt the shape; hold the picks to CD-37's named-metric-up-front standard.

**What C actually buys (verified against the code, not asserted):**

| Win | Evidence |
|---|---|
| **Zero input-layer change.** `main.ts:118-132` already routes `option(n)` → `pendingBranch` when a building is selected. A CC pick works through the shipped path. | **CD-7 §7's `resolveOption` refactor becomes unnecessary** — the third case never appears. |
| **The sell-back exploit class evaporates.** `getSellInfo`/`sellOrUndo` both hard-return on `b.isHq` (`Game.ts:468, 492`). The HQ cannot be sold, and if it's destroyed the level is already lost. | **CD-7 D10 + R7 delete themselves.** So do "research never outlives its facility" and "destroy→dawn-rebuild preserves research" — non-questions. |
| **`s1` freed** for CD-47's house, with no option-cap pressure. | Removes the interference where buying research costs you the safe-income slot. |
| **CD-40 unblocks** — airstrike becomes a third pick; Sensor Pulse is already CC-native (CD-40's own note). | Zero UI change. |
| **CD-49 gains a 10th branching building** and shares this design's chip-wrap work. | See §10. |
| Deletes `research.json`, `research.ts`, `ResearchState`, `ResearchRing`, `buyResearch`/`undoResearch`/`hasResearch`, `research_facility`, and 2 `GameEvent` kinds. | ~1 new JSON block instead. |

**What C actually costs — the hypothesis under-counts this, and it matters:**

1. **`branch` cannot express a global effect.** `BranchOption.mods` is consumed *only* inside `scaledStats(def, level, branchId)` (`buildings.ts:195-204`), which multiplies **the owning building's own** stats. A CC pick of `mods: { damage: 1.05 }` buffs the HQ's light gun and **nothing else**. Global picks still need a global mods channel: `globalMods()` (memoized) + `scaledStats(..., mods?)` + `restatAll()` — i.e. **3 of the 8 items in CD-7 §7 survive.** "Reuse the branch mechanism, no new state" is not free; it's ~70% cheaper, not 100%.
2. **The shipped `branch` supports exactly ONE fork per building.** `pendingBranch` gates on `b.level + 1 !== def.branch.atLevel` and `branchId` is a single `string | null`. Thronefall's castle upgrades **twice**. Matching that needs `branchId` → `branchIds: string[]` across ~12 call sites and a QA-verified mechanism (CD-38 test 5). **Recommend one fork now (C1), two as a later seam (C2).**
3. **`command_center.cost = 0`**, and `upgradeCost = round(cost × upgradeCostMult × level)` (`buildings.ts:161-164`) → **CC upgrades would be free.** Fix with an honest `upgradeCosts?: number[]` override rather than a `cost` field you never pay.
4. **The HQ is not keyboard-navigable during the day.** `navigate`'s day branch iterates `this.sites` only (`Game.ts:287-291`); the HQ lives at `siteId: "__hq__"` and is mouse-selectable via `selectAt` but unreachable by keyboard/controller/spatial-nav. **Putting purchases on it breaks UI_PLAN principles 2 & 3 and makes the feature unbuyable on controller and mobile** until the HQ joins day nav (~3 lines).
5. **It loses CD-7 §6's load-bearing money-sink argument** — *"research is what you buy when the map is full — precisely the moment CD-35's 1600₡ idle-money pathology used to appear."* Two picks at ~100/200₡ is a much smaller sink than 1140₡ of tree. Counter-evidence: CD-46's fuller variants spent 1557₡ on coverage and upgrades, so sinks exist; and CD-49 adds more. But **this is the strongest argument for A and it belongs in the user's decision.**

**Recommendation: C1** — one fork at CC L2, **1-of-3**, global effects, numbers on the chip face. Scale matches the benchmark (their castle: 2 picks; ours: 1, plus CD-49's per-building branches and CD-30's perks carrying the variety load, exactly as Thronefall splits it). **Conditional, stated honestly: C1 is only defensible if CD-49 and CD-30 actually land** — the CC pick is not meant to carry variety alone. Both are filed (CD-49 P2, CD-30 P1).

**Proposed picks (all global, all build-agnostic, each with its metric named up front per CD-37):**

| Pick | Effect | Metric that grades it (never "damage dealt") |
|---|---|---|
| Weapons | +5% damage **and** +5% fire rate, all structures & squads | total W4–6 damage taken |
| Plating | +10% maxHp, all structures & squads **incl. the Command Center** | **wrecks-at-dawn + per-wave HQ minimum** |
| *(CD-40)* Ordnance | unlock airstrike | HQ minimum on climax waves |

**Two CD-7 decisions carried forward, one reconciled:**

- **D6 survives, unchanged and still forced.** %-damage alone is a provable no-op at our integer HP values (gun 10 dmg, swarmling 15 HP → 2 shots at both 10 and 10.7; marine 4 dmg vs armor 5 → `max(1, ·)` = 1 either way). A Weapons pick **must** grant damage *and* fire rate. Not a taste call.
- **D6's anti-fork argument does not transfer — reconciled, not reversed.** D6 rejected hard forks because *building-specific* capstones (siege range vs. splash) are dead for any build lacking that building. **Global picks are exactly the case where a hard fork is safe**, because no build can lack the Command Center. Exclusivity here creates the replay variety ROADMAP ranks top.
- **D8 survives — and Thronefall's data now proves it.** No pick may touch income. Their economy-global, **Builder's Guild, is the one their community calls "too good NOT to take."** D8 was written to stop income compounding (node count × level scaling × global); the benchmark independently confirms an economy-global becomes the auto-pick. **Verdict: REJECT Builder's-Guild-style economy picks, citing that complaint by name.**

### 7d. CD-47 — the house archetype

**Q1 (the economy-thesis tension) — resolved, and the tension is largely false.**

CD-7 D2: *"deleting barracks outright is the point of the ticket — it is the last placement-free income source, and while it exists the map is not the economy."*

The distinguishing property CD-7 actually killed was **income that was identical at every site** — `barracks`/`refinery` could drop on *any* `production` site and paid the same everywhere, so the map made no economic difference. The property was **placement-indifference, not resource-adjacency.**

Thronefall settles this decisively: **their House is not placement-free.** Buildings occupy predefined slots; houses "are usually situated near the castle"; and houses exist on **only 4 maps** — whether a level has cheap safe income is an *authoring decision per map*. That is our site model exactly. And the devs are explicit that removing free placement "opened design opportunities" ([Game Developer](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall)).

> **Resolution:** a house-archetype option **authored onto named safe sites, and only those** is not placement-free income. The map still decides how much safe income exists, on which levels, and at what opportunity cost. **"The map is the budget" survives intact.** CD-7 shipped only the risky-rich half of Thronefall's economy; the cheap-safe-flat half is the other half of the *same* design, not its opposite.

> **Thronefall verdict — the cheap-safe-flat vs. risky-rich-scaling split: ADOPT.** It *is* their economy's depth. Consensus: "Economy first, but only when you can defend it perfectly"; Houses ≥ Mines > Farms/Harbors; "always having one extra source of income at the end of each night is better than mass spamming economy in risky positions." Their Farm — high cost, fragile, isolated — is the community's *bad* building precisely because it's risky-rich without a safe floor to fall back on. Post-CD-7 our economy is **all Farm**.

> **Thronefall verdict — "houses can be around the base" (free-ish placement): REJECT / not-applicable.** Their houses go on predefined slots, and free placement is a thing they deliberately removed. Also ROADMAP complaint #1 (rigid nodes) has a *different* planned answer: CD-9's wall system, post-port. CD-47 must not become a back-door free-placement layer.

**Q2 (placement model) — recommend (i): a cheap option on existing safe rear sites.** Outpost `s1` and Ridge `s1` each carry **one** option today; three key slots free. Zero new sites, zero engine work, zero re-derivation, no re-balance of lane coverage. Option (ii) (new housing cluster) invalidates baselines a *fourth* time; option (iii) (CD-9) is post-port and cannot serve anything today.

**Q3 (balance) — and the honest reframing.** With §3a proving the house cannot close CD-41, **CD-47's justification must stand on its own merits, and it does:**
1. It is the missing half of Thronefall's economy split (above).
2. **`s1` is effectively a dead site today** — one option, a 120₡ sensor array, on both levels. A house makes it live, and **sensor-vs-house on a safe rear slot is a genuine choice** (utility vs. economy) — the same shape as CD-7's celebrated `a2`/`d3` plasma-vs-defense slot, mirrored to the safe side.
3. It is cheap build variety, in the same family as CD-49, and should be **sequenced with CD-49, after the cliffs** (K9).

Starting numbers (a knob, not a claim): **cost 70, `incomePerDay` 30 flat** (no `mining` block, no `requires`). Payback 2.3 dawns — equal to `mining_facility` at `m1` (130/56) and *worse* than `m2` (1.9) or plasma (2.0), so it is correctly the *safe, dull* buy. Cheaper than any tower (gun 80), so it's an affordable day-1 hedge, not a tower replacement (K11/C11 holds via opportunity cost: its DPS/₡ is 0).

**It needs no engine work at all.** `collectDawnIncome` already falls back to `nodes = 1` for a def with `incomePerDay > 0` and no `mining` block (`Game.ts:634-636`). **This is a pure `buildings.json` + `levels.json` change.**

**Q4 (anti-upkeep) — solved by construction.** One house-capable site per level → no spam, no chore, no per-day placement decision. Dawn restoration already rebuilds it free. K3 intact.

**Q5 (naming) — USER'S CALL, not auto-named.** "Supply depot" is banned (K7); "house" is Thronefall's word (K7 rule 6). The `id` is the contract; the display name is CD-16's with user sign-off. One *design* note for that session: a building that prints credits from nothing weakens "credits come out of the ground." The fiction that keeps it honest is **population → tax revenue**: *the map decides mining; the base decides taxes; mining ≫ taxes.* Candidate ids to react to (do not treat as chosen): `habitat`, `hab_block`, `colony_block`.

### 7e. Revised §12 item 1 — fixing the criterion, not the number

The brief is right that §12 item 1 measures the wrong quantity: 211/day-all-safe and 211/day-only-if-you-hold-two-contested-slots pass identically. Replace one band with three parts:

- **1a — Safe floor:** L1 income reachable from lane-safe sites alone ≥ **70₡/dawn**.
- **1b — Contested premium:** (best-case L1 − safe floor) ≥ **1.2 × safe floor**. Going to the map must beat sitting at home.
- **1c — Ceiling:** best-case L1 ≤ **250₡/day** (widened from 230, deliberately: 230 was derived from the *old* economy's max when safe income was 110; you cannot hold 230 *and* an 85₡ floor *and* 1b's premium).

**The criterion is validated against three known states — this is why I trust it:**

| State | Safe floor | Best | 1a | 1b | 1c |
|---|---|---|---|---|---|
| **Pre-CD-7** (barracks+refinery, both safe) | 110 | 220 | ✅ | **❌** (premium = 1.0×) | ✅ |
| **Post-CD-7 today** (Outpost) | **56** | 211 | **❌** | ✅ (2.8×) | ✅ |
| **Post-CD-47** (Outpost, +30₡ house at `s1`) | 86 | 241 | ✅ | ✅ (1.8×) | ✅ |
| **Post-CD-47** (Ridge, +30₡ house at `s1`) | 72 | 227 | ✅ | ✅ (2.2×) | ✅ |

**It fails the old economy on 1b (there was no contested income — CD-7 was right to add it) and fails today's on 1a (safe income collapsed — CD-41 was right to notice).** One criterion that captures both CD-7's thesis and CD-41's complaint, and rejects QA's knob for the right reason (14→17 → 238/day, ceiling ✅ now, but it raises *contested* income, leaving 1a still ❌ — it doesn't even address the thing it was proposed for). Still a ~15-line static probe over two JSON files. **Note 1a/1b/1c are about economy shape — they were never going to fix a day-4 cliff, and now they don't pretend to.**

---

## 8. Data model & module changes

**Steps 1–3 (CD-41, CD-48, CD-47) — data only. No new types. No engine change.**

| File | Change | Item |
|---|---|---|
| `src\data\levels.json` | Outpost `waves[3]` → move 2–3 skimmers into `waves[2]`; Outpost `waves[5]` + Ridge `waves[4]` arrival-profile stagger; `s1.options` += house id on both levels | CD-41, CD-48, CD-47 |
| `src\data\buildings.json` | += house def (flat `incomePerDay`, **no** `mining`, **no** `requires`, `shape: "silo"` reusing the shipped sprite) | CD-47 |
| `src\data\validate.ts` | += the 1a/1b/1c income probe; += the **field double-dip assert** (§10) | CD-47 |

**Step 4 (OQ1 → C1) — if and only if the user picks C.**

| File | Change |
|---|---|
| `src\data\buildings.ts` | `StatMods` exported; `BranchOption.mods: StatMods`; `scaledStats(def, level, branchId?, **mods?**)` — optional, every existing call site keeps compiling; `BuildingDef += upgradeCosts?: number[]`; `upgradeCost()` reads it when present |
| `src\data\buildings.json` | `command_center`: `maxLevel` 1→2, `upgradeCosts: [~120]`, += `branch: { atLevel: 2, options: [weapons, plating] }` |
| `src\data\units.ts` | += `unitStats(def, mods?)` |
| `src\game\Game.ts` | `canUpgrade` + `pendingBranch`: drop the `isHq` guard (**keep it in `getSellInfo`/`sellOrUndo` — that's the exploit fix**); `navigate`: add the HQ as a day candidate; new `globalMods()` (memoized on pick, **never per-tick**) + `restatAll()`; `syncSquad`/`updateUnits` read `unitStats(def, mods)` |
| `src\ui\UpgradeChip.ts` | drop the `isHq` early-return; wrap to a 2×2 block when `buttons.length > 2` |
| `src\ui\HUD.ts` | `scaledStats(...)` → `game.statsFor(b.id)` so shown numbers include picks |

**Deleted from CD-7's plan** if C is chosen: `research.json`, `research.ts`, `ResearchState`, `ResearchRing.ts`, `GameSnapshot.research`, the `researched`/`researchUndone` events, `research_facility`, `Game.resolveOption`, D10, R7. `BuildingDef.research?` (typed-unused today) becomes dead → delete. `BuildingDef.unique?` stays typed-unused for CD-31.

**Not needed either way:** `GameSnapshot` grows by nothing in Steps 1–3, so **CD-15's by-reference bug is untouched** and CD-7 §4's cloning precedent isn't needed yet.

---

## 9. Platform impact

| Concern | Browser (now) | Godot 2D (PC) | Controller | Mobile |
|---|---|---|---|---|
| Wave stagger (CD-41/48) | `levels.json` | **Same file, zero port cost** | n/a | n/a |
| House def + `s1` option (CD-47) | `levels.json` + `buildings.json` | Same JSON (K6) | **Free** — an existing site's build ring, key 2/3 | Tap; ring already ≥44px |
| House income math | **Zero code** — `collectDawnIncome`'s `nodes = 1` fallback already handles a flat def | ~0 lines | n/a | n/a |
| CC picks — input | **Zero change**: `main.ts:118` already routes `option(n)` → `pendingBranch` | One-line InputMap handler | Inherited | Inherited |
| CC picks — **HQ day-navigability** | **~3 lines in `navigate` — required, not optional** | Ports with the sim | **Blocking without it** — HQ is mouse-only today | **Blocking without it** |
| CC picks — chip row | 2×2 wrap at >2 options | Control nodes at a world position | Focus brackets already ship | ≥44px targets (UI_PLAN 5) |
| CC picks — numbers on face (K4) | Text on the chip | Same | **Required** (no hover) | **Required** (no hover) |
| Global mods | Memoized in `Game` | Ports with the sim | n/a | n/a |
| ≤4 options | 3 picks → keys 1–3; CD-40 takes the 4th | Same | Face/shoulder or radial | 4 thumb targets |
| Determinism (K2) | No RNG added anywhere in this doc | Lockstep-safe → co-op + replays stay open | n/a | n/a |
| `validate.ts` | DEV-only | **The port's only data contract** — Godot has no TS types | n/a | n/a |
| Saves | No migration (`SaveDataV1` stores no building ids — CD-38 verified) | Same schema | n/a | n/a |

---

## 10. Extension seams

| Future work | Seam | Cost when it lands |
|---|---|---|
| **CD-49 widen branch coverage** (sequenced after this) | If OQ1 → C, `command_center` becomes a 10th branching building and CD-49's scope grows by one. CD-49's 1-of-3/4 widening **shares this design's `UpgradeChip` 2×2 wrap** — build it once here. CD-49 must also inherit the "name each branch's metric up front" rule (CD-37's third re-measure). | Data only; the wrap is already paid for. |
| **CD-40 airstrike + nuke** | Under C: a third CC pick, or C2's L3 fork. Sensor Pulse is already CC-native. Under A: CD-7 §9's `ResearchEffect.unlock` seam, unchanged. | **Either way: one JSON object.** |
| **C2 — a second CC fork (Thronefall-exact)** | `branchId: string \| null` → `branchIds: string[]`; `pendingBranch` matches any `atLevel`. Named, deliberately **not built**. | ~12 call sites + a re-run of CD-38 test 5. Do only if QA says one pick is too thin. |
| **CD-30 perks/mutators** | A perk = "start with CC pick X taken" = one entry at `loadLevel`. A mutator = another `StatMods` folded into `globalMods()`. **Note the deliberate gap:** D8 keeps income out of `StatMods`, so a "+house income" perk has no channel **by design** — Thronefall's Builder's Guild is why. | No new mechanism. |
| **CD-31 campaign pacing** | **`s1.options` is a per-level pacing dial**: which maps get cheap safe income — *exactly* Thronefall's houses-on-4-of-N-maps. Early maps get a house; late maps make you go to the field. Also: the counter-introduction curve (§4) becomes the "new mechanic every 1–2 levels" spine — one wave entry per level. | Pure authoring. |
| **CD-9 walls / free placement** | House sits on an existing site; no nav-grid impact. CD-9 remains ROADMAP complaint #1's answer — **CD-47 must not be allowed to pre-empt it.** | None. |
| **Roguelite draft (OQ1 option B)** | Still a presentation layer over whatever the picks are — over 3 CC picks it's *cheaper* than over a 6-node tree. | Unlocked by CD-20's seeded RNG. |
| **CD-16 naming** | Every user-visible string is a `name`/`description`/`blurb`. `id`s are the contract. | Pure data. |

---

## 11. Implementation steps — each playable + typecheck-clean

**Prerequisite, not scoped here: land CD-43 item 1 first.** The validator's clearance rule measures distance to *waypoints*, not path *segments* — which is exactly the bug CD-44 documents (Ridge crystals 18.9px from the nearest waypoint but **1.8px** from the segment). **Any level-data edit in Steps 2–4 would otherwise be measured with a known-broken ruler.** This is a real sequencing dependency, and it's cheap.

### Step 1 — Prove the causes before spending anything. DEV-only, no ship change. Closes nothing.

Three probes, each decisive, each ~20 minutes:

1. **Falsify-or-confirm the income hypothesis (do this before anything else).** Re-run CD-41's 5-archetype sweep with `startingMoney` 320 → **460** (a dev override, not a ship change) — this hands every build **more free money on day 1 than the most generous income fix could deliver by W4** (§3a: max +162₡). **If the majority still fails at W4, income is definitively not the cause, no income knob may be applied, and CD-47 is released from CD-41.** If it flips, I'm wrong and §7b/§7d change. *This one experiment gates the whole doc.*
2. **Confirm CD-48's mechanism.** Run the reference build at W6 with `SEPARATION_STEP_FRACTION = 0` (dev toggle). Clears with separation off + dies with it on ⇒ cause confirmed, stagger is aimed correctly. Dies either way ⇒ stagger is a paper-over and Step 3 must not proceed as written.
3. **Instrument the real quantity, on every wave, both levels:** *peak simultaneous enemies inside contact range of any one building.* Finds every wave CD-45 silently mistuned — not just the two we noticed. Predicted ranking: Outpost W6 and Ridge W5 at the top.

*QA: no gameplay change; determinism byte-identical.*

### Step 2 — CD-41: stagger Outpost's counter-introduction. `levels.json` only. **Closes CD-41.**

Move 2–3 skimmers from Outpost W4 into W3, mirroring Ridge's W3 air introduction. Nothing else changes.

*Playable: unchanged everywhere except Outpost W3/W4.*
*QA: §7b's revised criterion (1)–(4). Specifically: W3 damage must now **discriminate** (zero-AA build > reference build, inverting today's 82.7 < 206.6); the all-gun-tower control must **still** hard-defeat at W4 with the AIR badge; the reference build still clears W4 at ≲600₡. Re-run the 5 archetypes and record which fail **and why** — a build missing 3 of 5 roles is expected to fail and that is a PASS, not a FAIL.*

### Step 3 — CD-48: stagger the climax. `levels.json` only. **Closes CD-48.**

Guided by Step 1 probe 3. Outpost W6 (`raider×10` + `raider×10`, both `delay: 0`, `interval: 0.45`) and Ridge W5 (`swarmling×20`, `interval: 0.28`). **Adjust `delay`/`interval`, not `count`** — 33 enemies still arrive.

*QA: the reference build clears W6 with HQ ≥ ~400/600 (CD-48's own criterion), without a maxed/rushed build; **and W6 total damage still exceeds W5's** — the climax must stay the climax (CD-36's monotonic W4<W5<W6 invariant). Ridge W5 re-verified. Peak-simultaneous-attackers (probe 3) drops on the tuned waves and is unchanged elsewhere.*

### Step 4 — CD-47: the house archetype. `buildings.json` + `levels.json` + `validate.ts`. **Closes CD-47.**

New def (cost 70, `incomePerDay` 30 flat, no `mining`, no `requires`, `shape: "silo"`); added as an option on Outpost `s1` and Ridge `s1`; §12 item 1 replaced by the 1a/1b/1c probe; the double-dip assert added.

**Sequenced *after* Steps 2–3 deliberately** (K9): shipping economy surface while two cliffs are open makes both un-measurable — CD-49's own sequencing note, applied to its sibling.

*QA: 1a/1b/1c pass on both levels **and** correctly fail the two historical states (§7e — the probe must have teeth, same standard CD-7's `requires` filter was held to); idle money still ≤70₡/dawn (K5, CD-35 regression); **economy-first must still fail** — greed must still lose; the all-gun-tower control must still hard-defeat at W4; sensor-vs-house at `s1` is a real choice (neither strictly dominates across the run) — metric: HQ minimum with sensor vs. total credits with house, never damage dealt.*

### Step 5 — OQ1 → C1: Command Center picks. **USER'S CALL. Closes OQ1, CD-7 Step 4, unblocks CD-40.**

`upgradeCosts?`; drop `isHq` in `canUpgrade`/`pendingBranch`/`UpgradeChip` (**keep it in `getSellInfo`/`sellOrUndo`**); HQ into day nav; `globalMods()` + `scaledStats(..., mods?)` + `restatAll()` + `unitStats(def, mods?)`; CC def gets `maxLevel: 2` + a 1-of-2 branch (Weapons / Plating); `UpgradeChip` 2×2 wrap.

*QA: CD-7 §12 items 4, 5, 6, 9, 10, 12, 14 apply verbatim with "research node" → "CC pick" — including **item 10: the all-gun-tower control must still hard-defeat at W4 with the Weapons pick taken** (picks must not paper over the air lane). Plus: HQ reachable by keyboard nav in day (dispatched keydown, live DOM); HQ still unsellable (X is a no-op); chips show derived numbers with zero hover; `globalMods`/`restatAll` called at most once per day, never per tick (spy count over a full run); `Math.random` grep clean.*

---

## 12. Risks & the cheapest de-risk

| # | Risk | Cheapest de-risk |
|---|---|---|
| **R1** | **I'm wrong: income *is* CD-41's cause**, and I talked us out of the right fix on arithmetic. | **Step 1 probe 1** — `startingMoney` 320→460 and re-run the sweep. Hands every build *more* than any income fix could by W4. 20 minutes, decides it outright. **Nothing in Steps 2–4 ships before this runs.** |
| **R2** | **Step 3 papers over CD-45's real cause** (§13's warning, correctly aimed). | **Step 1 probe 2** — the `SEPARATION_STEP_FRACTION = 0` A/B. If W6 fails with separation off too, the stagger is not the fix and Step 3 halts. |
| **R3** | Steps 2–3 fix the two waves we noticed and miss others CD-45 silently mistuned. | **Step 1 probe 3** measures peak simultaneous attackers on *every* wave, both levels, in one pass. Finds them all at once instead of ticket-by-ticket (CD-45→46→48 is already three tickets deep). |
| **R4** | **Moving skimmers into W3 breaks W3 for everyone**, turning a legibility fix into a new cliff one wave earlier. | Start at **2** skimmers, not 5 (Ridge's number) — Outpost W3 already carries 21 ground enemies vs Ridge W3's 8. Knob ladder: 2 → 3 → move them to W2 instead. Pass criterion (1) explicitly says **survivable**. |
| **R5** | **Re-scoping CD-41 is me overruling a P1 ticket's diagnosis.** | It's presented as a **recommendation with a falsifier attached (R1)**, and the design-intent half is escalated to the user (§13). CD-38's shipped QA verdict is the citation, not my taste. |
| **R6** | House re-opens CD-35's idle-money snowball / makes economy-first dominant. | One site per level (no spam, K3); 1a/1b/1c static probe; the ≤70₡/dawn check is already a QA staple; **explicit QA item: economy-first must still fail.** |
| **R7** | **CC picks inflate power** (CD-7 R1, unchanged). | **Ordering** — Step 5 last, after both cliffs close and the economy is re-baselined; start at +5%/+10%; **the all-gun-tower control must still fail at W4 with Weapons taken.** Knobs before waves, always. |
| **R8** | **A CC pick becomes "too good NOT to take"** — Thronefall's Builder's Guild, exactly. | **Each pick's metric named before it ships** (§7c table) — CD-37's lesson applied a *third* time. Rule: **no pick may win on all three metrics.** Plus D8: no pick touches income (their auto-pick was the economy one). |
| **R9** | **`command_center.cost = 0` → free CC upgrades.** | `upgradeCosts?: number[]` (honest) rather than a `cost` you never pay. Backstop: a `validate.ts` assert that any def with `maxLevel > 1` has a real upgrade cost. |
| **R10** | **CC picks unbuyable on controller/mobile** — HQ isn't day-navigable (`Game.ts:287-291`). | ~3 lines in `navigate` + a dispatched-keydown QA check. **Named now so it isn't discovered at the port.** |
| **R11** | **Latent field double-dip** — two sites both counting one field (Ridge `d5` already derives 1 node from the Far Field; two more crystals and it qualifies). Arms the moment anyone re-authors a field. | `validate.ts` assert: **no crystal within `mining.radius` of two sites that both offer a mining def.** ~6 lines, DEV-only, catches CD-44's cousin before it ships. |
| **R12** | **Level edits measured with a broken ruler** — CD-43's waypoint-vs-segment bug + CD-44's on-lane crystals. | **Land CD-43 item 1 before Step 2.** Cheap, already filed, and this doc is what makes it urgent. |
| **R13** | Steps 2–4 invalidate baselines *again* (fourth time). | All three land in **one QA pass** with one instrument (per-wave damage × archetype + probe 3's concurrency metric). Precedent: CD-46 + CD-41 were correctly done together. |
| **R14** | 1-of-2 CC picks are too thin → the variety promise is unmet. | **C2 is a named seam, not a rewrite** (§10). And the load is *supposed* to sit on CD-49 + CD-30 — Thronefall's split. **If those slip, C1's case weakens; that belongs in the user's decision.** |

---

## 13. What is the user's call vs. mine

**Mine (architect calls, made):**
- CD-48 is legitimately a wave tune, and stagger beats count reduction. §7a.
- The income hypothesis is falsified by arithmetic and a missing baseline. §3. *(Falsifiable — R1.)*
- Outpost's simultaneous AA+armor introduction is the cliff; Ridge is the control. §4.
- CD-47 is placement-*gated*, not placement-free, so CD-7's thesis survives. §7d Q1.
- CD-47's placement model = (i), an option on existing safe sites. §7d Q2.
- §12 item 1 → the 1a/1b/1c criterion. §7e.
- Step ordering; the three Step-1 probes; the double-dip assert; the CD-43 prerequisite.
- **Only two of the three candidate CD-41 fixes ship, and neither is an income knob:** the W3 skimmer introduction (as CD-41's fix) and the house (as CD-47's own feature). The `14→17` knob, the `130→110` knob, and "free `s1`" are all **rejected with reasons**, not deferred.

**Yours (escalated, not decided):**
1. **OQ1 — research model.** ROADMAP lists it as an open question. **My recommendation: C1** (Command Center 1-of-2 global picks, one fork at L2), on benchmark-scale grounds — *not* on the income grounds the hypothesis proposed, which don't hold. The strongest counter-argument for **A** is honest and I won't bury it: **A is a real late-game money sink** (CD-7 §6's "research is what you buy when the map is full"), and C1 is only defensible **if CD-49 and CD-30 actually land** to carry the variety. If those are likely to slip, A is the safer pick.
2. **CD-41's re-scope.** Changing its pass criterion from "majority of five archetypes clear W4" to §7b's legibility criterion is a **design-intent decision** — it asserts that builds missing 3 of 5 roles are *supposed* to lose. CD-38's shipped QA verdict says exactly that, but confirming it is yours. **Gate it on Step 1 probe 1.**
3. **CD-47's name.** Not auto-named (K7, CD-16). The population→tax fiction is a design note, not a chosen name.
4. **Does Outpost keep six waves?** Not blocking, worth noticing: Thronefall runs ~15 waves per level; we compress the same arc into 6. Our introduction curve has ~half their room, which is *why* Outpost stacked two counters on one wave. If Steps 2–3's knobs run out, the honest fix is more waves, not harder ones — CD-31's territory.

**Docs to update on landing:** `ROADMAP.md` (OQ1 → answered; Phase 2 economy note); `TICKETS.md` (CD-41 re-scoped + diagnosis retired; CD-48 → wave tune; CD-47 → feature, decoupled from CD-41; CD-7 Step 4 → replaced-or-implemented per OQ1); `docs/design-economy-rework.md` (§12 item 1 → 1a/1b/1c; if OQ1 → C, mark §2b/§5-research/D10/R7 superseded); **`docs/design-roster-redesign.md`** — still asserts *"enemies never pushed"* in **two** places (D5 and the impl-plan bullet ~:159), flagged by CD-45/CD-46 and still outstanding; suggested wording: *"units never push enemies; enemy↔enemy declumping permitted (CD-45)."*

---

## 14. Simplifications bought

Steps 1–4 add **zero new types, zero new files, zero new UI classes, zero new snapshot state, zero new input verbs, and zero new `Math.random()`** — CD-41, CD-48 and CD-47 are entirely `levels.json` + `buildings.json` + a DEV probe. The house needs no engine work because `collectDawnIncome`'s `nodes = 1` fallback already handles a flat-income def. If OQ1 → C, CD-7's Step 4 loses `research.json`, `research.ts`, `ResearchState`, `ResearchRing`, two `GameEvent` kinds, `Game.resolveOption`, `research_facility`, D10 and R7 — and the sell-back exploit stops existing rather than being defended against.

The whole pass is: **two wave entries, one building def, one site option, and a probe that proves we needed them.**

---

**Files this design touches:**
`C:\Users\neema\Documents\GitHub\CityDefense\src\data\levels.json`, `C:\Users\neema\Documents\GitHub\CityDefense\src\data\buildings.json`, `C:\Users\neema\Documents\GitHub\CityDefense\src\data\validate.ts` — Steps 1–4.
Step 5 only: `C:\Users\neema\Documents\GitHub\CityDefense\src\data\buildings.ts`, `C:\Users\neema\Documents\GitHub\CityDefense\src\data\units.ts`, `C:\Users\neema\Documents\GitHub\CityDefense\src\game\Game.ts`, `C:\Users\neema\Documents\GitHub\CityDefense\src\ui\UpgradeChip.ts`, `C:\Users\neema\Documents\GitHub\CityDefense\src\ui\HUD.ts`.
Unchanged either way: `C:\Users\neema\Documents\GitHub\CityDefense\src\main.ts` (the `option(n)` → `pendingBranch` path already handles CC picks).

**Sources:**
- [Thronefall House wiki](https://throne-fall.github.io/game-content/buildings/house.html)
- [Thronefall Buildings wiki](https://throne-fall.github.io/game-content/buildings/)
- [Thronefall Perks wiki](https://throne-fall.github.io/game-content/perks/)
- [Thronefall Eternal Trials wiki (difficulty-point ramp)](https://throne-fall.github.io/game-content/eternal-trials.html)
- [Steam guide: building and upgrade tips](https://steamcommunity.com/sharedfiles/filedetails/?id=3016836199)
- [Steam guide: Building a reactive economy](https://steamcommunity.com/sharedfiles/filedetails/?id=3279612489)
- [Steam discussion: Overpowered & underpowered upgrades](https://steamcommunity.com/app/2239150/discussions/0/4308326918580849935/)
- [Steam discussion: The difficulty is too vertical](https://steamcommunity.com/app/2239150/discussions/0/4346606879506481306/)
- [Steam discussion: Third stage way too hard](https://steamcommunity.com/app/2239150/discussions/0/4032475816296173250/)
- [Steam discussion: final boss needs a nerf](https://steamcommunity.com/app/2239150/discussions/0/4693405960869523772/)
- [Game Developer: Mastering minimalism and layering complexity with Thronefall](https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall)
- [New Game Network: Thronefall review (final-boss cliff)](https://www.newgamenetwork.com/article/2820/thronefall-review/)
- [GameLuster: Thronefall review](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/)
- [Thronefall Getting Started wiki](https://game.wiki/thronefall/getting-started)
