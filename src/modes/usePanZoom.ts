import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptic, swallowClick } from '../mobile';
import { BOARD_ZOOM } from './boardZoom';

/** How much the interface size (and a phone's larger interface) scales `el`: screen pixels per CSS pixel. */
export function scaleOf(el: Element | null): number {
  if (!el || !(el instanceof HTMLElement)) return 1;
  return el.getBoundingClientRect().width / Math.max(1, el.offsetWidth) || 1;
}

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
/** How long the board must be still before the cards are told where it went (for which of them to draw). */
const REST = 120;

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
 *
 * On a touch screen one finger on the bare surface moves it and two fingers, wherever they
 * land, pinch and move it together; `pinching` tells the cards to let go while they do.
 *
 * Moving and zooming never draw the board again: nothing on it changes, only where it is seen
 * from. Each frame writes the surface's grid and the layer's transform straight to the page
 * (`layer` takes the layer), and the cards hear where the board went once it has been still
 * for REST (`look` and `zoom`), which is when the ones that came into sight are drawn. Anything
 * that needs where the board is at this very moment asks `live()`.
 */
export function usePanZoom(start: Look = { x: -40, y: -40, k: 1 }) {
  const [look, setLook] = useState<Look>(start);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  // The surface, as state: the free board can appear long after the view does (Grid to Free).
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  // Where the board is now, which runs ahead of `look` while it moves.
  const now = useRef(look);
  const surface = useRef<HTMLDivElement | null>(null);
  const layered = useRef<HTMLElement | null>(null);
  const rest = useRef(0);
  /** Draws the board where it is now: two styles on the surface and one on the layer, and nothing else. */
  const paint = () => {
    const { x, y, k } = now.current;
    const s = surface.current;
    if (s) {
      s.style.backgroundPosition = `${-x * k}px ${-y * k}px`;
      s.style.backgroundSize = `${28 * k}px ${28 * k}px`;
      s.style.setProperty('--k', String(k));
    }
    if (layered.current) layered.current.style.transform = `scale(${k}) translate(${-x}px, ${-y}px)`;
  };
  /** How many fingers or pointers are moving the board, or carrying something on it: the cards hear nothing until they all let go. */
  const holds = useRef(0);
  // Once the board is still, the cards are told where it is.
  const settled = () => {
    if (holds.current > 0) return;
    setLook(now.current);
    setZoom(goal.current.k);
  };
  // Several wheel turns can come in one frame, so each one starts from the last, not from the last render.
  const put = (to: Look) => {
    now.current = to;
    paint();
    window.clearTimeout(rest.current);
    rest.current = window.setTimeout(settled, REST);
  };
  // Where the zoom is heading, and the point it zooms around.
  const goal = useRef({ k: start.k, px: 0, py: 0 });
  const [zoom, setZoom] = useState(start.k);
  const glide = useRef<{ from: Look; t0: number; frame: number } | null>(null);
  /** True while two fingers are on the board: a card a finger is resting on stays where it is. */
  const pinching = useRef(false);

  const stopGlide = () => {
    if (glide.current) cancelAnimationFrame(glide.current.frame);
    glide.current = null;
  };

  /** Glides from where the board is now to the goal zoom. */
  const glideTo = (k: number, px: number, py: number) => {
    goal.current = { k, px, py };
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
    put(to);
  };

  const ref = useCallback((n: HTMLDivElement | null) => {
    surface.current = n;
    setNode(n);
    if (n) {
      setSize([n.clientWidth, n.clientHeight]);
      paint();
    }
  }, []);
  /** For the layer the cards lie on: the hook moves and scales it. */
  const layer = useCallback((n: HTMLElement | null) => {
    layered.current = n;
    if (n) paint();
  }, []);
  useLayoutEffect(paint, [node]);
  useEffect(() => () => window.clearTimeout(rest.current), []);

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
    // Fingers on the board, wherever they landed (on the surface or on a card), for the pinch.
    const fingers = new Map<number, [number, number]>();
    let pinch: { d: number; mx: number; my: number; look: Look; scale: number } | null = null;
    const spread = () => {
      const [a, b] = [...fingers.values()];
      return { d: Math.hypot(a![0] - b![0], a![1] - b![1]), mx: (a![0] + b![0]) / 2, my: (a![1] + b![1]) / 2 };
    };
    const onFingerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (fingers.size === 2) {
        stopGlide();
        window.clearTimeout(settle);
        pinching.current = true;
        hold(true);
        const box = node.getBoundingClientRect();
        const scale = scaleOf(node);
        const { d, mx, my } = spread();
        pinch = { d: Math.max(1, d), mx: (mx - box.left) / scale, my: (my - box.top) / scale, look: now.current, scale };
      }
    };
    const onFingerMove = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (!pinch || fingers.size < 2) return;
      const box = node.getBoundingClientRect();
      const { d, mx, my } = spread();
      const px = (mx - box.left) / pinch.scale;
      const py = (my - box.top) / pinch.scale;
      // Zoom around where the fingers started, then carry the board along as they move together.
      const k = clamp(pinch.look.k * (d / pinch.d));
      const zoomed = zoomAround(pinch.look, k, pinch.mx, pinch.my);
      goal.current = { k, px, py };
      put({ k, x: zoomed.x - (px - pinch.mx) / k, y: zoomed.y - (py - pinch.my) / k });
    };
    const onFingerUp = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      if (pinch && fingers.size < 2) {
        const { px, py } = goal.current;
        pinch = null;
        hold(false);
        glideTo(snapZoom(now.current.k), px, py);
      }
      if (fingers.size === 0) pinching.current = false;
    };
    node.addEventListener('pointerdown', onFingerDown, true);
    window.addEventListener('pointermove', onFingerMove, true);
    window.addEventListener('pointerup', onFingerUp, true);
    window.addEventListener('pointercancel', onFingerUp, true);
    node.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener(BOARD_ZOOM, onKeys);
    return () => {
      watch.disconnect();
      window.clearTimeout(settle);
      node.removeEventListener('pointerdown', onFingerDown, true);
      window.removeEventListener('pointermove', onFingerMove, true);
      window.removeEventListener('pointerup', onFingerUp, true);
      window.removeEventListener('pointercancel', onFingerUp, true);
      node.removeEventListener('wheel', onWheel);
      window.removeEventListener(BOARD_ZOOM, onKeys);
    };
  }, [node]);

  useEffect(() => stopGlide, []);

  /** For the surface itself: a drag that starts on it, not on something lying on it, moves the view. */
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    panFrom(e.nativeEvent, e.currentTarget);
  };

  /** Moves the board with a pointer from where it went down, until it comes up; a second finger hands over to the pinch. */
  const panFrom = (e: PointerEvent, el: HTMLElement) => {
    // Step by step from the last point, so a pinch in the middle of a pan doesn't make the board jump.
    let last = [e.clientX, e.clientY];
    const scale = scaleOf(el);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone.
    }
    el.classList.add('panning');
    hold(true);
    const move = (m: PointerEvent) => {
      if (m.pointerId !== e.pointerId) return;
      const [lx, ly] = last;
      last = [m.clientX, m.clientY];
      if (pinching.current) return;
      const { x, y, k } = now.current;
      put({ k, x: x - (m.clientX - lx!) / scale / k, y: y - (m.clientY - ly!) / scale / k });
    };
    const up = (u: PointerEvent) => {
      if (u.pointerId !== e.pointerId) return;
      hold(false);
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

  /** Moves the board by this many screen pixels, as when a dragged card nears an edge. */
  const nudge = (dx: number, dy: number) => {
    const { x, y, k } = now.current;
    const scale = scaleOf(node);
    put({ k, x: x + dx / scale / k, y: y + dy / scale / k });
  };

  /** Holds back the cards' news of where the board is (`true`) while something is still moving it, and lets it go (`false`). */
  const hold = (on: boolean) => {
    holds.current = Math.max(0, holds.current + (on ? 1 : -1));
    if (!on) {
      window.clearTimeout(rest.current);
      rest.current = window.setTimeout(settled, REST);
    }
  };
  /** Where the board is at this moment, which `look` only catches up with once it is still. */
  const live = () => now.current;

  return { look, setLook: jump, live, hold, size, ref, layer, onPointerDown, panFrom, pinching, nudge, toBoard, zoom, zoomStep, fit, node };
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

/** How long a finger rests on a card before it lifts, as on the Shelf. */
const LIFT_MS = 300;
/** How far a finger can wander before it counts as a move, in screen pixels. */
const SLOP = 8;
/** How close to an edge a carried card makes the board move along, in screen pixels. */
const EDGE = 48;

interface Carry {
  /** The card is lifted (true) or set down (false): it grows and casts a deeper shadow while held. */
  onLift(lifted: boolean): void;
  /** Where the card is while carried, on the board, or null when it goes back. */
  onMove(spot: [number, number] | null): void;
  onDrop(spot: [number, number]): void;
  /** Held and let go without moving: the card's menu, at the finger. */
  onMenu(x: number, y: number): void;
  onTap(): void;
}

/**
 * A finger on a card lying on an endless board (a free board, the atlas), the way a phone's home
 * screen handles icons: moving at once moves the board under it; resting LIFT_MS lifts the card,
 * with a tap felt in the hand, to be carried (the board moves along when it nears an edge) and
 * set down with another; held and let go without moving opens its menu; a quick tap is a tap.
 * A second finger turns the whole thing into a pinch and the card stays where it was.
 */
export function carryByTouch(e: ReactPointerEvent<HTMLElement>, pan: ReturnType<typeof usePanZoom>, from: [number, number], on: Carry): void {
  const board = pan.node;
  if (!board) return;
  const id = e.pointerId;
  const [x0, y0] = [e.clientX, e.clientY];
  let state: 'press' | 'lift' | 'carry' | 'done' = 'press';
  let at: [number, number] = [from[0], from[1]];
  let last: [number, number] = [x0, y0];
  let edge = 0;
  let carrying = false;
  const per = () => scaleOf(board) * pan.live().k;

  const finish = () => {
    if (carrying) pan.hold(false);
    carrying = false;
    window.clearTimeout(timer);
    cancelAnimationFrame(edge);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    on.onLift(false);
  };
  const timer = window.setTimeout(() => {
    if (state !== 'press' || pan.pinching.current) return;
    state = 'lift';
    haptic('lift');
    on.onLift(true);
  }, LIFT_MS);
  const follow = () => {
    const box = board.getBoundingClientRect();
    const dx = last[0] < box.left + EDGE ? -1 : last[0] > box.right - EDGE ? 1 : 0;
    const dy = last[1] < box.top + EDGE ? -1 : last[1] > box.bottom - EDGE ? 1 : 0;
    if (dx || dy) {
      pan.nudge(dx * 10, dy * 10);
      const s = per();
      at = [at[0] + (dx * 10) / s, at[1] + (dy * 10) / s];
      on.onMove([Math.round(at[0]), Math.round(at[1])]);
    }
    edge = requestAnimationFrame(follow);
  };
  const move = (m: PointerEvent) => {
    if (m.pointerId !== id) return;
    if (pan.pinching.current) {
      state = 'done';
      finish();
      return on.onMove(null);
    }
    const far = Math.hypot(m.clientX - x0, m.clientY - y0) >= SLOP;
    if (state === 'press' && far) {
      state = 'done';
      finish();
      // The board catches up with the finger, slop and all, then follows it.
      pan.nudge(x0 - m.clientX, y0 - m.clientY);
      return pan.panFrom(m, board);
    }
    if (state === 'lift' && far) {
      state = 'carry';
      carrying = true;
      pan.hold(true);
      edge = requestAnimationFrame(follow);
    }
    if (state !== 'carry') return;
    const s = per();
    at = [at[0] + (m.clientX - last[0]) / s, at[1] + (m.clientY - last[1]) / s];
    last = [m.clientX, m.clientY];
    on.onMove([Math.round(at[0]), Math.round(at[1])]);
  };
  const up = (u: PointerEvent) => {
    if (u.pointerId !== id) return;
    const was = state;
    state = 'done';
    finish();
    if (was === 'carry' || was === 'lift') swallowClick();
    if (was === 'carry') {
      haptic('drop');
      on.onDrop([Math.round(at[0]), Math.round(at[1])]);
    } else if (was === 'lift') on.onMenu(u.clientX, u.clientY);
    else if (was === 'press') on.onTap();
  };
  const cancel = (c: PointerEvent) => {
    if (c.pointerId !== id) return;
    state = 'done';
    finish();
    on.onMove(null);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}
