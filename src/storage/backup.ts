import { type StorageAdapter, joinPath } from './adapter';
import { HIDDEN_FOLDER } from './book';
import { type ZipEntry, zipInBackground } from './zip';

/**
 * The whole book folder as a zip, so it can be kept somewhere else or moved
 * to another device. From the hidden .cookbook folder only the snapshots and
 * the trash go in: they can't be made again. The search index and undo
 * history are left out, since Cookbook rebuilds them.
 */
export const BACKED_UP_HIDDEN = ['snapshots', 'trash'];

/** Files that are already compressed, so zipping them again only costs time. */
const COMPRESSED = /\.(?:jpe?g|png|gif|webp|avif|heic|zip|docx|epub|pdf|mp3|m4a|mp4|woff2?)$/i;

/** A save still being written beside its file; the file itself goes in. */
const isTemporary = (name: string) => name.endsWith('.cookbook-tmp');

/** How many files are read at once: enough to be quick, few enough not to swamp the desktop app's file calls. */
const READS_AT_ONCE = 16;

export async function backupEntries(fs: StorageAdapter, folderName: string): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  const files: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await fs.list(folder)) {
      const path = joinPath(folder, entry.name);
      if (path === HIDDEN_FOLDER) await walkHidden();
      else if (entry.kind === 'folder') {
        out.push({ name: `${folderName}/${path}/`, data: new Uint8Array(0), level: 0 });
        await walk(path);
      } else if (!isTemporary(entry.name)) files.push(path);
    }
  };
  const walkHidden = async () => {
    const kept: string[] = [];
    for (const part of BACKED_UP_HIDDEN) if (await fs.exists(joinPath(HIDDEN_FOLDER, part))) kept.push(part);
    if (kept.length === 0) return;
    out.push({ name: `${folderName}/${HIDDEN_FOLDER}/`, data: new Uint8Array(0), level: 0 });
    for (const part of kept) {
      out.push({ name: `${folderName}/${joinPath(HIDDEN_FOLDER, part)}/`, data: new Uint8Array(0), level: 0 });
      await walk(joinPath(HIDDEN_FOLDER, part));
    }
  };
  await walk('');
  let next = 0;
  const reader = async () => {
    while (next < files.length) {
      const path = files[next++]!;
      try {
        out.push({ name: `${folderName}/${path}`, data: await fs.readBytes(path), level: COMPRESSED.test(path) ? 0 : 6 });
      } catch (e) {
        // Deleted or moved while the backup was being made: it's simply not in this one.
        if (await fs.exists(path)) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READS_AT_ONCE, files.length) }, reader));
  // Files are read side by side, so they are put back in order for a zip that reads the same each time.
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function backupZip(fs: StorageAdapter, folderName: string): Promise<Uint8Array> {
  return zipInBackground(await backupEntries(fs, folderName));
}
