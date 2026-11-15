// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneSplash } from './PhoneSplash';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const ready = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  (window as unknown as { CookbookAndroid: object }).CookbookAndroid = { splashReady: ready, splashShift: () => 12 };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  delete (window as unknown as { CookbookAndroid?: object }).CookbookAndroid;
});

describe('the one splash', () => {
  it('starts the mark where Android left it, tells Android, and says when the logo has formed', () => {
    const shown = vi.fn();
    act(() => root.render(<PhoneSplash onShown={shown} />));
    const mark = host.querySelector<SVGElement>('.ps-mark')!;
    // Lower than the page's middle by half the word and gap, plus Android's shift; larger by Android's size over the logo's.
    expect(mark.style.getPropertyValue('--from')).toMatch(/^translateY\(32px\) scale\(3\.\d+\)$/);
    expect(host.querySelector('.ps-logo')!.classList.contains('go')).toBe(true);
    act(() => void vi.advanceTimersByTime(50));
    expect(ready).toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(900));
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('shows the finished logo without moving when it is shown again', () => {
    const shown = vi.fn();
    act(() => root.render(<PhoneSplash still onShown={shown} />));
    expect(host.querySelector('.ps-logo')!.classList.contains('still')).toBe(true);
    expect(host.querySelector<SVGElement>('.ps-mark')!.style.getPropertyValue('--from')).toBe('');
    expect(host.textContent).toContain('cookbook');
  });
});
