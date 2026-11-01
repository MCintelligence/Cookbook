import { type StorageAdapter, baseName } from './adapter';
import { MemoryAdapter } from './memory';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Where a book lives:
 * - `browser`: inside the browser's private storage, by folder name.
 * - `folder`: a folder on disk, in the desktop and mobile apps.
 * - `picked`: a folder on disk the writer chose in the browser (Chrome and Edge),
 *   remembered by the browser so it can be opened again.
 */
export type BookLocation =
  | { kind: 'browser'; name: string }
  | { kind: 'folder'; path: string }
  | { kind: 'picked'; id: string; name: string };

export interface RecentBook {
  location: BookLocation;
  title: string;
  /** What Your Recipes shows without opening the recipe, noted while it was last open. */
  edited?: number;
  words?: number;
  goal?: number;
  series?: string;
  seriesNumber?: number;
  firstLines?: string;
  favourite?: boolean;
  archived?: boolean;
  /** When it went to Trash; the files stay until the writer deletes it for good. */
  trashed?: number;
}

export interface OpenedStorage {
  fs: StorageAdapter;
  where: string;
}

export const DEFAULT_BOOK = 'My Book';
const RECENT_KEY = 'cookbook.recentBooks';
/** Every recipe the writer has opened is kept, so All recipes can list them. */
const MAX_RECENT = 500;

export function sameLocation(a: BookLocation, b: BookLocation): boolean {
  if (a.kind === 'browser' && b.kind === 'browser') return a.name === b.name;
  if (a.kind === 'folder' && b.kind === 'folder') return a.path === b.path;
  if (a.kind === 'picked' && b.kind === 'picked') return a.id === b.id;
  return false;
}

export function describeLocation(location: BookLocation): string {
  if (location.kind === 'browser') return 'In this browser';
  if (location.kind === 'picked') return `Folder “${location.name}”`;
  return location.path;
}

/** Most recent first. Kept in local storage; losing it only empties the list. */
export function recentBooks(): RecentBook[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentBook[]).filter((b) => b && typeof b.title === 'string' && b.location) : [];
  } catch {
    return [];
  }
}

function saveRecent(books: RecentBook[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(books.slice(0, MAX_RECENT)));
  } catch {
    // Private windows may refuse; the book still opens.
  }
}

/** Moves the book to the top of the list, keeping what was noted about it before. Opening a book takes it out of Trash. */
export function rememberBook(book: RecentBook): void {
  const books = recentBooks();
  const old = books.find((b) => sameLocation(b.location, book.location));
  const { trashed: _gone, ...kept } = { ...old, ...book };
  saveRecent([kept, ...books.filter((b) => b !== old)]);
}

/** Notes something about a book without moving it in the list. */
export function updateRecent(location: BookLocation, changes: Partial<Omit<RecentBook, 'location'>> & { location?: BookLocation }): void {
  const books = recentBooks();
  const i = books.findIndex((b) => sameLocation(b.location, location));
  if (i === -1) return;
  const next = { ...books[i]!, ...changes };
  // An undefined change clears the note, so JSON does not keep it.
  for (const key of Object.keys(next) as (keyof RecentBook)[]) if (next[key] === undefined) delete next[key];
  books[i] = next;
  saveRecent(books);
}

export function forgetBook(location: BookLocation): void {
  saveRecent(recentBooks().filter((b) => !sameLocation(b.location, location)));
}

/** Puts a book taken off the list back, at the end, with everything noted about it. */
export function putBackBook(book: RecentBook): void {
  saveRecent([...recentBooks().filter((b) => !sameLocation(b.location, book.location)), book]);
}

/** Whether the book's folder can still be found. A folder the browser remembers counts as found: checking it would need a click. */
export async function bookExists(location: BookLocation): Promise<boolean> {
  try {
    if (location.kind === 'folder') {
      const { exists } = await import('@tauri-apps/plugin-fs');
      return await exists(`${location.path.replace(/[\\/]+$/, '')}/book.json`);
    }
    if (location.kind === 'picked') return (await loadHandle(location.id)) !== undefined;
    if (!hasBrowserStorage()) return true;
    return (await browserBooks()).includes(location.name);
  } catch {
    return false;
  }
}

/** Deletes a book kept in the browser's own storage, which has no other copy. Folders on disk are never deleted. */
export async function deleteBrowserBook(name: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const books = await root.getDirectoryHandle('books');
  let dir = books;
  const parts = name.split('/');
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  await dir.removeEntry(parts[parts.length - 1]!, { recursive: true });
}

/** Where Cookbook keeps the writer's own templates: in its own data folder, or in a hidden folder beside the browser's books. */
export async function templateLocation(name: string): Promise<BookLocation> {
  if (isTauri()) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    return { kind: 'folder', path: await join(await appDataDir(), 'templates', name) };
  }
  return { kind: 'browser', name: `.templates/${name}` };
}

/** The book to open when nothing else is remembered. */
export function defaultLocation(): Promise<BookLocation> {
  return newBookLocation(DEFAULT_BOOK);
}

/** Where a new book goes when the writer does not choose a folder: the one set in Settings, or Cookbook's own. */
export async function newBookLocation(name: string, folder = ''): Promise<BookLocation> {
  if (isTauri()) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    return { kind: 'folder', path: folder ? await join(folder, name) : await join(await appDataDir(), 'books', name) };
  }
  return { kind: 'browser', name };
}

export function hasBrowserStorage(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

export async function openLocation(location: BookLocation): Promise<OpenedStorage> {
  if (location.kind === 'folder') {
    const { TauriAdapter } = await import('./tauri');
    const fs = new TauriAdapter(location.path);
    await fs.makeFolder('');
    return { fs, where: `Saved in ${baseName(location.path.replace(/[\\/]+$/, '').replace(/\\/g, '/'))}` };
  }
  if (location.kind === 'picked') {
    const handle = await loadHandle(location.id);
    if (!handle) throw new Error('This browser no longer remembers that folder. Open it again.');
    if ((await handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
      // Asking needs a click, so this only succeeds when opened from the books list.
      if ((await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
        throw new Error(`Cookbook needs permission to use the folder “${location.name}”.`);
      }
    }
    const { OpfsAdapter } = await import('./opfs');
    return { fs: new OpfsAdapter(handle), where: `Saved in ${location.name}` };
  }
  if (hasBrowserStorage()) {
    const { OpfsAdapter } = await import('./opfs');
    const kept = await keepBrowserStorage();
    return { fs: await OpfsAdapter.open(location.name), where: kept ? 'Saved in this browser' : 'Saved in this browser, which may clear it when space runs low' };
  }
  return { fs: new MemoryAdapter(), where: 'Not saved (this browser has no private storage)' };
}

/**
 * Asks the browser not to clear Cookbook's storage when the disk fills up or
 * the site goes unused. Browsers that grant it quietly return true; some only
 * grant it to sites that are installed or bookmarked.
 */
export async function keepBrowserStorage(): Promise<boolean> {
  try {
    if (await navigator.storage.persisted?.()) return true;
    return (await navigator.storage.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Book folders kept in the browser's private storage. */
export async function browserBooks(): Promise<string[]> {
  if (isTauri() || !hasBrowserStorage()) return [];
  const root = await navigator.storage.getDirectory();
  let books: FileSystemDirectoryHandle;
  try {
    books = await root.getDirectoryHandle('books');
  } catch {
    return [];
  }
  const names: string[] = [];
  // Hidden folders, such as the writer's templates, are not books.
  for await (const [name, handle] of books.entries()) if (handle.kind === 'directory' && !name.startsWith('.')) names.push(name);
  return names.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Where automatic backups go: a folder the writer chose, or else Cookbook's
 * own (beside its books in the desktop app, the browser's storage on the web).
 */
export async function openBackups(chosen: BookLocation | null): Promise<{ fs: StorageAdapter; where: string }> {
  if (chosen && chosen.kind !== 'browser') {
    const { fs } = await openLocation(chosen);
    return { fs, where: chosen.kind === 'folder' ? chosen.path : chosen.name };
  }
  if (isTauri()) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const path = await join(await appDataDir(), 'backups');
    const { TauriAdapter } = await import('./tauri');
    const fs = new TauriAdapter(path);
    await fs.makeFolder('');
    return { fs, where: path };
  }
  if (hasBrowserStorage()) {
    const root = await navigator.storage.getDirectory();
    const { OpfsAdapter } = await import('./opfs');
    return { fs: new OpfsAdapter(await root.getDirectoryHandle('backups', { create: true })), where: 'In this browser’s storage. Choose a folder to keep a copy outside the browser.' };
  }
  return { fs: new MemoryAdapter(), where: 'Nowhere: this browser has no storage for backups.' };
}

// ---------- choosing a folder ----------

export function canPickFolder(): boolean {
  return isTauri() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);
}

/** Asks the writer for a folder. Returns null if they cancel. */
export async function pickFolder(title: string): Promise<BookLocation | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    // Recursive, so Cookbook may also write the book's own folders inside the one picked.
    const path = await open({ directory: true, recursive: true, title });
    return typeof path === 'string' ? { kind: 'folder', path } : null;
  }
  try {
    const handle = await window.showDirectoryPicker!({ id: 'cookbook-book', mode: 'readwrite' });
    const id = globalThis.crypto.randomUUID();
    await saveHandle(id, handle);
    return { kind: 'picked', id, name: handle.name };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** A new, empty folder for a book inside a picked folder. */
export async function childLocation(parent: BookLocation, name: string): Promise<BookLocation> {
  if (parent.kind === 'folder') {
    const { join } = await import('@tauri-apps/api/path');
    return { kind: 'folder', path: await join(parent.path, name) };
  }
  if (parent.kind === 'picked') {
    const handle = await loadHandle(parent.id);
    if (!handle) throw new Error('That folder is no longer available.');
    const child = await handle.getDirectoryHandle(name, { create: true });
    const id = globalThis.crypto.randomUUID();
    await saveHandle(id, child);
    return { kind: 'picked', id, name };
  }
  return { kind: 'browser', name };
}

// Folder handles can only be remembered in IndexedDB.
function handleStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('cookbook', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('folders');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('folders', mode);
      const request = run(tx.objectStore('folders'));
      tx.oncomplete = () => {
        open.result.close();
        resolve(request.result);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<IDBValidKey> {
  return handleStore('readwrite', (s) => s.put(handle, id));
}

function loadHandle(id: string): Promise<FileSystemDirectoryHandle | undefined> {
  return handleStore('readonly', (s) => s.get(id) as IDBRequest<FileSystemDirectoryHandle | undefined>);
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
}

// ---------- keeping backups on another disk ----------

/** The start of a Windows path that names its drive: C:\ or \\server\share. */
export const windowsDrive = (path: string) => /^(?:[a-z]:|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.exec(path)?.[0].toLowerCase().replace(/\//g, '\\') ?? null;

/**
 * Whether two folders of the desktop app are on the same disk, so one broken
 * or lost disk would take both. Null when it can't be told, such as in the browser.
 */
export async function onSameDisk(a: StorageAdapter, b: StorageAdapter): Promise<boolean | null> {
  if (!isTauri()) return null;
  const { TauriAdapter } = await import('./tauri');
  if (!(a instanceof TauriAdapter && b instanceof TauriAdapter)) return null;
  try {
    const { stat } = await import('@tauri-apps/plugin-fs');
    const [one, two] = await Promise.all([stat(a.root), stat(b.root)]);
    if (one.dev !== null && two.dev !== null) return one.dev === two.dev;
  } catch {
    return null;
  }
  // Windows gives no disk number, but each drive has its own letter.
  const [one, two] = [windowsDrive(a.root), windowsDrive(b.root)];
  return one && two ? one === two : null;
}
