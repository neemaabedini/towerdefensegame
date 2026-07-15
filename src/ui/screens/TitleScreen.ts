import type { AppShell } from "../../app/AppShell";
import { STRINGS } from "../../data/strings";

/**
 * DOM screen (#screen-title) — first thing a stranger sees. Play always
 * routes to level select; Continue (shown only with saved progress) jumps
 * straight into the furthest unlocked level. See design-demo-milestone.md
 * Problem 7.
 */
export class TitleScreen {
  private root: HTMLElement;
  private headingEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private btnPlay: HTMLButtonElement;
  private btnContinue: HTMLButtonElement;

  constructor(private shell: AppShell) {
    this.root = el("screen-title");
    this.headingEl = el("title-heading");
    this.subtitleEl = el("title-subtitle");
    this.btnPlay = el("btn-play") as HTMLButtonElement;
    this.btnContinue = el("btn-continue") as HTMLButtonElement;

    this.headingEl.textContent = STRINGS.gameTitle;
    this.subtitleEl.textContent = STRINGS.gameSubtitle;

    this.btnPlay.addEventListener("click", () => this.shell.goToLevelSelect());
    this.btnContinue.addEventListener("click", () => {
      const furthest = Math.max(
        0,
        Math.min(this.shell.save.unlockedLevels - 1, this.shell.levelCount - 1),
      );
      this.shell.startLevel(furthest);
    });
  }

  /** Call on every AppShell.onChange — cheap, no-op unless this screen is active. */
  render(): void {
    const active = this.shell.screen === "title";
    this.root.classList.toggle("hidden", !active);
    if (!active) return;

    this.subtitleEl.classList.toggle("hidden", STRINGS.gameSubtitle.length === 0);
    this.btnContinue.classList.toggle("hidden", !this.shell.hasProgress());
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}
