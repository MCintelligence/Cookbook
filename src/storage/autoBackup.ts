import { unzipSync } from 'fflate';
import { type StorageAdapter, joinPath } from './adapter';
import { backupZip } from './backup';
import { fileNameFor } from './book';

/**
 * Automatic backups: a zip of the whole book, made when the writer closes
 * Cookbook or opens another book, kept in a backups folder outside the book
 * (one folder per book) so losing the book folder doesn't lose them too.
 * Older ones are removed past the number the writer chose to keep.
 *
 *   backups/My Book/2026-10-22 14.05.zip
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** A backup's file name, which also says when it was made. */
export function backupName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}.zip`;
}

export function dateOfBackup(name: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})(?:\.(\d{2}))?\.zip$/.exec(name);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0)) : null;
}

export interface Backup {
  path: string;
  date: Date;
}

/** A book's backups, newest first. */
export async function listBackups(backups: StorageAdapter, title: string): Promise<Backup[]> {
  const folder = fileNameFor(title);
  if (!(await backups.exists(folder))) return [];
  return (await backups.list(folder))
    .flatMap((e) => {
      const date = e.kind === 'file' ? dateOfBackup(e.name) : null;
      return date ? [{ path: joinPath(folder, e.name), date }] : [];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Zips the book into its backups folder, then removes the oldest past `keep` (0 keeps all). */
export async function makeBackup(book: StorageAdapter, backups: StorageAdapter, title: string, keep: number, now = new Date()): Promise<Backup> {
  const folder = fileNameFor(title);
  await backups.makeFolder(folder);
  const path = joinPath(folder, backupName(now));
  await backups.writeBytes(path, await backupZip(book, folder));
  if (keep > 0) for (const old of (await listBackups(backups, title)).slice(keep)) await backups.remove(old.path).catch(() => {});
  return { path, date: now };
}

/**
 * Unpacks a backup into an empty folder: a copy of the book as it was, opened
 * beside the current one rather than written over it.
 */
export async function restoreBackup(backups: StorageAdapter, backup: Backup, into: StorageAdapter): Promise<void> {
  const files = unzipSync(await backups.readBytes(backup.path));
  for (const [name, data] of Object.entries(files)) {
    // Every path in the zip starts with the book's folder name.
    const path = name.split('/').slice(1).join('/');
    if (!path) continue;
    if (name.endsWith('/')) await into.makeFolder(path);
    else {
      const parent = path.split('/').slice(0, -1).join('/');
      if (parent) await into.makeFolder(parent);
      await into.writeBytes(path, data);
    }
  }
}
