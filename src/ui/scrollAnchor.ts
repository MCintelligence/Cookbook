/**
 * Keeping the page still while things above the screen change size, as Chrome's scroll anchoring
 * does, done by hand so it works the same in Safari's and Linux's web views, which don't do it.
 * Only what is needed is measured: a binary search for the first child on screen.
 */

export interface Seen {
  el: Element;
  /** Its top, from the top of the scrolling box. */
  top: number;
}

/**
 * What to keep still: the first of `page`'s children that starts inside the visible part of
 * `scroller`, or, when none starts there (one long Item fills the screen), the one showing at the
 * top. One that only shows its end is never used: if it loads and shrinks, its top stays put
 * while everything after it moves.
 */
export function firstSeen(scroller: HTMLElement, page: HTMLElement): Seen | null {
  const kids = page.children;
  // Hidden and screen-reader-only helpers sit at the end, out of the flow: the search stops before them.
  let end = kids.length - 1;
  while (end >= 0 && ((kids[end] as HTMLElement).hidden || kids[end]!.classList.contains('sr-only'))) end--;
  if (end < 0) return null;
  const box = scroller.getBoundingClientRect();
  // The first child whose top is at or below the top of the box.
  let lo = 0;
  let hi = end + 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kids[mid]!.getBoundingClientRect().top < box.top) lo = mid + 1;
    else hi = mid;
  }
  const starts = lo <= end && kids[lo]!.getBoundingClientRect().top < box.bottom;
  const el = starts ? kids[lo]! : kids[Math.max(0, lo - 1)]!;
  return { el, top: el.getBoundingClientRect().top - box.top };
}

/** Scrolls `scroller` so what was first on screen is back where it was, if it moved. */
export function keepStill(scroller: HTMLElement, was: Seen | null): void {
  if (!was || !was.el.isConnected) return;
  const now = was.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const moved = now - was.top;
  if (Math.abs(moved) >= 1) scroller.scrollTop += moved;
}
