import { invoke } from '@tauri-apps/api/core';
import { exists, mkdir, readDir, readFile, readTextFile, remove, rename, stat, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { type Entry, type StorageAdapter, joinPath } from './adapter';

/** A book folder anywhere on the writer's disk, for the desktop and mobile apps. */
export class TauriAdapter implements StorageAdapter {
  constructor(readonly root: string) {}

  /** The last write to each file, so writes to one file land in order and never share a temporary file. */
  private writing = new Map<string, Promise<void>>();

  private abs(path: string): string {
    const p = joinPath(path);
    return p === '' ? this.root : `${this.root}/${p}`;
  }

  readText(path: string): Promise<string> {
    return readTextFile(this.abs(path));
  }

  writeText(path: string, text: string): Promise<void> {
    return this.swap(path, (tmp) => writeTextFile(tmp, text));
  }

  readBytes(path: string): Promise<Uint8Array> {
    return readFile(this.abs(path));
  }

  writeBytes(path: string, data: Uint8Array): Promise<void> {
    return this.swap(path, (tmp) => writeFile(tmp, data));
  }

  /**
   * Writes beside the real file, then swaps it in, so a crash never leaves half a page.
   * The swap (commit_write in src-tauri) first forces the new file onto the disk, so a
   * power cut straight after a save can't leave it empty either.
   * Two quick saves of one file wait their turn: if they shared the temporary file, the
   * second rename would find it already gone.
   */
  private swap(path: string, write: (tmp: string) => Promise<void>): Promise<void> {
    const abs = this.abs(path);
    const run = async () => {
      const tmp = `${abs}.cookbook-tmp`;
      await write(tmp);
      await invoke('commit_write', { tmp });
    };
    const next = (this.writing.get(abs) ?? Promise.resolve()).then(run, run);
    this.writing.set(abs, next);
    const done = () => {
      if (this.writing.get(abs) === next) this.writing.delete(abs);
    };
    next.then(done, done);
    return next;
  }

  async stamp(path: string): Promise<string> {
    const info = await stat(this.abs(path));
    return `${info.mtime?.getTime() ?? 0}:${info.size}`;
  }

  async modified(path: string): Promise<number> {
    return (await stat(this.abs(path))).mtime?.getTime() ?? 0;
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
