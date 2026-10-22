import { type StorageAdapter, baseName } from './adapter';
import { parseDocument, serializeDocument } from './document';
import { type BookLocation, sameLocation } from './platform';

/**
 * A browser can close a tab before an async save finishes, so the last few
 * words of a scene could be lost. When the page is hidden with a save still
 * pending, the scene's text is also kept here synchronously, and written to
 * the file the next time the book opens.
 *
 * `base` is the file's text as Cookbook last saw it. The rescue is only used
 * if the file still says that, so it never overwrites a newer change.
 */
export interface Rescue {
  location: BookLocation;
  path: string;
  text: string;
  base: string;
}

const KEY = 'cookbook.unsaved';

export function keepRescue(store: Pick<Storage, 'setItem'>, rescue: Rescue): void {
  try {
    store.setItem(KEY, JSON.stringify(rescue));
  } catch {
    // Full or blocked storage: the normal save is still running.
  }
}

export function dropRescue(store: Pick<Storage, 'removeItem'>): void {
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/** The rescue for this book, if there is one. It is removed either way. */
export function takeRescue(store: Pick<Storage, 'getItem' | 'removeItem'>, location: BookLocation): Rescue | null {
  let rescue: Rescue | null = null;
  try {
    const raw = store.getItem(KEY);
    if (raw) rescue = JSON.parse(raw) as Rescue;
  } catch {
    rescue = null;
  }
  if (!rescue || !sameLocation(rescue.location, location)) return null;
  dropRescue(store);
  return rescue;
}

/** Writes the rescued text if the file has not changed since. Returns true when it did. */
export async function applyRescue(fs: StorageAdapter, rescue: Rescue): Promise<boolean> {
  if (!(await fs.exists(rescue.path))) return false;
  const name = baseName(rescue.path).replace(/\.md$/, '');
  const normal = (text: string) => serializeDocument(parseDocument(text, name));
  const now = normal(await fs.readText(rescue.path));
  if (now !== normal(rescue.base) || now === normal(rescue.text)) return false;
  await fs.writeText(rescue.path, rescue.text);
  return true;
}
