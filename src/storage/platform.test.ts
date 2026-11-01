import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryAdapter } from './memory';
import { onSameDisk, windowsDrive } from './platform';

// Disk numbers by folder, as the desktop app's stat gives them; null is Windows, which gives none.
const disks: Record<string, number | null> = {};
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: async (path: string) => {
    if (!(path in disks)) throw new Error(`No such file or directory: ${path}`);
    return { dev: disks[path] };
  },
}));

const { TauriAdapter } = await import('./tauri');

describe('keeping backups on another disk', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('reads the drive letter or network share a Windows path starts with', () => {
    expect(windowsDrive('C:\\Users\\Ann\\AppData\\Roaming\\org.cookbook.app\\backups')).toBe('c:');
    expect(windowsDrive('c:/Users/Ann/Recipes')).toBe('c:');
    expect(windowsDrive('D:\\Backups')).toBe('d:');
    expect(windowsDrive('\\\\nas\\writing\\Recipes')).toBe('\\\\nas\\writing');
    expect(windowsDrive('/home/ann/Recipes')).toBeNull();
  });

  it('tells whether a recipe and its backups share a disk in the desktop app', async () => {
    (globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} };
    Object.assign(disks, { '/home/ann/Supper': 2049, '/home/ann/backups': 2049, '/media/usb/backups': 2065, 'C:\\Supper': null, 'C:\\backups': null, 'E:\\backups': null });
    const at = (path: string) => new TauriAdapter(path);
    expect(await onSameDisk(at('/home/ann/Supper'), at('/home/ann/backups'))).toBe(true);
    expect(await onSameDisk(at('/home/ann/Supper'), at('/media/usb/backups'))).toBe(false);
    expect(await onSameDisk(at('C:\\Supper'), at('C:\\backups'))).toBe(true);
    expect(await onSameDisk(at('C:\\Supper'), at('E:\\backups'))).toBe(false);
    // An unplugged drive, or the browser's own storage, can't be told.
    expect(await onSameDisk(at('/home/ann/Supper'), at('/media/gone'))).toBeNull();
    expect(await onSameDisk(at('/home/ann/Supper'), new MemoryAdapter())).toBeNull();
  });

  it('says nothing in the browser', async () => {
    expect(await onSameDisk(new MemoryAdapter(), new MemoryAdapter())).toBeNull();
  });
});
