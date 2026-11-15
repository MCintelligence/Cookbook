// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromTouch, goBack, onBack } from './mobile';

/** jsdom lays nothing out, so anything in the page counts as showing. */
const shown = () => vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Back', () => {
  it('closes what floats over the app first, as Escape would, and the newest of them first', () => {
    shown();
    document.body.innerHTML = '<div class="settings" role="dialog"></div><ul class="menu"></ul>';
    const heard: string[] = [];
    document.querySelector('.settings')!.addEventListener('keydown', (e) => heard.push(`settings:${(e as KeyboardEvent).key}`));
    document.querySelector('.menu')!.addEventListener('keydown', (e) => heard.push(`menu:${(e as KeyboardEvent).key}`));
    const app = vi.fn(() => true);
    const stop = onBack(app);
    expect(goBack()).toBe(true);
    expect(heard).toEqual(['menu:Escape']);
    expect(app).not.toHaveBeenCalled();
    stop();
  });

  it('sends Escape from where the keyboard is when that is inside the thing being closed', () => {
    shown();
    document.body.innerHTML = '<div class="palette" role="dialog"><input /></div>';
    const input = document.querySelector('input')!;
    input.focus();
    const heard = vi.fn();
    input.addEventListener('keydown', heard);
    expect(goBack()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('then asks the app, newest first, and says when there was nothing to close', () => {
    const order: string[] = [];
    const stopA = onBack(() => (order.push('a'), false));
    const stopB = onBack(() => (order.push('b'), false));
    expect(goBack()).toBe(false);
    expect(order).toEqual(['b', 'a']);
    stopB();
    const stopC = onBack(() => true);
    order.length = 0;
    expect(goBack()).toBe(true);
    expect(order).toEqual([]);
    stopA();
    stopC();
    expect(goBack()).toBe(false);
  });

  it('leaves alone what is in the page but not showing', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(goBack()).toBe(false);
  });
});

describe('fromTouch', () => {
  it('knows a long press from a right-click by what made it', () => {
    expect(fromTouch({ pointerType: 'touch' } as unknown as Event)).toBe(true);
    expect(fromTouch({ nativeEvent: { pointerType: 'pen' } as unknown as Event })).toBe(true);
    expect(fromTouch({ nativeEvent: { pointerType: 'mouse' } as unknown as Event })).toBe(false);
  });
});
