# City Defense

A browser-based roguelite tower-defense strategy game inspired by **StarCraft** fortifications and **Thronefall**’s day/night build loop.

## Core loop

1. **Day** — Spend credits at fixed build sites. Each site offers a short list of structures (towers, bunkers, siege tanks, production, support).
2. **Night** — Enemy waves march on your **Command Center**. Defenses fire automatically.
3. **Between waves** — Earn kill rewards and clear bonuses, repair slightly, then upgrade or expand before the next assault.
4. **Survive all waves** to clear the level, then push into the next map.

## Buildings

| Building         | Role        | Notes                                      |
|------------------|-------------|--------------------------------------------|
| Gun Tower        | Defense     | Fast single-target                           |
| Bunker           | Defense     | Tanky, solid damage                          |
| Siege Tank       | Defense     | Long range + splash                          |
| Missile Battery  | Defense     | High damage vs armor                         |
| Barracks         | Production  | Passive income during day                      |
| Refinery         | Production  | Higher income, fragile                       |
| Sensor Array     | Support     | Buffs nearby defense range & fire rate       |
| Command Center   | HQ          | Protect at all costs                         |

## Controls

- **Click** empty sites or buildings on the map (or use the side list)
- Choose a structure / **Upgrade** from the side panel
- **Ready for Night** (or `Space` / `Enter`) to start the next wave
- `R` restart · `Esc` clear selection

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # serve the build
```

## Project layout

```
src/
  data/       # buildings, enemies, levels
  game/       # core simulation (Game.ts)
  render/     # canvas renderer
  ui/         # HUD / build menus
  main.ts     # bootstrap + loop
```

## Roadmap ideas

- More levels & procedural site layouts
- Roguelite meta: permanent unlocks between runs
- Hero unit / commander abilities
- Tech tree choices at campfire between levels
- Sound, music, and particle polish
- Mobile touch controls
