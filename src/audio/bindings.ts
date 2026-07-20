import type { AppShell } from "../app/AppShell";
import type { Game } from "../game/Game";
import type { GameEvent } from "../game/types";
import type { AudioBus } from "./AudioBus";
import type { MusicTheme } from "./music";
import type { SoundId } from "./sfx";

/**
 * The only file that knows both vocabularies: `GameEvent` (sim) and
 * `SoundId` / music themes (audio) — see design-demo-milestone.md Problem 5.
 * Plain event → sound lookup + phase → theme mapping; no game logic.
 */
const WEAPON_SOUNDS: Record<string, SoundId> = {
  gun_tower: "shot_gun",
  artillery_platform: "shot_siege",
  missile_battery: "shot_missile",
  command_center: "shot_gun",
  sniper_tower: "shot_gun",
  // garrison (Batch 3) has damage 0 / fireRate 0 and never emits
  // weaponFired — its squad units fire "unitFired" instead (below).
};

const SIMPLE_SOUNDS: Partial<Record<GameEvent["type"], SoundId>> = {
  enemyDied: "enemy_die",
  unitDied: "enemy_die",
  buildingDestroyed: "building_down",
  // waveStarted handled specially (klaxon + CD-33 announcer).
  dawn: "dawn_chime",
  victory: "victory_sting",
  defeat: "defeat_sting",
  built: "ui_build",
  upgraded: "ui_upgrade",
  sold: "ui_sell",
  undone: "ui_sell",
  // CD-40 weapon active — reuse siege boom for impact-y self-casts.
  abilityCast: "shot_siege",
};

/** Wires `game.onEvent` to `bus.play`. Returns the unsubscribe function. */
export function bindSounds(game: Game, bus: AudioBus): () => void {
  return game.onEvent((event) => {
    if (event.type === "weaponFired") {
      bus.play(WEAPON_SOUNDS[event.defId] ?? "shot_gun");
      return;
    }
    if (event.type === "unitFired") {
      bus.play("shot_gun");
      return;
    }
    if (event.type === "waveStarted") {
      bus.play("wave_klaxon");
      // CD-33: radio-cadence announcer layered after the klaxon opens.
      bus.play("announce_inbound");
      return;
    }
    const id = SIMPLE_SOUNDS[event.type];
    if (id) bus.play(id);
  });
}

/**
 * CD-33: map AppShell screen + Game phase/wave → music theme.
 * Call on shell onChange and after sim phase edges (cheap; bus no-ops if
 * the theme is unchanged). No Game imports of audio — this is the bridge.
 */
export function syncMusic(shell: AppShell, bus: AudioBus): void {
  const theme = musicThemeFor(shell);
  bus.setMusicTheme(theme);
}

function musicThemeFor(shell: AppShell): MusicTheme {
  if (shell.screen !== "game") {
    // Soft bed on title / level select; silence only if we ever add more screens.
    return "title";
  }
  const state = shell.game.getSnapshot();
  if (state.phase === "day") return "day";
  if (state.phase === "night") {
    // Last wave (0-based) gets the finale density bump.
    const last = state.totalWaves > 0 && state.waveIndex >= state.totalWaves - 1;
    return last ? "finale" : "night";
  }
  // victory / defeat — drop the bed so stings read cleanly.
  return "none";
}
