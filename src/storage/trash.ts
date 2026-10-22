import { type StorageAdapter, baseName, joinPath, parentOf } from './adapter';
import { type Order, forgetItem, freeName, moveFolderKeys, placeItem, saveOrder } from './order';

/**
 * Deleted scenes and folders go to `.cookbook/trash/`, with a list of where
 * each came from so it can be put back. Nothing leaves the disk until the
 * writer empties the trash.
 */
export const TRASH = '.cookbook/trash';
const MANIFEST = joinPath(TRASH, 'trash.json');

export interface TrashItem {
  /** Its name inside the trash folder. */
  name: string;
  /** Where it was, relative to the book. */
  from: string;
  kind: 'file' | 'folder';
  /** Its place among what its folder showed, so it goes back where it was; -1 for the end. */
  index: number;
  /** ISO time it was deleted. */
  at: string;
}

export async function listTrash(fs: StorageAdapter): Promise<TrashItem[]> {
  let listed: TrashItem[] = [];
  try {
    const parsed: unknown = JSON.parse(await fs.readText(MANIFEST));
    if (Array.isArray(parsed)) listed = parsed.filter((t): t is TrashItem => t && typeof t.name === 'string' && typeof t.from === 'string');
  } catch {
    // No list yet, or a damaged one: fall back to what is on disk.
  }
  if (!(await fs.exists(TRASH))) return [];
  const onDisk = (await fs.list(TRASH)).filter((e) => e.name !== 'trash.json');
  const known = new Map(listed.map((t) => [t.name, t]));
  // Anything on disk the list doesn't know (an older Cookbook put it there) still shows, and goes back to the Bookshelf.
  return onDisk
    .map((e) => known.get(e.name) ?? { name: e.name, from: joinPath('bookshelf', e.name.replace(/^\S+ /, '')), kind: e.kind, index: -1, at: '' })
    .sort((a, b) => b.at.localeCompare(a.at));
}

async function saveTrash(fs: StorageAdapter, items: TrashItem[]): Promise<void> {
  await fs.writeText(MANIFEST, JSON.stringify(items, null, 2) + '\n');
}

/**
 * Moves a scene or folder into the trash. `current` is what its folder shows
 * now, in order. Returns the order without it.
 */
export async function moveToTrash(fs: StorageAdapter, path: string, now = new Date(), order: Order = {}, current: string[] = []): Promise<{ name: string; order: Order }> {
  await fs.makeFolder(TRASH);
  const items = await listTrash(fs);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const name = await freeName(fs, TRASH, `${stamp} ${baseName(path)}`, '');
  const kind = (await fs.list(parentOf(path))).find((e) => e.name === baseName(path))?.kind ?? 'file';
  await fs.rename(path, joinPath(TRASH, name));
  const index = current.indexOf(baseName(path));
  await saveTrash(fs, [{ name, from: path, kind, index, at: now.toISOString() }, ...items]);
  // A trashed folder's own order lists go with it, under its trash name.
  const next = forgetItem(kind === 'folder' ? moveFolderKeys(order, path, joinPath(TRASH, name)) : order, path);
  await saveOrder(fs, next);
  return { name, order: next };
}

/**
 * Puts an item back where it came from, making its folder again if that is
 * gone and adding " 2" if the name is taken. `current` maps a folder to what
 * it shows now. Returns where it landed and the order with it in place.
 */
export async function restoreFromTrash(
  fs: StorageAdapter,
  name: string,
  order: Order,
  current: (folder: string) => string[] | Promise<string[]>,
): Promise<{ path: string; order: Order }> {
  const items = await listTrash(fs);
  const item = items.find((t) => t.name === name);
  if (!item) throw new Error('That is no longer in the trash.');
  const folder = parentOf(item.from);
  await fs.makeFolder(folder);
  const free = await freeName(fs, folder, baseName(item.from), item.kind === 'file' && item.from.endsWith('.md') ? '.md' : '');
  const path = joinPath(folder, free);
  await fs.rename(joinPath(TRASH, name), path);
  await saveTrash(fs, items.filter((t) => t.name !== name));
  const shown = (await current(folder)).filter((n) => n !== free);
  let next = item.kind === 'folder' ? moveFolderKeys(order, joinPath(TRASH, name), path) : order;
  next = placeItem(next, folder, shown, free, item.index >= 0 ? item.index : shown.length);
  await saveOrder(fs, next);
  return { path, order: next };
}

/** Deletes one item for good. */
export async function deleteFromTrash(fs: StorageAdapter, name: string, order: Order = {}): Promise<Order> {
  const items = await listTrash(fs);
  await fs.remove(joinPath(TRASH, name));
  await saveTrash(fs, items.filter((t) => t.name !== name));
  const next = dropKeys(order, joinPath(TRASH, name));
  await saveOrder(fs, next);
  return next;
}

/** Deletes everything in the trash for good. */
export async function emptyTrash(fs: StorageAdapter, order: Order = {}): Promise<Order> {
  if (await fs.exists(TRASH)) await fs.remove(TRASH);
  const next = dropKeys(order, TRASH);
  await saveOrder(fs, next);
  return next;
}

function dropKeys(order: Order, under: string): Order {
  return Object.fromEntries(Object.entries(order).filter(([k]) => k !== under && !k.startsWith(under + '/')));
}
