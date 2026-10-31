import { describe, expect, it } from 'vitest';
import { type TreeNode } from '../storage/book';
import { allPaths, between, stillThere, topmost } from './selection';

const tree: TreeNode[] = [
  { name: 'Group 1', path: 'b/Group 1', kind: 'folder', children: [{ name: 'Item 1.md', path: 'b/Group 1/Item 1.md', kind: 'file' }] },
  { name: 'Item 2.md', path: 'b/Item 2.md', kind: 'file' },
];

describe('selection', () => {
  it('lists Groups and Items in Shelf order', () => {
    expect(allPaths(tree)).toEqual(['b/Group 1', 'b/Group 1/Item 1.md', 'b/Item 2.md']);
  });

  it('leaves out what a selected Group already holds', () => {
    expect(topmost(['b/Group 1/Item 1.md', 'b/Group 1', 'b/Item 2.md'])).toEqual(['b/Group 1', 'b/Item 2.md']);
    // A Group whose name starts like another's is not inside it.
    expect(topmost(['b/Group 1', 'b/Group 10'])).toEqual(['b/Group 1', 'b/Group 10']);
  });

  it('forgets paths that are gone and keeps the same set when none are', () => {
    const marked = new Set(['b/Item 2.md']);
    expect(stillThere(marked, tree)).toBe(marked);
    expect([...stillThere(new Set(['b/Item 2.md', 'b/Gone.md']), tree)]).toEqual(['b/Item 2.md']);
  });

  it('selects a run of rows either way from the anchor', () => {
    const shown = ['a', 'b', 'c', 'd'];
    expect(between(shown, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(between(shown, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(between(shown, null, 'c')).toEqual(['c']);
    expect(between(shown, 'gone', 'c')).toEqual(['c']);
  });
});
