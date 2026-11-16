import { describe, expect, it } from 'vitest';
import { dayNumber } from '../storage/storyDate';
import { FOLD_W, backSteps, fitPx, placeLane, sayStretch, stretchMarks, timeScale } from './plots';

const day = (y: number, m: number, d: number) => dayNumber({ y, m, d });

describe('the time Plots runs along', () => {
  const spans: [number, number][] = [
    [day(1924, 5, 10), day(1924, 5, 13)],
    [day(1954, 9, 1), day(1954, 9, 4)],
    [day(1954, 9, 14), day(1954, 9, 16)],
  ];

  it('folds a long empty stretch to a mark and leaves a short one alone', () => {
    const scale = timeScale(spans, 18, true, [0, 30]);
    const folds = scale.stretches.filter((s) => s.folded);
    expect(folds).toHaveLength(1);
    expect(folds[0]!.w).toBe(FOLD_W);
    // Thirty years, less the couple of days kept clear each side of the fold.
    expect(sayStretch(folds[0]!.d1 - folds[0]!.d0)).toBe('30 years');
    // The ten days in September are not worth folding.
    expect(scale.xOf(day(1954, 9, 14)) - scale.xOf(day(1954, 9, 4))).toBe(180);
    expect(scale.width).toBeLessThan(1200);
  });

  it('gives every day the same room to scale', () => {
    const scale = timeScale(spans, 2, false, [0, 30]);
    expect(scale.stretches).toHaveLength(1);
    expect(scale.xOf(day(1954, 9, 1)) - scale.xOf(day(1924, 5, 10))).toBe((day(1954, 9, 1) - day(1924, 5, 10)) * 2);
  });

  it('finds the day at a point, and the point of a day, the same way round', () => {
    for (const fold of [true, false]) {
      const scale = timeScale(spans, 18, fold, [0, 30]);
      for (const [a, b] of spans) for (const n of [a, b, a - 2, b + 1]) expect(Math.floor(scale.dayAt(scale.xOf(n) + 1))).toBe(n);
      // Inside a fold, and off either end, a point still has a day, and days still run forwards.
      let last = -Infinity;
      for (let x = -200; x < scale.width + 200; x += 7) {
        const n = scale.dayAt(x);
        expect(n).toBeGreaterThan(last);
        last = n;
      }
    }
  });

  it('shows the blank month when nothing is dated', () => {
    const scale = timeScale([], 18, true, [day(2026, 11, 1), day(2026, 11, 30)]);
    expect(scale.width).toBe(30 * 18);
    expect(Math.floor(scale.dayAt(0))).toBe(day(2026, 11, 1));
  });

  it('fits everything in the room there is', () => {
    for (const fold of [true, false]) {
      const px = fitPx(spans, fold, 1000, 0.05, 96);
      const { width } = timeScale(spans, px, fold, [0, 30]);
      expect(width).toBeLessThanOrEqual(1010);
      expect(width).toBeGreaterThan(900);
    }
  });

  it('names a stretch that begins partway through a month at its start, unless the next name would crowd it', () => {
    const scale = timeScale(spans, 18, true, [0, 30]);
    const [first, second] = scale.stretches.filter((s) => !s.folded);
    // May 1924 is named where the sheet begins, some days into the month.
    const may = stretchMarks(scale, first!, 18, 0, scale.width).majors;
    expect(may[0]).toMatchObject({ text: 'May 1924', x: 0 });
    // After the fold come two days of August and then September: only September is named.
    const sep = stretchMarks(scale, second!, 18, 0, scale.width).majors;
    expect(sep.map((m) => m.text)).toEqual(['September 1954']);
    expect(sep[0]!.x).toBe(scale.xOf(day(1954, 9, 1)));
  });
});

describe('what Plots says and counts', () => {
  it('says how long a fold is in round words', () => {
    expect([1, 9, 21, 45, 240, 800, 10958].map(sayStretch)).toEqual(['1 day', '9 days', '3 weeks', '6 weeks', '8 months', '2 years', '30 years']);
  });

  it('counts the steps the telling takes back in time', () => {
    expect(backSteps([1, 2, -30, 3, 4, -29, 5])).toBe(2);
    expect(backSteps([1, 1, 2])).toBe(0);
    expect(backSteps([])).toBe(0);
  });
});

describe('a lane', () => {
  it('keeps to one row while names have room, cutting the earlier name short', () => {
    const placed = placeLane([
      { x0: 0, x1: 12, name: 200 },
      { x0: 120, x1: 132, name: 80 },
    ]);
    expect(placed.map((p) => p.row)).toEqual([0, 0]);
    expect(placed[0]!.room).toBe(94);
    expect(placed[1]!.room).toBeNull();
  });

  it('opens a row only where marks are crowded, and goes back to the first when there is room', () => {
    const placed = placeLane([
      { x0: 0, x1: 12, name: 100 },
      { x0: 20, x1: 32, name: 100 },
      { x0: 300, x1: 312, name: 100 },
    ]);
    expect(placed.map((p) => p.row)).toEqual([0, 1, 0]);
  });
});
