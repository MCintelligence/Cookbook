import { type Entry, type StorageAdapter, joinPath, parentOf, baseName } from './adapter';

/**
 * A book folder inside the browser's Origin Private File System (the PWA).
 * The browser may evict this storage unless persistence is granted, so the
 * app asks for it when a book is first created.
 */
export class OpfsAdapter implements StorageAdapter {
  constructor(private root: FileSystemDirectoryHandle) {}

  static async open(bookFolder: string): Promise<OpfsAdapter> {
    let dir = await navigator.storage.getDirectory();
    for (const part of joinPath('books', bookFolder).split('/')) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    await navigator.storage.persist?.();
    return new OpfsAdapter(dir);
  }

  private async folder(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    const p = joinPath(path);
    if (p === '') return dir;
    for (const part of p.split('/')) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  async readText(path: string): Promise<string> {
    return (await this.file(path)).text();
  }

  writeText(path: string, text: string): Promise<void> {
    return this.write(path, text);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.file(path)).arrayBuffer());
  }

  writeBytes(path: string, data: Uint8Array): Promise<void> {
    return this.write(path, data as Uint8Array<ArrayBuffer>);
  }

  async stamp(path: string): Promise<string> {
    const file = await this.file(path);
    return `${file.lastModified}:${file.size}`;
  }

  async modified(path: string): Promise<number> {
    return (await this.file(path)).lastModified;
  }

  private async file(path: string): Promise<File> {
    const dir = await this.folder(parentOf(path));
    return (await dir.getFileHandle(baseName(path))).getFile();
  }

  private async write(path: string, data: string | Uint8Array<ArrayBuffer>): Promise<void> {
    const dir = await this.folder(parentOf(path));
    const handle = await dir.getFileHandle(baseName(path), { create: true });
    // createWritable writes to a swap file and only replaces the original on close.
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async exists(path: string): Promise<boolean> {
    const p = joinPath(path);
    if (p === '') return true;
    try {
      const dir = await this.folder(parentOf(p));
      for await (const name of dir.keys()) if (name === baseName(p)) return true;
      return false;
    } catch {
      return false;
    }
  }

  async list(folder: string): Promise<Entry[]> {
    const dir = await this.folder(folder);
    const entries: Entry[] = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push({ name, kind: handle.kind === 'directory' ? 'folder' : 'file' });
    }
    return entries;
  }

  async makeFolder(path: string): Promise<void> {
    await this.folder(path, true);
  }

  async remove(path: string): Promise<void> {
    const dir = await this.folder(parentOf(path));
    await dir.removeEntry(baseName(path), { recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    if (await this.exists(to)) throw new Error(`Already exists: ${to}`);
    const entries = await this.list(parentOf(from)).catch(() => []);
    const entry = entries.find((e) => e.name === baseName(from));
    if (!entry) throw new Error(`No such file or folder: ${from}`);
    // OPFS has no portable rename for folders, so copy then delete.
    if (entry.kind === 'file') {
      // As bytes, so pictures and zips are copied exactly; text would mangle them.
      await this.writeBytes(to, await this.readBytes(from));
    } else {
      await this.makeFolder(to);
      for (const child of await this.list(from)) {
        await this.rename(joinPath(from, child.name), joinPath(to, child.name));
      }
    }
    await this.remove(from);
  }
}
