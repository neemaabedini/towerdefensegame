import { AppShell } from "./app/AppShell";
import { AudioBus } from "./audio/AudioBus";
import { bindSounds, syncMusic } from "./audio/bindings";
import { STRINGS } from "./data/strings";
import { actionFromKey } from "./input/actions";
import type { Phase } from "./game/types";
import { PauseModal } from "./ui/PauseModal";
import { Renderer } from "./render/Renderer";
import { BuildRing } from "./ui/BuildRing";
import { HintController } from "./ui/Hints";
import { HUD } from "./ui/HUD";
import { LevelSelect } from "./ui/screens/LevelSelect";
import { TitleScreen } from "./ui/screens/TitleScreen";
import { UpgradeChip } from "./ui/UpgradeChip";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Missing canvas");

// CD-16 title slot: strings.json drives the tab title + top-bar brand
// everywhere else (title screen reads it directly).
document.title = STRINGS.gameTitle;
const brandTitleEl = document.getElementById("game-title");
if (brandTitleEl) brandTitleEl.textContent = STRINGS.gameTitle;

const shell = new AppShell();
const game = shell.game;

// CD-3 SFX + CD-33 music. AudioBus is silent until the first
// pointerdown/keydown gesture resumes its (lazily-created) AudioContext, so
// nothing plays or warns before then. bindSounds / syncMusic are the only
// bridge between GameEvent/phase and audio ids/themes.
const audioBus = new AudioBus();
bindSounds(game, audioBus);

/** Push saved volume/mute to the bus, ducking to silence while the pause
 *  modal is open (restored automatically once it closes, since this reads
 *  `shell.modal` fresh every call). Runs on both `onChange` (screen/modal
 *  transitions) and `onSettingsChange` (live slider drags, which skip the
 *  heavier onChange pass — see AppShell.setVolume). */
function applyAudioSettings(): void {
  const { volume, muted } = shell.save.settings;
  audioBus.setVolume(volume);
  audioBus.setMuted(muted || shell.modal === "pause");
}
shell.onChange(applyAudioSettings);
shell.onSettingsChange(applyAudioSettings);
applyAudioSettings();

// CD-33: music theme follows screen + phase + last-wave finale. Also
// re-sync when Game emits phase edges (onChange alone misses pure sim
// transitions that don't rewrite shell state — victory/defeat/dawn do
// via handleGameChange, but night start is a sim event; both paths are
// covered by shell.onChange + game.onEvent below).
function applyMusic(): void {
  syncMusic(shell, audioBus);
}
shell.onChange(applyMusic);
game.onEvent((ev) => {
  if (
    ev.type === "waveStarted" ||
    ev.type === "dawn" ||
    ev.type === "victory" ||
    ev.type === "defeat"
  ) {
    applyMusic();
  }
});
applyMusic();

const renderer = new Renderer(canvas);
const hud = new HUD(game, shell);
const buildRing = new BuildRing(game, canvas);
const upgradeChip = new UpgradeChip(game, canvas);
const hints = new HintController(shell, canvas);
const titleScreen = new TitleScreen(shell);
const levelSelect = new LevelSelect(shell);
const pauseModal = new PauseModal(shell);

if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__shell = shell;
  w.__save = () => shell.save;
  w.__audioBus = audioBus;
  w.__hints = hints;
  // requestAnimationFrame is throttled/paused on hidden/backgrounded tabs
  // (e.g. browser-automation-driven tabs), which starves the normal frame()
  // loop below — expose the renderer so tests can force a draw() manually.
  w.__renderer = renderer;
}

const gameAreaEl = document.getElementById("game-area");
const statusBarEl = document.getElementById("status-bar");
if (!gameAreaEl || !statusBarEl) throw new Error("Missing top-level layout elements");

window.addEventListener("resize", () => {
  if (shell.screen !== "game") return;
  renderer.resizeToDisplay();
  buildRing.render(game.getSnapshot());
  upgradeChip.render(game.getSnapshot());
  hints.render(game.getSnapshot());
});

canvas.addEventListener("click", (ev) => {
  if (shell.screen !== "game" || shell.modal !== "none") return;
  const { x, y } = renderer.canvasToWorld(ev.clientX, ev.clientY);
  game.selectAt(x, y);
});

// --- Hero movement (CD-29 Slice 1, docs/design-hero-commander.md §8/§9) ---
// A held-direction-key Set, updated on keydown AND keyup (this file
// previously had no keyup listener at all — the WASD/arrow keys only ever
// fed one-shot `nav` actions, which read fine off held-key OS repeat). Hero
// movement can't rely on repeat timing, so it's recomputed from the Set on
// every press/release edge and latched into the sim via Game.setHeroMove —
// never read live inside the frame()/update() loop (C4).
const heldDirs = new Set<"up" | "down" | "left" | "right">();

function dirFromKey(key: string): "up" | "down" | "left" | "right" | null {
  // WASD only — arrows stay pure `nav` (site/building selection). The split
  // is what lets the hero be drivable during the DAY (CD-29 day-positioning)
  // without stealing keyboard site navigation.
  switch (key) {
    case "w":
    case "W":
      return "up";
    case "s":
    case "S":
      return "down";
    case "a":
    case "A":
      return "left";
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}

/** Derives the normalized 8-way vector from the held-key Set and latches it.
 *  Safe to call any time the Set changes (or on a phase/pause transition
 *  that needs a re-latch) — no-ops by itself while off-screen or paused, and
 *  Game.setHeroMove is itself a no-op outside phase === "night" (defense in
 *  depth, §9.5). */
function dispatchHeroMove(): void {
  if (shell.screen !== "game" || shell.modal !== "none") return;
  let dx = 0;
  let dy = 0;
  if (heldDirs.has("left")) dx -= 1;
  if (heldDirs.has("right")) dx += 1;
  if (heldDirs.has("up")) dy -= 1;
  if (heldDirs.has("down")) dy += 1;
  game.setHeroMove(dx, dy);
}

// Keyup has no other consumer in this file today, but the held-key Set must
// keep updating even while the pause modal is open (a release mid-pause
// can't strand a latched vector) — dispatchHeroMove's own modal check keeps
// it from actually moving the hero while paused.
window.addEventListener("keyup", (ev) => {
  if (shell.screen !== "game") return;
  const dir = dirFromKey(ev.key);
  if (!dir) return;
  heldDirs.delete(dir);
  dispatchHeroMove();
});

// Keyboard → semantic actions (see src/input/actions.ts and UI_PLAN.md).
// Dead while off the game screen — the title/level-select screens use
// plain DOM focus + Enter/click instead.
window.addEventListener("keydown", (ev) => {
  if (shell.screen !== "game") return;

  // Set maintenance runs unconditionally (even while paused, for the same
  // release-stranding reason as keyup above); dispatchHeroMove no-ops while
  // paused so this can't move the hero mid-pause.
  const dir = dirFromKey(ev.key);
  if (dir) {
    heldDirs.add(dir);
    dispatchHeroMove();
  }

  const action = actionFromKey(ev);
  if (!action) return;

  // P always toggles the pause modal, whether it's currently open or not —
  // takes priority over the "swallow while paused" gate below.
  if (action.kind === "pause") {
    shell.togglePause();
    return;
  }

  // While the pause modal is open, every other game action is swallowed
  // except cancel (Esc), which closes it — see design-demo-milestone.md
  // Problem 2 "Esc conflict".
  if (shell.modal === "pause") {
    if (action.kind === "cancel") shell.closePauseModal();
    return;
  }

  const state = game.getSnapshot();

  switch (action.kind) {
    case "nav":
      ev.preventDefault();
      // Arrows navigate in BOTH phases again — the WASD/arrow split (CD-29
      // day-positioning) freed the arrows, restoring night building
      // inspection that §9.3 had demoted to mouse-only.
      game.navigate(action.dx, action.dy);
      break;
    case "option": {
      // Night: number row casts weapon actives (CD-40). Day: build / branch.
      if (state.phase === "night") {
        game.castAbility(action.index);
        break;
      }
      // If a building is selected and a branch choice is pending, 1/2 pick
      // the branch option instead of building at an (in this case
      // nonexistent) empty site — see docs/design-roster-redesign.md D4.
      const branch = state.selectedBuildingId
        ? game.pendingBranch(state.selectedBuildingId)
        : null;
      if (branch) {
        const opt = branch.options[action.index];
        if (opt) game.upgrade(state.selectedBuildingId!, opt.id);
      } else {
        game.buildOption(action.index);
      }
      break;
    }
    case "ability":
      game.castAbility(action.index);
      break;
    case "upgrade":
      // game.upgrade() itself requires a branchChoice whenever a branch is
      // pending, so calling it with none is already a safe no-op (D4).
      game.upgradeSelected();
      break;
    case "confirm":
      ev.preventDefault();
      if (state.phase === "victory") {
        shell.advanceAfterVictory();
      } else if (state.phase === "defeat") {
        game.restartLevel();
      } else if (state.phase === "day") {
        game.startNight();
      }
      break;
    case "cancel":
      // Esc priority: deselect first if something's selected, else open
      // the pause modal (second Esc pauses).
      if (state.selectedSiteId || state.selectedBuildingId) {
        game.selectSite(null);
        game.selectBuilding(null);
      } else {
        shell.openPauseModal();
      }
      break;
    case "restart":
      game.restartLevel();
      break;
    case "toggleSpeed":
      shell.toggleNightSpeed();
      break;
    case "sell":
      if (state.selectedBuildingId) game.sellOrUndo(state.selectedBuildingId);
      break;
  }
});

// Hero movement re-latch bookkeeping (§9.5): entering night must re-emit
// the currently-held vector, since a key held ACROSS the day→night edge
// produces no new keydown/keyup — dispatchHeroMove only runs on those
// edges otherwise. Entering day zeroes it explicitly (Game already zeroes
// heroMoveDir internally too — this is the main.ts half of the same
// defense-in-depth). Unpausing re-latches for the same reason: a key held
// through the pause modal produces no edge either, and dispatchHeroMove
// was a no-op the whole time it was open.
let lastHeroPhase: Phase | null = null;
let lastModal: "none" | "pause" = "none";

// Structural rebuilds only on real state changes (screen transitions or
// game state) — rebuilding per frame destroys buttons between mousedown
// and mouseup, eating clicks. Screens replace the game area/side panel
// while screen !== "game".
shell.onChange(() => {
  const inGame = shell.screen === "game";
  gameAreaEl.classList.toggle("hidden", !inGame);
  statusBarEl.classList.toggle("hidden", !inGame);

  titleScreen.render();
  levelSelect.render();
  pauseModal.render();

  if (inGame) {
    // Canvas was hidden (display:none) while off-screen, which zeroes its
    // measured size — recompute before anything reads clientWidth/Height.
    renderer.resizeToDisplay();
    const state = game.getSnapshot();
    hud.render(state);
    buildRing.render(state);
    upgradeChip.render(state);
    hints.render(state);
  } else {
    hints.hide();
  }

  const phase = inGame ? game.getSnapshot().phase : null;
  if (phase !== lastHeroPhase) {
    // Hero is drivable in BOTH day and night now — re-latch the held vector
    // on any transition into a playable phase, zero it on leaving them
    // (victory/defeat/off-screen).
    if (phase === "day" || phase === "night") dispatchHeroMove();
    else game.setHeroMove(0, 0);
    lastHeroPhase = phase;
  }
  if (shell.modal !== lastModal) {
    if (shell.modal === "none" && lastModal === "pause") dispatchHeroMove();
    lastModal = shell.modal;
  }
});

let last = performance.now();
let uiAccum = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // stepsForFrame is 0 off-screen/paused, 2 at night when nightSpeed is
  // 2x, else 1 — same dt per call, just repeated (sub-stepping, not dt
  // scaling; see AppShell class doc). getSnapshot() is cheap (live refs).
  const steps = shell.stepsForFrame(game.getSnapshot().phase);
  for (let i = 0; i < steps; i++) {
    game.update(dt);
  }

  if (shell.screen === "game") {
    const state = game.getSnapshot();
    renderer.draw(state, dt);

    // Throttled text-only updates (money, HP, wave) — never rebuilds DOM
    uiAccum += dt;
    if (uiAccum >= 0.1) {
      uiAccum = 0;
      hud.renderStats(state);
    }
  }

  requestAnimationFrame(frame);
}

// Initial UI: boots to the title screen (AppShell's default), which drives
// the first render pass through the onChange listener above.
shell.goToTitle();
requestAnimationFrame(frame);
