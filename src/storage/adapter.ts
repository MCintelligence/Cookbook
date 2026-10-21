/**
 * The only thing the rest of the app knows about disk.
 *
 * Paths are always relative to the book folder and use "/" as the separator,
 * whichever platform we are on. Each platform (Tauri, the browser's private
 * file system, tests) provides one implementation.
 */
export interface Entry {
  name: string;
  kind: 'file' | 'folder';
}

export interface StorageAdapter {
  readText(path: string): Promise<string>;
  /** Writes the whole file, replacing it safely so a crash never leaves half a scene. */
  writeText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /** Changes whenever the file's contents change, so the hidden index only rereads what is new. */
  stamp(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  list(folder: string): Promise<Entry[]>;
  makeFolder(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split('/'))
    .filter((p) => p !== '' && p !== '.')
    .join('/');
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
