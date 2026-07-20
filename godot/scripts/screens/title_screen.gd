extends Control
class_name TitleScreen
## Title/home screen — Godot port of src/ui/screens/TitleScreen.ts. First
## thing a player sees: heading + subtitle sourced from db.strings
## (TitleScreen.ts:24-25 — the current port's scene file hardcodes the
## subtitle instead, which is the drift bug this rebuild fixes), a Play
## button that always routes to level select, a Continue button shown only
## with saved progress that jumps straight to the furthest unlocked level
## (TitleScreen.ts:28-34), Settings, and Quit.
##
## Built entirely in code (no .tscn) so concurrent scene/script edits
## elsewhere in the port never conflict with this file.
##
## Host usage:
##   var title := TitleScreen.new()
##   add_child(title)
##   title.setup(db, save)
##   title.play_pressed.connect(func(): ...go to level select...)
##   title.continue_pressed.connect(func(level_index): ...start that level...)
##   title.settings_pressed.connect(func(): ...go to settings...)
##   title.quit_pressed.connect(func(): get_tree().quit())
## Call title.refresh() any time this screen is about to become visible
## again (save.has_progress() may have changed since the last visit).

signal play_pressed()
## level_index is the furthest unlocked level, already clamped — mirrors
## TitleScreen.ts:29-33's `Math.max(0, Math.min(unlockedLevels - 1, levelCount - 1))`.
signal continue_pressed(level_index: int)
signal settings_pressed()
signal quit_pressed()

var _db: DataDB
var _save: SaveData
var _built := false

var _heading: Label
var _subtitle: Label
var _btn_play: Button
var _btn_continue: Button
var _btn_settings: Button
var _btn_quit: Button


func _ready() -> void:
	_ensure_built()


## Wires the data sources and does the first refresh. Safe to call more than
## once (e.g. re-pointing at a reloaded save) — idempotent on the node tree.
func setup(db: DataDB, save: SaveData) -> void:
	_ensure_built()
	_db = db
	_save = save
	refresh()


## Re-syncs text + Continue visibility from the current save/db. Cheap —
## call whenever the screen becomes active or the save may have changed,
## never per frame (see house rule: screens rebuild only on change
## notifications, matching TitleScreen.ts:38-45's render()).
func refresh() -> void:
	if _db == null or _save == null:
		return
	var strings: Dictionary = _db.strings
	_heading.text = str(strings.get("gameTitle", "City Defense"))
	var subtitle := str(strings.get("gameSubtitle", ""))
	_subtitle.text = subtitle
	_subtitle.visible = subtitle.length() > 0
	_btn_continue.visible = _save.has_progress()


## Lazy build so this works both the normal way (host add_child()s the node
## and Godot calls _ready()) and in isolation (a test calls setup() directly
## without ever parenting the node to a tree).
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
	vbox.add_theme_constant_override("separation", 14)
	vbox.custom_minimum_size = Vector2(360, 0)
	panel.add_child(vbox)

	_heading = Label.new()
	_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_heading.add_theme_font_size_override("font_size", 36)
	_heading.add_theme_color_override("font_color", Color(1.0, 0.79, 0.16))
	_heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(_heading)

	_subtitle = Label.new()
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.add_theme_font_size_override("font_size", 16)
	_subtitle.add_theme_color_override("font_color", Color(0.6, 0.66, 0.76))
	_subtitle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(_subtitle)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 10)
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(spacer)

	_btn_play = _menu_button("Play")
	_btn_play.pressed.connect(func(): play_pressed.emit())
	vbox.add_child(_btn_play)

	_btn_continue = _menu_button("Continue")
	_btn_continue.pressed.connect(_on_continue)
	vbox.add_child(_btn_continue)

	_btn_settings = _menu_button("Settings")
	_btn_settings.pressed.connect(func(): settings_pressed.emit())
	vbox.add_child(_btn_settings)

	_btn_quit = _menu_button("Quit")
	_btn_quit.pressed.connect(func(): quit_pressed.emit())
	vbox.add_child(_btn_quit)


func _on_continue() -> void:
	if _save == null or _db == null:
		return
	var level_count := _db.level_count()
	var furthest := clampi(_save.unlocked_levels - 1, 0, level_count - 1)
	continue_pressed.emit(furthest)


func _menu_button(text: String) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.mouse_filter = Control.MOUSE_FILTER_STOP
	btn.custom_minimum_size = Vector2(0, 44)
	btn.add_theme_font_size_override("font_size", 18)
	return btn


func _panel_style() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.10, 0.17, 0.94)
	sb.border_color = Color(1.0, 0.79, 0.16, 0.5)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.set_content_margin_all(28)
	return sb
