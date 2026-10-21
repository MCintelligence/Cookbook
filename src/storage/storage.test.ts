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
} from './book';
import { MemoryIndex, countWords, rebuildIndex } from './index';

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
    expect(await openBook(fs)).toEqual({ format: 1, title: 'The Summer Kitchen', created: '2026-10-21T00:00:00.000Z' });
    expect(await fs.exists('pantry/characters')).toBe(true);
    await expect(createBook(fs, 'Again')).rejects.toThrow(/already a book/);
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

  it('rebuilds from the files and searches by kind', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const lou = await createDocument(fs, 'pantry/characters', 'Mama Lou', 'character');
    const porch = await createDocument(fs, 'pantry/settings', "Lou's porch", 'setting');
    const scene = await createDocument(fs, 'bookshelf', 'Sunday Dinner');
    await writeDocument(fs, scene, { ...(await readDocument(fs, scene)), body: 'Lou stirred the greens.' });

    const index = new MemoryIndex();
    expect(await rebuildIndex(fs, index)).toBe(3);

    const all = await index.search('lou');
    expect(all.map((d) => d.path)).toEqual([porch, lou, scene]);
    const pantryOnly = await index.search('lou', { kinds: ['character', 'setting', 'research'] });
    expect(pantryOnly.map((d) => d.path)).toEqual([porch, lou]);
    expect(await index.search('lou greens')).toHaveLength(1);
    expect(await index.search('   ')).toEqual([]);
  });
});
