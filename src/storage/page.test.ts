import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, zoomStep } from './page';

describe('zoomStep', () => {
  it('reaches the same limits as the zoom pop-up', () => {
    let z = 100;
    for (let i = 0; i < 20; i++) z = zoomStep(z, -1);
    expect(z).toBe(MIN_ZOOM);
    for (let i = 0; i < 30; i++) z = zoomStep(z, 1);
    expect(z).toBe(MAX_ZOOM);
  });
  it('lands back on the 10% steps from a zoom between them', () => {
    expect(zoomStep(87, 1)).toBe(90);
    expect(zoomStep(87, -1)).toBe(80);
    expect(zoomStep(90, 1)).toBe(100);
  });
});
