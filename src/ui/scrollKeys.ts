import { type EditorView } from '@tiptap/pm/view';

/*
 * Left to the browser, Home, End and the page keys scroll with an animation,
 * so a quick second press starts from wherever the first had got to and Home
 * can stop short of the top. Here each press goes where it should at once.
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

/** Places that need these keys for themselves: a text box, a menu, a dialog. */
function keepsKeys(el: Element): boolean {
  return !!el.closest('input, textarea, select, [contenteditable="true"], .menu, [role="menu"], [role="menubar"], [role="dialog"]');
}

const PAGE_KEYS = new Set(['Home', 'End', 'PageUp', 'PageDown']);

/**
 * Home, End, Page Up and Page Down belong to the page wherever the keyboard
 * is, except in a text box, a menu or a dialog: from the Shelf, the toolbar or
 * the desk they go to the text as though the caret had them. With no text
 * showing (the manuscript, Mise en Place), they scroll the desk at once.
 * Returns whether it took the key.
 */
export function pageKeyAnywhere(e: KeyboardEvent, view: EditorView | null, desk: HTMLElement | null): boolean {
  if (!PAGE_KEYS.has(e.key) || e.altKey || e.isComposing || e.defaultPrevented) return false;
  const at = e.target instanceof Element ? e.target : null;
  if (view && at && view.dom.contains(at)) return false;
  if (at && keepsKeys(at)) return false;
  if (view && view.editable) {
    e.preventDefault();
    e.stopPropagation();
    view.focus();
    if (view.someProp('handleKeyDown', (f) => f(view, e))) return true;
  }
  if (!desk || e.shiftKey || e.metaKey) return !!view;
  const to = scrollKeyTarget(e.key, { top: desk.scrollTop, height: desk.scrollHeight, client: desk.clientHeight });
  if (to === null) return !!view;
  e.preventDefault();
  e.stopPropagation();
  desk.scrollTop = to;
  return true;
}
