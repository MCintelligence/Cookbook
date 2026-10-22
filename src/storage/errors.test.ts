import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { BOOK_FILE, createBook, makeBookOrUndo } from './book';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('explains a folder Cookbook may not use, and keeps the original text', () => {
    const text = friendlyError(new Error('forbidden path: /home/june/.local/share/org.cookbook.app/books/My Book/.cookbook'));
    expect(text).toMatch(/^Cookbook isn't allowed to use that folder\./);
    expect(text).toContain('forbidden path');
  });

  it('explains a full disk and a missing folder', () => {
    expect(friendlyError(new DOMException('over', 'QuotaExceededError'))).toMatch(/^There's no room left/);
    expect(friendlyError('ENOENT: no such file or directory')).toMatch(/isn't there any more/);
  });

  it('passes anything else through unchanged', () => {
    expect(friendlyError(new Error('This folder is not a Cookbook book.'))).toBe('This folder is not a Cookbook book.');
  });
});

describe('makeBookOrUndo', () => {
  it('takes away what a failed start added, and leaves what was there before', async () => {
    const fs = new MemoryAdapter();
    await fs.writeText('notes.txt', 'mine');
    await expect(
      makeBookOrUndo(fs, async () => {
        await createBook(fs, 'Book');
        throw new Error('forbidden path');
      }),
    ).rejects.toThrow('forbidden path');
    expect((await fs.list('')).map((e) => e.name)).toEqual(['notes.txt']);
    expect(await fs.exists(BOOK_FILE)).toBe(false);
  });

  it('keeps the book when every step works', async () => {
    const fs = new MemoryAdapter();
    const info = await makeBookOrUndo(fs, () => createBook(fs, 'Book'));
    expect(info.title).toBe('Book');
    expect(await fs.exists(BOOK_FILE)).toBe(true);
  });
});
