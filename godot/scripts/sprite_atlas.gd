extends RefCounted
class_name GameSpriteAtlas
## Loads godot/assets/sprites/atlas.png + atlas.json produced by
## `npm run export-atlas` (same builders as the web Renderer).

var texture: Texture2D
var frames: Dictionary = {} # key -> {sx,sy,sw,sh,ax,ay}
var pixel_scale: int = 2
var ready: bool = false
var frame_count: int = 0


func load_default() -> bool:
	return load_from("res://assets/sprites/atlas.json")


func load_from(json_path: String) -> bool:
	ready = false
	frames.clear()
	texture = null
	frame_count = 0

	if not FileAccess.file_exists(json_path):
		push_warning("GameSpriteAtlas: missing %s — run npm run export-atlas" % json_path)
		return false

	var f := FileAccess.open(json_path, FileAccess.READ)
	if f == null:
		push_error("GameSpriteAtlas: cannot open %s" % json_path)
		return false
	var parsed = JSON.parse_string(f.get_as_text())
	if parsed == null or not (parsed is Dictionary):
		push_error("GameSpriteAtlas: bad JSON %s" % json_path)
		return false

	var meta: Dictionary = parsed
	var img_name := str(meta.get("image", "atlas.png"))
	var dir := json_path.get_base_dir()
	var tex_path := dir.path_join(img_name)

	# Prefer raw PNG decode so we don't depend on .import state and can force
	# a clean ImageTexture (nearest filtering is on the CanvasItem).
	var abs_tex := ProjectSettings.globalize_path(tex_path)
	if not FileAccess.file_exists(tex_path):
		push_warning("GameSpriteAtlas: missing texture %s" % tex_path)
		return false

	var img: Image = Image.load_from_file(abs_tex)
	if img == null or img.is_empty():
		# Fallback to ResourceLoader (imported ctex)
		var res = load(tex_path)
		if res is Texture2D:
			texture = res
		else:
			push_warning("GameSpriteAtlas: could not load %s" % tex_path)
			return false
	else:
		texture = ImageTexture.create_from_image(img)

	pixel_scale = int(meta.get("pixelScale", 2))
	var raw_frames: Dictionary = meta.get("frames", {})
	for key in raw_frames.keys():
		var fr: Dictionary = raw_frames[key]
		frames[str(key)] = {
			"sx": float(fr.get("sx", 0)),
			"sy": float(fr.get("sy", 0)),
			"sw": float(fr.get("sw", 0)),
			"sh": float(fr.get("sh", 0)),
			"ax": float(fr.get("ax", 0)),
			"ay": float(fr.get("ay", 0)),
		}
	frame_count = frames.size()
	ready = texture != null and frame_count > 0
	if ready:
		print("GameSpriteAtlas: loaded %d frames from %s (%dx%d)" % [
			frame_count, tex_path, texture.get_width(), texture.get_height()
		])
	return ready


func has(key: String) -> bool:
	return ready and frames.has(key)


func get_frame(key: String) -> Dictionary:
	if not has(key):
		return {}
	return frames[key]


## Draw a frame centered on `center` (screen px), scaled by `scale`.
## Anchor (ax,ay) is the sprite center in atlas pixels (matches web Renderer).
func draw_frame(
	canvas_item: CanvasItem,
	key: String,
	center: Vector2,
	scale: float = 1.0,
	modulate: Color = Color.WHITE,
) -> bool:
	if not has(key) or texture == null:
		return false
	var fr: Dictionary = frames[key]
	var src := Rect2(fr["sx"], fr["sy"], fr["sw"], fr["sh"])
	var dw := float(fr["sw"]) * scale
	var dh := float(fr["sh"]) * scale
	var dest := Rect2(
		center.x - float(fr["ax"]) * scale,
		center.y - float(fr["ay"]) * scale,
		dw,
		dh,
	)
	canvas_item.draw_texture_rect_region(texture, dest, src, modulate)
	return true


## Animated enemy/unit frame key helper: base + "0"|"1" + optional :flash.
func anim_key(base: String, time: float, flash: bool = false) -> String:
	var frame := int(floor(time * 1.6)) % 2
	var key := "%s:%d" % [base, frame]
	if flash:
		key += ":flash"
	return key
