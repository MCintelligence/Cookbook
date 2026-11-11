// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchTouchDrag } from './touchDrag';

/** A finger, as the browser reports one. */
const finger = (type: string, x: number, y: number) => Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1, pointerType: 'touch', isPrimary: true });

describe('dragging by finger', () => {
  let card: HTMLElement;
  let day: HTMLElement;
  let seen: string[];
  let under: Element | null;

  beforeAll(() => {
    // jsdom has neither; what matters here is what is sent to whom, and in what order.
    class Data {
      private kept = new Map<string, string>();
      get types() {
        return [...this.kept.keys()];
      }
      setData(k: string, v: string) {
        this.kept.set(k, v);
      }
      getData(k: string) {
        return this.kept.get(k) ?? '';
      }
    }
    class Drag extends MouseEvent {
      dataTransfer: unknown;
      constructor(type: string, init: MouseEventInit & { dataTransfer?: unknown }) {
        super(type, init);
        this.dataTransfer = init.dataTransfer;
      }
    }
    vi.stubGlobal('DataTransfer', Data);
    vi.stubGlobal('DragEvent', Drag);
    document.elementFromPoint = () => under;
    watchTouchDrag();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="card" draggable="true">A card</div><div id="day"></div>';
    card = document.getElementById('card')!;
    day = document.getElementById('day')!;
    seen = [];
    under = day;
    card.addEventListener('dragstart', (e) => (e as DragEvent).dataTransfer!.setData('x-card', 'one'));
    day.addEventListener('dragover', (e) => (e as DragEvent).dataTransfer!.types.includes('x-card') && e.preventDefault());
    day.addEventListener('drop', (e) => seen.push(`drop ${(e as DragEvent).dataTransfer!.getData('x-card')}`));
    card.addEventListener('contextmenu', () => seen.push('menu'));
  });
  afterEach(() => {
    window.dispatchEvent(finger('pointercancel', 0, 0));
    vi.useRealTimers();
  });

  it('lifts after a hold, carries, and drops where the place takes it', () => {
    card.dispatchEvent(finger('pointerdown', 10, 10));
    vi.advanceTimersByTime(320);
    expect(document.querySelector('.touch-ghost')).not.toBeNull();
    expect(card.dataset.touchLifted).toBe('');
    window.dispatchEvent(finger('pointermove', 60, 200));
    window.dispatchEvent(finger('pointerup', 60, 200));
    expect(seen).toEqual(['drop one']);
    expect(document.querySelector('.touch-ghost')).toBeNull();
    expect(card.dataset.touchLifted).toBeUndefined();
  });

  it('leaves a swipe to the page: moving before the lift carries nothing', () => {
    card.dispatchEvent(finger('pointerdown', 10, 10));
    window.dispatchEvent(finger('pointermove', 10, 80));
    vi.advanceTimersByTime(400);
    window.dispatchEvent(finger('pointerup', 10, 80));
    expect(document.querySelector('.touch-ghost')).toBeNull();
    expect(seen).toEqual([]);
  });

  it('held and let go where it was, opens what a right-click would', () => {
    card.dispatchEvent(finger('pointerdown', 10, 10));
    vi.advanceTimersByTime(320);
    window.dispatchEvent(finger('pointerup', 10, 10));
    expect(seen).toEqual(['menu']);
  });

  it('drops nothing where nothing takes it', () => {
    under = document.body;
    card.dispatchEvent(finger('pointerdown', 10, 10));
    vi.advanceTimersByTime(320);
    window.dispatchEvent(finger('pointermove', 60, 200));
    window.dispatchEvent(finger('pointerup', 60, 200));
    expect(seen).toEqual([]);
  });

  it('leaves a mouse alone', () => {
    card.dispatchEvent(Object.assign(finger('pointerdown', 10, 10), { pointerType: 'mouse' }));
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.touch-ghost')).toBeNull();
  });
});
