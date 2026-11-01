import { describe, expect, it } from 'vitest';
import { type TreeNode } from '../storage/book';
import { estimatedHeight, findGroup, inRoots, isInside, itemBeside, miseEntries, miseEntriesOf, miseItems, miseWords, viewOfPicked } from './mise';

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

  it('joins several Groups, and Items picked on their own, each Group under its own name', () => {
    const roots = [findGroup(shelf, 'bookshelf/Part One/Chapter 1')!, findGroup(shelf, 'bookshelf/Part Two')!, file('bookshelf/Loose.md')];
    expect(miseEntriesOf(roots).map((e) => (e.type === 'group' ? `# ${e.name} (${e.depth})` : e.name))).toEqual(['# Chapter 1 (0)', 'Kitchen', 'Porch', '# Part Two (0)', 'Loose']);
    expect(inRoots('bookshelf/Part One/Chapter 1/Porch.md', ['bookshelf/Part One/Chapter 1'])).toBe(true);
    expect(inRoots('bookshelf/Loose.md', ['bookshelf/Loose.md'])).toBe(true);
    expect(inRoots('bookshelf/Part One/Opening.md', ['bookshelf/Part One/Chapter 1'])).toBe(false);
  });
});

describe('Groups picked together', () => {
  it('shows them in Shelf order whatever order they were picked in, with typing going to the first picked', () => {
    const view = viewOfPicked(['bookshelf/Part Two', 'bookshelf/Part One/Chapter 1'], shelf, null);
    expect(view).toEqual({ roots: ['bookshelf/Part One/Chapter 1', 'bookshelf/Part Two'], anchor: 'bookshelf/Part Two', target: 'bookshelf/Part Two' });
  });

  it('opens Select all at the Group clicked before, with typing going to the top Group', () => {
    const everything = ['bookshelf/Part One', 'bookshelf/Part One/Opening.md', 'bookshelf/Part One/Chapter 1', 'bookshelf/Part One/Chapter 1/Kitchen.md', 'bookshelf/Part One/Chapter 1/Porch.md', 'bookshelf/Part One/Empty', 'bookshelf/Part Two', 'bookshelf/Loose.md'];
    const view = viewOfPicked(everything, shelf, 'bookshelf/Part One/Chapter 1');
    expect(view).toEqual({ roots: ['bookshelf/Part One', 'bookshelf/Part Two', 'bookshelf/Loose.md'], anchor: 'bookshelf/Part One/Chapter 1', target: 'bookshelf/Part One' });
  });

  it('keeps the anchor when another Group is added, and moves it when its Group is let go', () => {
    expect(viewOfPicked(['bookshelf/Part Two', 'bookshelf/Part One'], shelf, 'bookshelf/Part Two')?.anchor).toBe('bookshelf/Part Two');
    expect(viewOfPicked(['bookshelf/Part One'], shelf, 'bookshelf/Part Two')?.anchor).toBe('bookshelf/Part One');
  });

  it('shows nothing new when only Items are picked, or what was picked has gone', () => {
    expect(viewOfPicked(['bookshelf/Loose.md', 'bookshelf/Part One/Opening.md'], shelf, null)).toBeNull();
    expect(viewOfPicked(['bookshelf/Gone'], shelf, null)).toBeNull();
  });
});
