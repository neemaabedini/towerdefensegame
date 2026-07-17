import type { AppShell } from "../../app/AppShell";
import { HEROES } from "../../data/hero";
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

    // CD-30 hero weapons: pre-level loadout picker. All unlocked for now
    // (user decision 2026-07-16) — unlock gating arrives with CD-30 proper.
    // Blurb + name on the face, no hover (UI_PLAN 6); selection persists via
    // shell.setHeroWeapon and lands in Game at startLevel.
    const weaponRow = document.createElement("div");
    weaponRow.className = "weapon-row";
    const weaponLabel = document.createElement("div");
    weaponLabel.className = "weapon-row-label";
    weaponLabel.textContent = "Commander weapon";
    weaponRow.appendChild(weaponLabel);
    for (const def of Object.values(HEROES)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "weapon-chip";
      if (def.id === this.shell.heroWeapon) chip.classList.add("selected");
      const name = document.createElement("div");
      name.className = "weapon-chip-name";
      name.textContent = def.name;
      const blurb = document.createElement("div");
      blurb.className = "weapon-chip-blurb";
      blurb.textContent = def.blurb;
      chip.append(name, blurb);
      chip.addEventListener("click", () => this.shell.setHeroWeapon(def.id));
      weaponRow.appendChild(chip);
    }
    this.cardsEl.appendChild(weaponRow);

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
