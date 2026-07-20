# City Defense

A browser-based day/night base-defense game: plan during the day, hold the line at night as a commander on the map.

## Core loop

1. **Day** — Spend credits at fixed build sites. Each site offers a short list of structures (towers, garrisons, artillery, mining, support).
2. **Night** — Enemy waves march on your **Command Post**. Defenses and garrison squads fire automatically; you steer the commander.
3. **Dawn** — Clear bonuses and mining income, free rebuilds of wrecks, then upgrade or expand before the next assault.
4. **Survive all waves** to clear the level, then push into the next map.

## Buildings

| Building           | Role      | Notes                                              |
|--------------------|-----------|----------------------------------------------------|
| Gun Tower          | Defense   | Fast ground chaff killer                           |
| Garrison           | Defense   | Infantry squad; body-block + branch identity       |
| Artillery Platform | Defense   | Long range + splash vs swarms                      |
| Missile Battery    | Defense   | Air-only flak                                      |
| Sniper Tower       | Defense   | Long-range anti-armor                              |
| Mining Facility    | Economy   | Income from nearby crystals at dawn                |
| Command Post       | HQ        | Protect at all costs                               |

## Controls

- **Click** empty sites or buildings on the map (or use the side list)
- Choose a structure / **Upgrade** from the side panel or world UI
- **WASD** move the commander · **arrows** select sites
- **Ready for Night** (or `Space` / `Enter`) to start the next wave
- `R` restart · `Esc` clear selection / pause

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run validate   # data contract
npm test           # headless sim harness
npm run build      # typecheck + validate + production bundle
```
