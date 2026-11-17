// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setZoom = vi.fn(() => Promise.resolve());
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ setZoom }) }));

import { applyLook, parseSettings, windowZoom } from './settings';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('interface size', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    setZoom.mockClear();
  });

  it('zooms the desktop window itself, never with CSS zoom, so the Mac hit-tests where it measures', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const root = document.createElement('html');
    applyLook(parseSettings(JSON.stringify({ size: 'large' })), root);
    expect(root.dataset.uiZoom).toBe('window');
    await settle();
    expect(setZoom).toHaveBeenLastCalledWith(1.12);
    applyLook(parseSettings(JSON.stringify({ size: 'small' })), root);
    await settle();
    expect(setZoom).toHaveBeenLastCalledWith(0.9);
  });

  it('keeps CSS zoom in a plain browser', () => {
    const root = document.createElement('html');
    applyLook(parseSettings(JSON.stringify({ size: 'large' })), root);
    expect(root.dataset.uiZoom).toBeUndefined();
    expect(windowZoom(root)).toBe(1);
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('goes back to CSS zoom if the window cannot be zoomed', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    setZoom.mockImplementationOnce(() => Promise.reject(new Error('not allowed')));
    const root = document.createElement('html');
    applyLook(parseSettings(JSON.stringify({ size: 'large' })), root);
    await settle();
    await settle();
    expect(root.dataset.uiZoom).toBeUndefined();
  });

  it('turns the stylesheet zoom off whenever the window does the zooming, without outranking the phone', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const rules = css.match(/^[^{}\n]*\{[^}]*\bzoom:\s*[\d.]+[^}]*\}/gm) ?? [];
    const sized = rules.filter((r) => r.includes('data-size'));
    expect(sized.length).toBeGreaterThan(0);
    for (const r of sized) expect(r).toContain(":not(:where([data-ui-zoom='window']))");
    expect(readFileSync('src-tauri/capabilities/desktop.json', 'utf8')).toContain('core:webview:allow-set-webview-zoom');
  });
});
