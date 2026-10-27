import { useEffect, useRef, useState } from 'react';

export const SHELF_DEFAULT = 232;
export const SHELF_MIN = 180;
export const SHELF_MAX = 480;
const KEY = 'cookbook.shelfWidth';

/** Keeps a width within the Shelf's limits, and never more than half the window. */
export function clampShelf(width: number, windowWidth = Infinity): number {
  const max = Math.max(SHELF_MIN, Math.min(SHELF_MAX, windowWidth / 2));
  return Math.round(Math.max(SHELF_MIN, Math.min(max, width)));
}

export function readShelfWidth(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return saved > 0 ? clampShelf(saved) : SHELF_DEFAULT;
  } catch {
    return SHELF_DEFAULT;
  }
}

/** The Shelf's width, remembered between visits. */
export function useShelfWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(readShelfWidth);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(width));
    } catch {
      // A private window may refuse; the width still holds for this visit.
    }
  }, [width]);
  return [width, setWidth];
}

/** The Shelf's right edge: drag it, or use the arrow keys. A double-click puts it back. */
export function ShelfResizer({ width, onWidth, shelf }: { width: number; onWidth: (width: number) => void; shelf: () => HTMLElement | null }) {
  const drag = useRef<{ x: number; width: number; scale: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`shelf-resize${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Shelf"
      aria-valuemin={SHELF_MIN}
      aria-valuemax={SHELF_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = shelf();
        if (!el) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // The interface size zooms the whole app, so pointer pixels and CSS pixels can differ.
        const scale = el.getBoundingClientRect().width / el.offsetWidth || 1;
        drag.current = { x: e.clientX, width: el.offsetWidth, scale };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        onWidth(clampShelf(d.width + (e.clientX - d.x) / d.scale, window.innerWidth / d.scale));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => onWidth(SHELF_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') onWidth(clampShelf(width - step, window.innerWidth));
        else if (e.key === 'ArrowRight') onWidth(clampShelf(width + step, window.innerWidth));
        else if (e.key === 'Home') onWidth(SHELF_MIN);
        else if (e.key === 'End') onWidth(clampShelf(SHELF_MAX, window.innerWidth));
        else return;
        e.preventDefault();
      }}
    />
  );
}
