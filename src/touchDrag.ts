import { haptic, swallowClick } from './mobile';

/**
 * Dragging by finger for everything built on the browser's own drag and drop.
 *
 * Cards on the Grid board, rows of the Outline, chips on the Calendar and tabs of the Plate are all
 * `draggable`, which a mouse can drag and a finger, in Android's WebView, cannot. This gives a
 * finger the same thing the way a phone does it: press and hold to lift (with a tap felt in the
 * hand), carry, and let go to set down. It speaks to those components in their own language,
 * `dragstart`, `dragover` and `drop` events carrying a DataTransfer, so none of them knows the
 * difference and anything made draggable later works by touch too.
 *
 * A quick swipe still scrolls; held and let go without moving opens what a right-click would.
 * Rows of the Shelf and cards on the free board carry themselves (Tree.tsx, usePanZoom.ts).
 */

/** How long a finger rests before the thing under it lifts. */
const LIFT_MS = 300;
/** How far a finger can wander and still be resting, in screen pixels. */
const SLOP = 8;
/** How close to the edge of a scrolling area a carried thing makes it scroll. */
const EDGE = 56;

const event = (type: string, data: DataTransfer, x: number, y: number) => new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: data, clientX: x, clientY: y });

/** The nearest thing above `el` that scrolls up and down, or (`across`) side to side. */
function scrollerOf(el: Element | null, across: boolean): HTMLElement | null {
  for (let at = el as HTMLElement | null; at && at !== document.body; at = at.parentElement) {
    const room = across ? at.scrollWidth > at.clientWidth + 1 : at.scrollHeight > at.clientHeight + 1;
    if (room && /auto|scroll/.test(getComputedStyle(at)[across ? 'overflowX' : 'overflowY'])) return at;
  }
  return null;
}

export function watchTouchDrag(): void {
  if (typeof window === 'undefined' || typeof DataTransfer === 'undefined' || typeof DragEvent === 'undefined') return;
  /** Set while a finger is down on something draggable, so the system's own long press (a menu, a drag of its own) stays out of it. */
  let pressing = false;

  window.addEventListener(
    'pointerdown',
    (down) => {
      if (down.pointerType !== 'touch' || !down.isPrimary) return;
      const source = (down.target as Element | null)?.closest<HTMLElement>('[draggable="true"]');
      // Words being typed in a card are picked the usual way.
      if (!source || (down.target as Element).closest('input, textarea, [contenteditable="true"]')) return;
      pressing = true;
      const [x0, y0] = [down.clientX, down.clientY];
      let last: [number, number] = [x0, y0];
      let data: DataTransfer | null = null;
      let ghost: HTMLElement | null = null;
      let over: Element | null = null;
      let accepted = false;
      let moved = false;
      let frame = 0;

      const lift = () => {
        const carried = new DataTransfer();
        if (!source.isConnected || !source.dispatchEvent(event('dragstart', carried, x0, y0))) return finish();
        data = carried;
        haptic('lift');
        const box = source.getBoundingClientRect();
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute('id');
        ghost.classList.add('touch-ghost');
        // Laid out at the size it had, then drawn at the finger; the page's own zoom is already in the clone's styles.
        Object.assign(ghost.style, { position: 'fixed', zIndex: '1000', pointerEvents: 'none', width: `${source.offsetWidth}px`, height: `${source.offsetHeight}px`, left: '0', top: '0', margin: '0' });
        ghost.dataset.dx = String(box.left - x0);
        ghost.dataset.dy = String(box.top - y0);
        // Beside the thing itself, so it is drawn by the same rules; fixed, so it leaves the flow and nothing scrolls it.
        (source.parentElement ?? document.body).append(ghost);
        place(x0, y0);
        // An attribute and not a class: the class is React's to rewrite.
        source.dataset.touchLifted = '';
        frame = requestAnimationFrame(edge);
      };
      const timer = window.setTimeout(lift, LIFT_MS);

      const place = (x: number, y: number) => {
        if (!ghost) return;
        // A zoomed page (the interface is larger on a phone) scales the clone too, so its place is given in the page's own pixels.
        const zoom = ghost.getBoundingClientRect().width / Math.max(1, ghost.offsetWidth) || 1;
        ghost.style.transform = `translate(${(x + Number(ghost.dataset.dx)) / zoom}px, ${(y + Number(ghost.dataset.dy)) / zoom}px) scale(1.04)`;
      };
      const hover = (x: number, y: number) => {
        if (!data) return;
        const target = document.elementFromPoint(x, y);
        if (target !== over) {
          over?.dispatchEvent(event('dragleave', data, x, y));
          target?.dispatchEvent(event('dragenter', data, x, y));
          over = target;
        }
        // A place that will take it says so by cancelling dragover, as it would for a mouse.
        const takes = !!target && !target.dispatchEvent(event('dragover', data, x, y));
        if (takes && !accepted) haptic('tick');
        accepted = takes;
      };
      // Near an edge of what scrolls under the finger, it scrolls that way, and the place under the finger is asked again.
      const edge = () => {
        if (data && moved) {
          const [x, y] = last;
          const down = scrollerOf(over, false)?.getBoundingClientRect();
          const side = scrollerOf(over, true)?.getBoundingClientRect();
          const dy = down ? (y < down.top + EDGE ? -10 : y > down.bottom - EDGE ? 10 : 0) : 0;
          const dx = side ? (x < side.left + EDGE ? -10 : x > side.right - EDGE ? 10 : 0) : 0;
          if (dy) scrollerOf(over, false)!.scrollBy(0, dy);
          if (dx) scrollerOf(over, true)!.scrollBy(dx, 0);
          if (dx || dy) hover(x, y);
        }
        frame = requestAnimationFrame(edge);
      };

      const move = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        const far = Math.hypot(e.clientX - x0, e.clientY - y0) >= SLOP;
        // Moving before it lifts is a scroll, which the page does itself.
        if (!data) return far ? finish() : undefined;
        if (far) moved = true;
        last = [e.clientX, e.clientY];
        place(e.clientX, e.clientY);
        hover(e.clientX, e.clientY);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        const carried = data;
        const target = over;
        const took = accepted && moved;
        finish();
        if (!carried) return;
        // The tap the system makes of a finger coming up is not one: nothing was tapped, something was carried.
        swallowClick();
        if (took && target) {
          target.dispatchEvent(event('drop', carried, e.clientX, e.clientY));
          haptic('drop');
        }
        source.dispatchEvent(event('dragend', carried, e.clientX, e.clientY));
        // Held and let go where it was: what a right-click does there.
        if (!moved) source.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
      };
      const cancel = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        const carried = data;
        finish();
        if (carried) source.dispatchEvent(event('dragend', carried, last[0], last[1]));
      };
      // Once lifted, the finger carries; the page under it must not scroll.
      const still = (e: TouchEvent) => data && e.cancelable && e.preventDefault();
      const finish = () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', cancel, true);
        window.removeEventListener('touchmove', still);
        if (data && over) over.dispatchEvent(event('dragleave', data, last[0], last[1]));
        ghost?.remove();
        delete source.dataset.touchLifted;
        data = null;
        // The system's long press may still be on its way; it is let through again a moment later.
        window.setTimeout(() => (pressing = false), 50);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', cancel, true);
      window.addEventListener('touchmove', still, { passive: false });
    },
    true,
  );

  // While a finger rests on something draggable, Android's own long press (its menu, or a drag of its own) is this file's to answer.
  const mine = (e: Event) => {
    if (!pressing || !e.isTrusted) return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('contextmenu', mine, true);
  window.addEventListener('dragstart', mine, true);
}
