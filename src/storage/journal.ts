import { type StorageAdapter } from './adapter';
import { type TreeNode } from './book';

/**
 * Each Journal folder shows a date: the last time anything in it changed,
 * unless the writer has pinned one. Pinned dates are kept in `journal.json`,
 * beside `book.json`, keyed by folder:
 *
 *   { "journal/Trip to Lisbon": "2026-10-14" }
 */
export const JOURNAL_FILE = 'journal.json';

export type PinnedDates = Record<string, string>;

export interface FolderDate {
  /** YYYY-MM-DD, in local time. */
  date: string;
  pinned: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function loadPinned(fs: StorageAdapter): Promise<PinnedDates> {
  try {
    const parsed: unknown = JSON.parse(await fs.readText(JOURNAL_FILE));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string' && DAY.test(e[1])));
  } catch {
    return {};
  }
}

export async function savePinned(fs: StorageAdapter, pinned: PinnedDates): Promise<void> {
  await fs.writeText(JOURNAL_FILE, JSON.stringify(Object.fromEntries(Object.entries(pinned).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
}

/** Pins `date`, or goes back to the automatic date when it is null. */
export function withPinned(pinned: PinnedDates, folder: string, date: string | null): PinnedDates {
  const { [folder]: _old, ...rest } = pinned;
  return date && DAY.test(date) ? { ...rest, [folder]: date } : rest;
}

/** Keeps pinned dates with a folder that moved or was renamed, and with the folders inside it. */
export function movePinned(pinned: PinnedDates, from: string, to: string): PinnedDates {
  return Object.fromEntries(Object.entries(pinned).map(([k, v]) => [k === from || k.startsWith(from + '/') ? to + k.slice(from.length) : k, v]));
}

export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Oct 14, 2026" */
export function showDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The date of every folder in the tree. A folder with nothing in it and no pinned date has none. */
export async function folderDates(fs: StorageAdapter, nodes: TreeNode[], pinned: PinnedDates): Promise<Map<string, FolderDate>> {
  const dates = new Map<string, FolderDate>();
  const walk = async (n: TreeNode): Promise<number> => {
    if (n.kind === 'file') return fs.modified(n.path).catch(() => 0);
    let latest = 0;
    for (const c of n.children ?? []) latest = Math.max(latest, await walk(c));
    const own = pinned[n.path];
    if (own) dates.set(n.path, { date: own, pinned: true });
    else if (latest > 0) dates.set(n.path, { date: dayOf(latest), pinned: false });
    return latest;
  };
  for (const n of nodes) await walk(n);
  return dates;
}
