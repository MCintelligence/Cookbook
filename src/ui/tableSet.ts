/** Kept apart from SetTheTable.tsx so starting up can ask without loading the questions. */

const KEY = 'cookbook.tableSet';

/** Whether Set the Table has been shown on this device, finished or skipped. */
export function tableSetBefore(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function rememberTableSet(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, new Date().toISOString());
  } catch {
    // A private window may refuse; the questions are asked again next time.
  }
}
