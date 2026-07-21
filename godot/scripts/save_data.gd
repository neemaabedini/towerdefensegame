extends RefCounted
class_name SaveData
## Meta-progression persistence — Godot port of src/persist/save.ts plus the
## derived getters src/app/AppShell.ts computes over a loaded save. Per
## save.ts:1-6, the web StorageBackend swaps for ConfigFile here; everything
## else (versioned schema, defensive load, derived stars/unlocks) is ported
## unchanged in spirit. Pure data + rules — no Game/GameSim/scene access,
## same separation the web version keeps (AppShell is the only reader/
## writer there; whatever owns this instance in the Godot port should be
## the only reader/writer here too).

const SAVE_PATH := "user://citydefense.save"
const CURRENT_VERSION := 1
const DEFAULT_HERO_WEAPON := "rifle"

## Star threshold where perk slots grow 1 -> 2. Mirrors
## AppShell.ts:25 PERK_SLOT_THRESHOLD_STARS. Freeze-untuned (balance freeze).
const PERK_SLOT_THRESHOLD_STARS := 3

## -- persisted schema (save.ts SaveDataV1) --------------------------------
var v: int = CURRENT_VERSION
## Count of unlocked levels; level_ids[0 ..< unlocked_levels] are playable.
var unlocked_levels: int = 1
## level_id -> {cleared: bool, best_hq_hp_pct: int, mutator_win: bool}.
var levels: Dictionary = {}
var settings: Dictionary = {
	"volume": 0.8,
	"muted": false,
	"night_speed": 1,
	"hero_weapon": DEFAULT_HERO_WEAPON,
	"perks": [],
	## Godot-only — the web build has no window mode to persist.
	## Default on so large monitors (e.g. 5K) open filled; toggle in Settings.
	"fullscreen": true,
}
var hints_seen: Array = []

## -- DB refs for the derived helpers below --------------------------------
## Level ids in play order (LEVELS[i].id in the web build), needed to map a
## level index to its `levels` dict key. NOT part of the persisted schema —
## the owner (main.gd-equivalent) sets this once after DataDB.load_all().
## Derived helpers degrade to "nothing unlocked" rather than crash while
## this is empty.
var level_ids: Array = []
## perks.json defs, id -> {..., unlockStars}. data_db.gd does not load
## perks.json yet (see report) — set this once it does.
var perk_defs: Dictionary = {}
## hero.json defs, id -> {..., unlockStars}. Already loaded by data_db.gd
## as `DataDB.heroes` — pass that dictionary through directly.
var hero_defs: Dictionary = {}

## Migration table keyed by the version a migration upgrades FROM. Empty
## today — mirrors save.ts:92, exists so the next schema bump is a one-line
## addition instead of a redesign. Each Callable takes/returns a raw
## Dictionary (pre-validation shape, see _read_raw). Left non-underscored-
## private-in-name-only (GDScript doesn't enforce it) so tests can register
## a throwaway migration to exercise the guard loop.
static var _migrations: Dictionary = {}


static func default_save() -> SaveData:
	return SaveData.new()


## Load from disk, migrating forward and falling back to defaults on any
## corruption (missing file, unparsable ConfigFile, unknown/invalid shape,
## unmigratable future version) — mirrors save.ts:126-150's load(). Never
## throws.
static func load_from_disk(path: String = SAVE_PATH) -> SaveData:
	if not FileAccess.file_exists(path):
		return default_save()

	var cfg := ConfigFile.new()
	var err := cfg.load(path)
	if err != OK:
		return default_save()

	var raw := _read_raw(cfg)
	var guard := 0
	# save.ts:134-144 iteration guard: follow the migration chain forward,
	# capped at 10 hops so a cyclical/broken table can't hang the loader.
	while typeof(raw.get("v")) == TYPE_INT and int(raw["v"]) < CURRENT_VERSION and guard < 10:
		var migrate: Callable = _migrations.get(int(raw["v"]), Callable())
		if not migrate.is_valid():
			break
		raw = migrate.call(raw)
		guard += 1

	if not _is_valid_raw(raw):
		return default_save()
	return _from_raw(raw)


## Write to disk. Swallows failures the way save.ts:26-32 LocalStorageBackend
## swallows quota/security errors — persistence is best-effort and must
## never crash the game (e.g. a full or read-only user:// on some platform).
func save_to_disk(path: String = SAVE_PATH) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("save", "v", v)
	cfg.set_value("save", "unlocked_levels", unlocked_levels)
	cfg.set_value("save", "hints_seen", hints_seen)
	for level_id in levels:
		cfg.set_value("levels", level_id, levels[level_id])
	for key in settings:
		cfg.set_value("settings", key, settings[key])
	var err := cfg.save(path)
	if err != OK:
		push_warning("SaveData: write to %s failed (err %d) — best-effort, ignoring" % [path, err])


var _persist_timer: SceneTreeTimer = null
var _persist_debounce_pending := false

## Debounced write for slider-style callers (e.g. a volume drag) — collapses
## rapid updates into a single write ~200ms after the last call. Mirrors
## save.ts:158-170's debounce(fn, 200). Uses SceneTreeTimer rather than a
## Timer node since this class is RefCounted, not a scene member; falls
## back to an immediate write if no SceneTree is running (e.g. a headless
## script context) so a persist is never silently dropped.
func save_to_disk_debounced(path: String = SAVE_PATH, delay_sec: float = 0.2) -> void:
	_persist_debounce_pending = true
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		save_to_disk(path)
		_persist_debounce_pending = false
		return
	var timer := tree.create_timer(delay_sec)
	_persist_timer = timer
	timer.timeout.connect(func() -> void:
		# Only the most recently created timer is allowed to fire the write —
		# earlier ones lost the race to a later call and no-op here.
		if _persist_timer == timer and _persist_debounce_pending:
			_persist_debounce_pending = false
			save_to_disk(path)
	)


## -- derived meta-progression helpers (ported from AppShell.ts) -----------

## Star 1 (Clear) = cleared; Star 2 (Flawless) = best_hq_hp_pct == 100;
## Star 3 (Hardened) = mutator_win. Mirrors AppShell.ts:164-172 starsFor.
func stars_for(level_index: int) -> Array:
	if level_index < 0 or level_index >= level_ids.size():
		return [false, false, false]
	var id: String = str(level_ids[level_index])
	var result: Dictionary = levels.get(id, {})
	if not bool(result.get("cleared", false)):
		return [false, false, false]
	return [
		true,
		int(result.get("best_hq_hp_pct", 0)) == 100,
		bool(result.get("mutator_win", false)),
	]


## Sum of every level's stars — the single progression currency gating perk
## slots, weapon unlocks, and perk unlocks. Mirrors AppShell.ts:174-182.
func total_stars() -> int:
	var total := 0
	for i in level_ids.size():
		for earned in stars_for(i):
			if earned:
				total += 1
	return total


## 1 slot below the threshold, 2 at/above it. Mirrors AppShell.ts:184-187.
func perk_slots() -> int:
	return 2 if total_stars() >= PERK_SLOT_THRESHOLD_STARS else 1


## Mirrors AppShell.ts:189-195 isWeaponUnlocked. hero_defs must be set by
## the caller (DataDB.heroes works as-is).
func is_weapon_unlocked(id: String) -> bool:
	if not hero_defs.has(id):
		return false
	var def: Dictionary = hero_defs[id]
	return total_stars() >= int(def.get("unlockStars", 0))


## Mirrors AppShell.ts:197-203 isPerkUnlocked. perk_defs must be set by the
## caller once data_db.gd loads perks.json (see report).
func is_perk_unlocked(id: String) -> bool:
	if not perk_defs.has(id):
		return false
	var def: Dictionary = perk_defs[id]
	return total_stars() >= int(def.get("unlockStars", 0))


## Equipped perk ids, trimmed of unknown/locked/over-cap ids at READ time —
## mirrors AppShell.ts:205-213 selectedPerks (filter-then-slice, same order
## preservation).
func selected_perks() -> Array:
	var raw: Array = settings.get("perks", [])
	var out: Array = []
	var cap: int = perk_slots()
	for id in raw:
		if out.size() >= cap:
			break
		if is_perk_unlocked(id):
			out.append(id)
	return out


## Whether the title screen should offer "Continue". Mirrors
## AppShell.ts:136-139 hasProgress.
func has_progress() -> bool:
	return unlocked_levels > 1 or not levels.is_empty()


## Record a win. Mirrors AppShell.ts:378-398 recordVictory, including the
## CD-54 guard at :366-372/:383-384 — never write `cleared` on a dead HQ,
## even though callers are expected to already gate on that. bestHqHpPct is
## a running max (never regresses on a weaker replay); mutatorWin is sticky
## OR (a later mutator-free clear can't un-light Star 3).
func record_victory(
	level_id: String,
	level_index: int,
	hq_hp: float,
	hq_max_hp: float,
	active_mutator_count: int,
	level_count: int,
) -> void:
	if hq_hp <= 0.0:
		return
	var pct: int = int(round((hq_hp / hq_max_hp) * 100.0)) if hq_max_hp > 0.0 else 0
	var existing: Dictionary = levels.get(level_id, {})
	var best_hq_hp_pct: int = int(max(existing.get("best_hq_hp_pct", pct), pct))
	var mutator_win: bool = bool(existing.get("mutator_win", false)) or active_mutator_count > 0
	levels[level_id] = {
		"cleared": true,
		"best_hq_hp_pct": best_hq_hp_pct,
		"mutator_win": mutator_win,
	}

	var unlock_index := level_index + 1
	if unlock_index < level_count:
		unlocked_levels = max(unlocked_levels, unlock_index + 1)

	save_to_disk()


## -- internal: ConfigFile <-> raw Dictionary + validation -----------------

## Reconstructs a raw Dictionary shaped like a JSON.parse of save.ts's
## SaveDataV1 (snake_case field names, see class doc) from a loaded
## ConfigFile. Missing keys are simply absent from the result (not defaulted
## here) so _is_valid_raw can tell "absent" from "present but wrong type",
## same distinction isValidSave draws on a parsed JS object.
static func _read_raw(cfg: ConfigFile) -> Dictionary:
	var raw := {}
	if cfg.has_section_key("save", "v"):
		raw["v"] = cfg.get_value("save", "v")
	if cfg.has_section_key("save", "unlocked_levels"):
		raw["unlocked_levels"] = cfg.get_value("save", "unlocked_levels")
	if cfg.has_section_key("save", "hints_seen"):
		raw["hints_seen"] = cfg.get_value("save", "hints_seen")

	var lv := {}
	if cfg.has_section("levels"):
		for id in cfg.get_section_keys("levels"):
			lv[id] = cfg.get_value("levels", id)
	raw["levels"] = lv

	var st := {}
	if cfg.has_section("settings"):
		for key in cfg.get_section_keys("settings"):
			st[key] = cfg.get_value("settings", key)
	raw["settings"] = st

	return raw


## Strict field-by-field validator, equivalent to save.ts:94-121 isValidSave.
## Deliberately does NOT deep-validate each `levels[id]` entry's shape (the
## web version doesn't either — it only checks `d.levels` is an object) so
## the two stay in parity rather than the port being stricter than its spec.
static func _is_valid_raw(data: Dictionary) -> bool:
	if not data.has("v") or typeof(data["v"]) != TYPE_INT or int(data["v"]) != CURRENT_VERSION:
		return false
	if not data.has("unlocked_levels"):
		return false
	var ul_type := typeof(data["unlocked_levels"])
	if ul_type != TYPE_INT and ul_type != TYPE_FLOAT:
		return false
	if not (data.get("levels") is Dictionary):
		return false
	if not (data.get("settings") is Dictionary):
		return false

	var settings_raw: Dictionary = data["settings"]
	var vol_type := typeof(settings_raw.get("volume"))
	if vol_type != TYPE_INT and vol_type != TYPE_FLOAT:
		return false
	if typeof(settings_raw.get("muted")) != TYPE_BOOL:
		return false
	var night_speed = settings_raw.get("night_speed")
	if night_speed != 1 and night_speed != 2:
		return false
	# hero_weapon is optional; when present it must be a string — unknown ids
	# are sanitized at read time by the caller, not here (save.ts:107-109).
	if settings_raw.has("hero_weapon") and typeof(settings_raw["hero_weapon"]) != TYPE_STRING:
		return false
	# perks is optional; when present it must be a string array — unknown/
	# over-slot ids are trimmed at read time by selected_perks(), not here
	# (save.ts:110-118).
	if settings_raw.has("perks"):
		if not (settings_raw["perks"] is Array):
			return false
		for p in settings_raw["perks"]:
			if typeof(p) != TYPE_STRING:
				return false

	if not (data.get("hints_seen") is Array):
		return false
	return true


## Builds a validated SaveData from a raw Dictionary. Callers must run
## _is_valid_raw first — this does not re-check.
static func _from_raw(raw: Dictionary) -> SaveData:
	var sd := SaveData.new()
	sd.v = int(raw.get("v", CURRENT_VERSION))
	sd.unlocked_levels = int(raw.get("unlocked_levels", 1))
	sd.levels = (raw.get("levels", {}) as Dictionary).duplicate(true)

	var raw_settings: Dictionary = raw.get("settings", {})
	sd.settings = {
		"volume": float(raw_settings.get("volume", 0.8)),
		"muted": bool(raw_settings.get("muted", false)),
		"night_speed": int(raw_settings.get("night_speed", 1)),
		"hero_weapon": String(raw_settings.get("hero_weapon", DEFAULT_HERO_WEAPON)),
		"perks": (raw_settings.get("perks", []) as Array).duplicate(),
		"fullscreen": bool(raw_settings.get("fullscreen", false)),
	}
	sd.hints_seen = (raw.get("hints_seen", []) as Array).duplicate()
	return sd
