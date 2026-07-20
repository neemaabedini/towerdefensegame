extends Control
class_name BuildRing
## World-anchored build menu: option buttons fan out in an arc around the
## selected empty site. Port of src/ui/BuildRing.ts — same measure-then-place
## layout (buttons are added to the tree and sized via reset_size() BEFORE
## being positioned, so real widths are used, never guessed angle spacing).
##
## Programmatic only (no .tscn) so nothing here can scene-merge-conflict.
## This Control is expected to be added as a full-rect child over the same
## area WorldDraw renders into (e.g. inside world_host); _ready() claims
## PRESET_FULL_RECT itself so the host only needs to add_child + setup().

## Emitted after a build actually happens (button click or activate_index)
## so the host can refresh its own HUD. This node re-lays itself out
## automatically — callers do not need to call refresh() in response.
signal acted()

var sim: GameSim
var db: DataDB
var world: WorldDraw

const GAP := 8.0
const ROW_PAD := 6.0
## BuildRing.ts:99 — below this world-space Y the ring flips under the site
## instead of above it, so it never renders off the top edge.
const FLIP_Y_THRESHOLD := 170.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# A full-rect Control defaults to MOUSE_FILTER_STOP, which would eat every
	# world click even where there's no button — must IGNORE so only the
	# buttons themselves (STOP, below) capture input.
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Wires the collaborators and does an initial layout. Call again only if
## sim/db/world are replaced (e.g. level reload with a fresh GameSim).
func setup(game_sim: GameSim, data_db: DataDB, world_draw: WorldDraw) -> void:
	sim = game_sim
	db = data_db
	world = world_draw
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	refresh()


## Rebuilds and repositions the ring from current sim state. Call whenever
## selection, phase, or money changes — never per frame (house rule: DOM/UI
## rebuilds only happen on change notifications).
func refresh() -> void:
	_clear()
	if sim == null or db == null or world == null:
		visible = false
		return
	# BuildRing.ts:29 — day-only, and only for a selected EMPTY site.
	if sim.phase != "day" or sim.selected_site_id == "":
		visible = false
		return
	var site := sim._find_site(sim.selected_site_id)
	if site.is_empty() or str(site["building_id"]) != "":
		visible = false
		return
	visible = true

	var center := world.world_to_screen(Vector2(float(site["x"]), float(site["y"])))
	var opts: Array = site["options"]
	var buttons: Array[Button] = []
	for i in opts.size():
		var def_id := str(opts[i])
		var def := db.get_building(def_id)
		var can := sim.money >= float(def.get("cost", 0))

		var btn := Button.new()
		btn.mouse_filter = Control.MOUSE_FILTER_STOP
		btn.disabled = not can
		btn.tooltip_text = str(def.get("description", ""))
		btn.custom_minimum_size = Vector2(70.0, 0.0)

		var text := "[%d] %s\n%d₡" % [i + 1, str(def.get("name", def_id)), int(def.get("cost", 0))]
		# BuildRing.ts:64-69 — income-on-button for mining (crystal-scaled) and
		# flat-income defs; no hover-only info (C2/C7).
		if def.has("mining") or float(def.get("incomePerDay", 0)) > 0.0:
			text += "\n%d₡/dawn" % _preview_income(site, def)
		btn.text = text
		btn.modulate = Color(1, 1, 1, 1.0 if can else 0.55)

		var site_id_captured := str(site["id"])
		var def_id_captured := def_id
		btn.pressed.connect(func(): _build(site_id_captured, def_id_captured))

		add_child(btn)
		btn.reset_size()
		buttons.append(btn)

	var flip := float(site["y"]) < FLIP_Y_THRESHOLD
	var clearance := maxf(62.0, 72.0 * world.scale_factor)
	var base_y := center.y + clearance if flip else center.y - clearance
	_layout_arc(buttons, center.x, base_y, flip)


## Keyboard/gamepad equivalent of clicking option `i` (0-based) on the
## currently selected site. The host binds "1".."4" to this — kept as a
## separate entry point so mouse and keyboard share the same _build() path.
func activate_index(i: int) -> bool:
	if sim == null or sim.selected_site_id == "":
		return false
	var site := sim._find_site(sim.selected_site_id)
	if site.is_empty():
		return false
	var opts: Array = site.get("options", [])
	if i < 0 or i >= opts.size():
		return false
	return _build(str(site["id"]), str(opts[i]))


func _build(site_id: String, def_id: String) -> bool:
	var ok := sim.build_at(site_id, def_id)
	if ok:
		acted.emit()
		refresh()
	return ok


## Game.ts:455-468 (previewIncome) — L1 dawn income this def would pay if
## built at `site` right now. Mining defs scale by node count in range;
## flat-income defs pay incomePerDay as-is. Never touched by global mods
## (D8), so scaled_stats is called with no branch/mods args on purpose.
func _preview_income(site: Dictionary, def: Dictionary) -> int:
	var stats := sim.scaled_stats(def, 1)
	if def.has("mining"):
		var res: Dictionary = site.get("resources", {})
		var kind := str(def["mining"].get("resource", "mineral"))
		var nodes := float(res.get(kind, 0))
		return int(round(float(stats["incomePerDay"]) * nodes))
	if float(def.get("incomePerDay", 0)) > 0.0:
		return int(round(float(stats["incomePerDay"])))
	return 0


## BuildRing.ts:87-111 — lay buttons out left-to-right from real measured
## widths (never overlap), centered on the site, clamped on-screen, with a
## slight parabolic lift on the middle buttons for an arc feel.
func _layout_arc(buttons: Array[Button], center_x: float, base_y: float, flip: bool) -> void:
	if buttons.is_empty():
		return
	var total := 0.0
	for b in buttons:
		total += b.size.x
	total += GAP * maxf(0.0, buttons.size() - 1)

	var x := center_x - total / 2.0
	x = clampf(x, ROW_PAD, maxf(ROW_PAD, size.x - total - ROW_PAD))

	var mid := (buttons.size() - 1) / 2.0
	for i in buttons.size():
		var btn := buttons[i]
		var t := 0.0 if mid == 0.0 else (float(i) - mid) / mid
		var arc_lift := 12.0 * (1.0 - t * t)
		var center_y := base_y + arc_lift if flip else base_y - arc_lift
		btn.position = Vector2(x, center_y - btn.size.y / 2.0)
		x += btn.size.x + GAP


func _clear() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
