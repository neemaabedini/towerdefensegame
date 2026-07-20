# City Defense — Godot port

Godot **4.7** project using the **same JSON** as the web build (`res://data/` ← `src/data/`).

## Run

```text
"C:\Program Files\Godot\Godot_v4.7-stable_win64.exe" --path godot
```

Or open `godot/` in the Godot editor → **F5**.

## Controls

| Input | Action |
|-------|--------|
| Click empty site | Select build site |
| Click building | Select for upgrade / sell |
| **1–4** | Build option / branch pick |
| **U / E** | Upgrade |
| **X** | Sell / undo |
| **Space** | Start night / end-screen confirm |
| **WASD** | Move hero (day + night) |
| **P** | Pause |
| **F** | Night 2× speed |
| **Esc** | Deselect, then pause |
| **R** | Restart level |

## Parity vs web (2026-07-20)

### Present in Godot

| Area | Status |
|------|--------|
| Title → level select → game → victory/defeat | Yes |
| Loadout: weapons, perks, mutators, stars, unlocks | Yes |
| Build / upgrade / branch / sell-undo | Yes |
| Dawn income + mining + rear depot | Yes |
| **Garrison units** (spawn, leash AI, fire, body-block) | Yes |
| Hero move, auto-attack, damageable, dawn revive | Yes |
| Tower combat + projectiles + splash | Yes |
| CD-54 end conditions | Yes |
| **2.5D terrain** (gradients, mesa, diamonds, grit) | Yes |
| **Spawn threat markers** + next-wave counts | Yes |
| **Iso foundations**, shadows, range rings, HQ stop ring | Yes |
| Shape-aware buildings/enemies/units/hero | Yes |
| Particles, muzzle flash, aim barrels, wrecks, float text | Yes |
| Pause, settings (night speed, fullscreen), save | Yes |
| Build ring + upgrade chip world UI | Yes |

### Still thinner than web (next passes)

| Gap | Web source | Notes |
|-----|------------|--------|
| Pixel **atlas sprites** | `sprites.ts`, hero sheet | Godot uses vector shapes; same art pipeline can export PNGs later |
| **Hero abilities (Q)** | CD-40 `castAbility` | Not wired yet |
| **Full HUD chrome** | `HUD.ts` + CSS | One status line + hint, not full side panel |
| **Audio** SFX + music | `src/audio/*` | Save has volume fields; no bus yet |
| **Arrow-key** site nav | `Game.navigate` | Mouse + rings only |
| **Onboarding hints** | `Hints.ts` | Static phase hints only |
| **Enemy separation** | CD-45 | Optional polish |
| **Walls / pathfinding** | CD-9 | Planned Godot-native |

## Data sync

After editing web JSON:

```powershell
Copy-Item src/data/*.json godot/data/ -Force
```

## Layout

```text
godot/
  project.godot
  data/                 # JSON mirror
  scenes/main.tscn
  scripts/
    main.gd             # shell (AppShell + input)
    game_sim.gd         # day/night sim + garrisons
    world_draw.gd       # 2.5D render density
    data_db.gd / save_data.gd
    build_ring.gd / upgrade_chip.gd
    screens/            # title, level select, settings
```
