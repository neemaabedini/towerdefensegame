extends Control
class_name LevelSelect
## Level select screen — Godot port of src/ui/screens/LevelSelect.ts, full
## version including the CD-30 pre-level loadout rows: hero weapon
## (LevelSelect.ts:39-68), perks (LevelSelect.ts:72-107), mutators
## (LevelSelect.ts:113-135), then a card per level (LevelSelect.ts:137-183).
##
## Built entirely in code (no .tscn) so concurrent scene/script edits
## elsewhere in the port never conflict with this file.
##
## Host usage:
##   var ls := LevelSelect.new()
##   add_child(ls)
##   ls.setup(db, save)
##   ls.back_pressed.connect(func(): ...go to title...)
##   ls.level_chosen.connect(func(index, hero_id, perks, mutators):
##       sim.set_hero_loadout(hero_id)   # BEFORE load_level, see game_sim.gd:612
##       sim.set_loadout(perks, mutators) # BEFORE load_level, see game_sim.gd:601
##       sim.load_level(index)
##   )
## Call ls.refresh() any time this screen is about to become visible again
## (star/unlock state may have changed since the last visit).

signal back_pressed()
## Fires when an unlocked level card is clicked. hero_id is a single def id;
## perks/mutators are plain String-id arrays — exactly the shape
## GameSim.set_loadout(perks, mutators) / set_hero_loadout(id) expect.
signal level_chosen(index: int, hero_id: String, perks: Array, mutators: Array)

## Mirrors save_data.gd's SaveData.DEFAULT_HERO_WEAPON. Duplicated (not
## referenced via SaveData.DEFAULT_HERO_WEAPON) so this file stays
## self-contained per the ticket's file-ownership rule.
const DEFAULT_HERO_WEAPON := "rifle"

var _db: DataDB
var _save: SaveData
var _built := false

## CD-30 mutator selection — SESSION-ONLY, mirrors AppShell.ts:57-60: kept on
## this screen instance, never written to save.settings, so it resets
## whenever a new LevelSelect is constructed (fresh boot) while perks
## persist. Multi-select, no slot cap (LevelSelect.ts:113-135).
var _selected_mutators: Array = []

var _weapon_label: Label
var _weapon_content: HFlowContainer
var _perk_label: Label
var _perk_content: HFlowContainer
var _mutator_content: HFlowContainer
var _cards_grid: GridContainer


func _ready() -> void:
	_ensure_built()


func setup(db: DataDB, save: SaveData) -> void:
	_ensure_built()
	_db = db
	_save = save
	refresh()


## Full structural rebuild of the dynamic rows/cards — mirrors
## LevelSelect.ts:27-183's render(), which clears and rebuilds `cardsEl`
## wholesale on every call. Only fires from explicit state changes (chip
## clicks, screen re-entry), never per frame.
func refresh() -> void:
	if _db == null or _save == null:
		return
	_build_weapon_row()
	_build_perk_row()
	_build_mutator_row()
	_build_level_cards()


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	_build()


func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var bg := ColorRect.new()
	bg.color = Color(0.043, 0.05, 0.09)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var root_margin := MarginContainer.new()
	root_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root_margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		root_margin.add_theme_constant_override("margin_%s" % side, 20)
	add_child(root_margin)

	var main_vbox := VBoxContainer.new()
	main_vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	main_vbox.add_theme_constant_override("separation", 10)
	root_margin.add_child(main_vbox)

	var top_bar := HBoxContainer.new()
	top_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	main_vbox.add_child(top_bar)

	var btn_back := Button.new()
	btn_back.text = "Back"
	btn_back.mouse_filter = Control.MOUSE_FILTER_STOP
	btn_back.pressed.connect(func(): back_pressed.emit())
	top_bar.add_child(btn_back)

	var title := Label.new()
	title.text = "Select Level"
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color(1.0, 0.79, 0.16))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar.add_child(title)

	# Balances the Back button so the title label is visually centered.
	var top_spacer := Control.new()
	top_spacer.custom_minimum_size = Vector2(64, 0)
	top_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar.add_child(top_spacer)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	main_vbox.add_child(scroll)

	var scroll_vbox := VBoxContainer.new()
	scroll_vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scroll_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll_vbox.add_theme_constant_override("separation", 18)
	scroll.add_child(scroll_vbox)

	var weapon_section := _build_section("Commander weapon")
	scroll_vbox.add_child(weapon_section["container"] as Control)
	_weapon_label = weapon_section["label"] as Label
	_weapon_content = weapon_section["content"] as HFlowContainer

	var perk_section := _build_section("Perks")
	scroll_vbox.add_child(perk_section["container"] as Control)
	_perk_label = perk_section["label"] as Label
	_perk_content = perk_section["content"] as HFlowContainer

	var mutator_section := _build_section("Mutators")
	scroll_vbox.add_child(mutator_section["container"] as Control)
	_mutator_content = mutator_section["content"] as HFlowContainer

	var cards_label := Label.new()
	cards_label.text = "Levels"
	cards_label.add_theme_font_size_override("font_size", 16)
	cards_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.85))
	cards_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scroll_vbox.add_child(cards_label)

	_cards_grid = GridContainer.new()
	_cards_grid.columns = 2
	_cards_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cards_grid.add_theme_constant_override("h_separation", 12)
	_cards_grid.add_theme_constant_override("v_separation", 12)
	scroll_vbox.add_child(_cards_grid)


## header + a wrapping HFlowContainer for chips. Returned as a Dictionary
## (container/label/content) since GDScript has no lightweight tuple type.
func _build_section(header: String) -> Dictionary:
	var container := VBoxContainer.new()
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_theme_constant_override("separation", 6)

	var label := Label.new()
	label.text = header
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.85))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_child(label)

	var content := HFlowContainer.new()
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_child(content)

	return {"container": container, "label": label, "content": content}


## Hero weapon row (LevelSelect.ts:39-68): one chip per db.heroes entry,
## star-gated via save.is_weapon_unlocked. Locked chips stay visible but
## disabled, showing "Unlock at N★" instead of the def's blurb.
func _build_weapon_row() -> void:
	var total_stars := _save.total_stars()
	_weapon_label.text = "Commander weapon · %d★" % total_stars
	_clear(_weapon_content)
	var current := _hero_weapon()
	for id in _db.heroes.keys():
		var def: Dictionary = _db.heroes[id]
		var def_id := str(id)
		var unlocked := _save.is_weapon_unlocked(def_id)
		var need := int(def.get("unlockStars", 0))
		var blurb := str(def.get("blurb", "")) if unlocked else "Unlock at %d★" % need
		var chip := _make_chip(str(def.get("name", def_id)), blurb, def_id == current, unlocked, false)
		if unlocked:
			chip.pressed.connect(_set_hero_weapon.bind(def_id))
		_weapon_content.add_child(chip)


## Perk row (LevelSelect.ts:72-107): header shows "Perks (n/slots)"; chips
## selectable up to save.perk_slots(), locked chips show "Unlock at N★",
## unlocked-but-at-cap chips stay clickable (togglePerk no-ops on them, same
## as the web version) but get a distinct "at cap" style.
func _build_perk_row() -> void:
	var slots := _save.perk_slots()
	var selected: Array = _save.selected_perks()
	_perk_label.text = "Perks (%d/%d)" % [selected.size(), slots]
	_clear(_perk_content)
	for id in _db.perks.keys():
		var def: Dictionary = _db.perks[id]
		var def_id := str(id)
		var unlocked := _save.is_perk_unlocked(def_id)
		var is_selected := selected.has(def_id)
		var at_cap := unlocked and not is_selected and selected.size() >= slots
		var blurb := _format_perk_blurb(def) if unlocked else "Unlock at %d★" % int(def.get("unlockStars", 0))
		var chip := _make_chip(str(def.get("name", def_id)), blurb, is_selected, unlocked, at_cap)
		if unlocked:
			chip.pressed.connect(_toggle_perk.bind(def_id))
		_perk_content.add_child(chip)


## Mutator row (LevelSelect.ts:113-135): multi-select, no cap, every v1
## mutator ships unlocked from a fresh save (design doc §11) so no lock
## state to render here.
func _build_mutator_row() -> void:
	_clear(_mutator_content)
	for id in _db.mutators.keys():
		var def: Dictionary = _db.mutators[id]
		var def_id := str(id)
		var selected := _selected_mutators.has(def_id)
		var chip := _make_chip(str(def.get("name", def_id)), _format_mutator_blurb(def), selected, true, false)
		chip.pressed.connect(_toggle_mutator.bind(def_id))
		_mutator_content.add_child(chip)


## Level cards (LevelSelect.ts:137-183): name, description, 3 star glyphs
## from save.stars_for, and a status line. Locked cards are non-interactive
## (Button.disabled — no click handler wired at all).
func _build_level_cards() -> void:
	_clear(_cards_grid)
	var levels: Array = _db.levels
	for index in levels.size():
		var level: Dictionary = levels[index]
		var unlocked := index < _save.unlocked_levels
		_cards_grid.add_child(_make_level_card(level, index, unlocked))


func _make_level_card(level: Dictionary, index: int, unlocked: bool) -> Button:
	var card := Button.new()
	card.text = ""
	card.disabled = not unlocked
	card.custom_minimum_size = Vector2(300, 130)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.clip_text = false
	card.add_theme_stylebox_override("normal", _card_style(false))
	card.add_theme_stylebox_override("hover", _card_style(false))
	card.add_theme_stylebox_override("pressed", _card_style(true))
	card.add_theme_stylebox_override("disabled", _card_style(false, true))

	var content := MarginContainer.new()
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		content.add_theme_constant_override("margin_%s" % side, 10)
	card.add_child(content)

	var vbox := VBoxContainer.new()
	vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_theme_constant_override("separation", 4)
	content.add_child(vbox)

	var name_label := Label.new()
	name_label.text = str(level.get("name", level.get("id", "")))
	name_label.add_theme_font_size_override("font_size", 18)
	name_label.add_theme_color_override("font_color", Color(0.95, 0.96, 1.0))
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(name_label)

	var desc_label := Label.new()
	desc_label.text = str(level.get("description", ""))
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.add_theme_font_size_override("font_size", 12)
	desc_label.add_theme_color_override("font_color", Color(0.7, 0.74, 0.82))
	desc_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(desc_label)

	var stars_row := HBoxContainer.new()
	stars_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(stars_row)
	# CD-30 Slice 1 glyphs (Clear / Flawless / Hardened), empty on a locked
	# or never-cleared card — LevelSelect.ts:155-166.
	var stars: Array = _save.stars_for(index) if unlocked else [false, false, false]
	for earned in stars:
		var glyph := Label.new()
		glyph.text = "★"
		glyph.add_theme_font_size_override("font_size", 16)
		glyph.add_theme_color_override(
			"font_color", Color(1.0, 0.84, 0.2) if earned else Color(0.35, 0.38, 0.45)
		)
		glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stars_row.add_child(glyph)

	var status_label := Label.new()
	status_label.add_theme_font_size_override("font_size", 12)
	status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not unlocked:
		status_label.text = "Locked"
		status_label.add_theme_color_override("font_color", Color(0.5, 0.53, 0.6))
	else:
		var level_id := str(level.get("id", ""))
		var result: Dictionary = _save.levels.get(level_id, {})
		if bool(result.get("cleared", false)):
			status_label.text = "Cleared · Best HQ %d%%" % int(result.get("best_hq_hp_pct", 0))
			status_label.add_theme_color_override("font_color", Color(0.5, 0.85, 0.55))
		else:
			status_label.text = "Not cleared"
			status_label.add_theme_color_override("font_color", Color(0.75, 0.78, 0.85))
	vbox.add_child(status_label)

	if unlocked:
		card.pressed.connect(_on_level_card_pressed.bind(index))
	return card


func _on_level_card_pressed(index: int) -> void:
	level_chosen.emit(index, _hero_weapon(), _save.selected_perks(), _selected_mutators.duplicate())


## Selected hero weapon — mirrors AppShell.ts:151-154's heroWeapon getter:
## falls back to the rifle for unknown/locked ids so a stale save can never
## select an unavailable weapon.
func _hero_weapon() -> String:
	var raw := str(_save.settings.get("hero_weapon", DEFAULT_HERO_WEAPON))
	return raw if _save.is_weapon_unlocked(raw) else DEFAULT_HERO_WEAPON


## Mirrors AppShell.ts:156-162 setHeroWeapon — persists immediately (a
## deliberate pre-level click, not a drag), same as the web version.
func _set_hero_weapon(id: String) -> void:
	if not _save.is_weapon_unlocked(id):
		return
	if _hero_weapon() == id:
		return
	_save.settings["hero_weapon"] = id
	_save.save_to_disk()
	refresh()


## Mirrors AppShell.ts:218-231 togglePerk — no-ops on unknown/locked ids, or
## when adding would exceed save.perk_slots(). Persists immediately.
func _toggle_perk(id: String) -> void:
	if not _save.is_perk_unlocked(id):
		return
	var current: Array = _save.selected_perks()
	var idx := current.find(id)
	if idx != -1:
		current.remove_at(idx)
	else:
		if current.size() >= _save.perk_slots():
			return
		current.append(id)
	_save.settings["perks"] = current
	_save.save_to_disk()
	refresh()


## Mirrors AppShell.ts:239-245 toggleMutator — session-only, never touches
## save.settings (see _selected_mutators doc comment above).
func _toggle_mutator(id: String) -> void:
	if not _db.mutators.has(id):
		return
	var idx := _selected_mutators.find(id)
	if idx != -1:
		_selected_mutators.remove_at(idx)
	else:
		_selected_mutators.append(id)
	refresh()


func _make_chip(chip_name: String, blurb: String, selected: bool, unlocked: bool, at_cap: bool) -> Button:
	var chip := Button.new()
	chip.text = "%s\n%s" % [chip_name, blurb]
	chip.custom_minimum_size = Vector2(180, 56)
	chip.mouse_filter = Control.MOUSE_FILTER_STOP
	chip.disabled = not unlocked
	chip.clip_text = false
	chip.add_theme_stylebox_override("normal", _chip_style(selected, at_cap, false))
	chip.add_theme_stylebox_override("hover", _chip_style(selected, at_cap, false))
	chip.add_theme_stylebox_override("pressed", _chip_style(selected, at_cap, true))
	chip.add_theme_stylebox_override("disabled", _chip_style(false, false, false, true))
	if not unlocked:
		chip.add_theme_color_override("font_disabled_color", Color(0.5, 0.53, 0.6))
	return chip


func _chip_style(selected: bool, at_cap: bool, pressed: bool, locked: bool = false) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.17, 0.20, 0.30, 0.9) if pressed else Color(0.13, 0.16, 0.24, 0.9)
	if locked:
		sb.bg_color = Color(0.08, 0.09, 0.13, 0.85)
	sb.border_color = Color(0.30, 0.83, 0.88) if selected else Color(0.28, 0.32, 0.4)
	if at_cap:
		sb.border_color = Color(0.9, 0.4, 0.3, 0.6)
	sb.set_border_width_all(2 if selected else 1)
	sb.set_corner_radius_all(5)
	sb.set_content_margin_all(8)
	return sb


func _card_style(pressed: bool, locked: bool = false) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.14, 0.17, 0.26, 0.92) if pressed else Color(0.10, 0.12, 0.19, 0.92)
	if locked:
		sb.bg_color = Color(0.06, 0.07, 0.10, 0.85)
	sb.border_color = Color(0.3, 0.32, 0.38, 0.3) if locked else Color(1.0, 0.79, 0.16, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	return sb


func _clear(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()


## -- chip-face text, mechanically derived from mods (never hand-typed) --
## Mirrors buildings.ts:259-283 describeStatMods + perks.ts:46-54
## formatPerkBlurb + mutators.ts:62-82 formatMutatorBlurb, kept local so
## this file has no cross-file data-layer dependency beyond DataDB/SaveData.

const _STAT_ORDER := ["damage", "fireRate", "range", "splashRadius", "maxHp"]
const _STAT_LABELS := {
	"damage": "damage",
	"fireRate": "fire rate",
	"range": "range",
	"splashRadius": "splash radius",
	"maxHp": "max HP",
}


func _describe_stat_mods(mods: Variant) -> Array:
	if not (mods is Dictionary):
		return []
	var parts: Array = []
	for key in _STAT_ORDER:
		if (mods as Dictionary).has(key):
			var pct := int(round((float((mods as Dictionary)[key]) - 1.0) * 100.0))
			parts.append("%s%d%% %s" % ["+" if pct >= 0 else "", pct, _STAT_LABELS[key]])
	return parts


func _format_perk_blurb(def: Dictionary) -> String:
	var parts := _describe_stat_mods(def.get("mods"))
	var starting_credits := int(def.get("startingCredits", 0))
	if starting_credits > 0:
		parts.append("+%d₡ starting credits (one-time)" % starting_credits)
	if parts.is_empty():
		return str(def.get("blurb", ""))
	var numeric: String = " and ".join(parts) if parts.size() == 2 else ", ".join(parts)
	if def.has("scope"):
		return "%s — %s" % [numeric, str(def["scope"])]
	return numeric


func _pct_of(mul: float) -> String:
	var pct := int(round((mul - 1.0) * 100.0))
	return "%s%d%%" % ["+" if pct >= 0 else "", pct]


func _format_mutator_blurb(def: Dictionary) -> String:
	var parts := _describe_stat_mods(def.get("mods"))
	var wave: Variant = def.get("wave")
	if wave is Dictionary:
		var w: Dictionary = wave
		if w.has("countMul"):
			parts.append("%s enemy count" % _pct_of(float(w["countMul"])))
		if w.has("intervalMul"):
			parts.append("%s spawn interval" % _pct_of(float(w["intervalMul"])))
		if w.has("delayMul"):
			parts.append("%s first delay" % _pct_of(float(w["delayMul"])))
	var enemy_mods: Variant = def.get("enemyMods")
	if enemy_mods is Dictionary and (enemy_mods as Dictionary).has("maxHp"):
		parts.append("%s enemy HP" % _pct_of(float((enemy_mods as Dictionary)["maxHp"])))
	var numeric: String
	if parts.is_empty():
		numeric = str(def.get("blurb", ""))
	elif def.has("scope"):
		numeric = "%s — %s" % [", ".join(parts), str(def["scope"])]
	else:
		numeric = ", ".join(parts)
	return "%s · +3rd star" % numeric
