import { describe, expect, it } from 'vitest';
import { type TreeNode } from '../storage/book';
import { type CardSummary } from '../storage/index';
import { boardRows, datedOf, dropPlace, layOut, packRows, pairTies, pantryGroups, readDay, readingOrder, shelfGroups, tiesOf, typedDate } from './model';
import { DEFAULT_PREFS, readPrefs, sideOf, viewOf } from './prefs';

const card = (id: string, extra: Partial<CardSummary> = {}): CardSummary => ({ id, title: id, kind: 'scene', words: 10, synopsis: '', status: 'not-started', aka: [], portrait: '', label: '', file: '', skipExport: false, dates: [], arc: {}, ...extra });
const file = (path: string): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'file' });
const folder = (path: string, children: TreeNode[]): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'folder', children });

const tree = [file('bookshelf/Loose.md'), folder('bookshelf/One', [file('bookshelf/One/a.md'), folder('bookshelf/One/Inner', [file('bookshelf/One/Inner/b.md')]), file('bookshelf/One/c.md')]), folder('bookshelf/Two', [])];
const cards = new Map<string, CardSummary>([
  ['bookshelf/Loose.md', card('loose')],
  ['bookshelf/One/a.md', card('a', { label: 'red', dates: [{ on: '1954-09-03' }] })],
  ['bookshelf/One/Inner/b.md', card('b', { status: 'done', dates: [{ on: '1954-09-14', to: '1954-09-16' }] })],
  ['bookshelf/One/c.md', card('c')],
  ['pantry/characters/Ruth.md', card('ruth', { kind: 'character', dates: [{ on: '1912-03-08', what: 'Born' }, { on: '1954-09-21', what: 'Sells the ring' }] })],
  ['pantry/settings/Kitchen.md', card('kitchen', { kind: 'setting' })],
]);

describe('the Shelf and Pantry as the views show them', () => {
  it('lists the top Groups in order, each read straight through, with loose Items first', () => {
    const groups = shelfGroups(tree, cards);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.card.id)])).toEqual([
      ['Not in a Group', ['loose']],
      ['One', ['a', 'b', 'c']],
      ['Two', []],
    ]);
    expect(groups[1]!.items[1]!.group).toBe('bookshelf/One');
  });

  it('sorts the Pantry into Characters, Settings and Materials', () => {
    const pantry = [folder('pantry/characters', [file('pantry/characters/Ruth.md')]), folder('pantry/settings', [file('pantry/settings/Kitchen.md')])];
    expect(pantryGroups(pantry, cards).map((g) => [g.title, g.items.length])).toEqual([
      ['Characters', 1],
      ['Settings', 1],
      ['Materials', 0],
    ]);
  });

  it('finds where a dropped Item goes', () => {
    expect(dropPlace(tree, 'bookshelf/One', 'bookshelf/One/c.md')).toEqual({ folder: 'bookshelf/One', at: 2 });
    expect(dropPlace(tree, 'bookshelf/One', 'bookshelf/One/Inner/b.md')).toEqual({ folder: 'bookshelf/One/Inner', at: 0 });
    expect(dropPlace(tree, 'bookshelf/One', null)).toEqual({ folder: 'bookshelf/One', at: 3 });
    expect(dropPlace(tree, 'bookshelf/Two', null)).toEqual({ folder: 'bookshelf/Two', at: 0 });
  });

  it('makes board rows from plotlines in use or named', () => {
    const items = shelfGroups(tree, cards).flatMap((g) => g.items);
    expect(boardRows('none', items, {})).toHaveLength(1);
    expect(boardRows('status', items, {}).map((r) => r.id)).toEqual(['not-started', 'simmering', 'done']);
    expect(boardRows('label', items, { blue: 'The debt' }).map((r) => r.title)).toEqual(['No plotline', 'Red', 'The debt']);
  });
});

describe('ties', () => {
  const links = [
    { from: 'pantry/characters/Ruth.md', to: 'june', as: 'Mother of' },
    { from: 'pantry/characters/June.md', to: 'ruth', as: 'Daughter of' },
    { from: 'pantry/characters/Ruth.md', to: 'gone', as: 'Knew' },
    { from: 'pantry/characters/Ruth.md', to: 'kitchen', as: 'Owns' },
  ];
  const ids: Record<string, string> = { 'pantry/characters/Ruth.md': 'ruth', 'pantry/characters/June.md': 'june' };

  it('draws one line a pair, with both readings, and drops ties to Items that are gone', () => {
    expect(pairTies(links, (p) => ids[p], new Set(['ruth', 'june', 'kitchen']))).toEqual([
      { a: 'june', b: 'ruth', ab: 'Daughter of', ba: 'Mother of' },
      { a: 'kitchen', b: 'ruth', ab: null, ba: 'Owns' },
    ]);
  });

  it('gathers an Item’s own ties as its file keeps them', () => {
    expect(tiesOf(links, 'pantry/characters/June.md')).toEqual([{ to: 'ruth', as: 'Daughter of' }]);
  });

  it('lays the atlas out the same way every time, leaving placed Items where they are', () => {
    const ties = [{ a: 'june', b: 'ruth' }];
    const once = layOut(['ruth', 'june', 'kitchen'], ties, { ruth: [5, 7] });
    expect(once.ruth).toEqual([5, 7]);
    expect(layOut(['ruth', 'june', 'kitchen'], ties, { ruth: [5, 7] })).toEqual(once);
    const apart = Math.hypot(once.june![0] - once.kitchen![0], once.june![1] - once.kitchen![1]);
    expect(apart).toBeGreaterThan(60);
  });
});

describe('dates in the views', () => {
  it('gives a Shelf Item one date and a Pantry Item each of its events', () => {
    const shelf = datedOf(shelfGroups(tree, cards).flatMap((g) => g.items), false);
    expect(shelf.map((d) => [d.title, d.last - d.first, d.event])).toEqual([
      ['a', 0, null],
      ['b', 2, null],
    ]);
    const pantry = datedOf([{ path: 'pantry/characters/Ruth.md', card: cards.get('pantry/characters/Ruth.md')!, group: 'pantry/characters' }], true);
    expect(pantry.map((d) => [d.title, d.event])).toEqual([
      ['ruth: Born', 0],
      ['ruth: Sells the ring', 1],
    ]);
  });

  it('reads days the way writers type them', () => {
    expect(readDay('3 September 1954')).toEqual({ y: 1954, m: 9, d: 3 });
    expect(readDay('3 Sep 1954')).toEqual({ y: 1954, m: 9, d: 3 });
    expect(readDay('September 3, 1954')).toEqual({ y: 1954, m: 9, d: 3 });
    expect(readDay('1954-09-03')).toEqual({ y: 1954, m: 9, d: 3 });
    expect(readDay('31 February 1954')).toBeNull();
    expect(readDay('3 Smarch 1954')).toBeNull();
    expect(typedDate('3 Sep 1954', '')).toEqual({ on: '1954-09-03' });
    expect(typedDate('16 Sep 1954', '14 Sep 1954')).toEqual({ on: '1954-09-14', to: '1954-09-16' });
    expect(typedDate('3 Sep 1954', 'later')).toBeNull();
  });

  it('puts overlapping bars on rows of their own', () => {
    expect(packRows([[0, 100], [50, 150], [120, 200], [300, 400]])).toEqual([0, 1, 0, 0]);
    expect(packRows([])).toEqual([]);
  });

  it('reads a free board in rows, left to right', () => {
    const spots: Record<string, [number, number]> = { a: [300, 10], b: [0, 30], c: [100, 200], d: [0, 190] };
    expect(readingOrder(Object.keys(spots), (id) => spots[id]!, 180)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('mode set-up', () => {
  it('fills a damaged or partial modes.json from the defaults', () => {
    expect(readPrefs('not json')).toEqual(DEFAULT_PREFS);
    expect(readPrefs('[]')).toEqual(DEFAULT_PREFS);
    const read = readPrefs(JSON.stringify({ together: true, board: { layout: 'free' }, timeline: { px: 9999 }, outline: { columns: ['words', 3] } }));
    // The old "Shelf and Pantry together" switch is gone; a modes.json that still has it reads as if it didn't.
    expect('together' in read).toBe(false);
    expect(read.board).toEqual({ layout: 'free', rows: 'none' });
    expect(read.timeline.px).toBe(96);
    expect(read.outline.columns).toEqual(['words']);
    expect(read.atlas).toEqual(DEFAULT_PREFS.atlas);
  });

  it('reads which Items were removed from Prep and from Plan', () => {
    expect(readPrefs('{}').hidden).toEqual({ prep: [], plan: [] });
    expect(readPrefs(JSON.stringify({ hidden: { prep: ['a', 3], plan: 'b' } })).hidden).toEqual({ prep: ['a'], plan: [] });
  });

    it('shows the Pantry’s views for a Pantry Item, and the Shelf’s for anything else', () => {
    expect(sideOf(false)).toBe('shelf');
    expect(sideOf(true)).toBe('pantry');
  });

  it('opens the view last used on each side, or the first', () => {
    expect(viewOf(DEFAULT_PREFS, 'prep', 'shelf')).toBe('outline');
    expect(viewOf(DEFAULT_PREFS, 'plan', 'pantry')).toBe('arcs');
    const prefs = { ...DEFAULT_PREFS, view: { 'prep:shelf': 'board' as const, 'plan:shelf': 'atlas' as const } };
    expect(viewOf(prefs, 'prep', 'shelf')).toBe('board');
    expect(viewOf(prefs, 'plan', 'shelf')).toBe('calendar');
  });
});
