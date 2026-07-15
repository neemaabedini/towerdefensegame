import { AppShell } from "./app/AppShell";
import { AudioBus } from "./audio/AudioBus";
import { bindSounds } from "./audio/bindings";
import { STRINGS } from "./data/strings";
import { actionFromKey } from "./input/actions";
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

// CD-3: synthesized WebAudio SFX. AudioBus is silent until the first
// pointerdown/keydown gesture resumes its (lazily-created) AudioContext, so
// nothing plays or warns before then. bindSounds is the only file that
// knows both the GameEvent and SoundId vocabularies.
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

// Keyboard → semantic actions (see src/input/actions.ts and UI_PLAN.md).
// Dead while off the game screen — the title/level-select screens use
// plain DOM focus + Enter/click instead.
window.addEventListener("keydown", (ev) => {
  if (shell.screen !== "game") return;
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
      game.navigate(action.dx, action.dy);
      break;
    case "option": {
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
