import { useEffect, useRef } from 'react';

/** How long the pointer rests on an edge before its panel slides in, so passing by doesn't open it. */
const DWELL_MS = 350;

/**
 * Oven Mode's two window edges: resting the pointer on the left one (or clicking it) slides the
 * Shelf in, the right one the Pantry or Seasonings. The panels themselves slide in by CSS
 * (`.app.focus.side-open`, `.app.focus.oven-side`); this only listens at the edges, so typing
 * never runs any of it.
 */
export function OvenEdges({ seasonings, onShelf, onSide }: { seasonings: boolean; onShelf: () => void; onSide: () => void }) {
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const edge = (side: 'left' | 'right', label: string, open: () => void) => (
    <div
      className={`oven-edge ${side}`}
      title={label}
      aria-hidden="true"
      onPointerEnter={(e) => {
        // A touch has no hover; it opens on the tap.
        if (e.pointerType !== 'mouse') return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(open, DWELL_MS);
      }}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onClick={() => {
        window.clearTimeout(timer.current);
        open();
      }}
    >
      <span className="oven-edge-tab" />
    </div>
  );
  return (
    <>
      {edge('left', 'Shelf', onShelf)}
      {edge('right', seasonings ? 'Seasonings' : 'Pantry', onSide)}
    </>
  );
}

/** How long the pointer may be outside a slid-in panel before it slides away, so a brush past the edge doesn't close it. */
const LEAVE_MS = 400;

/**
 * Pointer handlers for a panel slid in over the page in Oven Mode: when the mouse leaves it, it
 * slides away again, unless a menu or dialog it opened is in use or a drag is under way.
 */
export function useSlideAway(active: boolean, close: () => void) {
  const timer = useRef(0);
  const closeNow = useRef(close);
  closeNow.current = close;
  useEffect(() => {
    if (!active) window.clearTimeout(timer.current);
    return () => window.clearTimeout(timer.current);
  }, [active]);
  return {
    onPointerEnter: () => window.clearTimeout(timer.current),
    onPointerLeave: (e: { pointerType: string; buttons: number }) => {
      if (!active || e.pointerType !== 'mouse' || e.buttons !== 0) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (document.querySelector('.menu, [role="dialog"], .tree-rename')) return;
        // Words being typed in the panel (a search, a new name) keep it out until Escape or a click away.
        if (document.activeElement?.closest('.sidebar input, .sidebar textarea, .drawer input, .drawer textarea')) return;
        closeNow.current();
      }, LEAVE_MS);
    },
  };
}
