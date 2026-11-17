/** How much a transform on the element scales what is inside it (1 when it has none). */
export function transformScale(el: Element): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 1;
  // Engines give the computed transform as a matrix; a plain scale() is read too.
  const m = /^matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)/.exec(t);
  if (m) return Math.hypot(parseFloat(m[1]!), parseFloat(m[2]!)) || 1;
  const s = /^scale\(\s*([\d.e]+)/.exec(t);
  return s ? parseFloat(s[1]!) || 1 : 1;
}

/**
 * How much bigger than its own CSS pixels the element shows on screen. The interface size
 * zooms the whole window and the page is scaled to its zoom, so a spot measured on screen
 * (a click, a box) has to be divided by this before it can place something inside it.
 */
export function zoomOf(el: Element | null): number {
  let zoom = 1;
  for (let e = el; e; e = e.parentElement) zoom *= (parseFloat(getComputedStyle(e).zoom) || 1) * transformScale(e);
  return zoom;
}

/** A spot on screen, as `left` and `top` for a fixed pop-up that is a child of `parent`. */
export function placeAt(parent: Element | null, at: { left: number; top: number }): { left: number; top: number } {
  const zoom = zoomOf(parent);
  return { left: at.left / zoom, top: at.top / zoom };
}
