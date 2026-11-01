import { unzipSync } from 'fflate';
import { type StorageAdapter, joinPath } from './adapter';
import { backupEntries } from './backup';
import { fileNameFor } from './book';
import { zipInBackground, zipProblemInBackground } from './zip';

/**
 * Automatic backups: a zip of the whole book, kept in a backups folder outside
 * the book so losing the book folder doesn't lose them too. They are made every
 * so often while the writer works, when the book is closed, and after Cookbook
 * stopped without closing it.
 *
 * Each book has its own folder, found by the start of the book's id, so two
 * books with the same title never share one and renaming a book keeps its
 * backups (the folder is renamed to follow):
 *
 *   backups/My Book 1a2b3c4d/2026-10-22 14.05.09.zip
 *
 * Backups made before this were filed by title alone (backups/My Book/). They
 * are still listed for restoring, but never removed, since they may belong to
 * another book with the same title.
 */

/** How often a backup is made while the writer works, if something changed. */
export const BACKUP_EVERY_MS = 30 * 60_000;

/** The book a backup is of. */
export interface BackupOwner {
  title: string;
  id: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A backup's file name, which also says when it was made. */
export function backupName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}.zip`;
}

export function dateOfBackup(name: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})(?:\.(\d{2}))?\.zip$/.exec(name);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0)) : null;
}

const shortId = (id: string) => id.replace(/[^\dA-Za-z]/g, '').slice(0, 8).toLowerCase() || 'recipe';

/** The folder a book's backups go in: its title, for people, and the start of its id, for Cookbook. */
export function backupFolderName(owner: BackupOwner): string {
  return `${fileNameFor(owner.title)} ${shortId(owner.id)}`;
}

/** The book's own backup folder as it is named now, which may be under an older title. */
async function ownFolder(backups: StorageAdapter, owner: BackupOwner): Promise<string | null> {
  const suffix = ` ${shortId(owner.id)}`;
  const entries = await backups.list('').catch(() => []);
  const wanted = backupFolderName(owner);
  if (entries.some((e) => e.kind === 'folder' && e.name === wanted)) return wanted;
  return entries.find((e) => e.kind === 'folder' && e.name.endsWith(suffix))?.name ?? null;
}

export interface Backup {
  path: string;
  date: Date;
  /** Made before backups were filed by book, so it may be of another book with the same title. */
  older?: boolean;
}

async function backupsIn(backups: StorageAdapter, folder: string, older: boolean): Promise<Backup[]> {
  if (!(await backups.exists(folder))) return [];
  return (await backups.list(folder)).flatMap((e) => {
    const date = e.kind === 'file' ? dateOfBackup(e.name) : null;
    return date ? [{ path: joinPath(folder, e.name), date, ...(older && { older }) }] : [];
  });
}

const newestFirst = (a: Backup, b: Backup) => b.date.getTime() - a.date.getTime();

/** A book's backups, newest first, including any filed by its title before backups were filed by book. */
export async function listBackups(backups: StorageAdapter, owner: BackupOwner): Promise<Backup[]> {
  const own = await ownFolder(backups, owner);
  const list = own ? await backupsIn(backups, own, false) : [];
  const byTitle = fileNameFor(owner.title);
  if (byTitle !== own) list.push(...(await backupsIn(backups, byTitle, true)));
  return list.sort(newestFirst);
}

const DAY_MS = 86_400_000;
/** Days since 1 January 1970 by the local calendar, so a day runs midnight to midnight where the writer is. */
const localDay = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / DAY_MS);

/**
 * Which backups to keep, by index into a newest-first list: the newest `keep`,
 * and also the newest of each day for the last week and the newest of each
 * week (Monday to Sunday) for the last month. `keep` 0 keeps them all.
 */
export function backupsToKeep(dates: Date[], keep: number, now: Date = new Date()): Set<number> {
  const kept = new Set<number>();
  if (keep <= 0) return new Set(dates.keys());
  const today = localDay(now);
  const days = new Set<number>();
  const weeks = new Set<number>();
  dates.forEach((date, i) => {
    if (i < keep) kept.add(i);
    const day = localDay(date);
    const age = today - day;
    if (age < 7 && !days.has(day)) {
      days.add(day);
      kept.add(i);
    }
    // 1 January 1970 was a Thursday, so adding 3 makes weeks start on Monday.
    const week = Math.floor((day + 3) / 7);
    if (age < 31 && !weeks.has(week)) {
      weeks.add(week);
      kept.add(i);
    }
  });
  return kept;
}

/** A backup was written but didn't read back whole, so it was removed rather than kept. */
export class BackupCheckError extends Error {
  constructor(readonly problem: string) {
    super(`Cookbook made a backup but couldn’t open it again complete, so it wasn’t kept: ${problem}. The recipe itself is fine.`);
  }
}

/** Zips the book into its backups folder, checks it opens again, then removes older ones the writer doesn't keep (`keep` 0 keeps all). */
export async function makeBackup(book: StorageAdapter, backups: StorageAdapter, owner: BackupOwner, keep: number, now = new Date()): Promise<Backup> {
  const wanted = backupFolderName(owner);
  let folder = await ownFolder(backups, owner);
  // A book that was renamed takes its backups with it.
  if (folder && folder !== wanted && !(await backups.exists(wanted))) {
    try {
      await backups.rename(folder, wanted);
      folder = wanted;
    } catch {
      // The old name still works: the folder is found by the book's id.
    }
  }
  folder ??= wanted;
  await backups.makeFolder(folder);
  const path = joinPath(folder, backupName(now));
  const entries = await backupEntries(book, fileNameFor(owner.title));
  const zip = await zipInBackground(entries);
  try {
    await backups.writeBytes(path, zip);
  } catch (e) {
    // A write that fails part way may leave a start of a zip, which would be listed and kept as a backup.
    await backups.remove(path).catch(() => {});
    throw e;
  }
  // Read back and opened, so a backup that a full or failing disk spoiled is never counted on,
  // and never pushes out an older one that works.
  let problem: string | null;
  try {
    problem = await zipProblemInBackground(await backups.readBytes(path), entries);
  } catch (e) {
    problem = `it can’t be read back (${e instanceof Error ? e.message : String(e)})`;
  }
  if (problem) {
    await backups.remove(path).catch(() => {});
    throw new BackupCheckError(problem);
  }
  if (keep > 0) {
    const own = (await backupsIn(backups, folder, false)).sort(newestFirst);
    const kept = backupsToKeep(
      own.map((b) => b.date),
      keep,
      now,
    );
    for (const [i, old] of own.entries()) if (!kept.has(i)) await backups.remove(old.path).catch(() => {});
  }
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

// ---------- noticing that Cookbook stopped without closing the book ----------

const openKey = (location: unknown) => `cookbook.open:${JSON.stringify(location)}`;

/** Notes that a book is open; returns whether it was still noted as open, meaning Cookbook stopped without closing it. */
export function markOpen(store: Pick<Storage, 'getItem' | 'setItem'>, location: unknown, now = Date.now()): boolean {
  try {
    const leftOpen = store.getItem(openKey(location)) !== null;
    store.setItem(openKey(location), String(now));
    return leftOpen;
  } catch {
    return false;
  }
}

/** Notes that a book was closed properly. */
export function markClosed(store: Pick<Storage, 'removeItem'>, location: unknown): void {
  try {
    store.removeItem(openKey(location));
  } catch {
    // Blocked storage: at worst, an extra backup next time.
  }
}
