import type { AppShell } from "../app/AppShell";
import { getBuilding, scaledStats } from "../data/buildings";
import { getEnemy } from "../data/enemies";
import { getUnit } from "../data/units";
import type { Game } from "../game/Game";
import type { GameSnapshot } from "../game/types";

export class HUD {
  private moneyEl: HTMLElement;
  private hqHpEl: HTMLElement;
  private waveLabelEl: HTMLElement;
  private phaseLabelEl: HTMLElement;
  private levelNameEl: HTMLElement;
  private levelDescEl: HTMLElement;
  private waveForecastEl: HTMLElement;
  private waveForecastListEl: HTMLElement;
  private siteListEl: HTMLElement;
  private buildHintEl: HTMLElement;
  private selectedPanelEl: HTMLElement;
  private selectedInfoEl: HTMLElement;
  private btnReady: HTMLButtonElement;
  private btnSpeed: HTMLButtonElement;
  private speedLabelEl: HTMLElement;
  private btnRestart: HTMLButtonElement;
  private overlay: HTMLElement;
  private overlayTitle: HTMLElement;
  private overlayBody: HTMLElement;
  private btnOverlayPrimary: HTMLButtonElement;
  private btnOverlaySecondary: HTMLButtonElement;
  private btnOverlayLevels: HTMLButtonElement;
  private selectedHpEl: HTMLElement | null = null;

  constructor(
    private game: Game,
    private shell: AppShell,
  ) {
    this.moneyEl = el("money");
    this.hqHpEl = el("hq-hp");
    this.waveLabelEl = el("wave-label");
    this.phaseLabelEl = el("phase-label");
    this.levelNameEl = el("level-name");
    this.levelDescEl = el("level-desc");
    this.waveForecastEl = el("wave-forecast");
    this.waveForecastListEl = el("wave-forecast-list");
    this.siteListEl = el("site-list");
    this.buildHintEl = el("build-hint");
    this.selectedPanelEl = el("selected-panel");
    this.selectedInfoEl = el("selected-info");
    this.btnReady = el("btn-ready") as HTMLButtonElement;
    this.btnSpeed = el("btn-speed") as HTMLButtonElement;
    this.speedLabelEl = el("speed-label");
    this.btnRestart = el("btn-restart") as HTMLButtonElement;
    this.overlay = el("overlay");
    this.overlayTitle = el("overlay-title");
    this.overlayBody = el("overlay-body");
    this.btnOverlayPrimary = el("btn-overlay-primary") as HTMLButtonElement;
    this.btnOverlaySecondary = el(
      "btn-overlay-secondary",
    ) as HTMLButtonElement;
    this.btnOverlayLevels = el("btn-overlay-levels") as HTMLButtonElement;

    this.btnReady.addEventListener("click", () => this.game.startNight());
    this.btnSpeed.addEventListener("click", () => this.shell.toggleNightSpeed());
    this.btnRestart.addEventListener("click", () => this.game.restartLevel());
    this.btnOverlaySecondary.addEventListener("click", () => {
      this.hideOverlay();
      this.game.restartLevel();
    });
    this.btnOverlayPrimary.addEventListener("click", () => {
      const snap = this.game.getSnapshot();
      this.hideOverlay();
      if (snap.phase === "victory") {
        this.shell.advanceAfterVictory();
      } else {
        this.game.restartLevel();
      }
    });
    this.btnOverlayLevels.addEventListener("click", () => {
      this.hideOverlay();
      this.shell.goToLevelSelect();
    });
  }

  /**
   * Full structural rebuild. Call ONLY when game state changes (via
   * Game.onChange) — rebuilding every frame destroys buttons mid-click.
   */
  render(state: GameSnapshot): void {
    this.renderStats(state);

    this.levelNameEl.textContent = state.level.name;
    this.levelDescEl.textContent = state.level.description;

    this.renderWaveForecast(state);
    this.renderSites(state);
    this.renderSelected(state);
    this.renderPhaseActions(state);
    this.renderOverlay(state);
  }

  /** Cheap text-only updates, safe to call every frame */
  renderStats(state: GameSnapshot): void {
    this.moneyEl.textContent = String(state.money);

    const hq = state.buildings.find((b) => b.id === state.hqId);
    this.hqHpEl.textContent = hq
      ? `${Math.ceil(hq.hp)} / ${hq.maxHp}`
      : "0";

    const waveDisplay =
      state.phase === "day"
        ? state.waveIndex + 1
        : Math.min(state.waveIndex + 1, state.totalWaves);
    this.waveLabelEl.textContent = `Wave ${waveDisplay} / ${state.totalWaves}`;

    this.phaseLabelEl.textContent =
      state.phase === "day"
        ? "DAY"
        : state.phase === "night"
          ? "NIGHT"
          : state.phase.toUpperCase();
    this.phaseLabelEl.className = `phase ${
      state.phase === "night" ? "night" : "day"
    }`;

    // Live HP line for the selected building (drains during night)
    if (this.selectedHpEl && state.selectedBuildingId) {
      const b = state.buildings.find(
        (x) => x.id === state.selectedBuildingId,
      );
      if (b) {
        this.selectedHpEl.textContent = `HP ${Math.ceil(b.hp)} / ${b.maxHp}`;
      }
    }
  }

  /** "Next: 9x Raider (West)" style forecast — day only, complements the
   *  map's spawn warning markers. Rebuilt only on onChange (here), not
   *  renderStats, since wave composition never changes mid-frame. */
  private renderWaveForecast(state: GameSnapshot): void {
    const wave = state.level.waves[state.waveIndex];
    if (state.phase !== "day" || !wave) {
      this.waveForecastEl.classList.add("hidden");
      return;
    }
    this.waveForecastEl.classList.remove("hidden");
    this.waveForecastListEl.innerHTML = "";

    const spawnIds = state.level.spawns.map((s) => s.id);
    let spawnCursor = 0;
    const groups = new Map<string, { enemyId: string; spawnId: string; count: number }>();
    for (const entry of wave.entries) {
      const spawnId =
        entry.spawnId ?? spawnIds[spawnCursor++ % spawnIds.length]!;
      const key = `${entry.enemyId}|${spawnId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += entry.count;
      } else {
        groups.set(key, { enemyId: entry.enemyId, spawnId, count: entry.count });
      }
    }

    for (const { enemyId, spawnId, count } of groups.values()) {
      const def = getEnemy(enemyId);
      const row = document.createElement("div");
      row.className = "forecast-row";

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.backgroundColor = def.color;

      const label = document.createElement("span");
      const countSpan = document.createElement("span");
      countSpan.className = "count";
      countSpan.textContent = `${count}×`;
      label.append(countSpan, ` ${def.name}`);

      const badges = document.createElement("span");
      badges.className = "forecast-badges";
      if (def.archetype === "flyer") badges.appendChild(forecastBadge("AIR", "air"));
      if (def.armor >= 4) badges.appendChild(forecastBadge("ARMORED", "armored"));
      if (def.attackRange && def.attackRange > 0) {
        badges.appendChild(forecastBadge("RANGED", "ranged"));
      }

      const dir = document.createElement("span");
      dir.className = "dir";
      dir.textContent = formatDirection(spawnId);

      row.append(dot, label, badges, dir);
      this.waveForecastListEl.appendChild(row);
    }
  }

  private renderSites(state: GameSnapshot): void {
    this.siteListEl.innerHTML = "";
    if (state.phase !== "day") {
      this.buildHintEl.textContent =
        state.phase === "night"
          ? "Night assault in progress. Defenses are automatic."
          : "Level complete.";
      return;
    }

    this.buildHintEl.textContent =
      "Red markers show where the next wave attacks. Select a site, then choose a structure.";

    for (const site of state.sites) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "site-btn";
      if (site.id === state.selectedSiteId) btn.classList.add("selected");

      const left = document.createElement("span");
      if (site.buildingId) {
        const b = state.buildings.find((x) => x.id === site.buildingId);
        const name = b ? getBuilding(b.defId).name : "Occupied";
        left.textContent = name;
        btn.disabled = false;
        btn.addEventListener("click", () => {
          if (b) this.game.selectBuilding(b.id);
        });
      } else {
        left.textContent = `Empty (${site.category})`;
        btn.addEventListener("click", () => this.game.selectSite(site.id));
      }

      const tag = document.createElement("span");
      tag.className = "tag";
      if (site.buildingId) {
        tag.textContent = `Lv ${state.buildings.find((x) => x.id === site.buildingId)?.level ?? 1}`;
      } else {
        tag.textContent = site.category;
        tag.classList.add(site.category);
      }

      btn.append(left, tag);
      this.siteListEl.appendChild(btn);
    }
  }

  private renderSelected(state: GameSnapshot): void {
    this.selectedPanelEl.classList.add("hidden");
    this.selectedInfoEl.innerHTML = "";
    this.selectedHpEl = null;

    const id = state.selectedBuildingId;
    if (!id) return;
    const b = state.buildings.find((x) => x.id === id);
    if (!b) return;

    this.selectedPanelEl.classList.remove("hidden");
    const def = getBuilding(b.defId);
    const stats = scaledStats(def, b.level, b.branchId);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = b.isHq ? def.name : `${def.name}  ·  Lv ${b.level}`;

    const hpLine = document.createElement("div");
    hpLine.textContent = `HP ${Math.ceil(b.hp)} / ${b.maxHp}`;
    this.selectedHpEl = hpLine;

    const meta = document.createElement("div");
    meta.className = "meta";
    const lines: string[] = [def.description];
    if (stats.damage > 0) {
      lines.push(
        `Damage ${stats.damage} · Range ${stats.range} · Fire rate ${stats.fireRate.toFixed(2)}/s`,
      );
      if (stats.splashRadius > 0) {
        lines.push(`Splash radius ${Math.round(stats.splashRadius)}`);
      }
    }
    if (stats.incomePerDay > 0) {
      if (def.mining) {
        // incomePerDay is PER NODE for a mining def (D3) — show the real
        // total this building pays, not the per-node figure.
        const site = state.sites.find((s) => s.id === b.siteId);
        const nodes = site?.resources[def.mining.resource] ?? 0;
        const total = Math.round(stats.incomePerDay * nodes);
        lines.push(`Income ${total} credits at dawn (${nodes} × ${Math.round(stats.incomePerDay)}₡ node)`);
      } else {
        lines.push(`Income ${Math.round(stats.incomePerDay)} credits at dawn`);
      }
    }
    // Garrison squad line (Batch 3) — resolved from def + level + branch,
    // not live survivor count, so it reads as "what you composed" rather
    // than "who's left standing tonight".
    const squadSpec = b.branchId
      ? def.branch?.options.find((o) => o.id === b.branchId)?.squad
      : def.squad;
    if (squadSpec) {
      const idx = Math.max(0, Math.min(squadSpec.countByLevel.length - 1, b.level - 1));
      const count = squadSpec.countByLevel[idx] ?? 0;
      const unitDef = getUnit(squadSpec.unitId);
      const label = count === 1 ? unitDef.name : `${unitDef.name}s`;
      lines.push(`Squad: ${count} ${label}`);
    }
    meta.append(hpLine);
    for (const l of lines) {
      const div = document.createElement("div");
      div.textContent = l;
      meta.appendChild(div);
    }

    this.selectedInfoEl.append(title, meta);
  }

  private renderPhaseActions(state: GameSnapshot): void {
    const canReady =
      state.phase === "day" && state.waveIndex < state.totalWaves;
    this.btnReady.disabled = !canReady;
    this.btnReady.textContent =
      state.phase === "night"
        ? `Fighting wave ${state.waveIndex + 1}…`
        : state.waveIndex === 0
          ? "Ready for Night"
          : `Start Wave ${state.waveIndex + 1}`;

    // Night-only: pre-selectable any time via F, but only meaningful once
    // night starts (CD-28).
    this.btnSpeed.classList.toggle("hidden", state.phase !== "night");
    this.speedLabelEl.textContent = `${this.shell.nightSpeed}x`;
  }

  private renderOverlay(state: GameSnapshot): void {
    if (state.phase === "victory") {
      const hasNext = state.levelIndex + 1 < this.shell.levelCount;
      this.showOverlay(
        "Victory!",
        `You held ${state.level.name}. The enemy retreats at dawn.`,
        hasNext ? "Next Level" : "Back to Menu",
      );
    } else if (state.phase === "defeat") {
      this.showOverlay(
        "Defeat",
        "The Command Center has fallen. Rebuild and try a different layout.",
        "Retry",
      );
    } else {
      this.hideOverlay();
    }
  }

  private showOverlay(title: string, body: string, primary: string): void {
    this.overlay.classList.remove("hidden");
    this.overlayTitle.textContent = title;
    this.overlayBody.textContent = body;
    this.btnOverlayPrimary.textContent = primary;
  }

  private hideOverlay(): void {
    this.overlay.classList.add("hidden");
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

/** Forecast row chip: AIR / ARMORED / RANGED — see docs/design-counterplay-pass.md */
function forecastBadge(text: string, variant: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `forecast-badge forecast-badge-${variant}`;
  span.textContent = text;
  return span;
}

/** "north_west" -> "North West" */
function formatDirection(spawnId: string): string {
  return spawnId
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
