import { type RefObject, useEffect, useRef, useState } from 'react';
import { type StorageAdapter } from './adapter';
import { type BookInfo } from './book';
import { BACKUP_EVERY_MS, listBackups, makeBackup } from './autoBackup';
import { friendlyError } from './errors';
import { canPickFolder, openBackups } from './platform';
import { getSettings } from '../settings';
import type { BackupInfo } from '../ui/Settings';

/** Whose backups these are. Every book has an id once it has been opened (see openAt). */
export const ownerOf = (info: BookInfo) => ({ title: info.title, id: info.id ?? info.title });

/**
 * The open Recipe's automatic backups: made every half hour while something changed, on close,
 * and after a crash, one at a time. `flush` saves the open Item first, so a timed backup has
 * its newest words.
 */
export function useBackups(fsRef: RefObject<StorageAdapter | null>, bookRef: RefObject<BookInfo | null>, flush: () => Promise<void>) {
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const [backups, setBackups] = useState<BackupInfo>({ folder: '', canChoose: canPickFolder(), last: null, count: 0 });
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
      setBackups({ folder: store.where, canChoose: canPickFolder(), last: list[0]?.date ?? null, count: list.length });
    } catch (e) {
      setBackups((b) => ({ ...b, folder: `Can’t reach the backup folder. ${friendlyError(e)}` }));
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
    } catch (e) {
      // Nothing was backed up, so the changes still need one.
      changedSinceBackup.current = true;
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
