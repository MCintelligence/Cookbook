import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles.css', 'utf8');

/** Every rule for a selector, in source order, so later overrides count. */
function radiiOf(selector: string): string[] {
  const out: string[] = [];
  const re = /(^|\n)\s*([^{}\n]+)\{([^}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const sels = (m[2] ?? '').split(',').map((s) => s.trim());
    const radius = /border-radius:\s*([^;]+);/.exec(m[3] ?? '');
    if (radius && sels.includes(selector)) out.push((radius[1] ?? '').trim());
  }
  return out;
}

describe('corners', () => {
  // Everything that floats: menus, pop-ups, dialogs and toasts.
  const floating = ['.menu', '.tb-popover', '.insert-menu', '.palette', '.goals-pop', '.zoom-pop', '.status-pop', '.find-pop', '.peek', '.lib', '.notice', '.shelf', '.issue-card', '.recipes-peek', '.recipes-toast', '.plate-menu'];

  it.each(floating)('%s uses the shared pop-up corner', (selector) => {
    const radii = radiiOf(selector);
    expect(radii.length).toBeGreaterThan(0);
    // A sheet docked to the screen's edge may square off the corners that touch it.
    for (const r of radii) expect(r).toMatch(/^(var\(--radius-pop\)|0)( (var\(--radius-pop\)|0))*$/);
  });

  it('keeps the shared corners compact', () => {
    expect(css).toMatch(/--radius-pop:\s*8px;/);
    expect(css).toMatch(/--radius-row:\s*5px;/);
    expect(css).toMatch(/--radius-control:\s*6px;/);
  });
});
