import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { BOARD_ZOOM } from './boardZoom';

/** Where an endless board is looking: the board's point at the window's top left corner, and how close in. */
export interface Look {
  x: number;
  y: number;
  k: number;
}

/** The closest and furthest an endless board goes: 50% to 200%, the same range as the page. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
/** The zoom always rests on a 10% step, so 80% always means the same size. */
const STEP = 0.1;
/** How long the board takes to glide to a new zoom, in milliseconds. */
const GLIDE = 140;
/** How long a pinch must pause before it settles on the nearest step. */
const SETTLE = 160;

const clamp = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
/** The nearest 10% step, inside the limits. */
export const snapZoom = (k: number) => clamp(Math.round(k / STEP) * STEP);
/** The next 10% step in (`1`) or out (`-1`) from `k`, inside the limits. */
export function stepZoom(k: number, dir: 1 | -1): number {
  const at = Math.round(k / STEP);
  // A zoom between steps (a pinch caught mid-way) goes to the step on that side first.
  const here = Math.abs(k / STEP - at) < 1e-6 ? at : dir > 0 ? Math.floor(k / STEP) : Math.ceil(k / STEP);
  return clamp(Math.round(here + dir) * STEP);
}

/** The look that shows everything from `box` (left, top, right, bottom) in a window of this size, on a 10% step. */
export function lookAt(box: [number, number, number, number], width: number, height: number, pad = 56): Look {
  const [l, t, r, b] = box;
  const fits = Math.min(1, (width - pad * 2) / Math.max(1, r - l), (height - pad * 2) / Math.max(1, b - t));
  // Down to the step below, so everything still fits; never below 50%.
  const k = clamp(Math.floor(fits / STEP + 1e-6) * STEP);
  return { k, x: (l + r) / 2 - width / 2 / k, y: (t + b) / 2 - height / 2 / k };
}

/** `look` zoomed to `k`, keeping the board's point at (px, py) in the window where it is. */
function zoomAround(look: Look, k: number, px: number, py: number): Look {
  return { k, x: look.x + px / look.k - px / k, y: look.y + py / look.k - py / k };
}

/**
 * An endless surface to drag about and zoom: free boards and the atlas. Dragging the bare
 * surface moves it, the wheel scrolls it, and Ctrl or ⌘ with the wheel (or a pinch) zooms on the pointer.
 * A wheel notch, ⌘= and the − and + buttons move one 10% step; a pinch follows the fingers
 * and then settles on the nearest step. Every change of zoom glides rather than jumps.
 */
export function usePanZoom(start: Look = { x: -40, y: -40, k: 1 }) {
  const [look, setLook] = useState<Look>(start);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  // The surface, as state: the free board can appear long after the view does (Grid to Free).
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const now = useRef(look);
  now.current = look;
  // Several wheel turns can come in one frame, so each one starts from the last, not from the last render.
  const put = (to: Look) => {
    now.current = to;
    setLook(to);
  };
  // Where the zoom is heading, and the point it zooms around.
  const goal = useRef({ k: start.k, px: 0, py: 0 });
  const [zoom, setZoom] = useState(start.k);
  const glide = useRef<{ from: Look; t0: number; frame: number } | null>(null);

  const stopGlide = () => {
    if (glide.current) cancelAnimationFrame(glide.current.frame);
    glide.current = null;
  };

  /** Glides from where the board is now to the goal zoom. */
  const glideTo = (k: number, px: number, py: number) => {
    goal.current = { k, px, py };
    setZoom(k);
    stopGlide();
    const from = now.current;
    if (Math.abs(from.k - k) < 1e-6) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return put(zoomAround(from, k, px, py));
    const t0 = performance.now();
    const tick = (t: number) => {
      // A frame can be stamped a little before the glide began, so never before its start.
      const f = Math.max(0, Math.min(1, (t - t0) / GLIDE));
      const ease = 1 - (1 - f) ** 3;
      // Zooming evenly in ratio, not in difference, so in and out feel the same.
      const g = goal.current;
      const kNow = f >= 1 ? g.k : from.k * (g.k / from.k) ** ease;
      put(zoomAround(now.current, kNow, g.px, g.py));
      if (f < 1 && glide.current) glide.current.frame = requestAnimationFrame(tick);
      else glide.current = null;
    };
    glide.current = { from, t0, frame: requestAnimationFrame(tick) };
  };

  /** Puts the board straight at a look, ending any glide. */
  const jump = (to: Look) => {
    stopGlide();
    goal.current = { k: to.k, px: 0, py: 0 };
    setZoom(to.k);
    put(to);
  };

  const ref = useCallback((n: HTMLDivElement | null) => {
    setNode(n);
    if (n) setSize([n.clientWidth, n.clientHeight]);
  }, []);

  useEffect(() => {
    if (!node) return;
    const watch = new ResizeObserver(() => setSize([node.clientWidth, node.clientHeight]));
    watch.observe(node);
    let settle = 0;
    // Where the surface is in the window, in the board's own CSS pixels (the UI size setting zooms the page).
    const pointer = (e: WheelEvent): [number, number] => {
      const box = node.getBoundingClientRect();
      const scale = box.width / Math.max(1, node.offsetWidth) || 1;
      return [(e.clientX - box.left) / scale, (e.clientY - box.top) / scale];
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // The board's zoom, not the page's hidden behind it.
        e.stopPropagation();
        const [px, py] = pointer(e);
        const dy = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 40;
        window.clearTimeout(settle);
        if (Math.abs(dy) >= 40) {
          // A mouse wheel notch: one step.
          glideTo(stepZoom(goal.current.k, dy < 0 ? 1 : -1), px, py);
        } else {
          // A pinch: follow the fingers, then settle on the nearest step.
          stopGlide();
          const k = clamp(now.current.k * Math.exp(-dy * 0.01));
          goal.current = { k, px, py };
          setZoom(k);
          put(zoomAround(now.current, k, px, py));
          settle = window.setTimeout(() => glideTo(snapZoom(now.current.k), px, py), SETTLE);
        }
      } else {
        const { x, y, k } = now.current;
        const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
        put({ k, x: x + dx / k, y: y + dy / k });
      }
    };
    // ⌘=, ⌘− and ⌘0 zoom the board around its middle while it is on screen.
    const onKeys = (e: Event) => {
      e.preventDefault();
      const dir = (e as CustomEvent<number>).detail;
      glideTo(dir === 0 ? 1 : stepZoom(goal.current.k, dir > 0 ? 1 : -1), node.clientWidth / 2, node.clientHeight / 2);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener(BOARD_ZOOM, onKeys);
    return () => {
      watch.disconnect();
      window.clearTimeout(settle);
      node.removeEventListener('wheel', onWheel);
      window.removeEventListener(BOARD_ZOOM, onKeys);
    };
  }, [node]);

  useEffect(() => stopGlide, []);

  /** For the surface itself: a drag that starts on it, not on something lying on it, moves the view. */
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const from = { px: e.clientX, py: e.clientY, ...now.current };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add('panning');
    const move = (m: PointerEvent) => put({ k: now.current.k, x: from.x - (m.clientX - from.px) / from.k, y: from.y - (m.clientY - from.py) / from.k });
    const up = () => {
      el.classList.remove('panning');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** A point of the window as a point of the board. */
  const toBoard = (clientX: number, clientY: number): [number, number] => {
    const box = node?.getBoundingClientRect();
    const scale = box && node ? box.width / Math.max(1, node.offsetWidth) || 1 : 1;
    const { x, y, k } = now.current;
    return [x + (clientX - (box?.left ?? 0)) / scale / k, y + (clientY - (box?.top ?? 0)) / scale / k];
  };

  /** One 10% step in or out, around the middle of the board. */
  const zoomStep = (dir: 1 | -1) => glideTo(stepZoom(goal.current.k, dir), size[0] / 2, size[1] / 2);

  const fit = (box: [number, number, number, number] | null) => {
    if (box && size[0] > 0) jump(lookAt(box, size[0], size[1]));
  };

  return { look, setLook, size, ref, onPointerDown, toBoard, zoom, zoomStep, fit };
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
