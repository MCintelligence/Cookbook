import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { backupName, dateOfBackup, listBackups, makeBackup, restoreBackup } from './autoBackup';
import { createBook, openBook } from './book';

describe('automatic backups', () => {
  it('names backups by when they were made', () => {
    const at = new Date(2026, 9, 22, 14, 5, 9);
    expect(backupName(at)).toBe('2026-10-22 14.05.09.zip');
    expect(dateOfBackup(backupName(at))).toEqual(at);
    expect(dateOfBackup('notes.zip')).toBeNull();
  });

  it('keeps only the newest ones, and restores a copy of the book', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', '---\ntitle: One\n---\nPie.\n');
    const backups = new MemoryAdapter();
    for (let i = 0; i < 4; i++) await makeBackup(book, backups, 'Supper', 3, new Date(2026, 9, 22, 10, i));
    const kept = await listBackups(backups, 'Supper');
    expect(kept.map((b) => b.date.getMinutes())).toEqual([3, 2, 1]);
    const copy = new MemoryAdapter();
    await restoreBackup(backups, kept[0]!, copy);
    expect((await openBook(copy)).title).toBe('Supper');
    expect(await copy.readText('bookshelf/One.md')).toContain('Pie.');
  });
});
