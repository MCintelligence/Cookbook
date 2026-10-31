import { describe, expect, it } from 'vitest';
import { type TreeNode } from '../storage/book';
import { estimatedHeight, findGroup, isInside, itemBeside, miseEntries, miseItems, miseWords } from './mise';

const file = (path: string): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'file' });
const shelf: TreeNode[] = [
  {
    name: 'Part One',
    path: 'bookshelf/Part One',
    kind: 'folder',
    children: [
      file('bookshelf/Part One/Opening.md'),
      {
        name: 'Chapter 1',
        path: 'bookshelf/Part One/Chapter 1',
        kind: 'folder',
        children: [file('bookshelf/Part One/Chapter 1/Kitchen.md'), file('bookshelf/Part One/Chapter 1/Porch.md')],
      },
      { name: 'Empty', path: 'bookshelf/Part One/Empty', kind: 'folder', children: [] },
    ],
  },
  { name: 'Part Two', path: 'bookshelf/Part Two', kind: 'folder', children: [] },
  file('bookshelf/Loose.md'),
];

describe('Mise en Place', () => {
  it('finds a Group at any depth', () => {
    expect(findGroup(shelf, 'bookshelf/Part One/Chapter 1')?.name).toBe('Chapter 1');
    expect(findGroup(shelf, 'bookshelf/Part Two')?.children).toEqual([]);
    expect(findGroup(shelf, 'bookshelf/Loose.md')).toBeNull();
    expect(findGroup(shelf, 'bookshelf/Gone')).toBeNull();
  });

  it('joins a Group’s Items in Shelf order, with the Groups inside it as dividers', () => {
    const entries = miseEntries(findGroup(shelf, 'bookshelf/Part One')!);
    expect(entries.map((e) => (e.type === 'group' ? `# ${e.name} (${e.depth})` : e.name))).toEqual([
      '# Part One (0)',
      'Opening',
      '# Chapter 1 (1)',
      'Kitchen',
      'Porch',
      '# Empty (1)',
    ]);
    expect(miseItems(entries)).toEqual(['bookshelf/Part One/Opening.md', 'bookshelf/Part One/Chapter 1/Kitchen.md', 'bookshelf/Part One/Chapter 1/Porch.md']);
  });

  it('has no Items for an empty Group, only its name', () => {
    const entries = miseEntries(findGroup(shelf, 'bookshelf/Part Two')!);
    expect(entries).toEqual([{ type: 'group', path: 'bookshelf/Part Two', name: 'Part Two', depth: 0 }]);
    expect(miseItems(entries)).toEqual([]);
  });

  it('tells what is inside a Group, without mistaking a Group with a longer name', () => {
    expect(isInside('bookshelf/Part One/Chapter 1/Kitchen.md', 'bookshelf/Part One')).toBe(true);
    expect(isInside('bookshelf/Part One', 'bookshelf/Part One')).toBe(false);
    expect(isInside('bookshelf/Part One Again/A.md', 'bookshelf/Part One')).toBe(false);
  });

  it('steps between Items, and stops at the ends', () => {
    const items = ['a', 'b', 'c'];
    expect(itemBeside(items, 'b', 1)).toBe('c');
    expect(itemBeside(items, 'b', -1)).toBe('a');
    expect(itemBeside(items, 'c', 1)).toBeNull();
    expect(itemBeside(items, 'a', -1)).toBeNull();
    expect(itemBeside(items, 'x', 1)).toBeNull();
  });

  it('counts the open Item as it is now and the rest as saved', () => {
    const saved = new Map([
      ['a', 100],
      ['b', 50],
    ]);
    const of = (p: string) => saved.get(p) ?? 0;
    expect(miseWords(['a', 'b'], of, 'b', 75)).toBe(175);
    expect(miseWords(['a', 'b'], of, null, null)).toBe(150);
  });

  it('draws an Item that hasn’t loaded at about its height', () => {
    expect(estimatedHeight(0)).toBe(56);
    expect(estimatedHeight(1100)).toBe(2800);
  });
});
