import type { AppShell } from "../../app/AppShell";
import { LEVELS } from "../../data/levels";

/**
 * DOM screen (#screen-level-select) — a card per LEVELS entry: name,
 * description, lock state, best result from the save. Clicking an
 * unlocked card starts that level fresh (day 1). See
 * design-demo-milestone.md Problem 7.
 */
export class LevelSelect {
  private root: HTMLElement;
  private cardsEl: HTMLElement;
  private btnBack: HTMLButtonElement;

  constructor(private shell: AppShell) {
    this.root = el("screen-level-select");
    this.cardsEl = el("level-cards");
    this.btnBack = el("btn-back-to-title") as HTMLButtonElement;
    this.btnBack.addEventListener("click", () => this.shell.goToTitle());
  }

  /** Structural rebuild — call on every AppShell.onChange, cheap and only
   *  does real work while this screen is active. */
  render(): void {
    const active = this.shell.screen === "levelSelect";
    this.root.classList.toggle("hidden", !active);
    if (!active) return;

    this.cardsEl.innerHTML = "";
    LEVELS.forEach((level, index) => {
      const unlocked = this.shell.isUnlocked(index);
      const result = this.shell.bestResult(index);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "level-card";
      card.disabled = !unlocked;
      if (!unlocked) card.classList.add("locked");

      const name = document.createElement("div");
      name.className = "level-card-name";
      name.textContent = level.name;

      const desc = document.createElement("div");
      desc.className = "level-card-desc";
      desc.textContent = level.description;

      const status = document.createElement("div");
      status.className = "level-card-status";
      if (!unlocked) {
        status.textContent = "Locked";
      } else if (result?.cleared) {
        status.textContent = `Cleared · Best HQ ${result.bestHqHpPct}%`;
      } else {
        status.textContent = "Not cleared";
      }

      card.append(name, desc, status);
      if (unlocked) {
        card.addEventListener("click", () => this.shell.startLevel(index));
      }
      this.cardsEl.appendChild(card);
    });
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}
