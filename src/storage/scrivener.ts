import { strFromU8, unzipSync } from 'fflate';
import { type Entry, type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, HIDDEN_FOLDER, PANTRY, type BookInfo, createBook, fileNameFor, saveBookInfo, writeDocument } from './book';
import { type DocumentKind, LABELS, type SceneStatus, newId } from './document';
import { type Order, freeName, saveOrder } from './order';
import { PICTURES, type PantrySection, SECTION_KIND } from './pantry';
import { type LinkedNote, decodeRtf, rtfToContent, rtfToPage, rtfToPlain } from './rtf';
import { BODY_STYLE, HEADING_STYLES, type NodeJSON, serializeMarkdown } from '../editor/markdown';

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
 * Compile" come with each document, and so do:
 *
 *   comments and inline annotations → notes to self on the words they were on
 *   linked and inline footnotes     → footnotes
 *   the Inspector's document notes  → the end of a Pantry card; a Shelf Item's or a
 *                                     folder's go to Materials › Notes from Scrivener
 *   snapshots                       → the Item's snapshots
 *   pictures                        → pictures/, shown on a Materials card or as a card's portrait
 *   PDFs, web pages and other files → files/, on a Materials card that names them
 *
 * Keywords, custom metadata, collections and project notes are left behind.
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
  /** The file extension of a PDF, picture or other file, as the project gives it. */
  ext: string | null;
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
      ext: kid(meta, 'FileExtension')?.textContent?.trim().replace(/^\./, '').toLowerCase() || null,
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
  /** Notes to self made from Scrivener's comments and annotations. */
  notes: number;
  /** PDFs, pictures and other files brought in, each as a Materials card. */
  files: number;
  /** Snapshots brought in with their Items. */
  snapshots: number;
  /** Titles of PDFs, pictures and other files whose file wasn't in the project. */
  skipped: string[];
  /** The first Item on the Shelf, to open. */
  first: string | null;
}

/** Where a PDF, film or other file Cookbook can't show is kept in the Recipe, beside pictures/. */
export const FILES_FOLDER = 'files';
/** The Materials Group for document notes that have no page to sit on. */
export const NOTES_GROUP = 'Notes from Scrivener';

const isTextual = (b: BinderItem) => b.type === 'Folder' || b.type === 'Text' || b.type === 'DraftFolder' || b.type === 'ResearchFolder';

/** Pictures a browser can show, so they are put in the page. */
const SHOWN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
/** A document's own files in its Data folder, which are never the PDF or picture it holds. */
const OWN_FILES = /^(content\.(rtf|rtfd|txt|comments|styles|indexcard)|notes\.(rtf|rtfd)|synopsis\.txt|snapshots|search\.indexes)$/i;

/** What a file is, in a few words, from its extension. */
export function fileKind(ext: string): string {
  if (ext === 'pdf') return 'PDF';
  if (SHOWN.has(ext) || /^(tiff?|heic|heif|psd)$/.test(ext)) return 'picture';
  if (/^(webarchive|html?|mht(ml)?)$/.test(ext)) return 'web page';
  if (/^(mp3|m4a|wav|aiff?|aac|ogg|flac)$/.test(ext)) return 'sound file';
  if (/^(mp4|mov|m4v|avi|mkv|webm)$/.test(ext)) return 'film';
  return `${ext.toUpperCase()} file`;
}

/** Which Pantry section a top-level Binder folder belongs in. */
export function sectionFor(item: BinderItem): PantrySection {
  if (/character|people|cast/i.test(item.title)) return 'characters';
  if (/place|location|setting|world/i.test(item.title)) return 'settings';
  return 'research';
}

/** A document's comments and linked footnotes, from Scrivener 3's content.comments. Damaged files give none. */
export function parseComments(xml: string): Map<string, LinkedNote> {
  const out = new Map<string, LinkedNote>();
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return out;
    for (const c of Array.from(doc.getElementsByTagName('Comment'))) {
      const id = c.getAttribute('ID')?.trim();
      const raw = c.textContent?.trim() ?? '';
      if (!id || !raw) continue;
      const text = raw.startsWith('{\\rtf') ? rtfToPlain(raw) : raw;
      if (text) out.set(id, { text, footnote: /^yes$/i.test(c.getAttribute('Footnote') ?? '') });
    }
  } catch {
    // A comments file Cookbook can't read: the words they were on still come through.
  }
  return out;
}

/** When a snapshot was taken, from its file name (2018-01-01-10-00-00-0000.rtf, 2026-06-15-091400.rtf) or Scrivener's own date. */
export function snapshotDate(name: string): Date | null {
  const scriv = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})$/.exec(name.trim());
  if (scriv) return new Date(`${scriv[1]}T${scriv[2]}${scriv[3]}:${scriv[4]}`);
  const n = /(\d{4})-?(\d{2})-?(\d{2})[-_ T]?(\d{2})[-:]?(\d{2})[-:]?(\d{2})/.exec(name);
  if (!n) return null;
  const [, y, mo, d, h, mi, se] = n.map(Number) as number[];
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, se!));
  return Number.isNaN(date.getTime()) || mo! < 1 || mo! > 12 ? null : date;
}

/** Titles and dates of a document's snapshots, by file name, from the snapshot folder's index.xml. */
function snapshotIndex(xml: string): Map<string, { title: string; date: Date | null }> {
  const out = new Map<string, { title: string; date: Date | null }>();
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return out;
    for (const el of Array.from(doc.getElementsByTagName('Snapshot'))) {
      const read = (name: string) => el.getAttribute(name) ?? kid(el, name)?.textContent ?? '';
      const file = (read('File') || read('Path') || read('Filename')).trim().split('/').pop();
      const date = read('Date');
      if (file) out.set(file, { title: read('Title').trim(), date: date ? snapshotDate(date) : null });
    }
  } catch {
    // Without the index, names and dates come from the files.
  }
  return out;
}

const textNode = (t: string): NodeJSON => ({ type: 'text', text: t });
const para = (...content: NodeJSON[]): NodeJSON => ({ type: 'paragraph', attrs: { style: BODY_STYLE }, content });
const paragraphsOf = (plain: string): NodeJSON[] => plain.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => para(textNode(l)));

/** Takes the notes to self out of a page, for a snapshot, which keeps only its words. */
function withoutNotes(nodes: NodeJSON[]): NodeJSON[] {
  return nodes.map((n) => ({
    ...n,
    ...(n.marks && { marks: n.marks.filter((m) => m.type !== 'note') }),
    ...(n.content && { content: withoutNotes(n.content) }),
  }));
}

/** One Binder item's page: its text and the notes anchored in it, its synopsis and its document notes. */
interface Page {
  content: NodeJSON[];
  notes: Record<string, string>;
  synopsis: string;
  /** The Inspector's notes for the document, as plain text. */
  docNotes: string;
}

/**
 * Lays out the project as a new Recipe in an empty folder. Run it inside
 * makeBookOrUndo, so a project that fails part way leaves nothing behind.
 * A file that is missing or can't be read is passed over, never a reason to stop.
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
  const count = { items: 0, cards: 0, notes: 0, files: 0, snapshots: 0 };
  let first: string | null = null;
  /** Document notes with no page to sit on, written as Materials at the end. */
  const loose: { title: string; text: string }[] = [];

  const read = async (path: string) => {
    try {
      return await source.read(path);
    } catch {
      return null;
    }
  };
  const readText = async (path: string) => {
    const bytes = await read(path);
    return bytes ? strFromU8(bytes) : null;
  };
  /** An RTF document, or the TXT.rtf inside an .rtfd package. */
  const readRtf = async (path: string) => (await read(path)) ?? (await read(path.replace(/\.rtf$/i, '.rtfd/TXT.rtf')));
  const dataFolder = (b: BinderItem) => (b.v3 ? joinPath(folder, 'Files', 'Data', b.id) : joinPath(folder, 'Files', 'Docs'));
  /** Scrivener 2 keeps every document's files side by side in Files/Docs, so that folder is listed once. */
  let docsListing: Promise<Entry[]> | null = null;
  const listing = (b: BinderItem) => (b.v3 ? source.list(dataFolder(b)) : (docsListing ??= source.list(dataFolder(b))));

  const pageOf = async (b: BinderItem): Promise<Page> => {
    const base = dataFolder(b);
    const own = (v3: string, v2: string) => joinPath(base, b.v3 ? v3 : `${b.id}${v2}`);
    const linked = b.v3 ? parseComments((await readText(own('content.comments', '.comments'))) ?? '') : new Map<string, LinkedNote>();
    let content: NodeJSON[] = [];
    let notes: Record<string, string> = {};
    const rtf = await readRtf(own('content.rtf', '.rtf'));
    if (rtf) ({ content, notes } = rtfToPage(decodeRtf(rtf), linked));
    else {
      const plain = await readText(own('content.txt', '.txt'));
      if (plain) content = plain.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean).map((p) => para(textNode(p.replace(/\s*\r?\n\s*/g, ' '))));
    }
    const notesRtf = await readRtf(own('notes.rtf', '_notes.rtf'));
    const docNotes = notesRtf ? rtfToPlain(decodeRtf(notesRtf)) : '';
    const synopsis = ((await readText(own('synopsis.txt', '_synopsis.txt'))) ?? '').trim();
    return { content, notes, synopsis, docNotes };
  };

  const hasWords = (p: Page) => p.content.some((n) => n.type !== 'paragraph' || (n.content ?? []).some((c) => c.type !== 'text' || /\S/.test(c.text ?? '')));

  const unique = (into: string, wanted: string): string => {
    const taken = new Set((order[into] ?? []).map((n) => n.toLowerCase()));
    let name = wanted;
    const dot = wanted.lastIndexOf('.');
    const ext = dot > 0 ? wanted.slice(dot) : '';
    const stem = ext ? wanted.slice(0, -ext.length) : wanted;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
    (order[into] ??= []).push(name);
    return name;
  };

  /** Copies a document's snapshots in beside the Item made from it. */
  const bringSnapshots = async (b: BinderItem, id: string, title: string) => {
    // Versions of Scrivener differ: Snapshots/<id>.snapshots/, Snapshots/Data/<id>/, or the document's own folder. All are looked in.
    const places = [
      joinPath(folder, 'Snapshots', `${b.id}.snapshots`),
      ...(b.v3 ? [joinPath(folder, 'Snapshots', 'Data', b.id), joinPath(dataFolder(b), 'snapshots')] : []),
    ];
    for (const at of places) {
      const entries = await source.list(at).catch(() => [] as Entry[]);
      if (entries.length === 0) continue;
      const index = snapshotIndex((await readText(joinPath(at, 'index.xml'))) ?? '');
      const target = joinPath(HIDDEN_FOLDER, 'snapshots', id.replace(/[^\w-]/g, '_'));
      for (const e of entries) {
        const file = e.kind === 'file' && /\.rtf$/i.test(e.name) ? joinPath(at, e.name) : e.kind === 'folder' && /\.rtfd$/i.test(e.name) ? joinPath(at, e.name, 'TXT.rtf') : null;
        const bytes = file ? await read(file) : null;
        if (!bytes) continue;
        const known = index.get(e.name);
        const date = known?.date ?? snapshotDate(e.name) ?? new Date();
        const body = serializeMarkdown({ type: 'doc', content: withoutNotes(rtfToContent(decodeRtf(bytes))) });
        await fs.makeFolder(target);
        const stamp = `${date.toISOString().replace(/[:.]/g, '-')}`;
        const fileName = await freeName(fs, target, `${stamp}.json`, '.json');
        // A title is in the index, or after the date in the file's name ("2024-05-01-12-00-00 First go.rtf").
        const named = known?.title || (snapshotDate(e.name) ? e.name.replace(/\.rtfd?$/i, '').replace(/^[\d\s_:+-]+/, '').trim() : '');
        const snapshot = { date: date.toISOString(), title, reason: named ? `From Scrivener: ${named}` : 'From Scrivener', body };
        await fs.writeText(joinPath(target, fileName), JSON.stringify(snapshot, null, 2) + '\n');
        count.snapshots++;
      }
    }
  };

  const writeItem = async (into: string, b: BinderItem, kind: DocumentKind, page: Page, extra: Record<string, unknown> = {}) => {
    const path = joinPath(into, unique(into, `${fileNameFor(b.title)}.md`));
    const content = page.content.map((n) => ({ ...n, ...(n.content && { content: [...n.content] }) }));
    const notes = { ...page.notes };
    if (page.docNotes) {
      // The Inspector's notes end a Pantry card, under a heading if the card has words of its own.
      // A Shelf Item's would be printed with the book, so they go to Materials › Notes from Scrivener instead.
      if (kind === 'scene') loose.push({ title: b.title, text: page.docNotes });
      else {
        if (content.length > 0) content.push({ type: 'paragraph', attrs: { style: HEADING_STYLES[2] }, content: [textNode('Notes')] });
        content.push(...paragraphsOf(page.docNotes));
      }
    }
    count.notes += Object.keys(notes).length;
    const fields: Record<string, unknown> = {
      ...(b.status && b.status !== 'not-started' && { status: b.status }),
      ...(page.synopsis && { synopsis: page.synopsis }),
      ...(b.label && { label: b.label }),
      ...(kind === 'scene' && !b.included && { export: false }),
      ...extra,
      ...(Object.keys(notes).length > 0 && { notes }),
    };
    const id = newId();
    await writeDocument(fs, path, { id, title: b.title, kind, fields, body: serializeMarkdown({ type: 'doc', content }) });
    if (kind === 'scene') {
      count.items++;
      first ??= path;
    } else count.cards++;
    await bringSnapshots(b, id, b.title);
  };

  /** Finds the PDF, picture or other file a Binder item holds. */
  const fileOf = async (b: BinderItem): Promise<{ path: string; ext: string } | null> => {
    const entries = (await listing(b).catch(() => [] as Entry[])).filter((e) => e.kind === 'file');
    const prefix = b.v3 ? 'content.' : `${b.id}.`;
    const pick =
      (b.ext && entries.find((e) => e.name.toLowerCase() === `${prefix}${b.ext}`.toLowerCase())) ||
      entries.find((e) => e.name.toLowerCase().startsWith(prefix.toLowerCase()) && !OWN_FILES.test(b.v3 ? e.name : `content${e.name.slice(b.id.length)}`));
    if (!pick) return null;
    return { path: joinPath(dataFolder(b), pick.name), ext: pick.name.slice(pick.name.lastIndexOf('.') + 1).toLowerCase() };
  };

  /** A PDF, picture or web page becomes a card: a picture shown on it, anything else kept in files/ and named on it. */
  const writeFile = async (into: string, b: BinderItem, kind: DocumentKind): Promise<boolean> => {
    const found = await fileOf(b);
    const bytes = found ? await read(found.path) : null;
    const page = await pageOf(b);
    if (!found || !bytes) {
      skipped.push(b.title);
      // Its synopsis and notes are still worth keeping.
      if (page.synopsis || page.docNotes) await writeItem(into, b, kind, { ...page, content: [] });
      return false;
    }
    const what = fileKind(found.ext);
    const shown = SHOWN.has(found.ext);
    const keepIn = shown ? PICTURES : FILES_FOLDER;
    await fs.makeFolder(keepIn);
    const kept = joinPath(keepIn, await freeName(fs, keepIn, `${fileNameFor(b.title)}.${found.ext}`, `.${found.ext}`));
    await fs.writeBytes(kept, bytes);
    count.files++;
    const content: NodeJSON[] = [];
    let extra: Record<string, unknown> = {};
    if (shown && kind !== 'research') extra = { portrait: kept };
    else if (shown) content.push(para({ type: 'image', attrs: { src: kept, alt: b.title } }));
    else {
      content.push(para({ type: 'text', text: `A ${what} brought from Scrivener, kept with this recipe as `, marks: [{ type: 'italic' }] }, { type: 'text', text: kept, marks: [{ type: 'code' }] }, { type: 'text', text: '.', marks: [{ type: 'italic' }] }));
      if (found.ext === 'webarchive') {
        // A web archive is a binary file, but the address it was saved from is in it as plain text.
        const address = /https?:\/\/[^\s"<>\u0000-\u001f]+/.exec(decodeRtf(bytes.subarray(0, 4096)))?.[0];
        if (address) content.push(para(textNode('Saved from '), { type: 'text', text: address, marks: [{ type: 'link', attrs: { href: address } }] }));
      }
      if (/^html?$/.test(found.ext)) {
        const html = new DOMParser().parseFromString(strFromU8(bytes), 'text/html');
        html.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
        const blocks = Array.from(html.body?.querySelectorAll('h1, h2, h3, h4, p, li, blockquote') ?? []).map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '');
        content.push(...(blocks.length > 0 ? blocks : [html.body?.textContent ?? '']).flatMap(paragraphsOf));
      }
    }
    await writeItem(into, b, kind, { ...page, content: [...content, ...page.content] }, extra);
    return true;
  };

  const place = async (into: string, list: BinderItem[], kind: DocumentKind) => {
    for (const b of list) {
      const children = b.children.filter((c) => c.type !== 'TrashFolder');
      if (!isTextual(b)) {
        // A file in the Draft is kept in Materials: Shelf Items are the book's own text.
        const where = kind === 'scene' ? joinPath(PANTRY, 'research') : into;
        const as = kind === 'scene' ? 'research' : kind;
        if (children.length === 0) await writeFile(where, b, as);
        else {
          const group = joinPath(where, unique(where, fileNameFor(b.title)));
          await fs.makeFolder(group);
          await writeFile(group, b, as);
          await place(group, children, as);
        }
        continue;
      }
      const page = await pageOf(b);
      if (b.type === 'Text' && children.length === 0) {
        await writeItem(into, b, kind, page);
        continue;
      }
      const group = joinPath(into, unique(into, fileNameFor(b.title)));
      await fs.makeFolder(group);
      if (hasWords(page) || page.synopsis) await writeItem(group, b, kind, page);
      else if (page.docNotes) loose.push({ title: b.title, text: page.docNotes });
      await place(group, children, kind);
    }
  };

  for (const top of project.binder) {
    if (top.type === 'TrashFolder') continue;
    if (top.type === 'DraftFolder') {
      // The Draft's own text, if it has any, opens the Shelf.
      const page = await pageOf(top);
      if (hasWords(page)) await writeItem(BOOKSHELF, top, 'scene', page);
      else if (page.docNotes) loose.push({ title: top.title, text: page.docNotes });
      await place(BOOKSHELF, top.children, 'scene');
      continue;
    }
    const section = top.type === 'ResearchFolder' ? 'research' : sectionFor(top);
    const into = joinPath(PANTRY, section);
    // Research, Characters and Places become the Pantry section itself; any other top-level folder is a Group in Materials.
    if (isTextual(top) && (top.type === 'ResearchFolder' || section !== 'research' || /^research$/i.test(top.title))) {
      const page = await pageOf(top);
      if (hasWords(page)) await writeItem(into, top, SECTION_KIND[section], page);
      else if (page.docNotes) loose.push({ title: top.title, text: page.docNotes });
      await place(into, top.children, SECTION_KIND[section]);
    } else await place(into, [top], SECTION_KIND[section]);
  }

  // Document notes with no page of their own, such as a folder's, are kept together in Materials.
  if (loose.length > 0) {
    const group = joinPath(PANTRY, 'research', unique(joinPath(PANTRY, 'research'), NOTES_GROUP));
    await fs.makeFolder(group);
    for (const n of loose) {
      const path = joinPath(group, unique(group, `${fileNameFor(n.title)}.md`));
      await writeDocument(fs, path, { id: newId(), title: n.title, kind: 'research', fields: {}, body: serializeMarkdown({ type: 'doc', content: paragraphsOf(n.text) }) });
      count.cards++;
    }
  }

  await saveOrder(fs, order);
  await saveBookInfo(fs, info);
  return { info, ...count, skipped, first };
}
