import type { AppShell } from "../app/AppShell";
import type { GameSnapshot } from "../game/types";
import { alignOverlayToCanvas, makeOverlayRoot } from "./worldOverlay";

/**
 * Onboarding hints (CD-26, see design-demo-milestone.md Problem 6) —
 * declarative, ordered, at most one on screen at a time. `anchor` returns
 * either a world point (rendered as a small card over the canvas, same
 * scale math as BuildRing/UpgradeChip) or a `{ dom: selector }` reference
 * (card positioned near that real DOM element, which also gets a CSS pulse
 * class while its hint is active).
 */
export interface HintDef {
  id: string;
  when(s: GameSnapshot): boolean;
  /** Dismiss on ACTION, never a timer. Once true, the id is written to
   *  hintsSeen and the next def in order gets a chance to show. */
  done(s: GameSnapshot): boolean;
  text: string;
  anchor(s: GameSnapshot): { x: number; y: number } | { dom: string };
}

function nearestEmptySite(s: GameSnapshot): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const site of s.sites) {
    if (site.buildingId) continue;
    const d = Math.hypot(site.x - s.level.hq.x, site.y - s.level.hq.y);
    if (d < bestD) {
      bestD = d;
      best = { x: site.x, y: site.y };
    }
  }
  return best;
}

/** Level-1 sequence, in display order. Every `when` is scoped tightly
 *  enough that at most one of these is ever the "first eligible" def at a
 *  time in normal play; `HintController.resolveActive` also guarantees it
 *  structurally (first-match-wins, see its doc comment). */
const HINTS: HintDef[] = [
  {
    id: "hint-select-site",
    when: (s) =>
      s.phase === "day" &&
      s.waveIndex === 0 &&
      s.selectedSiteId === null &&
      s.selectedBuildingId === null,
    done: (s) => s.selectedSiteId !== null || s.selectedBuildingId !== null,
    text: "Select a build site",
    anchor: (s) => nearestEmptySite(s) ?? { x: s.level.hq.x, y: s.level.hq.y - 60 },
  },
  {
    id: "hint-build",
    when: (s) => {
      if (!s.selectedSiteId) return false;
      const site = s.sites.find((x) => x.id === s.selectedSiteId);
      return !!site && !site.buildingId;
    },
    // buildings[0] is always the HQ (see Game.loadLevel) — any additional
    // entry means the player's first structure went up.
    done: (s) => s.buildings.length > 1,
    text: "Pick a structure — press 1–4 or click",
    anchor: (s) => {
      const site = s.sites.find((x) => x.id === s.selectedSiteId);
      return site ? { x: site.x, y: site.y } : { x: s.level.hq.x, y: s.level.hq.y };
    },
  },
  {
    id: "hint-markers",
    when: (s) => s.buildings.length > 1,
    // Self-guarded on the same "≥1 building" precondition as `when` (see
    // resolveActive's doc comment for why done() can't just assume when()
    // held) — otherwise this would read a nonexistent "last built" building
    // and misfire before anything's been placed. "Player selects something
    // else": Game.build() always leaves the freshly built building both
    // selected AND last in `buildings` (push), so comparing the current
    // selection to the last array entry detects a selection change without
    // the controller needing extra memory.
    done: (s) => {
      if (s.buildings.length <= 1) return false;
      if (s.phase !== "day") return true;
      const lastBuilt = s.buildings[s.buildings.length - 1];
      return !lastBuilt || s.selectedBuildingId !== lastBuilt.id;
    },
    text: "Red markers show where the next wave attacks",
    anchor: (s) => {
      const spawnId = s.upcomingSpawnIds[0];
      const sp = s.level.spawns.find((x) => x.id === spawnId);
      return sp ? { x: sp.x, y: sp.y } : { x: s.level.hq.x, y: s.level.hq.y };
    },
  },
  {
    id: "hint-start",
    when: (s) => s.buildings.length > 1,
    done: (s) => s.buildings.length > 1 && s.phase !== "day",
    text: "Press Space when ready",
    anchor: () => ({ dom: "#btn-ready" }),
  },
  {
    id: "hint-upgrade",
    when: (s) => s.phase === "day" && s.waveIndex === 1,
    // Self-guarded on the same day-2 precondition as `when` — otherwise a
    // build on day 1 (which also sets `builtToday`, cleared only at
    // startNight) would satisfy this before day 2 ever arrives. Reuses the
    // day-only spend ledger CD-24 already tracks per building — any
    // upgrade OR any new build on day 2 counts.
    done: (s) =>
      s.phase === "day" &&
      s.waveIndex === 1 &&
      s.buildings.some((b) => b.levelsToday > 0 || b.builtToday),
    text: "Select a building and press U to upgrade",
    anchor: (s) => {
      const b = s.buildings.find((x) => !x.isHq);
      return b ? { x: b.x, y: b.y } : { x: s.level.hq.x, y: s.level.hq.y };
    },
  },
];

export class HintController {
  private worldContainer: HTMLElement;
  private worldRoot: HTMLElement;
  private domCard: HTMLElement;
  private pulseTarget: Element | null = null;

  constructor(
    private shell: AppShell,
    private canvas: HTMLCanvasElement,
  ) {
    const container = document.getElementById("world-ui");
    if (!container) throw new Error("Missing element #world-ui");
    this.worldContainer = container;
    this.worldRoot = makeOverlayRoot(container);

    // DOM-anchored hints (hint-start -> #btn-ready) live in the side panel,
    // outside the canvas — a fixed-position card appended once to <body>,
    // independent of the world overlay root above.
    this.domCard = document.createElement("div");
    this.domCard.className = "hint-card hint-card-dom hidden";
    document.body.appendChild(this.domCard);
  }

  /** Call from the same onChange render pass as HUD/BuildRing/UpgradeChip —
   *  never per frame (see class doc + design-demo-milestone.md Problem 6). */
  render(state: GameSnapshot): void {
    this.worldRoot.innerHTML = "";
    this.domCard.classList.add("hidden");
    this.clearPulse();

    // First-run only, and hidden under the pause modal (frozen world
    // shouldn't keep nagging) — zero cost for veterans/level 2+ beyond this
    // one check per render.
    if (state.levelIndex !== 0 || this.shell.modal === "pause") return;

    const active = this.resolveActive(state);
    if (!active) return;

    alignOverlayToCanvas(this.worldContainer, this.canvas);
    const anchor = active.anchor(state);
    if ("dom" in anchor) {
      this.renderDomHint(active.text, anchor.dom);
    } else {
      this.renderWorldHint(active.text, anchor, state);
    }
  }

  /** Hide everything without touching hintsSeen — used when leaving the
   *  game screen (title/level select). */
  hide(): void {
    this.worldRoot.innerHTML = "";
    this.domCard.classList.add("hidden");
    this.clearPulse();
  }

  /**
   * Walks HINTS in order. `when` and `done` are usually complementary (e.g.
   * "nothing selected" vs. "something selected"), so by the instant done()
   * turns true, when() has typically already turned false in that same
   * snapshot — done() is therefore checked unconditionally (not gated
   * behind a currently-true when()), and every HintDef's `done` is written
   * to stand on its own (see hint-markers/hint-upgrade's self-guards)
   * rather than assuming `when` held earlier. Any not-yet-seen def whose
   * done() is true gets marked seen and skipped without ever being drawn —
   * this covers a player who acts before a hint had a chance to render, or
   * skips a step outright. The first remaining def whose `when` is true
   * (i.e. is actually due) becomes the one shown.
   */
  private resolveActive(state: GameSnapshot): HintDef | null {
    const seen = this.shell.save.hintsSeen;
    let candidate: HintDef | null = null;
    for (const def of HINTS) {
      if (seen.includes(def.id)) continue;
      if (def.done(state)) {
        this.shell.markHintSeen(def.id);
        continue;
      }
      if (candidate === null && def.when(state)) {
        candidate = def;
      }
    }
    return candidate;
  }

  private renderWorldHint(
    text: string,
    anchor: { x: number; y: number },
    state: GameSnapshot,
  ): void {
    const scale = this.canvas.clientWidth / state.level.width;
    const cx = anchor.x * scale;
    const cy = anchor.y * scale;

    const card = document.createElement("div");
    card.className = "hint-card";
    card.textContent = text;
    this.worldRoot.appendChild(card);

    // Flip below the anchor near the top edge, same clearance pattern as
    // BuildRing/UpgradeChip so hints never crowd those components' rows.
    const flip = anchor.y < 130;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let left = cx - w / 2;
    left = Math.max(6, Math.min(left, this.canvas.clientWidth - w - 6));
    const clearance = 46;
    const top = flip ? cy + clearance : cy - clearance - h;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    const arrow = document.createElement("div");
    arrow.className = flip ? "hint-arrow hint-arrow-up" : "hint-arrow hint-arrow-down";
    arrow.style.left = `${Math.max(10, Math.min(cx - left - 7, w - 17))}px`;
    card.appendChild(arrow);
  }

  private renderDomHint(text: string, selector: string): void {
    const target = document.querySelector(selector);
    if (!target) return;

    target.classList.add("hint-pulse");
    this.pulseTarget = target;

    this.domCard.textContent = text;
    this.domCard.classList.remove("hidden");
    const rect = target.getBoundingClientRect();
    const w = this.domCard.offsetWidth;
    const h = this.domCard.offsetHeight;
    this.domCard.style.left = `${rect.left + rect.width / 2 - w / 2}px`;
    this.domCard.style.top = `${rect.top - h - 14}px`;

    const arrow = document.createElement("div");
    arrow.className = "hint-arrow hint-arrow-down";
    arrow.style.left = `${w / 2 - 7}px`;
    this.domCard.appendChild(arrow);
  }

  private clearPulse(): void {
    if (this.pulseTarget) {
      this.pulseTarget.classList.remove("hint-pulse");
      this.pulseTarget = null;
    }
  }
}
