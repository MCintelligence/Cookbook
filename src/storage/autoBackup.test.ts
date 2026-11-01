import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { MemoryAdapter } from './memory';
import { BackupCheckError, backupFolderName, backupName, backupsToKeep, dateOfBackup, listBackups, makeBackup, markClosed, markOpen, restoreBackup } from './autoBackup';
import { backupZip } from './backup';
import { createBook, openBook } from './book';
import { takeSnapshot } from './snapshots';
import { moveToTrash } from './trash';

const SUPPER = { title: 'Supper', id: '1a2b3c4d-0000-4000-8000-000000000000' };

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
    const now = new Date(2026, 9, 22, 10, 3);
    for (let i = 0; i < 4; i++) await makeBackup(book, backups, SUPPER, 3, new Date(2026, 9, 22, 10, i));
    const kept = await listBackups(backups, SUPPER);
    expect(kept.map((b) => b.date.getMinutes())).toEqual([3, 2, 1]);
    expect(kept[0]!.date).toEqual(now);
    const copy = new MemoryAdapter();
    await restoreBackup(backups, kept[0]!, copy);
    expect((await openBook(copy)).title).toBe('Supper');
    expect(await copy.readText('bookshelf/One.md')).toContain('Pie.');
  });

  it('files each book by its id, so two books with one title keep apart', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    const backups = new MemoryAdapter();
    const other = { title: 'Supper', id: '9f8e7d6c-0000-4000-8000-000000000000' };
    await makeBackup(book, backups, SUPPER, 1, new Date(2026, 9, 22, 10, 0));
    await makeBackup(book, backups, other, 1, new Date(2026, 9, 22, 10, 1));
    expect(backupFolderName(SUPPER)).toBe('Supper 1a2b3c4d');
    expect((await listBackups(backups, SUPPER)).map((b) => b.path)).toEqual(['Supper 1a2b3c4d/2026-10-22 10.00.00.zip']);
    expect((await listBackups(backups, other)).map((b) => b.path)).toEqual(['Supper 9f8e7d6c/2026-10-22 10.01.00.zip']);
  });

  it('takes its backups along when the book is renamed', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    const backups = new MemoryAdapter();
    await makeBackup(book, backups, SUPPER, 0, new Date(2026, 9, 22, 10, 0));
    const renamed = { ...SUPPER, title: 'Late Supper' };
    await makeBackup(book, backups, renamed, 0, new Date(2026, 9, 22, 11, 0));
    expect((await listBackups(backups, renamed)).map((b) => b.path)).toEqual(['Late Supper 1a2b3c4d/2026-10-22 11.00.00.zip', 'Late Supper 1a2b3c4d/2026-10-22 10.00.00.zip']);
    expect(await backups.exists('Supper 1a2b3c4d')).toBe(false);
  });

  it('still lists backups filed by title, but never removes them', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    const backups = new MemoryAdapter();
    await backups.makeFolder('Supper');
    await backups.writeBytes('Supper/2026-10-01 09.00.00.zip', await backupZip(book, 'Supper'));
    for (let i = 0; i < 3; i++) await makeBackup(book, backups, SUPPER, 1, new Date(2026, 9, 22, 10, i));
    const list = await listBackups(backups, SUPPER);
    expect(list.map((b) => [b.path, !!b.older])).toEqual([
      ['Supper 1a2b3c4d/2026-10-22 10.02.00.zip', false],
      ['Supper/2026-10-01 09.00.00.zip', true],
    ]);
  });

  it('keeps the newest few, one a day for a week and one a week for a month', () => {
    const now = new Date(2026, 9, 30, 18, 0); // a Friday
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
    const dates = [at(30, 17), at(30, 16), at(30, 15), at(29, 20), at(29, 9), at(27, 12), at(22, 12), at(21, 12), at(13, 12), at(12, 12), at(1, 12), at(1, 8)];
    const kept = [...backupsToKeep(dates, 2, now)].sort((a, b) => a - b).map((i) => dates[i]!.getDate() * 100 + dates[i]!.getHours());
    // 30 Oct 17h and 16h are the newest two; then the newest of 29 and 27 Oct (this week);
    // then the newest of each earlier week: 22 Oct (week of the 19th), 13 Oct (week of the 12th) and 1 Oct (week of 28 Sept).
    expect(kept).toEqual([3017, 3016, 2920, 2712, 2212, 1312, 112]);
    expect(backupsToKeep(dates, 0, now).size).toBe(dates.length);
  });

  it('notices a book left open when Cookbook stopped', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const where = { kind: 'opfs', name: 'Supper' };
    expect(markOpen(storage, where)).toBe(false);
    markClosed(storage, where);
    expect(markOpen(storage, where)).toBe(false);
    // Never closed: the next opening is after a crash.
    expect(markOpen(storage, where)).toBe(true);
  });
});

describe('what a backup holds', () => {
  it('includes snapshots and the trash, but not the index, undo history or half-written saves', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', '---\ntitle: One\n---\nPie.\n');
    await book.writeText('bookshelf/Two.md', '---\ntitle: Two\n---\nCake.\n');
    await book.writeText('bookshelf/One.md.cookbook-tmp', 'half');
    await takeSnapshot(book, { id: 'one', title: 'One', body: 'Pie.' }, 'by hand', new Date('2026-10-22T10:00:00Z'));
    await moveToTrash(book, 'bookshelf/Two.md', new Date('2026-10-22T11:00:00Z'));
    await book.makeFolder('.cookbook/undo');
    await book.writeText('.cookbook/undo/one.json', '{}');
    await book.writeBytes('.cookbook/index.sqlite', new Uint8Array([1, 2, 3]));
    const names = Object.keys(unzipSync(await backupZip(book, 'Supper')));
    expect(names).toEqual(expect.arrayContaining(['Supper/.cookbook/snapshots/one/2026-10-22T10-00-00-000Z.json', 'Supper/.cookbook/trash/trash.json']));
    expect(names.some((n) => n.startsWith('Supper/.cookbook/trash/') && n.endsWith('Two.md'))).toBe(true);
    expect(names.some((n) => n.includes('undo') || n.includes('index.sqlite') || n.includes('README.txt') || n.endsWith('.cookbook-tmp'))).toBe(false);
  });

  it('stores pictures as they are, with files in the same order every time', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    const picture = new Uint8Array(4096).map((_, i) => i % 7);
    await book.makeFolder('pantry/pictures');
    await book.writeBytes('pantry/pictures/June.jpg', picture);
    const first = await backupZip(book, 'Supper');
    const files = unzipSync(first);
    const names = Object.keys(files);
    expect(names).toEqual([...names].sort());
    expect(files['Supper/pantry/pictures/June.jpg']).toEqual(picture);
    // Stored, not compressed: the zip is at least as big as the picture.
    expect(first.length).toBeGreaterThan(picture.length);
    expect(strFromU8(files['Supper/book.json']!)).toContain('Supper');
  });
});

describe('a backup made while the writer works', () => {
  it('leaves out a file deleted while it was being read, instead of failing', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', '---\ntitle: One\n---\nPie.\n');
    await book.writeText('bookshelf/Gone.md', '---\ntitle: Gone\n---\nCrumbs.\n');
    const readBytes = book.readBytes.bind(book);
    book.readBytes = async (path: string) => {
      if (path === 'bookshelf/Gone.md') {
        await book.remove(path);
        throw new Error(`No such file: ${path}`);
      }
      return readBytes(path);
    };
    const names = Object.keys(unzipSync(await backupZip(book, 'Supper')));
    expect(names).toContain('Supper/bookshelf/One.md');
    expect(names).not.toContain('Supper/bookshelf/Gone.md');
  });

  it('still fails when a file is there but can’t be read', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', 'Pie.');
    book.readBytes = async () => {
      throw new Error('Permission denied');
    };
    await expect(backupZip(book, 'Supper')).rejects.toThrow('Permission denied');
  });

  it('keeps a backup only once it opens again whole, so a spoiled one never pushes out a good one', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', 'Pie.');
    const backups = new MemoryAdapter();
    await makeBackup(book, backups, SUPPER, 1, new Date(2026, 9, 22, 10, 0));
    // A disk that fills up part way: only half of each zip lands.
    const writeBytes = backups.writeBytes.bind(backups);
    backups.writeBytes = (path, data) => writeBytes(path, data.slice(0, data.length >> 1));
    const failed = makeBackup(book, backups, SUPPER, 1, new Date(2026, 9, 22, 11, 0));
    await expect(failed).rejects.toBeInstanceOf(BackupCheckError);
    await expect(failed).rejects.toThrow('won’t open');
    expect((await listBackups(backups, SUPPER)).map((b) => b.path)).toEqual(['Supper 1a2b3c4d/2026-10-22 10.00.00.zip']);
  });

  it('notices a backup that reads back different from what was written', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    await book.writeText('bookshelf/One.md', 'Pie.');
    const backups = new MemoryAdapter();
    // A disk that hands back an older or another file's bytes.
    const stale = await backupZip(book, 'Supper');
    await book.writeText('bookshelf/One.md', 'Pie and custard.');
    backups.readBytes = async () => stale;
    await expect(makeBackup(book, backups, SUPPER, 0, new Date(2026, 9, 22, 11, 0))).rejects.toThrow('“Supper/bookshelf/One.md” in it doesn’t match');
    expect(await listBackups(backups, SUPPER)).toEqual([]);
  });

  it('fails plainly when the backup folder is read-only or gone', async () => {
    const book = new MemoryAdapter();
    await createBook(book, 'Supper');
    const readOnly = new MemoryAdapter();
    readOnly.writeBytes = async () => {
      throw new Error('EROFS: read-only file system');
    };
    await expect(makeBackup(book, readOnly, SUPPER, 1)).rejects.toThrow('read-only');
    // A write that fails part way leaves nothing that could be taken for a backup.
    const full = new MemoryAdapter();
    const writeBytes = full.writeBytes.bind(full);
    full.writeBytes = async (path, data) => {
      await writeBytes(path, data.slice(0, 10));
      throw new Error('ENOSPC: no space left on device');
    };
    await expect(makeBackup(book, full, SUPPER, 1)).rejects.toThrow('no space');
    expect(await listBackups(full, SUPPER)).toEqual([]);
    const unplugged = new MemoryAdapter();
    unplugged.makeFolder = async () => {
      throw new Error('No such file or directory (os error 2)');
    };
    await expect(makeBackup(book, unplugged, SUPPER, 1)).rejects.toThrow('No such file');
  });
});
