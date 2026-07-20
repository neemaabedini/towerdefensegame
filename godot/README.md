# City Defense — Godot port

Godot **4.7** project that loads the **same JSON defs** as the web build (`res://data/*.json`, copied from `src/data/`).

This is the real port start (beyond the old CD-17 spike idea): playable day/night loop on Outpost Alpha.

## Run

```text
# From repo root (Windows example)
"C:\Program Files\Godot\Godot_v4.7-stable_win64.exe" --path godot
```

Or open the `godot/` folder in the Godot editor and press **F5**.

## Controls

| Input | Action |
|-------|--------|
| Click empty site | Select build site |
| **1–4** | Build option at selected site |
| **Space** | Start night / confirm end screen |
| **WASD** | Move hero (day + night) |
| **R** | Restart level |

## What’s ported

- Levels, buildings, enemies, hero, tuning from JSON
- Day build at fixed sites
- Night waves (path-following enemies)
- Tower combat (hitscan + artillery/missile projectiles)
- Hero move + auto-attack
- Dawn income + HQ restore
- Victory / defeat (HQ death checked before wave-clear — CD-54)

## Not yet (web still ahead)

- Full garrison unit AI / body-block parity
- Hero weapon actives (CD-40)
- Perks / mutators / stars (CD-30)
- Sell / undo, full HUD chrome
- Audio (CD-3 / CD-33)
- Sprite atlas (procedural shapes for now)
- Multi-level select + save
- **Walls / pathfinding (CD-9)** — still planned for Godot after core parity

## Data sync

After editing web `src/data/*.json`:

```powershell
Copy-Item src/data/*.json godot/data/ -Force
```

Keep field names stable — Godot reads the same contract as `validate.ts`.

## Layout

```text
godot/
  project.godot
  data/           # JSON mirror of src/data
  scenes/main.tscn
  scripts/
    data_db.gd    # JSON loaders
    game_sim.gd   # day/night sim
    world_draw.gd # 2D render
    main.gd       # shell + input
```
