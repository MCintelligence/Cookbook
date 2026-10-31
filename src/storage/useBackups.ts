import { type RefObject, useEffect, useRef, useState } from 'react';
import { type StorageAdapter } from './adapter';
import { type BookInfo } from './book';
import { BACKUP_EVERY_MS, BackupCheckError, listBackups, makeBackup } from './autoBackup';
import { friendlyError } from './errors';
import { canPickFolder, onSameDisk, openBackups } from './platform';
import { getSettings, setSettings } from '../settings';
import type { BackupInfo } from '../ui/Settings';

/** Whose backups these are. Every book has an id once it has been opened (see openAt). */
export const ownerOf = (info: BookInfo) => ({ title: info.title, id: info.id ?? info.title });

/** What the writer is told about backups, beyond Settings. */
export interface BackupTells {
  /** A backup failed, or failed differently from the last one. */
  failed: (text: string) => void;
  /** Backups work again after failing with `text`. */
  mended: (text: string) => void;
  /** Once ever: Cookbook's own backup folder is on the same disk as the recipe. */
  sameDisk: () => void;
}

/**
 * The open Recipe's automatic backups: made every half hour while something changed, on close,
 * and after a crash, one at a time. `flush` saves the open Item first, so a timed backup has
 * its newest words.
 */
export function useBackups(fsRef: RefObject<StorageAdapter | null>, bookRef: RefObject<BookInfo | null>, flush: () => Promise<void>, tell: BackupTells) {
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const tellRef = useRef(tell);
  tellRef.current = tell;
  const [backups, setBackups] = useState<BackupInfo>({ folder: '', canChoose: canPickFolder(), last: null, count: 0, sameDisk: false, problem: null });
  /** Why the last backup failed, kept outside state so the timer and closing see it too. */
  const problem = useRef<string | null>(null);
  /** Something was saved since the last automatic backup. */
  const changedSinceBackup = useRef(false);
  const lastBackupAt = useRef(0);

  const backupStore = useRef<{ key: string; fs: StorageAdapter; where: string } | null>(null);
  const openBackupStore = async () => {
    const chosen = getSettings().backupFolder;
    const key = JSON.stringify(chosen);
    if (backupStore.current?.key !== key) backupStore.current = { key, ...(await openBackups(chosen)) };
    return backupStore.current;
  };
  const refreshBackups = async () => {
    const info = bookRef.current;
    if (!info) return;
    try {
      const store = await openBackupStore();
      const list = await listBackups(store.fs, ownerOf(info));
      const sameDisk = fsRef.current ? (await onSameDisk(fsRef.current, store.fs)) === true : false;
      setBackups({ folder: store.where, canChoose: canPickFolder(), last: list[0]?.date ?? null, count: list.length, sameDisk, problem: problem.current });
      // Told once, and only about Cookbook's own folder: a folder the writer chose on the same disk may be one a cloud service syncs.
      if (sameDisk && !getSettings().backupFolder && !getSettings().backupDiskNudged) {
        setSettings({ backupDiskNudged: true });
        tellRef.current.sameDisk();
      }
    } catch (e) {
      setBackups((b) => ({ ...b, folder: `Can’t reach the backup folder. ${friendlyError(e)}`, problem: problem.current }));
    }
  };
  /** The backup being made, so a timed one and one on close don't zip the book twice at once. */
  const backingUp = useRef<Promise<void> | null>(null);
  /** Zips the open book into the backups folder; automatic ones only when something changed. */
  const autoBackup = async (always = false): Promise<void> => {
    // Waits its turn; several waiting at once each check again once the one before is done.
    while (backingUp.current) await backingUp.current.catch(() => {});
    const bookFs = fsRef.current;
    const info = bookRef.current;
    if (!bookFs || !info || (!always && !changedSinceBackup.current)) return;
    changedSinceBackup.current = false;
    lastBackupAt.current = Date.now();
    const run = (async () => {
      const store = await openBackupStore();
      await makeBackup(bookFs, store.fs, ownerOf(info), getSettings().keepBackups);
    })();
    backingUp.current = run;
    try {
      await run;
      if (problem.current) {
        tellRef.current.mended(problem.current);
        problem.current = null;
        setBackups((b) => ({ ...b, problem: null }));
      }
    } catch (e) {
      // Nothing was backed up, so the changes still need one.
      changedSinceBackup.current = true;
      // Said once, not every half hour, while the same thing keeps going wrong; Settings keeps showing it.
      const text = e instanceof BackupCheckError ? e.message : `Couldn’t back up the recipe. ${friendlyError(e)}`;
      if (text !== problem.current) {
        problem.current = text;
        setBackups((b) => ({ ...b, problem: text }));
        tellRef.current.failed(text);
      }
      throw e;
    } finally {
      if (backingUp.current === run) backingUp.current = null;
    }
  };

  useEffect(() => {
    // A backup every half hour while the writer works, so a long session is never only backed up when it ends.
    const timer = window.setInterval(() => {
      if (!getSettings().backupOnClose || !changedSinceBackup.current) return;
      void (async () => {
        await flushRef.current();
        await autoBackup();
        await refreshBackups();
      })().catch(() => {});
    }, BACKUP_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);


  return { backups, refreshBackups, autoBackup, openBackupStore, changedSinceBackup, lastBackupAt };
}
