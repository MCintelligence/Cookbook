// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { createBook, openBook, readDocument, readTree, walkFiles, writeDocument } from './book';
import { applyBookTemplate } from './templates';
import { blankShelf, copyRecipe, firstLines, freeName, loadTemplates, outlineOf, renameCopy, saveTemplates } from './library';
import { forgetBook, putBackBook, recentBooks, rememberBook, updateRecent } from './platform';
import { editedLabel } from '../ui/BookLibrary';

async function novel() {
  const fs = new MemoryAdapter();
  await createBook(fs, 'The Salt Road');
  await applyBookTemplate(fs, 'novel');
  const path = 'bookshelf/Group 1/Item 1.md';
  await writeDocument(fs, path, { ...(await readDocument(fs, path)), body: 'The tide had gone out further than June had ever seen it.\n' });
  await fs.writeText('.cookbook/undo.json', '{}');
  return fs;
}

describe('copying a recipe', () => {
  it('copies everything but the hidden folder, and gives the copy its own title and id', async () => {
    const from = await novel();
    const to = new MemoryAdapter();
    await copyRecipe(from, to);
    const info = await renameCopy(to, { title: 'The Salt Road copy', series: 'The Salt Road' });
    expect(info.title).toBe('The Salt Road copy');
    expect(info.id).not.toBe((await openBook(from)).id);
    expect(await to.exists('.cookbook')).toBe(true);
    expect(await to.exists('.cookbook/undo.json')).toBe(false);
    const files = [...walkFiles(await readTree(to, 'bookshelf')), ...walkFiles(await readTree(to, 'pantry'))].map((f) => f.path);
    expect(files).toEqual(['bookshelf/Group 1/Item 1.md', 'pantry/characters/Main character.md', 'pantry/settings/Main setting.md']);
    expect((await openBook(to)).series).toBe('The Salt Road');
  });

  it('will not copy over another recipe', async () => {
    const from = await novel();
    const to = new MemoryAdapter();
    await createBook(to, 'Already here');
    await expect(copyRecipe(from, to)).rejects.toThrow(/already a recipe/);
  });

  it('can leave out the text of the Items, for a template', async () => {
    const fs = await novel();
    await blankShelf(fs);
    expect((await readDocument(fs, 'bookshelf/Group 1/Item 1.md')).body).toBe('');
    expect((await readDocument(fs, 'bookshelf/Group 1/Item 1.md')).title).toBe('Item 1');
  });

  it('reads the first lines and the outline', async () => {
    const fs = await novel();
    expect(await firstLines(fs, await readTree(fs, 'bookshelf'), (md) => md, 20)).toBe('The tide had gone…');
    expect(await outlineOf(fs)).toEqual({
      shelf: [
        { name: 'Group 1', group: true, depth: 0 },
        { name: 'Item 1', group: false, depth: 1 },
      ],
      pantry: [
        { name: 'Main character', kind: 'character' },
        { name: 'Main setting', kind: 'setting' },
      ],
    });
  });
});

describe('the list of recipes', () => {
  beforeEach(() => localStorage.clear());
  const a = { kind: 'browser' as const, name: 'A' };
  const b = { kind: 'browser' as const, name: 'B' };

  it('keeps what it noted when a recipe is opened again, and takes it out of Trash', () => {
    rememberBook({ location: a, title: 'A' });
    updateRecent(a, { words: 120, favourite: true, trashed: 5 });
    rememberBook({ location: b, title: 'B' });
    rememberBook({ location: a, title: 'A' });
    expect(recentBooks()).toEqual([{ location: a, title: 'A', words: 120, favourite: true }, { location: b, title: 'B' }]);
  });

  it('clears a note set to undefined, and puts back a recipe taken off the list', () => {
    rememberBook({ location: a, title: 'A' });
    updateRecent(a, { archived: true });
    updateRecent(a, { archived: undefined });
    expect(recentBooks()[0]).toEqual({ location: a, title: 'A' });
    const kept = recentBooks()[0]!;
    forgetBook(a);
    expect(recentBooks()).toEqual([]);
    putBackBook(kept);
    expect(recentBooks()).toEqual([kept]);
  });
});

describe('templates', () => {
  beforeEach(() => localStorage.clear());

  it('starts with one group and moves a template whose group is gone to the first one', () => {
    expect(loadTemplates()).toEqual({ groups: [{ id: 'yours', name: 'Yours' }], templates: [] });
    saveTemplates({
      groups: [{ id: 'g1', name: 'Series' }],
      templates: [{ id: 't', name: 'Salt Road book', group: 'lost', location: { kind: 'browser', name: '.templates/x' } }],
    });
    expect(loadTemplates().templates[0]!.group).toBe('g1');
  });

  it('finds a free name', () => {
    const taken = new Set(['Lantern Street', 'Lantern Street 2']);
    expect(freeName('Lantern Street', (n) => taken.has(n))).toBe('Lantern Street 3');
    expect(freeName('Winter', (n) => taken.has(n))).toBe('Winter');
  });
});

describe('edited labels', () => {
  const now = new Date(2026, 9, 31, 15, 0).getTime();
  it('reads like a person would say it', () => {
    expect(editedLabel(undefined, now)).toBe('Not opened here yet');
    expect(editedLabel(now - 30_000, now)).toBe('Just now');
    expect(editedLabel(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(editedLabel(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(editedLabel(new Date(2026, 9, 30, 20, 0).getTime(), now)).toBe('Yesterday');
    expect(editedLabel(new Date(2026, 9, 27, 9, 0).getTime(), now)).toBe('4 days ago');
  });
});
