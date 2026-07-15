# Counter-play & Pressure pass — Design (architect, 2026-07-14)

Resolves CD-22 (binary damage), CD-23 (d5 breakwater), CD-35 (all-gun-tower
dominant strategy, user-confirmed). First sanctioned Game.ts combat change.
Status: designed → implementing.

## The three levers (all UI-legible)

Player-sayable rule: **"Lots of little bullets bounce off armor; big shells
don't; nothing on the ground hits the sky."**

1. **Air lane:** flyers untargetable by ground-only weapons. New BuildingDef
   field `targets: "all" | "ground"` (loader defaults "all"). gun_tower and
   siege_tank → "ground"; bunker, missile_battery, command_center → "all".
2. **Standoff attackers:** enemies with `attackRange`/`attackRate` stop
   outside melee and lob visible projectiles at buildings. Siege Walker
   becomes ranged (130px). NEW enemy Spitter (cheap early ranged critter)
   so chip damage starts wave 2. Structural CD-22 fix — chip damage is
   guaranteed by mechanics, not tuning.
3. **Armor bite via hit size:** gun_tower reshaped to many-small-hits
   (10 dmg @ 3.2/s ≈ same 32 DPS unarmored) so flat armor bites it hard
   (50% vs walker) while big-hit weapons punch through. CD-14 flat armor
   readability kept.

Plus economy trim so counters must be bought INSTEAD of upgrades.

## Exact data changes

buildings.json:
- gun_tower: damage 10, fireRate 3.2, upgradeCostMult 0.9, targets "ground",
  description: "Rapid-fire turret. Best credits-per-kill vs light ground.
  Ground only — armor shrugs it off."
- bunker: targets "all", description: "Hardened garrison, huge HP. Short
  range but hits air. The line that holds."
- siege_tank: targets "ground", description: "Long-range splash artillery.
  Shreds packed swarms. Ground only."
- missile_battery: maxHp 150, targets "all", description: "Heavy missiles.
  Punches through armor and hits air. Slow — swarms get past it."
- command_center: targets "all" (description append: "Its light gun hits air.")
- barracks incomePerDay 40; refinery 70.

enemies.json:
- New EnemyDef fields: attackRange? (px, 0/absent = melee), attackRate?
  (shots/s; for ranged, `damage` = damage PER SHOT). New archetype "ranged".
- siege_walker: damage 20, attackRange 130, attackRate 0.5, reward 24.
- NEW spitter: { id spitter, name Spitter, archetype ranged, maxHp 28,
  speed 55, damage 9, attackRange 100, attackRate 0.45, reward 5, radius 7,
  color #558b2f, accent #c5e1a5, armor 0 }.
- skimmer reward 8; brute reward 16; warlord reward 100.

levels.json:
- Outpost Alpha W2 entries += spitter ×3 (north, delay 6, interval 1.2).
- Outpost Alpha W3 entries += spitter ×4 (west, delay 3, interval 1.0).
- Ridge Pass W2 entries += spitter ×3 (south_west, delay 4, interval 1.2).
- No other composition changes (CD-21 climax shape preserved).

## Code changes (Game.ts + types.ts, small)

- findTarget(x, y, range, targets): skip flyers when targets === "ground".
- Projectile: + faction "player"|"enemy", hitsAir boolean,
  targetBuildingId?. Player projectiles carry weapon filter; applySplash
  respects hitsAir at impact.
- resolveEnemyContact: if def.attackRange > 0 → same target priority as
  melee (nearest non-HQ building in attackRange, else HQ in attackRange),
  set engaged, tick EnemyUnit.attackCooldown; on fire push enemy-faction
  projectile (speed 180, splash 0) at the building position + emit
  { type: "enemyFired", defId }. Melee branch byte-identical.
- updateProjectiles: enemy-faction impact → building hp -= damage,
  floatText, destroyBuilding on ≤0 non-HQ; fizzle if building gone.
- New GameEvent "enemyFired" (audio hook later — bindings ignore unknowns).
- No Math.random in new sim paths (CD-20).

## UI surface (minimal)

- Forecast badges per row from enemy def: AIR (flyer), ARMORED (armor ≥ 4),
  RANGED (attackRange > 0). One CSS class.
- Building role text rides existing description field (no new UI code).
- Renderer: "ranged" archetype vector fallback (spiky wedge) for Spitter;
  enemy projectiles via existing drawProjectiles.

## Math (acceptance predictions)

Effective DPS (L1): gun 32/25.6/16/0(air)/12.8 vs 0/2/5-armor/air/warlord6;
bunker 25.2/23.4/20.7/25.2/19.8; siege 24.75+splash/23.7/22/0/21.5;
missile 42/40.6/38.5/42/37.8. Every column has a distinct best; no row
wins all.

- Build A (user's all-gun-tower): clears W1-3 with spitter chip; W4 = 6
  skimmers (330 air HP) vs 0 AA + HQ 12 dps → hard defeat wave 4,
  telegraphed by AIR badge on the forecast the whole preceding day.
- Build B (mixed): survives all 6 with visible damage every wave from W2;
  W4 walker-vs-missile duel ends d4 at ~30-60hp.
- Build C (lean choke + economy): viable, bloody, legible risk.
- Economy: full coverage + all-L2 ≈ 1570₡ > cumulative income until day
  5-6; gun upgrades pricier (mult 0.9 → 72/144/216).

## Ticket resolution

- CD-22: zero-damage sweep W2+ is now the QA FAIL bar (W1 tutorial wave
  zero-damage is by-design).
- CD-23: d5 shelled by walkers/spitters (not warlord-only); bunker-on-d5
  is its headline play.
- CD-35: diversity demanded, economy excludes, standoff bleeds gun lines.

## Phase 3a note

Garrison units adopt the same targets field; snipers = the only garrison
answering standoff walkers + air without rebuilding — the choice-based
upgrade path reserved for them.

## Implementation steps

1. Air lane (targets field, findTarget filter, hitsAir threading, gun/
   siege ground, missile hp 150, descriptions).
2. Standoff (attackRange/Rate/cooldown, enemy projectiles + building
   damage, enemyFired event, walker/spitter data, ranged render fallback,
   wave entries).
3. Economy & legibility (rewards/income/upgradeCostMult, gun 10@3.2,
   forecast badges + CSS).
4. QA pass — knob adjustments only.

## Fallback knobs (in order per risk)

- Overshoot: W4 skimmer 6→5; walker shot 20→16; spitter 3/4→2/3; skimmer
  reward 8→10; refinery 70→80.
- d4 duel knife-edge: missile maxHp 150→170 or walker range 130→115.
- W6 climax regression: W6 skimmer 4→3, warlord delay 16→18.
- Gun feels trap-like: gun dmg 10→11.
- Ridge W3 AA too early: add bunker to Ridge d2 options.

## QA test plan

1. All-gun-tower replay: PASS = defeat or ≤25% HQ by W4-6; FAIL = clears.
   Assert day-4 forecast has AIR badge.
2. Build B clears; every wave ≥2 deals >0 building+HQ damage; W6 global
   max; HQ min > ~150.
3. Build C survives with wrecks + dawn rebuilds; wrecked production earns
   nothing.
4. d5 engaged by walkers/spitters in W4-6 (not warlord-only).
5. Counter matrix: each building has a wave where swapping it to gun_tower
   turns clear → heavy damage/defeat.
6. Economy: Build B idle money < 300₡ per dawn; full-coverage+L2 cost >
   day-4 cumulative income.
7. Ridge Pass regression + one AA-by-W3 build.
8. enemyFired emits; no new Math.random; W1 melee-only byte-identical.
