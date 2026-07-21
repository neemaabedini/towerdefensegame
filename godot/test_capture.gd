extends SceneTree
## Temporary: run WITH rendering and capture real frames to PNG.

const OUT := "C:/Users/neema/AppData/Local/Temp/claude/C--Users-neema-Documents-GitHub-CityDefense/01e5cd86-1130-4e4a-aa74-0a13a4cc4b1f/scratchpad/"


func snap(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	img.save_png(OUT + name + ".png")
	print("wrote %s%s.png  %dx%d" % [OUT, name, img.get_width(), img.get_height()])


func _initialize() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveData.SAVE_PATH))
	var main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	for _i in 8:
		await process_frame

	print("Main size=%s  title vis=%s" % [str(main.size), str(main.title_screen.visible)])
	await snap("01_title")

	main.title_screen.play_pressed.emit()
	for _i in 8:
		await process_frame
	print("level_select size=%s vis=%s" % [
		str(main.level_select.size), str(main.level_select.visible),
	])
	await snap("02_level_select")

	main.level_select.level_chosen.emit(0, "rifle", [], [])
	for _i in 8:
		await process_frame
	print("game: screen=%s world_host vis=%s size=%s" % [
		main.screen, str(main.world_host.visible), str(main.world_host.size),
	])
	print("world: scale=%s offset=%s sim.level=%s" % [
		str(main.world.scale_factor), str(main.world.offset),
		str(main.sim.level.get("id", "EMPTY")),
	])
	print("buildings=%d sites=%d" % [main.sim.buildings.size(), main.sim.sites.size()])
	await snap("03_game_day")

	var site: Dictionary = main.sim.sites[0]
	main.sim.select_at(Vector2(site["x"], site["y"]))
	main._refresh_popups()
	for _i in 8:
		await process_frame
	print("build_ring children=%d vis=%s" % [
		main.build_ring.get_child_count(), str(main.build_ring.visible),
	])
	await snap("04_build_ring")

	quit(0)
