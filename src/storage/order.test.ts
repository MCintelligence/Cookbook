import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { childrenOf, createBook, createDocument, createFolder, moveItem, placeNew, readTree, renameFolder } from './book';
import { ORDER_FILE, loadOrder, saveOrder, sortEntries } from './order';
import { BookIndex, refreshIndex } from './index';
import { readDocument, writeDocument } from './book';
import { statusOf, synopsisOf, withField } from './document';

const names = (nodes: { name: string }[]) => nodes.map((n) => n.name);

async function shelf() {
  const fs = new MemoryAdapter();
  await createBook(fs, 'Book');
  await fs.makeFolder('bookshelf/Chapter 1');
  await fs.makeFolder('bookshelf/Chapter 2');
  for (const t of ['Arrival', 'Supper', 'Dishes']) await createDocument(fs, 'bookshelf/Chapter 1', t);
  await createDocument(fs, 'bookshelf/Chapter 2', 'Morning');
  return fs;
}

describe('bookshelf order', () => {
  it('puts listed names first and everything else after, by name', () => {
    const entries = [
      { name: 'b.md', kind: 'file' as const },
      { name: 'a.md', kind: 'file' as const },
      { name: 'Part', kind: 'folder' as const },
      { name: 'c.md', kind: 'file' as const },
    ];
    expect(names(sortEntries(entries))).toEqual(['Part', 'a.md', 'b.md', 'c.md']);
    expect(names(sortEntries(entries, ['c.md', 'gone.md', 'Part']))).toEqual(['c.md', 'Part', 'a.md', 'b.md']);
  });

  it('reorders within a folder without renaming anything', async () => {
    const fs = await shelf();
    let tree = await readTree(fs, 'bookshelf');
    expect(names(tree[0]!.children!)).toEqual(['Arrival.md', 'Dishes.md', 'Supper.md']);
    // Drag Dishes below Supper: index 3 counts Dishes itself.
    const { path, order } = await moveItem(fs, {}, tree, 'bookshelf', 'bookshelf/Chapter 1/Dishes.md', 'bookshelf/Chapter 1', 3);
    expect(path).toBe('bookshelf/Chapter 1/Dishes.md');
    tree = await readTree(fs, 'bookshelf', order);
    expect(names(tree[0]!.children!)).toEqual(['Arrival.md', 'Supper.md', 'Dishes.md']);
    expect(await loadOrder(fs)).toEqual(order);
    // Move it back to the top.
    const back = await moveItem(fs, order, tree, 'bookshelf', 'bookshelf/Chapter 1/Dishes.md', 'bookshelf/Chapter 1', 0);
    expect(names(childrenOf(await readTree(fs, 'bookshelf', back.order), 'bookshelf', 'bookshelf/Chapter 1'))).toEqual(['Dishes.md', 'Arrival.md', 'Supper.md']);
  });

  it('moves scenes between folders, renaming only on a clash', async () => {
    const fs = await shelf();
    await createDocument(fs, 'bookshelf/Chapter 2', 'Supper');
    const tree = await readTree(fs, 'bookshelf');
    const { path, order } = await moveItem(fs, {}, tree, 'bookshelf', 'bookshelf/Chapter 1/Supper.md', 'bookshelf/Chapter 2', 0);
    expect(path).toBe('bookshelf/Chapter 2/Supper 2.md');
    expect(await fs.exists('bookshelf/Chapter 1/Supper.md')).toBe(false);
    const after = await readTree(fs, 'bookshelf', order);
    expect(names(after[0]!.children!)).toEqual(['Arrival.md', 'Dishes.md']);
    expect(names(after[1]!.children!)).toEqual(['Supper 2.md', 'Morning.md', 'Supper.md']);
  });

  it('moves whole folders, and never into themselves', async () => {
    const fs = await shelf();
    let tree = await readTree(fs, 'bookshelf');
    let { order } = await moveItem(fs, {}, tree, 'bookshelf', 'bookshelf/Chapter 1/Supper.md', 'bookshelf/Chapter 1', 0);
    tree = await readTree(fs, 'bookshelf', order);
    ({ order } = await moveItem(fs, order, tree, 'bookshelf', 'bookshelf/Chapter 1', 'bookshelf/Chapter 2', 1));
    tree = await readTree(fs, 'bookshelf', order);
    expect(names(tree)).toEqual(['Chapter 2']);
    // The moved folder keeps its own order.
    expect(names(childrenOf(tree, 'bookshelf', 'bookshelf/Chapter 2/Chapter 1'))).toEqual(['Supper.md', 'Arrival.md', 'Dishes.md']);
    await expect(moveItem(fs, order, tree, 'bookshelf', 'bookshelf/Chapter 2', 'bookshelf/Chapter 2/Chapter 1', 0)).rejects.toThrow();
  });

  it('renames a folder in place', async () => {
    const fs = await shelf();
    const tree = await readTree(fs, 'bookshelf');
    const { path, order } = await renameFolder(fs, {}, tree, 'bookshelf', 'bookshelf/Chapter 1', 'Zebra: the beginning');
    expect(path).toBe('bookshelf/Zebra the beginning');
    expect(names(await readTree(fs, 'bookshelf', order))).toEqual(['Zebra the beginning', 'Chapter 2']);
    expect(order.bookshelf).toEqual(['Zebra the beginning', 'Chapter 2']);
  });

  it('puts new scenes and folders after the one being written', async () => {
    const fs = await shelf();
    const tree = await readTree(fs, 'bookshelf');
    const p = await createDocument(fs, 'bookshelf/Chapter 1', 'Aaa');
    const order = await placeNew(fs, {}, tree, 'bookshelf', p, 'bookshelf/Chapter 1/Arrival.md');
    expect(names((await readTree(fs, 'bookshelf', order))[0]!.children!)).toEqual(['Arrival.md', 'Aaa.md', 'Dishes.md', 'Supper.md']);
    const f = await createFolder(fs, 'bookshelf');
    expect(f).toBe('bookshelf/New volume');
    expect(await createFolder(fs, 'bookshelf')).toBe('bookshelf/New volume 2');
  });

  it('shrugs off a missing or damaged order file', async () => {
    const fs = await shelf();
    expect(await loadOrder(fs)).toEqual({});
    await fs.writeText(ORDER_FILE, '{ not json');
    expect(await loadOrder(fs)).toEqual({});
    await saveOrder(fs, { bookshelf: ['Chapter 2'], 'bookshelf/Chapter 1': [] });
    expect(JSON.parse(await fs.readText(ORDER_FILE))).toEqual({ bookshelf: ['Chapter 2'] });
  });
});

describe('recipe cards', () => {
  it('reads status and synopsis from the front matter', () => {
    expect(statusOf({})).toBe('not-started');
    expect(statusOf({ status: 'simmering' })).toBe('simmering');
    expect(statusOf({ status: 'burnt' })).toBe('not-started');
    expect(synopsisOf({ synopsis: 'June burns the rice.' })).toBe('June burns the rice.');
    const doc = { id: '1', title: 'T', kind: 'scene' as const, fields: { goal: 500 }, body: '' };
    expect(withField(doc, 'status', 'done').fields).toEqual({ goal: 500, status: 'done' });
    expect(withField(withField(doc, 'synopsis', 'x'), 'synopsis', '').fields).toEqual({ goal: 500 });
  });

  it('keeps card details in the index and follows moves', async () => {
    const fs = await shelf();
    const p = 'bookshelf/Chapter 1/Supper.md';
    const doc = await readDocument(fs, p);
    await writeDocument(fs, p, { ...withField(withField(doc, 'status', 'done'), 'synopsis', 'Grits again.'), body: 'One two three.' });
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    expect(index.cards().get(p)).toMatchObject({ title: 'Supper', kind: 'scene', words: 3, synopsis: 'Grits again.', status: 'done', aka: [] });
    index.move('bookshelf/Chapter 1', 'bookshelf/Part/Chapter 1');
    expect(index.cards().has('bookshelf/Part/Chapter 1/Supper.md')).toBe(true);
    expect(index.cards().has('bookshelf/Chapter 10/x.md')).toBe(false);
    expect(index.search('grits')).toEqual([]);
    expect(index.search('three')[0]?.path).toBe('bookshelf/Part/Chapter 1/Supper.md');
    index.close();
  });
});
