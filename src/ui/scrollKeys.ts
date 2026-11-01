/*
 * Home, End, Page Up, Page Down and the arrows when the page is showing but
 * nothing on it has the caret: after a click on the desk around the page, say.
 * Left to the browser these keys scroll with an animation, so a quick second
 * press starts from wherever the first had got to and Home can stop short of
 * the top. Here each press scrolls at once, the way the page's own keys do.
 */

/** How far one press of ↑ or ↓ goes. */
const LINE = 40;

/** Where a key takes the scroll, or null for a key this leaves alone. */
export function scrollKeyTarget(key: string, o: { top: number; height: number; client: number }): number | null {
  const page = Math.max(o.client - 2 * LINE, LINE);
  const bottom = Math.max(o.height - o.client, 0);
  const to =
    key === 'Home' ? 0
    : key === 'End' ? bottom
    : key === 'PageUp' ? o.top - page
    : key === 'PageDown' ? o.top + page
    : key === 'ArrowUp' ? o.top - LINE
    : key === 'ArrowDown' ? o.top + LINE
    : null;
  return to === null ? null : Math.min(Math.max(to, 0), bottom);
}

/** Whatever has the keyboard wants these keys for itself: a text box, a list, a menu. */
function keepsKeys(el: Element): boolean {
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"], [role="slider"], [role="tablist"], [role="grid"], [role="dialog"]');
}

/** Scrolls `desk` for a key pressed with the keyboard on the desk or nowhere in particular. Returns whether it did. */
export function deskScrollKey(e: KeyboardEvent, desk: HTMLElement | null): boolean {
  if (!desk || e.altKey || e.metaKey || e.shiftKey || e.isComposing) return false;
  // Ctrl+Home and Ctrl+End go to the top and bottom too, as in a browser.
  if (e.ctrlKey && e.key !== 'Home' && e.key !== 'End') return false;
  const at = e.target instanceof Element ? e.target : null;
  if (at && at !== document.body && at !== document.documentElement && !(desk.contains(at) && !keepsKeys(at))) return false;
  const to = scrollKeyTarget(e.key, { top: desk.scrollTop, height: desk.scrollHeight, client: desk.clientHeight });
  if (to === null) return false;
  e.preventDefault();
  desk.scrollTop = to;
  return true;
}
