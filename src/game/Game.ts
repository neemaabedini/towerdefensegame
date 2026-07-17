import {
  deriveSiteResources,
  getBuilding,
  scaledStats,
  SELL_REFUND,
  upgradeCost,
  type BranchOption,
  type BuildingDef,
  type StatMods,
  type TargetMode,
} from "../data/buildings";
import { getEnemy, type EnemyDef } from "../data/enemies";
import { getHero, HEROES } from "../data/hero";
import { getLevel, type LevelDef, type WaveDef } from "../data/levels";
import { TUNING } from "../data/tuning";
import { getUnit, unitStats } from "../data/units";
import type {
  BuildSiteState,
  EnemyUnit,
  FloatingText,
  GameEvent,
  GameSnapshot,
  GarrisonUnit,
  HeroState,
  Particle,
  Phase,
  PlacedBuilding,
  Projectile,
  Vec2,
  WreckState,
} from "./types";

let nextId = 1;
function uid(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

interface PendingSpawn {
  enemyId: string;
  spawnAt: number;
  spawnId: string;
}

export class Game {
  private levelIndex = 0;
  private level!: LevelDef;
  private phase: Phase = "day";
  private money = 0;
  private waveIndex = 0;
  private sites: BuildSiteState[] = [];
  private buildings: PlacedBuilding[] = [];
  private enemies: EnemyUnit[] = [];
  private units: GarrisonUnit[] = [];
  private projectiles: Projectile[] = [];
  private floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private selectedSiteId: string | null = null;
  private selectedBuildingId: string | null = null;
  private hqId = "";
  private wrecks: WreckState[] = [];
  private pendingSpawns: PendingSpawn[] = [];
  private waveElapsed = 0;
  private waveSpawnComplete = false;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: GameEvent) => void>();
  /** Host-clock timestamp (ms) of the last successful sell/undo — absorbs
   *  double-fire (key repeat / click+key bounce) within input.sellLockoutMs. */
  private lastSellAt = 0;
  /** Monotonic millisecond clock, injected by the host (CD-52).
   *  `performance.now()` was the sim's ONLY browser API; taking it as a
   *  constructor seam keeps `Game` engine-agnostic, so the Godot port supplies
   *  `Time.get_ticks_msec()` instead of needing a JS shim. Defaults to a
   *  monotonic counter so tests/headless callers need no clock at all. */
  private readonly nowMs: () => number;
  /** Multipliers from every GLOBAL branch pick (currently only the Command
   *  Center — docs/design-wave-legibility.md §7c), merged together. Recomputed
   *  ONLY at pick time (see computeGlobalMods/restatAll, called from
   *  upgrade()) — never per tick. Read this field directly from hot per-tick
   *  paths; call the public globalMods() getter only from outside the sim
   *  (QA/dev hooks), so a call-count spy sees "at most once per pick". */
  private globalStatMods: StatMods = {};
  /** The hero commander (docs/design-hero-commander.md, CD-29 Slice 1).
   *  Never null after loadLevel — drivable in both day (pre-positioning)
   *  and night; `deployed` stays true for the whole level (CD-29 revision). */
  private hero: HeroState | null = null;
  /** Latched, normalized move-vector — the ONLY input seam for hero
   *  movement (C4/§8). Mutated only by setHeroMove, which is called only
   *  from main.ts's event listeners, never from inside update()/updateHero,
   *  so it stays constant across a 2x sub-step's two update() calls. */
  private heroMoveDir: Vec2 = { x: 0, y: 0 };

  constructor(nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
    this.loadLevel(0);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /**
   * Semantic sim event stream (see design-demo-milestone.md Problem 5) —
   * separate from `onChange` (which is "re-render, something changed").
   * Audio bindings are the first consumer; Game has zero audio imports.
   */
  onEvent(fn: (e: GameEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private emit(event: GameEvent): void {
    for (const fn of this.eventListeners) fn(event);
  }

  loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = getLevel(index);
    this.phase = "day";
    this.money = this.level.startingMoney;
    this.waveIndex = 0;
    this.enemies = [];
    this.units = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.particles = [];
    this.wrecks = [];
    this.pendingSpawns = [];
    this.waveElapsed = 0;
    this.waveSpawnComplete = false;
    this.selectedSiteId = null;
    this.selectedBuildingId = null;
    this.globalStatMods = {};

    this.sites = this.level.sites.map((s) => {
      const resources = deriveSiteResources(this.level, s.x, s.y);
      // Requires-filtered EFFECTIVE options (D5) — keeps options.length <= 4
      // and the 1-4 key mapping honest by construction. A site that offers
      // a mining option it doesn't actually qualify for is an authoring
      // error caught by validate.ts, not silently tolerated here.
      const options = s.options.filter((optId) => {
        const def = getBuilding(optId);
        return !def.requires || resources[def.requires.resource] >= def.requires.min;
      });
      return { ...s, buildingId: null, resources, options };
    });

    const hqDef = getBuilding("command_center");
    const hqStats = scaledStats(hqDef, 1, null, this.globalStatMods);
    this.hqId = uid("hq");
    this.buildings = [
      {
        id: this.hqId,
        siteId: "__hq__",
        defId: "command_center",
        level: 1,
        branchId: null,
        hp: hqStats.maxHp,
        maxHp: hqStats.maxHp,
        x: this.level.hq.x,
        y: this.level.hq.y,
        cooldown: 0,
        isHq: true,
        invested: 0,
        spentToday: 0,
        levelsToday: 0,
        builtToday: false,
      },
    ];
    this.lastSellAt = 0;
    // Null first: parkHero's heal-in-place preserves a LIVING hero's
    // position, which must never leak across loadLevel/restart — a fresh
    // level always starts the hero at its own HQ.
    this.hero = null;
    this.parkHero();

    this.notify();
  }

  restartLevel(): void {
    this.loadLevel(this.levelIndex);
  }

  /**
   * Thin sim reset — advances to the next level index. Level-count-aware
   * flow (is there a next level? unlock it? go to menu instead?) lives in
   * AppShell, which owns level flow (see design-demo-milestone.md
   * Problem 1). getLevel() clamps out-of-range indices, so this never
   * throws even past the last level.
   */
  nextLevel(): void {
    this.loadLevel(this.levelIndex + 1);
  }

  /** Where the danger comes from: next wave during day, remaining spawns at night */
  private upcomingSpawnInfo(): { ids: string[]; counts: Record<string, number> } {
    const counts: Record<string, number> = {};
    if (this.phase === "day") {
      const wave = this.level.waves[this.waveIndex];
      if (wave) {
        const spawnIds = this.level.spawns.map((s) => s.id);
        let spawnCursor = 0;
        for (const entry of wave.entries) {
          const sid =
            entry.spawnId ?? spawnIds[spawnCursor++ % spawnIds.length]!;
          counts[sid] = (counts[sid] ?? 0) + entry.count;
        }
      }
    } else if (this.phase === "night") {
      for (const p of this.pendingSpawns) {
        counts[p.spawnId] = (counts[p.spawnId] ?? 0) + 1;
      }
    }
    return { ids: Object.keys(counts), counts };
  }

  getSnapshot(): GameSnapshot {
    const upcoming = this.upcomingSpawnInfo();
    return {
      level: this.level,
      levelIndex: this.levelIndex,
      phase: this.phase,
      money: Math.floor(this.money),
      waveIndex: this.waveIndex,
      totalWaves: this.level.waves.length,
      sites: this.sites,
      buildings: this.buildings,
      wrecks: this.wrecks,
      enemies: this.enemies,
      units: this.units,
      projectiles: this.projectiles,
      floatingTexts: this.floatingTexts,
      particles: this.particles,
      selectedSiteId: this.selectedSiteId,
      selectedBuildingId: this.selectedBuildingId,
      waveActive: this.phase === "night",
      enemiesRemainingToSpawn: this.pendingSpawns.length,
      upcomingSpawnIds: upcoming.ids,
      upcomingSpawnCounts: upcoming.counts,
      dayTime: 0,
      nightTime: this.waveElapsed,
      hqId: this.hqId,
      // Shallow-cloned per the CD-15 rule for NEW snapshot fields (HeroState
      // is flat primitives, so a spread is a complete clone). The legacy
      // array fields above stay live-ref until the CD-15 cleanup.
      hero: this.hero ? { ...this.hero } : null,
    };
  }

  selectSite(siteId: string | null): void {
    if (siteId === null) {
      this.selectedSiteId = null;
      this.selectedBuildingId = null;
      this.notify();
      return;
    }
    if (this.phase !== "day") return;
    this.selectedSiteId = siteId;
    this.selectedBuildingId = null;
    const site = this.sites.find((s) => s.id === siteId);
    if (site?.buildingId) {
      this.selectedBuildingId = site.buildingId;
    }
    this.notify();
  }

  selectBuilding(buildingId: string | null): void {
    this.selectedBuildingId = buildingId;
    this.selectedSiteId = null;
    if (buildingId) {
      const b = this.buildings.find((x) => x.id === buildingId);
      if (b && !b.isHq) this.selectedSiteId = b.siteId;
    }
    this.notify();
  }

  selectAt(x: number, y: number): void {
    // Prefer buildings
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      const def = getBuilding(b.defId);
      const r = def.size + 6;
      if (dist(x, y, b.x, b.y) <= r) {
        this.selectBuilding(b.id);
        return;
      }
    }

    if (this.phase === "day") {
      for (const site of this.sites) {
        if (dist(x, y, site.x, site.y) <= 28) {
          this.selectSite(site.id);
          return;
        }
      }
    }

    this.selectedSiteId = null;
    this.selectedBuildingId = null;
    this.notify();
  }

  /**
   * Spatial navigation for keyboard/gamepad: move selection to the nearest
   * target within a ~70° cone in the pressed direction. Day navigates build
   * sites; night navigates living buildings (to watch their HP).
   */
  navigate(dx: number, dy: number): void {
    interface Cand {
      id: string;
      x: number;
      y: number;
      isBuilding: boolean;
    }
    const day = this.phase === "day";
    // R10 (docs/design-wave-legibility.md): the HQ lives at siteId "__hq__",
    // outside `this.sites`, so it was mouse-only via selectAt — unreachable
    // by keyboard/gamepad during the day. Add it as a day candidate too (the
    // night branch already covers it via the general `this.buildings` scan)
    // so a CC branch pick is buyable without a mouse (UI_PLAN 2/3).
    const hq = day ? this.buildings.find((b) => b.isHq && b.hp > 0) : undefined;
    const cands: Cand[] = day
      ? [
          ...this.sites.map((s) => ({ id: s.id, x: s.x, y: s.y, isBuilding: false })),
          ...(hq ? [{ id: hq.id, x: hq.x, y: hq.y, isBuilding: true }] : []),
        ]
      : this.buildings
          .filter((b) => b.hp > 0)
          .map((b) => ({ id: b.id, x: b.x, y: b.y, isBuilding: true }));
    if (cands.length === 0) return;

    // Reference point: current selection, else the HQ
    let ref = { x: this.level.hq.x, y: this.level.hq.y };
    let currentId: string | null = null;
    if (day && this.selectedSiteId) {
      const s = this.sites.find((x) => x.id === this.selectedSiteId);
      if (s) {
        ref = s;
        currentId = s.id;
      }
    } else if (this.selectedBuildingId) {
      const b = this.buildings.find((x) => x.id === this.selectedBuildingId);
      if (b) {
        ref = b;
        currentId = b.id;
      }
    }

    let best: Cand | null = null;
    let bestScore = Infinity;
    for (const c of cands) {
      if (c.id === currentId) continue;
      const vx = c.x - ref.x;
      const vy = c.y - ref.y;
      const d = Math.hypot(vx, vy);
      if (d < 1) continue;
      const dot = (vx * dx + vy * dy) / d;
      if (dot < 0.35) continue;
      // Prefer close targets, strongly prefer well-aligned ones
      const score = d * (2.2 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) return;
    if (best.isBuilding) this.selectBuilding(best.id);
    else this.selectSite(best.id);
  }

  /** Buy the Nth build option at the selected empty site (keyboard 1-4) */
  buildOption(index: number): boolean {
    if (this.phase !== "day" || !this.selectedSiteId) return false;
    const site = this.sites.find((s) => s.id === this.selectedSiteId);
    if (!site || site.buildingId) return false;
    const opt = site.options[index];
    if (!opt) return false;
    return this.build(site.id, opt);
  }

  upgradeSelected(branchChoice?: string): boolean {
    if (!this.selectedBuildingId) return false;
    return this.upgrade(this.selectedBuildingId, branchChoice);
  }

  canBuild(siteId: string, buildingDefId: string): boolean {
    if (this.phase !== "day") return false;
    const site = this.sites.find((s) => s.id === siteId);
    if (!site || site.buildingId) return false;
    if (!site.options.includes(buildingDefId)) return false;
    const def = getBuilding(buildingDefId);
    return this.money >= def.cost;
  }

  /** L1 dawn income `buildingDefId` would pay if built at `siteId` right
   *  now — the number BuildRing shows on the button face before purchase
   *  (C2/C7: no trap picks, no hover-only info). 0 for non-mining defs. */
  previewIncome(siteId: string, buildingDefId: string): number {
    const site = this.sites.find((s) => s.id === siteId);
    if (!site) return 0;
    const def = getBuilding(buildingDefId);
    if (!def.mining) return 0;
    const nodes = site.resources[def.mining.resource];
    // Income is never touched by a global pick (D8) — mods omitted on purpose.
    return Math.round(scaledStats(def, 1).incomePerDay * nodes);
  }

  build(siteId: string, buildingDefId: string): boolean {
    if (!this.canBuild(siteId, buildingDefId)) return false;
    const site = this.sites.find((s) => s.id === siteId)!;
    const def = getBuilding(buildingDefId);
    const stats = scaledStats(def, 1, null, this.globalStatMods);

    this.money -= def.cost;
    const id = uid("bld");
    const building: PlacedBuilding = {
      id,
      siteId,
      defId: buildingDefId,
      level: 1,
      branchId: null,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      x: site.x,
      y: site.y,
      cooldown: 0,
      isHq: false,
      invested: def.cost,
      spentToday: def.cost,
      levelsToday: 0,
      builtToday: true,
    };
    this.buildings.push(building);
    site.buildingId = id;
    this.selectedBuildingId = id;
    this.syncSquad(building);
    this.floatText(site.x, site.y - 30, `-${def.cost}₡`, "#ffd54f");
    this.emit({ type: "built" });
    this.notify();
    return true;
  }

  canUpgrade(buildingId: string): boolean {
    if (this.phase !== "day") return false;
    const b = this.buildings.find((x) => x.id === buildingId);
    // R5c/D8 (docs/design-wave-legibility.md): the HQ CAN upgrade/branch now
    // (that's the whole feature) — but getSellInfo/sellOrUndo below keep
    // their isHq guard. That asymmetry is deliberate: the HQ staying
    // unsellable is what makes CD-7's old sell-back exploit (buy the pick,
    // sell the facility, keep the buff) impossible by construction.
    if (!b) return false;
    const def = getBuilding(b.defId);
    if (b.level >= def.maxLevel) return false;
    return this.money >= upgradeCost(def, b.level);
  }

  /**
   * When the NEXT upgrade for `buildingId` would land on a branch level,
   * returns the branch spec so UI can require a choice; null otherwise
   * (no branch on this def, already past atLevel, or already maxed).
   */
  pendingBranch(buildingId: string): { atLevel: number; options: BranchOption[] } | null {
    const b = this.buildings.find((x) => x.id === buildingId);
    if (!b) return null;
    const def = getBuilding(b.defId);
    if (!def.branch) return null;
    if (b.level + 1 !== def.branch.atLevel) return null;
    return def.branch;
  }

  upgrade(buildingId: string, branchChoice?: string): boolean {
    if (!this.canUpgrade(buildingId)) return false;
    const b = this.buildings.find((x) => x.id === buildingId)!;
    const def = getBuilding(b.defId);

    const branch = this.pendingBranch(buildingId);
    if (branch) {
      const opt = branchChoice
        ? branch.options.find((o) => o.id === branchChoice)
        : null;
      if (!opt) return false;
      b.branchId = opt.id;
    }

    const cost = upgradeCost(def, b.level);
    this.money -= cost;
    b.level += 1;
    b.invested += cost;
    b.spentToday += cost;
    b.levelsToday += 1;

    // A global branch's pick just changed globalStatMods for every building
    // and squad, not just this one — recompute it once, then re-derive every
    // live maxHp from it (restatAll), BEFORE this building's own stats below
    // are read, so it isn't restat'd against its own stale mods.
    if (branch && def.branch?.global) {
      this.globalStatMods = this.computeGlobalMods();
      this.restatAll();
    }

    const stats = scaledStats(def, b.level, b.branchId, this.globalStatMods);
    const hpRatio = b.hp / b.maxHp;
    b.maxHp = stats.maxHp;
    b.hp = Math.min(stats.maxHp, Math.round(stats.maxHp * hpRatio) + 20);
    this.syncSquad(b);
    this.floatText(b.x, b.y - 28, `Lv${b.level}!`, "#66bb6a");
    this.emit({ type: "upgraded" });
    this.notify();
    return true;
  }

  /**
   * Live global stat multipliers from every GLOBAL branch pick, merged
   * (docs/design-wave-legibility.md §7c). This is the memoized field, not a
   * recomputation — safe to call anytime, including from QA/dev-hook spies
   * expecting "at most once per pick, never per tick". Hot per-tick sim code
   * reads `this.globalStatMods` directly instead of calling this, so this
   * method itself is never invoked from inside update().
   */
  globalMods(): StatMods {
    return this.globalStatMods;
  }

  /** Live stats for a placed building, INCLUDING global picks — HUD reads
   *  this instead of calling scaledStats directly so displayed numbers never
   *  drift from what combat/income actually use. Null for an unknown id. */
  statsFor(buildingId: string): ReturnType<typeof scaledStats> | null {
    const b = this.buildings.find((x) => x.id === buildingId);
    if (!b) return null;
    const def = getBuilding(b.defId);
    return scaledStats(def, b.level, b.branchId, this.globalStatMods);
  }

  /** Re-derives globalStatMods from every building holding a global branch
   *  pick (today: only the Command Post, merged for CD-49's future seam
   *  of more than one). Multiplicative merge, not overwrite, so two global
   *  picks on the same stat would compound rather than one winning. */
  private computeGlobalMods(): StatMods {
    const merged: StatMods = {};
    for (const b of this.buildings) {
      const def = getBuilding(b.defId);
      if (!def.branch?.global || !b.branchId) continue;
      const opt = def.branch.options.find((o) => o.id === b.branchId);
      if (!opt?.mods) continue;
      for (const key of Object.keys(opt.mods) as (keyof StatMods)[]) {
        const v = opt.mods[key];
        if (v === undefined) continue;
        merged[key] = (merged[key] ?? 1) * v;
      }
    }
    return merged;
  }

  /** Re-derives every LIVE building's and unit's maxHp against the current
   *  globalStatMods and clamps current hp to it, so a Plating pick (or any
   *  future global maxHp mod) takes effect on everything already on the
   *  board, not just things built/spawned afterward. Called once per global
   *  pick (from upgrade()) — never per tick. */
  private restatAll(): void {
    for (const b of this.buildings) {
      const def = getBuilding(b.defId);
      const stats = scaledStats(def, b.level, b.branchId, this.globalStatMods);
      b.maxHp = stats.maxHp;
      b.hp = Math.min(b.hp, b.maxHp);
    }
    for (const u of this.units) {
      const building = this.buildings.find((b) => b.id === u.buildingId);
      if (!building) continue;
      const unitDef = getUnit(u.unitDefId);
      const stats = unitStats(unitDef, this.globalStatMods);
      u.maxHp = stats.maxHp;
      u.hp = Math.min(u.hp, u.maxHp);
    }
  }

  /**
   * Undo/sell preview (CD-24): what pressing X would do right now, or null
   * if there is nothing to sell (HQ, night, unknown building). See
   * design-demo-milestone.md Problem 3.
   */
  getSellInfo(
    buildingId: string,
  ): { kind: "undo" | "undoUpgrades" | "sell"; refund: number } | null {
    if (this.phase !== "day") return null;
    const b = this.buildings.find((x) => x.id === buildingId);
    if (!b || b.isHq) return null;

    if (b.builtToday) {
      return { kind: "undo", refund: Math.round(b.spentToday) };
    }
    if (b.levelsToday > 0) {
      return { kind: "undoUpgrades", refund: Math.round(b.spentToday) };
    }
    return { kind: "sell", refund: Math.round(SELL_REFUND * b.invested) };
  }

  /**
   * Sell or undo the given building (CD-24). Day-only, HQ excluded.
   * `sellLockout` absorbs key/click double-fire: a second call within
   * TUNING.input.sellLockoutMs of a successful one is a no-op, and after a removal
   * the now-empty site becomes the selection so a repeat X has nothing
   * left to act on even once the lockout expires.
   */
  sellOrUndo(buildingId: string): boolean {
    if (this.phase !== "day") return false;
    const now = this.nowMs();
    if (now - this.lastSellAt < TUNING.input.sellLockoutMs) return false;

    const b = this.buildings.find((x) => x.id === buildingId);
    if (!b || b.isHq) return false;
    const info = this.getSellInfo(buildingId);
    if (!info) return false;

    this.lastSellAt = now;
    this.money += info.refund;

    if (info.kind === "undoUpgrades") {
      // Levels-only undo: revert today's levels, keep the building.
      const def = getBuilding(b.defId);
      b.level -= b.levelsToday;
      if (def.branch && b.level < def.branch.atLevel) b.branchId = null;
      const stats = scaledStats(def, b.level, b.branchId, this.globalStatMods);
      b.maxHp = stats.maxHp;
      b.hp = Math.min(b.hp, stats.maxHp);
      b.invested -= b.spentToday;
      b.spentToday = 0;
      b.levelsToday = 0;
      this.syncSquad(b);
      this.floatText(b.x, b.y - 20, `+${info.refund}₡`, "#66bb6a");
    } else {
      // Full undo (built today) or a 60% sell — either way, gone. Its squad
      // goes with it (units never outlive their building).
      const siteId = b.siteId;
      const color = info.kind === "undo" ? "#66bb6a" : "#ffb300";
      this.floatText(b.x, b.y - 20, `+${info.refund}₡`, color);
      this.buildings = this.buildings.filter((x) => x.id !== b.id);
      this.units = this.units.filter((u) => u.buildingId !== b.id);
      const site = this.sites.find((s) => s.id === siteId);
      if (site) site.buildingId = null;
      if (this.selectedBuildingId === b.id) this.selectedBuildingId = null;
      // Select the now-empty site so a repeat X is a no-op (nothing to act
      // on) and the build ring reappears.
      this.selectSite(siteId);
    }

    this.emit({ type: info.kind === "sell" ? "sold" : "undone" });
    this.notify();
    return true;
  }

  /** Hero's day-phase / dawn-restored state — idle at the HQ, full HP, not
   *  controllable, not in combat (design §4/§5). Called at loadLevel (so
   *  `hero` is never null after boot) and at dawn/victory (onWaveCleared),
   *  where it doubles as the "restored to full HP and repositioned at the
   *  HQ; if dead, revived" dawn rule. Also zeroes heroMoveDir — the
   *  transition-hygiene half of C4/§9.5 that belongs to the sim, not just
   *  main.ts's own re-latch/zero on the same edges. */
  private parkHero(): void {
    const def = getHero(this.heroDefId);
    // Day-positioning (CD-29 revision, 2026-07-16): a LIVING hero heals in
    // place at dawn and stays where the player left it — pre-positioning for
    // the next wave is the point. Only death (out-until-dawn penalty) or a
    // fresh level sends it back to the HQ.
    const surviving = this.hero && this.hero.alive ? this.hero : null;
    this.hero = {
      defId: def.id,
      x: surviving ? surviving.x : this.level.hq.x,
      y: surviving ? surviving.y : this.level.hq.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      alive: true,
      deployed: true,
      facing: surviving ? surviving.facing : 1,
      cooldown: 0,
    };
    this.heroMoveDir = { x: 0, y: 0 };
  }

  /** Selected weapon loadout (CD-30 hero weapons) — a hero.json def id.
   *  Takes effect at the next parkHero (loadLevel/dawn); set from AppShell
   *  before startLevel, never mid-night. All weapons unlocked for now. */
  private heroDefId = "rifle";

  /** Pre-level weapon selection seam (design §12.3). Unknown ids fall back
   *  to the rifle so a stale save value can never brick loadLevel. */
  setHeroLoadout(defId: string): void {
    this.heroDefId = HEROES[defId] ? defId : "rifle";
  }

  /** Latches a normalized hero move-vector (§8). The hero is drivable in
   *  BOTH day and night (day-positioning, CD-29 revision) — the gate only
   *  excludes victory/defeat, where there is nothing to drive. */
  setHeroMove(dx: number, dy: number): void {
    if (this.phase !== "day" && this.phase !== "night") return;
    const len = Math.hypot(dx, dy);
    this.heroMoveDir = len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
  }

  startNight(): void {
    if (this.phase !== "day") return;
    if (this.waveIndex >= this.level.waves.length) return;

    this.phase = "night";
    this.selectedSiteId = null;
    this.waveElapsed = 0;
    this.waveSpawnComplete = false;
    this.pendingSpawns = [];
    this.projectiles = [];
    // Hero carries its day position into the night (day-positioning) — no
    // reset here; parkHero handled heal/revive at the previous dawn.

    // Per-day undo/sell ledger only covers today's spend — clear it as the
    // day ends (see design-demo-milestone.md Problem 3).
    for (const b of this.buildings) {
      b.spentToday = 0;
      b.levelsToday = 0;
      b.builtToday = false;
    }

    const wave = this.level.waves[this.waveIndex]!;
    this.queueWave(wave);
    this.emit({ type: "waveStarted", waveIndex: this.waveIndex });
    this.notify();
  }

  private queueWave(wave: WaveDef): void {
    const spawnIds = this.level.spawns.map((s) => s.id);
    let spawnCursor = 0;

    for (const entry of wave.entries) {
      const spawnId =
        entry.spawnId ?? spawnIds[spawnCursor++ % spawnIds.length]!;
      for (let i = 0; i < entry.count; i++) {
        this.pendingSpawns.push({
          enemyId: entry.enemyId,
          spawnAt: entry.delay + i * entry.interval,
          spawnId,
        });
      }
    }

    this.pendingSpawns.sort((a, b) => a.spawnAt - b.spawnAt);
  }

  private spawnEnemy(enemyId: string, spawnId: string): void {
    const def = getEnemy(enemyId);
    const path = this.level.paths[spawnId];
    if (!path || path.length === 0) return;

    const start = path[0]!;
    // Path ends at HQ
    const fullPath: Vec2[] = [
      ...path.map((p) => ({ ...p })),
      { x: this.level.hq.x, y: this.level.hq.y },
    ];

    this.enemies.push({
      id: uid("en"),
      defId: enemyId,
      hp: def.maxHp,
      maxHp: def.maxHp,
      x: start.x,
      y: start.y,
      path: fullPath,
      pathIndex: 1,
      slowTimer: 0,
      engaged: false,
      hitTimer: 0,
      attackCooldown: 0,
    });
  }

  update(dt: number): void {
    if (this.phase === "victory" || this.phase === "defeat") {
      this.updateVfx(dt);
      return;
    }

    if (this.phase === "day") {
      this.updateDay(dt);
    } else if (this.phase === "night") {
      this.updateNight(dt);
    }

    this.updateVfx(dt);
  }

  private updateDay(dt: number): void {
    // Day is untimed planning time; income is paid at dawn (see onWaveCleared).
    // The hero IS drivable by day (pre-positioning before the next wave,
    // CD-29 revision) — updateHero's combat half is inert with no enemies,
    // so this is movement-only in practice.
    this.updateHero(dt);
  }

  /** Lump-sum income from surviving production buildings, paid at dawn.
   *  Mining defs pay PER NODE (D3) — node count comes from the building's
   *  own site, already capped at maxNodes by deriveSiteResources. */
  private collectDawnIncome(): void {
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      const def = getBuilding(b.defId);
      const stats = scaledStats(def, b.level, b.branchId);
      if (stats.incomePerDay <= 0) continue;
      const nodes = def.mining
        ? (this.sites.find((s) => s.id === b.siteId)?.resources[def.mining.resource] ?? 0)
        : 1;
      const income = Math.round(stats.incomePerDay * nodes);
      if (income <= 0) continue;
      this.money += income;
      this.floatText(b.x, b.y - 24, `+${income}₡`, "#ffd54f");
    }
  }

  private updateNight(dt: number): void {
    this.waveElapsed += dt;

    // Spawn
    while (
      this.pendingSpawns.length > 0 &&
      this.pendingSpawns[0]!.spawnAt <= this.waveElapsed
    ) {
      const s = this.pendingSpawns.shift()!;
      this.spawnEnemy(s.enemyId, s.spawnId);
    }
    if (this.pendingSpawns.length === 0) {
      this.waveSpawnComplete = true;
    }

    // Enemies damage HQ / buildings when close (sets engaged flags)
    this.resolveEnemyContact(dt);

    // Move enemies that are not busy attacking something
    for (const e of this.enemies) {
      if (!e.engaged) this.moveEnemy(e, dt);
      if (e.hitTimer > 0) e.hitTimer -= dt;
    }

    // Declump bodies (CD-45) — must run over engaged enemies too, since the
    // tightest stacks are exactly the ones halted on a building's contact ring.
    this.separateEnemies(dt);

    // Hero acts (CD-29 Slice 1) — after enemy movement (so this tick's
    // resolveEnemyContact/resolveRangedAttack next frame see the hero's
    // post-move position, matching the same one-frame-lag convention units
    // already have relative to their own updateUnits call below).
    this.updateHero(dt);

    // Garrison squads act — night only, stateless per-tick derivation (D5-D7)
    this.updateUnits(dt);

    // Defenses fire
    this.resolveCombat(dt);

    // Projectiles
    this.updateProjectiles(dt);

    // Cleanup dead
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.units = this.units.filter((u) => u.hp > 0);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    // Wave clear
    if (
      this.waveSpawnComplete &&
      this.enemies.length === 0 &&
      this.pendingSpawns.length === 0
    ) {
      this.onWaveCleared();
    }

    // HQ check
    const hq = this.buildings.find((b) => b.id === this.hqId);
    if (!hq || hq.hp <= 0) {
      this.phase = "defeat";
      this.heroMoveDir = { x: 0, y: 0 };
      this.emit({ type: "defeat" });
      this.notify();
    }
  }

  /** Distance an enemy covers in one tick, slow included. Shared by moveEnemy
   *  and separateEnemies so the separation cap can never drift away from the
   *  real step it is defined against (CD-45). */
  private enemyStep(e: EnemyUnit, dt: number): number {
    const def = getEnemy(e.defId);
    return def.speed * (e.slowTimer > 0 ? TUNING.enemies.slowMultiplier : 1) * dt;
  }

  private moveEnemy(e: EnemyUnit, dt: number): void {
    if (e.pathIndex >= e.path.length) return;

    const target = e.path[e.pathIndex]!;
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.hypot(dx, dy);
    const step = this.enemyStep(e, dt);
    if (e.slowTimer > 0) e.slowTimer -= dt;

    if (d < TUNING.enemies.waypointArrivalPx) {
      e.pathIndex++;
      return;
    }

    if (step >= d) {
      e.x = target.x;
      e.y = target.y;
      e.pathIndex++;
    } else {
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
  }

  /** Night-only hero tick (CD-29 Slice 1): integrate movement (clamped to
   *  the level bounds), then auto-attack on cooldown — the same
   *  findTarget/hurtEnemy idiom updateUnits uses for a garrison unit, just
   *  with no leash/anchor (design §7, C8: lone fighter, no rally). Dead or
   *  undeployed hero does nothing — it stops moving/attacking/blocking. */
  private updateHero(dt: number): void {
    const hero = this.hero;
    if (!hero || !hero.deployed || !hero.alive) return;
    const def = getHero(hero.defId);

    if (this.heroMoveDir.x !== 0 || this.heroMoveDir.y !== 0) {
      hero.x += this.heroMoveDir.x * def.moveSpeed * dt;
      hero.y += this.heroMoveDir.y * def.moveSpeed * dt;
      hero.x = Math.max(def.radius, Math.min(this.level.width - def.radius, hero.x));
      hero.y = Math.max(def.radius, Math.min(this.level.height - def.radius, hero.y));
      if (this.heroMoveDir.x > 0) hero.facing = 1;
      else if (this.heroMoveDir.x < 0) hero.facing = -1;
    }

    if (hero.cooldown > 0) hero.cooldown -= dt;
    if (hero.cooldown <= 0) {
      const target = this.findTarget(hero.x, hero.y, def.range, def.targets);
      if (target) {
        hero.cooldown = 1 / def.fireRate;
        // Scattergun-style weapons splash through the same applyDamage path
        // units/buildings use (respects the weapon's TargetMode); single-
        // target weapons hit directly — mirrors the unit attack loop.
        if (def.splashRadius && def.splashRadius > 0) {
          this.applyDamage(target, def.damage, def.splashRadius, hero.x, hero.y, def.targets);
        } else {
          this.hurtEnemy(target, def.damage);
        }
        // Reuses unitFired (audio hookup optional per design §13) — bindings.ts
        // maps every unitFired to one shot sound regardless of unitDefId.
        this.emit({ type: "unitFired", unitDefId: hero.defId });
        this.particles.push({
          id: uid("pt"),
          x: (hero.x + target.x) / 2,
          y: (hero.y + target.y) / 2,
          vx: 0,
          vy: 0,
          life: 0.08,
          maxLife: 0.08,
          color: def.accent,
          size: 2,
        });
      }
    }
  }

  /** Same armor-free damage path as hurtUnit — the hero has no armor stat. */
  private hurtHero(rawDamage: number): void {
    const hero = this.hero;
    if (!hero || hero.hp <= 0) return;
    hero.hp -= rawDamage;
    if (hero.hp <= 0) {
      hero.hp = 0;
      hero.alive = false;
      this.emit({ type: "heroDied" });
    }
  }

  private resolveEnemyContact(dt: number): void {
    const hq = this.buildings.find((b) => b.id === this.hqId);
    if (!hq) return;

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const def = getEnemy(e.defId);

      if (def.attackRange && def.attackRange > 0) {
        this.resolveRangedAttack(e, def, hq, dt);
        continue;
      }

      // Blocking squad units (and, since CD-29, the deployed hero) take
      // priority over buildings/HQ (D5/D6): small contact radius (raider
      // ~19px vs building 28-40px) IS the geometric porousness — a squad
      // slows a lane, it doesn't seal it. Flyers pass straight over units
      // AND the hero (D6/design §7 — v1 hero targets: "ground").
      if (def.archetype !== "flyer") {
        const blocker = this.nearestLivingBlocker(e.x, e.y, def.radius, 4);
        if (blocker) {
          e.engaged = true;
          if (blocker.unit) this.hurtUnit(blocker.unit, def.damage * dt);
          else this.hurtHero(def.damage * dt);
          continue;
        }
      }

      // Prefer attacking nearest non-HQ defense in range, else HQ
      let target: PlacedBuilding | null = null;
      let best = Infinity;

      for (const b of this.buildings) {
        if (b.hp <= 0 || b.isHq) continue;
        const d = dist(e.x, e.y, b.x, b.y);
        if (d < def.radius + TUNING.enemies.buildingContactPadPx && d < best) {
          best = d;
          target = b;
        }
      }

      const hqDist = dist(e.x, e.y, hq.x, hq.y);
      if (!target && hqDist < def.radius + TUNING.enemies.hqContactPadPx) {
        target = hq;
      }

      e.engaged = target !== null;
      if (target) {
        target.hp -= def.damage * dt;
        if (target.hp <= 0) {
          target.hp = 0;
          if (!target.isHq) {
            this.destroyBuilding(target);
          }
        }
      }
    }
  }

  /** Standoff attackers (def.attackRange > 0): stop at range and lob
   *  building-targeted projectiles instead of contact damage. Same target
   *  priority as melee (nearest non-HQ in range, else HQ in range). */
  private resolveRangedAttack(
    e: EnemyUnit,
    def: EnemyDef,
    hq: PlacedBuilding,
    dt: number,
  ): void {
    // Contact-priority insert (D6): a living unit standing right next to
    // this standoff attacker overrides its normal building/HQ targeting —
    // a point-blank homing shot instead. Preserves the showcase duel:
    // walkers standing off at 130 never snipe a squad sitting at range;
    // only a unit that has walked into CONTACT gets engaged this way.
    // Flyers skip this entirely (they fly over units).
    if (def.archetype !== "flyer") {
      const contact = this.nearestLivingBlocker(e.x, e.y, def.radius, 6);
      if (contact) {
        e.engaged = true;
        if (e.attackCooldown > 0) e.attackCooldown -= dt;
        if (e.attackCooldown <= 0) {
          const rate = def.attackRate ?? 1;
          e.attackCooldown = 1 / rate;
          this.projectiles.push({
            id: uid("prj"),
            x: e.x,
            y: e.y,
            targetX: contact.x,
            targetY: contact.y,
            damage: def.damage,
            splash: 0,
            speed: TUNING.combat.enemyProjectileSpeed,
            color: def.accent,
            targetId: null,
            alive: true,
            faction: "enemy",
            targets: "all",
            targetBuildingId: null,
            targetUnitId: contact.unit ? contact.id : null,
            targetHero: !contact.unit,
          });
          this.emit({ type: "enemyFired", defId: e.defId });
        }
        return;
      }
    }

    const range = def.attackRange!;
    let target: PlacedBuilding | null = null;
    let best = Infinity;

    for (const b of this.buildings) {
      if (b.hp <= 0 || b.isHq) continue;
      const d = dist(e.x, e.y, b.x, b.y);
      if (d < range && d < best) {
        best = d;
        target = b;
      }
    }

    const hqDist = dist(e.x, e.y, hq.x, hq.y);
    if (!target && hqDist < range) {
      target = hq;
    }

    e.engaged = target !== null;
    if (e.attackCooldown > 0) e.attackCooldown -= dt;
    if (!target) return;

    if (e.attackCooldown <= 0) {
      const rate = def.attackRate ?? 1;
      e.attackCooldown = 1 / rate;
      this.projectiles.push({
        id: uid("prj"),
        x: e.x,
        y: e.y,
        targetX: target.x,
        targetY: target.y,
        damage: def.damage,
        splash: 0,
        speed: TUNING.combat.enemyProjectileSpeed,
        color: def.accent,
        targetId: null,
        alive: true,
        faction: "enemy",
        // Enemy projectiles resolve against a locked building (see
        // resolveEnemyProjectileImpact), never through findTarget/applySplash —
        // this value is unused for them but keeps the field non-optional.
        targets: "all",
        targetBuildingId: target.id,
      });
      this.emit({ type: "enemyFired", defId: e.defId });
    }
  }

  private destroyBuilding(b: PlacedBuilding): void {
    const site = this.sites.find((s) => s.id === b.siteId);
    if (site) site.buildingId = null;
    // Rebuilt free at dawn (ThroneFall model) — but it earns nothing tonight
    this.wrecks.push({
      siteId: b.siteId,
      defId: b.defId,
      level: b.level,
      branchId: b.branchId,
      x: b.x,
      y: b.y,
      invested: b.invested,
    });
    this.buildings = this.buildings.filter((x) => x.id !== b.id);
    // A destroyed garrison's surviving units die with it — the toll is
    // spent; wrecks carry no squad (see docs/design-roster-redesign.md).
    this.units = this.units.filter((u) => u.buildingId !== b.id);
    this.burst(b.x, b.y, "#ff7043", 12);
    this.floatText(b.x, b.y, "Destroyed!", "#ef5350");
    if (this.selectedBuildingId === b.id) {
      this.selectedBuildingId = null;
    }
    this.emit({ type: "buildingDestroyed", defId: b.defId });
    this.notify();
  }

  private resolveCombat(dt: number): void {
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      const def = getBuilding(b.defId);
      if (def.damage <= 0 || def.fireRate <= 0) continue;

      const stats = scaledStats(def, b.level, b.branchId, this.globalStatMods);
      const range = stats.range;
      const fireRate = stats.fireRate;

      b.cooldown -= dt;
      if (b.cooldown > 0) continue;

      const target = this.findTarget(b.x, b.y, range, def.targets);
      if (!target) continue;

      b.cooldown = 1 / fireRate;
      this.fireAt(b, def, stats, target);
    }
  }

  private findTarget(
    x: number,
    y: number,
    range: number,
    targets: TargetMode,
  ): EnemyUnit | null {
    let best: EnemyUnit | null = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const isFlyer = getEnemy(e.defId).archetype === "flyer";
      if (targets === "ground" && isFlyer) continue;
      // "air" batteries (flak) can ONLY hit flyers — ground is off-limits.
      if (targets === "air" && !isFlyer) continue;
      const d = dist(x, y, e.x, e.y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private fireAt(
    b: PlacedBuilding,
    def: BuildingDef,
    stats: ReturnType<typeof scaledStats>,
    target: EnemyUnit,
  ): void {
    this.emit({ type: "weaponFired", defId: b.defId });

    // Instant hit for gun tower / bunker / sniper for snappy feel; projectiles for siege/missile
    const useProjectile =
      def.id === "siege_tank" || def.id === "missile_battery";

    if (useProjectile) {
      this.projectiles.push({
        id: uid("prj"),
        x: b.x,
        y: b.y,
        targetX: target.x,
        targetY: target.y,
        damage: stats.damage,
        splash: stats.splashRadius,
        speed: def.id === "missile_battery" ? 320 : 260,
        color: def.accent,
        targetId: target.id,
        alive: true,
        faction: "player",
        targets: def.targets,
      });
    } else {
      this.applyDamage(target, stats.damage, stats.splashRadius, b.x, b.y, def.targets);
      this.particles.push({
        id: uid("pt"),
        x: (b.x + target.x) / 2,
        y: (b.y + target.y) / 2,
        vx: 0,
        vy: 0,
        life: 0.08,
        maxLife: 0.08,
        color: def.accent,
        size: 2,
      });
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;

      let tx = p.targetX;
      let ty = p.targetY;
      if (p.targetId) {
        const t = this.enemies.find((e) => e.id === p.targetId && e.hp > 0);
        if (t) {
          tx = t.x;
          ty = t.y;
          p.targetX = tx;
          p.targetY = ty;
        }
      } else if (p.targetUnitId) {
        // Enemy shot locked onto a unit — units move, so this homes (unlike
        // the static-building case below).
        const t = this.units.find((u) => u.id === p.targetUnitId && u.hp > 0);
        if (t) {
          tx = t.x;
          ty = t.y;
          p.targetX = tx;
          p.targetY = ty;
        }
      } else if (p.targetHero && this.hero && this.hero.alive) {
        // Same homing idiom as targetUnitId, for a shot locked onto the hero.
        tx = this.hero.x;
        ty = this.hero.y;
        p.targetX = tx;
        p.targetY = ty;
      }

      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (d <= step || d < 4) {
        p.alive = false;
        if (p.faction === "enemy") {
          this.resolveEnemyProjectileImpact(p, tx, ty);
        } else {
          // Find nearest enemy at impact for primary damage
          let hit = p.targetId
            ? this.enemies.find((e) => e.id === p.targetId)
            : null;
          if (!hit || hit.hp <= 0) {
            hit = this.findTarget(tx, ty, 24, p.targets);
          }
          if (hit) {
            this.applyDamage(hit, p.damage, p.splash, tx, ty, p.targets);
          } else if (p.splash > 0) {
            this.applySplash(tx, ty, p.damage, p.splash, null, p.targets);
          }
        }
        this.burst(tx, ty, p.color, 6);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  /** Enemy projectile impact: hurt the (static) building it was locked onto,
   *  respecting the normal destroyBuilding flow. Buildings don't move, so
   *  there's no re-homing — if the building died before impact, fizzle. */
  private resolveEnemyProjectileImpact(
    p: Projectile,
    tx: number,
    ty: number,
  ): void {
    // Hero/unit impacts resolve BEFORE building impacts (D6) — fizzle
    // silently if the target died before impact, same as the building
    // fizzle below.
    if (p.targetHero) {
      if (!this.hero || !this.hero.alive) return;
      this.hurtHero(p.damage);
      this.floatText(tx, ty - 10, `-${Math.round(p.damage)}`, "#ff8a65");
      return;
    }
    if (p.targetUnitId) {
      const unit = this.units.find((u) => u.id === p.targetUnitId);
      if (!unit || unit.hp <= 0) return;
      this.hurtUnit(unit, p.damage);
      this.floatText(tx, ty - 10, `-${Math.round(p.damage)}`, "#ff8a65");
      return;
    }

    const building = p.targetBuildingId
      ? this.buildings.find((b) => b.id === p.targetBuildingId)
      : null;
    if (!building || building.hp <= 0) return;

    building.hp -= p.damage;
    this.floatText(tx, ty - 14, `-${Math.round(p.damage)}`, "#ff8a65");
    if (building.hp <= 0) {
      building.hp = 0;
      if (!building.isHq) {
        this.destroyBuilding(building);
      }
    }
  }

  private applyDamage(
    primary: EnemyUnit,
    damage: number,
    splash: number,
    ox: number,
    oy: number,
    targets: TargetMode,
  ): void {
    this.hurtEnemy(primary, damage);
    if (splash > 0) {
      this.applySplash(primary.x, primary.y, damage * TUNING.combat.splashFalloff, splash, primary.id, targets);
    }
    void ox;
    void oy;
  }

  /** Splash respects the same TargetMode as the primary hit — a missile's
   *  "air" splash must never leak onto ground enemies standing near a
   *  killed flyer, and a ground weapon's splash never clips flyers. */
  private applySplash(
    x: number,
    y: number,
    damage: number,
    radius: number,
    excludeId: string | null,
    targets: TargetMode,
  ): void {
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.id === excludeId) continue;
      const isFlyer = getEnemy(e.defId).archetype === "flyer";
      if (targets === "ground" && isFlyer) continue;
      if (targets === "air" && !isFlyer) continue;
      if (dist(x, y, e.x, e.y) <= radius) {
        this.hurtEnemy(e, damage);
      }
    }
  }

  private hurtEnemy(e: EnemyUnit, rawDamage: number): void {
    if (e.hp <= 0) return;
    const def = getEnemy(e.defId);
    const dmg = Math.max(TUNING.combat.minDamageAfterArmor, rawDamage - def.armor);
    e.hp -= dmg;
    e.hitTimer = TUNING.combat.hitFlashSeconds;
    if (e.hp <= 0) {
      e.hp = 0;
      this.money += def.reward;
      this.floatText(e.x, e.y - 10, `+${def.reward}`, "#ffd54f");
      this.burst(e.x, e.y, def.accent, 8);
      this.emit({ type: "enemyDied", defId: e.defId });
    }
  }

  // ---------------- Garrison units (Batch 3) ----------------
  // See docs/design-roster-redesign.md "Game.ts changes" for the exact spec.

  /** Resolve the {unitId, countByLevel} spec that currently applies to a
   *  building: a chosen branch option's own `squad` overrides the def's
   *  base `squad`. Returns undefined for buildings that never field units. */
  private squadSpecFor(
    building: PlacedBuilding,
  ): { unitId: string; countByLevel: number[] } | undefined {
    const def = getBuilding(building.defId);
    const branchSquad = building.branchId
      ? def.branch?.options.find((o) => o.id === building.branchId)?.squad
      : undefined;
    return branchSquad ?? def.squad;
  }

  /** Add missing units / remove excess so `building`'s live squad matches
   *  its def+level+branch. Called on build, upgrade/branch-pick, sell/undo,
   *  and dawn (full respawn) — see call sites. No-op for buildings without
   *  a squad spec (existing units for them, if any, are dropped). */
  private syncSquad(building: PlacedBuilding): void {
    const spec = this.squadSpecFor(building);
    let current = this.units.filter((u) => u.buildingId === building.id);

    if (!spec) {
      if (current.length > 0) {
        this.units = this.units.filter((u) => u.buildingId !== building.id);
      }
      return;
    }

    const idx = Math.max(0, Math.min(spec.countByLevel.length - 1, building.level - 1));
    const count = spec.countByLevel[idx] ?? 0;

    // A branch pick can swap the unit type entirely (marine -> sniper) —
    // that squad is a clean replacement, not a resize.
    if (current.some((u) => u.unitDefId !== spec.unitId)) {
      this.units = this.units.filter((u) => u.buildingId !== building.id);
      current = [];
    }

    if (current.length > count) {
      const excess = [...current]
        .sort((a, b) => b.slot - a.slot)
        .slice(0, current.length - count);
      const removeIds = new Set(excess.map((u) => u.id));
      this.units = this.units.filter((u) => !removeIds.has(u.id));
      current = current.filter((u) => !removeIds.has(u.id));
    }

    if (current.length < count) {
      const unitDef = getUnit(spec.unitId);
      const stats = unitStats(unitDef, this.globalStatMods);
      const usedSlots = new Set(current.map((u) => u.slot));
      for (let slot = 0; slot < count && current.length < count; slot++) {
        if (usedSlots.has(slot)) continue;
        const angle = (slot / count) * Math.PI * 2;
        const added: GarrisonUnit = {
          id: uid("unit"),
          unitDefId: spec.unitId,
          buildingId: building.id,
          x: building.x + Math.cos(angle) * 22,
          y: building.y + Math.sin(angle) * 22,
          slot,
          hp: stats.maxHp,
          maxHp: stats.maxHp,
          cooldown: 0,
          hitTimer: 0,
        };
        this.units.push(added);
        current.push(added);
      }
    }
  }

  /** This unit's deterministic home position — recomputed live (never
   *  cached) from the anchor building's CURRENT position, level, and
   *  branch, so it stays correct even as squad size changes mid-life. */
  private unitHomeSlot(u: GarrisonUnit, building: PlacedBuilding): Vec2 {
    const spec = this.squadSpecFor(building);
    let count = 1;
    if (spec) {
      const idx = Math.max(0, Math.min(spec.countByLevel.length - 1, building.level - 1));
      count = Math.max(1, spec.countByLevel[idx] ?? 1);
    }
    const angle = (u.slot / count) * Math.PI * 2;
    return {
      x: building.x + Math.cos(angle) * 22,
      y: building.y + Math.sin(angle) * 22,
    };
  }

  /** Nearest LIVING blocker — a garrison unit OR the deployed hero — within
   *  `enemyRadius + blocker.radius + pad` of (x,y). The contact-priority
   *  check shared by melee (pad=4) and ranged (pad=6) enemy targeting (D6),
   *  extended in CD-29 Slice 1 so the hero body-blocks/draws fire exactly
   *  like a garrison unit (design §7) without altering global targeting
   *  priorities: this is still the same local-candidate-radius check, just
   *  with one more candidate. `unit` is null when the winner is the hero —
   *  callers branch on that to call hurtHero() instead of hurtUnit(). */
  private nearestLivingBlocker(
    x: number,
    y: number,
    enemyRadius: number,
    pad: number,
  ): { id: string; x: number; y: number; unit: GarrisonUnit | null } | null {
    let best: { id: string; x: number; y: number; unit: GarrisonUnit | null } | null = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const unitDef = getUnit(u.unitDefId);
      const contactRange = enemyRadius + unitDef.radius + pad;
      const d = dist(x, y, u.x, u.y);
      if (d <= contactRange && d < bestD) {
        bestD = d;
        best = { id: u.id, x: u.x, y: u.y, unit: u };
      }
    }
    if (this.hero && this.hero.alive && this.hero.deployed) {
      const heroDef = getHero(this.hero.defId);
      const contactRange = enemyRadius + heroDef.radius + pad;
      const d = dist(x, y, this.hero.x, this.hero.y);
      if (d <= contactRange && d < bestD) {
        best = { id: this.hero.defId, x: this.hero.x, y: this.hero.y, unit: null };
      }
    }
    return best;
  }

  /** Same armor math as hurtEnemy, for the other side of the fight. */
  private hurtUnit(u: GarrisonUnit, rawDamage: number): void {
    if (u.hp <= 0) return;
    u.hp -= rawDamage;
    u.hitTimer = TUNING.combat.hitFlashSeconds;
    if (u.hp <= 0) {
      u.hp = 0;
      this.emit({ type: "unitDied", unitDefId: u.unitDefId });
    }
  }

  /** Move `u` toward (tx,ty) by up to `stepDist`, then clamp the result to
   *  the leash circle around the anchor (D5: units never chase past it). */
  private stepUnitToward(
    u: GarrisonUnit,
    tx: number,
    ty: number,
    stepDist: number,
    anchorX: number,
    anchorY: number,
    leash: number,
  ): void {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      const step = Math.min(stepDist, d);
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
    }
    const ax = u.x - anchorX;
    const ay = u.y - anchorY;
    const ad = Math.hypot(ax, ay);
    if (ad > leash) {
      u.x = anchorX + (ax / ad) * leash;
      u.y = anchorY + (ay / ad) * leash;
    }
  }

  /** Boids-lite pairwise separation between UNITS only. Units never push
   *  enemies (D5: blocking stays the engage-stop mechanic, not physics, so a
   *  squad slows a lane and can never seal it). Enemy-vs-enemy declumping is
   *  a separate pass — see separateEnemies (CD-45). O(n^2) over <=~30 units. */
  private separateUnits(): void {
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const a = this.units[i]!;
      if (a.hp <= 0) continue;
      const ra = getUnit(a.unitDefId).radius;
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j]!;
        if (b.hp <= 0) continue;
        const rb = getUnit(b.unitDefId).radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = ra + rb;
        if (d >= minD) continue;
        if (d < 0.01) {
          // Degenerate overlap (identical position) — nudge deterministically
          a.x -= 0.5;
          b.x += 0.5;
          continue;
        }
        const push = (minD - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  /** Boids-lite pairwise separation between ENEMIES (CD-45). Without it,
   *  enemies walking identical waypoint paths at identical speeds stack on
   *  one pixel — worst at the contact ring where resolveEnemyContact halts a
   *  whole group around one building — and each body draws its own health bar
   *  at the same coordinates. Killing the front body reveals an untouched one
   *  behind it, which reads as an enemy healing to full.
   *
   *  Enemy<->enemy only, and same-layer only: units still never push enemies,
   *  so D5's porousness guarantee is untouched, and flyers don't shove the
   *  ground units they fly over (D6). Deterministic — no RNG, so the sim
   *  stays lockstep/replay-safe (CD-20). O(n^2) over the live enemy count.
   *
   *  Pair pushes are accumulated into a buffer and each enemy's TOTAL
   *  displacement is then clamped to a fraction of its own step
   *  (TUNING.enemies.separationStepFraction), rather than resolving each overlap outright
   *  the way separateUnits does. That clamp is load-bearing, not tuning.
   *  moveEnemy only advances a waypoint within 2px of it, so a push that can
   *  outrun the step shoves enemies past that window forever: two of them
   *  converging on one waypoint deadlock, each walking back at the other, and
   *  the wave never ends. An uncapped push (16px/tick for a siege walker
   *  against its 1.4px/tick step) did exactly that. Units are immune to this
   *  class because a leash re-clamps them; enemies follow a path instead.
   *
   *  The clamp is per-enemy and not per-pair on purpose: a per-pair bound lets
   *  an enemy overlapping K neighbours take K x the budget, which reinstates
   *  the stall for K >= 2 (reproduced with 5 walkers converging radially on a
   *  shared waypoint). Bounding each enemy's summed displacement below its own
   *  step is what actually guarantees net progress toward the waypoint, for
   *  any neighbour count and any future level geometry. Accumulating first
   *  also drops the mid-loop position mutation, so the result no longer
   *  depends on array order. */
  private separateEnemies(dt: number): void {
    const n = this.enemies.length;
    if (n < 2) return;
    const pushX = new Float64Array(n);
    const pushY = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const a = this.enemies[i]!;
      if (a.hp <= 0) continue;
      const defA = getEnemy(a.defId);
      const flyerA = defA.archetype === "flyer";
      for (let j = i + 1; j < n; j++) {
        const b = this.enemies[j]!;
        if (b.hp <= 0) continue;
        const defB = getEnemy(b.defId);
        if (flyerA !== (defB.archetype === "flyer")) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = defA.radius + defB.radius;
        if (d >= minD) continue;
        // Identical position (same spawn, same speed) — separate along a fixed
        // axis so the next tick has a real normal to work with. Deterministic.
        const nx = d < 0.01 ? 1 : dx / d;
        const ny = d < 0.01 ? 0 : dy / d;
        const push = (minD - d) / 2;
        pushX[i] -= nx * push;
        pushY[i] -= ny * push;
        pushX[j] += nx * push;
        pushY[j] += ny * push;
      }
    }

    for (let i = 0; i < n; i++) {
      const e = this.enemies[i]!;
      if (e.hp <= 0) continue;
      const mag = Math.hypot(pushX[i]!, pushY[i]!);
      if (mag < 1e-9) continue;
      const cap = this.enemyStep(e, dt) * TUNING.enemies.separationStepFraction;
      const scale = Math.min(mag, cap) / mag;
      e.x += pushX[i]! * scale;
      e.y += pushY[i]! * scale;
    }
  }

  /** Belt-and-suspenders re-clamp after separation, so the leash invariant
   *  (D5/D7) holds even after units get shoved apart near the leash edge. */
  private clampUnitsToLeash(): void {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const building = this.buildings.find((b) => b.id === u.buildingId);
      if (!building) continue;
      const unitDef = getUnit(u.unitDefId);
      const dx = u.x - building.x;
      const dy = u.y - building.y;
      const d = Math.hypot(dx, dy);
      if (d > unitDef.leash) {
        u.x = building.x + (dx / d) * unitDef.leash;
        u.y = building.y + (dy / d) * unitDef.leash;
      }
    }
  }

  /** Night-only unit AI tick — stateless per-tick derivation, no FSM. Reads
   *  the anchor building's LIVE position every call (D7 — never cached, so
   *  a future mobile anchor plugs in without touching this). */
  private updateUnits(dt: number): void {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const building = this.buildings.find((b) => b.id === u.buildingId);
      if (!building || building.hp <= 0) continue;
      const unitDef = getUnit(u.unitDefId);
      const stats = unitStats(unitDef, this.globalStatMods);

      if (u.cooldown > 0) u.cooldown -= dt;
      if (u.hitTimer > 0) u.hitTimer -= dt;

      const enemy = this.findTarget(
        building.x,
        building.y,
        unitDef.leash + unitDef.range,
        unitDef.targets,
      );

      if (enemy) {
        const d = dist(u.x, u.y, enemy.x, enemy.y);
        if (d <= unitDef.range) {
          if (u.cooldown <= 0) {
            u.cooldown = 1 / stats.fireRate;
            // Scorchers route through applyDamage for splash (respecting the
            // squad's TargetMode); single-target squads hit directly. Breaker
            // slow reuses the enemy slowTimer the movement code already reads.
            if (unitDef.splashRadius && unitDef.splashRadius > 0) {
              this.applyDamage(
                enemy,
                stats.damage,
                unitDef.splashRadius,
                enemy.x,
                enemy.y,
                unitDef.targets,
              );
            } else {
              this.hurtEnemy(enemy, stats.damage);
            }
            if (unitDef.slowSeconds && unitDef.slowSeconds > 0) {
              enemy.slowTimer = unitDef.slowSeconds;
            }
            this.emit({ type: "unitFired", unitDefId: u.unitDefId });
            this.particles.push({
              id: uid("pt"),
              x: (u.x + enemy.x) / 2,
              y: (u.y + enemy.y) / 2,
              vx: 0,
              vy: 0,
              life: 0.08,
              maxLife: 0.08,
              color: unitDef.accent,
              size: 2,
            });
          }
        } else {
          this.stepUnitToward(
            u,
            enemy.x,
            enemy.y,
            unitDef.moveSpeed * dt,
            building.x,
            building.y,
            unitDef.leash,
          );
        }
      } else {
        const home = this.unitHomeSlot(u, building);
        this.stepUnitToward(
          u,
          home.x,
          home.y,
          unitDef.moveSpeed * dt,
          building.x,
          building.y,
          unitDef.leash,
        );
      }
    }

    this.separateUnits();
    this.clampUnitsToLeash();
  }

  private onWaveCleared(): void {
    const wave = this.level.waves[this.waveIndex]!;
    this.money += wave.clearBonus;
    // Income first: buildings destroyed tonight are still wrecks here, so
    // they earn nothing this dawn (ThroneFall rule)
    this.collectDawnIncome();
    this.floatText(
      this.level.hq.x,
      this.level.hq.y - 50,
      `Wave clear +${wave.clearBonus}₡`,
      "#66bb6a",
    );

    // Dawn restoration: survivors fully repaired, wrecks rebuilt for free
    for (const b of this.buildings) {
      if (b.hp > 0) b.hp = b.maxHp;
    }
    for (const w of this.wrecks) {
      const site = this.sites.find((s) => s.id === w.siteId);
      if (!site || site.buildingId) continue;
      const def = getBuilding(w.defId);
      const stats = scaledStats(def, w.level, w.branchId, this.globalStatMods);
      const id = uid("bld");
      this.buildings.push({
        id,
        siteId: w.siteId,
        defId: w.defId,
        level: w.level,
        branchId: w.branchId,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        x: w.x,
        y: w.y,
        cooldown: 0,
        isHq: false,
        invested: w.invested,
        spentToday: 0,
        levelsToday: 0,
        builtToday: false,
      });
      site.buildingId = id;
      this.floatText(w.x, w.y - 26, "Rebuilt", "#4fc3f7");
    }
    this.wrecks = [];

    // Garrison squads respawn free and full at dawn (must run AFTER the
    // wreck-rebuild loop above so a just-rebuilt garrison gets its squad
    // too — see docs/design-roster-redesign.md's Game.ts changes section).
    for (const b of this.buildings) {
      this.syncSquad(b);
    }
    for (const u of this.units) {
      u.hp = u.maxHp;
    }

    // Hero dawn restoration (design §5): full HP, alive, back at the HQ,
    // parked until the next startNight() — applies identically whether the
    // hero survived the night or died mid-wave ("if dead, revived").
    // heroRespawned fires only on a true revive (design §10) — not on the
    // ordinary survived-the-night restore, and not on loadLevel's parkHero.
    const wasDead = this.hero !== null && !this.hero.alive;
    this.parkHero();
    if (wasDead) this.emit({ type: "heroRespawned" });

    this.waveIndex += 1;
    this.projectiles = [];
    this.pendingSpawns = [];

    if (this.waveIndex >= this.level.waves.length) {
      this.phase = "victory";
      this.emit({ type: "victory" });
    } else {
      this.phase = "day";
      this.emit({ type: "dawn" });
    }
    this.notify();
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      id: uid("ft"),
      x,
      y,
      text,
      color,
      life: 1.1,
      maxLife: 1.1,
    });
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 80;
      this.particles.push({
        id: uid("pt"),
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.35,
        maxLife: 0.5,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private updateVfx(dt: number): void {
    for (const ft of this.floatingTexts) {
      ft.life -= dt;
      ft.y -= 22 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
