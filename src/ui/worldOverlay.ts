/**
 * Shared helpers for world-anchored DOM overlays positioned over the
 * canvas (see UI_PLAN.md "World-anchored menus"). Each overlay component
 * (BuildRing, UpgradeChip, ...) owns a child root inside #world-ui so
 * rebuilding one never clobbers another's DOM.
 */

/** Align an overlay container's box with the canvas's on-screen box. */
export function alignOverlayToCanvas(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
): void {
  container.style.left = `${canvas.offsetLeft}px`;
  container.style.top = `${canvas.offsetTop}px`;
  container.style.width = `${canvas.clientWidth}px`;
  container.style.height = `${canvas.clientHeight}px`;
}

/** Create and append a child root div that a single component owns. */
export function makeOverlayRoot(container: HTMLElement): HTMLElement {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.inset = "0";
  container.appendChild(root);
  return root;
}
