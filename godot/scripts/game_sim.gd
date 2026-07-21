extends RefCounted
class_name GameSim
## Core day/night sim port of src/game/Game.ts (vertical slice).
## Day/night sim port of src/game/Game.ts — buildings, garrisons, hero,
## loadout mods, sell/undo, dawn income, victory/defeat.

signal phase_changed(phase: String)
signal money_changed(money: int)
signal built(site_id: String, def_id: String)

const WORLD_W := 960.0
const WORLD_H := 540.0

var db: DataDB
var level_index: int = 0
var level: Dictionary = {}
var phase: String = "day" # day | night | victory | defeat
var money: float = 0.0
var wave_index: int = 0
var wave_elapsed: float = 0.0

var sites: Array = [] # {id,x,y,options,building_id,resources}
var buildings: Array = [] # placed
var units: Array = [] # garrison squad members
var enemies: Array = []
var projectiles: Array = []
var particles: Array = []
var floating_texts: Array = []
var pending_spawns: Array = []
var wrecks: Array = []

var selected_site_id: String = ""
var selected_building_id: String = ""
var hq_id: String = ""
var hero: Dictionary = {}
var hero_move: Vector2 = Vector2.ZERO
var hero_def_id: String = "rifle"

var _uid_counter: int = 0
## Host-clock ms of the last successful sell/undo — absorbs click/key
## double-fire within TUNING.input.sellLockoutMs. Game.ts:71 (lastSellAt).
## Web's lastSellAt=0 works because its nowMs is real wall-clock time (always
## way past any sellLockoutMs window); our `_time_ms` is a monotonic counter
## that starts at 0 and only advances via update(dt), so a literal 0 here
## would wrongly lock out a sell attempted before the first tick. A large
## negative sentinel keeps "first sell always allowed" true either way.
var _last_sell_at_ms: float = -1000000.0
var _time_ms: float = 0.0

## CD-30 meta-progression loadout — equipped perk ids + active mutator ids.
## Set via set_loadout/set_hero_loadout, applied at load_level BEFORE the HQ
## is built (Game.ts:166-168). Unknown ids are dropped so a stale/corrupt
## save can never brick load_level.
var loadout_perks: Array = []
var loadout_mutators: Array = []
## Multipliers from every GLOBAL branch pick (today: only the Command Post)
## merged with the loadout's perk/mutator mods. Recomputed only at pick time
## (compute_global_mods, called from load_level and upgrade) — never per
## tick. Game.ts:82 (globalStatMods).
var global_stat_mods: Dictionary = {}
## Merged enemy-stat mutator factor (Hardened Foe's enemyMods.maxHp seam) —
## 1 when nothing active touches enemy stats. Game.ts:95 (enemyHpMul).
var enemy_hp_mul: float = 1.0


func _init(data: DataDB) -> void:
	db = data


func load_level(index: int) -> void:
	level_index = index
	level = db.get_level(index).duplicate(true)
	# CD-30 wave-table transform (Game.ts:653-682): deep-copied above, so
	# mutating counts/intervals/delays in place here never contaminates the
	# shared DataDB.levels entry for a future load of this level.
	_apply_wave_mutators()
	phase = "day"
	wave_index = 0
	wave_elapsed = 0.0
	enemies.clear()
	units.clear()
	projectiles.clear()
	particles.clear()
	floating_texts.clear()
	pending_spawns.clear()
	wrecks.clear()
	selected_site_id = ""
	selected_building_id = ""
	hero_move = Vector2.ZERO
	_uid_counter = 0

	# Buildings must be empty before compute_global_mods() — it loops
	# `buildings` for live global-branch picks, and a fresh level has none
	# yet (Game.ts:157-160).
	buildings.clear()
	global_stat_mods = compute_global_mods()
	enemy_hp_mul = _compute_enemy_hp_mul()
	money = float(level.get("startingMoney", 300)) + _loadout_starting_credits()

	sites.clear()
	for s in level.get("sites", []):
		var site := {
			"id": str(s.get("id", "")),
			"x": float(s.get("x", 0)),
			"y": float(s.get("y", 0)),
			"category": str(s.get("category", "any")),
			"options": s.get("options", []).duplicate(),
			"building_id": "",
			"resources": _derive_resources(float(s.get("x", 0)), float(s.get("y", 0))),
		}
		sites.append(site)

	var hq_def: Dictionary = db.get_building("command_center")
	var hq_pos: Dictionary = level.get("hq", {"x": 780, "y": 430})
	var hq_stats := scaled_stats(hq_def, 1, "", global_stat_mods)
	hq_id = _uid("hq")
	buildings.append({
		"id": hq_id,
		"site_id": "__hq__",
		"def_id": "command_center",
		"level": 1,
		"branch_id": "",
		"hp": float(hq_stats["maxHp"]),
		"max_hp": float(hq_stats["maxHp"]),
		"x": float(hq_pos.get("x", 780)),
		"y": float(hq_pos.get("y", 430)),
		"cooldown": 0.0,
		"is_hq": true,
		"invested": 0.0,
		"spent_today": 0.0,
		"levels_today": 0,
		"built_today": false,
		"aim_angle": -PI / 4.0,
		"muzzle_flash": 0.0,
	})
	_last_sell_at_ms = -1000000.0
	_park_hero()
	phase_changed.emit(phase)
	money_changed.emit(int(money))


func restart() -> void:
	load_level(level_index)


func select_site(site_id: String) -> void:
	if site_id == "":
		selected_site_id = ""
		selected_building_id = ""
		return
	if phase != "day":
		return
	selected_site_id = site_id
	selected_building_id = ""
	var site := _find_site(site_id)
	if not site.is_empty() and str(site["building_id"]) != "":
		selected_building_id = str(site["building_id"])


func select_building(building_id: String) -> void:
	selected_building_id = building_id
	selected_site_id = ""
	if building_id == "":
		return
	var b := _find_building(building_id)
	if not b.is_empty() and not b.get("is_hq", false):
		selected_site_id = str(b["site_id"])


## Mirrors web `Game.selectAt`: buildings win over sites (both phases, so the
## HQ and towers stay inspectable at night), then empty sites during the day.
func select_at(world: Vector2) -> void:
	# Prefer buildings, newest first, so a later build wins an overlap.
	for i in range(buildings.size() - 1, -1, -1):
		var b: Dictionary = buildings[i]
		var def := db.get_building(str(b["def_id"]))
		var r := float(def.get("size", 14)) + 6.0
		if world.distance_to(Vector2(b["x"], b["y"])) <= r:
			select_building(str(b["id"]))
			return

	if phase == "day":
		for s in sites:
			if world.distance_to(Vector2(s["x"], s["y"])) <= 28.0:
				select_site(str(s["id"]))
				return

	selected_site_id = ""
	selected_building_id = ""


func build_option(index: int) -> bool:
	if phase != "day" or selected_site_id == "":
		return false
	var site := _find_site(selected_site_id)
	if site.is_empty() or str(site["building_id"]) != "":
		return false
	var opts: Array = site["options"]
	if index < 0 or index >= opts.size():
		return false
	return build_at(selected_site_id, str(opts[index]))


func build_at(site_id: String, def_id: String) -> bool:
	if phase != "day":
		return false
	var site := _find_site(site_id)
	if site.is_empty() or str(site["building_id"]) != "":
		return false
	var opts: Array = site["options"]
	if def_id not in opts:
		return false
	var def := db.get_building(def_id)
	var cost := float(def.get("cost", 0))
	if money < cost:
		return false
	money -= cost
	var id := _uid("bld")
	var stats := scaled_stats(def, 1, "", global_stat_mods)
	buildings.append({
		"id": id,
		"site_id": site_id,
		"def_id": def_id,
		"level": 1,
		"branch_id": "",
		"hp": float(stats["maxHp"]),
		"max_hp": float(stats["maxHp"]),
		"x": float(site["x"]),
		"y": float(site["y"]),
		"cooldown": 0.0,
		"is_hq": false,
		"invested": cost,
		"spent_today": cost,
		"levels_today": 0,
		"built_today": true,
		"aim_angle": -PI / 4.0,
		"muzzle_flash": 0.0,
	})
	site["building_id"] = id
	# Web keeps the site selected and focuses the new building (Game.ts:499).
	selected_building_id = id
	var bld: Dictionary = buildings[buildings.size() - 1]
	sync_squad(bld)
	_float(float(site["x"]), float(site["y"]) - 28.0, "-%d₡" % int(cost), Color(1, 0.84, 0.33))
	built.emit(site_id, def_id)
	money_changed.emit(int(money))
	return true


## Single stats-resolution seam for the whole sim — mirrors buildings.ts
## scaledStats (Game.ts:219). `branch_id` "" means no branch picked yet;
## a def.branch.global branch's own mods are skipped here (they arrive via
## `global_mods` instead, applied uniformly like every other building's, so
## the picking building never double-counts its own choice).
func scaled_stats(def: Dictionary, level: int, branch_id: String = "", global_mods: Dictionary = {}) -> Dictionary:
	var l := maxi(1, level)
	var scaling: Dictionary = db.tuning.get("levelScaling", {})
	var dmg_mul := 1.0 + float(l - 1) * float(scaling.get("damagePerLevel", 0))
	var hp_mul := 1.0 + float(l - 1) * float(scaling.get("maxHpPerLevel", 0))
	var range_mul := 1.0 + float(l - 1) * float(scaling.get("rangePerLevel", 0))
	var rate_mul := 1.0 + float(l - 1) * float(scaling.get("fireRatePerLevel", 0))
	var splash_mul := 1.0 + float(l - 1) * float(scaling.get("splashRadiusPerLevel", 0))
	var income_mul := 1.0 + float(l - 1) * float(scaling.get("incomePerLevel", 0))

	var stats := {
		"maxHp": float(def.get("maxHp", 0)) * hp_mul,
		"damage": float(def.get("damage", 0)) * dmg_mul,
		"range": float(def.get("range", 0)) * range_mul,
		"fireRate": float(def.get("fireRate", 0)) * rate_mul,
		"splashRadius": float(def.get("splashRadius", 0)) * splash_mul,
		"incomePerDay": float(def.get("incomePerDay", 0)) * income_mul,
	}

	var branch_global := def.has("branch") and bool(def["branch"].get("global", false))
	if branch_id != "" and not branch_global and def.has("branch"):
		for o in (def["branch"].get("options", []) as Array):
			if str(o.get("id", "")) == branch_id:
				if o.has("mods"):
					_apply_mods(stats, o["mods"])
				break
	_apply_mods(stats, global_mods)

	return {
		"maxHp": round(stats["maxHp"]),
		"damage": round(stats["damage"]),
		"range": round(stats["range"]),
		"fireRate": stats["fireRate"],
		"splashRadius": stats["splashRadius"],
		"incomePerDay": stats["incomePerDay"],
	}


## Multiplicative merge helper shared by every StatMods source (branch
## picks, perks, mutators) — mutates `stats` in place. Game.ts:191 (applyMods).
func _apply_mods(stats: Dictionary, mods: Variant) -> void:
	if not (mods is Dictionary):
		return
	var m: Dictionary = mods
	if m.has("maxHp"):
		stats["maxHp"] = float(stats["maxHp"]) * float(m["maxHp"])
	if m.has("damage"):
		stats["damage"] = float(stats["damage"]) * float(m["damage"])
	if m.has("range"):
		stats["range"] = float(stats["range"]) * float(m["range"])
	if m.has("fireRate"):
		stats["fireRate"] = float(stats["fireRate"]) * float(m["fireRate"])
	if m.has("splashRadius"):
		stats["splashRadius"] = float(stats["splashRadius"]) * float(m["splashRadius"])


## Live stats for a placed building, INCLUDING global picks — callers should
## read this instead of scaled_stats directly so displayed numbers never
## drift from what combat/income actually use. Game.ts:579 (statsFor).
func stats_for(building_id: String) -> Dictionary:
	var b := _find_building(building_id)
	if b.is_empty():
		return {}
	var def := db.get_building(str(b["def_id"]))
	return scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")), global_stat_mods)


func upgrade_cost(building_id: String) -> float:
	var b := _find_building(building_id)
	if b.is_empty():
		return INF
	var def := db.get_building(str(b["def_id"]))
	var lvl := int(b["level"])
	if lvl >= int(def.get("maxLevel", 1)):
		return INF
	var overrides: Array = def.get("upgradeCosts", [])
	if lvl - 1 >= 0 and lvl - 1 < overrides.size():
		return float(overrides[lvl - 1])
	return round(float(def.get("cost", 0)) * float(def.get("upgradeCostMult", 0)) * float(lvl))


func can_upgrade(building_id: String) -> bool:
	if phase != "day":
		return false
	var b := _find_building(building_id)
	if b.is_empty():
		return false
	var def := db.get_building(str(b["def_id"]))
	if int(b["level"]) >= int(def.get("maxLevel", 1)):
		return false
	return money >= upgrade_cost(building_id)


## When the NEXT upgrade for `building_id` would land on a branch level,
## returns the branch spec `{atLevel, options}` so callers can require a
## choice; {} otherwise (no branch on this def, already past atLevel, or
## already maxed). Game.ts:526 (pendingBranch).
func pending_branch(building_id: String) -> Dictionary:
	var b := _find_building(building_id)
	if b.is_empty() or not db.get_building(str(b["def_id"])).has("branch"):
		return {}
	var def := db.get_building(str(b["def_id"]))
	var branch: Dictionary = def["branch"]
	if int(b["level"]) + 1 != int(branch.get("atLevel", -1)):
		return {}
	return branch


func upgrade(building_id: String, branch_choice: String = "") -> bool:
	if not can_upgrade(building_id):
		return false
	var b := _find_building(building_id)
	var def := db.get_building(str(b["def_id"]))

	var branch := pending_branch(building_id)
	var is_global_branch := false
	if not branch.is_empty():
		var opt := {}
		for o in (branch.get("options", []) as Array):
			if str(o.get("id", "")) == branch_choice:
				opt = o
				break
		if opt.is_empty():
			return false
		b["branch_id"] = branch_choice
		is_global_branch = bool(branch.get("global", false))

	var cost := upgrade_cost(building_id)
	money -= cost
	b["level"] = int(b["level"]) + 1
	b["invested"] = float(b["invested"]) + cost
	b["spent_today"] = float(b.get("spent_today", 0)) + cost
	b["levels_today"] = int(b.get("levels_today", 0)) + 1

	# A global branch's pick just changed global_stat_mods for every
	# building, not just this one — recompute once, then re-derive every
	# live maxHp from it, BEFORE this building's own stats below are read,
	# so it isn't restat'd against its own stale mods. Game.ts:556-563.
	if not branch.is_empty() and is_global_branch:
		global_stat_mods = compute_global_mods()
		restat_all()

	var stats := scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")), global_stat_mods)
	var hp_ratio := float(b["hp"]) / float(b["max_hp"])
	b["max_hp"] = float(stats["maxHp"])
	b["hp"] = minf(float(stats["maxHp"]), round(float(stats["maxHp"]) * hp_ratio) + 20.0)
	sync_squad(b)
	_float(float(b["x"]), float(b["y"]) - 28.0, "Lv%d!" % int(b["level"]), Color(0.4, 0.72, 0.42))
	money_changed.emit(int(money))
	return true


## Re-derives globalStatMods from the loadout (equipped perks + active
## mutators) merged with every building holding a global branch pick (today:
## only the Command Post). Multiplicative merge, not overwrite. Game.ts:593.
func compute_global_mods() -> Dictionary:
	var merged := {}
	_merge_stat_mods(merged, _compute_loadout_mods())
	for b in buildings:
		var def := db.get_building(str(b["def_id"]))
		if not def.has("branch"):
			continue
		var branch: Dictionary = def["branch"]
		if not bool(branch.get("global", false)):
			continue
		var bid := str(b.get("branch_id", ""))
		if bid == "":
			continue
		for o in (branch.get("options", []) as Array):
			if str(o.get("id", "")) == bid:
				if o.has("mods"):
					_merge_stat_mods(merged, o["mods"])
				break
	return merged


## Merges every equipped perk's and active mutator's `mods` into one
## multiplier set. Degrades to {} if DataDB has no perks/mutators loaded
## (see the module doc comment at the top of this file for what data_db.gd
## needs). Game.ts:609 (computeLoadoutMods).
func _compute_loadout_mods() -> Dictionary:
	var merged := {}
	var perks_db: Variant = db.get("perks")
	if perks_db is Dictionary:
		for id in loadout_perks:
			var p: Dictionary = (perks_db as Dictionary).get(str(id), {})
			if p.has("mods"):
				_merge_stat_mods(merged, p["mods"])
	var mutators_db: Variant = db.get("mutators")
	if mutators_db is Dictionary:
		for id in loadout_mutators:
			var m: Dictionary = (mutators_db as Dictionary).get(str(id), {})
			if m.has("mods"):
				_merge_stat_mods(merged, m["mods"])
	return merged


## Multiplicative merge helper shared by every StatMods source — mutates
## and returns `target`. Game.ts:624 (mergeStatMods).
func _merge_stat_mods(target: Dictionary, source: Dictionary) -> Dictionary:
	for key in source.keys():
		if source[key] == null:
			continue
		target[key] = float(target.get(key, 1.0)) * float(source[key])
	return target


## Sum of equipped perks' one-time `startingCredits` (War Chest) — a flat
## one-time grant added to startingMoney at load_level, never a per-day
## multiplier. Game.ts:636 (loadoutStartingCredits).
func _loadout_starting_credits() -> float:
	var total := 0.0
	var perks_db: Variant = db.get("perks")
	if perks_db is Dictionary:
		for id in loadout_perks:
			var p: Dictionary = (perks_db as Dictionary).get(str(id), {})
			total += float(p.get("startingCredits", 0))
	return total


## Merged enemy-stat mutator factor (Hardened Foe's enemyMods.maxHp seam) —
## 1 when no active mutator touches enemy stats. Game.ts:644 (computeEnemyHpMul).
func _compute_enemy_hp_mul() -> float:
	var mul := 1.0
	var mutators_db: Variant = db.get("mutators")
	if mutators_db is Dictionary:
		for id in loadout_mutators:
			var m: Dictionary = (mutators_db as Dictionary).get(str(id), {})
			var em: Dictionary = m.get("enemyMods", {})
			if em.has("maxHp"):
				mul *= float(em["maxHp"])
	return mul


## Applies every active mutator's count/interval/delay multipliers to
## `level.waves` in place — `level` is already a deep copy (load_level), so
## this can never contaminate DataDB.levels for a future load. Counts round
## UP so a fractional Swarm bump never rounds away to zero extra enemies.
## Game.ts:662 (buildRunWaves).
func _apply_wave_mutators() -> void:
	var count_mul := 1.0
	var interval_mul := 1.0
	var delay_mul := 1.0
	var mutators_db: Variant = db.get("mutators")
	if mutators_db is Dictionary:
		for id in loadout_mutators:
			var m: Dictionary = (mutators_db as Dictionary).get(str(id), {})
			var w: Dictionary = m.get("wave", {})
			if w.has("countMul"):
				count_mul *= float(w["countMul"])
			if w.has("intervalMul"):
				interval_mul *= float(w["intervalMul"])
			if w.has("delayMul"):
				delay_mul *= float(w["delayMul"])
	if count_mul == 1.0 and interval_mul == 1.0 and delay_mul == 1.0:
		return
	for w in (level.get("waves", []) as Array):
		for e in (w.get("entries", []) as Array):
			e["count"] = ceili(float(e.get("count", 1)) * count_mul)
			e["interval"] = float(e.get("interval", 1.0)) * interval_mul
			e["delay"] = float(e.get("delay", 0.0)) * delay_mul


## Re-derives every LIVE building's maxHp against the current
## global_stat_mods and clamps current hp to it, so a Plating pick (or any
## future global maxHp mod) takes effect on everything already on the
## board, not just things built afterward. Called once per global pick
## (from upgrade()) — never per tick. No units system in this port, so
## unlike Game.ts:684 this only restats buildings. Game.ts:689 (restatAll).
func restat_all() -> void:
	for b in buildings:
		var def := db.get_building(str(b["def_id"]))
		var stats := scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")), global_stat_mods)
		b["max_hp"] = float(stats["maxHp"])
		b["hp"] = minf(float(b["hp"]), float(stats["maxHp"]))


## Undo/sell preview: what calling sell_or_undo would do right now, or {}
## if there's nothing to sell (HQ, night, unknown building). Game.ts:711.
func get_sell_info(building_id: String) -> Dictionary:
	if phase != "day":
		return {}
	var b := _find_building(building_id)
	if b.is_empty() or bool(b.get("is_hq", false)):
		return {}
	if bool(b.get("built_today", false)):
		return {"kind": "undo", "refund": round(float(b.get("spent_today", 0)))}
	if int(b.get("levels_today", 0)) > 0:
		return {"kind": "undoUpgrades", "refund": round(float(b.get("spent_today", 0)))}
	var sell_refund := float(db.tuning.get("economy", {}).get("sellRefund", 0.6))
	return {"kind": "sell", "refund": round(sell_refund * float(b.get("invested", 0)))}


## Sell or undo `building_id` (day-only, HQ excluded). `_last_sell_at_ms`
## absorbs key/click double-fire: a second call within
## TUNING.input.sellLockoutMs of a successful one is a no-op. Game.ts:734.
func sell_or_undo(building_id: String) -> bool:
	if phase != "day":
		return false
	var lockout_ms := float(db.tuning.get("input", {}).get("sellLockoutMs", 350))
	if _time_ms - _last_sell_at_ms < lockout_ms:
		return false

	var b := _find_building(building_id)
	if b.is_empty() or bool(b.get("is_hq", false)):
		return false
	var info := get_sell_info(building_id)
	if info.is_empty():
		return false

	_last_sell_at_ms = _time_ms
	money += float(info["refund"])

	if str(info["kind"]) == "undoUpgrades":
		# Levels-only undo: revert today's levels, keep the building.
		var def := db.get_building(str(b["def_id"]))
		b["level"] = int(b["level"]) - int(b.get("levels_today", 0))
		if def.has("branch") and int(b["level"]) < int(def["branch"].get("atLevel", 999999)):
			b["branch_id"] = ""
		var stats := scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")), global_stat_mods)
		b["max_hp"] = float(stats["maxHp"])
		b["hp"] = minf(float(b["hp"]), float(stats["maxHp"]))
		b["invested"] = float(b["invested"]) - float(b.get("spent_today", 0))
		b["spent_today"] = 0.0
		b["levels_today"] = 0
		sync_squad(b)
		_float(float(b["x"]), float(b["y"]) - 20.0, "+%d₡" % int(info["refund"]), Color(0.4, 0.72, 0.42))
	else:
		# Full undo (built today) or a 60% sell — either way, gone.
		var site_id := str(b["site_id"])
		var color := Color(0.4, 0.72, 0.42) if str(info["kind"]) == "undo" else Color(1.0, 0.7, 0.0)
		_float(float(b["x"]), float(b["y"]) - 20.0, "+%d₡" % int(info["refund"]), color)
		var bid := str(b["id"])
		units = units.filter(func(u): return str(u["building_id"]) != bid)
		buildings = buildings.filter(func(x): return str(x["id"]) != bid)
		var site := _find_site(site_id)
		if not site.is_empty():
			site["building_id"] = ""
		if selected_building_id == bid:
			selected_building_id = ""
		# Select the now-empty site so a repeat call is a no-op.
		select_site(site_id)

	money_changed.emit(int(money))
	return true


## CD-30 meta-progression loadout — equipped perk ids + active mutator ids.
## Call BEFORE load_level (same convention as set_hero_loadout) so the ids
## take effect in global_stat_mods/enemy_hp_mul/startingCredits/wave-table.
## Unknown ids are dropped; degrades to no-op filtering if DataDB has no
## perks/mutators loaded. Game.ts:906 (setLoadout).
func set_loadout(perks: Array, mutators: Array) -> void:
	loadout_perks = perks.filter(func(id): return db.perks.has(str(id)))
	loadout_mutators = mutators.filter(func(id): return db.mutators.has(str(id)))


## Pre-level hero weapon selection. Unknown ids fall back to "rifle" so a
## stale save value can never brick load_level/park_hero. Game.ts:895.
func set_hero_loadout(def_id: String) -> void:
	hero_def_id = def_id if db.heroes.has(def_id) else "rifle"


func set_hero_move(dx: float, dy: float) -> void:
	if absf(dx) < 0.001 and absf(dy) < 0.001:
		hero_move = Vector2.ZERO
	else:
		hero_move = Vector2(dx, dy).normalized()


func start_night() -> void:
	if phase != "day":
		return
	var waves: Array = level.get("waves", [])
	if wave_index >= waves.size():
		return
	phase = "night"
	# Site selection is a day-phase concept; a selected building deliberately
	# survives so its HP stays watchable through the wave (Game.ts:924-925).
	selected_site_id = ""
	wave_elapsed = 0.0
	enemies.clear()
	projectiles.clear()
	pending_spawns.clear()

	# Per-day undo/sell ledger only covers today's spend — clear it as the
	# day ends (Game.ts:934-940).
	for b in buildings:
		b["spent_today"] = 0.0
		b["levels_today"] = 0
		b["built_today"] = false
	var wave: Dictionary = waves[wave_index]
	var spawn_ids: Array = []
	for sp in level.get("spawns", []):
		spawn_ids.append(str(sp.get("id", "")))
	var cursor := 0
	for entry in wave.get("entries", []):
		var enemy_id := str(entry.get("enemyId", "raider"))
		var count := int(entry.get("count", 1))
		var delay := float(entry.get("delay", 0))
		var interval := float(entry.get("interval", 1.0))
		var sid := str(entry.get("spawnId", ""))
		if sid == "" and spawn_ids.size() > 0:
			sid = str(spawn_ids[cursor % spawn_ids.size()])
			cursor += 1
		for i in count:
			pending_spawns.append({
				"enemy_id": enemy_id,
				"spawn_id": sid,
				"at": delay + interval * float(i),
			})
	phase_changed.emit(phase)


func update(dt: float) -> void:
	_time_ms += dt * 1000.0
	_tick_float_texts(dt)
	_tick_particles(dt)
	for b in buildings:
		if float(b.get("muzzle_flash", 0)) > 0.0:
			b["muzzle_flash"] = maxf(0.0, float(b["muzzle_flash"]) - dt)

	if phase == "day":
		_update_hero(dt)
		return
	if phase != "night":
		return

	wave_elapsed += dt
	_spawn_pending()
	_update_enemies(dt)
	_update_units(dt)
	_resolve_combat(dt)
	_update_projectiles(dt)
	_update_hero(dt)
	_check_end_conditions()


func total_waves() -> int:
	return (level.get("waves", []) as Array).size()


## Day: next wave composition by spawn. Night: remaining pending spawns.
## Used by world_draw spawn threat markers (Renderer.drawSpawns).
func upcoming_spawn_info() -> Dictionary:
	var counts: Dictionary = {}
	if phase == "day":
		var waves: Array = level.get("waves", [])
		if wave_index < waves.size():
			var wave: Dictionary = waves[wave_index]
			var spawn_ids: Array = []
			for sp in level.get("spawns", []):
				spawn_ids.append(str(sp.get("id", "")))
			var cursor := 0
			for entry in wave.get("entries", []):
				var sid := str(entry.get("spawnId", ""))
				if sid == "" and spawn_ids.size() > 0:
					sid = str(spawn_ids[cursor % spawn_ids.size()])
					cursor += 1
				counts[sid] = int(counts.get(sid, 0)) + int(entry.get("count", 0))
	elif phase == "night":
		for p in pending_spawns:
			var sid := str(p["spawn_id"])
			counts[sid] = int(counts.get(sid, 0)) + 1
	return {"ids": counts.keys(), "counts": counts}


## Pre-buy range ghost at the selected empty site (first option with range).
func range_preview() -> Dictionary:
	if phase != "day" or selected_site_id == "":
		return {}
	var site := _find_site(selected_site_id)
	if site.is_empty() or str(site["building_id"]) != "":
		return {}
	var opts: Array = site["options"]
	if opts.is_empty():
		return {}
	var def := db.get_building(str(opts[0]))
	var stats := scaled_stats(def, 1, "", global_stat_mods)
	var rng := float(stats.get("range", 0))
	if rng <= 0.0:
		return {}
	return {"x": float(site["x"]), "y": float(site["y"]), "range": rng}


func _park_hero() -> void:
	var hdef := db.get_hero(hero_def_id)
	var hq := _find_building(hq_id)
	var hx := float(hq.get("x", 780)) if not hq.is_empty() else 780.0
	var hy := float(hq.get("y", 430)) if not hq.is_empty() else 430.0
	hero = {
		"def_id": hero_def_id,
		"x": hx,
		"y": hy,
		"hp": float(hdef.get("maxHp", 200)),
		"max_hp": float(hdef.get("maxHp", 200)),
		"alive": true,
		"cooldown": 0.0,
		"dir": 2,
		"facing": 1,
		"attack_anim": 0.0,
		"moving": false,
	}


func _spawn_pending() -> void:
	var remaining: Array = []
	for p in pending_spawns:
		if float(p["at"]) <= wave_elapsed:
			_spawn_enemy(str(p["enemy_id"]), str(p["spawn_id"]))
		else:
			remaining.append(p)
	pending_spawns = remaining


func _spawn_enemy(enemy_id: String, spawn_id: String) -> void:
	var def := db.get_enemy(enemy_id)
	var path: Array = _path_for(spawn_id)
	if path.is_empty():
		return
	var start: Dictionary = path[0]
	# Hardened Foe seam (enemyMods.maxHp) — merged once at load_level, never
	# per tick. Game.ts:1000-1002.
	var max_hp: float = round(float(def.get("maxHp", 40)) * enemy_hp_mul)
	enemies.append({
		"id": _uid("en"),
		"def_id": enemy_id,
		"hp": max_hp,
		"max_hp": max_hp,
		"x": float(start.get("x", 0)),
		"y": float(start.get("y", 0)),
		"path": path,
		"path_index": 0,
		"slow_timer": 0.0,
		"hit_timer": 0.0,
		"attack_cooldown": 0.0,
	})


func _path_for(spawn_id: String) -> Array:
	var paths: Dictionary = level.get("paths", {})
	var raw = paths.get(spawn_id, [])
	if raw is Array:
		return (raw as Array).duplicate(true)
	# Fall back to first path
	for k in paths.keys():
		return (paths[k] as Array).duplicate(true)
	return []


func _update_enemies(dt: float) -> void:
	var hq := _find_building(hq_id)
	var contact_pad := float(db.tuning.get("enemies", {}).get("hqContactPadPx", 48))
	var wp_arrive := float(db.tuning.get("enemies", {}).get("waypointArrivalPx", 8))
	var slow_mul := float(db.tuning.get("enemies", {}).get("slowMultiplier", 0.5))

	for e in enemies:
		if float(e["hp"]) <= 0.0:
			continue
		if float(e.get("hit_timer", 0)) > 0.0:
			e["hit_timer"] = maxf(0.0, float(e["hit_timer"]) - dt)
		if float(e.get("slow_timer", 0)) > 0.0:
			e["slow_timer"] = maxf(0.0, float(e["slow_timer"]) - dt)

		var def := db.get_enemy(str(e["def_id"]))
		var speed := float(def.get("speed", 40))
		if float(e.get("slow_timer", 0)) > 0.0:
			speed *= slow_mul

		# Melee chew on buildings / HQ when in range
		var attack_range := float(def.get("attackRange", 0))
		var radius := float(def.get("radius", 8))
		var engaged := false
		if attack_range <= 0.0:
			# Contact: blockers (units/hero) before buildings (D6).
			var blocker := _nearest_living_blocker(Vector2(e["x"], e["y"]), radius, 4.0)
			if not blocker.is_empty():
				engaged = true
				e["attack_cooldown"] = float(e.get("attack_cooldown", 0)) - dt
				if float(e["attack_cooldown"]) <= 0.0:
					var rate := float(def.get("attackRate", 1.0))
					e["attack_cooldown"] = 1.0 / maxf(0.1, rate)
					if blocker.get("is_hero", false):
						_hurt_hero(float(def.get("damage", 5)))
					else:
						_hurt_unit(blocker, float(def.get("damage", 5)))
			else:
				var target_b := _nearest_building_in_range(Vector2(e["x"], e["y"]), radius + 12.0)
				if not target_b.is_empty():
					engaged = true
					e["attack_cooldown"] = float(e.get("attack_cooldown", 0)) - dt
					if float(e["attack_cooldown"]) <= 0.0:
						var rateb := float(def.get("attackRate", 1.0))
						e["attack_cooldown"] = 1.0 / maxf(0.1, rateb)
						_hurt_building(target_b, float(def.get("damage", 5)))
		else:
			# Standoff: contact blocker first, else fire at nearest building/HQ.
			var contact := _nearest_living_blocker(Vector2(e["x"], e["y"]), radius, 6.0)
			if not contact.is_empty() and str(def.get("archetype", "")) != "flyer":
				engaged = true
				e["attack_cooldown"] = float(e.get("attack_cooldown", 0)) - dt
				if float(e["attack_cooldown"]) <= 0.0:
					var ratec := float(def.get("attackRate", 1.0))
					e["attack_cooldown"] = 1.0 / maxf(0.1, ratec)
					projectiles.append({
						"x": float(e["x"]),
						"y": float(e["y"]),
						"tx": float(contact["x"]),
						"ty": float(contact["y"]),
						"damage": float(def.get("damage", 8)),
						"speed": float(db.tuning.get("combat", {}).get("enemyProjectileSpeed", 180)),
						"color": Color.html(str(def.get("accent", "#ff8a65"))),
						"alive": true,
						"faction": "enemy",
						"target_building_id": "",
						"target_unit_id": "" if contact.get("is_hero", false) else str(contact["id"]),
						"target_hero": contact.get("is_hero", false),
						"style": "bolt",
					})
			elif not hq.is_empty():
				var d := Vector2(e["x"], e["y"]).distance_to(Vector2(hq["x"], hq["y"]))
				if d < attack_range:
					engaged = true
					e["attack_cooldown"] = float(e.get("attack_cooldown", 0)) - dt
					if float(e["attack_cooldown"]) <= 0.0:
						var rate2 := float(def.get("attackRate", 1.0))
						e["attack_cooldown"] = 1.0 / maxf(0.1, rate2)
						projectiles.append({
							"x": float(e["x"]),
							"y": float(e["y"]),
							"tx": float(hq["x"]),
							"ty": float(hq["y"]),
							"damage": float(def.get("damage", 8)),
							"speed": float(db.tuning.get("combat", {}).get("enemyProjectileSpeed", 180)),
							"color": Color.html(str(def.get("accent", "#ff8a65"))),
							"alive": true,
							"faction": "enemy",
							"target_building_id": str(hq["id"]),
							"style": "bolt",
						})

		if engaged:
			continue

		# Follow path toward HQ
		var path: Array = e["path"]
		var pi := int(e["path_index"])
		if pi >= path.size():
			# Hold near HQ
			if not hq.is_empty():
				var to_hq := Vector2(hq["x"], hq["y"]) - Vector2(e["x"], e["y"])
				var stop_r := float(def.get("radius", 8)) + contact_pad
				if to_hq.length() > stop_r:
					var step := to_hq.normalized() * speed * dt
					e["x"] = float(e["x"]) + step.x
					e["y"] = float(e["y"]) + step.y
			continue
		var wp: Dictionary = path[pi]
		var target := Vector2(float(wp.get("x", 0)), float(wp.get("y", 0)))
		var pos := Vector2(float(e["x"]), float(e["y"]))
		var delta := target - pos
		if delta.length() <= wp_arrive:
			e["path_index"] = pi + 1
		else:
			var step2 := delta.normalized() * speed * dt
			e["x"] = pos.x + step2.x
			e["y"] = pos.y + step2.y


func _resolve_combat(dt: float) -> void:
	var splash_falloff := float(db.tuning.get("combat", {}).get("splashFalloff", 0.55))
	for b in buildings:
		if float(b["hp"]) <= 0.0:
			continue
		var def := db.get_building(str(b["def_id"]))
		# Base-def cheap skip before paying for scaled_stats (Game.ts:1432);
		# scaling never turns a zero base into a nonzero one.
		if float(def.get("damage", 0)) <= 0.0 or float(def.get("fireRate", 0)) <= 0.0:
			continue
		var stats := scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")), global_stat_mods)
		var range_px: float = stats["range"]
		var fr: float = stats["fireRate"]
		var dmg: float = stats["damage"]
		var splash_radius: float = stats["splashRadius"]
		var targets := str(def.get("targets", "all"))
		b["cooldown"] = float(b.get("cooldown", 0)) - dt
		var target := _find_enemy_target(Vector2(b["x"], b["y"]), range_px, targets)
		if not target.is_empty():
			b["aim_angle"] = Vector2(float(target["x"]) - float(b["x"]), float(target["y"]) - float(b["y"])).angle()
		if float(b["cooldown"]) > 0.0:
			continue
		if target.is_empty():
			continue
		b["cooldown"] = 1.0 / fr
		b["muzzle_flash"] = 0.1
		b["aim_angle"] = Vector2(float(target["x"]) - float(b["x"]), float(target["y"]) - float(b["y"])).angle()
		var use_proj := str(b["def_id"]) in ["artillery_platform", "missile_battery"]
		var style := "missile" if str(b["def_id"]) == "missile_battery" else ("shell" if use_proj else "bullet")
		if use_proj:
			var spd := 320.0 if str(b["def_id"]) == "missile_battery" else 260.0
			projectiles.append({
				"x": float(b["x"]),
				"y": float(b["y"]),
				"tx": float(target["x"]),
				"ty": float(target["y"]),
				"damage": dmg,
				"splash": splash_radius,
				"speed": spd,
				"color": Color.html(str(def.get("accent", "#fff"))),
				"alive": true,
				"faction": "player",
				"target_id": str(target["id"]),
				"targets": targets,
				"style": style,
			})
		else:
			_hurt_enemy(target, dmg)
			if splash_radius > 0.0:
				_splash(Vector2(target["x"], target["y"]), dmg * splash_falloff, splash_radius, str(target["id"]), targets)
			_burst(
				(float(b["x"]) + float(target["x"])) * 0.5,
				(float(b["y"]) + float(target["y"])) * 0.5,
				Color.html(str(def.get("accent", "#fff"))),
				2.0,
				0.08,
			)


func _update_projectiles(dt: float) -> void:
	for p in projectiles:
		if not p.get("alive", true):
			continue
		var pos := Vector2(float(p["x"]), float(p["y"]))
		var tgt := Vector2(float(p["tx"]), float(p["ty"]))
		if p.get("faction", "") == "player" and p.get("target_id", "") != "":
			var en := _find_enemy(str(p["target_id"]))
			if not en.is_empty() and float(en["hp"]) > 0.0:
				tgt = Vector2(float(en["x"]), float(en["y"]))
				p["tx"] = tgt.x
				p["ty"] = tgt.y
		if p.get("target_unit_id", "") != "":
			var u := _find_unit(str(p["target_unit_id"]))
			if not u.is_empty() and float(u["hp"]) > 0.0:
				tgt = Vector2(float(u["x"]), float(u["y"]))
				p["tx"] = tgt.x
				p["ty"] = tgt.y
		elif p.get("target_hero", false) and hero.get("alive", false):
			tgt = Vector2(float(hero["x"]), float(hero["y"]))
			p["tx"] = tgt.x
			p["ty"] = tgt.y
		var delta := tgt - pos
		var step := float(p.get("speed", 200)) * dt
		if delta.length() <= step or delta.length() < 4.0:
			p["alive"] = false
			if p.get("faction", "") == "enemy":
				if p.get("target_hero", false):
					_hurt_hero(float(p["damage"]))
				elif p.get("target_unit_id", "") != "":
					var uu := _find_unit(str(p["target_unit_id"]))
					if not uu.is_empty():
						_hurt_unit(uu, float(p["damage"]))
				else:
					var b := _find_building(str(p.get("target_building_id", "")))
					if not b.is_empty() and float(b["hp"]) > 0.0:
						_hurt_building(b, float(p["damage"]))
			else:
				var hit := _find_enemy(str(p.get("target_id", "")))
				if hit.is_empty() or float(hit["hp"]) <= 0.0:
					hit = _find_enemy_target(tgt, 24.0, str(p.get("targets", "all")))
				if not hit.is_empty():
					_hurt_enemy(hit, float(p["damage"]))
					if float(p.get("splash", 0)) > 0.0:
						var falloff := float(db.tuning.get("combat", {}).get("splashFalloff", 0.55))
						_splash(tgt, float(p["damage"]) * falloff, float(p["splash"]), str(hit["id"]), str(p.get("targets", "all")))
			_burst(tgt.x, tgt.y, p.get("color", Color.WHITE), 3.0, 0.12)
		else:
			var move := delta.normalized() * step
			p["x"] = pos.x + move.x
			p["y"] = pos.y + move.y
	projectiles = projectiles.filter(func(pr): return pr.get("alive", false))


func _update_hero(dt: float) -> void:
	if hero.is_empty() or not hero.get("alive", false):
		return
	var hdef := db.get_hero(str(hero["def_id"]))
	var speed := float(hdef.get("moveSpeed", 90))
	hero["moving"] = hero_move.length_squared() > 0.0
	if float(hero.get("attack_anim", 0)) > 0.0:
		hero["attack_anim"] = maxf(0.0, float(hero["attack_anim"]) - dt)
	if hero["moving"]:
		hero["x"] = clampf(float(hero["x"]) + hero_move.x * speed * dt, 16.0, WORLD_W - 16.0)
		hero["y"] = clampf(float(hero["y"]) + hero_move.y * speed * dt, 16.0, WORLD_H - 16.0)
		hero["dir"] = _octant(hero_move)
		if hero_move.x > 0.0:
			hero["facing"] = 1
		elif hero_move.x < 0.0:
			hero["facing"] = -1
	if phase != "night":
		return
	hero["cooldown"] = float(hero.get("cooldown", 0)) - dt
	if float(hero["cooldown"]) > 0.0:
		return
	var range_px := float(hdef.get("range", 100))
	var targets := str(hdef.get("targets", "ground"))
	var target := _find_enemy_target(Vector2(hero["x"], hero["y"]), range_px, targets)
	if target.is_empty():
		return
	var fr := maxf(0.25, float(hdef.get("fireRate", 1.5)))
	hero["cooldown"] = 1.0 / fr
	hero["attack_anim"] = minf(0.28, 0.55 / fr)
	hero["facing"] = 1 if float(target["x"]) >= float(hero["x"]) else -1
	_hurt_enemy(target, float(hdef.get("damage", 12)))
	_burst(
		(float(hero["x"]) + float(target["x"])) * 0.5,
		(float(hero["y"]) + float(target["y"])) * 0.5,
		Color.html(str(hdef.get("accent", "#ffca28"))),
		2.5,
		0.1,
	)
	if float(hdef.get("splashRadius", 0)) > 0.0:
		var falloff := float(db.tuning.get("combat", {}).get("splashFalloff", 0.55))
		_splash(Vector2(target["x"], target["y"]), float(hdef.get("damage", 12)) * falloff, float(hdef.get("splashRadius", 0)), str(target["id"]), targets)


func _check_end_conditions() -> void:
	var hq := _find_building(hq_id)
	# HQ death first (CD-54)
	if hq.is_empty() or float(hq.get("hp", 0)) <= 0.0:
		phase = "defeat"
		phase_changed.emit(phase)
		return
	var any_alive := false
	for e in enemies:
		if float(e["hp"]) > 0.0:
			any_alive = true
			break
	if any_alive or pending_spawns.size() > 0:
		return
	# Wave clear
	var bonus := 0
	var waves: Array = level.get("waves", [])
	if wave_index < waves.size():
		bonus = int(waves[wave_index].get("clearBonus", 0))
	money += bonus
	_float(float(hq["x"]), float(hq["y"]) - 40.0, "+%d₡ clear" % bonus, Color(0.4, 0.9, 0.5))
	wave_index += 1
	# Dawn restore
	_dawn_restore()
	money_changed.emit(int(money))
	if wave_index >= waves.size():
		phase = "victory"
		phase_changed.emit(phase)
	else:
		phase = "day"
		phase_changed.emit(phase)


func _dawn_restore() -> void:
	for b in buildings:
		if float(b["hp"]) > 0.0:
			b["hp"] = float(b["max_hp"])
	# Income
	for b in buildings:
		if float(b["hp"]) <= 0.0:
			continue
		var def := db.get_building(str(b["def_id"]))
		# Income is never touched by a global pick (D8, Game.ts:1051 omits
		# mods on purpose) — scaled_stats still applies level scaling.
		var stats := scaled_stats(def, int(b["level"]), str(b.get("branch_id", "")))
		var income: float = stats["incomePerDay"]
		if income <= 0.0:
			continue
		var nodes := 1.0
		if def.has("mining"):
			var site := _find_site(str(b["site_id"]))
			if not site.is_empty():
				var res: Dictionary = site.get("resources", {})
				var kind := str(def["mining"].get("resource", "mineral"))
				nodes = float(res.get(kind, 0))
		var pay := int(round(income * nodes))
		if pay > 0:
			money += pay
			_float(float(b["x"]), float(b["y"]) - 24.0, "+%d₡" % pay, Color(1, 0.84, 0.33))
	# Revive hero at dawn if dead; heal survivors; respawn free garrisons.
	if not hero.get("alive", false):
		_park_hero()
	else:
		hero["hp"] = float(hero["max_hp"])
	for b in buildings:
		if float(b["hp"]) > 0.0:
			sync_squad(b)


func _hurt_enemy(e: Dictionary, raw: float) -> void:
	var floor_dmg := float(db.tuning.get("combat", {}).get("minDamageAfterArmor", 1))
	var armor := float(db.get_enemy(str(e["def_id"])).get("armor", 0))
	var dmg := maxf(floor_dmg, raw - armor)
	e["hp"] = float(e["hp"]) - dmg
	e["hit_timer"] = 0.09
	if float(e["hp"]) <= 0.0:
		e["hp"] = 0.0
		var reward := int(db.get_enemy(str(e["def_id"])).get("reward", 0))
		if reward > 0:
			money += reward
			_float(float(e["x"]), float(e["y"]) - 10.0, "+%d" % reward, Color(1, 0.84, 0.33))
			money_changed.emit(int(money))


func _hurt_building(b: Dictionary, dmg: float) -> void:
	b["hp"] = float(b["hp"]) - dmg
	if float(b["hp"]) <= 0.0:
		b["hp"] = 0.0
		if not b.get("is_hq", false):
			_destroy_building(b)


func _destroy_building(b: Dictionary) -> void:
	var site := _find_site(str(b["site_id"]))
	if not site.is_empty():
		site["building_id"] = ""
	var bid := str(b["id"])
	units = units.filter(func(u): return str(u["building_id"]) != bid)
	wrecks.append({
		"x": float(b["x"]),
		"y": float(b["y"]),
		"def_id": str(b["def_id"]),
	})
	buildings = buildings.filter(func(x): return str(x["id"]) != bid)
	if selected_building_id == bid:
		selected_building_id = ""
	_float(float(b["x"]), float(b["y"]), "Destroyed!", Color(0.94, 0.33, 0.31))
	_burst(float(b["x"]), float(b["y"]), Color(0.9, 0.4, 0.3), 4.0, 0.25)


func _splash(at: Vector2, dmg: float, radius: float, exclude_id: String, targets: String) -> void:
	for e in enemies:
		if str(e["id"]) == exclude_id or float(e["hp"]) <= 0.0:
			continue
		if not _target_ok(e, targets):
			continue
		if at.distance_to(Vector2(e["x"], e["y"])) <= radius:
			_hurt_enemy(e, dmg)


func _find_enemy_target(origin: Vector2, range_px: float, targets: String) -> Dictionary:
	var best: Dictionary = {}
	var best_d := range_px
	for e in enemies:
		if float(e["hp"]) <= 0.0:
			continue
		if not _target_ok(e, targets):
			continue
		var d := origin.distance_to(Vector2(e["x"], e["y"]))
		if d <= best_d:
			best_d = d
			best = e
	return best


func _target_ok(e: Dictionary, targets: String) -> bool:
	var arch := str(db.get_enemy(str(e["def_id"])).get("archetype", "ground"))
	var is_flyer := arch == "flyer"
	if targets == "ground" and is_flyer:
		return false
	if targets == "air" and not is_flyer:
		return false
	return true


func _nearest_building_in_range(origin: Vector2, range_px: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d := range_px
	for b in buildings:
		if float(b["hp"]) <= 0.0:
			continue
		var d := origin.distance_to(Vector2(b["x"], b["y"]))
		if d < best_d:
			best_d = d
			best = b
	return best


func _derive_resources(x: float, y: float) -> Dictionary:
	var mineral := 0
	var plasma := 0
	for o in level.get("obstacles", []):
		var kind := str(o.get("kind", ""))
		var ox := float(o.get("x", 0))
		var oy := float(o.get("y", 0))
		var d := Vector2(x, y).distance_to(Vector2(ox, oy))
		if d <= 95.0:
			if kind == "crystal":
				mineral += int(o.get("nodes", 1))
			elif kind == "plasma":
				plasma += 1
	return {"mineral": mineral, "plasma": plasma}


func _find_site(id: String) -> Dictionary:
	for s in sites:
		if str(s["id"]) == id:
			return s
	return {}


func _find_building(id: String) -> Dictionary:
	for b in buildings:
		if str(b["id"]) == id:
			return b
	return {}


func _find_enemy(id: String) -> Dictionary:
	for e in enemies:
		if str(e["id"]) == id:
			return e
	return {}


func _float(x: float, y: float, text: String, color: Color) -> void:
	floating_texts.append({
		"x": x, "y": y, "text": text, "color": color,
		"life": 0.9, "max_life": 0.9,
	})


func _tick_float_texts(dt: float) -> void:
	for ft in floating_texts:
		ft["life"] = float(ft["life"]) - dt
		ft["y"] = float(ft["y"]) - 18.0 * dt
	floating_texts = floating_texts.filter(func(ft): return float(ft["life"]) > 0.0)


func _tick_particles(dt: float) -> void:
	for p in particles:
		p["life"] = float(p["life"]) - dt
	particles = particles.filter(func(p): return float(p["life"]) > 0.0)


func _uid(prefix: String) -> String:
	_uid_counter += 1
	return "%s_%d" % [prefix, _uid_counter]


func _octant(v: Vector2) -> int:
	# 0=E … 7=NE, screen-y down
	var a := atan2(v.y, v.x)
	var step := PI / 4.0
	var i := int(round(a / step))
	return posmod(i, 8)


func _burst(x: float, y: float, color: Color, size: float = 2.0, life: float = 0.1) -> void:
	particles.append({
		"x": x, "y": y, "vx": 0.0, "vy": 0.0,
		"life": life, "max_life": life, "color": color, "size": size,
	})


# -- garrisons (Game.ts syncSquad / updateUnits) ------------------------------

func squad_spec_for(building: Dictionary) -> Dictionary:
	var def := db.get_building(str(building["def_id"]))
	var bid := str(building.get("branch_id", ""))
	if bid != "" and def.has("branch"):
		for o in (def["branch"].get("options", []) as Array):
			if str(o.get("id", "")) == bid and o.has("squad"):
				return o["squad"]
	if def.has("squad"):
		return def["squad"]
	return {}


func sync_squad(building: Dictionary) -> void:
	var spec := squad_spec_for(building)
	var bid := str(building["id"])
	var current: Array = units.filter(func(u): return str(u["building_id"]) == bid)
	if spec.is_empty():
		if current.size() > 0:
			units = units.filter(func(u): return str(u["building_id"]) != bid)
		return
	var unit_id := str(spec.get("unitId", ""))
	var counts: Array = spec.get("countByLevel", [])
	var idx := clampi(int(building["level"]) - 1, 0, maxi(0, counts.size() - 1))
	var count := int(counts[idx]) if counts.size() > 0 else 0
	# Branch can swap unit type — full replace
	if current.any(func(u): return str(u["unit_def_id"]) != unit_id):
		units = units.filter(func(u): return str(u["building_id"]) != bid)
		current = []
	if current.size() > count:
		current.sort_custom(func(a, b): return int(a["slot"]) > int(b["slot"]))
		var excess: Array = current.slice(0, current.size() - count)
		var remove_ids: Dictionary = {}
		for u in excess:
			remove_ids[str(u["id"])] = true
		units = units.filter(func(u): return not remove_ids.has(str(u["id"])))
		current = units.filter(func(u): return str(u["building_id"]) == bid)
	if current.size() < count and unit_id != "" and db.units.has(unit_id):
		var udef := db.get_unit(unit_id)
		var max_hp := float(udef.get("maxHp", 50))
		# Apply global maxHp mod if any
		if global_stat_mods.has("maxHp"):
			max_hp = round(max_hp * float(global_stat_mods["maxHp"]))
		var used: Dictionary = {}
		for u in current:
			used[int(u["slot"])] = true
		for slot in count:
			if used.has(slot):
				continue
			if current.size() >= count:
				break
			var angle := (float(slot) / float(maxi(count, 1))) * TAU
			var nu := {
				"id": _uid("unit"),
				"unit_def_id": unit_id,
				"building_id": bid,
				"x": float(building["x"]) + cos(angle) * 22.0,
				"y": float(building["y"]) + sin(angle) * 22.0,
				"slot": slot,
				"hp": max_hp,
				"max_hp": max_hp,
				"cooldown": 0.0,
				"hit_timer": 0.0,
			}
			units.append(nu)
			current.append(nu)


func _update_units(dt: float) -> void:
	for u in units:
		if float(u["hp"]) <= 0.0:
			continue
		if float(u.get("hit_timer", 0)) > 0.0:
			u["hit_timer"] = maxf(0.0, float(u["hit_timer"]) - dt)
		var building := _find_building(str(u["building_id"]))
		if building.is_empty() or float(building["hp"]) <= 0.0:
			continue
		var udef := db.get_unit(str(u["unit_def_id"]))
		var leash := float(udef.get("leash", 60))
		var range_px := float(udef.get("range", 90))
		var move_spd := float(udef.get("moveSpeed", 55))
		var targets := str(udef.get("targets", "all"))
		u["cooldown"] = float(u.get("cooldown", 0)) - dt
		var home := _unit_home(u, building)
		var enemy := _find_enemy_target(Vector2(building["x"], building["y"]), leash + range_px, targets)
		if not enemy.is_empty():
			var d := Vector2(u["x"], u["y"]).distance_to(Vector2(enemy["x"], enemy["y"]))
			if d <= range_px:
				if float(u["cooldown"]) <= 0.0:
					var fr := float(udef.get("fireRate", 2.0))
					if global_stat_mods.has("fireRate"):
						fr *= float(global_stat_mods["fireRate"])
					u["cooldown"] = 1.0 / maxf(0.1, fr)
					var dmg := float(udef.get("damage", 4))
					if global_stat_mods.has("damage"):
						dmg *= float(global_stat_mods["damage"])
					var splash := float(udef.get("splashRadius", 0))
					if splash > 0.0:
						_hurt_enemy(enemy, dmg)
						_splash(Vector2(enemy["x"], enemy["y"]), dmg * 0.55, splash, str(enemy["id"]), targets)
					else:
						_hurt_enemy(enemy, dmg)
					if float(udef.get("slowSeconds", 0)) > 0.0:
						enemy["slow_timer"] = float(udef["slowSeconds"])
					_burst((float(u["x"]) + float(enemy["x"])) * 0.5, (float(u["y"]) + float(enemy["y"])) * 0.5, Color.html(str(udef.get("accent", "#90caf9"))), 2.0, 0.08)
			else:
				# Step toward enemy, leash-clamped
				_step_unit_toward(u, float(enemy["x"]), float(enemy["y"]), move_spd * dt, float(building["x"]), float(building["y"]), leash)
		else:
			# Return home
			_step_unit_toward(u, home.x, home.y, move_spd * dt, float(building["x"]), float(building["y"]), leash)


func _unit_home(u: Dictionary, building: Dictionary) -> Vector2:
	var spec := squad_spec_for(building)
	var count := 1
	if not spec.is_empty():
		var counts: Array = spec.get("countByLevel", [])
		var idx := clampi(int(building["level"]) - 1, 0, maxi(0, counts.size() - 1))
		count = maxi(1, int(counts[idx]) if counts.size() > 0 else 1)
	var angle := (float(u["slot"]) / float(count)) * TAU
	return Vector2(float(building["x"]) + cos(angle) * 22.0, float(building["y"]) + sin(angle) * 22.0)


func _step_unit_toward(u: Dictionary, tx: float, ty: float, step_dist: float, ax: float, ay: float, leash: float) -> void:
	var pos := Vector2(float(u["x"]), float(u["y"]))
	var delta := Vector2(tx, ty) - pos
	if delta.length() > 0.5:
		var step := minf(step_dist, delta.length())
		pos += delta.normalized() * step
	var from_anchor := pos - Vector2(ax, ay)
	if from_anchor.length() > leash:
		pos = Vector2(ax, ay) + from_anchor.normalized() * leash
	u["x"] = pos.x
	u["y"] = pos.y


func _nearest_living_blocker(origin: Vector2, enemy_radius: float, pad: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for u in units:
		if float(u["hp"]) <= 0.0:
			continue
		var udef := db.get_unit(str(u["unit_def_id"]))
		var contact := enemy_radius + float(udef.get("radius", 6)) + pad
		var d := origin.distance_to(Vector2(u["x"], u["y"]))
		if d <= contact and d < best_d:
			best_d = d
			best = u.duplicate()
			best["is_hero"] = false
	if hero.get("alive", false):
		var hdef := db.get_hero(str(hero["def_id"]))
		var contact_h := enemy_radius + float(hdef.get("radius", 8)) + pad
		var dh := origin.distance_to(Vector2(hero["x"], hero["y"]))
		if dh <= contact_h and dh < best_d:
			best = {
				"id": "hero",
				"x": float(hero["x"]),
				"y": float(hero["y"]),
				"is_hero": true,
			}
	return best


func _hurt_unit(u: Dictionary, raw: float) -> void:
	# Find live unit in array (blocker may be a duplicate)
	var live := _find_unit(str(u["id"]))
	if live.is_empty():
		return
	live["hp"] = float(live["hp"]) - raw
	live["hit_timer"] = float(db.tuning.get("combat", {}).get("hitFlashSeconds", 0.09))
	if float(live["hp"]) <= 0.0:
		live["hp"] = 0.0


func _hurt_hero(raw: float) -> void:
	if not hero.get("alive", false):
		return
	hero["hp"] = float(hero["hp"]) - raw
	if float(hero["hp"]) <= 0.0:
		hero["hp"] = 0.0
		hero["alive"] = false
		_float(float(hero["x"]), float(hero["y"]) - 16.0, "Down!", Color(0.94, 0.33, 0.31))


func _find_unit(id: String) -> Dictionary:
	for u in units:
		if str(u["id"]) == id:
			return u
	return {}
