import { type StorageAdapter, joinPath } from './adapter';
import { HIDDEN_FOLDER } from './book';

/**
 * Snapshots, as in Scrivener: a copy of one scene's text at a moment, to
 * compare with or go back to. They are kept in the book's hidden folder, one
 * folder per scene (by its id, so they follow it when it moves or is renamed):
 *
 *   .cookbook/snapshots/<scene id>/2026-10-22T14-05-09-123Z.json
 */
export interface Snapshot {
  /** Its file, to read or delete it by. */
  path: string;
  date: Date;
  title: string;
  /** Why it was taken: by hand, or before a split, merge or replace all. */
  reason: string;
  body: string;
}

const folderOf = (id: string) => joinPath(HIDDEN_FOLDER, 'snapshots', id.replace(/[^\w-]/g, '_'));

export async function takeSnapshot(fs: StorageAdapter, scene: { id: string; title: string; body: string }, reason: string, now = new Date()): Promise<Snapshot> {
  const folder = folderOf(scene.id);
  await fs.makeFolder(folder);
  const path = joinPath(folder, `${now.toISOString().replace(/[:.]/g, '-')}.json`);
  const snapshot = { date: now.toISOString(), title: scene.title, reason, body: scene.body };
  await fs.writeText(path, JSON.stringify(snapshot, null, 2) + '\n');
  return { path, date: now, title: scene.title, reason, body: scene.body };
}

/** A scene's snapshots, newest first. Damaged files are skipped. */
export async function listSnapshots(fs: StorageAdapter, id: string): Promise<Snapshot[]> {
  const folder = folderOf(id);
  if (!(await fs.exists(folder))) return [];
  const out: Snapshot[] = [];
  for (const entry of await fs.list(folder)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    const path = joinPath(folder, entry.name);
    try {
      const raw = JSON.parse(await fs.readText(path)) as Record<string, unknown>;
      const date = new Date(String(raw.date));
      if (typeof raw.body !== 'string' || Number.isNaN(date.getTime())) continue;
      out.push({ path, date, title: String(raw.title ?? ''), reason: String(raw.reason ?? ''), body: raw.body });
    } catch {
      // Not a snapshot Cookbook can read.
    }
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function deleteSnapshot(fs: StorageAdapter, snapshot: Pick<Snapshot, 'path'>): Promise<void> {
  return fs.remove(snapshot.path);
}

export type Change = { kind: 'same' | 'added' | 'removed'; text: string };

/** Longest common subsequence of two lists, as matched index pairs. */
function lcs<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = same(a[i]!, b[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (same(a[i]!, b[j]!)) pairs.push([i++, j++]);
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

function diffWords(before: string, after: string): Change[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const out: Change[] = [];
  const push = (kind: Change['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last?.kind === kind) last.text += text;
    else if (text) out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of [...lcs(a, b, (p, q) => p === q), [a.length, b.length] as [number, number]]) {
    while (i < x) push('removed', a[i++]!);
    while (j < y) push('added', b[j++]!);
    if (x < a.length) push('same', a[i++]!), j++;
  }
  return out;
}

/**
 * What changed from `before` to `after`, paragraph by paragraph and then word
 * by word inside paragraphs that changed, so long scenes stay quick to compare.
 */
export function compareText(before: string, after: string): Change[][] {
  const a = before.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const b = after.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: Change[][] = [];
  let i = 0;
  let j = 0;
  for (const [x, y] of [...lcs(a, b, (p, q) => p === q), [a.length, b.length] as [number, number]]) {
    // Paragraphs between matches: pair them up and compare their words.
    while (i < x && j < y) out.push(diffWords(a[i++]!, b[j++]!));
    while (i < x) out.push([{ kind: 'removed', text: a[i++]! }]);
    while (j < y) out.push([{ kind: 'added', text: b[j++]! }]);
    if (x < a.length) out.push([{ kind: 'same', text: a[i++]! }]), j++;
  }
  return out;
}
