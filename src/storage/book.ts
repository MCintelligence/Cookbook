import { type StorageAdapter, joinPath, baseName, parentOf } from './adapter';
import { type PageSettings, pageOf } from './page';
import { type CookbookDocument, type DocumentKind, newId, parseDocument, serializeDocument } from './document';
import { type Order, forgetItem, freeName, moveFolderKeys, placeItem, saveOrder, sortEntries } from './order';

/**
 * A book is a plain folder the writer owns:
 *
 *   My Book/
 *     book.json          title, format version, word goal and spelling
 *     writing-history.csv words written per day
 *     dictionary.txt     the writer's own words for the proofreader
 *     bookshelf/         pages, in nested folders (the Shelf's books: parts, chapters)
 *     recipes/           sources and notes that guide work on a page, each naming its page
 *     pantry/
 *       characters/
 *       settings/
 *       research/
 *     .cookbook/         hidden index, undo history and trash; safe to delete once the trash is empty
 *
 * The order of scenes and folders is kept in order.json (see order.ts).
 * Anything it does not list sorts by name in natural order ("2" before "10").
 */
export const BOOK_FILE = 'book.json';
export const HIDDEN_FOLDER = '.cookbook';
export const BOOKSHELF = 'bookshelf';
export const PANTRY = 'pantry';
/** Recipes: each one names the page it belongs to, and is listed under that page on the Shelf. */
export const RECIPES = 'recipes';
/**
 * Recipe notes are set aside for now: "recipe" names the whole project instead. Their files stay in
 * `recipes/` untouched, and turning this back on brings back Add note…, the Shelf listing and search.
 */
export const NOTES_ON = false;
export const PANTRY_SECTIONS = ['characters', 'settings', 'research'] as const;
export const FORMAT_VERSION = 1;

export interface BookInfo {
  format: number;
  title: string;
  created: string;
  /** Words a day the writer is aiming for. */
  dailyGoal?: number;
  /** American or British spelling, for the proofreader. */
  dialect?: 'en-US' | 'en-GB';
  /** Proofreader checks the writer switched off. */
  proofreadOff?: string[];
  /** The book's own id: files its backups, and tells readers a new e-book is the same book. Given to every book when it opens. */
  id?: string;
  /** Page size, margins, view and zoom; see page.ts. */
  page?: Partial<PageSettings>;
  /** Words the whole book is aiming for, and when by (YYYY-MM-DD). */
  bookTarget?: number;
  deadline?: string;
  /** Pasted words count as written. Off unless the writer says so. */
  countPasted?: boolean;
  /** Saturdays and Sundays without writing don't end a streak. */
  weekendsOff?: boolean;
  /** Seasonings: the characters picked, in the order shown, what Daniel tracks, and remarks removed for good. */
  seasonings?: SeasoningsInfo;
}

export interface SeasoningsInfo {
  chosen: string[];
  /** Paths of the pages and books Daniel tracks. */
  tracked: string[];
  /** Remarks the writer removed, by key; issues removed go in .cookbook/ignored.json with the rest. */
  gone: string[];
  /** Every seasoning switched off for now, without losing which are picked. */
  paused?: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const DEFAULT_DAILY_GOAL = 1000;

export interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: TreeNode[];
}

export async function createBook(fs: StorageAdapter, title: string, now = new Date()): Promise<BookInfo> {
  if (await fs.exists(BOOK_FILE)) throw new Error('There is already a recipe in this folder.');
  const info: BookInfo = { format: FORMAT_VERSION, title, created: now.toISOString(), id: newId() };
  await fs.makeFolder(BOOKSHELF);
  for (const section of PANTRY_SECTIONS) await fs.makeFolder(joinPath(PANTRY, section));
  await fs.makeFolder(HIDDEN_FOLDER);
  await fs.writeText(
    joinPath(HIDDEN_FOLDER, 'README.txt'),
    'Cookbook keeps its search index, undo history and trash here.\nIt can be deleted safely, though anything in trash/ goes with it; Cookbook rebuilds the rest from your files.\n',
  );
  await fs.writeText(BOOK_FILE, JSON.stringify(info, null, 2) + '\n');
  return info;
}

/**
 * Runs the steps that lay out a new book. If one fails, everything they added
 * to the folder is taken away again, so a failed start never leaves half a
 * book behind. Files that were already there are left alone.
 */
export async function makeBookOrUndo<T>(fs: StorageAdapter, steps: () => Promise<T>): Promise<T> {
  const before = new Set((await fs.list('').catch(() => [])).map((e) => e.name));
  try {
    return await steps();
  } catch (e) {
    for (const entry of await fs.list('').catch(() => [])) {
      if (!before.has(entry.name)) await fs.remove(entry.name).catch(() => {});
    }
    throw e;
  }
}

export async function openBook(fs: StorageAdapter): Promise<BookInfo> {
  if (!(await fs.exists(BOOK_FILE))) throw new Error('This folder is not a Cookbook recipe.');
  const info = JSON.parse(await fs.readText(BOOK_FILE)) as Partial<BookInfo>;
  if (typeof info.format !== 'number' || info.format > FORMAT_VERSION) {
    throw new Error('This recipe was made by a newer version of Cookbook.');
  }
  return {
    format: info.format,
    title: info.title ?? 'Untitled recipe',
    created: info.created ?? '',
    ...(typeof info.dailyGoal === 'number' && info.dailyGoal > 0 && { dailyGoal: info.dailyGoal }),
    ...((info.dialect === 'en-US' || info.dialect === 'en-GB') && { dialect: info.dialect }),
    ...(Array.isArray(info.proofreadOff) && { proofreadOff: info.proofreadOff.filter((r): r is string => typeof r === 'string') }),
    ...(typeof info.id === 'string' && { id: info.id }),
    ...(info.page && typeof info.page === 'object' && { page: pageOf(info.page) }),
    ...(typeof info.bookTarget === 'number' && info.bookTarget > 0 && { bookTarget: info.bookTarget }),
    ...(typeof info.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(info.deadline) && { deadline: info.deadline }),
    ...(typeof info.countPasted === 'boolean' && { countPasted: info.countPasted }),
    ...(typeof info.weekendsOff === 'boolean' && { weekendsOff: info.weekendsOff }),
    ...(info.seasonings && typeof info.seasonings === 'object' && {
      seasonings: {
        chosen: strings(info.seasonings.chosen),
        tracked: strings(info.seasonings.tracked),
        gone: strings(info.seasonings.gone),
        ...(info.seasonings.paused === true && { paused: true }),
      },
    }),
  };
}

/** Writes book.json, keeping any settings this version of Cookbook does not know about. */
export async function saveBookInfo(fs: StorageAdapter, info: BookInfo): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readText(BOOK_FILE)) as Record<string, unknown>;
  } catch {
    // A missing or damaged book.json is simply replaced.
  }
  await fs.writeText(BOOK_FILE, JSON.stringify({ ...existing, ...info }, null, 2) + '\n');
}

function isVisible(name: string): boolean {
  return !name.startsWith('.') && !name.endsWith('.cookbook-tmp');
}

/** The Bookshelf or Pantry as a tree, in the writer's order. */
export async function readTree(fs: StorageAdapter, folder: string, order: Order = {}): Promise<TreeNode[]> {
  const entries = (await fs.list(folder)).filter(
    (e) => isVisible(e.name) && (e.kind === 'folder' || e.name.endsWith('.md')),
  );
  return Promise.all(
    sortEntries(entries, order[folder]).map(async (e) => {
      const path = joinPath(folder, e.name);
      return e.kind === 'folder'
        ? { name: e.name, path, kind: e.kind, children: await readTree(fs, path, order) }
        : { name: e.name, path, kind: e.kind };
    }),
  );
}

/** What a folder holds, in order. `root` is the folder the tree was read from. */
export function childrenOf(nodes: TreeNode[], root: string, folder: string): TreeNode[] {
  if (folder === root) return nodes;
  for (const n of nodes) {
    if (n.kind !== 'folder') continue;
    if (n.path === folder) return n.children ?? [];
    if (folder.startsWith(n.path + '/')) return childrenOf(n.children ?? [], n.path, folder);
  }
  return [];
}

/**
 * Moves a scene or folder to `index` among what `folder` holds now (counting
 * the item itself if it is already there). The file is renamed only when
 * another one in the new folder has its name.
 */
export async function moveItem(
  fs: StorageAdapter,
  order: Order,
  tree: TreeNode[],
  root: string,
  from: string,
  folder: string,
  index: number,
): Promise<{ path: string; order: Order }> {
  if (folder === from || folder.startsWith(from + '/')) throw new Error('A group cannot go inside itself.');
  const current = childrenOf(tree, root, folder).map((n) => n.name);
  let name = baseName(from);
  let path = from;
  let next = order;
  if (parentOf(from) === folder) {
    const was = current.indexOf(name);
    if (was !== -1 && was < index) index--;
  } else {
    name = await freeName(fs, folder, name);
    path = joinPath(folder, name);
    await fs.rename(from, path);
    next = moveFolderKeys(forgetItem(next, from), from, path);
  }
  next = placeItem(next, folder, current, name, index);
  await saveOrder(fs, next);
  return { path, order: next };
}

/** Renames a folder in place, keeping its spot. */
export async function renameFolder(fs: StorageAdapter, order: Order, tree: TreeNode[], root: string, from: string, title: string): Promise<{ path: string; order: Order }> {
  const folder = parentOf(from);
  const wanted = fileNameFor(title);
  if (wanted === baseName(from)) return { path: from, order };
  const name = await freeName(fs, folder, wanted);
  const current = childrenOf(tree, root, folder).map((n) => (n.path === from ? name : n.name));
  const path = joinPath(folder, name);
  await fs.rename(from, path);
  const next = placeItem(moveFolderKeys(order, from, path), folder, current, name, current.indexOf(name));
  await saveOrder(fs, next);
  return { path, order: next };
}

/** Puts a newly made scene, card or folder right after `after`, or at the end of its folder. */
export async function placeNew(fs: StorageAdapter, order: Order, tree: TreeNode[], root: string, path: string, after: string | null): Promise<Order> {
  const folder = parentOf(path);
  const current = childrenOf(tree, root, folder).map((n) => n.name).filter((n) => n !== baseName(path));
  const at = after && parentOf(after) === folder ? current.indexOf(baseName(after)) + 1 : current.length;
  const next = placeItem(order, folder, current, baseName(path), at > 0 ? at : current.length);
  await saveOrder(fs, next);
  return next;
}

/**
 * Copies a scene, card or folder (with everything in it) to just after the
 * original, named "… copy". Every copied file gets a new id, so links and
 * notes keep pointing at the original.
 */
export async function duplicateItem(fs: StorageAdapter, order: Order, tree: TreeNode[], root: string, from: string): Promise<{ path: string; order: Order }> {
  const folder = parentOf(from);
  const isFile = (await fs.list(folder)).some((e) => e.name === baseName(from) && e.kind === 'file');
  const stem = baseName(from).replace(/\.md$/, '');
  const name = await freeName(fs, folder, isFile ? `${stem} copy.md` : `${stem} copy`);
  const to = joinPath(folder, name);
  let next = order;
  const copy = async (src: string, dst: string, kind: 'file' | 'folder', top: boolean) => {
    if (kind === 'file') {
      const doc = await readDocument(fs, src);
      await writeDocument(fs, dst, { ...doc, id: newId(), title: top ? `${doc.title} copy` : doc.title });
      return;
    }
    await fs.makeFolder(dst);
    if (order[src]) next = { ...next, [dst]: [...order[src]] };
    for (const e of await fs.list(src)) if (e.kind === 'folder' || e.name.endsWith('.md')) await copy(joinPath(src, e.name), joinPath(dst, e.name), e.kind, false);
  };
  await copy(from, to, isFile ? 'file' : 'folder', true);
  return { path: to, order: await placeNew(fs, next, tree, root, to, from) };
}

/** Puts what a folder holds in name order, A to Z or Z to A. */
export async function sortFolder(fs: StorageAdapter, order: Order, tree: TreeNode[], root: string, folder: string, descending = false): Promise<Order> {
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const names = childrenOf(tree, root, folder)
    .map((n) => n.name)
    .sort((a, b) => collator.compare(a.replace(/\.md$/, ''), b.replace(/\.md$/, '')) * (descending ? -1 : 1));
  const next = { ...order, [folder]: names };
  await saveOrder(fs, next);
  return next;
}

/** Makes a new folder, named "New group" (or "New group 2"…), and returns its path. */
export async function createFolder(fs: StorageAdapter, parent: string, title = 'New group'): Promise<string> {
  const path = joinPath(parent, await freeName(fs, parent, fileNameFor(title)));
  await fs.makeFolder(path);
  return path;
}

export async function readDocument(fs: StorageAdapter, path: string): Promise<CookbookDocument> {
  return parseDocument(await fs.readText(path), baseName(path).replace(/\.md$/, ''));
}

export async function writeDocument(fs: StorageAdapter, path: string, doc: CookbookDocument): Promise<void> {
  await fs.writeText(path, serializeDocument(doc));
}

/** A file name that is safe on Windows, macOS, Linux, iOS and Android. */
export function fileNameFor(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return (cleaned || 'Untitled').slice(0, 80);
}

/** Creates a new scene or card in a folder and returns its path. */
export async function createDocument(
  fs: StorageAdapter,
  folder: string,
  title: string,
  kind: DocumentKind = 'scene',
): Promise<string> {
  const stem = fileNameFor(title);
  let path = joinPath(folder, `${stem}.md`);
  for (let n = 2; await fs.exists(path); n++) path = joinPath(folder, `${stem} ${n}.md`);
  await writeDocument(fs, path, { id: newId(), title, kind, fields: {}, body: '' });
  return path;
}

export function* walkFiles(nodes: TreeNode[]): Generator<TreeNode> {
  for (const node of nodes) {
    if (node.kind === 'file') yield node;
    else yield* walkFiles(node.children ?? []);
  }
}

/** The file that follows `path` in its folder, if any. */
export function fileAfter(nodes: TreeNode[], path: string): TreeNode | null {
  const i = nodes.findIndex((n) => n.path === path);
  if (i !== -1) return nodes.slice(i + 1).find((n) => n.kind === 'file') ?? null;
  const folder = nodes.find((n) => n.kind === 'folder' && path.startsWith(n.path + '/'));
  return folder ? fileAfter(folder.children ?? [], path) : null;
}

export { moveToTrash } from './trash';
