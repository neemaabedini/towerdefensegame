extends Control
## App shell for the Godot port: title → play level 0, day/night loop.

@onready var world: Node2D = $WorldHost/World
@onready var world_host: Control = $WorldHost
@onready var hud_label: Label = $HUD/TopBar/Status
@onready var hint_label: Label = $HUD/Hint
@onready var title_panel: PanelContainer = $TitlePanel
@onready var btn_play: Button = $TitlePanel/VBox/PlayButton
@onready var btn_quit: Button = $TitlePanel/VBox/QuitButton
@onready var end_panel: PanelContainer = $EndPanel
@onready var end_label: Label = $EndPanel/VBox/EndLabel
@onready var btn_again: Button = $EndPanel/VBox/AgainButton
@onready var btn_menu: Button = $EndPanel/VBox/MenuButton

var db: DataDB
var sim: GameSim
var screen: String = "title" # title | game


func _ready() -> void:
	db = DataDB.new()
	db.load_all()
	sim = GameSim.new(db)
	world.setup(sim, db)
	btn_play.pressed.connect(_on_play)
	btn_quit.pressed.connect(func(): get_tree().quit())
	btn_again.pressed.connect(_on_again)
	btn_menu.pressed.connect(_on_menu)
	sim.phase_changed.connect(_on_phase)
	sim.money_changed.connect(func(_m): _refresh_hud())
	_show_title()
	_fit_world()
	get_viewport().size_changed.connect(_fit_world)
	var title := str(db.strings.get("gameTitle", "City Defense"))
	$TitlePanel/VBox/Title.text = title
	get_window().title = title + " (Godot)"


func _fit_world() -> void:
	await get_tree().process_frame
	if world_host:
		world.fit_to_rect(Rect2(Vector2.ZERO, world_host.size))


func _process(dt: float) -> void:
	if screen != "game":
		return
	# Hero move
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
	sim.update(dt)
	_refresh_hud()


func _unhandled_input(event: InputEvent) -> void:
	if screen != "game":
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var local := world_host.get_local_mouse_position()
		var world_pos := world.screen_to_world(local)
		sim.select_at(world_pos)
		_refresh_hud()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("start_night"):
		if sim.phase == "day":
			sim.start_night()
		elif sim.phase == "victory" or sim.phase == "defeat":
			_on_again()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("restart"):
		sim.restart()
		end_panel.visible = false
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("build_1"):
		sim.build_option(0)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("build_2"):
		sim.build_option(1)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("build_3"):
		sim.build_option(2)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("build_4"):
		sim.build_option(3)
		get_viewport().set_input_as_handled()


func _on_play() -> void:
	screen = "game"
	title_panel.visible = false
	end_panel.visible = false
	world_host.visible = true
	$HUD.visible = true
	sim.load_level(0)
	_fit_world()
	_refresh_hud()
	hint_label.text = "Day: click a site, press 1–4 to build. Space starts night. WASD moves hero."


func _on_again() -> void:
	end_panel.visible = false
	sim.restart()
	_refresh_hud()


func _on_menu() -> void:
	_show_title()


func _show_title() -> void:
	screen = "title"
	title_panel.visible = true
	end_panel.visible = false
	world_host.visible = false
	$HUD.visible = false


func _on_phase(phase: String) -> void:
	_refresh_hud()
	if phase == "victory":
		end_label.text = "VICTORY"
		end_panel.visible = true
		hint_label.text = "Space or Restart to play again."
	elif phase == "defeat":
		end_label.text = "DEFEAT"
		end_panel.visible = true
		hint_label.text = "Space or R to retry."
	elif phase == "night":
		hint_label.text = "Night — defend the HQ. WASD to fight."
	elif phase == "day":
		hint_label.text = "Day — build (1–4), then Space for next night."


func _refresh_hud() -> void:
	if sim == null:
		return
	var site_info := ""
	if sim.selected_site_id != "":
		var site := sim._find_site(sim.selected_site_id)
		if not site.is_empty():
			var opts: Array = site["options"]
			var parts: PackedStringArray = []
			for i in opts.size():
				var def := db.get_building(str(opts[i]))
				parts.append("%d:%s (%d₡)" % [i + 1, def.get("name", opts[i]), int(def.get("cost", 0))])
			site_info = "  |  " + "  ".join(parts)
	hud_label.text = "₡%d  |  Wave %d/%d  |  %s%s" % [
		int(sim.money),
		sim.wave_index + 1,
		sim.total_waves(),
		sim.phase.to_upper(),
		site_info,
	]
	var hq := sim._find_building(sim.hq_id)
	if not hq.is_empty():
		hud_label.text += "  |  HQ %d/%d" % [int(hq["hp"]), int(hq["max_hp"])]
