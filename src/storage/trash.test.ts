import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { createBook, createDocument, readTree } from './book';
import { type Order, saveOrder } from './order';
import { TRASH, deleteFromTrash, emptyTrash, listTrash, moveToTrash, restoreFromTrash } from './trash';

async function book() {
  const fs = new MemoryAdapter();
  await createBook(fs, 'Book');
  await fs.makeFolder('bookshelf/Chapter 1');
  for (const t of ['One', 'Two', 'Three']) await createDocument(fs, 'bookshelf/Chapter 1', t);
  const order: Order = { 'bookshelf/Chapter 1': ['Three.md', 'Two.md', 'One.md'] };
  await saveOrder(fs, order);
  return { fs, order };
}

const names = async (fs: MemoryAdapter, order: Order) => (await readTree(fs, 'bookshelf', order))[0]!.children!.map((n) => n.name);

describe('trash', () => {
  it('puts a scene back exactly where it was', async () => {
    const { fs, order } = await book();
    const shown = await names(fs, order);
    const gone = await moveToTrash(fs, 'bookshelf/Chapter 1/Two.md', new Date('2026-10-22T09:00:00Z'), order, shown);
    expect(await names(fs, gone.order)).toEqual(['Three.md', 'One.md']);
    expect(await listTrash(fs)).toMatchObject([{ from: 'bookshelf/Chapter 1/Two.md', kind: 'file', index: 1 }]);

    const back = await restoreFromTrash(fs, gone.name, gone.order, () => ['Three.md', 'One.md']);
    expect(back.path).toBe('bookshelf/Chapter 1/Two.md');
    expect(await names(fs, back.order)).toEqual(['Three.md', 'Two.md', 'One.md']);
    expect(await listTrash(fs)).toEqual([]);
  });

  it('remakes a missing folder and never overwrites a scene with the same name', async () => {
    const { fs, order } = await book();
    const gone = await moveToTrash(fs, 'bookshelf/Chapter 1/One.md', new Date(), order, ['Three.md', 'Two.md', 'One.md']);
    await createDocument(fs, 'bookshelf/Chapter 1', 'One');
    const back = await restoreFromTrash(fs, gone.name, gone.order, () => ['Three.md', 'Two.md', 'One.md']);
    expect(back.path).toBe('bookshelf/Chapter 1/One 2.md');

    const folder = await moveToTrash(fs, 'bookshelf/Chapter 1', new Date(), back.order, ['Chapter 1']);
    expect(await fs.exists('bookshelf/Chapter 1')).toBe(false);
    // The folder's own order travels with it.
    expect(folder.order[`${TRASH}/${folder.name}`]).toBeDefined();
    const again = await restoreFromTrash(fs, folder.name, folder.order, () => []);
    expect(again.path).toBe('bookshelf/Chapter 1');
    expect(await names(fs, again.order)).toEqual(['Three.md', 'Two.md', 'One 2.md', 'One.md']);
  });

  it('keeps two deletions of the same name apart, newest first', async () => {
    const { fs } = await book();
    const at = new Date('2026-10-22T09:00:00Z');
    const a = await moveToTrash(fs, 'bookshelf/Chapter 1/One.md', at);
    await createDocument(fs, 'bookshelf/Chapter 1', 'One');
    const b = await moveToTrash(fs, 'bookshelf/Chapter 1/One.md', at);
    expect(a.name).not.toBe(b.name);
    await moveToTrash(fs, 'bookshelf/Chapter 1/Two.md', new Date('2026-10-22T10:00:00Z'));
    expect((await listTrash(fs)).map((t) => t.from)).toEqual(['bookshelf/Chapter 1/Two.md', 'bookshelf/Chapter 1/One.md', 'bookshelf/Chapter 1/One.md']);
  });

  it('deletes one item, or everything, for good', async () => {
    const { fs } = await book();
    const a = await moveToTrash(fs, 'bookshelf/Chapter 1/One.md');
    await moveToTrash(fs, 'bookshelf/Chapter 1/Two.md');
    await deleteFromTrash(fs, a.name);
    expect((await listTrash(fs)).map((t) => t.from)).toEqual(['bookshelf/Chapter 1/Two.md']);
    await emptyTrash(fs);
    expect(await listTrash(fs)).toEqual([]);
    expect(await fs.exists(TRASH)).toBe(false);
  });

  it('still lists things an older version put in the trash', async () => {
    const { fs } = await book();
    await fs.makeFolder(TRASH);
    await fs.rename('bookshelf/Chapter 1/One.md', `${TRASH}/2026-01-01T00-00-00-000Z One.md`);
    const [item] = await listTrash(fs);
    expect(item).toMatchObject({ from: 'bookshelf/One.md', index: -1 });
    const back = await restoreFromTrash(fs, item!.name, {}, () => []);
    expect(back.path).toBe('bookshelf/One.md');
  });
});
