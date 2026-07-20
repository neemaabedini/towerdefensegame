extends Control
class_name UpgradeChip
## World-anchored chip row above the selected building: the upgrade chip (or
## one choice chip per branch option, when a branch pick is pending) plus the
## undo/sell chip. Port of src/ui/UpgradeChip.ts — same measure-then-place
## layout as BuildRing, with multi-row wrapping once there are more than 2
## chips so they can never overlap or run off-screen.
##
## Programmatic only (no .tscn). Expected to be added as a full-rect child
## over the same area WorldDraw renders into; _ready() claims
## PRESET_FULL_RECT itself so the host only needs to add_child + setup().

## Emitted after an upgrade/branch-pick/sell actually happens, so the host
## can refresh its own HUD. This node re-lays itself out automatically.
signal acted()

var sim: GameSim
var db: DataDB
var world: WorldDraw

## True when the current refresh() rendered branch-choice chips instead of
## the single upgrade chip — lets activate_index() know "1"/"2" mean "pick
## this branch option" rather than something else. Set only by refresh().
var _branch_active: bool = false
var _branch_options: Array = []

const GAP := 8.0
const ROW_GAP := 8.0
const ROW_PAD := 6.0
## UpgradeChip.ts:145 (mirrors BuildRing.ts:99) — flip the row below the
## building instead of above it near the top edge.
const FLIP_Y_THRESHOLD := 170.0

## buildings.ts describeStatMods — numeric-text derivation table shared by
## every branch chip so the label can never hand-type a percentage that
## drifts from the def's actual `mods` (docs/design-wave-legibility.md §7c).
const STAT_LABELS := {
	"damage": "damage",
	"fireRate": "fire rate",
	"range": "range",
	"splashRadius": "splash radius",
	"maxHp": "max HP",
}
const STAT_ORDER := ["damage", "fireRate", "range", "splashRadius", "maxHp"]


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# See BuildRing._ready() — a full-rect Control defaults to STOP, which
	# would eat every world click; only the chips themselves (STOP) should.
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


## Rebuilds and repositions the chip row from current sim state. Call
## whenever selection, phase, or money changes — never per frame.
func refresh() -> void:
	_clear()
	_branch_active = false
	_branch_options = []
	if sim == null or db == null or world == null:
		visible = false
		return
	# UpgradeChip.ts:31 — day-only, and only for a selected building. Unlike
	# the sell chip below, the HQ is NOT excluded here (R5c: the HQ can
	# upgrade/branch; only selling it is forbidden).
	if sim.phase != "day" or sim.selected_building_id == "":
		visible = false
		return
	var b := sim._find_building(sim.selected_building_id)
	if b.is_empty():
		visible = false
		return
	visible = true

	var def := db.get_building(str(b["def_id"]))
	var center := world.world_to_screen(Vector2(float(b["x"]), float(b["y"])))
	var buttons: Array[Button] = []
	var maxed := int(b["level"]) >= int(def.get("maxLevel", 1))
	var branch: Dictionary = {} if maxed else sim.pending_branch(str(b["id"]))

	if not branch.is_empty():
		buttons.append_array(_build_branch_chips(b, branch))
	else:
		buttons.append(_build_upgrade_chip(b, def, maxed))

	var sell_chip := _build_sell_chip(b)
	if sell_chip != null:
		buttons.append(sell_chip)

	for btn in buttons:
		add_child(btn)
		btn.reset_size()

	_layout(buttons, center, float(b["y"]))


## UpgradeChip.ts:52-76 — one chip per branch option, keycapped 1/2/...,
## labelled with the DATA-DERIVED blurb (see _format_branch_blurb) so text
## can never drift from the mods it describes.
func _build_branch_chips(b: Dictionary, branch: Dictionary) -> Array[Button]:
	_branch_active = true
	var opts: Array = branch.get("options", [])
	_branch_options = opts
	var cost := sim.upgrade_cost(str(b["id"]))
	var can := sim.can_upgrade(str(b["id"]))
	var chips: Array[Button] = []
	for i in opts.size():
		var opt: Dictionary = opts[i]
		var chip := Button.new()
		chip.mouse_filter = Control.MOUSE_FILTER_STOP
		chip.disabled = not can
		chip.custom_minimum_size = Vector2(140.0, 44.0)
		chip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		chip.text = "[%d] %s · %s\n%d₡" % [i + 1, str(opt.get("name", "")), _format_branch_blurb(opt), int(cost)]
		chip.modulate = Color(1, 1, 1, 1.0 if can else 0.55)

		var building_id := str(b["id"])
		var choice_id := str(opt.get("id", ""))
		chip.pressed.connect(func(): _upgrade(building_id, choice_id))
		chips.append(chip)
	return chips


## UpgradeChip.ts:78-108 — the single Lv N -> N+1 chip, or a disabled
## "Lv N · Max" chip once the def is maxed.
func _build_upgrade_chip(b: Dictionary, def: Dictionary, maxed: bool) -> Button:
	var chip := Button.new()
	chip.mouse_filter = Control.MOUSE_FILTER_STOP
	chip.custom_minimum_size = Vector2(70.0, 44.0)
	if maxed:
		chip.disabled = true
		chip.text = "Lv %d · Max" % int(b["level"])
		chip.modulate = Color(1, 1, 1, 0.55)
	else:
		var cost := sim.upgrade_cost(str(b["id"]))
		var can := sim.can_upgrade(str(b["id"]))
		chip.disabled = not can
		chip.text = "[U] Lv %d → %d\n%d₡" % [int(b["level"]), int(b["level"]) + 1, int(cost)]
		chip.modulate = Color(1, 1, 1, 1.0 if can else 0.55)
		var building_id := str(b["id"])
		chip.pressed.connect(func(): _upgrade(building_id, ""))
	return chip


## UpgradeChip.ts:113-134 — undo/sell chip. `sim.get_sell_info` is the
## single source of truth for label/kind/refund (hard-returns {} for the
## HQ), so this stays in sync with GameSim.sell_or_undo by construction.
## Returns null (no chip) when there's nothing to sell/undo.
func _build_sell_chip(b: Dictionary) -> Button:
	var info := sim.get_sell_info(str(b["id"]))
	if info.is_empty():
		return null
	var chip := Button.new()
	chip.mouse_filter = Control.MOUSE_FILTER_STOP
	chip.custom_minimum_size = Vector2(70.0, 44.0)
	var label := "Sell" if str(info["kind"]) == "sell" else "Undo"
	chip.text = "[X] %s\n+%d₡" % [label, int(info["refund"])]
	var building_id := str(b["id"])
	chip.pressed.connect(func(): _sell(building_id))
	return chip


## Keyboard/gamepad equivalent of clicking branch-choice button `i` (0-based)
## — a no-op when no branch pick is currently showing.
func activate_index(i: int) -> bool:
	if sim == null or not _branch_active or i < 0 or i >= _branch_options.size():
		return false
	var opt: Dictionary = _branch_options[i]
	return _upgrade(sim.selected_building_id, str(opt.get("id", "")))


## Keyboard/gamepad equivalent of the "U" key. Mirrors UpgradeChip.ts's
## comment "U alone is a no-op until one is picked" — GameSim.upgrade()
## itself rejects an empty branch_choice while a branch pick is pending, so
## no extra guard is needed here.
func activate_upgrade() -> bool:
	if sim == null or sim.selected_building_id == "":
		return false
	return _upgrade(sim.selected_building_id, "")


## Keyboard/gamepad equivalent of the "X" key.
func activate_sell() -> bool:
	if sim == null or sim.selected_building_id == "":
		return false
	return _sell(sim.selected_building_id)


func _upgrade(building_id: String, branch_choice: String) -> bool:
	var ok := sim.upgrade(building_id, branch_choice)
	if ok:
		acted.emit()
		refresh()
	return ok


func _sell(building_id: String) -> bool:
	var ok := sim.sell_or_undo(building_id)
	if ok:
		acted.emit()
		refresh()
	return ok


## describeStatMods (buildings.ts:277-283) — "+8% damage" / "-15% max HP"
## strings mechanically derived from a mods multiplier set.
func _describe_stat_mods(mods: Dictionary) -> Array[String]:
	var parts: Array[String] = []
	for key in STAT_ORDER:
		if mods.has(key):
			var pct := int(round((float(mods[key]) - 1.0) * 100.0))
			var sign := "+" if pct >= 0 else ""
			parts.append("%s%d%% %s" % [sign, pct, STAT_LABELS[key]])
	return parts


## formatBranchBlurb (buildings.ts:294-299 / UpgradeChip.ts:62-66) — derives
## the numeric chip text from `opt.mods`+`opt.scope` when both are present,
## so it can never drift from the data it describes. Falls back to
## `opt.blurb` verbatim for squad-swap options with no mods to derive from
## (e.g. Garrison's Sniper Team).
func _format_branch_blurb(opt: Dictionary) -> String:
	if not opt.has("mods") or not opt.has("scope"):
		return str(opt.get("blurb", ""))
	var parts := _describe_stat_mods(opt["mods"])
	var numeric := " and ".join(parts) if parts.size() == 2 else ", ".join(parts)
	return "%s — %s" % [numeric, str(opt["scope"])]


## UpgradeChip.ts:136-174 — one row while <= 2 chips (upgrade/branch + sell),
## wraps 2-per-row beyond that (2 branch options + sell chip today; more
## branch options later) so chips never overlap or run off-screen. No arc
## lift here (unlike BuildRing) — matches placeRow's flat rows.
func _layout(buttons: Array[Button], center: Vector2, entity_y: float) -> void:
	if buttons.is_empty():
		return
	var flip := entity_y < FLIP_Y_THRESHOLD
	var clearance := maxf(62.0, 72.0 * world.scale_factor)

	if buttons.size() > 2:
		var row_height := 0.0
		for btn in buttons:
			row_height = maxf(row_height, btn.size.y)
		var row_idx := 0
		var i := 0
		while i < buttons.size():
			var row: Array[Button] = buttons.slice(i, mini(i + 2, buttons.size()))
			var offset := clearance + float(row_idx) * (row_height + ROW_GAP)
			var y := center.y + offset if flip else center.y - offset
			_layout_row(row, center.x, y)
			row_idx += 1
			i += 2
	else:
		var y := center.y + clearance if flip else center.y - clearance
		_layout_row(buttons, center.x, y)


func _layout_row(row: Array[Button], center_x: float, center_y: float) -> void:
	var total := 0.0
	for btn in row:
		total += btn.size.x
	total += GAP * maxf(0.0, row.size() - 1)

	var x := center_x - total / 2.0
	x = clampf(x, ROW_PAD, maxf(ROW_PAD, size.x - total - ROW_PAD))
	for btn in row:
		btn.position = Vector2(x, center_y - btn.size.y / 2.0)
		x += btn.size.x + GAP


func _clear() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
