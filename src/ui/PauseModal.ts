import type { AppShell } from "../app/AppShell";

/**
 * Pause modal (CD-2) — its own DOM node (#pause-modal), not the victory
 * overlay, but reusing the same `.overlay-card` space-theme styling.
 * Resume / Restart / Quit to Menu, a volume slider + mute checkbox
 * (CD-2's placeholder ahead of CD-3's real audio bus, persisted via
 * AppShell.setVolume/setMuted), and a key-reference block. See
 * design-demo-milestone.md Problem 2.
 */
export class PauseModal {
  private root: HTMLElement;
  private btnResume: HTMLButtonElement;
  private btnRestart: HTMLButtonElement;
  private btnQuit: HTMLButtonElement;
  private volumeInput: HTMLInputElement;
  private muteInput: HTMLInputElement;

  constructor(private shell: AppShell) {
    this.root = el("pause-modal");
    this.btnResume = el("btn-pause-resume") as HTMLButtonElement;
    this.btnRestart = el("btn-pause-restart") as HTMLButtonElement;
    this.btnQuit = el("btn-pause-quit") as HTMLButtonElement;
    this.volumeInput = el("pause-volume") as HTMLInputElement;
    this.muteInput = el("pause-mute") as HTMLInputElement;

    this.btnResume.addEventListener("click", () => this.shell.closePauseModal());
    this.btnRestart.addEventListener("click", () => {
      this.shell.closePauseModal();
      this.shell.game.restartLevel();
    });
    this.btnQuit.addEventListener("click", () => {
      this.shell.closePauseModal();
      this.shell.quitToMenu();
    });

    // Native inputs already reflect the live drag/click value visually;
    // AppShell.setVolume debounces the actual persistence write.
    this.volumeInput.addEventListener("input", () => {
      this.shell.setVolume(Number(this.volumeInput.value) / 100);
    });
    this.muteInput.addEventListener("change", () => {
      this.shell.setMuted(this.muteInput.checked);
    });
  }

  /** Call on every AppShell.onChange — cheap, no-op unless the modal is
   *  open. Syncs the inputs from saved settings each time it opens. */
  render(): void {
    const open = this.shell.modal === "pause";
    this.root.classList.toggle("hidden", !open);
    if (!open) return;

    const vol = Math.round(this.shell.save.settings.volume * 100);
    if (Number(this.volumeInput.value) !== vol) {
      this.volumeInput.value = String(vol);
    }
    this.muteInput.checked = this.shell.save.settings.muted;
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}
