import { strFromU8, unzipSync } from 'fflate';
import { type Entry, type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, PANTRY, type BookInfo, createBook, fileNameFor, saveBookInfo, writeDocument } from './book';
import { type DocumentKind, LABELS, type SceneStatus, newId } from './document';
import { type Order, saveOrder } from './order';
import { type PantrySection, SECTION_KIND } from './pantry';
import { decodeRtf, rtfToContent } from './rtf';
import { serializeMarkdown } from '../editor/markdown';

/**
 * Brings a whole Scrivener project in as a new Recipe. Only the project is
 * read; it is never changed.
 *
 *   The Draft (Manuscript)       → the Shelf: folders become Groups, documents Items, in Binder order
 *   a top-level Characters folder → the Pantry's Characters
 *   a Places, Locations or Settings folder → the Pantry's Settings
 *   Research and every other top-level folder → the Pantry's Materials
 *   the Trash                     → left behind
 *
 * A Scrivener document can hold text and have documents inside it; Cookbook's
 * Groups have no text of their own, so it becomes a Group whose first Item
 * holds its text. Titles, synopses, status, colour labels and "Include in
 * Compile" come with each document. PDFs, pictures and web pages in Research
 * are left behind and counted, so the writer knows to keep the project.
 * Scrivener 3 projects (Files/Data/<UUID>/content.rtf) and Scrivener 2 projects
 * (Files/Docs/<ID>.rtf), from macOS or Windows, are both read.
 */

/** Read access to a Scrivener project: a folder on disk, a folder the browser was given, or a zip. */
export interface ScrivenerSource {
  list(folder: string): Promise<Entry[]>;
  read(path: string): Promise<Uint8Array | null>;
}

/** A Scrivener project read from an ordinary Cookbook folder adapter, such as the desktop app's. */
export function folderSource(fs: Pick<StorageAdapter, 'list' | 'readBytes'>): ScrivenerSource {
  return {
    list: (folder) => fs.list(folder).catch(() => []),
    read: (path) => fs.readBytes(path).catch(() => null),
  };
}

/** A project from a list of files with their paths, such as a zip or a folder picked in the browser. Reads each only when asked. */
export function filesSource(files: Map<string, () => Promise<Uint8Array>>): ScrivenerSource {
  const clean = new Map<string, () => Promise<Uint8Array>>();
  for (const [path, read] of files) clean.set(joinPath(path.replace(/\\/g, '/')), read);
  return {
    async list(folder) {
      const at = joinPath(folder);
      const seen = new Map<string, Entry['kind']>();
      for (const path of clean.keys()) {
        if (at && !path.startsWith(at + '/')) continue;
        const rest = at ? path.slice(at.length + 1) : path;
        const [name, ...more] = rest.split('/');
        if (name) seen.set(name, more.length > 0 ? 'folder' : (seen.get(name) ?? 'file'));
      }
      return [...seen].map(([name, kind]) => ({ name, kind }));
    },
    async read(path) {
      const read = clean.get(joinPath(path));
      return read ? read() : null;
    },
  };
}

/** A project in a zip, such as Scrivener's File › Back Up › Back Up To. Null if the zip holds no project. */
export function zipSource(zip: Uint8Array): ScrivenerSource | null {
  const files = unzipSync(zip);
  const entries = new Map<string, () => Promise<Uint8Array>>();
  for (const [name, data] of Object.entries(files)) if (!name.endsWith('/') && !name.startsWith('__MACOSX/')) entries.set(name, async () => data);
  return [...entries.keys()].some((n) => n.toLowerCase().endsWith('.scrivx')) ? filesSource(entries) : null;
}

export function isScrivenerZip(zip: Uint8Array): boolean {
  try {
    return Object.keys(unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith('.scrivx') })).length > 0;
  } catch {
    return false;
  }
}

const isScrivx = (e: Entry) => e.kind === 'file' && e.name.toLowerCase().endsWith('.scrivx') && !e.name.startsWith('.');
const isScriv = (e: Entry) => e.kind === 'folder' && e.name.toLowerCase().endsWith('.scriv');

/**
 * Finds the project in what was picked: the .scriv folder itself, the folder it
 * sits in, or a zip holding either. Throws, in the writer's words, if there is none or several.
 */
export async function findProject(source: ScrivenerSource, picked = ''): Promise<{ folder: string; scrivx: string }> {
  const look = async (folder: string, depth: number): Promise<{ folder: string; scrivx: string }[]> => {
    const entries = await source.list(folder);
    const own = entries.find(isScrivx);
    if (own) return [{ folder, scrivx: joinPath(folder, own.name) }];
    if (depth === 0) return [];
    const inside = entries.filter((e) => e.kind === 'folder' && !e.name.startsWith('.') && !e.name.startsWith('__MACOSX'));
    // A .scriv folder beside other things is the one meant; otherwise a zip's one wrapping folder is looked in.
    const projects = inside.filter(isScriv);
    const next = projects.length > 0 ? projects : inside.length === 1 ? inside : [];
    return (await Promise.all(next.map((e) => look(joinPath(folder, e.name), depth - 1)))).flat();
  };
  const found = await look(picked, 2);
  if (found.length === 1) return found[0]!;
  if (found.length === 0) throw new Error('There’s no Scrivener project there. Choose the project’s .scriv folder, the folder it is in, or a zip of it.');
  const names = found.map((f) => f.folder.split('/').pop()).join(', ');
  throw new Error(`That folder holds more than one Scrivener project (${names}). Choose just one.`);
}

// ---------- the Binder ----------

export type BinderType = 'DraftFolder' | 'ResearchFolder' | 'TrashFolder' | 'Folder' | 'Text' | 'Other';

export interface BinderItem {
  /** Scrivener 3's UUID, or Scrivener 2's number. */
  id: string;
  /** Whether the files are kept the Scrivener 3 way, in Files/Data/<UUID>/. */
  v3: boolean;
  type: BinderType;
  /** What Scrivener calls it, such as PDF or Image, when it isn't text. */
  rawType: string;
  title: string;
  label: string | null;
  status: SceneStatus | null;
  included: boolean;
  children: BinderItem[];
}

export interface ScrivenerProject {
  binder: BinderItem[];
}

const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const kid = (el: Element | undefined, name: string) => (el ? kids(el, name)[0] : undefined);

/** A Scrivener label colour ("0.7 0.3 0.3", or "#b24f50" on Windows) as the nearest Cookbook label. */
export function nearestLabel(colour: string): string | null {
  let rgb: number[] | null = null;
  const hex = /^#?([0-9a-f]{6})$/i.exec(colour.trim());
  if (hex) rgb = [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16));
  else {
    const parts = colour.trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => Number.isFinite(p))) rgb = parts.slice(0, 3).map((p) => (p <= 1 ? p * 255 : p));
  }
  if (!rgb) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const l of LABELS) {
    const c = [1, 3, 5].map((i) => parseInt(l.color.slice(i, i + 2), 16));
    const d = c.reduce((sum, v, i) => sum + (v - rgb![i]!) ** 2, 0);
    if (d < bestDistance) [best, bestDistance] = [l.id, d];
  }
  return best;
}

/** A Scrivener status, such as "First Draft", as where a Cookbook Item is up to. */
export function statusFrom(name: string): SceneStatus | null {
  const n = name.trim().toLowerCase();
  if (!n || /^(no status|to ?do|not started|idea)$/.test(n)) return null;
  if (/done|final|revised|complete|finished/.test(n)) return 'done';
  return 'simmering';
}

export function parseScrivx(xml: string): ScrivenerProject {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('The Scrivener project file is damaged and couldn’t be read.');
  const root = doc.documentElement;
  // Labels with no colour ("No Label") and statuses with no meaning ("No Status") come through as nothing.
  const labels = new Map<string, string>();
  for (const l of Array.from(root.getElementsByTagName('Label'))) {
    const colour = l.getAttribute('Color');
    const id = l.getAttribute('ID');
    const near = colour && id && id !== '-1' && !/^no label$/i.test(l.textContent?.trim() ?? '') ? nearestLabel(colour) : null;
    if (id && near) labels.set(id, near);
  }
  const statuses = new Map<string, SceneStatus>();
  for (const s of Array.from(root.getElementsByTagName('Status'))) {
    const id = s.getAttribute('ID');
    const status = statusFrom(s.textContent ?? '');
    if (id && status) statuses.set(id, status);
  }
  const typeOf = (raw: string): BinderType => (['DraftFolder', 'ResearchFolder', 'TrashFolder', 'Folder', 'Text'].includes(raw) ? (raw as BinderType) : 'Other');
  const item = (el: Element): BinderItem => {
    const meta = kid(el, 'MetaData');
    const uuid = el.getAttribute('UUID');
    const rawType = el.getAttribute('Type') ?? 'Text';
    const included = kid(meta, 'IncludeInCompile')?.textContent?.trim().toLowerCase();
    return {
      id: uuid ?? el.getAttribute('ID') ?? '',
      v3: uuid !== null,
      type: typeOf(rawType),
      rawType,
      title: kid(el, 'Title')?.textContent?.trim() || 'Untitled',
      label: labels.get(kid(meta, 'LabelID')?.textContent?.trim() ?? '') ?? null,
      status: statuses.get(kid(meta, 'StatusID')?.textContent?.trim() ?? '') ?? null,
      // A document goes into the compile unless the project says it doesn't.
      included: included !== 'no',
      children: kids(kid(el, 'Children') ?? el.ownerDocument.createElement('x'), 'BinderItem').map(item),
    };
  };
  const binder = kid(root, 'Binder');
  if (!binder) throw new Error('This Scrivener project has no Binder in it.');
  return { binder: kids(binder, 'BinderItem').map(item) };
}

// ---------- making the Recipe ----------

export interface ScrivenerImport {
  info: BookInfo;
  /** How many Items came onto the Shelf and into the Pantry. */
  items: number;
  cards: number;
  /** Titles of PDFs, pictures and other files that weren't brought in. */
  skipped: string[];
  /** The first Item on the Shelf, to open. */
  first: string | null;
}

const isTextual = (b: BinderItem) => b.type === 'Folder' || b.type === 'Text' || b.type === 'DraftFolder' || b.type === 'ResearchFolder';

/** Which Pantry section a top-level Binder folder belongs in. */
export function sectionFor(item: BinderItem): PantrySection {
  if (/character|people|cast/i.test(item.title)) return 'characters';
  if (/place|location|setting|world/i.test(item.title)) return 'settings';
  return 'research';
}

/**
 * Lays out the project as a new Recipe in an empty folder. Run it inside
 * makeBookOrUndo, so a project that fails part way leaves nothing behind.
 */
export async function importScrivener(source: ScrivenerSource, fs: StorageAdapter, picked = '', title?: string): Promise<ScrivenerImport> {
  const { folder, scrivx } = await findProject(source, picked);
  const xml = await source.read(scrivx);
  if (!xml) throw new Error('The Scrivener project file couldn’t be read.');
  const project = parseScrivx(strFromU8(xml));
  const name = title ?? (scrivx.split('/').pop() ?? 'Scrivener project').replace(/\.scrivx$/i, '');
  const info = await createBook(fs, name);
  const order: Order = {};
  const skipped: string[] = [];
  let items = 0;
  let cards = 0;
  let first: string | null = null;

  /** The page held by a Binder item, as Cookbook Markdown, and its synopsis. */
  const textOf = async (b: BinderItem): Promise<{ body: string; synopsis: string }> => {
    const base = b.v3 ? joinPath(folder, 'Files', 'Data', b.id) : joinPath(folder, 'Files', 'Docs');
    const tries = b.v3 ? ['content.rtf', 'content.rtfd/TXT.rtf'] : [`${b.id}.rtf`, `${b.id}.rtfd/TXT.rtf`];
    let body = '';
    for (const t of tries) {
      const bytes = await source.read(joinPath(base, t));
      if (bytes) {
        body = serializeMarkdown({ type: 'doc', content: rtfToContent(decodeRtf(bytes)) });
        break;
      }
    }
    if (!body) {
      const plain = await source.read(joinPath(base, b.v3 ? 'content.txt' : `${b.id}.txt`));
      if (plain) body = serializeMarkdown({ type: 'doc', content: strFromU8(plain).split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean).map((p) => ({ type: 'paragraph', attrs: { style: 'body' }, content: [{ type: 'text', text: p.replace(/\s*\r?\n\s*/g, ' ') }] })) });
    }
    const syn = await source.read(joinPath(base, b.v3 ? 'synopsis.txt' : `${b.id}_synopsis.txt`));
    return { body, synopsis: syn ? strFromU8(syn).trim() : '' };
  };

  const unique = (into: string, wanted: string): string => {
    const taken = new Set((order[into] ?? []).map((n) => n.toLowerCase()));
    let name = wanted;
    const ext = wanted.endsWith('.md') ? '.md' : '';
    const stem = ext ? wanted.slice(0, -ext.length) : wanted;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
    (order[into] ??= []).push(name);
    return name;
  };

  const writeItem = async (into: string, b: BinderItem, kind: DocumentKind, page: { body: string; synopsis: string }) => {
    const path = joinPath(into, unique(into, `${fileNameFor(b.title)}.md`));
    const fields: Record<string, unknown> = {
      ...(b.status && b.status !== 'not-started' && { status: b.status }),
      ...(page.synopsis && { synopsis: page.synopsis }),
      ...(b.label && { label: b.label }),
      ...(kind === 'scene' && !b.included && { export: false }),
    };
    await writeDocument(fs, path, { id: newId(), title: b.title, kind, fields, body: page.body });
    if (kind === 'scene') {
      items++;
      first ??= path;
    } else cards++;
  };

  const place = async (into: string, list: BinderItem[], kind: DocumentKind) => {
    for (const b of list) {
      if (!isTextual(b)) {
        skipped.push(b.title);
        continue;
      }
      const page = await textOf(b);
      const children = b.children.filter((c) => c.type !== 'TrashFolder');
      if (b.type === 'Text' && children.length === 0) {
        await writeItem(into, b, kind, page);
        continue;
      }
      const group = joinPath(into, unique(into, fileNameFor(b.title)));
      await fs.makeFolder(group);
      if (page.body.trim() || page.synopsis) await writeItem(group, b, kind, page);
      await place(group, children, kind);
    }
  };

  for (const top of project.binder) {
    if (top.type === 'TrashFolder') continue;
    if (top.type === 'DraftFolder') {
      // The Draft's own text, if it has any, opens the Shelf.
      const page = await textOf(top);
      if (page.body.trim()) await writeItem(BOOKSHELF, top, 'scene', page);
      await place(BOOKSHELF, top.children, 'scene');
      continue;
    }
    const section = top.type === 'ResearchFolder' ? 'research' : sectionFor(top);
    const into = joinPath(PANTRY, section);
    // Research, Characters and Places become the Pantry section itself; any other top-level folder is a Group in Materials.
    if (top.type === 'ResearchFolder' || section !== 'research' || /^research$/i.test(top.title)) {
      const page = await textOf(top);
      if (page.body.trim()) await writeItem(into, top, SECTION_KIND[section], page);
      await place(into, top.children, SECTION_KIND[section]);
    } else await place(into, [top], SECTION_KIND[section]);
  }

  await saveOrder(fs, order);
  await saveBookInfo(fs, info);
  return { info, items, cards, skipped, first };
}
