import { type StorageAdapter, joinPath, baseName } from './adapter';
import { type CookbookDocument, type DocumentKind, newId, parseDocument, serializeDocument } from './document';

/**
 * A book is a plain folder the writer owns:
 *
 *   My Book/
 *     book.json          title and format version
 *     bookshelf/         scenes, in nested folders (parts, chapters)
 *     pantry/
 *       characters/
 *       settings/
 *       research/
 *     .cookbook/         hidden index and undo history; always safe to delete
 *
 * Folders and files sort by name using natural order ("2" before "10"), so a
 * writer can reorder by renaming, even outside the app.
 */
export const BOOK_FILE = 'book.json';
export const HIDDEN_FOLDER = '.cookbook';
export const BOOKSHELF = 'bookshelf';
export const PANTRY = 'pantry';
export const PANTRY_SECTIONS = ['characters', 'settings', 'research'] as const;
export const FORMAT_VERSION = 1;

export interface BookInfo {
  format: number;
  title: string;
  created: string;
}

export interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: TreeNode[];
}

export async function createBook(fs: StorageAdapter, title: string, now = new Date()): Promise<BookInfo> {
  if (await fs.exists(BOOK_FILE)) throw new Error('There is already a book in this folder.');
  const info: BookInfo = { format: FORMAT_VERSION, title, created: now.toISOString() };
  await fs.makeFolder(BOOKSHELF);
  for (const section of PANTRY_SECTIONS) await fs.makeFolder(joinPath(PANTRY, section));
  await fs.makeFolder(HIDDEN_FOLDER);
  await fs.writeText(
    joinPath(HIDDEN_FOLDER, 'README.txt'),
    'Cookbook keeps its search index and undo history here.\nIt can be deleted safely; Cookbook rebuilds it from your files.\n',
  );
  await fs.writeText(BOOK_FILE, JSON.stringify(info, null, 2) + '\n');
  return info;
}

export async function openBook(fs: StorageAdapter): Promise<BookInfo> {
  if (!(await fs.exists(BOOK_FILE))) throw new Error('This folder is not a Cookbook book.');
  const info = JSON.parse(await fs.readText(BOOK_FILE)) as Partial<BookInfo>;
  if (typeof info.format !== 'number' || info.format > FORMAT_VERSION) {
    throw new Error('This book was made by a newer version of Cookbook.');
  }
  return { format: info.format, title: info.title ?? 'Untitled book', created: info.created ?? '' };
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function isVisible(name: string): boolean {
  return !name.startsWith('.') && !name.endsWith('.cookbook-tmp');
}

/** The Bookshelf or Pantry as a tree, folders first. */
export async function readTree(fs: StorageAdapter, folder: string): Promise<TreeNode[]> {
  const entries = (await fs.list(folder)).filter(
    (e) => isVisible(e.name) && (e.kind === 'folder' || e.name.endsWith('.md')),
  );
  entries.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1));
  return Promise.all(
    entries.map(async (e) => {
      const path = joinPath(folder, e.name);
      return e.kind === 'folder'
        ? { name: e.name, path, kind: e.kind, children: await readTree(fs, path) }
        : { name: e.name, path, kind: e.kind };
    }),
  );
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
