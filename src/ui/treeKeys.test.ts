import { describe, expect, it } from 'vitest';
import { type TreeNode } from '../storage/book';
import { altMove, pasteMove, placesOf, shownPaths } from './treeKeys';

const file = (path: string): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'file' });
const folder = (path: string, children: TreeNode[]): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'folder', children });

// bookshelf/ One/ (a, b)  Two/ (c)  loose
const one = folder('bookshelf/One', [file('bookshelf/One/a.md'), file('bookshelf/One/b.md')]);
const two = folder('bookshelf/Two', [file('bookshelf/Two/c.md')]);
const loose = file('bookshelf/loose.md');
const nodes = [one, two, loose];
const places = placesOf(nodes, 'bookshelf');
const node = (p: string) => places.get(p)!.siblings[places.get(p)!.index]!;

describe('moving rows from the keyboard', () => {
  it('swaps with a neighbour inside its Group', () => {
    expect(altMove(node('bookshelf/One/a.md'), places, 'bookshelf', 1)).toEqual({ folder: 'bookshelf/One', index: 2 });
    expect(altMove(node('bookshelf/One/b.md'), places, 'bookshelf', -1)).toEqual({ folder: 'bookshelf/One', index: 0 });
  });

  it('carries an item past the edge of its Group into the next one', () => {
    expect(altMove(node('bookshelf/One/b.md'), places, 'bookshelf', 1)).toEqual({ folder: 'bookshelf/Two', index: 0 });
    expect(altMove(node('bookshelf/Two/c.md'), places, 'bookshelf', -1)).toEqual({ folder: 'bookshelf/One', index: 2 });
  });

  it('steps out beside its Group when no Group is next to it', () => {
    expect(altMove(node('bookshelf/One/a.md'), places, 'bookshelf', -1)).toEqual({ folder: 'bookshelf', index: 0 });
    // Two is followed by a loose item, not a Group.
    expect(altMove(node('bookshelf/Two/c.md'), places, 'bookshelf', 1)).toEqual({ folder: 'bookshelf', index: 2 });
  });

  it('never puts a Group inside another, and stops at the ends', () => {
    expect(altMove(node('bookshelf/One'), places, 'bookshelf', -1)).toBeNull();
    expect(altMove(node('bookshelf/loose.md'), places, 'bookshelf', 1)).toBeNull();
  });

  it('pastes into a Group at its end, or just after an item', () => {
    expect(pasteMove('bookshelf/loose.md', node('bookshelf/One'), places)).toEqual({ folder: 'bookshelf/One', index: 2 });
    expect(pasteMove('bookshelf/One/a.md', node('bookshelf/One/b.md'), places)).toEqual({ folder: 'bookshelf/One', index: 2 });
    expect(pasteMove('bookshelf/One', node('bookshelf/One/a.md'), places)).toBeNull();
  });

  it('knows which rows are on screen', () => {
    expect(shownPaths(nodes, new Set(['bookshelf/One']))).toEqual(['bookshelf/One', 'bookshelf/Two', 'bookshelf/Two/c.md', 'bookshelf/loose.md']);
  });
});
