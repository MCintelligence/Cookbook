// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyLook, parseSettings } from './settings';
import { plateCss } from './plate/layout';
import { DEFAULT_PLATE } from './plate/settings';

describe('line breaks', () => {
  it('wraps words whole and evens out line endings unless the writer says otherwise', () => {
    const s = parseSettings(null);
    expect(s.hyphenate).toBe(false);
    expect(s.evenLines).toBe(true);
    const root = document.createElement('html');
    applyLook(s, root);
    expect(root.hasAttribute('data-hyphenate')).toBe(false);
    expect(root.hasAttribute('data-even-lines')).toBe(true);
    applyLook(parseSettings(JSON.stringify({ hyphenate: true, evenLines: false })), root);
    expect(root.hasAttribute('data-hyphenate')).toBe(true);
    expect(root.hasAttribute('data-even-lines')).toBe(false);
  });

  it('never hyphenates a printed book with fewer than 3 letters on either side', () => {
    const css = plateCss(DEFAULT_PLATE);
    expect(css).toContain('hyphenate-limit-chars: 7 3 3');
    expect(css).toContain('text-wrap: pretty');
  });
});
