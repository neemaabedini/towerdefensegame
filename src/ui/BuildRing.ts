import { getBuilding } from "../data/buildings";
import type { Game } from "../game/Game";
import type { GameSnapshot } from "../game/types";
import { alignOverlayToCanvas, makeOverlayRoot } from "./worldOverlay";

/**
 * World-anchored build menu: option buttons fan out in an arc around the
 * selected empty site. DOM buttons positioned over the canvas so we keep
 * CSS/accessibility, but conceptually this is world-space UI (see UI_PLAN.md).
 */
export class BuildRing {
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

    if (state.phase !== "day" || !state.selectedSiteId) return;
    const site = state.sites.find((s) => s.id === state.selectedSiteId);
    if (!site || site.buildingId) return;

    const scale = this.canvas.clientWidth / state.level.width;
    const cx = site.x * scale;
    const cy = site.y * scale;

    // Create the buttons first so real widths can be measured, then fan
    // them out side by side — angle-based spacing overlaps wide labels.
    const buttons: HTMLButtonElement[] = [];
    for (const [i, optId] of site.options.entries()) {
      const def = getBuilding(optId);
      const can = this.game.canBuild(site.id, optId);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ring-option";
      btn.disabled = !can;
      btn.title = def.description;

      const name = document.createElement("span");
      name.className = "name";
      const key = document.createElement("kbd");
      key.textContent = String(i + 1);
      name.append(key, ` ${def.name}`);

      const cost = document.createElement("span");
      cost.className = "cost";
      cost.textContent = `${def.cost}₡`;

      btn.append(name, cost);

      // Income-on-button (C2/C7: no trap picks, no hover-only info) — shown
      // for mining options only, using the site's already-derived nodes.
      if (def.mining) {
        const income = document.createElement("span");
        income.className = "income";
        income.textContent = `${this.game.previewIncome(site.id, optId)}₡/dawn`;
        btn.append(income);
      }

      btn.addEventListener("click", () => this.game.build(site.id, optId));
      this.root.appendChild(btn);
      buttons.push(btn);
    }

    const gap = 8;
    const pad = 6;
    const widths = buttons.map((b) => b.offsetWidth);
    const total =
      widths.reduce((a, w) => a + w, 0) + gap * (buttons.length - 1);

    // Keep the whole row on the canvas
    let x = cx - total / 2;
    x = Math.max(pad, Math.min(x, this.canvas.clientWidth - total - pad));

    // Row sits above the site (below when near the top edge), with the
    // middle button lifted slightly for an arc feel
    const flip = site.y < 170;
    const clearance = Math.max(62, 72 * scale);
    const baseY = flip ? cy + clearance : cy - clearance;
    const mid = (buttons.length - 1) / 2;

    buttons.forEach((btn, i) => {
      const w = widths[i]!;
      const t = mid === 0 ? 0 : (i - mid) / mid;
      const arcLift = 12 * (1 - t * t);
      btn.style.left = `${x + w / 2}px`;
      btn.style.top = `${flip ? baseY + arcLift : baseY - arcLift}px`;
      x += w + gap;
    });
  }
}
