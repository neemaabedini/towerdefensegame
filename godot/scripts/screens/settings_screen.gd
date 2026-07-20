extends Control
class_name SettingsScreen
## Settings screen — Godot port of the non-audio portion of
## src/ui/PauseModal.ts (the web build's settings live inside its pause
## modal; this port gives them their own screen, reached from
## TitleScreen's Settings button per the ticket).
##
## Deliberately NO volume/mute controls: this port has no audio system yet,
## and a dead slider is worse than no slider at all (ticket instruction).
## Covers instead:
##   - Night speed (1x/2x), persisted to save.settings.night_speed — the
##     port-side equivalent of AppShell.ts:308-321's toggleNightSpeed / F key.
##   - A fullscreen toggle (new; no web equivalent since browsers have their
##     own fullscreen chrome). See the PERSISTENCE GAP note below.
##   - A key-reference block sourced from project.godot's [input] section and
##     main.gd's _unhandled_input (WASD/1-4/Space/R + left-click-to-select) —
##     read from those files, not invented.
##
## PERSISTENCE GAP (report item — save_data.gd is off-limits to this
## ticket's file ownership): _on_fullscreen_toggled writes
## save.settings["fullscreen"] and calls save_to_disk(), which does persist
## it to the ConfigFile on disk. But SaveData._from_raw() (save_data.gd
## :318-333) rebuilds `settings` from an explicit key whitelist
## (volume/muted/night_speed/hero_weapon/perks) on the NEXT load, silently
## dropping any key outside that list. So the toggle works live and survives
## until the app restarts, but needs one line added to _from_raw's
## dictionary literal ("fullscreen": bool(raw_settings.get("fullscreen",
## false))) before it truly round-trips across restarts.
##
## Built entirely in code (no .tscn) so concurrent scene/script edits
## elsewhere in the port never conflict with this file.
##
## Host usage:
##   var settings := SettingsScreen.new()
##   add_child(settings)
##   settings.setup(db, save)
##   settings.back_pressed.connect(func(): ...go to title...)
## Call settings.refresh() any time this screen is about to become visible
## again (save.settings may have changed underneath it).

signal back_pressed()
## Fired in addition to the direct save.settings write, so a host that
## caches night speed (like AppShell.ts's own `_nightSpeed` field) can react
## immediately instead of polling save.settings every frame.
signal night_speed_changed(speed: int)
signal fullscreen_changed(enabled: bool)

var _db: DataDB
var _save: SaveData
var _built := false

var _btn_speed_1x: Button
var _btn_speed_2x: Button
var _fullscreen_check: CheckButton


func _ready() -> void:
	_ensure_built()


func setup(db: DataDB, save: SaveData) -> void:
	_ensure_built()
	_db = db
	_save = save
	refresh()


## Cheap toggle-state sync — call whenever this screen becomes active or
## save.settings may have changed underneath it, never per frame.
func refresh() -> void:
	if _save == null:
		return
	var speed := int(_save.settings.get("night_speed", 1))
	_btn_speed_1x.button_pressed = speed == 1
	_btn_speed_2x.button_pressed = speed == 2
	_fullscreen_check.button_pressed = bool(_save.settings.get("fullscreen", false))


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

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _panel_style())
	center.add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.custom_minimum_size = Vector2(420, 0)
	vbox.add_theme_constant_override("separation", 16)
	panel.add_child(vbox)

	var heading := Label.new()
	heading.text = "Settings"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 28)
	heading.add_theme_color_override("font_color", Color(1.0, 0.79, 0.16))
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(heading)

	# -- night speed --
	var speed_row := HBoxContainer.new()
	speed_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(speed_row)

	var speed_label := Label.new()
	speed_label.text = "Night speed"
	speed_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	speed_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox_label_color(speed_label)
	speed_row.add_child(speed_label)

	var speed_group := ButtonGroup.new()
	_btn_speed_1x = _toggle_button("1x", speed_group)
	_btn_speed_1x.pressed.connect(_on_speed_pressed.bind(1))
	speed_row.add_child(_btn_speed_1x)

	_btn_speed_2x = _toggle_button("2x", speed_group)
	_btn_speed_2x.pressed.connect(_on_speed_pressed.bind(2))
	speed_row.add_child(_btn_speed_2x)

	# -- fullscreen --
	var fs_row := HBoxContainer.new()
	fs_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(fs_row)

	var fs_label := Label.new()
	fs_label.text = "Fullscreen"
	fs_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fs_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox_label_color(fs_label)
	fs_row.add_child(fs_label)

	_fullscreen_check = CheckButton.new()
	_fullscreen_check.mouse_filter = Control.MOUSE_FILTER_STOP
	_fullscreen_check.toggled.connect(_on_fullscreen_toggled)
	fs_row.add_child(_fullscreen_check)

	# -- key reference --
	var keys_label := Label.new()
	keys_label.text = "Controls"
	keys_label.add_theme_font_size_override("font_size", 16)
	keys_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.85))
	keys_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(keys_label)

	var keys_grid := GridContainer.new()
	keys_grid.columns = 2
	keys_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	keys_grid.add_theme_constant_override("h_separation", 16)
	keys_grid.add_theme_constant_override("v_separation", 4)
	vbox.add_child(keys_grid)

	# Sourced from project.godot's [input] section (hero_up/down/left/right =
	# W/S/A/D, start_night = Space, restart = R, build_1..4 = 1..4) and
	# main.gd's _unhandled_input (left click = select_at) — not invented.
	var bindings := [
		["WASD", "Move hero (night)"],
		["Left Click", "Select site / building"],
		["1 – 4", "Build option"],
		["Space", "Start night / continue"],
		["R", "Restart"],
	]
	for pair in bindings:
		var key_label := Label.new()
		key_label.text = str(pair[0])
		key_label.add_theme_color_override("font_color", Color(1.0, 0.79, 0.16))
		key_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		keys_grid.add_child(key_label)

		var action_label := Label.new()
		action_label.text = str(pair[1])
		action_label.add_theme_color_override("font_color", Color(0.85, 0.87, 0.92))
		action_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		keys_grid.add_child(action_label)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 6)
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(spacer)

	var btn_back := Button.new()
	btn_back.text = "Back"
	btn_back.mouse_filter = Control.MOUSE_FILTER_STOP
	btn_back.custom_minimum_size = Vector2(0, 40)
	btn_back.pressed.connect(func(): back_pressed.emit())
	vbox.add_child(btn_back)


func vbox_label_color(label: Label) -> void:
	label.add_theme_color_override("font_color", Color(0.9, 0.91, 0.95))


func _toggle_button(text: String, group: ButtonGroup) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.toggle_mode = true
	btn.button_group = group
	btn.mouse_filter = Control.MOUSE_FILTER_STOP
	btn.custom_minimum_size = Vector2(48, 0)
	return btn


func _on_speed_pressed(speed: int) -> void:
	if _save == null:
		return
	_save.settings["night_speed"] = speed
	_save.save_to_disk()
	night_speed_changed.emit(speed)
	refresh()


func _on_fullscreen_toggled(enabled: bool) -> void:
	if _save == null:
		return
	_save.settings["fullscreen"] = enabled
	_save.save_to_disk()
	DisplayServer.window_set_mode(
		DisplayServer.WINDOW_MODE_FULLSCREEN if enabled else DisplayServer.WINDOW_MODE_WINDOWED
	)
	fullscreen_changed.emit(enabled)


func _panel_style() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.10, 0.17, 0.94)
	sb.border_color = Color(1.0, 0.79, 0.16, 0.5)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.set_content_margin_all(28)
	return sb
