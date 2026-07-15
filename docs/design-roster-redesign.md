# CD-38 — Tower Roster Redesign: "Terran doctrine, ThroneFall structure"

Architect design doc, 2026-07-14. Folds in CD-36 (W6 climax), CD-37 (bunker
purpose), first slice of CD-8 (anchored units). Status: designed → implementing.

Player-sayable rule (extends the counter-play pass):
**"Lots of little bullets bounce off armor; big shells don't; nothing on the
ground hits the sky — and infantry slows what it can't stop."**

## Roster

| Building | Cost | Identity | Targets | Upgrade shape |
|---|---|---|---|---|
| Gun Tower | 80 | Cheap chaff-shredder; armor shrugs it off | ground | L2 **branch**: Rapid Loader (rate ×1.35) vs Long Barrel (range ×1.3) |
| **Garrison** (new id, replaces bunker) | 110 | Fields a squad that body-blocks and shoots; only tower whose counter-profile the player composes | (squad's) | L2 **branch**: Riflemen (more marines, keeps AA) vs Sniper Team (armor-piercing, ground-only) |
| **Sniper Tower** (new def) | 150 | Huge slow single hits; armor means nothing; wasted on chaff | ground | linear, maxLevel 3 |
| Missile Battery (re-spec) | 100 (was 140) | Flak battery; shreds anything that flies; **cannot hit ground** | **air** | linear, maxLevel 4 |
| Siege Tank | 160 | Long-range splash vs packed swarms | ground | linear (unchanged) |

Squad units (new `src/data/units.json`):

| Unit | HP | Hit | Rate | DPS | Range | Targets | Notes |
|---|---|---|---|---|---|---|---|
| Marine | 50 | 4 | 2.2/s | 8.8 | 90 | all | Modest AA by design; bounces off armor ≥4 |
| Sniper | 45 | 32 | 0.4/s | 12.8 | 140 | ground | Outranges Siege Walker (130); big hit = armor-piercing under flat armor (no pierce flag needed) |

Garrison squad: L1 = 3 Marines → L2 branch → Riflemen [3,5,7] or Sniper Team
[3,2,3] (index = level-1). Units do NOT scale with level — *more men, not
bigger men*. Garrison building: 240 HP, damage 0, maxLevel 3,
upgradeCostMult 0.7 (77/154), shape "bunker" (reuses sprite).

## Key decisions

- **D1 garrison = new `garrison` id** (not reused `bunker`): def fundamentally
  changes; a misleading id would ship to Godot + all level files. Costs 8
  levels.json option edits + removing the stale `shot_bunker` audio binding.
  **Saves verified safe** — SaveDataV1 stores only unlocks/results/settings/
  hintsSeen; no building ids. No migration.
- **D2 marine AA modest, not absent** (user requirement). Air lane survives
  because marine AA is *transient*: leashed units can't chase, so a skimmer
  is exposed ~2.1s → <1 kill per garrison passed. Marines soften air;
  missiles kill air.
- **D3 Sniper Tower is NEW and ground-only.** Both roles (hard AA,
  armor-cracker) must exist simultaneously. If snipers hit air they'd re-open
  CD-37's exact failure (something else covers air adequately).
- **D4 branching = one generic mechanism, used twice.**
  `BuildingDef.branch?: { atLevel, options[] }` + `PlacedBuilding.branchId`.
  Keys **1/2** pick via the existing `option(n)` GameAction — no new input verb.
- **D5 blocking = existing engage-stop mechanic extended to units.** No
  physics, no nav edits, enemies never pushed. Phase 4 flow fields untouched
  → walls keep passage-sealing. Porousness guaranteed by construction: small
  contact radius (~19px vs building 28-40), finite squad HP, **no mid-night
  respawn**.
- **D6 ranged enemies use contact-defense vs units**: keep building/HQ
  targeting UNLESS a living unit is within contact range (def.radius +
  unit.radius + 6) → fire point-blank at it. Preserves the showcase (garrison
  snipers at 140 duel walkers at 130; marines clear spitters).
- **D7 units are garrison-owned** (`GarrisonUnit.buildingId`); units read
  anchor position every tick, never cache → hero escort (CD-29) plugs in later.
- **D8 supersedes ROADMAP Phase 3a sketch**: garrison is a dedicated building,
  composition rides the branched level axis (not a repeatable axis on any
  tower). Keeps chip row ≤3, reuses upgrade/undo/sell economy, caps unit count.

## Data model

```ts
// buildings.ts
export type TargetMode = "all" | "ground" | "air";   // "air" = cannot hit ground
export interface BranchOption {
  id: string; name: string; blurb: string;
  mods?: Partial<Record<"damage"|"range"|"fireRate"|"splashRadius"|"maxHp", number>>;
  squad?: { unitId: string; countByLevel: number[] };
}
// BuildingDef += branch?: { atLevel: number; options: BranchOption[] }
//             += squad?: { unitId: string; countByLevel: number[] }
//             shape += "sniper"
// scaledStats(def, level, branchId?) — branch mods multiply AFTER level scaling.
//   Single stats-resolution seam: Phase 2 research + CD-30 mutators layer here.

// units.ts (+ units.json)
export interface UnitDef {
  id: string; name: string;
  maxHp: number; damage: number; fireRate: number; range: number;
  targets: TargetMode; radius: number; moveSpeed: number; leash: number;
  color: string; accent: string; kind: "ranged";   // "melee" reserved (Firebat)
}

// game/types.ts
export interface GarrisonUnit {
  id: string; unitDefId: string; buildingId: string;
  x: number; y: number;
  slot: number;            // deterministic home slot (no Math.random — CD-20)
  hp: number; maxHp: number; cooldown: number; hitTimer: number;
}
// PlacedBuilding += branchId: string | null
// WreckState    += branchId: string | null    (dawn rebuild preserves choice)
// Projectile: hitsAir: boolean → targets: TargetMode; += targetUnitId?: string|null
// GameSnapshot += units: GarrisonUnit[]
// GameEvent += { type:"unitFired"; unitDefId } | { type:"unitDied"; unitDefId }
```

## Exact data deltas

**buildings.json**
- DELETE `bunker`. ADD `garrison`: cost 110, maxHp 240, damage 0, range 0,
  fireRate 0, splashRadius 0, incomePerDay 0, maxLevel 3, upgradeCostMult 0.7,
  shape "bunker", colors as old bunker, squad `{unitId:"marine",countByLevel:[3]}`,
  branch `{atLevel:2, options:[
    {id:"riflemen", name:"Riflemen", blurb:"More marines. Keeps anti-air.",
     squad:{unitId:"marine", countByLevel:[3,5,7]}},
    {id:"snipers", name:"Sniper Team", blurb:"Armor-piercing. Ground only.",
     squad:{unitId:"sniper", countByLevel:[3,2,3]}}]}`.
  Description: "Fields an infantry squad that guards its ground. Bodies slow
  the enemy — for a while. You choose who serves."
- `missile_battery`: cost 140→100, damage 60→30, fireRate 0.7→1.4 (DPS 42
  unchanged), splashRadius 18→14, range 155→170, targets "air".
  Description: "Flak battery. Shreds anything that flies. Cannot hit ground."
- ADD `sniper_tower`: cost 150, maxHp 110, damage 75, fireRate 0.35, range 180,
  splashRadius 0, incomePerDay 0, targets "ground", maxLevel 3,
  upgradeCostMult 0.8, shape "sniper", color "#37474f", accent "#4dd0e1",
  size 22. Description: "One huge shot at a time. Armor means nothing to it.
  Wasted on chaff."
- `gun_tower`: stats unchanged; ADD branch `{atLevel:2, options:[
    {id:"rapid", name:"Rapid Loader", blurb:"+35% fire rate", mods:{fireRate:1.35}},
    {id:"longbarrel", name:"Long Barrel", blurb:"+30% range", mods:{range:1.3}}]}`.
- siege_tank / command_center / barracks / refinery / sensor_array unchanged.
  (Sensor boost applies to buildings only in v1 — extending to units is a
  future knob.)

**enemies.json**: skimmer maxHp 55→65 (protects air-lane demand from marine AA).

**levels.json**
- All 8 `"bunker"` option entries → `"garrison"`.
- ADD `sniper_tower` to Outpost d3/d4/d5 and Ridge d2/d3/d4 (keep ≤4 options
  per site — build ring + keys 1-4 unchanged).
- Garrison deliberately NOT offered at Outpost d3/d4 → structurally caps
  garrison-spam at 4 sites.
- Wave retune (CD-36):
  - Outpost W5 DOWN: swarmling 16→14 per spawn, interval 0.3→0.4; brute 5→4;
    skimmer 6→5 (delay 5→6).
  - Outpost W6 UP: brute 3→4; skimmer 4→5 (delay 3→8); warlord delay 16→12.

## Game.ts changes (~200 lines)

**syncSquad(building)** — resolve `{unitId,count}` from def+level+branchId; add
missing units at deterministic slots (angle = slot/count × 2π, r = 22 from
anchor), remove excess. Called on: **build**, **upgrade/branch-pick**,
**sell/undo**, **dawn** (full respawn+heal in onWaveCleared). Units never exist
without their building; destroying a garrison kills its surviving units (wreck
fields no squad — the toll is spent).

**Unit tick (night only, stateless per-tick derivation — no FSM):**
1. Nearest valid enemy (respecting `targets`) within `leash + range` of the ANCHOR.
2. If within `range` of the unit → stand, tick cooldown, instant-hit fire
   (same `hurtEnemy` armor math, no projectiles in v1). Emit `unitFired`.
3. Else move toward it at `moveSpeed`, position clamped to the leash circle
   around the anchor; no enemies → drift home to slot.
4. Boids-lite separation: pairwise push-apart between UNITS within
   radiusA+radiusB (enemies never pushed). O(n²) over ≤30 units.

**Enemy targeting inserts (priority: blocking unit > building > HQ):**
- Melee branch: prepend a scan for nearest living unit within
  `def.radius + unit.radius + 4` (raider 19px vs building 36-48px — this gap
  IS the geometric porousness). If found: engaged = true, `unit.hp -=
  def.damage*dt`, emit `unitDied` on death. Else fall through to today's
  building→HQ logic byte-identically.
- Ranged branch (`resolveRangedAttack`): same contact-range unit check; if a
  unit is in CONTACT range, shot targets it (`Projectile.targetUnitId`, homing;
  fizzle if dead). Otherwise unchanged → walkers at 130 never snipe squads at
  range; garrison snipers (140) duel them.
- Flyers: skip the unit check entirely (fly over). Marines still shoot them.
- `updateProjectiles`: enemy impact resolves targetUnitId before
  targetBuildingId; player projectile `hitsAir` → `targets: TargetMode`
  threaded through findTarget/applySplash (missile splash must not leak onto
  ground units).

**upgrade(buildingId, branchChoice?)**: when `def.branch && b.level+1 ===
branch.atLevel`, a branchChoice is REQUIRED (return false without one); record
branchId, then normal upgrade. `sellOrUndo` levels-revert: if revert drops
below atLevel, clear branchId (+ syncSquad). `getSellInfo` unchanged.

## UI / render / audio

- **UpgradeChip.ts**: when a branch choice is pending, render two choice chips
  instead of the upgrade chip (`[1] Rapid +35% rate · 72₡` / `[2] Long Barrel
  +30% range · 72₡`), same measured-width row (max 3 chips with sell). U with
  pending branch = no-op + chip pulse; keys 1/2 dispatch existing `option(n)`.
- **HUD**: selected-garrison info line "Squad: 3 Marines" (string from def).
- **Renderer/sprites.ts**: unit atlas frames `unit:marine:0|1(:flash)`,
  `unit:sniper:...` via existing enemy builder helpers (2-frame, flip, hit
  flash); drawn between buildings and enemies. New building shape "sniper"
  (elongated-barrel builder or vector fallback for v1). Garrison reuses
  `bld:bunker` sprite.
- **audio/bindings.ts**: remove stale `shot_bunker` mapping; optionally add
  unitFired/unitDied (unknown events are safely ignored — can trail).

## Math highlights

Effective DPS (L1): gun 32/25.6/16/—/12.8 (chaff/brute/walker/air/warlord);
garrison-marines 26.4+block/13.2/6.6/26.4 transient/6.6+~5s block; garrison
snipers L2 25.6/24/**21.6 outranges**/—/20.8; sniper tower 26.25 (overkill
waste)/25.6/**24.5**/—/**24.15**; siege 24.75×pack/23.65/22/—/21.45; missile
—/—/—/**42**/—; HQ 12/9.6/6/12/4.8.

Garrison marginal DPS/₡ (24) < new gun tower (40) → garrison is depth, not
dominant (ROADMAP discipline holds).

**All-gun-tower still fails (permanent regression):** gun stays ground at every
level AND both branches (rate/range mods can't grant AA). W4: 6 skimmers ×
65hp = 390 air HP vs HQ-only 12 DPS → ≈1,130 HQ damage ≫ 600 → hard defeat W4,
AIR badge telegraphing all day 4.

**Marine AA transient:** leash 60 + range 90 ≈ 150px corridor; skimmer speed 70
→ ~2.1s exposure; 26.4 dps × 2.1 ≈ 55 < 65hp → <1 kill per garrison passed.
Garrison-heavy without missile: ~540 HQ dmg W4 → cumulative defeat W5-6; ONE
100₡ missile flips it → air demand forces the purchase (CD-37 fix: the answer
is purchasable, never incidental).

**W6 > W5 mechanically (CD-36):** W5's spike was tempo concurrency; retune
slows W5 ramp (interval 0.4, −2 swarm/lane, −1 brute, −1 skimmer) and raises
W6 concurrency (warlord delay 16→12 lands with the walker push + 5 skimmers at
delay 8). Demand W6 3,390 vs W5 2,045 (66% gap, was 35%).

**Porousness:** ~~single L1 garrison → ≥3 leak even in W1~~ — **this W1 math was
WRONG (CD-39, corrected 2026-07-14 after QA)**: it assumed ~3 raiders in
contact simultaneously, but W1 trickles 9 raiders at ~1/second, and 26.4 squad
DPS kills a 40hp raider in 1.5s — so a lone L1 garrison largely holds W1 (one
~36hp leak measured). That is acceptable for a 110₡ building on the tutorial
wave. **The invariant that matters — and that QA verified holds — is against
SUSTAINED streams:** even L3 Riflemen (7 marines, the strongest possible block)
holds W3 but hard-fails W4 and is wiped by W5; no configuration carries a lane
alone past W3-4; a garrison-only build (all 4 sites) hard-loses at W4. Warlord
grinds a 3-marine squad in exactly 150/30 = 5s (L3 riflemen ≈ 11.6s) — a delay
toll priced in squad lives, spent once per night. Walls (Phase 4) keep their
passage-sealing job.

## Ridge Pass & persistence

Old saves safe (no building ids in schema — verified). Ridge d1/d3/d4/a1
bunker→garrison; sniper_tower added to d2/d3/d4. Ridge W3 (3 brutes + 5
skimmers): AA available from day 1 → the un-applied "Ridge W3 AA" fallback from
the counterplay doc is retired. Ridge W4's 3 walkers demand sniper tower or a
Sniper Team (both reachable by day 4). Full Ridge QA pass required.

## Implementation batches

**Batch 1 — Air lane hardening + Sniper Tower (no units).** TargetMode "air" +
findTarget/splash/projectile `targets` threading; missile re-spec; sniper_tower
def + shape/fallback + site options; descriptions. Bunker untouched → game stays
balanced. *QA: all-gun regression fails W4; missile never hits ground; mixed
build clears both levels; walker duel belongs to sniper tower.*

**Batch 2 — Branch mechanism + gun-tower pilot.** BuildingDef.branch, branchId
on PlacedBuilding/WreckState, upgrade(id, choice?), scaledStats mods,
UpgradeChip choice chips, undo/wreck threading; gun L2 rate-vs-range. *QA:
choice UI mouse+keys 1/2; undo reverts branch; wreck rebuild preserves it; both
branches demanded; sell math unchanged.*

**Batch 3 — Units engine + Garrison (the big one).** units.json/loader,
GarrisonUnit, syncSquad (4 call sites), unit tick, contact-priority inserts,
enemy projectiles vs units, snapshot.units, renderer unit layer + atlas
builders, unitFired/unitDied, garrison def replaces bunker (+8 levels.json
edits), garrison branch rides Batch 2. *QA: porousness invariant; dawn respawn
free, zero mid-night respawn; marines' transient AA <1 kill/pass; snipers duel
walkers; flyers ignore blocks; no-garrison playthrough byte-identical.*

**Batch 4 — Wave retune + full matrix sweep (CD-36 closure).** skimmer 65hp,
W5/W6 edits. *QA: full plan below.*

## Fallback knobs (in order, per risk)

- Block becomes a plug: contact pad 4→2; marine hp 50→40; riflemen L3 7→6.
- Marine AA too strong: skimmer hp 65→75; marine range 90→80. NEVER touch `targets`.
- Marine AA too weak: marine damage 4→5 (watch brute column).
- W6 retune overshoots (CD-21 history!): warlord delay 12→14→16; W6 skimmer
  5→4; brute 4→3.
- W5 still out-damages W6: W5 swarm 14→12/lane; W5 walker 3→2.
- Sniper tower crowds out siege: sniper fireRate 0.35→0.3; siege splash 36→40.
- Missile dead on light-air days: cost 100→90.
- Walker-vs-sniper duel knife-edge: sniper_tower maxHp 110→130 or range 180→190.
- Perf (≤56 units + separation): pool arrays if needed.

## QA test plan

1. **All-gun-tower regression (permanent)**: defeat or ≤25% HQ by W4-6; AIR
   badge day 4; repeat per gun branch (targets stays "ground").
2. **Porousness**: single L1 garrison per lane, no other defense → W1 leaks ≥3
   raiders; W3 stream reaches HQ within 20s; unit count strictly non-increasing
   during any night; both branches. A garrison must NEVER hold a lane to
   wave-clear alone.
3. **No-dead-options sweep**: per def, swap-to-gun_tower on its headline wave
   measurably worsens the outcome — garrison swap must raise W4-6 damage ≥40%
   or defeat (closes CD-37); missile swap → W4 defeat; sniper/siege swaps →
   walker/swarm failures.
4. **W6 climax (CD-36)**: QA's exact cheapest-first mixed script ×2 → W6 =
   global max damage AND global HQ minimum; HQ min > ~150.
5. **Branch coverage**: choose/undo/wreck-rebuild both pairs; keyboard-only and
   mouse-only; U no-ops with pending choice.
6. **Air-lane economics**: garrisons-no-missile → heavy air damage/defeat W5-6;
   +1 missile → clear. Marines <1 skimmer kill per pass.
7. **Ridge Pass full pass**: mixed clears; AA-by-W3; sniper used by W4.
8. **Events & hygiene**: unitFired/unitDied counts; no new Math.random;
   zero-garrison run byte-identical pre/post Batch 3; level-1 hints unaffected
   (no hint copy references bunker).
9. **Persistence**: pre-CD-38 save loads clean; victory recording unchanged.
10. **Perf smoke**: 4 garrisons L3 + 40-enemy wave within frame budget.

## Simplifications bought (mechanism-surface audit)

No pierce flag (flat armor already rewards big hits); no unit projectiles; no
unit commands/FSM/rally; no physics or nav changes for blocking (engage-stop
reuse); branch = one field + existing `option(n)` verb; squad derived from
level+branch (no capacity subsystem); garrison-spam capped by site options not
code. Units engine ≈ 200 lines in Game.ts + one JSON file; every future
anchored-unit feature (hero escort, firebat, research buffs) plugs into a
named seam.
