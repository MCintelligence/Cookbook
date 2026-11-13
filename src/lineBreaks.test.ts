// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyLook, parseSettings } from './settings';
import { plateCss } from './plate/layout';
import { DEFAULT_PLATE } from './plate/settings';

describe('line breaks', () => {
  it('wraps words whole and fills each line, as Scrivener does, unless the writer says otherwise', () => {
    const s = parseSettings(null);
    expect(s.hyphenate).toBe(false);
    expect(s.balanceLines).toBe(false);
    const root = document.createElement('html');
    applyLook(s, root);
    expect(root.hasAttribute('data-hyphenate')).toBe(false);
    expect(root.hasAttribute('data-even-lines')).toBe(false);
    applyLook(parseSettings(JSON.stringify({ hyphenate: true, balanceLines: true })), root);
    expect(root.hasAttribute('data-hyphenate')).toBe(true);
    expect(root.hasAttribute('data-even-lines')).toBe(true);
  });

  it('never hyphenates a printed book or rebalances its lines, as Scrivener compiles by default', () => {
    const css = plateCss(DEFAULT_PLATE);
    expect(css).toContain('hyphens: manual');
    expect(css).not.toContain('text-wrap: pretty');
  });
});
