import { isTauri } from '../storage/platform';
import { IS_MAC } from '../shortcuts';
import { IS_ANDROID } from '../mobile';
import { type ScrivenerSource, filesSource, folderSource, zipSource } from '../storage/scrivener';

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
    const { TauriAdapter } = await import('../storage/tauri');
    if (IS_ANDROID) {
      // Android's picker hands over single files, so a project comes in zipped.
      const path = await open({ title: 'Choose a zipped Scrivener project', filters: [{ name: 'Zipped Scrivener project', extensions: ['zip'] }] });
      if (typeof path !== 'string') return null;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const source = zipSource(await readFile(path));
      if (!source) throw new Error('That zip has no Scrivener project in it. Zip the whole .scriv folder and try again.');
      return source;
    }
    if (IS_MAC) {
      // On a Mac a .scriv is a package, which looks like a file, and a folder picker greys it out.
      // So it is picked as a file: the .scriv itself, the .scrivx inside one (where Scrivener isn't
      // installed, a .scriv is an ordinary folder), or a zipped project.
      const path = await open({ title: 'Choose the Scrivener project (.scriv), or a zipped one', filters: [{ name: 'Scrivener project', extensions: ['scriv', 'scrivx', 'zip'] }] });
      if (typeof path !== 'string') return null;
      if (/\.zip$/i.test(path)) {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const source = zipSource(await readFile(path));
        if (!source) throw new Error('That zip has no Scrivener project in it.');
        return source;
      }
      const { invoke } = await import('@tauri-apps/api/core');
      return folderSource(new TauriAdapter(await invoke<string>('open_scrivener', { picked: path })));
    }
    // Recursive, so the documents inside the project may be read too.
    const path = await open({ directory: true, recursive: true, title });
    if (typeof path !== 'string') return null;
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
