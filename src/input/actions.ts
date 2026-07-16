/**
 * Semantic input actions — the portable layer between devices and the game.
 *
 * Anything that can control the game (keyboard now; gamepad, touch, or a
 * Godot InputMap later) translates its raw events into these actions. Game
 * code never sees keys, buttons, or touches — only actions. See UI_PLAN.md.
 */
export type GameAction =
  | { kind: "nav"; dx: number; dy: number }
  /** Latched hero move-vector (docs/design-hero-commander.md §8/§9). Unlike
   *  every other action, this isn't produced by a single actionFromKey call —
   *  main.ts derives it from a held-direction-key Set on every keydown/keyup
   *  edge (so movement doesn't depend on OS key-repeat) and applies it via
   *  Game.setHeroMove, which is itself a no-op outside phase === "night". */
  | { kind: "heroMove"; dx: number; dy: number }
  | { kind: "option"; index: number }
  | { kind: "upgrade" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "restart" }
  | { kind: "pause" }
  | { kind: "toggleSpeed" }
  | { kind: "sell" };

/** Keyboard bindings. WASD/arrows navigate, 1-4 build, U/E upgrade, X
 *  undo/sell, P pause, F night-speed toggle. */
export function actionFromKey(ev: KeyboardEvent): GameAction | null {
  // Held-key repeat is fine for navigation, but must not repeat purchases
  // or wave starts.
  const key = ev.key;

  switch (key) {
    case "w":
    case "W":
    case "ArrowUp":
      return { kind: "nav", dx: 0, dy: -1 };
    case "s":
    case "S":
    case "ArrowDown":
      return { kind: "nav", dx: 0, dy: 1 };
    case "a":
    case "A":
    case "ArrowLeft":
      return { kind: "nav", dx: -1, dy: 0 };
    case "d":
    case "D":
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
