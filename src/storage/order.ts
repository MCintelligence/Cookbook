import { type StorageAdapter, baseName, joinPath, parentOf } from './adapter';

/**
 * The order of scenes and folders on the Bookshelf (and in the Pantry) is kept
 * in `order.json`, beside `book.json`:
 *
 *   {
 *     "bookshelf": ["Part one", "Part two"],
 *     "bookshelf/Part one": ["Supper.md", "Chapter 2"]
 *   }
 *
 * Each folder lists the names it holds, in order. Anything not listed (a file
 * added outside Cookbook, say) comes after the listed names in name order, so
 * losing or hand-editing the file never hides anything.
 */
export const ORDER_FILE = 'order.json';

export type Order = Record<string, string[]>;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
// Compare names without ".md", so "Supper" comes before "Supper, part 2".
const stem = (name: string) => name.replace(/\.md$/, '');

export async function loadOrder(fs: StorageAdapter): Promise<Order> {
  try {
    const parsed: unknown = JSON.parse(await fs.readText(ORDER_FILE));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const order: Order = {};
    for (const [folder, names] of Object.entries(parsed)) {
      if (Array.isArray(names)) order[folder] = names.filter((n): n is string => typeof n === 'string');
    }
    return order;
  } catch {
    return {};
  }
}

export async function saveOrder(fs: StorageAdapter, order: Order): Promise<void> {
  const tidy = Object.fromEntries(Object.entries(order).filter(([, names]) => names.length > 0).sort(([a], [b]) => collator.compare(a, b)));
  await fs.writeText(ORDER_FILE, JSON.stringify(tidy, null, 2) + '\n');
}

/** Listed names first, in their order; then the rest, folders first, in natural name order. */
export function sortEntries<T extends { name: string; kind: 'file' | 'folder' }>(entries: T[], listed: string[] = []): T[] {
  const rank = new Map(listed.map((name, i) => [name, i]));
  return [...entries].sort((a, b) => {
    const ra = rank.get(a.name);
    const rb = rank.get(b.name);
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    return a.kind === b.kind ? collator.compare(stem(a.name), stem(b.name)) : a.kind === 'folder' ? -1 : 1;
  });
}

/**
 * Puts `name` at `index` in a folder. `current` is what the folder shows now,
 * in order; the whole list is written so later additions cannot shuffle it.
 */
export function placeItem(order: Order, folder: string, current: string[], name: string, index: number): Order {
  const names = current.filter((n) => n !== name);
  names.splice(Math.max(0, Math.min(index, names.length)), 0, name);
  return { ...order, [folder]: names };
}

export function forgetItem(order: Order, path: string): Order {
  const folder = parentOf(path);
  const listed = order[folder];
  if (!listed) return order;
  return { ...order, [folder]: listed.filter((n) => n !== baseName(path)) };
}

/** Follows a renamed or moved folder: its own list and those of every folder inside it. */
export function moveFolderKeys(order: Order, from: string, to: string): Order {
  const next: Order = {};
  for (const [key, names] of Object.entries(order)) {
    if (key === from || key.startsWith(from + '/')) next[to + key.slice(from.length)] = names;
    else next[key] = names;
  }
  return next;
}

/** A name that is free in `folder`, adding " 2", " 3"… before the extension (".md" unless given) when needed. */
export async function freeName(fs: StorageAdapter, folder: string, name: string, extension = name.endsWith('.md') ? '.md' : ''): Promise<string> {
  const base = extension && name.endsWith(extension) ? name.slice(0, -extension.length) : name;
  let candidate = name;
  for (let n = 2; await fs.exists(joinPath(folder, candidate)); n++) candidate = `${base} ${n}${extension}`;
  return candidate;
}
