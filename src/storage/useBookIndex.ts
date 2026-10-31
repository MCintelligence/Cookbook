import { useCallback, useRef, useState } from 'react';
import { type StorageAdapter } from './adapter';
import { type BookIndex, saveIndex } from './index';

/**
 * The longest the search index waits before it is written out again. Saving an Item doesn't
 * push this back, and the index is also written when the Recipe closes or the window hides.
 * Nothing is lost if it never is: the index catches up from file stamps when the Recipe opens.
 */
const INDEX_WRITE_EVERY_MS = 3 * 60_000;

export interface OpenIndex {
  fs: StorageAdapter;
  index: BookIndex;
}

/**
 * The open Recipe's search index, and two ways of hearing that it changed. `version` is React
 * state and goes up only when what the Shelf, the Pantry and search show may have changed
 * (titles, names, fields, which files there are), so the app re-renders for those. Saving an
 * Item's words only calls the `onText` listeners, so a save doesn't redraw the whole app.
 */
export function useBookIndex() {
  const index = useRef<OpenIndex | null>(null);
  const [version, setVersion] = useState(0);
  const textVersion = useRef(0);
  const listeners = useRef(new Set<() => void>());
  const timer = useRef<number | undefined>(undefined);

  const saveNow = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const current = index.current;
    if (current) await saveIndex(current.fs, current.index).catch(() => {});
  }, []);

  /** Some text in the index changed. It is written out within a few minutes. */
  const textChanged = useCallback(() => {
    textVersion.current++;
    listeners.current.forEach((l) => l());
    timer.current ??= window.setTimeout(() => void saveNow(), INDEX_WRITE_EVERY_MS);
  }, [saveNow]);

  /** Something the Shelf or Pantry shows changed, and maybe text too. */
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    textChanged();
  }, [textChanged]);

  /** Shows what the index holds now, with nothing new to write (it was just opened, or only words changed). */
  const show = useCallback(() => setVersion((v) => v + 1), []);

  /** Calls `listener` whenever text changes; returns how to stop. */
  const onText = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  /** How many times text has changed, for work that only needs redoing when it has. */
  const textCount = useCallback(() => textVersion.current, []);

  return { index, version, changed, textChanged, show, saveNow, onText, textCount };
}
