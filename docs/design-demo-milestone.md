# Demo Milestone — Architecture Design (architect agent, 2026-07-14)

Covers: CD-24 (undo/sell), CD-2 (pause modal), CD-28 (night speed), CD-27
(persistence), CD-25 (menu/level select), CD-26 (hints), CD-3 (sound),
CD-16 demo slice (title slot + display-rename seam).

Implementation batches at the bottom are the work plan — one coder run per
batch, QA criteria included. Status: designed, not started.

---

## Problem 1 — App shell state machine

**Decision:** `src/app/AppShell.ts` — app state machine ABOVE the sim.
`AppScreen = "title" | "levelSelect" | "game"` + `modal: "none" | "pause"`.
Screens are DOM sections toggled by class; `Game.update` runs only when
`screen === "game"`. Shell owns: screen state, pause/nightSpeed + frame
stepping, level flow (`startLevel(i)`, victory → record result + unlock,
`quitToMenu()`), and is the ONLY writer of persistence. Game's phase model
(day/night/victory/defeat) is untouched; shell detects victory/defeat by
comparing previous phase on `onChange`. `Game.nextLevel()`'s hardcoded
`< 2` moves to the shell using `LEVELS.length`.

Godot mapping: shell = root scene-switcher; screens = scenes; modal =
CanvasLayer.

## Problem 2 — Pause & night speed = frame sub-stepping

**Decision:** NOT dt scaling (changes integration step → balance drift).
The frame loop asks the shell for `steps` (0 paused, 1 normal, 2 at 2x
night) and calls `game.update(dt)` that many times. Identical sim behavior
at any speed; renderer keeps drawing the frozen world under the pause
modal. Free down-payment on CD-20's fixed-tick accumulator.

Shell state: `paused: boolean`, `nightSpeed: 1 | 2` (persisted; applies
only while phase === "night").

**Esc conflict:** keep `Escape → cancel` action. Dispatcher priority:
modal open → close modal; something selected → deselect; else → open
pause. New actions: `pause` on **P** (always toggles), `toggleSpeed` on
**F**. Modal open = dispatcher swallows all game actions. Controller
mapping later: Start = pause, B = cancel (same chain).

UI: pause modal reuses `.overlay-card` (Resume / Restart / Quit to Menu /
volume slider / key reference). Speed `1x|2x` button + F badge next to
`#btn-ready`, visible at night only.

## Problem 3 — Undo & sell (CD-24)

In `Game`, day-only, HQ excluded:
- `PlacedBuilding.invested` (build + upgrade costs paid; `WreckState`
  carries it so dawn rebuilds preserve it) + per-day ledger
  (`spentToday`, `levelsToday`, `builtToday`), cleared in `startNight()`.
- **Undo** (touched today): `builtToday` → remove, free site, refund
  `spentToday` fully. Else levels-only → revert `level -= levelsToday`,
  refund `spentToday`.
- **Sell** (ledger empty): refund `round(0.6 * invested)`, remove, free
  site. `SELL_REFUND = 0.6` beside `upgradeCost` in buildings.ts.
- API: `game.sellOrUndo(id)` + `getSellInfo(id): {kind: "undo" |
  "undoUpgrades" | "sell"; refund} | null`.

UI: `src/ui/SellChip.ts` — second world-anchored chip beside UpgradeChip;
render both chips as ONE shared measured-width row (reuse BuildRing's row
layout) to avoid overlap. Label: `[X] Undo +120₡` (green) / `[X] Sell
+72₡` (amber). Keyboard: **X** → `sell` action.

Double-tap guard, no confirm dialogs: (1) after sell/undo, selection moves
to the now-empty SITE (repeat X = no-op); (2) 350ms `sellLockout` inside
Game absorbs key/click bounce.

## Problem 4 — Persistence (CD-27)

`src/persist/save.ts` — pure TS, no game imports.

```ts
interface StorageBackend { read(): string | null; write(data: string): void; }
interface SaveDataV1 {
  v: 1;
  unlockedLevels: number;
  levels: Record<string, { cleared: boolean; bestHqHpPct: number }>;
  settings: { volume: number; muted: boolean; nightSpeed: 1 | 2 };
  hintsSeen: string[];
}
```

Single key `"citydefense.save"` (rename with CD-16), version field,
`migrations` table from day one, load() falls back to defaults on corrupt
data (never crash). Sync writes; debounce slider ~200ms. Only AppShell/UI
read or write — Game never touches persistence. Godot swaps the backend.

## Problem 5 — Sound (CD-3)

**Decision:** lightweight semantic event emitter on Game (NOT snapshot
diffing — lossy, no weapon attribution):

```ts
type GameEvent =
  | { type: "weaponFired"; defId: string }
  | { type: "enemyDied"; defId: string }
  | { type: "buildingDestroyed"; defId: string }
  | { type: "waveStarted"; waveIndex: number }
  | { type: "dawn" } | { type: "victory" } | { type: "defeat" }
  | { type: "built" } | { type: "upgraded" } | { type: "sold" }
  | { type: "undone" };
```

`game.onEvent(cb)` alongside `onChange`. Events are sim vocabulary —
Godot binds them to AudioStreamPlayers; same stream later feeds CD-33
announcer/music, screen shake, CD-20 replay logging.

- `src/audio/AudioBus.ts`: AudioContext + master gain, `play(id)`,
  per-id throttle (~40ms min between repeats), slight pitch
  randomization, resume-on-first-gesture (autoplay policy).
- `src/audio/sfx.ts`: SYNTHESIZED recipes (osc + noise + envelope) —
  zero assets; real audio (CD-33) happens post-port. Ids: shot_gun,
  shot_bunker, shot_siege, shot_missile, enemy_die, building_down,
  wave_klaxon, dawn_chime, victory_sting, defeat_sting, ui_build,
  ui_upgrade, ui_sell.
- `src/audio/bindings.ts`: the only file knowing both vocabularies.
Volume from pause modal, persisted via CD-27. Duck to silence on pause.

## Problem 6 — Onboarding hints (CD-26)

`src/ui/Hints.ts` — declarative ordered list, at most one visible:

```ts
interface HintDef {
  id: string;                       // → hintsSeen
  when(s: GameSnapshot): boolean;
  done(s: GameSnapshot): boolean;   // dismiss on ACTION, not timer
  text: string;
  anchor(s): { x; y } | { dom: string };
}
```

Level-1 sequence: select-a-site → pick-structure (1–4) → red-markers
meaning → Space-to-start → (day 2) U-to-upgrade. Runs in the onChange
render pass; world-anchored cards via worldOverlay; DOM anchors get a
pulse class. Checks `levelIndex === 0` + hintsSeen first → zero
steady-state cost.

## Problem 7 — Menu & level select + CD-16 title slot

**DOM screens** (not canvas — port rule): `#screen-title` (title, Play,
Continue-if-progress) and `#screen-level-select` (card per LEVELS entry:
name, description, lock state, "Cleared · Best HQ 85%"). Victory overlay
gains a Level Select route; pause modal has Quit to Menu. Keyboard: plain
DOM focus + Enter.

CD-16 slot: `src/data/strings.json` + typed loader —
`{ "gameTitle": "City Defense", "gameSubtitle": "" }` — consumed by title
screen, top-bar h1, document.title, save-key prefix. "Siege Tank" rename
is already a pure `buildings.json` `name` field edit (zero code changes).
No names invented — user creative session decides.

## New files

| File | Contents |
|---|---|
| src/app/AppShell.ts | Screen SM, pause/speed stepping, level flow, result recording |
| src/persist/save.ts | SaveDataV1, migrations, StorageBackend + LocalStorageBackend |
| src/audio/AudioBus.ts | Context, gain, play(id), throttle, gesture resume |
| src/audio/sfx.ts | Synth recipes per SoundId |
| src/audio/bindings.ts | GameEvent → SoundId table |
| src/ui/PauseModal.ts | CD-2 modal |
| src/ui/SellChip.ts | Undo/sell chip |
| src/ui/Hints.ts | HintController + level-1 defs |
| src/ui/screens/TitleScreen.ts, LevelSelect.ts | DOM screens |
| src/data/strings.json + strings.ts | Title slot |

Modified: Game.ts (onEvent, invested+ledger, sellOrUndo, event emits),
types.ts, actions.ts (sell/pause/toggleSpeed), main.ts (bootstrap →
AppShell, sub-step loop, dispatcher chain), index.html, HUD.ts, main.css.

## Implementation batches (one coder run each; QA criteria per batch)

**Batch 1 — Persistence + shell + menus (CD-27, CD-25, CD-16 slice).**
QA: fresh profile boots to title; level 2 locked; win level 1 → unlock +
best-HQ% recorded; reload preserves; corrupted localStorage → defaults,
no crash; Continue only with progress; in-game behavior identical once
playing; title renders from strings.json everywhere incl. tab title.

**Batch 2 — Pause + night speed (CD-2, CD-28).**
QA: P and Esc-nothing-selected open modal; Esc-with-selection deselects
(second Esc pauses); world fully frozen under modal but rendered; game
actions dead while paused; Quit to Menu works; 2x night = identical
outcomes to 1x for a scripted build; speed badge night-only; nightSpeed
persists.

**Batch 3 — Undo & sell (CD-24).**
QA: same-day undo refunds exactly; levels-only undo reverts today's
levels only; older building sells at 60% of total invested (incl. pre-
wreck investment after dawn rebuild); HQ never shows chip; sell frees
site (ring reappears); X-spam can't sell two buildings; night: chip
hidden, X inert.

**Batch 4 — Sound (CD-3).**
QA: distinct per-weapon sounds, death, klaxon, dawn chime, stingers, UI
blips; no autoplay errors pre-gesture; volume/mute immediate + persisted;
20+ enemy wave doesn't clip (throttle); muted game plays identically.

**Batch 5 — Onboarding hints (CD-26).**
QA: fresh profile sees sequence in order, one at a time, dismiss-on-
action (mouse or keyboard both count); reload mid-sequence resumes unseen
only; veteran profile renders nothing; level 2 no hints; hint text
matches final keybindings.

Order rationale: persistence first (everything reads/writes it); hints
last (copy references every key shipped in between); sound after the
emitter exists.

## Risks

- Esc dual-role → priority chain + P alternative + key reference; playtest after Batch 2.
- WebAudio autoplay/Safari → gesture-resume day one; smoke-test klaxon early.
- Synth SFX cheap-sounding → accepted for demo (CD-33 replaces post-port); prototype gun shot + klaxon first.
- Save schema churn → migrations + corrupt-store QA case in Batch 1.
- 2x divergence → impossible by construction (same dt per step); QA compares anyway.
- CD-15 live snapshots → shell/hints compare scalars fresh per onChange only.
- Chip crowding → shared measured-width row (BuildRing's solved layout).
