import { type StorageAdapter } from './adapter';
import { MemoryAdapter } from './memory';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Picks where the default book lives on this platform. Choosing any folder on
 * disk arrives with the "Open book" dialog in Phase 1.
 */
export async function defaultBookStorage(): Promise<{ fs: StorageAdapter; where: string }> {
  if (isTauri()) {
    const [{ appDataDir }, { TauriAdapter }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('./tauri'),
    ]);
    const root = `${await appDataDir()}/books/My Book`;
    const fs = new TauriAdapter(root);
    await fs.makeFolder('');
    return { fs, where: 'Saved on this device' };
  }
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage) {
    const { OpfsAdapter } = await import('./opfs');
    return { fs: await OpfsAdapter.open('My Book'), where: 'Saved in this browser' };
  }
  return { fs: new MemoryAdapter(), where: 'Not saved (this browser has no private storage)' };
}
