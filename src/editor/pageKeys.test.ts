import { describe, expect, it } from 'vitest';
import { pageTarget } from './pageKeys';

// A window from 100 to 900 on screen, paging 760 at a time.
const base = { y: 500, page: 760, top: -5000, bottom: 5000 };

describe('Page Up and Page Down', () => {
  it('keeps the caret where it is on screen when the page scrolls a full page', () => {
    expect(pageTarget({ ...base, dir: 1, moved: 760 })).toBe(500);
    expect(pageTarget({ ...base, dir: -1, moved: -760 })).toBe(500);
  });

  it('moves the caret on screen by whatever the scroll could not cover', () => {
    expect(pageTarget({ ...base, dir: 1, moved: 200 })).toBe(1060);
    expect(pageTarget({ ...base, dir: -1, moved: -200 })).toBe(-60);
  });

  it('goes to the very start from the top, and never down', () => {
    expect(pageTarget({ ...base, dir: -1, moved: 0, top: 150 })).toBe('start');
    expect(pageTarget({ ...base, dir: -1, moved: -100, top: 150 })).toBe('start');
  });

  it('goes to the very end from the bottom', () => {
    expect(pageTarget({ ...base, dir: 1, moved: 0, bottom: 850 })).toBe('end');
    expect(pageTarget({ ...base, dir: 1, moved: 300, bottom: 850 })).toBe('end');
  });
});
