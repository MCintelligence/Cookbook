import { describe, expect, it } from 'vitest';
import { bestName } from './PantryShelf';

const june = { id: 'j', path: 'p/June.md', title: 'June Baptiste', kind: 'character' as const, aka: ['Junie', 'Mama J'] };

describe('Pantry shelf', () => {
  it('offers the name the writer is typing towards', () => {
    expect(bestName(june, 'jun')).toEqual({ name: 'June Baptiste', score: 0 });
    expect(bestName(june, 'bap')).toEqual({ name: 'June Baptiste', score: 0 });
    expect(bestName(june, 'mama')).toEqual({ name: 'Mama J', score: 0 });
    expect(bestName(june, 'nie')).toEqual({ name: 'Junie', score: 1 });
    expect(bestName(june, 'ruth')).toBeNull();
  });
});

describe('manuscript', () => {
  it('estimates reading time at 250 words a minute', async () => {
    const { readingTime } = await import('./Manuscript');
    expect(readingTime(20)).toBe('1 min');
    expect(readingTime(5_000)).toBe('20 min');
    expect(readingTime(90_000)).toBe('6 h');
    expect(readingTime(80_000)).toBe('5 h 20 min');
  });
});
