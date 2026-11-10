import { describe, expect, it } from 'vitest';
import { SWATCHES, contrast, swatchesFor } from './ColourWheel';

describe('colour swatches', () => {
  it('every swatch reads well on each theme page and on a custom one', () => {
    for (const paper of ['#fdfdfc', '#efe6d6', '#ffffff', '#f3e3c3', '#1e1e1e', '#2b3a4a']) {
      for (const s of swatchesFor(paper)) expect(contrast(s.hex, paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves a swatch alone when it already reads well', () => {
    const black = swatchesFor('#ffffff').find((s) => s.name === 'Black')!;
    expect(black.hex).toBe('#000000');
    expect(swatchesFor('#ffffff')).toHaveLength(SWATCHES.length);
  });

  it('lightens dark inks on a dark page', () => {
    const navy = swatchesFor('#1e1e1e').find((s) => s.name === 'Navy')!;
    expect(navy.hex).not.toBe('#1f3a8a');
  });
});
