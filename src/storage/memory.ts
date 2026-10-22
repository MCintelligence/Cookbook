import { type Entry, type StorageAdapter, joinPath, parentOf, baseName } from './adapter';

/** An in-memory book folder, used by tests and as a scratch space. */
export class MemoryAdapter implements StorageAdapter {
  private files = new Map<string, Uint8Array>();
  private folders = new Set<string>(['']);
  private stamps = new Map<string, number>();
  private times = new Map<string, number>();
  private writes = 0;
  /** What "now" is when a file is written; tests set it to get known dates. */
  clock = () => Date.now();

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }

  writeText(path: string, text: string): Promise<void> {
    return this.writeBytes(path, new TextEncoder().encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const data = this.files.get(joinPath(path));
    if (data === undefined) throw new Error(`No such file: ${path}`);
    return data.slice();
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const p = joinPath(path);
    if (!this.folders.has(parentOf(p))) throw new Error(`No such folder: ${parentOf(p)}`);
    this.files.set(p, data.slice());
    this.stamps.set(p, ++this.writes);
    this.times.set(p, this.clock());
  }

  async stamp(path: string): Promise<string> {
    const p = joinPath(path);
    if (!this.files.has(p)) throw new Error(`No such file: ${path}`);
    return String(this.stamps.get(p));
  }

  async modified(path: string): Promise<number> {
    const p = joinPath(path);
    if (!this.files.has(p)) throw new Error(`No such file: ${path}`);
    return this.times.get(p)!;
  }

  async exists(path: string): Promise<boolean> {
    const p = joinPath(path);
    return this.files.has(p) || this.folders.has(p);
  }

  async list(folder: string): Promise<Entry[]> {
    const f = joinPath(folder);
    if (!this.folders.has(f)) throw new Error(`No such folder: ${folder}`);
    const entries: Entry[] = [];
    for (const d of this.folders) if (d !== '' && parentOf(d) === f) entries.push({ name: baseName(d), kind: 'folder' });
    for (const p of this.files.keys()) if (parentOf(p) === f) entries.push({ name: baseName(p), kind: 'file' });
    return entries;
  }

  async makeFolder(path: string): Promise<void> {
    let p = joinPath(path);
    while (p !== '' && !this.folders.has(p)) {
      this.folders.add(p);
      p = parentOf(p);
    }
  }

  async remove(path: string): Promise<void> {
    const p = joinPath(path);
    this.files.delete(p);
    for (const k of [...this.files.keys()]) if (k.startsWith(p + '/')) this.files.delete(k);
    for (const d of [...this.folders]) if (d === p || d.startsWith(p + '/')) this.folders.delete(d);
  }

  async rename(from: string, to: string): Promise<void> {
    const a = joinPath(from);
    const b = joinPath(to);
    if (await this.exists(b)) throw new Error(`Already exists: ${to}`);
    if (this.files.has(a)) {
      this.files.set(b, this.files.get(a)!);
      this.stamps.set(b, this.stamps.get(a)!);
      this.times.set(b, this.times.get(a)!);
      this.files.delete(a);
      return;
    }
    if (!this.folders.has(a)) throw new Error(`No such file or folder: ${from}`);
    const move = (k: string) => b + k.slice(a.length);
    for (const d of [...this.folders]) if (d === a || d.startsWith(a + '/')) {
      this.folders.delete(d);
      this.folders.add(move(d));
    }
    for (const [k, v] of [...this.files]) if (k.startsWith(a + '/')) {
      this.files.delete(k);
      this.files.set(move(k), v);
      this.stamps.set(move(k), this.stamps.get(k)!);
      this.times.set(move(k), this.times.get(k)!);
    }
  }
}
