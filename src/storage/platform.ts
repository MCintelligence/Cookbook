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
}

export interface OpenedStorage {
  fs: StorageAdapter;
  where: string;
}

export const DEFAULT_BOOK = 'My Book';
const RECENT_KEY = 'cookbook.recentBooks';
const MAX_RECENT = 12;

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

export function rememberBook(book: RecentBook): void {
  const rest = recentBooks().filter((b) => !sameLocation(b.location, book.location));
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([book, ...rest].slice(0, MAX_RECENT)));
  } catch {
    // Private windows may refuse; the book still opens.
  }
}

export function forgetBook(location: BookLocation): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentBooks().filter((b) => !sameLocation(b.location, location))));
  } catch {
    // Nothing to do.
  }
}

/** The book to open when nothing else is remembered. */
export function defaultLocation(): Promise<BookLocation> {
  return newBookLocation(DEFAULT_BOOK);
}

/** Where a new book goes when the writer does not choose a folder. */
export async function newBookLocation(name: string): Promise<BookLocation> {
  if (isTauri()) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    return { kind: 'folder', path: await join(await appDataDir(), 'books', name) };
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
    return { fs: await OpfsAdapter.open(location.name), where: 'Saved in this browser' };
  }
  return { fs: new MemoryAdapter(), where: 'Not saved (this browser has no private storage)' };
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
  for await (const [name, handle] of books.entries()) if (handle.kind === 'directory') names.push(name);
  return names.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

// ---------- choosing a folder ----------

export function canPickFolder(): boolean {
  return isTauri() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);
}

/** Asks the writer for a folder. Returns null if they cancel. */
export async function pickFolder(title: string): Promise<BookLocation | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ directory: true, title });
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
