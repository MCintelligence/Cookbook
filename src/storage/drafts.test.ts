import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { DRAFTS, deleteDraft, draftsOf, ghostParagraphs, listDrafts, readDraft, saveDraft, writeDraft } from './drafts';
import { BOOKSHELF, readTree, walkFiles } from './book';
import { backupEntries } from './backup';
import { blankShelf } from './library';

describe('drafts', () => {
  it('numbers each Item’s drafts and keeps them by its id, outside the Shelf', async () => {
    const fs = new MemoryAdapter();
    await fs.makeFolder(BOOKSHELF);
    const item = { id: 'abc', title: 'Supper', body: 'Pie.\n', notes: { n1: 'Check the pie.' } };
    expect(await saveDraft(fs, item, new Date('2026-11-04T10:00:00Z'))).toBe(1);
    expect(await saveDraft(fs, { ...item, body: 'Pie and grits.\n' })).toBe(2);
    expect(draftsOf(await listDrafts(fs), 'abc')).toEqual([1, 2]);
    const first = await readDraft(fs, 'abc', 1);
    expect(first).toMatchObject({ n: 1, title: 'Draft 1', body: 'Pie.\n', notes: { n1: 'Check the pie.' } });
    expect(first.date?.toISOString()).toBe('2026-11-04T10:00:00.000Z');
    // Nothing on the Shelf: drafts never reach the word count, Mise en Place or export.
    expect([...walkFiles(await readTree(fs, BOOKSHELF))]).toEqual([]);
    expect(await fs.exists(`${DRAFTS}/abc/Draft 1.md`)).toBe(true);
  });

  it('numbers on after the highest, and drops an Item’s folder with its last draft', async () => {
    const fs = new MemoryAdapter();
    const item = { id: 'abc', title: 'Supper', body: 'Pie.\n' };
    await saveDraft(fs, item);
    await saveDraft(fs, item);
    await deleteDraft(fs, 'abc', 1);
    expect(await saveDraft(fs, item)).toBe(3);
    const gone = await readDraft(fs, 'abc', 2);
    await deleteDraft(fs, 'abc', 2);
    await deleteDraft(fs, 'abc', 3);
    expect((await listDrafts(fs)).size).toBe(0);
    expect(await fs.exists(`${DRAFTS}/abc`)).toBe(false);
    // Undo puts a deleted draft back under its own number.
    await writeDraft(fs, 'abc', 'Supper', gone);
    expect(draftsOf(await listDrafts(fs), 'abc')).toEqual([2]);
  });

  it('goes into backups, and is left out of a template made without text', async () => {
    const fs = new MemoryAdapter();
    await fs.makeFolder(BOOKSHELF);
    await saveDraft(fs, { id: 'abc', title: 'Supper', body: 'Pie.\n' });
    expect((await backupEntries(fs, 'Book')).map((e) => e.name)).toContain('Book/drafts/abc/Draft 1.md');
    await blankShelf(fs);
    expect(await fs.exists(DRAFTS)).toBe(false);
  });

  it('shows paragraphs as ghost text, without blank lines or scene breaks', () => {
    expect(ghostParagraphs('One.\n\n  Two.  \n***\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });
});
