/**
 * The parts of the window a keyboard can move between: F6 and Shift+F6 go
 * round them in the order they sit on screen, and Mod+1 to Mod+5 jump to one.
 * Everything here runs only when one of those keys is pressed, never while typing.
 */
export type Area = 'page' | 'shelf' | 'pantry' | 'seasonings' | 'toolbar';

/** The order F6 goes in: the toolbar along the top, then left to right. */
export const AREA_ORDER: Area[] = ['toolbar', 'shelf', 'page', 'pantry', 'seasonings'];

/** Mod+1 to Mod+5, by the shortcut ids in shortcuts.ts. */
export const AREA_SHORTCUTS: Record<string, Area> = {
  goPage: 'page',
  goShelf: 'shelf',
  goPantry: 'pantry',
  goSeasonings: 'seasonings',
  goToolbar: 'toolbar',
};

const ROOT: Record<Area, string> = {
  // The page and what sits on it (a Pantry card's fields, a scene's details); the editor itself takes the keyboard.
  page: '.desk',
  shelf: 'nav.sidebar',
  pantry: '.pantry-panel',
  seasonings: '.panel.seasonings',
  toolbar: '.toolbar',
};

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]';

export function areaRoot(area: Area): HTMLElement | null {
  return document.querySelector<HTMLElement>(ROOT[area]);
}

/** Whether an area is on screen now: closed panels and those Oven Mode hides are not. */
export function areaShown(area: Area): boolean {
  const el = areaRoot(area);
  return !!el && el.getClientRects().length > 0;
}

/** The area holding an element, if it is in one. */
export function areaOf(el: Element | null): Area | null {
  if (!el) return null;
  for (const area of AREA_ORDER) if (el.closest(ROOT[area])) return area;
  return null;
}

/**
 * Where the keyboard lands in an area: a list's current row (its one Tab stop), or else the
 * first control that Tab would reach. The page is focused by the editor itself.
 */
export function landingIn(root: HTMLElement): HTMLElement | null {
  const stop = root.querySelector<HTMLElement>('[role="tree"] [tabindex="0"], [role="toolbar"] [tabindex="0"], [role="listbox"] [tabindex="0"]');
  if (stop && stop.getClientRects().length > 0) return stop;
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el.tabIndex >= 0 && el.getClientRects().length > 0) return el;
  }
  return null;
}

/** The area after (or before) `from` among those on screen, going round. */
export function nextArea(from: Area | null, dir: 1 | -1, shown: (a: Area) => boolean): Area | null {
  const list = AREA_ORDER.filter(shown);
  if (list.length === 0) return null;
  const at = from ? list.indexOf(from) : -1;
  if (at < 0) return dir > 0 ? list[0]! : list[list.length - 1]!;
  return list[(at + dir + list.length) % list.length]!;
}
