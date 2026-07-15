# UI Plan — cross-platform menu & input architecture

Target platforms, in order: **browser (now)** → Godot 2D on PC → controller
(Xbox/PC) → mobile (iPhone/Android). The rule for every UI decision made
today: it must have an obvious translation to all four. This doc explains the
architecture and the planned menu refresh.

## Principles (what makes UI portable)

1. **State-driven rendering.** All UI renders from `GameSnapshot`; no UI
   element owns game state. Already true — this is the single most important
   property to preserve. A Godot port keeps the model and rewrites only views.

2. **Semantic input actions.** Devices never talk to the game directly; they
   produce `GameAction`s (`src/input/actions.ts`): `nav(dx,dy)`, `option(n)`,
   `upgrade`, `confirm`, `cancel`, `restart`. Implemented for keyboard.
   - Gamepad adapter later: D-pad/left-stick → `nav`, A → `confirm`,
     B → `cancel`, X → `upgrade`, face/shoulder or a radial → `option`.
   - Touch adapter later: tap-on-site = select (bypasses `nav`), tap menu
     button = `option(n)`.
   - Godot: these action names become the InputMap actions verbatim.

3. **Spatial navigation, not tab order.** `Game.navigate(dx,dy)` picks the
   nearest selectable in a ~70° cone — this is exactly how controller UIs
   navigate, so controller support inherits it for free. (Godot Control nodes
   have built-in focus neighbors; the world-space version stays ours.)

4. **World-anchored menus.** Menus attach to things in the game world (the
   selected site), not to screen corners. Works identically with mouse
   (click), keyboard/controller (selection + option keys), and touch (big
   tap targets at the site). This drives the menu refresh below.

5. **Logical resolution + safe areas.** Game space stays 960×540, scaled to
   fit (already true). All future screen-space UI must respect a safe-area
   inset (mobile notches) and keep touch targets ≥ 44px logical.

6. **No hover-dependent information.** Hover is mouse-only; anything shown on
   hover must also be visible on selection (controller/touch have no hover).

## Menu refresh (planned, browser-first)

Current layout: canvas + right side panel (site list, build options,
selected info, phase buttons). DOM-heavy panels don't translate — the refresh
moves gameplay-critical UI into the world and demotes the panel to optional
info.

- **Build ring** (replaces side-panel build options): selecting an empty site
  pops 2–4 large option buttons in an arc around the site, world-anchored.
  Number badges (1–4) always visible; cost + mini-silhouette per button.
  Mouse: click. Keyboard/pad: `option(n)` or nav within the ring. Touch: tap.
  Insufficient funds: button greyed with cost in red.
- **Upgrade chip**: selecting a building shows a single world-anchored chip
  (cost + `U` badge) above it, plus HP/stats in a slim tooltip card.
- **Top bar** stays (money / HQ HP / wave / phase) — it's already thin and
  safe-area friendly.
- **Side panel** becomes an optional info drawer (level info, bestiary,
  post-wave summary). On mobile it's a bottom sheet; on desktop it can stay
  a right drawer, collapsed by default.
- **Phase control**: one big "Start Night" button bottom-center (thumb
  reachable), replacing the side-panel button. Space/A/tap all hit it.
- **Pause/settings menu**: standard modal (resume / restart / audio sliders /
  key hints). Modals are portable everywhere; keep them simple.

Implementation approach in browser: DOM elements positioned over the canvas
via `canvasToScreen(x, y)` (inverse of `canvasToWorld`) — keeps
accessibility and CSS, while staying conceptually world-anchored. In Godot
the same design becomes Control nodes anchored to world positions.

## Platform-specific notes

**Browser (now)**
- Keyboard done (WASD/arrows + 1-4 + U + Space/Esc/R). Mouse done.
- Gamepad API adapter is cheap once actions exist: poll in the rAF loop,
  translate to `GameAction`s. Add when the build ring lands (so `option`
  has a good controller story).

**Godot 2D (PC)**
- Logic port is a rewrite (TS → GDScript/C#); protect against drift by
  moving all defs (buildings/enemies/levels/waves) from TS objects to plain
  JSON that both engines load. Do this before starting the port.
- `GameAction` names → InputMap actions; `GameSnapshot` → an autoload
  GameState; Renderer layers → Node2D scene tree; HUD → CanvasLayer.

**Controller (Xbox/PC)**
- Everything rides on actions + spatial nav + build ring. Additional needs:
  visible focus at all times (done: focus brackets), no hover-only info,
  rumble hooks (optional).

**Mobile (iPhone/Android)**
- Ship as PWA first (installable, offline via service worker); wrap with
  Capacitor only if store presence matters.
- Touch: tap = select/confirm, tap-away = cancel, long-press = building info,
  two big phase/speed buttons bottom corners. No virtual joystick needed for
  the current design (no hero).
- Portrait is hostile to a 16:9 map — require landscape, or letterbox with
  the info drawer filling the bottom.
- Performance: current canvas 2D is fine; revisit if particle counts grow.

## Sequencing

1. ✅ Semantic action layer + keyboard controls.
2. ✅ Build ring (world-anchored DOM over canvas, `src/ui/BuildRing.ts`);
   side-panel build options removed. Still to do from this step: upgrade
   chip at the building, demote site list to info drawer.
3. ✅ Defs extracted to JSON (`src/data/{buildings,enemies,levels}.json`);
   TS files are now typed loaders. Still to do: pause/settings modal.
4. Gamepad adapter (browser).
5. PWA packaging + touch adapter + landscape/safe-area layout.
6. Godot port spike: load the JSON defs, reimplement Game.update, one level.
