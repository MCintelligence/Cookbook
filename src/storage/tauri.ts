import { mkdir, readDir, readTextFile, remove, rename, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { type Entry, type StorageAdapter, joinPath } from './adapter';

/** A book folder anywhere on the writer's disk, for the desktop and mobile apps. */
export class TauriAdapter implements StorageAdapter {
  constructor(private root: string) {}

  private abs(path: string): string {
    const p = joinPath(path);
    return p === '' ? this.root : `${this.root}/${p}`;
  }

  readText(path: string): Promise<string> {
    return readTextFile(this.abs(path));
  }

  async writeText(path: string, text: string): Promise<void> {
    // Write beside the real file, then swap, so a crash never leaves half a scene.
    const tmp = this.abs(path) + '.cookbook-tmp';
    await writeTextFile(tmp, text);
    await rename(tmp, this.abs(path));
  }

  exists(path: string): Promise<boolean> {
    return exists(this.abs(path));
  }

  async list(folder: string): Promise<Entry[]> {
    const entries = await readDir(this.abs(folder));
    return entries.map((e) => ({ name: e.name, kind: e.isDirectory ? 'folder' : 'file' }));
  }

  makeFolder(path: string): Promise<void> {
    return mkdir(this.abs(path), { recursive: true });
  }

  remove(path: string): Promise<void> {
    return remove(this.abs(path), { recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    if (await this.exists(to)) throw new Error(`Already exists: ${to}`);
    await rename(this.abs(from), this.abs(to));
  }
}
