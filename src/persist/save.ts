/**
 * Persistence — pure TS, no game imports (see docs/design-demo-milestone.md
 * Problem 4). AppShell is the only reader/writer; Game never touches this.
 * A Godot port swaps `StorageBackend` for a file/ConfigFile implementation
 * and reuses everything else unchanged.
 */

export interface StorageBackend {
  read(): string | null;
  write(data: string): void;
}

/** localStorage-backed implementation. Swallows quota/security errors —
 *  persistence is best-effort and must never crash the game. */
export class LocalStorageBackend implements StorageBackend {
  constructor(private key: string) {}

  read(): string | null {
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  write(data: string): void {
    try {
      window.localStorage.setItem(this.key, data);
    } catch {
      // Best-effort: private browsing / quota exceeded / disabled storage.
    }
  }
}

export interface SaveDataV1 {
  v: 1;
  /** Count of unlocked levels; LEVELS[0..unlockedLevels-1] are playable. */
  unlockedLevels: number;
  levels: Record<
    string,
    {
      cleared: boolean;
      bestHqHpPct: number;
      /** Written by `AppShell.recordVictory` when >=1 mutator was active on
       *  a winning run (CD-30 Slice 3) — Star 3 ("Hardened"). Optional so
       *  pre-Slice-3 saves stay valid; absent reads as false (no new
       *  migration, same optional-field-first pattern as `heroWeapon`). */
      mutatorWin?: boolean;
    }
  >;
  settings: {
    volume: number;
    muted: boolean;
    nightSpeed: 1 | 2;
    /** Selected hero weapon (hero.json def id). Optional so pre-CD-30 saves
     *  stay valid; readers fall back to "rifle" (see AppShell.heroWeapon). */
    heroWeapon?: string;
    /** Equipped perk ids (CD-30 Slice 2, perks.json). Optional so pre-Slice-2
     *  saves stay valid; unknown ids and anything past the current slot
     *  count are trimmed at READ time (see AppShell.selectedPerks), not
     *  here — mirrors `heroWeapon`'s stale-id sanitization. Mutators are
     *  deliberately NOT here: they're session-only (design doc §11), kept
     *  in an AppShell in-memory field instead. */
    perks?: string[];
  };
  hintsSeen: string[];
}

export type SaveData = SaveDataV1;

/** Renamed alongside CD-16's title slot (was a generic key). */
export const SAVE_KEY = "citydefense.save";

export const CURRENT_VERSION = 1;

export function defaultSave(): SaveDataV1 {
  return {
    v: 1,
    unlockedLevels: 1,
    levels: {},
    settings: { volume: 0.8, muted: false, nightSpeed: 1, heroWeapon: "rifle" },
    hintsSeen: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Migration = (data: any) => any;

/**
 * Keyed by the version a migration upgrades FROM. Empty today — the table
 * exists from day one so the next schema change is a one-line addition
 * instead of a redesign (see design doc Problem 4 "Save schema churn").
 */
const migrations: Record<number, Migration> = {};

function isValidSave(data: unknown): data is SaveDataV1 {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.v !== CURRENT_VERSION) return false;
  if (typeof d.unlockedLevels !== "number" || !Number.isFinite(d.unlockedLevels)) {
    return false;
  }
  if (typeof d.levels !== "object" || d.levels === null) return false;
  if (typeof d.settings !== "object" || d.settings === null) return false;
  const settings = d.settings as Record<string, unknown>;
  if (typeof settings.volume !== "number") return false;
  if (typeof settings.muted !== "boolean") return false;
  if (settings.nightSpeed !== 1 && settings.nightSpeed !== 2) return false;
  // heroWeapon is optional (added post-v1 without a schema bump); when
  // present it must be a string — unknown ids are sanitized at read time.
  if (settings.heroWeapon !== undefined && typeof settings.heroWeapon !== "string") return false;
  // perks is optional (added post-v1 without a schema bump, CD-30) — when
  // present it must be a string array; unknown/over-slot ids are trimmed
  // at read time (AppShell.selectedPerks), not here.
  if (
    settings.perks !== undefined &&
    (!Array.isArray(settings.perks) || !settings.perks.every((p) => typeof p === "string"))
  ) {
    return false;
  }
  if (!Array.isArray(d.hintsSeen)) return false;
  return true;
}

/** Load from the backend, migrating forward and falling back to defaults on
 *  any corruption (bad JSON, unknown shape, future/unmigratable version) —
 *  this must never throw. */
export function load(backend: StorageBackend): SaveDataV1 {
  const raw = backend.read();
  if (!raw) return defaultSave();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = JSON.parse(raw);
    let guard = 0;
    while (
      data &&
      typeof data.v === "number" &&
      data.v < CURRENT_VERSION &&
      guard < 10
    ) {
      const migrate = migrations[data.v];
      if (!migrate) break;
      data = migrate(data);
      guard++;
    }
    if (!isValidSave(data)) return defaultSave();
    return data;
  } catch {
    return defaultSave();
  }
}

export function persist(backend: StorageBackend, data: SaveDataV1): void {
  backend.write(JSON.stringify(data));
}

/** Debounced write helper — collapses rapid updates (e.g. dragging a volume
 *  slider) into a single write ~200ms after the last call. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms = 200,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}
