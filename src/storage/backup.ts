import { zipSync, type Zippable } from 'fflate';
import { type StorageAdapter, joinPath } from './adapter';
import { HIDDEN_FOLDER } from './book';

/**
 * The whole book folder as a zip, so it can be kept somewhere else or moved
 * to another device. The hidden .cookbook folder is left out: it only holds
 * the search index, undo history and trash, and Cookbook rebuilds the first two.
 */
export async function backupZip(fs: StorageAdapter, folderName: string): Promise<Uint8Array> {
  const files: Zippable = {};
  const walk = async (folder: string) => {
    for (const entry of await fs.list(folder)) {
      const path = joinPath(folder, entry.name);
      if (path === HIDDEN_FOLDER) continue;
      if (entry.kind === 'folder') {
        files[`${folderName}/${path}/`] = new Uint8Array(0);
        await walk(path);
      } else files[`${folderName}/${path}`] = await fs.readBytes(path);
    }
  };
  await walk('');
  return zipSync(files, { level: 6 });
}
