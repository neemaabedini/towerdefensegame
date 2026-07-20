extends RefCounted
class_name GameSim
## Core day/night sim port of src/game/Game.ts (vertical slice).
## Same data contract; subset of features for the Godot port:
## day build, night waves, path-following enemies, tower combat,
## hero WASD + auto-attack, dawn income, victory/defeat.
## Not yet: garrisons AI full parity, abilities, perks/mutators UI, sell/undo.

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
var enemies: Array = []
var projectiles: Array = []
var particles: Array = []
var floating_texts: Array = []
var pending_spawns: Array = []
var wrecks: Array = []

var selected_site_id: String = ""
var hq_id: String = ""
var hero: Dictionary = {}
var hero_move: Vector2 = Vector2.ZERO
var hero_def_id: String = "rifle"

var _uid_counter: int = 0
var _sell_lockout_ms: float = 0.0
var _time_ms: float = 0.0


func _init(data: DataDB) -> void:
	db = data


func load_level(index: int) -> void:
	level_index = index
	level = db.get_level(index).duplicate(true)
	phase = "day"
	wave_index = 0
	wave_elapsed = 0.0
	money = float(level.get("startingMoney", 300))
	enemies.clear()
	projectiles.clear()
	particles.clear()
	floating_texts.clear()
	pending_spawns.clear()
	wrecks.clear()
	selected_site_id = ""
	hero_move = Vector2.ZERO
	_uid_counter = 0

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

	buildings.clear()
	var hq_def: Dictionary = db.get_building("command_center")
	var hq_pos: Dictionary = level.get("hq", {"x": 780, "y": 430})
	hq_id = _uid("hq")
	buildings.append({
		"id": hq_id,
		"site_id": "__hq__",
		"def_id": "command_center",
		"level": 1,
		"branch_id": "",
		"hp": float(hq_def.get("maxHp", 500)),
		"max_hp": float(hq_def.get("maxHp", 500)),
		"x": float(hq_pos.get("x", 780)),
		"y": float(hq_pos.get("y", 430)),
		"cooldown": 0.0,
		"is_hq": true,
		"invested": 0.0,
		"aim_angle": -PI / 4.0,
		"muzzle_flash": 0.0,
	})
	_park_hero()
	phase_changed.emit(phase)
	money_changed.emit(int(money))


func restart() -> void:
	load_level(level_index)


func select_at(world: Vector2) -> void:
	if phase != "day":
		return
	var best_id := ""
	var best_d := 36.0
	for s in sites:
		if str(s["building_id"]) != "":
			continue
		var d := world.distance_to(Vector2(s["x"], s["y"]))
		if d < best_d:
			best_d = d
			best_id = str(s["id"])
	selected_site_id = best_id


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
	var max_hp := float(def.get("maxHp", 100))
	buildings.append({
		"id": id,
		"site_id": site_id,
		"def_id": def_id,
		"level": 1,
		"branch_id": "",
		"hp": max_hp,
		"max_hp": max_hp,
		"x": float(site["x"]),
		"y": float(site["y"]),
		"cooldown": 0.0,
		"is_hq": false,
		"invested": cost,
		"aim_angle": -PI / 4.0,
		"muzzle_flash": 0.0,
	})
	site["building_id"] = id
	selected_site_id = ""
	_float(float(site["x"]), float(site["y"]) - 28.0, "-%d₡" % int(cost), Color(1, 0.84, 0.33))
	built.emit(site_id, def_id)
	money_changed.emit(int(money))
	return true


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
	wave_elapsed = 0.0
	enemies.clear()
	projectiles.clear()
	pending_spawns.clear()
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
	_resolve_combat(dt)
	_update_projectiles(dt)
	_update_hero(dt)
	_check_end_conditions()


func total_waves() -> int:
	return (level.get("waves", []) as Array).size()


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
	enemies.append({
		"id": _uid("en"),
		"def_id": enemy_id,
		"hp": float(def.get("maxHp", 40)),
		"max_hp": float(def.get("maxHp", 40)),
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
			# Contact damage path
			var target_b := _nearest_building_in_range(Vector2(e["x"], e["y"]), radius + 12.0)
			if not target_b.is_empty():
				engaged = true
				e["attack_cooldown"] = float(e.get("attack_cooldown", 0)) - dt
				if float(e["attack_cooldown"]) <= 0.0:
					var rate := float(def.get("attackRate", 1.0))
					e["attack_cooldown"] = 1.0 / maxf(0.1, rate)
					_hurt_building(target_b, float(def.get("damage", 5)))
		else:
			# Standoff projectile (simplified: fire at HQ if in range)
			if not hq.is_empty():
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
	for b in buildings:
		if float(b["hp"]) <= 0.0:
			continue
		var def := db.get_building(str(b["def_id"]))
		var dmg := float(def.get("damage", 0))
		var fr := float(def.get("fireRate", 0))
		if dmg <= 0.0 or fr <= 0.0:
			continue
		var range_px := float(def.get("range", 100))
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
		if use_proj:
			var spd := 320.0 if str(b["def_id"]) == "missile_battery" else 260.0
			projectiles.append({
				"x": float(b["x"]),
				"y": float(b["y"]),
				"tx": float(target["x"]),
				"ty": float(target["y"]),
				"damage": dmg,
				"splash": float(def.get("splashRadius", 0)),
				"speed": spd,
				"color": Color.html(str(def.get("accent", "#fff"))),
				"alive": true,
				"faction": "player",
				"target_id": str(target["id"]),
				"targets": targets,
			})
		else:
			_hurt_enemy(target, dmg)
			if float(def.get("splashRadius", 0)) > 0.0:
				_splash(Vector2(target["x"], target["y"]), dmg * 0.55, float(def.get("splashRadius", 0)), str(target["id"]), targets)


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
		var delta := tgt - pos
		var step := float(p.get("speed", 200)) * dt
		if delta.length() <= step or delta.length() < 4.0:
			p["alive"] = false
			if p.get("faction", "") == "enemy":
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
						_splash(tgt, float(p["damage"]) * 0.55, float(p["splash"]), str(hit["id"]), str(p.get("targets", "all")))
		else:
			var move := delta.normalized() * step
			p["x"] = pos.x + move.x
			p["y"] = pos.y + move.y
	projectiles = projectiles.filter(func(p): return p.get("alive", false))


func _update_hero(dt: float) -> void:
	if hero.is_empty() or not hero.get("alive", false):
		return
	var hdef := db.get_hero(str(hero["def_id"]))
	var speed := float(hdef.get("moveSpeed", 90))
	if hero_move.length_squared() > 0.0:
		hero["x"] = clampf(float(hero["x"]) + hero_move.x * speed * dt, 16.0, WORLD_W - 16.0)
		hero["y"] = clampf(float(hero["y"]) + hero_move.y * speed * dt, 16.0, WORLD_H - 16.0)
		hero["dir"] = _octant(hero_move)
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
	hero["cooldown"] = 1.0 / maxf(0.1, float(hdef.get("fireRate", 1.5)))
	_hurt_enemy(target, float(hdef.get("damage", 12)))
	if float(hdef.get("splashRadius", 0)) > 0.0:
		_splash(Vector2(target["x"], target["y"]), float(hdef.get("damage", 12)) * 0.55, float(hdef.get("splashRadius", 0)), str(target["id"]), targets)


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
		var income := float(def.get("incomePerDay", 0))
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
	# Revive hero at dawn if dead
	if not hero.get("alive", false):
		_park_hero()
	else:
		hero["hp"] = float(hero["max_hp"])


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
	wrecks.append({
		"x": float(b["x"]),
		"y": float(b["y"]),
		"def_id": str(b["def_id"]),
	})
	buildings = buildings.filter(func(x): return str(x["id"]) != str(b["id"]))
	_float(float(b["x"]), float(b["y"]), "Destroyed!", Color(0.94, 0.33, 0.31))


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
