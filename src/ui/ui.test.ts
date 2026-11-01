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
