/**
 * The interface size zooms the whole window, so a spot measured on screen
 * (a click, a box) has to be divided by the zoom before it can place a
 * pop-up inside it.
 */
export function zoomOf(el: Element | null): number {
  let zoom = 1;
  for (let e = el; e; e = e.parentElement) zoom *= parseFloat(getComputedStyle(e).zoom) || 1;
  return zoom;
}

/** A spot on screen, as `left` and `top` for a fixed pop-up that is a child of `parent`. */
export function placeAt(parent: Element | null, at: { left: number; top: number }): { left: number; top: number } {
  const zoom = zoomOf(parent);
  return { left: at.left / zoom, top: at.top / zoom };
}
