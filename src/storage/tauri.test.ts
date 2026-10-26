import { describe, expect, it, vi } from 'vitest';

// A pretend disk where a rename fails, as on Windows, once its temporary file is gone.
const disk = new Map<string, string>();
const tick = () => new Promise((r) => setTimeout(r, 1));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: async (p: string, t: string) => {
    await tick();
    disk.set(p, t);
  },
  rename: async (from: string, to: string) => {
    await tick();
    if (!disk.has(from)) throw new Error(`failed to rename old path: ${from} (os error 2)`);
    disk.set(to, disk.get(from)!);
    disk.delete(from);
  },
}));

const { TauriAdapter } = await import('./tauri');

describe('TauriAdapter', () => {
  it('saves the same file twice at once without losing either save', async () => {
    const fs = new TauriAdapter('/book');
    await Promise.all([fs.writeText('book.json', 'one'), fs.writeText('book.json', 'two'), fs.writeText('book.json', 'three')]);
    expect(disk.get('/book/book.json')).toBe('three');
    expect(disk.has('/book/book.json.cookbook-tmp')).toBe(false);
  });
});
