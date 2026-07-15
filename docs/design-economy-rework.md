# CD-7 — Economy Rework: "The map is the budget"

Architect design doc, 2026-07-15. Answers ROADMAP Open Question 1. Unblocks CD-40.
Status: designed → ready to implement.

Player-sayable rule:
**"Credits come out of the ground. Rich ground is dangerous ground. When the map is full, you buy science."**

---

## 1. Problem & constraints

Today income is placement-free: `barracks` (100₡ → 40/dawn) and `refinery` (150₡ → 70/dawn) can be dropped on any `category: "production"` site and pay identically regardless of where they sit. The map's crystal clusters (2 per level, `kind: "crystal"` in `obstacles`) are pure set dressing. That is the exact thing ROADMAP Phase 2 says to delete: *"Mineral fields become functional… Map design = economy design, like ThroneFall."* ThroneFall's economy is geographic — you build extractors on specific terrain features and then must defend them — and that geography is what makes its otherwise-rigid node system produce different runs on different maps (ThroneFall design/reviews, per ROADMAP's community-feedback section).

Second, the research facility (ROADMAP Phase 2) does not exist, and CD-40 (Phase 3b) needs it to gate airstrike and the nuke capstone. TICKETS.md CD-40: *"CD-7 + this ticket are the last two things standing between the project and the port decision."*

**Binding constraints, cited:**

| # | Constraint | Source |
|---|---|---|
| C1 | Naming: no "vespene"/"geyser"/SCV/MULE in any shipped string or doc. It is **Plasma Wells**. | ROADMAP "IP differentiation" rule 1 |
| C2 | Every research option shows explicit numbers before purchase; **no option may be a trap pick**. | ROADMAP Phase 2 clarity rule + "They Are Billions" lesson |
| C3 | No new `Math.random()` in sim paths. `Game.ts`'s only uses are cosmetic `burst()`. | CD-20; CD-38 QA point 8 greps for this |
| C4 | Healthy play keeps idle money ≤70₡ per dawn (pre-fix pathology: 1600₡+). | CD-35 QA |
| C5 | Economy pays at dawn; a building destroyed at night earns nothing that dawn. Ordering verified live. | ROADMAP "Dawn restoration"; CD-35 QA |
| C6 | Sensor Array stays a **local aura**; research is **global**. | ROADMAP Phase 2 |
| C7 | No hover-only information; ≤4 world-anchored options per selection (keys 1–4); all input arrives as `GameAction`. | UI_PLAN principles 2, 4, 6 |
| C8 | All defs in `src/data/*.json` so Godot loads the same files. | UI_PLAN "Godot 2D (PC)" |
| C9 | Phase 4 (CD-9) builds a nav grid from the same `obstacles` array. | ROADMAP Phase 4 |
| C10 | Set-and-forget is sacred — no upkeep chores, no resource ferrying. | ROADMAP "Kingdom Two Crowns" lesson |
| C11 | Marginal value of a new mechanic must trail buying a new tower. | ROADMAP Phase 3a balance discipline; enforced for garrison in `docs/design-roster-redesign.md` |

**Sharp edge worth stating up front:** `src/data/levels.ts:63` and `src/data/buildings.ts:78` both cast with `as unknown as`, which erases *all* type checking at the JSON boundary. Changing `SiteCategory` or deleting a building id will **not** produce a tsc error for stale JSON. Every "typecheck-clean" claim below therefore assumes the DEV validator in Step 1.

---

## 2. Options considered

### 2a. Adjacency — how does the game know a site is near a mineral field?

| Option | Trade-off |
|---|---|
| **A. Precompute in `levels.json`** (`sites[].mineralNodes: 4`) | Zero derivation code. But the authored number and the drawn crystals drift the moment anyone nudges a crystal — the *map is the economy* premise silently breaks, and the drift is invisible (no tsc, no runtime error). Also duplicates data CD-9 will re-read. |
| **B. Derive at load from `obstacles`** | One pure function; `obstacles` stays the single spatial source of truth for both mining and CD-9's nav grid; a Godot port reimplements ~8 lines against the same JSON; deterministic, no RNG. Costs: a load-time pass (trivial) and the level author must be able to *see* the radius (fixed by a DEV validator + a site badge). |
| C. Hybrid (derive, but allow an authored override) | Two sources of truth = A's drift risk with B's code. |

**Recommendation: B.** It is the only option where "map design = economy design" is true by construction rather than by discipline, and it's the representation CD-9 wants: rocks, crystals and wells are all just `obstacles` with a `kind`.

Granularity: ROADMAP says *"income scales with the number of crystals in radius"* — so a **mineral field is a cluster of individual crystal obstacles**, and the yield is literally the count the player can see. No hidden `richness` number. (An optional `yield?: number` default 1 is added to `ObstacleDef` as an art escape hatch — one fat crystal worth 2 — but ships unused.)

### 2b. ROADMAP Open Question 1 — global track tree vs. pick-1-of-3 per day

| Option | Trade-off |
|---|---|
| **Pick-1-of-3 draft (roguelite)** | Replay variety, exciting. But: (a) it **requires an RNG in a sim path** — CD-20 is still open, so it drags seeded-RNG onto CD-7's critical path (C3); (b) it fights C2 — a draft is only interesting when options are *situationally* valued, and situational value without foreknowledge is exactly the "unfair RNG at high level" complaint ROADMAP logged against They Are Billions; (c) it collides with **CD-30**, which already claims the "variety layer" slot with pre-level perks + mutators over the same JSON defs. Two random build-variety systems stacked = noise, not depth. |
| **Global track tree, one purchase per day** | Every number always visible (C2 for free). Zero RNG. Player plans across days. Composes with CD-30 rather than competing (a perk = "start with Weapons +1"; a mutator = "research costs +50%" — both are modifiers over the same nodes). Risk: it's the "stat stick" ROADMAP itself warns about. |

**Recommendation: global track tree.** The stat-stick risk is answered not by adding randomness but by making the tree a **budget-and-tempo problem**:

- Purchases cost credits and **compete directly with towers**.
- **One purchase per day**, so the number of days in the level (Outpost 6, Ridge 5) is a hard cap on depth.
- The facility itself costs 250₡ and realistically lands on day 2–3 → **you get roughly half the tree**, and *which half, in what order* is the decision.
- The capstone fork ROADMAP floats ("Siege Mode range vs. splash") is **rejected** — see D6; exclusivity comes from the budget, not a hard fork, because a building-specific capstone is a trap generator by construction.

**And the seam is preserved:** a draft is a *presentation layer* over this same tree — "offer 3 of the currently-affordable nodes" — which becomes cheap and safe the day CD-20 lands a seeded RNG. Nothing in this design forecloses it.

### 2c. Does research reuse CD-38's `branch` mechanism?

| Option | Trade-off |
|---|---|
| Reuse `branchId` | `branchId` is `string \| null` on one building; research is a global multi-select set. Forcing it in is precisely the misleading-id mistake CD-38's own D1 warns about ("a misleading id would ship to Godot + all level files"). |
| **Share the two seams, not the state** | Share (1) the `option(n)` input verb, and (2) the `mods` shape + the `scaledStats` multiplication chain — which `src/data/buildings.ts:100-108` already documents as *"the single stats-resolution seam for the whole game — Phase 2 research buffs and CD-30 mutators are expected to layer in as further multipliers on the same result."* |

**Recommendation: share the seams, keep the state separate.** This is what the existing code comment already promised; CD-7 cashes it in.

---

## 3. Key decisions

- **D1 — Mineral field = a cluster of `kind: "crystal"` obstacles.** Yield = count within `def.mining.radius` of the site, derived at `loadLevel`, capped at `def.mining.maxNodes`. No authored yield numbers anywhere.

- **D2 — `barracks` and `refinery` are DELETED; `mining_facility` and `plasma_tap` are new ids.** Following CD-38's D1 precedent: the defs fundamentally change (placement-gated, node-scaled), so a reused id would ship a lie to Godot and to every level file. **Deleting `barracks` outright is the point of the ticket** — it is the last placement-free income source, and while it exists the map is not the economy. Saves are safe with no migration: CD-38 verified `SaveDataV1` stores only unlocks/results/settings/hintsSeen, never building ids.

- **D3 — `incomePerDay` on a mining def means *per node*.** `mining_facility.incomePerDay = 14` + `mining: {…}` → dawn income = `scaledStats(...).incomePerDay × nodes`. This reuses the existing level-scaling curve (`incomeMul = 1 + 0.35(l-1)`) with **zero new math and zero new exports**; `collectDawnIncome` changes by two lines. `plasma_tap.incomePerDay = 85`, `maxNodes: 1` → 85 flat, same code path.

- **D4 — Minerals scale, plasma is flat.** Mineral fields reward *reading the map* (how big is this field?). A Plasma Well is a single rich prize you must *hold*. One well per level, placed at a contested site where it **competes with a defense option at the same slot** — Outpost `a2` (plasma vs. gun tower vs. sensor), Ridge `d3` (plasma vs. garrison vs. missile vs. sniper). That single site is the whole economy design in miniature.

- **D5 — Placement gating is data-driven via `requires`, resolved at load.** `BuildingDef.requires?: { resource: ResourceKind; min: number }`. `loadLevel` filters each site's `options` to those whose requirement the site meets. This keeps `options.length ≤ 4` and the 1–4 key mapping honest by construction (C7), and it is the seam where CD-30's perk unlocks and CD-31's progressive building unlocks plug in. `mining_facility` uses `min: 3` — a 1-node mine would be a dead option, so the data forbids offering one.

- **D6 — Exactly one offense track, and this is forced, not chosen.** C2 ("no trap picks") means *every node must be useful to every build*, which means no node may be building-specific or unit-specific. Given that, ROADMAP's proposed `Weapons` (+damage) and `Servos` (+fire rate) tracks are **not two choices — one strictly dominates the other**, provably against the live data:
  - Gun tower does 10 damage. Swarmling 15 HP → 2 shots. `+7% damage` → 10.7 → **still 2 shots. Zero gain.** Raider 40 HP → 4 shots at both 10 and 10.7. **Zero gain.**
  - Marine does 4. Vs. Siege Walker (armor 5), `hurtEnemy` floors at `max(1, dmg - armor)` = 1. `+7%` → `max(1, 4.28-5)` = 1. **Zero gain.**
  - `+7% fire rate` gives +7% throughput in *every one of those cases*, plus unit move speed.

  %-damage only out-earns %-rate in the small-hit-vs-armor corner (gun vs. walker: 5 → 5.7 effective, +14%) — i.e. exactly where the weapon is already worthless and nobody plays. **Therefore Weapons and Servos merge into one track that grants both** (+5% damage and +5% fire rate per tier ≈ +10.25% DPS). This is a structural conclusion from the no-trap rule, not a taste call, and it should be recorded as such — it is also why the ROADMAP's optional "Siege Mode: range vs. splash" capstone is rejected outright: it is dead for any build without a siege tank.

- **D7 — Two tracks in CD-7 (`weapons`, `plating`); `ordnance` is CD-40's third.** Plating grants `+10% maxHp` to **all structures and squads, including the Command Center** — the HQ HP bar *is* the loss condition, so Plating's value is transparent and un-trappable, and it is orthogonal to Weapons (kill faster vs. survive longer). Tracks render from data, so CD-40 adding a track makes a third chip appear with **zero engine changes**. Hard cap: **≤4 tracks**, so `option(n)` never overflows keys 1–4 (C7).

- **D8 — No research node may touch income. Enforced at the type level:** `ResearchEffect.stat` is a union that deliberately excludes `incomePerDay`. Income scaling with crystals × level scaling × research would compound into exactly the snowball CD-35 killed (C4). This costs nothing and cannot be violated by a data edit.

- **D9 — `unique: true` on the research facility, offered at 2–3 sites.** ROADMAP says "a single dedicated tech-lab site per map"; `unique` gives one facility per map *plus* a placement choice (safe rear vs. forward) for three lines of code. Fallback if it misbehaves: author it at exactly one site — a pure `levels.json` edit, no code.

- **D10 — Research is bought at the facility, and never outlives it.** Research spend accrues to `b.invested`/`b.spentToday`; selling the facility refunds `0.6 × invested` **and revokes all research**. This closes the sell-back exploit (buy the tree, sell the facility, keep the buffs, pocket 150₡) with no special-case code — it reuses `sellOrUndo`'s existing removal branch and mirrors the precedent already in that function: *"A destroyed garrison's surviving units die with it"* (`Game.ts:495`, `Game.ts:863`). **Night destruction is not a sell** — the wreck rebuilds at dawn carrying `invested`, and research persists. No hidden mid-night cliff. Same-day mistakes are covered by `undoResearch()`, symmetric with CD-24.

- **D11 — Haulers are Renderer-only.** ROADMAP's "SCV/MULE drones shuttling" is cosmetic (and those names are banned, C1 — internally `HaulerFx`). Derived from `time` + a deterministic per-building hash in `Renderer`. Zero sim state, zero snapshot growth, zero `Math.random()` (C3), zero Godot contract.

---

## 4. Data model

```ts
// data/levels.ts
export type SiteCategory = "defense" | "resource" | "any";   // "production" REMOVED
export type ResourceKind = "mineral" | "plasma";

export interface ObstacleDef {
  x: number; y: number; r: number;
  kind: "rock" | "crystal" | "plasma";        // += "plasma"
  yield?: number;                              // default 1 — art escape hatch, unused in CD-7
  blocks?: boolean;                            // default true — CD-9 nav grid reads this; unused today
}

/** Pure, deterministic, engine-agnostic. Godot reimplements ~8 lines over the same JSON. */
export function countResourcesNear(
  level: LevelDef, x: number, y: number, kind: ResourceKind, radius: number
): number;

// data/buildings.ts
export type StatMods = Partial<
  Record<"damage" | "range" | "fireRate" | "splashRadius" | "maxHp" | "moveSpeed", number>
>;                                             // BranchOption.mods is now StatMods (shared shape)

export interface MiningSpec {
  resource: ResourceKind;
  radius: number;     // px from the site
  minNodes: number;   // below this, the option is filtered out of the site (D5)
  maxNodes: number;   // the income CEILING (see §6)
}
// BuildingDef += mining?: MiningSpec        // incomePerDay is PER NODE when present (D3)
//             += requires?: { resource: ResourceKind; min: number }
//             += unique?: boolean            // at most one per level (D9)
//             += research?: boolean          // this building hosts the tech tree
//             shape += "tap"
// scaledStats(def, level, branchId?, mods?)  // mods = research/mutator layer; optional -> all
//                                            // existing call sites keep compiling

// data/research.ts (+ research.json)   -- NEW
export type ResearchEffect =
  | { kind: "stat"; scope: "buildings" | "units" | "all";
      stat: "damage" | "fireRate" | "range" | "maxHp" | "moveSpeed";   // NO incomePerDay (D8)
      mul: number }
  | { kind: "unlock"; abilityId: string };    // <-- CD-40's seam. Nothing else needed.

export interface ResearchNodeDef {
  id: string; trackId: string; tier: number;  // tier N requires tier N-1 in the same track
  name: string; cost: number;
  effects: ResearchEffect[];
  blurb?: string;      // ONLY for unlock nodes; stat nodes DERIVE their blurb (C2 anti-drift)
  minWave?: number;    // reserved seam for CD-31 campaign pacing; unused in CD-7
}
export interface ResearchTrackDef { id: string; name: string; nodes: ResearchNodeDef[] }

/** The C2 guarantee: prose is generated from the numbers, so it cannot drift from them. */
export function describeNode(node: ResearchNodeDef): string;

// data/units.ts
export function unitStats(def: UnitDef, mods?: StatMods): { maxHp; damage; fireRate; range; moveSpeed };

// game/types.ts
export interface BuildSiteState extends BuildSiteDef {
  buildingId: string | null;
  resources: Record<ResourceKind, number>;   // derived at loadLevel, immutable after
  options: string[];                          // EFFECTIVE options (requires-filtered, D5)
}
export interface ResearchState {
  purchased: string[];             // node ids, in purchase order
  boughtToday: string | null;      // enforces one-per-day; cleared in startNight()
  hasFacility: boolean;
}
// GameSnapshot += research: ResearchState
// GameEvent    += { type: "researched"; nodeId: string } | { type: "researchUndone"; nodeId: string }
```

**CD-15 interaction (`getSnapshot()` returns live refs).** `sites[].resources` is computed once at load and never mutated, so exposing it by reference is harmless. **`research` is different** — `purchased` mutates. `getSnapshot()` will return a **fresh object with a copied array**: `{ purchased: [...this.researchPurchased], boughtToday, hasFacility }`. Cost is one ≤6-element array copy per call (~2–3 calls/frame) — immeasurable. This deliberately sets the precedent CD-15 will generalize: **new snapshot fields ship cloned; CD-15 retrofits the legacy arrays.** Do not let the new field inherit the old debt.

---

## 5. Exact data deltas

### `buildings.json`

**DELETE `barracks`.** **DELETE `refinery`.**

**ADD `mining_facility`** — cost 130, maxHp 90, damage 0, range 0, fireRate 0, splashRadius 0, **incomePerDay 14 (per node)**, maxLevel 3, upgradeCostMult 0.9, category "production", color `#f9a825`, accent `#ffd54f`, size 24, **shape "silo"** (reuses the retired refinery sprite — zero art work), `mining: { resource: "mineral", radius: 95, minNodes: 3, maxNodes: 5 }`, `requires: { resource: "mineral", min: 3 }`.
Description: `"Mines the crystal field around it. Pays 14₡ per crystal in range, at dawn. Fragile — and the richest fields are rarely the safest."`

**ADD `plasma_tap`** — cost 170, maxHp 80, **incomePerDay 85 (per node)**, maxLevel 3, upgradeCostMult 0.9, category "production", color `#ef6c00`, accent `#ffa726`, size 24, **shape "tap"** (new; vector fallback in v1, atlas builder in Step 5), `mining: { resource: "plasma", radius: 70, minNodes: 1, maxNodes: 1 }`, `requires: { resource: "plasma", min: 1 }`.
Description: `"Taps a Plasma Well. The best income on the map, sitting exactly where you least want to defend."`

**ADD `research_facility`** — cost 250, maxHp 140, damage 0, **maxLevel 1**, upgradeCostMult 0, category "support", color `#455a64`, accent `#4dd0e1`, size 26, **shape "factory"** (reuses the retired barracks sprite), `unique: true`, `research: true`.
Description: `"The tech lab. One per operation. Buy one upgrade per day — every number is on the button."`

*Unchanged:* `gun_tower`, `garrison`, `siege_tank`, `missile_battery`, `sniper_tower`, `sensor_array`, `command_center`.

**Naming note (C1):** "Plasma Well" (terrain) and "Plasma Tap" (building) contain no Blizzard terms. Deliberately **not** "Refinery" or "Extractor" — those are the literal Terran and Zerg gas-building names in StarCraft. Amber/orange is proposed for plasma rather than ROADMAP's "green gas puffs": green vespene is Blizzard's trade dress, and amber reads distinct from our cyan crystals. `id`s are the stable contract; **every `name`/`description` here is CD-16's to rewrite** with zero code changes.

### `research.json` (new)

```
weapons  "Weapons"            (all structures & squads)
  weapons_1  tier 1  110₡   stat/all damage ×1.05 · stat/all fireRate ×1.05
  weapons_2  tier 2  180₡   (same)
  weapons_3  tier 3  280₡   (same)          -> T3 cumulative ≈ ×1.34 DPS
plating  "Reinforced Plating" (all structures & squads, incl. Command Center)
  plating_1  tier 1  110₡   stat/all maxHp ×1.10
  plating_2  tier 2  180₡
  plating_3  tier 3  280₡                   -> T3 cumulative ×1.33 HP (HQ 600 -> 798)
```
Derived blurbs (never hand-written): `"+5% damage and +5% fire rate — all structures and squads"`, `"+10% HP — all structures and squads, including the Command Center"`.

### `levels.json` — Outpost Alpha

Remove both crystals. Add:

| Feature | Obstacles |
|---|---|
| **Home Field** (4 nodes, safe SE) | `(890,455) r16`, `(915,488) r14`, `(858,494) r15`, `(905,522) r13` — all `kind:"crystal"` |
| **Rift Field** (5 nodes, on the west lane's tail) | `(430,500) r16`, `(466,524) r14`, `(396,528) r15`, `(452,470) r13`, `(408,466) r14` |
| **Plasma Well** ×1 | `(560,300) r18 kind:"plasma"` — ≥85px clear of both paths |

| Site | Was | Now | Options | Derived |
|---|---|---|---|---|
| `m1` | `p2 (880,500)` | `(880,478)` `resource` | `["mining_facility"]` | 4 mineral → **56₡/dawn** |
| `s1` | `p1 (870,380)` | `(868,372)` `any` | `["sensor_array","research_facility"]` | — |
| `m2` | **new** | `(440,498)` `resource` | `["mining_facility","garrison"]` | 5 mineral → **70₡/dawn**, ~75px off the west lane |
| `a2` | `(540,255)` | unchanged, `any` | `["plasma_tap","gun_tower","sensor_array"]` | 1 plasma (d=49) → **85₡/dawn** |
| `a1` | `(130,200)` | unchanged, `defense` | `["gun_tower","garrison","sniper_tower"]` | barracks removed |
| `d1`–`d5` | — | unchanged | unchanged | — |

Net **+1 site** (`m2`) — an *economy* site whose income must be defended, not free power.

### `levels.json` — Ridge Pass

Remove both crystals. Add:

| Feature | Obstacles |
|---|---|
| **Home Field** (3 nodes, safe) | `(902,214) r16`, `(926,182) r14`, `(878,248) r15` |
| **Far Field** (5 nodes — *the gamble*, deep west) | `(160,396) r16`, `(196,420) r14`, `(140,432) r15`, `(186,370) r13`, `(146,364) r14` |
| **Plasma Well** ×1 | `(560,455) r18 kind:"plasma"` — ~85px off the south path |

| Site | Was | Now | Options | Derived |
|---|---|---|---|---|
| `m1` | `p1 (900,170)` | unchanged, `resource` | `["mining_facility"]` | 3 mineral → **42₡/dawn** |
| `s1` | `p2 (770,50)` | unchanged, `any` | `["sensor_array","research_facility"]` | — |
| `a1` | `(180,330)` | `(176,392)` `resource` | `["mining_facility","garrison"]` | 5 mineral → **70₡/dawn**, deep in enemy country |
| `d5` | **new** | `(250,318)` `defense` | `["gun_tower","garrison"]` | guards the far mine |
| `d3` | `(560,400)` | unchanged, `defense` | `["plasma_tap","garrison","missile_battery","sniper_tower"]` (4 = key cap) | 1 plasma (d=55) → **85₡/dawn** |
| `a2`, `d1`, `d2`, `d4` | — | unchanged | unchanged | — |

Net **+1 site** (`d5`). Ridge's far mine is the level-2 escalation and feeds CD-31's "new mechanic every 1–2 levels" curve — Outpost teaches "mine near home, one contested field"; Ridge teaches "the richest field is 700px from your HQ."

---

## 6. Math

### Income ceiling story (C4)

| Level | Old max income (L1) | New max income (L1) | Δ |
|---|---|---|---|
| Outpost | refinery 70 + barracks 40 + barracks 40 + refinery 70 = **220/day** | m1 56 + m2 70 + a2 85 = **211/day** | −4% |
| Ridge | refinery 70 + refinery 70 + barracks 40 = **180/day** | m1 42 + a1 70 + d3 85 = **197/day** | +9% |

**Balance invariant (make this a QA gate):** *total best-case L1 income per level must land in 190–230₡/day.* It is measurable by a ~10-line probe over `levels.json` + `buildings.json` — the cheapest possible regression guard, and it is the single number that prevents the crystal multiplier from becoming an inflation multiplier.

Six independent ceilings, so no one of them is load-bearing:
1. **`maxNodes: 5`** — a facility can never exceed `14 × 5 = 70/day` base, no matter how rich an author makes a field.
2. **The 190–230/day authoring band** above.
3. **Level scaling unchanged** (`×1.7` at L3) — mining L3 with 5 nodes = 119/day, identical to today's refinery L3.
4. **Site scarcity + same-slot competition** — the two richest income slots (Outpost `a2`, Ridge `d3`) *cost you a defense building*. Take the gun tower instead and Outpost drops to 126/day.
5. **D8** — research can never touch income, so nothing compounds.
6. **The night tax (C5)** — the richest fields are the most exposed by design; a wrecked mine earns 0 that dawn. High income is *paid for in defense spend*, not free.

### The marginal-value ladder (C11)

`gun_tower` DPS/₡, from live data (`damage 10`, `fireRate 3.2`, `cost 80`, `upgradeCostMult 0.9`):

| Buy | Cost | Δ DPS | DPS/₡ |
|---|---|---|---|
| New gun tower | 80 | +32.0 | **0.400** |
| Gun L1→L2 (×1.22 dmg, ×1.1 rate) | 72 | +10.9 | 0.151 |
| **Weapons T1 on a 140-DPS board (day 3)** | 110 | +14.4 | **0.131** |
| Gun L2→L3 | 144 | +12.4 | 0.086 |
| **Weapons T1 on a 250-DPS board (day 5)** | 110 | +25.6 | **0.233** |
| Gun L3→L4 | 216 | +13.8 | 0.064 |
| Idle credits | — | 0 | 0.000 |

The ladder is: **new tower ≫ research ≳ marginal upgrade ≫ idle.** Research's value *grows* with your board while upgrades' value *shrinks*, and the curves cross at roughly a 190-DPS board (~day 3–4) — **which is exactly when the sites run out.** That is the design's load-bearing claim:

> **Research is what you buy when the map is full — precisely the moment CD-35's 1600₡ idle-money pathology used to appear.** It is a snowball *sink*, not a snowball source.

**Research budget vs. days.** Outpost total credits over a run ≈ start 320 + income (~200 × 5 dawns = 1000) + clear bonuses (625) + kill rewards ≈ **~2500₡**. A viable board costs ~1434–1898₡ (CD-35's measured figure), leaving **~650–1050₡** for research. The tree costs 570/track, 1140 for both. So *money* binds at ~1–1.7 tracks, and the *day cap* binds at ≤5–6 purchases against 6 nodes. Both constraints bite; you get roughly half the tree, and order matters.

### Trap analysis (C2), per node

| Track | Dead for which build? | Metric it actually moves (CD-37's lesson) |
|---|---|---|
| Weapons | **None** — every build owns damage-dealing structures by definition (the HQ has a gun even in a null build). | enemy time-to-kill; total wave damage output |
| Plating | **None** — every build owns the Command Center, whose HP bar is the loss condition. | **wrecks at dawn / HQ minimum**, *not* damage output |
| Ordnance (CD-40) | **None** — a targeted active is build-agnostic. | HQ minimum on climax waves |

The Plating row is the important one and it is CD-37's finding applied *before* the fact rather than after. TICKETS.md CD-37 has been open through two QA cycles because garrison's swap test measures damage output while garrison's real contribution is body-blocking. Plating has exactly the same shape — **a Plating swap test measured in damage-dealt will falsely report a trap.** Its QA criterion is defined in §12 around wrecks and HQ minimum from the start.

---

## 7. Module changes

| File | Change |
|---|---|
| `src\data\levels.ts` | `SiteCategory` loses `"production"`, gains `"resource"`; `ObstacleDef` += `"plasma"` kind, `yield?`, `blocks?`; new `ResourceKind`, `countResourcesNear()` |
| `src\data\buildings.ts` | `StatMods` exported (shared with research); `BranchOption.mods: StatMods`; `BuildingDef` += `mining?`, `requires?`, `unique?`, `research?`; `shape` += `"tap"`; `scaledStats(def, level, branchId?, **mods?**)` — optional param, all existing call sites keep compiling |
| `src\data\research.ts` + `research.json` | **New.** Loader + `describeNode()` |
| `src\data\units.ts` | += `unitStats(def, mods?)` |
| `src\data\validate.ts` | **New, DEV-only.** See §11 R4 |
| `src\game\types.ts` | `BuildSiteState` += `resources`; `ResearchState`; `GameSnapshot` += `research`; `GameEvent` += `researched`/`researchUndone` |
| `src\game\Game.ts` | `loadLevel`: derive `resources`, filter `options`, reset research. `collectDawnIncome`: `× nodes` (2 lines). `canBuild`: `unique` guard. New: `researchMods()` (memoized on purchase, **never per-tick**), `restatAll()`, `buyResearch(nodeId)`, `undoResearch()`, `hasResearch(id)`, `unlockedAbilities()`, `previewIncome(siteId, defId)`, `statsFor(buildingId)`, **`resolveOption(index)`**. `startNight`: clear `boughtToday`. `sellOrUndo` removal branch: revoke research if the removed building is the facility (mirrors the adjacent `this.units = this.units.filter(...)`). `syncSquad`/`updateUnits`: read `unitStats(def, mods)` |
| `src\ui\ResearchRing.ts` | **New.** Track chips (2×2 block) + sell chip, world-anchored at the facility |
| `src\ui\UpgradeChip.ts` | Early-return when `def.research === true` (flag, not id string) |
| `src\ui\BuildRing.ts` | Mining options show **`56₡/dawn`** on the button face (C7 — number on the button, not a tooltip) |
| `src\ui\HUD.ts` | `scaledStats(...)` → `game.statsFor(b.id)` so displayed numbers include research; `"resource"` site label |
| `src\render\Renderer.ts` | `plasma` obstacle kind (+ vector fallback); site resource badge (`◆ ×4`); `"tap"` shape; `"resource"` site ring color; `HaulerFx` |
| `src\render\sprites.ts` | `plasma:0|1`, `bld:tap:0|1` (Step 5; fallbacks first — the pipeline's per-entity rule) |
| `src\main.ts` | `case "option"` collapses to `game.resolveOption(action.index)` |
| `src\audio\bindings.ts` | Optional `researched` sound |

### The `resolveOption` refactor — worth its own line

`src\main.ts:118-132` currently branches inside the browser input handler: *is a branch pending? → pick branch; else → build*. CD-7 adds a third meaning (research chip). Three cases in an input handler is exactly the "registry over switch when a third case is plausible" trigger — and more importantly it is **logic living in the browser layer that a Godot port would have to reimplement from scratch.**

Move it: **`Game.resolveOption(index: number)`** decides what `option(n)` means for the current selection (empty site → build; branch pending → pick branch; research facility → buy track *n*). `main.ts`'s case becomes one line, the meaning of the verb ships in the sim, and Godot's InputMap handler is a one-liner too. This is a small, cheap, port-facing win that CD-7 should bank rather than leave for CD-40 to trip over.

---

## 8. Platform impact

| Concern | Browser (now) | Godot 2D (PC) | Controller (Xbox/PC) | Mobile (iOS/Android) |
|---|---|---|---|---|
| Resource derivation | Pure fn at load | **~8 lines of GDScript over identical JSON** — no new format, no new file type | n/a | n/a |
| `research.json` / `mining` block | `import` + cast | `JSON.parse_string()` on the same file (C8) | n/a | n/a |
| Research UI (`ResearchRing`) | DOM over canvas via `canvasToScreen` | Control nodes anchored to a world position — same design | **Free**: `option(n)` = existing InputMap action; spatial nav already works; focus brackets already ship | Tap = `option(n)`; chips sized ≥44px logical (UI_PLAN 5) |
| Numbers-before-purchase (C2) | Text on the button face | Same | **Required** — no hover exists (UI_PLAN 6) | **Required** — no hover exists |
| Track count ≤4 | Keys 1–4 | Same | Face/shoulder or radial → 4 max | 4 thumb targets fit landscape |
| `resolveOption` in `Game` | One-line handler | **One-line handler** (logic already ported with the sim) | Inherited | Inherited |
| Site resource badge | Canvas draw | Node2D label | Visible without hover ✓ | Legible at 960×540 letterboxed ✓ |
| Haulers (`HaulerFx`) | Renderer only | AnimatedSprite2D / GPUParticles2D — **no sim contract to honor** | n/a | First thing to cut if particle budget bites (ROADMAP clutter lesson) |
| Determinism (C3) | No RNG added | Lockstep-safe → online co-op + replays stay open | n/a | n/a |
| `validate.ts` | DEV-only assert | **The de-facto data contract for the port** — Godot has no TS types at all, so a web-validated JSON file is the only guarantee the port gets | n/a | n/a |
| Saves | No migration (CD-38 verified: no building ids in `SaveDataV1`) | Same schema | n/a | n/a |

---

## 9. Extension seams

| Future work | Seam | Cost when it lands |
|---|---|---|
| **CD-40 airstrike + nuke** (blocked on this ticket) | `ResearchEffect = { kind: "unlock"; abilityId }` + `Game.unlockedAbilities(): string[]` + `Game.hasResearch(nodeId)`. CD-40 adds an `ordnance` track to `research.json` with `ordnance_airstrike` (tier 1) and `ordnance_nuke` (tier 2), plus `abilities.json`. | **Two JSON nodes. Zero changes to `research.ts`, `buildings.json`, or `ResearchRing`** — tracks render from data, and the ≤4-track cap (D7) reserves the key. `describeNode` falls back to `node.blurb` for unlock nodes, which is why that field exists in CD-7. Sensor Pulse is Command-Center-native and untouched. |
| **CD-9 nav grid + walls** | `obstacles` stays the single spatial truth; `ObstacleDef.blocks?: boolean` (default true) ships **now**, unused, so CD-9 needs no data migration. Fields are authored with ≥24px inter-crystal gaps (one nav cell) so they read as porous cover, not walls. | Field authoring is already correct. |
| **CD-30 mutators & perks** | `StatMods` + `scaledStats(..., mods?)` is one chain — a mutator is another `StatMods` folded into `researchMods()`. A perk = "start with `weapons_1` purchased" = one entry in `researchPurchased` at `loadLevel`. `requires` is where "perk: Deep Core Drilling → mine 2-node fields" plugs in. | No new mechanism. |
| **Roguelite research draft** (the rejected Open-Q1 option) | The tree is data; a draft is *presentation* — "offer 3 of the currently-affordable nodes." | Becomes cheap and safe the day **CD-20** lands a seeded RNG. Nothing here forecloses it. |
| **CD-31 campaign pacing** | `ResearchNodeDef.minWave?: number` ships typed and unused; `requires`-filtering gates buildings per level. | One field per node. |
| **Research tree outgrows 4 chips** | UI_PLAN blesses modals as portable everywhere. `ResearchRing` → a research modal; the data and `buyResearch` are unchanged. | UI only. |
| **Hard exclusive fork inside a track** | `ResearchNodeDef.exclusiveWith?: string[]` — named, deliberately **not built** (D6: a building-specific fork is a trap generator). | One field + one guard. |
| **CD-32 final art** | `shape: "tap"` + `plasma:0|1` follow the atlas API; vector fallbacks ship first, sprites swap per-entity. | Per the existing pipeline. |
| **CD-16 naming** | Every user-visible string is a `name`/`description`/`blurb` field. `id`s are the contract. | Pure data edit. |

---

## 10. Implementation steps (each playable + typecheck-clean)

**Step 1 — Resource model + derivation + validator. No gameplay change.**
`ObstacleDef` (+`"plasma"`, `yield?`, `blocks?`); `ResourceKind`; `countResourcesNear()`; `BuildSiteState.resources`; `BuildingDef.requires?` + option filtering in `loadLevel` (no def uses it → no-op); `src/data/validate.ts` (DEV). Renderer gains the `plasma` kind + vector fallback (no plasma in data yet → dormant path).
*Playable: byte-identical. QA: derived counts match a hand-count of `levels.json`; both levels' scripted runs produce identical results pre/post.*

**Step 2 — New defs + income math + Outpost layout. Ridge keeps the old economy.**
Add `mining_facility` + `plasma_tap`; `collectDawnIncome` × nodes; `Game.previewIncome`; BuildRing income-on-button; rewrite Outpost obstacles/sites; **`barracks`/`refinery` stay** (Ridge still uses them).
*Playable: Outpost on the new economy, Ridge on the old — you can A/B both in one build. QA: Outpost income invariant 190–230/day; idle ≤70₡/dawn (C4); the contested mine (`m2`) is net-positive with one supporting defense building.*

**Step 3 — Ridge layout + retire `barracks`/`refinery` + site badges.**
Rewrite Ridge; delete both defs; site resource badge; `"resource"` category label/ring.
*Playable: both levels on the new economy, no legacy defs. QA: validator clean; zero source references to `barracks`/`refinery`; Ridge income invariant; both levels clear with a mixed build; **old save loads clean** (no building ids in `SaveDataV1`).*

**Step 4 — Research facility + tree + `resolveOption`.**
`research.json`/`.ts`; `StatMods`; `scaledStats(..., mods?)`; `unitStats`; research ledger + one/day + `undoResearch` + sell-revoke + `restatAll`; `ResearchRing`; `snapshot.research` (cloned); `Game.resolveOption`; `hasResearch`/`unlockedAbilities`.
*Playable: the full CD-7 feature. QA: the full plan in §12.*

**Step 5 — Cosmetics. Renderer-only, cuttable.**
`HaulerFx`; `plasma:0|1` + `bld:tap:0|1` atlas frames; per-node income floaties at dawn.
*Playable: unchanged sim by construction (zero `Game.ts` diff).*

**Ordering rationale:** the economy rework lands and is re-baselined by QA *before* research adds power. Research is the single biggest balance risk in this ticket (§11 R1), and shipping it against a moving economy baseline would make the two impossible to tell apart.

---

## 11. Risks & cheapest de-risk

| # | Risk | Cheapest de-risk |
|---|---|---|
| **R1** | **Research inflates player power → both levels get easy.** Weapons T3 + Plating T3 = ×1.34 DPS and ×1.33 HP (HQ 600→798) against waves tuned for neither. | **Ordering** (Step 4 last, after a re-baselined economy) + **start conservative** (+5%/+10% per tier; raise only if QA reports research is a dead buy) + a research-rush build in the QA plan. Never retune waves first — that hides the real cause. |
| **R2** | **Income inflation / snowball return** (C4). | The **190–230₡/day invariant** as a ~10-line static probe over the two JSON files. Cheapest possible check, no playthrough needed, catches every future level too. |
| **R3** | **Plating falsely reported as a trap** by a damage-output swap test — the exact failure that has kept CD-37 open through two QA cycles. | **Define its metric up front** (§12 test 4): wrecks-at-dawn and HQ minimum, never damage dealt. Zero cost — it is a one-line QA plan decision made now instead of after the third re-measure. |
| **R4** | **Level coordinates are hand-derived**: a field out of range, a site inside a crystal, a well on a path, a stale `"production"` string that **tsc cannot catch** (`levels.ts:63` casts `as unknown as`). | `src/data/validate.ts`, DEV-only, ~30 lines: every site option is a known id; every category is in the union; every site offering a `requires` building meets it; no obstacle center within 20px of a site or path waypoint; every research `trackId` exists. Fails loud on boot. **This is also the port's only data contract** (Godot has no TS types at all) — R4's fix is a cross-platform asset, not a chore. |
| **R5** | Deleting `barracks`/`refinery` breaks CD-35/36/37/38's QA scripts and doc references. | Bookkeeping, unavoidable, and cheap: the scripts must be rewritten regardless. **No save migration** — CD-38 verified `SaveDataV1` stores no building ids. |
| **R6** | Crystal clusters become an unintended **wall** in CD-9's nav grid. | `blocks?: boolean` ships now (free, unused) + author fields with ≥24px gaps. Both are already in the data above. |
| **R7** | **Sell-back exploit on the research facility** (buy tree → sell → keep buffs → pocket 150₡). | **D10**: research accrues to `invested` and sell revokes. ~3 lines, reuses `sellOrUndo`'s existing removal branch and the exact precedent one line above it (`this.units = this.units.filter(...)`). Fallback knob: mark the facility non-sellable — a `getSellInfo` guard. |
| **R8** | The contested mine (Outpost `m2`, Ridge `a1`) dies every night → 0 income → **a trap**. | QA test 3 makes "net-positive by the last dawn, with one supporting defense building" a pass criterion. Knobs, in order: move the field 20px further off the lane; `maxHp 90→110`; `creditsPerNode 14→16`. |
| **R9** | `researchMods()` recomputed per tick → perf. | Memoize on purchase/undo/revoke — it changes at most once per day. `restatAll()` likewise runs on purchase, never on tick. |
| **R10** | Determinism regression (C3). | Nothing in this design uses RNG: derivation is pure, haulers are renderer-side off `time`. **Keep CD-38's `Math.random` grep in the QA plan** — it is free and it has already caught nothing twice, which is the point. |
| **R11** | CD-15: a new mutable snapshot field inherits the by-reference bug. | `research` returns a fresh object with a copied array. ~1 line, immeasurable cost, sets the precedent CD-15 generalizes. |

---

## 12. QA test plan

1. **Income invariant (static, permanent):** best-case L1 income per level ∈ [190, 230]₡/day, computed from `levels.json` + `buildings.json` alone. Re-run on every future level.
2. **Idle-money discipline (CD-35 regression):** a healthy mixed build keeps idle money **≤70₡ every dawn** across both levels. This is the headline number of the whole ticket.
3. **Contested mine is not a trap:** Outpost `m2` / Ridge `a1` + one supporting defense building must be **net-positive by the final dawn**. Also record how often it is wrecked (C5: a wreck earns 0).
4. **No-trap sweep, per track, with the right metric (CD-37's lesson applied pre-emptively):**
   - *Weapons* → buying T1–T2 measurably lowers total W4–6 damage taken vs. spending the same credits on the best available upgrade.
   - *Plating* → measured on **wrecks-at-dawn and per-wave HQ minimum**, **never** on damage dealt.
   - *Neither track may be strictly dominated:* for each track there must exist at least one wave where its T1 beats the other's T1 by ≥10% on that track's own metric.
5. **Explicit numbers (C2):** every research chip shows name + derived number + cost **on its face** with zero hover, verified in the live DOM. Confirm `describeNode` output matches the JSON `mul` for every node (anti-drift).
6. **One-per-day gate:** second purchase in the same day is a no-op via both mouse and key; the gate releases at dawn, not at `startNight`.
7. **Research undo/sell (CD-24 parity):** `undoResearch` refunds exactly, day-only, cleared at `startNight`. Selling the facility refunds `0.6 × invested` **and revokes every node** — confirm buffs actually disappear (`statsFor` deltas) and `restatAll` clamps HP. A destroy → dawn-rebuild cycle **preserves** research.
8. **`unique` gate:** with one facility standing, the option is disabled at every other site; selling frees it; the build ring's key indices don't shift mid-day.
9. **Research-rush build (R1):** facility on day 1 (250 of 320 starting), full tree, thin board → must **not** clear. If it clears, research is overpowered; go to the knobs, not the waves.
10. **All-gun-tower regression (permanent, CD-38 test 1):** must still hard-defeat at W4 with the AIR badge on day 4. **With Weapons T3 purchased, it must still fail** — research must not paper over the air lane.
11. **Requirement filtering:** a site with <3 mineral nodes never offers `mining_facility`; keys 1–4 map to the *effective* option list; validator passes on both levels.
12. **Events & hygiene:** `researched`/`researchUndone` counts track real purchases; **grep confirms no new `Math.random()` in `Game.ts`** (only `burst()`); a zero-research playthrough is byte-identical to Step 3's build; zero console errors.
13. **Persistence:** a pre-CD-7 save loads clean (no building ids in `SaveDataV1`); research does **not** persist across levels (per-run only — CD-30 owns cross-run).
14. **Perf smoke:** `researchMods()` and `restatAll()` are called at most once per day, never per tick — verify by spy count over a full 6-wave run.

---

## 13. Fallback knobs (in order, per risk)

- **Research too strong (R1):** Weapons tier 5%→4%; Plating tier 10%→8%; T3 cost 280→360; then Plating `scope` excludes the HQ. *Retune waves only as a last resort — it hides the cause.*
- **Research a dead buy:** Weapons tier 5%→6%; T1 cost 110→90; add a 4th tier before touching percentages (more depth beats bigger numbers — it keeps the day cap binding).
- **Tree too easily completed:** T3 280→340, or add tier 4 (100/170/260/370 = 900/track).
- **Income too high / low:** `creditsPerNode` 14→12/16 (affects both levels uniformly — the single cleanest knob); then per-field node counts.
- **Plasma dominant:** `plasma_tap` cost 170→200, or `incomePerDay` 85→75.
- **Plasma never bought (dominated by the defense option at the same slot):** `incomePerDay` 85→95, or `maxHp` 80→100.
- **Contested mine unviable (R8):** move the field 20px off-lane → `maxHp` 90→110 → `creditsPerNode` 14→16.
- **Facility too expensive to ever reach:** cost 250→210, or `startingMoney` +40.
- **Far mine (Ridge `a1`) a pure trap:** move `d5` 20px closer to the field; then trim the field 5→4 nodes and move it 30px off-lane.
- **`unique` placement choice is noise (D9):** author `research_facility` at exactly one site — a `levels.json` edit, no code.
- **Fields wall off a lane after CD-9:** set `blocks: false` on interior crystals — the field ships with the field already there.

---

## 14. Simplifications bought

No new resource *currency* (credits only — one wallet, C10-safe, co-op-safe). No worker units, no ferrying, no upkeep (C10). No authored yield numbers — the map is the number. **Income reuses the existing `incomePerDay` + `scaledStats` level curve verbatim** (D3): two changed lines in `collectDawnIncome`, no new scaling math. Research reuses `option(n)`, the `mods`/`scaledStats` chain, the measured-width chip row, `getSellInfo`, and the `spentToday` ledger — **zero new input verbs, zero new UI patterns, zero new economy concepts.** No RNG anywhere (C3). No hard research forks (D6 proves they'd be traps). Adjacency is one pure function shared with CD-9. Haulers are pixels, not state (D11). CD-40's entire hookup is **two JSON objects**.

The whole ticket is: one derived integer per site, one `× nodes` in the income line, one small JSON tree, and one new overlay class.

---

**Files this design touches:**
`src\data\buildings.json`, `buildings.ts`, `levels.json`, `levels.ts`, `units.ts`, `research.json` *(new)*, `research.ts` *(new)*, `validate.ts` *(new)*; `src\game\Game.ts`, `types.ts`; `src\ui\ResearchRing.ts` *(new)*, `BuildRing.ts`, `UpgradeChip.ts`, `HUD.ts`; `src\render\Renderer.ts`, `sprites.ts`; `src\main.ts`; `src\audio\bindings.ts`.

**Docs to update on landing:** `ROADMAP.md` (Phase 2 → done; Open Question 1 → answered: global tree, draft deferred behind CD-20; "vespene geysers" → Plasma Wells in the Theme-gaps section), `TICKETS.md` (CD-7 → implementing; CD-40 unblocked, note the `ResearchEffect.unlock` seam).
