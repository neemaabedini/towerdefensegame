extends Control
## App shell for the Godot port — mirrors src/app/AppShell.ts.
## Screen flow: title → levelSelect → game, with a settings screen and a pause
## modal hanging off it. Owns the SaveData instance; it is the ONLY writer of
## persistence (AppShell.ts:33-35).

@onready var world: WorldDraw = $WorldHost/World as WorldDraw
@onready var world_host: Control = $WorldHost
@onready var hud_label: Label = $HUD/TopBar/Status
@onready var hint_label: Label = $HUD/Hint
@onready var end_panel: PanelContainer = $EndPanel
@onready var end_label: Label = $EndPanel/VBox/EndLabel
@onready var end_detail: Label = $EndPanel/VBox/EndDetail
@onready var btn_next: Button = $EndPanel/VBox/NextButton
@onready var btn_again: Button = $EndPanel/VBox/AgainButton
@onready var btn_menu: Button = $EndPanel/VBox/MenuButton
@onready var pause_panel: PanelContainer = $PausePanel
@onready var btn_resume: Button = $PausePanel/VBox/ResumeButton
@onready var btn_pause_restart: Button = $PausePanel/VBox/RestartButton
@onready var btn_pause_settings: Button = $PausePanel/VBox/SettingsButton
@onready var btn_pause_quit: Button = $PausePanel/VBox/QuitToMenuButton

var db: DataDB
var sim: GameSim
var save: SaveData

var title_screen: TitleScreen
var level_select: LevelSelect
var settings_screen: SettingsScreen
var build_ring: BuildRing
var upgrade_chip: UpgradeChip

## title | levelSelect | settings | game (AppShell.ts:18)
var screen: String = "title"
var paused: bool = false
## Which screen to return to when settings closes.
var _settings_return: String = "title"
## Mutators are session-only (AppShell.ts:57-60) — perks/weapon persist.
var _active_mutator_count: int = 0


func _ready() -> void:
	db = DataDB.new()
	db.load_all()

	save = SaveData.load_from_disk()
	save.level_ids = db.level_ids()
	save.perk_defs = db.perks
	save.hero_defs = db.heroes
	_apply_window_settings()

	sim = GameSim.new(db)
	world.setup(sim, db)
	sim.phase_changed.connect(_on_phase)
	sim.money_changed.connect(func(_m): _refresh_hud())

	_build_screens()
	_build_popups()

	end_panel.visible = false
	pause_panel.visible = false
	btn_next.pressed.connect(_on_next_level)
	btn_again.pressed.connect(_on_again)
	btn_menu.pressed.connect(_on_menu)
	btn_resume.pressed.connect(_set_paused.bind(false))
	btn_pause_restart.pressed.connect(_on_again)
	btn_pause_settings.pressed.connect(_open_settings.bind("game"))
	btn_pause_quit.pressed.connect(_on_menu)

	_show_title()
	_fit_world()
	get_viewport().size_changed.connect(_fit_world)
	get_window().title = str(db.strings.get("gameTitle", "City Defense")) + " (Godot)"


func _build_screens() -> void:
	title_screen = TitleScreen.new()
	add_child(title_screen)
	title_screen.setup(db, save)
	title_screen.play_pressed.connect(_show_level_select)
	title_screen.continue_pressed.connect(_on_continue)
	title_screen.settings_pressed.connect(_open_settings.bind("title"))
	title_screen.quit_pressed.connect(func(): get_tree().quit())

	level_select = LevelSelect.new()
	add_child(level_select)
	level_select.setup(db, save)
	level_select.back_pressed.connect(_show_title)
	level_select.level_chosen.connect(_start_level)

	settings_screen = SettingsScreen.new()
	add_child(settings_screen)
	settings_screen.setup(db, save)
	settings_screen.back_pressed.connect(_close_settings)
	settings_screen.fullscreen_changed.connect(func(_on): _apply_window_settings())


func _build_popups() -> void:
	build_ring = BuildRing.new()
	world_host.add_child(build_ring)
	build_ring.setup(sim, db, world)
	build_ring.acted.connect(_on_popup_acted)

	upgrade_chip = UpgradeChip.new()
	world_host.add_child(upgrade_chip)
	upgrade_chip.setup(sim, db, world)
	upgrade_chip.acted.connect(_on_popup_acted)


func _apply_window_settings() -> void:
	var want_fullscreen := bool(save.settings.get("fullscreen", true))
	# Exclusive fullscreen on multi-monitor 5K setups; fall back to maximized windowed.
	var mode := (
		DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN
		if want_fullscreen
		else DisplayServer.WINDOW_MODE_MAXIMIZED
	)
	if DisplayServer.window_get_mode() != mode:
		DisplayServer.window_set_mode(mode)
	# Ensure the world re-fits after the OS resizes the window.
	call_deferred("_fit_world")


func _fit_world() -> void:
	await get_tree().process_frame
	if world_host:
		world.fit_to_rect(Rect2(Vector2.ZERO, world_host.size))
		_refresh_popups()


# -- screen flow -------------------------------------------------------------

func _set_screen(next: String) -> void:
	# Any transition clears pause state (AppShell.ts:355).
	paused = false
	pause_panel.visible = false
	screen = next
	title_screen.visible = next == "title"
	level_select.visible = next == "levelSelect"
	settings_screen.visible = next == "settings"
	world_host.visible = next == "game"
	$HUD.visible = next == "game"
	if next != "game":
		end_panel.visible = false


func _show_title() -> void:
	title_screen.refresh()
	_set_screen("title")


func _show_level_select() -> void:
	level_select.refresh()
	_set_screen("levelSelect")


func _open_settings(return_to: String) -> void:
	_settings_return = return_to
	settings_screen.refresh()
	_set_screen("settings")


func _close_settings() -> void:
	if _settings_return == "game":
		_set_screen("game")
		_set_paused(true)
	elif _settings_return == "levelSelect":
		_show_level_select()
	else:
		_show_title()


func _on_continue(level_index: int) -> void:
	# Continue replays the furthest unlocked level with the saved loadout.
	_start_level(
		level_index,
		str(save.settings.get("hero_weapon", "rifle")),
		save.selected_perks(),
		[],
	)


func _start_level(index: int, hero_id: String, perks: Array, mutators: Array) -> void:
	# Loadout must be set BEFORE load_level so it seeds global mods and
	# starting credits ahead of the HQ being built (Game.ts:166-168).
	sim.set_hero_loadout(hero_id)
	sim.set_loadout(perks, mutators)
	_active_mutator_count = mutators.size()
	sim.load_level(index)
	_set_screen("game")
	_fit_world()
	_refresh_hud()
	_refresh_popups()


func _on_next_level() -> void:
	var next := sim.level_index + 1
	if next >= db.level_count():
		_show_level_select()
		return
	_start_level(
		next,
		str(save.settings.get("hero_weapon", "rifle")),
		save.selected_perks(),
		[],
	)


func _on_again() -> void:
	end_panel.visible = false
	_set_paused(false)
	sim.restart()
	_refresh_hud()
	_refresh_popups()


func _on_menu() -> void:
	_show_title()


func _set_paused(value: bool) -> void:
	if screen != "game":
		return
	paused = value
	pause_panel.visible = value


# -- frame -------------------------------------------------------------------

func _process(dt: float) -> void:
	if screen != "game":
		return
	# Frame sub-stepping, not dt scaling — matches AppShell.stepsForFrame
	# (AppShell.ts:281-285) so 2x night runs the same integration steps.
	for _i in _steps_for_frame():
		_step(dt)
	_refresh_hud()
	_refresh_popups()


func _steps_for_frame() -> int:
	if paused:
		return 0
	if sim.phase == "night" and int(save.settings.get("night_speed", 1)) == 2:
		return 2
	return 1


func _step(dt: float) -> void:
	var dx := 0.0
	var dy := 0.0
	if Input.is_action_pressed("hero_left"):
		dx -= 1.0
	if Input.is_action_pressed("hero_right"):
		dx += 1.0
	if Input.is_action_pressed("hero_up"):
		dy -= 1.0
	if Input.is_action_pressed("hero_down"):
		dy += 1.0
	sim.set_hero_move(dx, dy)
	# Clamp the step so a window drag or hitch can't tunnel enemies through
	# waypoints (main.ts:326 clamps to 0.05).
	sim.update(minf(dt, 0.05))


# -- input -------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if screen != "game":
		return

	# Pause toggle wins over the paused-input swallow below (main.ts:187-191).
	if event.is_action_pressed("pause"):
		_set_paused(not paused)
		get_viewport().set_input_as_handled()
		return

	if paused:
		# Esc closes the modal; everything else is swallowed (main.ts:195-198).
		if event.is_action_pressed("cancel"):
			_set_paused(false)
			get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var local: Vector2 = world_host.get_local_mouse_position()
		sim.select_at(world.screen_to_world(local))
		_refresh_popups()
		_refresh_hud()
		get_viewport().set_input_as_handled()
		return

	if event.is_action_pressed("cancel"):
		# Deselect first, else open pause (main.ts:248-257).
		if sim.selected_site_id != "" or sim.selected_building_id != "":
			sim.select_site("")
			_refresh_popups()
		else:
			_set_paused(true)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("start_night"):
		if sim.phase == "day":
			sim.start_night()
			_refresh_popups()
		elif sim.phase == "victory":
			_on_next_level()
		elif sim.phase == "defeat":
			_on_again()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("restart"):
		_on_again()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("toggle_speed"):
		var next_speed := 1 if int(save.settings.get("night_speed", 1)) == 2 else 2
		save.settings["night_speed"] = next_speed
		save.save_to_disk_debounced()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("upgrade"):
		upgrade_chip.activate_upgrade()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("sell"):
		upgrade_chip.activate_sell()
		get_viewport().set_input_as_handled()
	else:
		for i in 4:
			if event.is_action_pressed("build_%d" % (i + 1)):
				_activate_index(i)
				get_viewport().set_input_as_handled()
				return


## Number keys are overloaded: they pick a branch when one is pending on the
## selected building, otherwise they build (main.ts:210-229).
func _activate_index(i: int) -> void:
	if sim.selected_building_id != "" and not sim.pending_branch(sim.selected_building_id).is_empty():
		upgrade_chip.activate_index(i)
	else:
		build_ring.activate_index(i)


func _on_popup_acted() -> void:
	_refresh_popups()
	_refresh_hud()


func _refresh_popups() -> void:
	if screen != "game":
		return
	build_ring.refresh()
	upgrade_chip.refresh()


# -- phase / HUD -------------------------------------------------------------

func _on_phase(phase: String) -> void:
	_refresh_hud()
	_refresh_popups()
	if phase == "victory":
		_record_victory()
		_show_end_panel(true)
	elif phase == "defeat":
		_show_end_panel(false)
	elif phase == "night":
		hint_label.text = "Night — defend the HQ. WASD to fight. F toggles 2x."
	elif phase == "day":
		hint_label.text = "Day — click a site to build, a building to upgrade (U) or sell (X). Space starts the night."


func _record_victory() -> void:
	var hq := sim._find_building(sim.hq_id)
	if hq.is_empty():
		return
	var level_id := str(db.get_level(sim.level_index).get("id", ""))
	save.record_victory(
		level_id,
		sim.level_index,
		float(hq["hp"]),
		float(hq["max_hp"]),
		_active_mutator_count,
		db.level_count(),
	)
	save.save_to_disk()


func _show_end_panel(victory: bool) -> void:
	var level_name := str(db.get_level(sim.level_index).get("name", "this outpost"))
	if victory:
		var hq := sim._find_building(sim.hq_id)
		var pct := 0
		if not hq.is_empty() and float(hq["max_hp"]) > 0.0:
			pct = int(round(float(hq["hp"]) / float(hq["max_hp"]) * 100.0))
		end_label.text = "Victory!"
		end_detail.text = "You held %s. HQ at %d%%." % [level_name, pct]
		btn_next.visible = sim.level_index + 1 < db.level_count()
		btn_next.text = "Next Level"
		hint_label.text = "Space for the next level."
	else:
		end_label.text = "Defeat"
		end_detail.text = "%s fell. The HQ was destroyed." % level_name
		btn_next.visible = false
		hint_label.text = "Space or R to retry."
	end_panel.visible = true


func _refresh_hud() -> void:
	if sim == null:
		return
	var detail := ""
	if sim.selected_building_id != "":
		var b := sim._find_building(sim.selected_building_id)
		if not b.is_empty():
			var stats := sim.stats_for(sim.selected_building_id)
			var bdef := db.get_building(str(b["def_id"]))
			detail = "  |  %s Lv%d  %d/%d hp" % [
				bdef.get("name", b["def_id"]),
				int(b["level"]),
				int(b["hp"]),
				int(b["max_hp"]),
			]
			if float(stats.get("damage", 0)) > 0.0:
				detail += "  dmg %d  rng %d" % [int(stats["damage"]), int(stats["range"])]
	elif sim.selected_site_id != "":
		var site := sim._find_site(sim.selected_site_id)
		if not site.is_empty() and str(site["building_id"]) == "":
			detail = "  |  %s site — pick 1-%d" % [
				str(site.get("category", "any")).to_upper(),
				(site["options"] as Array).size(),
			]

	var speed := ""
	if sim.phase == "night" and int(save.settings.get("night_speed", 1)) == 2:
		speed = " 2x"
	hud_label.text = "₡%d  |  Wave %d/%d  |  %s%s%s" % [
		int(sim.money),
		mini(sim.wave_index + 1, sim.total_waves()),
		sim.total_waves(),
		sim.phase.to_upper(),
		speed,
		detail,
	]
	var hq := sim._find_building(sim.hq_id)
	if not hq.is_empty():
		hud_label.text += "  |  HQ %d/%d" % [int(hq["hp"]), int(hq["max_hp"])]
