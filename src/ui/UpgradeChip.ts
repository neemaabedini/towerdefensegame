import { formatBranchBlurb, getBuilding, upgradeCost } from "../data/buildings";
import type { Game } from "../game/Game";
import type { GameSnapshot } from "../game/types";
import { alignOverlayToCanvas, makeOverlayRoot } from "./worldOverlay";

/**
 * World-anchored chip row above the selected building: the upgrade chip
 * (see UI_PLAN.md "Upgrade chip") plus the undo/sell chip (CD-24), rendered
 * together as ONE measured-width row — same layout approach as BuildRing —
 * so the two buttons are positioned from real measured widths and can
 * never overlap (see design-demo-milestone.md Problem 3).
 */
export class UpgradeChip {
  private container: HTMLElement;
  private root: HTMLElement;

  constructor(
    private game: Game,
    private canvas: HTMLCanvasElement,
  ) {
    const container = document.getElementById("world-ui");
    if (!container) throw new Error("Missing element #world-ui");
    this.container = container;
    this.root = makeOverlayRoot(container);
  }

  render(state: GameSnapshot): void {
    this.root.innerHTML = "";
    alignOverlayToCanvas(this.container, this.canvas);

    if (state.phase !== "day" || !state.selectedBuildingId) return;
    const b = state.buildings.find((x) => x.id === state.selectedBuildingId);
    // R5c (docs/design-wave-legibility.md): the HQ CAN upgrade/branch now —
    // getSellInfo below still hard-returns null for it (isHq guard stays
    // there), so the sell/undo chip simply never appears for the HQ.
    if (!b) return;

    const def = getBuilding(b.defId);
    const scale = this.canvas.clientWidth / state.level.width;
    const cx = b.x * scale;
    const cy = b.y * scale;

    const buttons: HTMLButtonElement[] = [];
    const maxed = b.level >= def.maxLevel;
    const branch = maxed ? null : this.game.pendingBranch(b.id);

    if (branch) {
      // Branching level: replace the single upgrade chip with one choice
      // chip per option (D4) — U alone is a no-op until one is picked.
      const cost = upgradeCost(def, b.level);
      const can = this.game.canUpgrade(b.id);
      branch.options.forEach((opt, i) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "upgrade-chip branch-chip";
        chip.disabled = !can;

        const label = document.createElement("span");
        label.className = "name";
        const key = document.createElement("kbd");
        key.textContent = String(i + 1);
        // formatBranchBlurb (not opt.blurb raw): derives the numeric text
        // from opt.mods when present so it can't drift from the data
        // (docs/design-wave-legibility.md §7c) — falls back to opt.blurb
        // verbatim for squad-swap options with no mods to derive from.
        label.append(key, ` ${opt.name} · ${formatBranchBlurb(opt)}`);

        const costEl = document.createElement("span");
        costEl.className = "cost";
        costEl.textContent = `${cost}₡`;

        chip.append(label, costEl);
        chip.addEventListener("click", () => this.game.upgrade(b.id, opt.id));
        this.root.appendChild(chip);
        buttons.push(chip);
      });
    } else {
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "upgrade-chip";

      if (maxed) {
        upBtn.disabled = true;
        const label = document.createElement("span");
        label.className = "name";
        label.textContent = `Lv ${b.level} · Max`;
        upBtn.append(label);
      } else {
        const cost = upgradeCost(def, b.level);
        const can = this.game.canUpgrade(b.id);
        upBtn.disabled = !can;

        const label = document.createElement("span");
        label.className = "name";
        const key = document.createElement("kbd");
        key.textContent = "U";
        label.append(key, ` Lv ${b.level} → ${b.level + 1}`);

        const costEl = document.createElement("span");
        costEl.className = "cost";
        costEl.textContent = `${cost}₡`;

        upBtn.append(label, costEl);
        upBtn.addEventListener("click", () => this.game.upgrade(b.id));
      }
      this.root.appendChild(upBtn);
      buttons.push(upBtn);
    }

    // Undo/sell chip (CD-24) — hidden for HQ/night (already excluded above)
    // and for unknown buildings; getSellInfo is the single source of truth
    // for label/kind so this stays in sync with Game.sellOrUndo.
    const sellInfo = this.game.getSellInfo(b.id);
    if (sellInfo) {
      const sellBtn = document.createElement("button");
      sellBtn.type = "button";
      sellBtn.className =
        sellInfo.kind === "sell" ? "sell-chip" : "sell-chip undo";

      const label = document.createElement("span");
      label.className = "name";
      const key = document.createElement("kbd");
      key.textContent = "X";
      label.append(key, sellInfo.kind === "sell" ? " Sell" : " Undo");

      const refundEl = document.createElement("span");
      refundEl.className = "cost";
      refundEl.textContent = `+${sellInfo.refund}₡`;

      sellBtn.append(label, refundEl);
      sellBtn.addEventListener("click", () => this.game.sellOrUndo(b.id));
      this.root.appendChild(sellBtn);
      buttons.push(sellBtn);
    }

    // Lay out as one or more measured-width rows (BuildRing's pattern):
    // create all buttons first so real widths can be measured, then place
    // them — this is what guarantees chips never overlap. >2 buttons (a
    // 2-option branch pick + the sell chip is already 3 today; CD-49 widens
    // branch counts further) wrap 2-per-row instead of one ever-widening row
    // that could run off-canvas.
    const gap = 8;
    const rowGap = 8;
    const pad = 6;
    const flip = b.y < 170;
    const clearance = Math.max(62, 72 * scale);

    const placeRow = (row: HTMLButtonElement[], y: number): void => {
      const widths = row.map((btn) => btn.offsetWidth);
      const total = widths.reduce((a, w) => a + w, 0) + gap * (row.length - 1);
      let x = cx - total / 2;
      x = Math.max(pad, Math.min(x, this.canvas.clientWidth - total - pad));
      for (const btn of row) {
        const w = btn.offsetWidth;
        btn.style.left = `${x + w / 2}px`;
        btn.style.top = `${y}px`;
        x += w + gap;
      }
    };

    if (buttons.length > 2) {
      const rowHeight = Math.max(...buttons.map((btn) => btn.offsetHeight));
      for (let i = 0; i < buttons.length; i += 2) {
        const ri = i / 2;
        // Row 0 sits at the usual clearance from the building; each further
        // row grows the block AWAY from the building (same direction as flip).
        const y = flip
          ? cy + clearance + ri * (rowHeight + rowGap)
          : cy - clearance - ri * (rowHeight + rowGap);
        placeRow(buttons.slice(i, i + 2), y);
      }
    } else {
      placeRow(buttons, flip ? cy + clearance : cy - clearance);
    }
  }
}
