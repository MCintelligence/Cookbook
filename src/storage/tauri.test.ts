import { describe, expect, it, vi } from 'vitest';

// A pretend disk where writing takes a moment, so two saves can overlap.
const disk = new Map<string, string>();
const tick = () => new Promise((r) => setTimeout(r, 1));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: async (p: string, text: string) => {
    await tick();
    disk.set(p, text);
  },
  rename: async (from: string, to: string) => {
    await tick();
    if (!disk.has(from)) throw new Error(`failed to rename ${from}: No such file or directory`);
    disk.set(to, disk.get(from)!);
    disk.delete(from);
  },
}));

const { TauriAdapter } = await import('./tauri');

describe('TauriAdapter', () => {
  it('keeps quick saves of one file in order', async () => {
    const fs = new TauriAdapter('/book');
    await Promise.all([fs.writeText('styles.json', 'one'), fs.writeText('styles.json', 'two'), fs.writeText('styles.json', 'three')]);
    expect(disk.get('/book/styles.json')).toBe('three');
    expect([...disk.keys()].filter((k) => k.endsWith('.cookbook-tmp'))).toEqual([]);
  });
});
