import { describe, expect, it } from 'vitest';
import { probeFonts } from './systemFonts';

describe('probeFonts', () => {
  // Pretends only Georgia and Menlo are installed: they draw wider than the fallbacks.
  const installed = ['Georgia', 'Menlo'];
  const measure = (_text: string, font: string) => (installed.some((f) => font.includes(`"${f}"`)) ? 120 : font.includes('monospace') ? 100 : 90);

  it('offers only the fonts that draw differently from the fallbacks', () => {
    expect(probeFonts(['Arial', 'Georgia', 'Menlo', 'Calibri'], measure)).toEqual(['Georgia', 'Menlo']);
  });

  it('finds nothing without a canvas', () => {
    expect(probeFonts(['Georgia'], null)).toEqual([]);
  });
});

describe('refreshSystemFonts', () => {
  it('does nothing before the fonts were first looked for', async () => {
    const { refreshSystemFonts } = await import('./systemFonts');
    await expect(refreshSystemFonts()).resolves.toBeUndefined();
  });

  it('compares lists name by name', async () => {
    const { sameNames } = await import('./systemFonts');
    expect(sameNames(['A', 'B'], ['A', 'B'])).toBe(true);
    expect(sameNames(['A', 'B'], ['A', 'C'])).toBe(false);
    expect(sameNames(['A'], ['A', 'B'])).toBe(false);
  });
});
