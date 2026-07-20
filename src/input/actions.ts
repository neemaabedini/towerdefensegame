/**
 * Semantic input actions — the portable layer between devices and the game.
 *
 * Anything that can control the game (keyboard now; gamepad, touch, or a
 * Godot InputMap later) translates its raw events into these actions. Game
 * code never sees keys, buttons, or touches — only actions. See UI_PLAN.md.
 */
export type GameAction =
  | { kind: "nav"; dx: number; dy: number }
  /** Latched hero move-vector (docs/design-hero-commander.md §8/§9). Not
   *  produced by actionFromKey — main.ts derives it from a held-key Set on
   *  keydown/keyup edges and applies it via Game.setHeroMove (day + night). */
  | { kind: "heroMove"; dx: number; dy: number }
  | { kind: "option"; index: number }
  /** CD-40: cast hero weapon active at index into hero.abilities. */
  | { kind: "ability"; index: number }
  | { kind: "upgrade" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "restart" }
  | { kind: "pause" }
  | { kind: "toggleSpeed" }
  | { kind: "sell" };

/** Keyboard bindings. ARROWS navigate sites/buildings, WASD moves the hero
 *  (both phases — see main.ts's held-key adapter; the split is what lets
 *  keyboard-only play keep site nav while the hero is drivable all day,
 *  CD-29 day-positioning), 1-4 build, U/E upgrade, X undo/sell, P pause,
 *  F night-speed toggle. */
export function actionFromKey(ev: KeyboardEvent): GameAction | null {
  // Held-key repeat is fine for navigation, but must not repeat purchases
  // or wave starts.
  const key = ev.key;

  switch (key) {
    case "ArrowUp":
      return { kind: "nav", dx: 0, dy: -1 };
    case "ArrowDown":
      return { kind: "nav", dx: 0, dy: 1 };
    case "ArrowLeft":
      return { kind: "nav", dx: -1, dy: 0 };
    case "ArrowRight":
      return { kind: "nav", dx: 1, dy: 0 };
  }

  if (ev.repeat) return null;

  switch (key) {
    case "1":
    case "2":
    case "3":
    case "4":
      return { kind: "option", index: Number(key) - 1 };
    case "q":
    case "Q":
      // CD-40: alias for ability 0 (primary weapon active).
      return { kind: "ability", index: 0 };
    case "u":
    case "U":
    case "e":
    case "E":
      return { kind: "upgrade" };
    case " ":
    case "Enter":
      return { kind: "confirm" };
    case "Escape":
      return { kind: "cancel" };
    case "r":
    case "R":
      return { kind: "restart" };
    case "p":
    case "P":
      return { kind: "pause" };
    case "f":
    case "F":
      return { kind: "toggleSpeed" };
    case "x":
    case "X":
      return { kind: "sell" };
  }

  return null;
}
