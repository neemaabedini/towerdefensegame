extends Node2D
class_name WorldDraw
## Draws the 960×540 world into a scaled viewport area.

var sim: GameSim
var db: DataDB
var scale_factor: float = 1.0
var offset: Vector2 = Vector2.ZERO
var selected_site_id: String = ""

const WORLD_W := 960.0
const WORLD_H := 540.0


func setup(game: GameSim, data: DataDB) -> void:
	sim = game
	db = data
	queue_redraw()


func world_to_screen(p: Vector2) -> Vector2:
	return offset + p * scale_factor


func screen_to_world(p: Vector2) -> Vector2:
	return (p - offset) / scale_factor


func fit_to_rect(rect: Rect2) -> void:
	var sx := rect.size.x / WORLD_W
	var sy := rect.size.y / WORLD_H
	scale_factor = minf(sx, sy)
	var used := Vector2(WORLD_W, WORLD_H) * scale_factor
	offset = rect.position + (rect.size - used) * 0.5
	queue_redraw()


func _process(_dt: float) -> void:
	queue_redraw()


func _draw() -> void:
	if sim == null or sim.level.is_empty():
		return
	# Ground
	draw_rect(Rect2(offset, Vector2(WORLD_W, WORLD_H) * scale_factor), Color(0.07, 0.11, 0.16))
	# Paths
	var paths: Dictionary = sim.level.get("paths", {})
	for k in paths.keys():
		var pts: Array = paths[k]
		if pts.size() < 2:
			continue
		for i in range(pts.size() - 1):
			var a: Dictionary = pts[i]
			var b: Dictionary = pts[i + 1]
			draw_line(
				world_to_screen(Vector2(a["x"], a["y"])),
				world_to_screen(Vector2(b["x"], b["y"])),
				Color(0.25, 0.32, 0.4, 0.55),
				3.0 * scale_factor,
			)
	# Obstacles
	for o in sim.level.get("obstacles", []):
		var p := world_to_screen(Vector2(o.get("x", 0), o.get("y", 0)))
		var r := float(o.get("r", 16)) * scale_factor
		var kind := str(o.get("kind", "rock"))
		var col := Color(0.35, 0.4, 0.45)
		if kind == "crystal":
			col = Color(0.3, 0.85, 0.9)
		elif kind == "plasma":
			col = Color(0.95, 0.55, 0.2)
		draw_circle(p, r, col)

	# Sites
	for s in sim.sites:
		var p := world_to_screen(Vector2(s["x"], s["y"]))
		var selected := str(s["id"]) == sim.selected_site_id
		var empty := str(s["building_id"]) == ""
		if empty:
			draw_arc(p, 14.0 * scale_factor, 0, TAU, 24, Color(0.3, 0.75, 0.95, 0.85 if selected else 0.45), 2.0)
			if selected:
				draw_circle(p, 4.0 * scale_factor, Color(0.4, 0.85, 1.0))

	# Wrecks
	for w in sim.wrecks:
		var p := world_to_screen(Vector2(w["x"], w["y"]))
		draw_circle(p, 12.0 * scale_factor, Color(0.15, 0.15, 0.18))

	# Buildings
	for b in sim.buildings:
		if float(b["hp"]) <= 0.0 and not b.get("is_hq", false):
			continue
		_draw_building(b)

	# Enemies
	for e in sim.enemies:
		if float(e["hp"]) <= 0.0:
			continue
		_draw_enemy(e)

	# Projectiles
	for p in sim.projectiles:
		if not p.get("alive", true):
			continue
		var pos := world_to_screen(Vector2(p["x"], p["y"]))
		var col: Color = p.get("color", Color.WHITE)
		draw_circle(pos, 3.5 * scale_factor, col)

	# Hero
	if not sim.hero.is_empty() and sim.hero.get("alive", false):
		var hp := world_to_screen(Vector2(sim.hero["x"], sim.hero["y"]))
		draw_circle(hp, 9.0 * scale_factor, Color(1.0, 0.8, 0.2))
		draw_circle(hp, 5.0 * scale_factor, Color(0.15, 0.2, 0.25))
		_draw_hp_bar(hp, 9.0 * scale_factor, float(sim.hero["hp"]), float(sim.hero["max_hp"]))

	# Float text
	for ft in sim.floating_texts:
		var a := clampf(float(ft["life"]) / float(ft["max_life"]), 0.0, 1.0)
		var col: Color = ft["color"]
		col.a = a
		var pos := world_to_screen(Vector2(ft["x"], ft["y"]))
		draw_string(ThemeDB.fallback_font, pos + Vector2(-20, 0), str(ft["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, int(12 * scale_factor), col)

	# Night vignette
	if sim.phase == "night":
		draw_rect(Rect2(offset, Vector2(WORLD_W, WORLD_H) * scale_factor), Color(0.05, 0.02, 0.12, 0.22))


func _draw_building(b: Dictionary) -> void:
	var def := db.get_building(str(b["def_id"]))
	var p := world_to_screen(Vector2(b["x"], b["y"]))
	var s := float(def.get("size", 20)) * scale_factor * 0.55
	var col := Color.html(str(def.get("color", "#546e7a")))
	var accent := Color.html(str(def.get("accent", "#90a4ae")))
	draw_circle(p + Vector2(0, s * 0.3), s * 1.1, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(p - Vector2(s, s * 0.7), Vector2(s * 2, s * 1.4)), col)
	# Aim barrel for combat buildings
	if float(def.get("damage", 0)) > 0.0:
		var ang := float(b.get("aim_angle", -PI / 4.0))
		var tip := p + Vector2(cos(ang), sin(ang)) * s * 1.6
		draw_line(p, tip, Color(0.12, 0.14, 0.16), 3.0 * scale_factor)
		draw_circle(tip, 2.5 * scale_factor, accent)
		if float(b.get("muzzle_flash", 0)) > 0.0:
			draw_circle(tip, 6.0 * scale_factor, Color(1, 0.9, 0.4, 0.8))
	# HQ marker
	if b.get("is_hq", false):
		draw_circle(p, s * 0.5, accent)
	_draw_hp_bar(p - Vector2(0, s + 8 * scale_factor), s, float(b["hp"]), float(b["max_hp"]))


func _draw_enemy(e: Dictionary) -> void:
	var def := db.get_enemy(str(e["def_id"]))
	var p := world_to_screen(Vector2(e["x"], e["y"]))
	var r := float(def.get("radius", 8)) * scale_factor
	var col := Color.html(str(def.get("color", "#8d6e63")))
	if float(e.get("hit_timer", 0)) > 0.0:
		col = Color(1, 1, 1)
	draw_circle(p, r, col)
	var accent := Color.html(str(def.get("accent", "#ffab91")))
	draw_circle(p + Vector2(r * 0.3, -r * 0.2), r * 0.25, accent)
	_draw_hp_bar(p - Vector2(0, r + 6 * scale_factor), r, float(e["hp"]), float(e["max_hp"]))


func _draw_hp_bar(center: Vector2, half_w: float, hp: float, max_hp: float) -> void:
	if max_hp <= 0.0 or hp >= max_hp:
		return
	var w := maxf(16.0, half_w * 2.2)
	var h := 3.0 * scale_factor
	var origin := center - Vector2(w * 0.5, 0)
	draw_rect(Rect2(origin, Vector2(w, h)), Color(0, 0, 0, 0.5))
	var pct := clampf(hp / max_hp, 0.0, 1.0)
	var col := Color(0.4, 0.75, 0.4) if pct > 0.5 else (Color(1, 0.72, 0.3) if pct > 0.25 else Color(0.94, 0.33, 0.31))
	draw_rect(Rect2(origin, Vector2(w * pct, h)), col)
