// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageFrame, scaledPage } from './PageFrame';
import { zoomOf } from './zoom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let resized: (() => void)[] = [];
beforeEach(() => {
  resized = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: () => void) {}
      observe() {
        resized.push(this.cb);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the page at its zoom', () => {
  // The Mac's engine measures text inside CSS zoom as if unzoomed but finds what is under
  // the pointer with the zoom, so the page is scaled with a transform instead.
  it.each([0.5, 0.75, 1.1, 1.5, 2])('is scaled with a transform, never CSS zoom, at %s', (scale) => {
    const style = scaledPage(scale, { padding: 96 });
    expect(style).not.toHaveProperty('zoom');
    expect(style.transform).toBe(`scale(${scale})`);
    expect(style.transformOrigin).toBe('0 0');
    expect(style.width).toBe(`calc(100% / ${scale})`);
    expect(style.padding).toBe(96);
  });

  it('has no transform at 100%', () => {
    expect(scaledPage(1, {}).transform).toBeUndefined();
  });

  it('takes up the room it shows at, as tall as the page grows', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    let tall = 1056;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => tall);
    act(() =>
      root.render(
        <PageFrame scale={1.1} style={{ width: 897.6 }}>
          <article className="cb-page" style={scaledPage(1.1, {})} />
        </PageFrame>,
      ),
    );
    const frame = host.querySelector<HTMLElement>('.page-frame')!;
    expect(frame.style.width).toBe('897.6px');
    expect(parseFloat(frame.style.height)).toBeCloseTo(1161.6);
    tall = 2000;
    act(() => resized.forEach((f) => f()));
    expect(parseFloat(frame.style.height)).toBeCloseTo(2200);
  });

  it('counts the transform when placing things inside the page', () => {
    const page = document.createElement('article');
    page.style.transform = 'scale(1.1)';
    const inside = document.createElement('div');
    page.append(inside);
    document.body.append(page);
    expect(zoomOf(inside)).toBeCloseTo(1.1);
  });
});
