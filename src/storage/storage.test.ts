import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { parseDocument, serializeDocument } from './document';
import {
  BOOK_FILE,
  createBook,
  createDocument,
  fileNameFor,
  openBook,
  readDocument,
  readTree,
  writeDocument,
  fileAfter,
  moveToTrash,
  duplicateItem,
  sortFolder,
} from './book';
import { type Order } from './order';
import { BookIndex, INDEX_FILE, MATCH_END, MATCH_START, countWords, loadIndex, refreshIndex, saveIndex, toFtsQuery } from './index';

describe('document format', () => {
  it('round-trips front matter and body', () => {
    const text = [
      '---',
      'id: abc',
      'title: Sunday Dinner',
      'kind: scene',
      'status: draft',
      '---',
      'The kitchen smelled of cornbread.',
      '',
      '::: letter',
      'Dear June,',
      ':::',
      '',
    ].join('\n');
    const doc = parseDocument(text);
    expect(doc).toMatchObject({ id: 'abc', title: 'Sunday Dinner', kind: 'scene', fields: { status: 'draft' } });
    expect(doc.body.startsWith('The kitchen')).toBe(true);
    expect(serializeDocument(doc)).toBe(text);
  });

  it('accepts a plain Markdown file with no front matter', () => {
    const doc = parseDocument('Just words.\n', 'Notes');
    expect(doc.title).toBe('Notes');
    expect(doc.kind).toBe('scene');
    expect(doc.body).toBe('Just words.\n');
    expect(doc.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('handles Windows line endings', () => {
    const doc = parseDocument('---\r\ntitle: Porch\r\nkind: setting\r\n---\r\nHot night.\r\n');
    expect(doc).toMatchObject({ title: 'Porch', kind: 'setting', body: 'Hot night.\n' });
  });
});

describe('book folder', () => {
  it('creates and reopens a book', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'The Summer Kitchen', new Date('2026-10-21T00:00:00Z'));
    expect(await openBook(fs)).toEqual({ format: 1, title: 'The Summer Kitchen', created: '2026-10-21T00:00:00.000Z', id: expect.any(String) });
    expect(await fs.exists('pantry/characters')).toBe(true);
    await expect(createBook(fs, 'Again')).rejects.toThrow(/already a recipe/);
  });

  it('refuses books from a newer format', async () => {
    const fs = new MemoryAdapter();
    await fs.writeText(BOOK_FILE, JSON.stringify({ format: 99, title: 'Future' }));
    await expect(openBook(fs)).rejects.toThrow(/newer version/);
  });

  it('lists nested folders in natural order and hides internals', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('bookshelf/Part One/Chapter 10');
    await fs.makeFolder('bookshelf/Part One/Chapter 2');
    await createDocument(fs, 'bookshelf/Part One/Chapter 2', 'Sunday Dinner');
    await fs.writeText('bookshelf/stray.txt', 'not a scene');
    await fs.writeText('bookshelf/.DS_Store', '');
    const tree = await readTree(fs, 'bookshelf');
    expect(tree.map((n) => n.name)).toEqual(['Part One']);
    const chapters = tree[0]!.children!;
    expect(chapters.map((n) => n.name)).toEqual(['Chapter 2', 'Chapter 10']);
    expect(chapters[0]!.children!.map((n) => n.path)).toEqual(['bookshelf/Part One/Chapter 2/Sunday Dinner.md']);
  });

  it('never overwrites when two scenes share a title', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const a = await createDocument(fs, 'bookshelf', 'Morning');
    const b = await createDocument(fs, 'bookshelf', 'Morning');
    expect([a, b]).toEqual(['bookshelf/Morning.md', 'bookshelf/Morning 2.md']);
  });

  it('makes file names safe on every platform', () => {
    expect(fileNameFor('Lou: "the" end?. ')).toBe('Lou the end');
    expect(fileNameFor('///')).toBe('Untitled');
  });

  it('saves edits to a scene', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const path = await createDocument(fs, 'pantry/characters', 'Mama Lou', 'character');
    const doc = await readDocument(fs, path);
    await writeDocument(fs, path, { ...doc, fields: { role: 'Grandmother' }, body: 'Hums hymns.' });
    expect(await readDocument(fs, path)).toMatchObject({ kind: 'character', fields: { role: 'Grandmother' }, body: 'Hums hymns.\n' });
  });

  it('moves folders with their contents', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('bookshelf/Chapter 1');
    await createDocument(fs, 'bookshelf/Chapter 1', 'Morning');
    await fs.rename('bookshelf/Chapter 1', 'bookshelf/Chapter One');
    expect(await fs.exists('bookshelf/Chapter One/Morning.md')).toBe(true);
    expect(await fs.exists('bookshelf/Chapter 1')).toBe(false);
  });
});

describe('hidden index', () => {
  it('counts words the way writers expect', () => {
    expect(countWords("Mama Lou's greens weren't done — not yet.")).toBe(7);
    expect(countWords('')).toBe(0);
  });

  it('builds from the files and searches by kind', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const lou = await createDocument(fs, 'pantry/characters', 'Mama Lou', 'character');
    const porch = await createDocument(fs, 'pantry/settings', "Lou's porch", 'setting');
    const scene = await createDocument(fs, 'bookshelf', 'Sunday Dinner');
    await writeDocument(fs, scene, { ...(await readDocument(fs, scene)), body: '**Lou** stirred the [greens]{.thought}.^[Collards.]\n' });

    const index = await BookIndex.open();
    expect(await refreshIndex(fs, index)).toBe(3);

    const all = index.search('lou');
    expect(all.map((d) => d.path).sort()).toEqual([lou, porch, scene].sort());
    // Title matches rank above text matches.
    expect(all[all.length - 1]!.path).toBe(scene);
    const pantryOnly = index.search('lou', { kinds: ['character', 'setting', 'research'] });
    expect(pantryOnly.map((d) => d.path).sort()).toEqual([lou, porch].sort());
    // Markup is not indexed; footnotes are.
    expect(index.search('lou greens')).toMatchObject([{ path: scene, snippet: `${MATCH_START}Lou${MATCH_END} stirred the ${MATCH_START}greens${MATCH_END}. Collards. ` }]);
    expect(index.search('collard')).toHaveLength(1);
    expect(index.search('thought')).toEqual([]);
    expect(index.search('   ')).toEqual([]);
  });

  it('finds word stems and ignores accents', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const scene = await createDocument(fs, 'bookshelf', 'Café');
    await writeDocument(fs, scene, { ...(await readDocument(fs, scene)), body: 'She was running late.\n' });
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    expect(index.search('runs')).toHaveLength(1);
    expect(index.search('cafe')).toHaveLength(1);
    expect(index.search('"; drop table docs; --')).toEqual([]);
  });

  it('only rereads changed files, and forgets deleted ones', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const a = await createDocument(fs, 'bookshelf', 'One');
    await createDocument(fs, 'bookshelf', 'Two');
    const index = await BookIndex.open();
    expect(await refreshIndex(fs, index)).toBe(2);
    expect(await refreshIndex(fs, index)).toBe(0);
    await writeDocument(fs, a, { ...(await readDocument(fs, a)), body: 'Peach cobbler.\n' });
    await fs.remove('bookshelf/Two.md');
    expect(await refreshIndex(fs, index)).toBe(2);
    expect(index.size()).toBe(1);
    expect(index.search('cobbler')).toHaveLength(1);
  });

  it('saves to the hidden folder and opens again', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const a = await createDocument(fs, 'bookshelf', 'Sweet potato pie');
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    await saveIndex(fs, index);
    expect(await fs.exists(INDEX_FILE)).toBe(true);

    const again = await loadIndex(fs);
    expect(again.search('potato').map((h) => h.path)).toEqual([a]);
    expect(await refreshIndex(fs, again)).toBe(0);
  });

  it('starts over when the saved index is damaged', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await createDocument(fs, 'bookshelf', 'One');
    await fs.writeBytes(INDEX_FILE, new Uint8Array([1, 2, 3, 4]));
    const index = await loadIndex(fs);
    expect(index.size()).toBe(0);
    expect(await refreshIndex(fs, index)).toBe(1);
  });

  it('turns typed words into a safe prefix query', () => {
    expect(toFtsQuery('Mama "Lou" OR*')).toBe('"mama"* "lou"* "or"*');
  });
});

describe('scene order and trash', () => {
  it('puts a continued scene right after the original', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('bookshelf/Chapter 1');
    for (const t of ['Supper, part 2', 'Supper', 'Breakfast', 'Supper 10', 'Supper 9']) await createDocument(fs, 'bookshelf/Chapter 1', t);
    const tree = await readTree(fs, 'bookshelf');
    expect(tree[0]!.children!.map((n) => n.name)).toEqual(['Breakfast.md', 'Supper.md', 'Supper 9.md', 'Supper 10.md', 'Supper, part 2.md']);
    expect(fileAfter(tree, 'bookshelf/Chapter 1/Supper.md')?.name).toBe('Supper 9.md');
    expect(fileAfter(tree, 'bookshelf/Chapter 1/Supper, part 2.md')).toBeNull();
    expect(fileAfter(tree, 'bookshelf/Elsewhere.md')).toBeNull();
  });

  it('moves files to the hidden trash instead of deleting them', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const p = await createDocument(fs, 'bookshelf', 'Gone');
    const { name } = await moveToTrash(fs, p, new Date('2026-10-21T12:00:00Z'));
    const to = `.cookbook/trash/${name}`;
    expect(to).toBe('.cookbook/trash/2026-10-21T12-00-00-000Z Gone.md');
    expect(await fs.exists(p)).toBe(false);
    expect(await fs.exists(to)).toBe(true);
  });
});

describe('duplicating and sorting', () => {
  it('copies a folder with everything in it, with new ids, right after the original', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('bookshelf/Chapter 1/Inner');
    const a = await createDocument(fs, 'bookshelf/Chapter 1', 'Supper');
    await createDocument(fs, 'bookshelf/Chapter 1/Inner', 'Pie');
    await fs.makeFolder('bookshelf/Chapter 2');
    let order: Order = { bookshelf: ['Chapter 1', 'Chapter 2'], 'bookshelf/Chapter 1': ['Inner', 'Supper.md'] };
    const tree = await readTree(fs, 'bookshelf', order);
    const copied = await duplicateItem(fs, order, tree, 'bookshelf', 'bookshelf/Chapter 1');
    expect(copied.path).toBe('bookshelf/Chapter 1 copy');
    order = copied.order;
    expect(order.bookshelf).toEqual(['Chapter 1', 'Chapter 1 copy', 'Chapter 2']);
    expect(order['bookshelf/Chapter 1 copy']).toEqual(['Inner', 'Supper.md']);
    const original = await readDocument(fs, a);
    const copy = await readDocument(fs, 'bookshelf/Chapter 1 copy/Supper.md');
    expect(copy.title).toBe('Supper');
    expect(copy.id).not.toBe(original.id);
    expect(await fs.exists('bookshelf/Chapter 1 copy/Inner/Pie.md')).toBe(true);

    const scene = await duplicateItem(fs, order, await readTree(fs, 'bookshelf', order), 'bookshelf', a);
    expect(scene.path).toBe('bookshelf/Chapter 1/Supper copy.md');
    expect((await readDocument(fs, scene.path)).title).toBe('Supper copy');
    expect(scene.order['bookshelf/Chapter 1']).toEqual(['Inner', 'Supper.md', 'Supper copy.md']);
  });

  it('sorts a folder A to Z and Z to A, numbers in number order', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    for (const t of ['Scene 10', 'Scene 2', 'apple']) await createDocument(fs, 'bookshelf', t);
    const tree = await readTree(fs, 'bookshelf');
    expect((await sortFolder(fs, {}, tree, 'bookshelf', 'bookshelf')).bookshelf).toEqual(['apple.md', 'Scene 2.md', 'Scene 10.md']);
    expect((await sortFolder(fs, {}, tree, 'bookshelf', 'bookshelf', true)).bookshelf).toEqual(['Scene 10.md', 'Scene 2.md', 'apple.md']);
  });
});
