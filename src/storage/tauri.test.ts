import { describe, expect, it, vi } from 'vitest';

// A pretend disk where writing takes a moment, so two saves can overlap.
const disk = new Map<string, string>();
const tick = () => new Promise((r) => setTimeout(r, 1));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: async (p: string, text: string) => {
    await tick();
    disk.set(p, text);
  },
}));
// The app's own swap: flushes the temporary file to disk, then renames it over the file.
const committed: string[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { tmp: string }) => {
    if (command !== 'commit_write') throw new Error(`unknown command ${command}`);
    await tick();
    const { tmp } = args;
    if (!disk.has(tmp)) throw new Error(`failed to rename ${tmp}: No such file or directory`);
    const to = tmp.slice(0, -'.cookbook-tmp'.length);
    disk.set(to, disk.get(tmp)!);
    disk.delete(tmp);
    committed.push(to);
  },
}));

const { TauriAdapter } = await import('./tauri');

describe('TauriAdapter', () => {
  it('keeps quick saves of one file in order', async () => {
    const fs = new TauriAdapter('/book');
    await Promise.all([fs.writeText('styles.json', 'one'), fs.writeText('styles.json', 'two'), fs.writeText('styles.json', 'three')]);
    expect(disk.get('/book/styles.json')).toBe('three');
    expect([...disk.keys()].filter((k) => k.endsWith('.cookbook-tmp'))).toEqual([]);
    // Every save went through the flushing swap, not a plain rename.
    expect(committed).toEqual(['/book/styles.json', '/book/styles.json', '/book/styles.json']);
  });
});
