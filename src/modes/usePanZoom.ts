import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';

/** Where an endless board is looking: the board's point at the window's top left corner, and how close in. */
export interface Look {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;

/** The look that shows everything from `box` (left, top, right, bottom) in a window of this size. */
export function lookAt(box: [number, number, number, number], width: number, height: number, pad = 56): Look {
  const [l, t, r, b] = box;
  const k = Math.max(MIN_ZOOM, Math.min(1, (width - pad * 2) / Math.max(1, r - l), (height - pad * 2) / Math.max(1, b - t)));
  return { k, x: (l + r) / 2 - width / 2 / k, y: (t + b) / 2 - height / 2 / k };
}

/**
 * An endless surface to drag about and zoom: free boards and the atlas. Dragging the bare
 * surface moves it, the wheel scrolls it, and Ctrl or ⌘ with the wheel (or a pinch) zooms on the pointer.
 */
export function usePanZoom(start: Look = { x: -40, y: -40, k: 1 }) {
  const [look, setLook] = useState<Look>(start);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const el = useRef<HTMLDivElement | null>(null);
  const now = useRef(look);
  now.current = look;

  const ref = useCallback((node: HTMLDivElement | null) => {
    el.current = node;
    if (node) setSize([node.clientWidth, node.clientHeight]);
  }, []);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const watch = new ResizeObserver(() => setSize([node.clientWidth, node.clientHeight]));
    watch.observe(node);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y, k } = now.current;
      if (e.ctrlKey || e.metaKey) {
        const box = node.getBoundingClientRect();
        const px = e.clientX - box.left;
        const py = e.clientY - box.top;
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k * Math.exp(-e.deltaY * 0.0022)));
        setLook({ k: next, x: x + px / k - px / next, y: y + py / k - py / next });
      } else {
        const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
        setLook({ k, x: x + dx / k, y: y + dy / k });
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      watch.disconnect();
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  /** For the surface itself: a drag that starts on it, not on something lying on it, moves the view. */
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const from = { px: e.clientX, py: e.clientY, ...now.current };
    const node = e.currentTarget;
    node.setPointerCapture(e.pointerId);
    node.classList.add('panning');
    const move = (m: PointerEvent) => setLook({ k: from.k, x: from.x - (m.clientX - from.px) / from.k, y: from.y - (m.clientY - from.py) / from.k });
    const up = () => {
      node.classList.remove('panning');
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  };

  /** A point of the window as a point of the board. */
  const toBoard = (clientX: number, clientY: number): [number, number] => {
    const box = el.current?.getBoundingClientRect();
    const { x, y, k } = now.current;
    return [x + (clientX - (box?.left ?? 0)) / k, y + (clientY - (box?.top ?? 0)) / k];
  };

  const zoomBy = (factor: number) => {
    const { x, y, k } = now.current;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k * factor));
    const [w, h] = size;
    setLook({ k: next, x: x + w / 2 / k - w / 2 / next, y: y + h / 2 / k - h / 2 / next });
  };

  const fit = (box: [number, number, number, number] | null) => {
    if (box && size[0] > 0) setLook(lookAt(box, size[0], size[1]));
  };

  return { look, setLook, size, ref, onPointerDown, toBoard, zoomBy, fit };
}

/** Follows a drag from a press until the button comes up, wherever the pointer goes. */
export function dragFrom(e: ReactPointerEvent<Element>, onMove: (dx: number, dy: number, e: PointerEvent) => void, onEnd: (moved: boolean, e: PointerEvent) => void): void {
  const from = { x: e.clientX, y: e.clientY };
  let moved = false;
  const move = (m: PointerEvent) => {
    const dx = m.clientX - from.x;
    const dy = m.clientY - from.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    onMove(dx, dy, m);
  };
  const up = (u: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onEnd(moved, u);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
