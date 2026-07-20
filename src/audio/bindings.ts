import type { Game } from "../game/Game";
import type { GameEvent } from "../game/types";
import type { AudioBus } from "./AudioBus";
import type { SoundId } from "./sfx";

/**
 * The only file that knows both vocabularies: `GameEvent` (sim) and
 * `SoundId` (audio) — see design-demo-milestone.md Problem 5. Plain
 * event -> sound lookup, no game logic.
 */
const WEAPON_SOUNDS: Record<string, SoundId> = {
  gun_tower: "shot_gun",
  artillery_platform: "shot_siege",
  missile_battery: "shot_missile",
  command_center: "shot_gun",
  // garrison (Batch 3) has damage 0 / fireRate 0 and never emits
  // weaponFired — its squad units fire "unitFired" instead (below).
};

const SIMPLE_SOUNDS: Partial<Record<GameEvent["type"], SoundId>> = {
  enemyDied: "enemy_die",
  unitDied: "enemy_die",
  buildingDestroyed: "building_down",
  waveStarted: "wave_klaxon",
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
    const id = SIMPLE_SOUNDS[event.type];
    if (id) bus.play(id);
  });
}
