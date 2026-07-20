extends RefCounted
class_name DataDB
## Loads the same JSON defs the web build uses (res://data/*.json).
## Field names match src/data — keep this file thin; no game rules here.

var buildings: Dictionary = {}
var enemies: Dictionary = {}
var heroes: Dictionary = {}
var units: Dictionary = {}
var levels: Array = []
var tuning: Dictionary = {}
var strings: Dictionary = {}

func load_all() -> void:
	buildings = _as_dict(_load_json("res://data/buildings.json"))
	enemies = _as_dict(_load_json("res://data/enemies.json"))
	heroes = _as_dict(_load_json("res://data/hero.json"))
	units = _as_dict(_load_json("res://data/units.json"))
	var raw_levels = _load_json("res://data/levels.json")
	levels = raw_levels if raw_levels is Array else []
	tuning = _as_dict(_load_json("res://data/tuning.json"))
	strings = _as_dict(_load_json("res://data/strings.json"))
	assert(not buildings.is_empty(), "buildings.json failed to load")
	assert(not levels.is_empty(), "levels.json failed to load")


func get_building(id: String) -> Dictionary:
	assert(buildings.has(id), "Unknown building: %s" % id)
	return buildings[id]


func get_enemy(id: String) -> Dictionary:
	assert(enemies.has(id), "Unknown enemy: %s" % id)
	return enemies[id]


func get_hero(id: String = "rifle") -> Dictionary:
	if heroes.has(id):
		return heroes[id]
	return heroes["rifle"]


func get_level(index: int) -> Dictionary:
	var i := clampi(index, 0, levels.size() - 1)
	return levels[i]


func level_count() -> int:
	return levels.size()


func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_error("Missing data file: %s" % path)
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	var text := f.get_as_text()
	var parsed = JSON.parse_string(text)
	if parsed == null:
		push_error("JSON parse failed: %s" % path)
		return {}
	return parsed


func _as_dict(v: Variant) -> Dictionary:
	return v if v is Dictionary else {}
