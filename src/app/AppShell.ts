import { LEVELS } from "../data/levels";
import { validateLevels } from "../data/validate";
import { Game } from "../game/Game";
import type { GameSnapshot, Phase } from "../game/types";
import {
  LocalStorageBackend,
  SAVE_KEY,
  debounce,
  load,
  persist,
  type SaveDataV1,
  type StorageBackend,
} from "../persist/save";

export type AppScreen = "title" | "levelSelect" | "game";
export type AppModal = "none" | "pause";

/**
 * App state machine ABOVE the sim (see design-demo-milestone.md Problem 1).
 * Owns: screen state, pause/night-speed frame stepping, level flow
 * (startLevel/quitToMenu), and is the ONLY writer of persistence — Game
 * never touches localStorage. Game's own phase model (day/night/victory/
 * defeat) is untouched; this shell detects victory by comparing the
 * previous phase on each Game.onChange.
 *
 * Pause & night speed = frame sub-stepping (Problem 2): NOT dt scaling
 * (would change the integration step and drift balance). The frame loop
 * asks `stepsForFrame()` how many times to call `game.update(dt)` this
 * frame — 0 while paused/off-screen, 2 at night when nightSpeed is 2x,
 * else 1. The renderer keeps drawing every frame regardless, so the world
 * is visibly frozen (not hidden) under the pause modal.
 */
export class AppShell {
  readonly game: Game;

  private backend: StorageBackend;
  private data: SaveDataV1;
  private _screen: AppScreen = "title";
  private _modal: AppModal = "none";
  private _paused = false;
  private _nightSpeed: 1 | 2;
  private prevPhase: Phase;
  private listeners = new Set<() => void>();
  private settingsListeners = new Set<() => void>();
  private persistDebounced = debounce(() => this.persistNow(), 200);

  constructor(backend: StorageBackend = new LocalStorageBackend(SAVE_KEY)) {
    // DEV-only data contract check (docs/design-economy-rework.md R4) —
    // fails loud on boot rather than shipping a stale level.json edit that
    // tsc's `as unknown as` casts can't catch. See src/data/validate.ts.
    if (import.meta.env.DEV) validateLevels();
    this.backend = backend;
    this.data = load(this.backend);
    this._nightSpeed = this.data.settings.nightSpeed;
    this.game = new Game();
    this.prevPhase = this.game.getSnapshot().phase;
    this.game.onChange(() => this.handleGameChange());
  }

  get screen(): AppScreen {
    return this._screen;
  }

  get modal(): AppModal {
    return this._modal;
  }

  get paused(): boolean {
    return this._paused;
  }

  get nightSpeed(): 1 | 2 {
    return this._nightSpeed;
  }

  /** Read-only view for UI (title/level-select screens, DEV QA hook). The
   *  underlying object is mutated in place on victory, never reassigned. */
  get save(): SaveDataV1 {
    return this.data;
  }

  get levelCount(): number {
    return LEVELS.length;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Fires on every volume/mute change, including intermediate slider drags
   *  that `onChange` skips (see `setVolume`) — CD-3's AudioBus subscribes
   *  here for live updates instead of waiting for a full re-render pass. */
  onSettingsChange(fn: () => void): () => void {
    this.settingsListeners.add(fn);
    return () => this.settingsListeners.delete(fn);
  }

  private notifySettings(): void {
    for (const fn of this.settingsListeners) fn();
  }

  isUnlocked(levelIndex: number): boolean {
    return levelIndex < this.data.unlockedLevels;
  }

  bestResult(levelIndex: number): { cleared: boolean; bestHqHpPct: number } | null {
    const level = LEVELS[levelIndex];
    if (!level) return null;
    return this.data.levels[level.id] ?? null;
  }

  /** Whether the title screen should offer "Continue". */
  hasProgress(): boolean {
    return this.data.unlockedLevels > 1 || Object.keys(this.data.levels).length > 0;
  }

  goToTitle(): void {
    this.setScreen("title");
  }

  goToLevelSelect(): void {
    this.setScreen("levelSelect");
  }

  /** Always starts the level fresh at day 1 (loadLevel resets sim state). */
  startLevel(index: number): void {
    if (index < 0 || index >= LEVELS.length) return;
    if (!this.isUnlocked(index)) return;
    this.game.loadLevel(index);
    this.prevPhase = this.game.getSnapshot().phase;
    this.setScreen("game");
  }

  quitToMenu(): void {
    this.setScreen("levelSelect");
  }

  /** Victory overlay "Continue" route: next level if unlocked, else back to
   *  the level select screen (was the last level). */
  advanceAfterVictory(): void {
    const state = this.game.getSnapshot();
    const next = state.levelIndex + 1;
    if (next < LEVELS.length && this.isUnlocked(next)) {
      this.startLevel(next);
    } else {
      this.goToLevelSelect();
    }
  }

  /** How many times the frame loop should call `game.update(dt)` this
   *  frame: 0 off-screen or paused, 2 at night when nightSpeed is 2x, else
   *  1. Same dt per call either way — sub-stepping, not dt scaling — so
   *  2x cannot diverge from 1x by construction (see class doc). */
  stepsForFrame(phase: Phase): number {
    if (this._screen !== "game" || this._paused) return 0;
    if (phase === "night" && this._nightSpeed === 2) return 2;
    return 1;
  }

  /** P key (always toggles) and the pause button both route here. */
  togglePause(): void {
    if (this._screen !== "game") return;
    if (this._modal === "pause") this.closePauseModal();
    else this.openPauseModal();
  }

  openPauseModal(): void {
    if (this._screen !== "game" || this._modal === "pause") return;
    this._paused = true;
    this._modal = "pause";
    this.notify();
  }

  closePauseModal(): void {
    if (this._modal !== "pause") return;
    this._paused = false;
    this._modal = "none";
    this.notify();
  }

  /** F key / speed button. Persists immediately (rare, deliberate click) —
   *  only applies to `stepsForFrame` while phase === "night", but can be
   *  toggled any time so the choice is already made when night starts. */
  setNightSpeed(speed: 1 | 2): void {
    if (this._nightSpeed === speed) return;
    this._nightSpeed = speed;
    this.data.settings.nightSpeed = speed;
    this.persistNow();
    this.notify();
  }

  toggleNightSpeed(): void {
    this.setNightSpeed(this._nightSpeed === 1 ? 2 : 1);
  }

  /** Pause modal volume slider, now backing CD-3's AudioBus. Debounced
   *  persist so dragging doesn't spam localStorage writes; skips the heavy
   *  `onChange` re-render pass (nothing but the slider itself needs to
   *  react to every intermediate value) but does fire `onSettingsChange`
   *  so the audio bus tracks the live drag, not just the persisted value. */
  setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    if (this.data.settings.volume === v) return;
    this.data.settings.volume = v;
    this.persistDebounced();
    this.notifySettings();
  }

  setMuted(muted: boolean): void {
    if (this.data.settings.muted === muted) return;
    this.data.settings.muted = muted;
    this.persistNow();
    this.notifySettings();
    this.notify();
  }

  /** CD-26 onboarding hints (see design-demo-milestone.md Problem 6) — the
   *  ONLY writer of `hintsSeen`; HintController calls this the moment a
   *  hint's `done()` first turns true. No `notify()` here: HintController
   *  re-evaluates the full hint list within a single synchronous `render()`
   *  pass, so a hint dismissing never needs a second onChange round-trip. */
  markHintSeen(id: string): void {
    if (this.data.hintsSeen.includes(id)) return;
    this.data.hintsSeen.push(id);
    this.persistNow();
  }

  private setScreen(screen: AppScreen): void {
    this._screen = screen;
    // Leaving/entering the game screen always clears any pause state —
    // Quit to Menu shouldn't leave the next level start paused.
    this._paused = false;
    this._modal = "none";
    this.notify();
  }

  private handleGameChange(): void {
    const state = this.game.getSnapshot();
    if (this.prevPhase !== "victory" && state.phase === "victory") {
      this.recordVictory(state);
    }
    this.prevPhase = state.phase;
    this.notify();
  }

  private recordVictory(state: GameSnapshot): void {
    const level = LEVELS[state.levelIndex];
    if (!level) return;

    const hq = state.buildings.find((b) => b.id === state.hqId);
    const pct = hq && hq.maxHp > 0 ? Math.round((hq.hp / hq.maxHp) * 100) : 0;
    const existing = this.data.levels[level.id];
    const bestHqHpPct = existing ? Math.max(existing.bestHqHpPct, pct) : pct;
    this.data.levels[level.id] = { cleared: true, bestHqHpPct };

    const unlockIndex = state.levelIndex + 1;
    if (unlockIndex < LEVELS.length) {
      this.data.unlockedLevels = Math.max(this.data.unlockedLevels, unlockIndex + 1);
    }

    this.persistNow();
  }

  private persistNow(): void {
    persist(this.backend, this.data);
  }
}
