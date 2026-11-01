import { isTauri } from '../storage/platform';
import { type ScrivenerSource, filesSource, folderSource } from '../storage/scrivener';

/**
 * Asks the writer for a Scrivener project. The desktop app and browsers that
 * can open folders ask for the .scriv folder (or the folder it sits in) and
 * only ever read it. Returns null if they cancel, and 'files' when this
 * browser can only be given a folder through a file input.
 */
export async function pickScrivener(): Promise<ScrivenerSource | 'files' | null> {
  const title = 'Choose the Scrivener project (the .scriv folder, or the folder it’s in)';
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    // Recursive, so the documents inside the project may be read too.
    const path = await open({ directory: true, recursive: true, title });
    if (typeof path !== 'string') return null;
    const { TauriAdapter } = await import('../storage/tauri');
    return folderSource(new TauriAdapter(path));
  }
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker!({ id: 'cookbook-scrivener', mode: 'read' });
      const { OpfsAdapter } = await import('../storage/opfs');
      return folderSource(new OpfsAdapter(handle));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  return 'files';
}

/** The files of a folder given to a file input (webkitdirectory), by their place in the folder. */
export function folderFilesSource(files: File[]): ScrivenerSource {
  return filesSource(new Map(files.map((f) => [f.webkitRelativePath || f.name, async () => new Uint8Array(await f.arrayBuffer())])));
}
