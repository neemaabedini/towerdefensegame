import type { AppShell } from "../../app/AppShell";
import { HEROES } from "../../data/hero";
import { LEVELS } from "../../data/levels";
import { formatMutatorBlurb, MUTATORS } from "../../data/mutators";
import { formatPerkBlurb, PERKS } from "../../data/perks";

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

    // CD-30 hero weapons: pre-level loadout picker. Slice 4 gates chips by
    // totalStars vs unlockStars (locked chips stay visible, not selectable).
    // Blurb + name on the face, no hover (UI_PLAN 6); selection persists via
    // shell.setHeroWeapon and lands in Game at startLevel.
    const totalStars = this.shell.totalStars();
    const weaponRow = document.createElement("div");
    weaponRow.className = "weapon-row";
    const weaponLabel = document.createElement("div");
    weaponLabel.className = "weapon-row-label";
    weaponLabel.textContent = `Commander weapon · ${totalStars}★`;
    weaponRow.appendChild(weaponLabel);
    for (const def of Object.values(HEROES)) {
      const unlocked = this.shell.isWeaponUnlocked(def.id);
      const need = def.unlockStars ?? 0;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "weapon-chip";
      if (def.id === this.shell.heroWeapon) chip.classList.add("selected");
      if (!unlocked) {
        chip.classList.add("locked");
        chip.disabled = true;
      }
      const name = document.createElement("div");
      name.className = "weapon-chip-name";
      name.textContent = def.name;
      const blurb = document.createElement("div");
      blurb.className = "weapon-chip-blurb";
      blurb.textContent = unlocked ? def.blurb : `Unlock at ${need}★`;
      chip.append(name, blurb);
      if (unlocked) {
        chip.addEventListener("click", () => this.shell.setHeroWeapon(def.id));
      }
      weaponRow.appendChild(chip);
    }
    this.cardsEl.appendChild(weaponRow);

    // CD-30 Slice 2/4: perk row — selectable up to shell.perkSlots(), "n/m"
    // counter, locked chips by unlockStars, chip text from formatPerkBlurb.
    const perkSlots = this.shell.perkSlots();
    const selectedPerks = this.shell.selectedPerks;
    const perkRow = document.createElement("div");
    perkRow.className = "perk-row";
    const perkLabel = document.createElement("div");
    perkLabel.className = "perk-row-label";
    perkLabel.textContent = `Perks (${selectedPerks.length}/${perkSlots})`;
    perkRow.appendChild(perkLabel);
    for (const def of Object.values(PERKS)) {
      const unlocked = this.shell.isPerkUnlocked(def.id);
      const selected = selectedPerks.includes(def.id);
      const atCap = unlocked && !selected && selectedPerks.length >= perkSlots;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "perk-chip";
      if (selected) chip.classList.add("selected");
      if (atCap) chip.classList.add("at-cap");
      if (!unlocked) {
        chip.classList.add("locked");
        chip.disabled = true;
      }
      const name = document.createElement("div");
      name.className = "perk-chip-name";
      name.textContent = def.name;
      const blurb = document.createElement("div");
      blurb.className = "perk-chip-blurb";
      blurb.textContent = unlocked
        ? formatPerkBlurb(def)
        : `Unlock at ${def.unlockStars}★`;
      chip.append(name, blurb);
      if (unlocked) {
        chip.addEventListener("click", () => this.shell.togglePerk(def.id));
      }
      perkRow.appendChild(chip);
    }
    this.cardsEl.appendChild(perkRow);

    // CD-30 Slice 3: mutator row — multi-select toggles, no slot cap. Each
    // chip's face carries its effect + "+3rd star" (formatMutatorBlurb,
    // design doc §4 Q5/M8). Session-only selection (shell.selectedMutators
    // resets on reload, unlike perks).
    const selectedMutators = this.shell.selectedMutators;
    const mutatorRow = document.createElement("div");
    mutatorRow.className = "mutator-row";
    const mutatorLabel = document.createElement("div");
    mutatorLabel.className = "mutator-row-label";
    mutatorLabel.textContent = "Mutators";
    mutatorRow.appendChild(mutatorLabel);
    for (const def of Object.values(MUTATORS)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "mutator-chip";
      if (selectedMutators.includes(def.id)) chip.classList.add("selected");
      const name = document.createElement("div");
      name.className = "mutator-chip-name";
      name.textContent = def.name;
      const blurb = document.createElement("div");
      blurb.className = "mutator-chip-blurb";
      blurb.textContent = formatMutatorBlurb(def);
      chip.append(name, blurb);
      chip.addEventListener("click", () => this.shell.toggleMutator(def.id));
      mutatorRow.appendChild(chip);
    }
    this.cardsEl.appendChild(mutatorRow);

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

      // CD-30 Slice 1: 3 star glyphs (Clear / Flawless / Hardened) — numbers-
      // on-face, no hover (UI_PLAN 6). Empty (unearned) on a locked or
      // never-cleared card, same as bestResult's own "Not cleared" fallback.
      const stars = document.createElement("div");
      stars.className = "level-card-stars";
      const [star1, star2, star3] = unlocked ? this.shell.starsFor(index) : [false, false, false];
      for (const earned of [star1, star2, star3]) {
        const glyph = document.createElement("span");
        glyph.className = "star-glyph" + (earned ? " earned" : "");
        glyph.textContent = "★";
        stars.appendChild(glyph);
      }

      const status = document.createElement("div");
      status.className = "level-card-status";
      if (!unlocked) {
        status.textContent = "Locked";
      } else if (result?.cleared) {
        status.textContent = `Cleared · Best HQ ${result.bestHqHpPct}%`;
      } else {
        status.textContent = "Not cleared";
      }

      card.append(name, desc, stars, status);
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
