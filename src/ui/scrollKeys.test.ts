import { describe, expect, it } from 'vitest';
import { scrollKeyTarget } from './scrollKeys';

describe('keys that scroll the desk', () => {
  const at = { top: 1000, height: 5000, client: 800 };
  it('goes all the way to the top and the bottom at once', () => {
    expect(scrollKeyTarget('Home', at)).toBe(0);
    expect(scrollKeyTarget('End', at)).toBe(4200);
  });
  it('pages by a window less two lines, so the line just read stays in sight', () => {
    expect(scrollKeyTarget('PageDown', at)).toBe(1720);
    expect(scrollKeyTarget('PageUp', at)).toBe(280);
    expect(scrollKeyTarget('ArrowDown', at)).toBe(1040);
    expect(scrollKeyTarget('ArrowUp', at)).toBe(960);
  });
  it('stops at either end, and leaves other keys alone', () => {
    expect(scrollKeyTarget('PageUp', { ...at, top: 100 })).toBe(0);
    expect(scrollKeyTarget('PageDown', { ...at, top: 4000 })).toBe(4200);
    expect(scrollKeyTarget('End', { top: 0, height: 500, client: 800 })).toBe(0);
    expect(scrollKeyTarget('a', at)).toBeNull();
  });
});
