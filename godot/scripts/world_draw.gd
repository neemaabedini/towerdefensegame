extends Node2D
class_name WorldDraw
## 2.5D world paint — ports the density of src/render/Renderer.ts.
## Gameplay coords stay top-down; paint uses foreshortened diamonds, shadows,
## foundations, spawn threat markers, range rings, and shape-aware entities.

var sim: GameSim
var db: DataDB
var atlas: GameSpriteAtlas
var scale_factor: float = 1.0
var offset: Vector2 = Vector2.ZERO
var _time: float = 0.0

const WORLD_W := 960.0
const WORLD_H := 540.0
## Draw sprites slightly larger than design size so they read at 960×540 scale.
const SPRITE_WORLD_SCALE := 1.15


func setup(game: GameSim, data: DataDB) -> void:
	sim = game
	db = data
	# Pixel art: never bilinear-filter atlas draws.
	texture_filter = TEXTURE_FILTER_NEAREST
	atlas = GameSpriteAtlas.new()
	if not atlas.load_default():
		push_warning("WorldDraw: atlas missing — vector fallbacks only. Run: npm run export-atlas")
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


func _process(dt: float) -> void:
	_time += dt
	queue_redraw()


func _draw() -> void:
	if sim == null or sim.level.is_empty():
		return
	var night := sim.phase == "night"
	_draw_terrain(night)
	_draw_paths(night)
	_draw_obstacles()
	_draw_spawns()
	_draw_sites()
	_draw_ranges()
	_draw_hq_stop_ring()
	_draw_wrecks()

	# Y-sort entities (painter's algorithm) — buildings, units, hero, enemies.
	var drawables: Array = []
	for b in sim.buildings:
		if float(b["hp"]) > 0.0 or b.get("is_hq", false):
			drawables.append({"y": float(b["y"]), "kind": "b", "ref": b})
	for u in sim.units:
		if float(u["hp"]) > 0.0:
			drawables.append({"y": float(u["y"]), "kind": "u", "ref": u})
	if not sim.hero.is_empty() and sim.hero.get("alive", false):
		drawables.append({"y": float(sim.hero["y"]), "kind": "h", "ref": sim.hero})
	for e in sim.enemies:
		if float(e["hp"]) > 0.0:
			drawables.append({"y": float(e["y"]), "kind": "e", "ref": e})
	drawables.sort_custom(func(a, b): return float(a["y"]) < float(b["y"]))
	for d in drawables:
		match str(d["kind"]):
			"b":
				_draw_building(d["ref"])
			"u":
				_draw_unit(d["ref"])
			"h":
				_draw_hero(d["ref"])
			"e":
				_draw_enemy(d["ref"])

	_draw_projectiles()
	_draw_particles()
	_draw_floating_texts()
	if night:
		_draw_night_vignette()


# -- terrain -----------------------------------------------------------------

func _hash2(a: int, b: int) -> float:
	var n := (a * 374761393 + b * 668265263) & 0x7fffffff
	n = ((n ^ (n >> 13)) * 1274126177) & 0x7fffffff
	n = n ^ (n >> 16)
	return float(n & 0xffffffff) / 4294967296.0


func _w(p: Vector2) -> Vector2:
	return world_to_screen(p)


func _draw_terrain(night: bool) -> void:
	var origin := offset
	var size := Vector2(WORLD_W, WORLD_H) * scale_factor
	# Base gradient
	var top := Color.html("#0b1424") if night else Color.html("#2a3a28")
	var mid := Color.html("#0e1a2e") if night else Color.html("#243424")
	var bot := Color.html("#0a101c") if night else Color.html("#1a261c")
	for band in 12:
		var t0 := float(band) / 12.0
		var t1 := float(band + 1) / 12.0
		var c0 := top.lerp(mid, clampf(t0 * 2.0, 0.0, 1.0)).lerp(bot, clampf((t0 - 0.45) / 0.55, 0.0, 1.0))
		draw_rect(Rect2(origin + Vector2(0, size.y * t0), Vector2(size.x, size.y * (t1 - t0) + 1)), c0)

	# Mesa ridges
	for ridge in [{"y": 0.0, "h": 48.0, "a": 0.35}, {"y": 18.0, "h": 36.0, "a": 0.22}, {"y": WORLD_H - 40.0, "h": 40.0, "a": 0.18}]:
		var col := Color(0.05, 0.08, 0.14, ridge["a"]) if night else Color(0.07, 0.11, 0.06, ridge["a"])
		var pts: PackedVector2Array = []
		pts.append(_w(Vector2(0, ridge["y"] + ridge["h"])))
		var x := 0.0
		var i := 0
		while x <= WORLD_W:
			var peak: float = float(ridge["y"]) + _hash2(i, int(ridge["y"])) * float(ridge["h"]) * 0.7
			pts.append(_w(Vector2(x, peak)))
			x += 28.0 + _hash2(i + 3, 2) * 24.0
			i += 1
		pts.append(_w(Vector2(WORLD_W, float(ridge["y"]) + float(ridge["h"]))))
		if pts.size() >= 3:
			draw_colored_polygon(pts, col)

	# Diamond tiles
	var tile_w := 56.0
	var tile_h := 28.0
	var rows := int(WORLD_H / (tile_h * 0.5)) + 4
	var cols := int(WORLD_W / tile_w) + 4
	for row in range(-1, rows):
		for col in range(-1, cols):
			var cx := col * tile_w + (0.0 if row % 2 == 0 else tile_w * 0.5)
			var cy := row * tile_h * 0.5
			var n := _hash2(col + 17, row + 31)
			var shade := (0.04 + n * 0.06) if night else (0.05 + n * 0.08)
			var warm := n > 0.55
			var fill: Color
			if night:
				fill = Color(50 / 255.0, 72 / 255.0, 110 / 255.0, shade) if warm else Color(30 / 255.0, 48 / 255.0, 72 / 255.0, shade)
			else:
				fill = Color(90 / 255.0, 110 / 255.0, 55 / 255.0, shade) if warm else Color(45 / 255.0, 70 / 255.0, 42 / 255.0, shade)
			var diamond := PackedVector2Array([
				_w(Vector2(cx, cy - tile_h * 0.5)),
				_w(Vector2(cx + tile_w * 0.5, cy)),
				_w(Vector2(cx, cy + tile_h * 0.5)),
				_w(Vector2(cx - tile_w * 0.5, cy)),
			])
			draw_colored_polygon(diamond, fill)

	# Soil blotches
	for i in 18:
		var px := _hash2(i * 3, 9) * WORLD_W
		var py := _hash2(i * 5, 11) * WORLD_H
		var rx := (40.0 + _hash2(i, 2) * 70.0) * scale_factor
		var ry := rx * (0.38 + _hash2(i, 4) * 0.18)
		var elev := _hash2(i, 7)
		var c := Color(25 / 255.0, 40 / 255.0, 65 / 255.0, 0.12 + elev * 0.1) if night else Color(55 / 255.0, 78 / 255.0, 40 / 255.0, 0.14 + elev * 0.12)
		draw_circle(_w(Vector2(px, py)), maxf(rx, ry) * 0.55, c)

	# Grit
	var grit := Color(90 / 255.0, 120 / 255.0, 160 / 255.0, 0.07) if night else Color(120 / 255.0, 140 / 255.0, 80 / 255.0, 0.08)
	for i in 220:
		var gx := _hash2(i, 41) * WORLD_W
		var gy := _hash2(i, 43) * WORLD_H
		var gs := (2.0 if i % 3 == 0 else 1.0) * scale_factor
		draw_rect(Rect2(_w(Vector2(gx, gy)), Vector2(gs, gs)), grit)


func _draw_paths(night: bool) -> void:
	var paths: Dictionary = sim.level.get("paths", {})
	var col := Color(0.22, 0.28, 0.38, 0.55) if night else Color(0.28, 0.32, 0.28, 0.5)
	var edge := Color(0.15, 0.18, 0.22, 0.35)
	for k in paths.keys():
		var pts: Array = paths[k]
		if pts.size() < 2:
			continue
		for i in range(pts.size() - 1):
			var a: Dictionary = pts[i]
			var b: Dictionary = pts[i + 1]
			var p0 := _w(Vector2(a["x"], a["y"]))
			var p1 := _w(Vector2(b["x"], b["y"]))
			draw_line(p0, p1, edge, 7.0 * scale_factor)
			draw_line(p0, p1, col, 3.5 * scale_factor)


func _ground_shadow(world: Vector2, rx: float, ry: float, alpha: float = 0.28) -> void:
	var c := _w(world + Vector2(0, ry * 0.15))
	var steps := 6
	for i in steps:
		var t := float(i) / float(steps)
		var a := alpha * (1.0 - t)
		draw_circle(c, lerpf(rx, rx * 0.2, t) * scale_factor, Color(0, 0, 0, a * 0.35))


func _draw_obstacles() -> void:
	for o in sim.level.get("obstacles", []):
		var pos := Vector2(float(o.get("x", 0)), float(o.get("y", 0)))
		var r := float(o.get("r", 16))
		var kind := str(o.get("kind", "rock"))
		_ground_shadow(pos, r * 1.1, r * 0.45, 0.3)
		var p := _w(pos)
		var rs := r * scale_factor
		# Prefer atlas terrain frames when size matches
		var atlas_key := ""
		if kind == "crystal":
			atlas_key = "crystal:m:0" if r >= 15.0 else "crystal:s:0"
		elif kind == "rock":
			if r >= 32.0:
				atlas_key = "rock:l:0"
			elif r >= 26.0:
				atlas_key = "rock:m:0"
			else:
				atlas_key = "rock:s:0"
		if atlas_key != "" and atlas != null and atlas.has(atlas_key):
			var spr_scale := scale_factor * SPRITE_WORLD_SCALE * (r / 16.0) * 0.9
			if atlas.draw_frame(self, atlas_key, p, spr_scale):
				if kind == "crystal":
					var glow := Color(0.3, 0.85, 0.9, 0.2 + 0.1 * absf(sin(_time * 3.0 + pos.x * 0.02)))
					draw_circle(p, rs * 0.9, glow)
				continue
		if kind == "crystal":
			var glow := Color(0.3, 0.85, 0.9, 0.35 + 0.15 * absf(sin(_time * 3.0 + pos.x * 0.02)))
			draw_circle(p, rs * 1.15, glow)
			var body := PackedVector2Array([
				p + Vector2(0, -rs),
				p + Vector2(rs * 0.55, -rs * 0.1),
				p + Vector2(rs * 0.35, rs * 0.7),
				p + Vector2(-rs * 0.35, rs * 0.7),
				p + Vector2(-rs * 0.55, -rs * 0.1),
			])
			draw_colored_polygon(body, Color.html("#26c6da"))
		elif kind == "plasma":
			var pulse := 0.5 + 0.5 * sin(_time * 2.5 + pos.x)
			draw_circle(p, rs * (1.0 + pulse * 0.15), Color(0.95, 0.55, 0.15, 0.35))
			draw_circle(p, rs * 0.65, Color.html("#ff9800"))
			draw_circle(p, rs * 0.3, Color(1, 0.95, 0.7, 0.8))
		else:
			draw_circle(p + Vector2(-rs * 0.2, rs * 0.1), rs * 0.7, Color.html("#455a64"))
			draw_circle(p + Vector2(rs * 0.25, 0), rs * 0.55, Color.html("#546e7a"))
			draw_circle(p + Vector2(0, -rs * 0.15), rs * 0.4, Color.html("#607d8b"))


func _draw_spawns() -> void:
	var info := sim.upcoming_spawn_info()
	var upcoming_ids: Array = info.get("ids", [])
	var counts: Dictionary = info.get("counts", {})
	for spawn in sim.level.get("spawns", []):
		var sid := str(spawn.get("id", ""))
		var pos := Vector2(float(spawn.get("x", 0)), float(spawn.get("y", 0)))
		var p := _w(pos)
		var active := sid in upcoming_ids
		if not active:
			draw_arc(p, 12.0 * scale_factor, 0, TAU, 20, Color(0.56, 0.64, 0.68, 0.28), 1.5)
			continue
		var pulse := 0.5 + 0.5 * sin(_time * 4.0)
		_ground_shadow(pos, 16, 8, 0.2)
		draw_arc(p, 14.0 * scale_factor, 0, TAU, 24, Color(0.94, 0.33, 0.31, 0.5 + pulse * 0.4), 2.5)
		draw_arc(p, (20.0 + pulse * 5.0) * scale_factor, 0, TAU, 28, Color(0.94, 0.33, 0.31, 0.25 + pulse * 0.25), 2.0)
		draw_circle(p, 6.0 * scale_factor, Color(0.94, 0.33, 0.31, 0.35))
		# March chevrons along first path segment
		var paths: Dictionary = sim.level.get("paths", {})
		var path = paths.get(sid, [])
		if path is Array and (path as Array).size() >= 2:
			var p0: Dictionary = path[0]
			var p1: Dictionary = path[1]
			var dir := Vector2(float(p1["x"]) - float(p0["x"]), float(p1["y"]) - float(p0["y"]))
			if dir.length() > 1.0:
				dir = dir.normalized()
				var perp := Vector2(-dir.y, dir.x)
				var march := fmod(_time * 36.0, 26.0)
				for k in 3:
					var along := 26.0 + march + float(k) * 26.0
					var cx := pos + dir * along
					var tip := _w(cx)
					var left := _w(cx - dir * 8.0 + perp * 7.0)
					var right := _w(cx - dir * 8.0 - perp * 7.0)
					draw_line(left, tip, Color(0.94, 0.33, 0.31, 0.4 + pulse * 0.35), 3.0)
					draw_line(right, tip, Color(0.94, 0.33, 0.31, 0.4 + pulse * 0.35), 3.0)
		var count := int(counts.get(sid, 0))
		if count > 0:
			draw_string(ThemeDB.fallback_font, p + Vector2(-10, -22 * scale_factor), "×%d" % count, HORIZONTAL_ALIGNMENT_LEFT, -1, int(12 * scale_factor), Color(1, 0.8, 0.82, 0.75 + pulse * 0.25))


func _draw_sites() -> void:
	if sim.phase != "day" and sim.phase != "victory":
		return
	for site in sim.sites:
		if str(site["building_id"]) != "":
			continue
		var pos := Vector2(float(site["x"]), float(site["y"]))
		var selected := str(site["id"]) == sim.selected_site_id
		var cat := str(site.get("category", "any"))
		var col := Color.html("#4dd0e1") if cat == "resource" else (Color.html("#81c784") if cat == "defense" else Color.html("#90a4ae"))
		var pulse := 0.6 + 0.4 * sin(_time * 2.5 + pos.x * 0.01)
		_ground_shadow(pos, 18, 9, 0.22)
		# Iso foundation diamond
		var hw := 16.0 * scale_factor
		var hh := 8.0 * scale_factor
		var p := _w(pos)
		var diamond := PackedVector2Array([
			p + Vector2(0, -hh),
			p + Vector2(hw, 0),
			p + Vector2(0, hh),
			p + Vector2(-hw, 0),
		])
		var fill := col
		fill.a = 0.2 + pulse * 0.15 if selected else 0.12
		draw_colored_polygon(diamond, fill)
		draw_polyline(diamond + PackedVector2Array([diamond[0]]), col if selected else Color(col, 0.45), 2.0 if selected else 1.2)
		if selected:
			# Focus brackets
			var r := 18.0 * scale_factor
			var arm := 6.0 * scale_factor
			var c := Color.html("#4fc3f7")
			for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
				var o: Vector2 = p + corner * r
				draw_line(o, o + Vector2(-corner.x * arm, 0), c, 2.0)
				draw_line(o, o + Vector2(0, -corner.y * arm), c, 2.0)
		# Resource badge
		var res: Dictionary = site.get("resources", {})
		var mineral := int(res.get("mineral", 0))
		if mineral > 0:
			var offers := false
			for opt in site["options"]:
				var def := db.get_building(str(opt))
				if def.has("mining") and str(def["mining"].get("resource", "")) == "mineral":
					offers = true
					break
			if offers:
				draw_string(ThemeDB.fallback_font, p + Vector2(-14, -20 * scale_factor), "◆×%d" % mineral, HORIZONTAL_ALIGNMENT_LEFT, -1, int(11 * scale_factor), Color.html("#4dd0e1"))


func _draw_ranges() -> void:
	# Selected building range
	if sim.selected_building_id != "":
		var b := sim._find_building(sim.selected_building_id)
		if not b.is_empty() and float(b["hp"]) > 0.0:
			var stats := sim.stats_for(sim.selected_building_id)
			var rng := float(stats.get("range", 0))
			if rng > 0.0:
				_draw_range_circle(Vector2(b["x"], b["y"]), rng, Color(0.31, 0.76, 0.97, 0.22))
	# Pre-buy range ghost at selected empty site
	var preview := sim.range_preview()
	if not preview.is_empty() and float(preview.get("range", 0)) > 0.0:
		_draw_range_circle(Vector2(preview["x"], preview["y"]), float(preview["range"]), Color(0.31, 0.76, 0.97, 0.14), true)


func _draw_range_circle(world: Vector2, range_px: float, col: Color, dashed: bool = false) -> void:
	var p := _w(world)
	var r := range_px * scale_factor
	if dashed:
		var segs := 36
		for i in segs:
			if i % 2 == 1:
				continue
			var a0 := TAU * float(i) / float(segs)
			var a1 := TAU * float(i + 1) / float(segs)
			draw_line(p + Vector2(cos(a0), sin(a0)) * r, p + Vector2(cos(a1), sin(a1)) * r, col, 1.5)
	else:
		draw_arc(p, r, 0, TAU, 48, col, 1.5)
		var fill := col
		fill.a *= 0.25
		draw_circle(p, r, fill)


func _draw_hq_stop_ring() -> void:
	var hq := sim._find_building(sim.hq_id)
	if hq.is_empty():
		return
	var pad := float(db.tuning.get("enemies", {}).get("hqContactPadPx", 48))
	var p := _w(Vector2(hq["x"], hq["y"]))
	draw_arc(p, pad * scale_factor, 0, TAU, 40, Color(1, 0.8, 0.3, 0.18), 1.2)


func _draw_wrecks() -> void:
	for w in sim.wrecks:
		var pos := Vector2(float(w["x"]), float(w["y"]))
		var p := _w(pos)
		_ground_shadow(pos, 14, 7, 0.35)
		draw_circle(p + Vector2(-4, 2) * scale_factor, 8.0 * scale_factor, Color(0.14, 0.16, 0.18))
		draw_circle(p + Vector2(5, 3) * scale_factor, 6.0 * scale_factor, Color(0.22, 0.26, 0.3))
		draw_circle(p, 5.0 * scale_factor, Color(0.25, 0.2, 0.15))
		# Smoke wisps
		for i in 2:
			var t := fmod(_time * 0.7 + float(i) * 0.5 + pos.x * 0.01, 1.0)
			draw_circle(p + Vector2(sin(_time * 2.0 + i * 3.0) * 4.0, -8.0 - t * 20.0) * scale_factor, (3.0 + t * 4.0) * scale_factor, Color(0.63, 0.63, 0.67, 0.28 * (1.0 - t)))


# -- entities ----------------------------------------------------------------

func _draw_building(b: Dictionary) -> void:
	var def := db.get_building(str(b["def_id"]))
	var pos := Vector2(float(b["x"]), float(b["y"]))
	var s := float(def.get("size", 20))
	var col := Color.html(str(def.get("color", "#546e7a")))
	var accent := Color.html(str(def.get("accent", "#90a4ae")))
	var shape := str(def.get("shape", "tower"))
	var selected := str(b["id"]) == sim.selected_building_id
	_ground_shadow(pos, s * 1.15, s * 0.48, 0.36)
	_draw_iso_foundation(pos, s + 6.0, str(def.get("category", "defense")), selected)
	var p := _w(pos)
	var sc := s * scale_factor
	var used_atlas := false
	if atlas != null:
		var frame_i := int(floor(_time * 1.6 + pos.x * 0.01)) % 2
		var key := "bld:%s:%d" % [shape, frame_i]
		var spr_scale := scale_factor * SPRITE_WORLD_SCALE * (s / 22.0)
		used_atlas = atlas.draw_frame(self, key, p + Vector2(0, -2.0 * scale_factor), spr_scale)
	if not used_atlas:
		match shape:
			"hq":
				_shape_hq(p, sc, col, accent)
			"missile":
				_shape_missile(p, sc, col, accent)
			"tank":
				_shape_tank(p, sc, col, accent)
			"bunker":
				_shape_bunker(p, sc, col, accent)
			"sniper":
				_shape_sniper(p, sc, col, accent)
			"silo":
				_shape_silo(p, sc, col, accent)
			_:
				_shape_tower(p, sc, col, accent)
	# Live aim barrel + muzzle (on top of atlas body)
	if float(def.get("damage", 0)) > 0.0 and float(def.get("fireRate", 0)) > 0.0:
		var ang := float(b.get("aim_angle", -PI / 4.0))
		var pivot := p + Vector2(0, -sc * 0.25)
		var tip := pivot + Vector2(cos(ang), sin(ang)) * sc * 1.35
		draw_line(pivot, tip, Color(0.1, 0.12, 0.14), 3.5 * scale_factor)
		draw_circle(tip, 2.5 * scale_factor, accent)
		if float(b.get("muzzle_flash", 0)) > 0.0:
			var t := clampf(float(b["muzzle_flash"]) / 0.1, 0.0, 1.0)
			var mf_frame := 0 if t > 0.5 else 1
			var mf_key := "fx:muzzle:%d" % mf_frame
			if atlas == null or not atlas.draw_frame(self, mf_key, tip, scale_factor * (0.7 + 0.4 * t), Color(1, 1, 1, 0.55 + 0.45 * t)):
				draw_circle(tip, (4.0 + 5.0 * t) * scale_factor, Color(1, 0.9, 0.4, 0.5 + 0.5 * t))
	if selected:
		_draw_focus_brackets(p, sc + 10.0 * scale_factor)
	_draw_hp_bar(p - Vector2(0, sc + 10 * scale_factor), sc, float(b["hp"]), float(b["max_hp"]))
	if int(b.get("level", 1)) > 1:
		draw_circle(p + Vector2(sc * 0.7, -sc * 0.7), 8.0 * scale_factor, Color.html("#1a2440"))
		draw_arc(p + Vector2(sc * 0.7, -sc * 0.7), 8.0 * scale_factor, 0, TAU, 16, Color.html("#4fc3f7"), 1.0)
		draw_string(ThemeDB.fallback_font, p + Vector2(sc * 0.7 - 4, -sc * 0.7 + 4), str(int(b["level"])), HORIZONTAL_ALIGNMENT_LEFT, -1, int(10 * scale_factor), Color.html("#4fc3f7"))


func _draw_iso_foundation(world: Vector2, size: float, category: String, selected: bool) -> void:
	var p := _w(world)
	var hw := size * 0.55 * scale_factor
	var hh := size * 0.28 * scale_factor
	var base := Color(0.12, 0.16, 0.2, 0.75)
	if category == "resource":
		base = Color(0.1, 0.18, 0.2, 0.75)
	elif category == "production":
		base = Color(0.18, 0.16, 0.1, 0.75)
	var diamond := PackedVector2Array([
		p + Vector2(0, -hh),
		p + Vector2(hw, 0),
		p + Vector2(0, hh),
		p + Vector2(-hw, 0),
	])
	draw_colored_polygon(diamond, base)
	if selected:
		draw_polyline(diamond + PackedVector2Array([diamond[0]]), Color.html("#4fc3f7"), 1.5)


func _shape_hq(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_rect(Rect2(p - Vector2(s * 0.9, s * 0.55), Vector2(s * 1.8, s * 1.1)), col)
	draw_rect(Rect2(p - Vector2(s * 0.5, s * 0.95), Vector2(s, s * 0.5)), col.darkened(0.15))
	draw_circle(p + Vector2(0, s * 0.1), s * 0.35, accent)
	var pulse := 0.5 + 0.5 * sin(_time * 2.0)
	draw_circle(p + Vector2(0, s * 0.1), s * 0.2 + pulse * 2.0, Color(accent, 0.35 + pulse * 0.25))


func _shape_tower(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_line(p + Vector2(-s * 0.45, s * 0.55), p + Vector2(-s * 0.12, s * 0.05), col, 3.0)
	draw_line(p + Vector2(s * 0.45, s * 0.55), p + Vector2(s * 0.12, s * 0.05), col, 3.0)
	draw_rect(Rect2(p - Vector2(s * 0.22, s * 0.15), Vector2(s * 0.44, s * 0.65)), col)
	draw_rect(Rect2(p - Vector2(s * 0.4, s * 0.5), Vector2(s * 0.8, s * 0.4)), accent)


func _shape_missile(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_rect(Rect2(p - Vector2(s * 0.45, s * 0.05), Vector2(s * 0.9, s * 0.45)), col)
	draw_rect(Rect2(p - Vector2(s * 0.5, s * 0.45), Vector2(s, s * 0.5)), col.lightened(0.1))
	for ox in [-0.22, 0.12]:
		for oy in [-0.28, 0.05]:
			draw_circle(p + Vector2(s * ox, s * oy), s * 0.12, Color(0.1, 0.12, 0.14))
			draw_circle(p + Vector2(s * ox, s * oy), s * 0.06, accent)


func _shape_tank(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_line(p + Vector2(-s * 0.5, s * 0.05), p + Vector2(-s * 0.85, s * 0.4), Color(0.15, 0.15, 0.18), 3.0)
	draw_line(p + Vector2(s * 0.5, s * 0.05), p + Vector2(s * 0.85, s * 0.4), Color(0.15, 0.15, 0.18), 3.0)
	draw_rect(Rect2(p - Vector2(s * 0.7, s * 0.2), Vector2(s * 1.4, s * 0.5)), col)
	draw_circle(p + Vector2(-s * 0.08, -s * 0.15), s * 0.28, accent)


func _shape_bunker(p: Vector2, s: float, col: Color, accent: Color) -> void:
	var body := PackedVector2Array([
		p + Vector2(-s, s * 0.35),
		p + Vector2(-s * 0.55, -s * 0.4),
		p + Vector2(s * 0.55, -s * 0.4),
		p + Vector2(s, s * 0.35),
	])
	draw_colored_polygon(body, col)
	draw_rect(Rect2(p - Vector2(s * 0.4, s * 0.12), Vector2(s * 0.8, s * 0.18)), Color(0.08, 0.1, 0.12))
	for i in range(-2, 3):
		draw_circle(p + Vector2(i * s * 0.32, s * 0.35), s * 0.12, accent)


func _shape_sniper(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_line(p + Vector2(-s * 0.45, s * 0.55), p + Vector2(-s * 0.08, s * 0.05), col, 2.5)
	draw_line(p + Vector2(s * 0.45, s * 0.55), p + Vector2(s * 0.08, s * 0.05), col, 2.5)
	draw_line(p + Vector2(0, s * 0.6), p + Vector2(0, s * 0.05), col, 2.5)
	draw_rect(Rect2(p - Vector2(s * 0.32, s * 0.25), Vector2(s * 0.64, s * 0.35)), col)
	var blink := 0.4 + 0.6 * absf(sin(_time * 4.0))
	draw_circle(p + Vector2(s * 0.15, -s * 0.35), 3.0 * scale_factor, Color(accent, blink))


func _shape_silo(p: Vector2, s: float, col: Color, accent: Color) -> void:
	draw_rect(Rect2(p - Vector2(s * 0.55, s * 0.35), Vector2(s * 0.45, s * 0.75)), col.darkened(0.1))
	draw_rect(Rect2(p + Vector2(s * 0.05, -s * 0.35), Vector2(s * 0.45, s * 0.75)), col)
	draw_rect(Rect2(p - Vector2(s * 0.15, s * 0.55), Vector2(s * 0.3, s * 0.25)), accent)
	draw_circle(p + Vector2(-s * 0.2, -s * 0.1), 3.0 * scale_factor, Color.html("#4dd0e1"))


func _draw_unit(u: Dictionary) -> void:
	var def := db.get_unit(str(u["unit_def_id"]))
	var pos := Vector2(float(u["x"]), float(u["y"]))
	var r := float(def.get("radius", 6))
	_ground_shadow(pos, r * 1.1, r * 0.45, 0.3)
	var p := _w(pos)
	var flash := float(u.get("hit_timer", 0)) > 0.0
	var used := false
	if atlas != null:
		var key := atlas.anim_key("unit:%s" % str(u["unit_def_id"]), _time + pos.x * 0.02, flash)
		used = atlas.draw_frame(self, key, p, scale_factor * SPRITE_WORLD_SCALE * 1.05)
	if not used:
		var col := Color.html(str(def.get("color", "#1565c0")))
		if flash:
			col = Color(1, 1, 1)
		draw_circle(p + Vector2(0, -r * 0.6) * scale_factor, r * 0.55 * scale_factor, col)
		draw_rect(Rect2(p - Vector2(r * 0.45, r * 0.1) * scale_factor, Vector2(r * 0.9, r * 1.1) * scale_factor), col)
		draw_circle(p + Vector2(r * 0.15, -r * 0.55) * scale_factor, 2.0 * scale_factor, Color.html(str(def.get("accent", "#90caf9"))))
	_draw_hp_bar(p - Vector2(0, r * 2.2 * scale_factor), r * scale_factor, float(u["hp"]), float(u["max_hp"]))


func _draw_hero(h: Dictionary) -> void:
	var def := db.get_hero(str(h["def_id"]))
	var pos := Vector2(float(h["x"]), float(h["y"]))
	var r := float(def.get("radius", 8))
	_ground_shadow(pos, r * 1.2, r * 0.5, 0.32)
	var p := _w(pos)
	var col := Color.html(str(def.get("color", "#263238")))
	var accent := Color.html(str(def.get("accent", "#ffca28")))
	var dir := int(h.get("dir", 2))
	var facing := int(h.get("facing", 1))
	var moving := bool(h.get("moving", false))
	var attacking := float(h.get("attack_anim", 0)) > 0.0
	var used := false
	if atlas != null:
		var key := ""
		var flip := false
		if attacking and moving:
			key = "hero:walk_atk:%d" % (int(floor(_time * 8.0)) % 2)
			flip = facing < 0
		elif attacking:
			key = "hero:stand_atk:%d" % (0 if float(h["attack_anim"]) > 0.12 else 1)
			flip = facing < 0
		elif moving:
			key = "hero:walk:%d" % (int(floor(_time * 8.0)) % 4)
			flip = facing < 0
		else:
			key = "hero:d%d" % dir
		if flip:
			draw_set_transform(p, 0.0, Vector2(-1, 1))
			used = atlas.draw_frame(self, key, Vector2.ZERO, scale_factor * SPRITE_WORLD_SCALE * 1.4)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			used = atlas.draw_frame(self, key, p, scale_factor * SPRITE_WORLD_SCALE * 1.4)
	if not used:
		var face := Vector2(cos(dir * PI / 4.0), sin(dir * PI / 4.0))
		draw_circle(p, r * 1.1 * scale_factor, col)
		draw_circle(p + face * r * 0.35 * scale_factor, r * 0.45 * scale_factor, accent)
		draw_rect(Rect2(p + Vector2(-r * 0.35, r * 0.2) * scale_factor, Vector2(r * 0.7, r * 0.9) * scale_factor), col.darkened(0.1))
	if sim.phase == "night":
		draw_arc(p, (r + 6.0) * scale_factor, 0, TAU, 28, Color(accent.r, accent.g, accent.b, 0.35 + 0.2 * sin(_time * 3.0)), 1.5)
	_draw_hp_bar(p - Vector2(0, (r + 12) * scale_factor), r * scale_factor, float(h["hp"]), float(h["max_hp"]))


func _draw_enemy(e: Dictionary) -> void:
	var def := db.get_enemy(str(e["def_id"]))
	var pos := Vector2(float(e["x"]), float(e["y"]))
	var r := float(def.get("radius", 8))
	var arch := str(def.get("archetype", "ground"))
	_ground_shadow(pos, r * 1.15, r * 0.45, 0.3)
	var p := _w(pos)
	var col := Color.html(str(def.get("color", "#8d6e63")))
	var accent := Color.html(str(def.get("accent", "#ffab91")))
	var flash := float(e.get("hit_timer", 0)) > 0.0
	if arch == "flyer":
		p += Vector2(0, sin(_time * 5.0 + pos.x * 0.05) * 4.0 * scale_factor)
	var used := false
	if atlas != null:
		var key := atlas.anim_key(str(e["def_id"]), _time + pos.x * 0.03, flash)
		var spr_scale := scale_factor * SPRITE_WORLD_SCALE * (r / 8.0)
		used = atlas.draw_frame(self, key, p, spr_scale)
	if not used:
		if flash:
			col = Color(1, 1, 1)
		if arch == "brute" or arch == "siege":
			draw_circle(p, r * 1.15 * scale_factor, col)
			draw_rect(Rect2(p - Vector2(r, r * 0.3) * scale_factor, Vector2(r * 2, r * 0.8) * scale_factor), col.darkened(0.15))
		elif arch == "flyer":
			var wing := PackedVector2Array([
				p + Vector2(-r * 1.4, 0) * scale_factor,
				p + Vector2(0, -r * 0.4) * scale_factor,
				p + Vector2(r * 1.4, 0) * scale_factor,
				p + Vector2(0, r * 0.3) * scale_factor,
			])
			draw_colored_polygon(wing, col)
			draw_circle(p, r * 0.55 * scale_factor, accent)
		else:
			draw_circle(p, r * scale_factor, col)
			draw_circle(p + Vector2(r * 0.35, -r * 0.25) * scale_factor, r * 0.28 * scale_factor, accent)
	_draw_hp_bar(p - Vector2(0, (r + 8) * scale_factor), r * scale_factor, float(e["hp"]), float(e["max_hp"]))


func _draw_projectiles() -> void:
	for pr in sim.projectiles:
		if not pr.get("alive", true):
			continue
		var pos := Vector2(float(pr["x"]), float(pr["y"]))
		var tgt := Vector2(float(pr["tx"]), float(pr["ty"]))
		var p := _w(pos)
		var col: Color = pr.get("color", Color.WHITE)
		var ang := (tgt - pos).angle()
		var style := str(pr.get("style", "bullet"))
		var trail_len := 18.0 if style == "missile" else (14.0 if style == "shell" else 10.0)
		draw_line(p, p - Vector2(cos(ang), sin(ang)) * trail_len * scale_factor, Color(col.r, col.g, col.b, 0.35), 2.0 if pr.get("faction", "") != "enemy" else 1.5)
		var fx_key := "fx:%s:0" % style
		if style == "bolt":
			fx_key = "fx:bolt:%d" % (int(floor(_time * 12.0)) % 2)
		var used := false
		if atlas != null and atlas.has(fx_key):
			# Rotate via draw_set_transform
			draw_set_transform(p, ang, Vector2.ONE)
			used = atlas.draw_frame(self, fx_key, Vector2.ZERO, scale_factor * 1.1)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if not used:
			if style == "missile":
				draw_circle(p, 4.5 * scale_factor, col)
				draw_circle(p + Vector2(cos(ang), sin(ang)) * 4.0 * scale_factor, 2.5 * scale_factor, Color(1, 0.4, 0.3))
			elif style == "shell":
				draw_circle(p, 4.0 * scale_factor, col.darkened(0.2))
			elif style == "bolt":
				draw_circle(p, 3.5 * scale_factor, col)
			else:
				draw_circle(p, 3.0 * scale_factor, col)


func _draw_particles() -> void:
	for pt in sim.particles:
		var a := clampf(float(pt["life"]) / float(pt["max_life"]), 0.0, 1.0)
		var p := _w(Vector2(pt["x"], pt["y"]))
		var col: Color = pt.get("color", Color.WHITE)
		col.a = a
		draw_circle(p, float(pt.get("size", 2)) * a * scale_factor, col)


func _draw_floating_texts() -> void:
	for ft in sim.floating_texts:
		var a := clampf(float(ft["life"]) / float(ft["max_life"]), 0.0, 1.0)
		var col: Color = ft["color"]
		col.a = a
		var pos := _w(Vector2(ft["x"], ft["y"]))
		draw_string(ThemeDB.fallback_font, pos + Vector2(-16, 0), str(ft["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, int(13 * scale_factor), col)


func _draw_night_vignette() -> void:
	# Radial-ish darkening via concentric translucent rings
	var center := offset + Vector2(WORLD_W, WORLD_H) * scale_factor * 0.5
	var max_r := maxf(WORLD_W, WORLD_H) * scale_factor * 0.75
	for i in 8:
		var t := float(i) / 8.0
		var r := lerpf(max_r * 0.35, max_r, t)
		draw_arc(center, r, 0, TAU, 48, Color(0.04, 0.02, 0.1, 0.04 + t * 0.06), max_r * 0.12)


func _draw_focus_brackets(p: Vector2, r: float) -> void:
	var breathe := r + sin(_time * 5.0) * 2.0 * scale_factor
	var arm := maxf(6.0, r * 0.3) * scale_factor
	var c := Color.html("#4fc3f7")
	for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
		var o: Vector2 = p + corner * breathe
		draw_line(o, o + Vector2(-corner.x * arm, 0), c, 2.0)
		draw_line(o, o + Vector2(0, -corner.y * arm), c, 2.0)


func _draw_hp_bar(center: Vector2, half_w: float, hp: float, max_hp: float) -> void:
	if max_hp <= 0.0 or hp >= max_hp:
		return
	var w := maxf(16.0, half_w * 2.2)
	var h := 3.5 * scale_factor
	var origin := center - Vector2(w * 0.5, 0)
	draw_rect(Rect2(origin, Vector2(w, h)), Color(0, 0, 0, 0.55))
	var pct := clampf(hp / max_hp, 0.0, 1.0)
	var col := Color(0.4, 0.73, 0.42) if pct > 0.5 else (Color(1, 0.72, 0.3) if pct > 0.25 else Color(0.94, 0.33, 0.31))
	draw_rect(Rect2(origin, Vector2(w * pct, h)), col)
