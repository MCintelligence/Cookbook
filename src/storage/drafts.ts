import { type StorageAdapter, joinPath } from './adapter';
import { parseDocument, serializeDocument } from './document';

/**
 * Drafts: earlier versions of an Item, set aside so it can be written again from a clean page.
 * Drafting an Item moves its text into a new draft and leaves the Item empty, with the draft
 * showing through as faded ghost text to rewrite from. They are kept beside the Shelf, not on it,
 * one folder per Item (by its id, so they follow it when it moves or is renamed):
 *
 *   drafts/<item id>/Draft 1.md
 *   drafts/<item id>/Draft 2.md
 *
 * Each is an ordinary Markdown file, readable in any text editor. Being outside bookshelf/, a
 * draft is never in the word count, Mise en Place, search, Plate or export; being outside the
 * hidden folder, it goes into backups and copies of the Recipe like any other file.
 */
export const DRAFTS = 'drafts';

export interface DraftText {
  n: number;
  title: string;
  /** When it was drafted, or null if the file doesn't say. */
  date: Date | null;
  body: string;
  /** The Item's notes (comments) as they were, so they come back with the text. */
  notes?: Record<string, string>;
}

const safe = (id: string) => id.replace(/[^\w-]/g, '_');
const folderOf = (id: string) => joinPath(DRAFTS, safe(id));
const fileOf = (id: string, n: number) => joinPath(folderOf(id), `Draft ${n}.md`);
const NAME = /^Draft (\d+)\.md$/;

/** The drafts each Item has, by Item id, oldest first. Read from folder names alone, so opening a Recipe reads no draft. */
export async function listDrafts(fs: StorageAdapter): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!(await fs.exists(DRAFTS))) return out;
  for (const folder of await fs.list(DRAFTS)) {
    if (folder.kind !== 'folder') continue;
    const numbers = (await fs.list(joinPath(DRAFTS, folder.name)))
      .map((e) => (e.kind === 'file' ? NAME.exec(e.name) : null))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    if (numbers.length > 0) out.set(folder.name, numbers);
  }
  return out;
}

/** An Item's drafts, oldest first, when the Item's id may not be folder-safe. */
export const draftsOf = (all: Map<string, number[]>, id: string): number[] => all.get(safe(id)) ?? [];

/** Keeps `body` as the Item's next draft, numbered after the highest it has had, and returns its number. */
export async function saveDraft(fs: StorageAdapter, item: { id: string; title: string; body: string; notes?: Record<string, string> }, now = new Date()): Promise<number> {
  await fs.makeFolder(DRAFTS);
  await fs.makeFolder(folderOf(item.id));
  const taken = (await fs.list(folderOf(item.id))).map((e) => NAME.exec(e.name)).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1]));
  const n = Math.max(0, ...taken) + 1;
  await writeDraft(fs, item.id, item.title, { n, title: `Draft ${n}`, date: now, body: item.body, ...(item.notes && { notes: item.notes }) });
  return n;
}

/** Writes a draft under its own number: how a deleted draft is put back. */
export async function writeDraft(fs: StorageAdapter, id: string, itemTitle: string, draft: DraftText): Promise<void> {
  await fs.makeFolder(DRAFTS);
  await fs.makeFolder(folderOf(id));
  const fields: Record<string, unknown> = { item: itemTitle, drafted: (draft.date ?? new Date()).toISOString() };
  if (draft.notes && Object.keys(draft.notes).length > 0) fields.notes = draft.notes;
  await fs.writeText(fileOf(id, draft.n), serializeDocument({ id: `${id}-draft-${draft.n}`, title: draft.title, kind: 'scene', fields, body: draft.body }));
}

export async function readDraft(fs: StorageAdapter, id: string, n: number): Promise<DraftText> {
  const doc = parseDocument(await fs.readText(fileOf(id, n)), `Draft ${n}`);
  const date = typeof doc.fields.drafted === 'string' ? new Date(doc.fields.drafted) : null;
  const raw = doc.fields.notes;
  const notes = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '')])) : undefined;
  return { n, title: doc.title, date: date && !Number.isNaN(date.getTime()) ? date : null, body: doc.body, ...(notes && { notes }) };
}

export async function deleteDraft(fs: StorageAdapter, id: string, n: number): Promise<void> {
  await fs.remove(fileOf(id, n));
  // The Item's folder goes with its last draft, so drafts/ only lists Items that have some.
  if ((await fs.list(folderOf(id)).catch(() => [])).length === 0) await fs.remove(folderOf(id)).catch(() => {});
}

/**
 * The paragraphs of a draft to show as ghost text, without markup. Scene breaks and blank lines
 * are left out: the ghost follows the writer a paragraph at a time.
 */
export function ghostParagraphs(plain: string): string[] {
  return plain
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !/^(\*\s*){3,}$|^#$|^-{3,}$/.test(p));
}
