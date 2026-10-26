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
