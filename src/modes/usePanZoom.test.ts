import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, lookAt, snapZoom, stepZoom } from './usePanZoom';

const pct = (k: number) => Math.round(k * 1000) / 10;

describe('board zoom', () => {
  it('goes from 50% to 200%, like the page', () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.5, 2]);
  });

  it('steps 10% at a time and comes back to the same levels', () => {
    let k = 1;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push(pct((k = stepZoom(k, 1))));
    expect(seen).toEqual([110, 120, 130, 140, 150]);
    for (let i = 0; i < 5; i++) k = stepZoom(k, -1);
    expect(k).toBe(1);
  });

  it('stops at the limits', () => {
    let k = 1;
    for (let i = 0; i < 40; i++) k = stepZoom(k, -1);
    expect(k).toBe(0.5);
    for (let i = 0; i < 40; i++) k = stepZoom(k, 1);
    expect(k).toBe(2);
  });

  it('from between two steps, goes to the next step on that side', () => {
    expect(pct(stepZoom(1.14, 1))).toBe(120);
    expect(pct(stepZoom(1.14, -1))).toBe(110);
    expect(pct(snapZoom(1.14))).toBe(110);
    expect(pct(snapZoom(0.31))).toBe(50);
    expect(pct(snapZoom(3))).toBe(200);
  });

  it('fits everything on a 10% step, never below 50%', () => {
    expect(pct(lookAt([0, 0, 1000, 500], 900, 700).k)).toBe(70);
    expect(lookAt([0, 0, 100, 100], 900, 700).k).toBe(1);
    expect(lookAt([0, 0, 20000, 20000], 900, 700).k).toBe(0.5);
  });
});
