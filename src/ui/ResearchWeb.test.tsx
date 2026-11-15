// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('./usePhone', () => ({ usePhone: () => true }));
const { ResearchWeb } = await import('./ResearchWeb');

let root: Root;
let host: HTMLElement;
const openWeb = vi.fn(() => true);
beforeEach(() => {
  (window as unknown as { CookbookAndroid: object }).CookbookAndroid = { openWeb };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { CookbookAndroid?: object }).CookbookAndroid;
});

describe('a web page in a Research note, on a phone', () => {
  it('shows what the page is, with no frame, and opens it in Android’s in-app browser', () => {
    act(() => root.render(<ResearchWeb url="https://www.example.com/guide/knots?x=1" onAddSaved={() => {}} onForget={() => {}} />));
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('.phone-web-host')!.textContent).toBe('example.com');
    expect(host.querySelector('.phone-web-path')!.textContent).toBe('/guide/knots?x=1');
    act(() => host.querySelector<HTMLButtonElement>('.phone-web-read')!.click());
    expect(openWeb).toHaveBeenCalledWith('https://www.example.com/guide/knots?x=1');
  });
});
