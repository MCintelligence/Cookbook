import { describe, expect, it } from 'vitest';
import { deskZone } from './deskDrop';

const box = { left: 200, right: 1200, top: 50, bottom: 850 };

describe('deskZone', () => {
  it('opens beside near the edges and in place in the middle', () => {
    expect(deskZone(box, 210, 400, true)).toBe('left');
    expect(deskZone(box, 1190, 400, true)).toBe('right');
    expect(deskZone(box, 700, 400, true)).toBe('open');
  });
  it('keeps the edges between a floor and a ceiling', () => {
    // 22% of 1000px is 220px.
    expect(deskZone(box, 200 + 219, 400, true)).toBe('left');
    expect(deskZone(box, 200 + 221, 400, true)).toBe('open');
    const narrow = { ...box, right: 500 };
    expect(deskZone(narrow, 200 + 95, 400, true)).toBe('left');
    const wide = { ...box, right: 3200 };
    expect(deskZone(wide, 200 + 241, 400, true)).toBe('open');
  });
  it('only opens in place when there is nothing to split', () => {
    expect(deskZone(box, 210, 400, false)).toBe('open');
  });
  it('is nowhere outside the editor', () => {
    expect(deskZone(box, 150, 400, true)).toBeNull();
    expect(deskZone(box, 700, 900, true)).toBeNull();
  });
});
