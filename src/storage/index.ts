import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { plainText } from '../editor/markdown';
import { type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, HIDDEN_FOLDER, NOTES_ON, PANTRY, RECIPES, readDocument, readTree, walkFiles } from './book';
import { type CookbookDocument, type DocumentKind, type Relationship, type SceneStatus, akaOf, cardFieldsOf, includedInExport, isCard, labelOf, portraitOf, relationshipsOf, statusOf, synopsisOf } from './document';

/**
 * The hidden index: everything that can be worked out again from the files
 * (search now; links between scenes and Pantry cards later). It is a SQLite
 * database with full-text search, kept in `.cookbook/index.sqlite`. Each
 * file's stamp is stored with it, so opening a book only rereads the files
 * that changed since last time. Deleting it is always safe.
 */
export const INDEX_FILE = joinPath(HIDDEN_FOLDER, 'index.sqlite');
const SCHEMA_VERSION = 5;

export interface IndexedDocument {
  path: string;
  id: string;
  title: string;
  kind: DocumentKind;
  words: number;
  synopsis: string;
  status: SceneStatus;
  /** Other names a Pantry card goes by. */
  aka: string[];
  /** Where a Pantry card's picture is, or '' when it has none. */
  portrait: string;
  /** A colour label (see LABELS), or ''. */
  label: string;
  /** Left out when the book is exported. */
  skipExport: boolean;
  relationships: Relationship[];
  /** The words of the file without markup. */
  text: string;
  stamp: string;
}

/** What the Bookshelf shows on each card. */
export type CardSummary = Pick<IndexedDocument, 'id' | 'title' | 'kind' | 'words' | 'synopsis' | 'status' | 'aka' | 'portrait' | 'label' | 'skipExport'>;

export interface SceneMention {
  path: string;
  title: string;
  count: number;
}

/** A relationship another card has with this one, such as Ruth's "Mother of" on June's card. */
export interface IncomingRelationship {
  path: string;
  title: string;
  as: string;
}

export interface SearchOptions {
  kinds?: DocumentKind[];
  limit?: number;
}

export interface SearchHit {
  path: string;
  title: string;
  kind: DocumentKind;
  /** A few words around the best match. Matched words are wrapped in MATCH_START and MATCH_END. */
  snippet: string;
}

export const MATCH_START = '\u0002';
export const MATCH_END = '\u0003';

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)?.length ?? 0;
}

export function toIndexed(path: string, doc: CookbookDocument, stamp: string): IndexedDocument {
  const body = plainText(doc.body);
  // A Pantry card's names and fields are searchable too, so "baker" finds the character whose role it is.
  const extra = !isCard(doc.kind) ? [] : [...akaOf(doc.fields), ...cardFieldsOf(doc.fields).map(([, v]) => v)].filter(Boolean);
  const text = extra.length > 0 ? `${body}\n${extra.join('\n')}` : body;
  return {
    path,
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    words: countWords(body),
    synopsis: synopsisOf(doc.fields),
    status: statusOf(doc.fields),
    aka: akaOf(doc.fields),
    portrait: portraitOf(doc.fields) ?? '',
    label: labelOf(doc.fields) ?? '',
    skipExport: !includedInExport(doc.fields),
    relationships: relationshipsOf(doc.fields).filter((r) => r.to),
    text,
    stamp,
  };
}

/** Each word must start a word in the title or text, so "corn" finds "cornbread". */
export function toFtsQuery(query: string): string {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map((w) => `"${w}"*`).join(' ');
}

let sqlite: Promise<Sqlite3Static> | null = null;

function loadSqlite(): Promise<Sqlite3Static> {
  // Loaded on first use, so the editor never waits for the database engine.
  sqlite ??= import('@sqlite.org/sqlite-wasm').then((m) => m.default());
  return sqlite;
}

export class BookIndex {
  private constructor(
    private sqlite3: Sqlite3Static,
    private db: Database,
  ) {}

  /** Opens a saved index, or starts an empty one when there is none or it cannot be read. */
  static async open(saved?: Uint8Array): Promise<BookIndex> {
    const sqlite3 = await loadSqlite();
    if (saved && saved.length > 0) {
      const db = new sqlite3.oo1.DB(':memory:');
      try {
        const p = sqlite3.wasm.allocFromTypedArray(saved);
        const { capi } = sqlite3;
        db.checkRc(
          capi.sqlite3_deserialize(db.pointer!, 'main', p, saved.length, saved.length, capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE),
        );
        if (db.selectValue('pragma user_version') === SCHEMA_VERSION) return new BookIndex(sqlite3, db);
      } catch {
        // A damaged or old index is simply rebuilt.
      }
      db.close();
    }
    const db = new sqlite3.oo1.DB(':memory:');
    db.exec(`
      create table docs (rowid integer primary key, path text unique not null, id text, title text, kind text, words integer, synopsis text, status text, aka text, portrait text, label text, skip_export integer, stamp text);
      create table links (from_path text not null, to_id text not null, label text);
      create index links_to on links (to_id);
      create virtual table docs_fts using fts5(title, text, tokenize = 'porter unicode61 remove_diacritics 2');
      pragma user_version = ${SCHEMA_VERSION};
    `);
    return new BookIndex(sqlite3, db);
  }

  upsert(doc: IndexedDocument): void {
    this.db.transaction(() => {
      this.removeRow(doc.path);
      this.db.exec({
        sql: 'insert into docs (path, id, title, kind, words, synopsis, status, aka, portrait, label, skip_export, stamp) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        bind: [doc.path, doc.id, doc.title, doc.kind, doc.words, doc.synopsis, doc.status, JSON.stringify(doc.aka), doc.portrait, doc.label, doc.skipExport ? 1 : 0, doc.stamp],
      });
      const rowid = this.db.selectValue('select last_insert_rowid()') as number;
      this.db.exec({ sql: 'insert into docs_fts (rowid, title, text) values (?, ?, ?)', bind: [rowid, doc.title, doc.text] });
      for (const r of doc.relationships) {
        this.db.exec({ sql: 'insert into links (from_path, to_id, label) values (?, ?, ?)', bind: [doc.path, r.to, r.as] });
      }
    });
  }

  remove(path: string): void {
    this.db.transaction(() => this.removeRow(path));
  }

  private removeRow(path: string): void {
    const rowid = this.db.selectValue('select rowid from docs where path = ?', [path]) as number | undefined;
    if (rowid === undefined) return;
    this.db.exec({ sql: 'delete from links where from_path = ?', bind: [path] });
    this.db.exec({ sql: 'delete from docs_fts where rowid = ?', bind: [rowid] });
    this.db.exec({ sql: 'delete from docs where rowid = ?', bind: [rowid] });
  }

  /** Follows a file or folder that moved, so its files keep their place in the index. */
  move(from: string, to: string): void {
    const bind = [to, from.length + 1, from, from.length + 1, from + '/'];
    this.db.transaction(() => {
      this.db.exec({ sql: 'update docs set path = ? || substr(path, ?) where path = ? or substr(path, 1, ?) = ?', bind });
      this.db.exec({ sql: 'update links set from_path = ? || substr(from_path, ?) where from_path = ? or substr(from_path, 1, ?) = ?', bind });
    });
  }

  /**
   * Scenes that name a card. Full-text search narrows the scenes down to
   * those with any of the names in them; `count` then checks each one exactly
   * (case and whole words), since search ignores case and word endings.
   */
  scenesNaming(names: string[], count: (text: string) => number): SceneMention[] {
    const query = names
      .map((n) => n.match(/[\p{L}\p{N}]+/gu)?.join(' '))
      .filter(Boolean)
      .map((n) => `"${n}"`)
      .join(' OR ');
    if (!query) return [];
    const rows = this.db.selectArrays(
      `select d.path, d.title, docs_fts.text from docs_fts join docs d on d.rowid = docs_fts.rowid
        where docs_fts match ? and d.kind = 'scene'`,
      [`text : (${query})`],
    ) as [string, string, string][];
    return rows.map(([path, title, text]) => ({ path, title, count: count(text) })).filter((m) => m.count > 0);
  }

  /** The words of every page, for the proofreader to learn the book's own way with words. */
  pageTexts(): string[] {
    return (this.db.selectArrays(`select docs_fts.text from docs_fts join docs d on d.rowid = docs_fts.rowid where d.kind = 'scene'`) as [string][]).map(([t]) => t);
  }

  /** The relationships other cards have with the card whose id this is. */
  incoming(id: string): IncomingRelationship[] {
    const rows = this.db.selectArrays(
      'select d.path, d.title, l.label from links l join docs d on d.path = l.from_path where l.to_id = ? order by d.title',
      [id],
    ) as [string, string, string][];
    return rows.map(([path, title, as]) => ({ path, title, as }));
  }

  /** Path to what the Bookshelf shows, for every indexed file. */
  cards(): Map<string, CardSummary> {
    const rows = this.db.selectArrays('select path, id, title, kind, words, synopsis, status, aka, portrait, label, skip_export from docs') as [
      string,
      string,
      string,
      DocumentKind,
      number,
      string,
      SceneStatus,
      string,
      string,
      string,
      number,
    ][];
    return new Map(
      rows.map(([path, id, title, kind, words, synopsis, status, aka, portrait, label, skip]) => [
        path,
        { id, title, kind, words, synopsis, status, aka: JSON.parse(aka || '[]') as string[], portrait: portrait ?? '', label: label ?? '', skipExport: skip === 1 },
      ]),
    );
  }

  /** Path to stamp, for every indexed file. */
  stamps(): Map<string, string> {
    const rows = this.db.selectArrays('select path, stamp from docs') as [string, string][];
    return new Map(rows);
  }

  size(): number {
    return this.db.selectValue('select count(*) from docs') as number;
  }

  /** Title matches count ten times as much as matches in the text. */
  search(query: string, { kinds, limit = 50 }: SearchOptions = {}): SearchHit[] {
    const match = toFtsQuery(query);
    if (!match) return [];
    const kindFilter = kinds ? `and d.kind in (${kinds.map(() => '?').join(', ')})` : '';
    const rows = this.db.selectArrays(
      `select d.path, d.title, d.kind, snippet(docs_fts, 1, ?, ?, '…', 14)
            from docs_fts join docs d on d.rowid = docs_fts.rowid
            where docs_fts match ? ${kindFilter}
            order by bm25(docs_fts, 10.0, 1.0), d.title
            limit ?`,
      [MATCH_START, MATCH_END, match, ...(kinds ?? []), limit],
    ) as [string, string, DocumentKind, string][];
    return rows.map(([path, title, kind, snippet]) => ({ path, title, kind, snippet }));
  }

  export(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db);
  }

  close(): void {
    this.db.close();
  }
}

/** Opens the book's saved index, if it has one. */
export async function loadIndex(fs: StorageAdapter): Promise<BookIndex> {
  const saved = (await fs.exists(INDEX_FILE)) ? await fs.readBytes(INDEX_FILE).catch(() => undefined) : undefined;
  return BookIndex.open(saved);
}

export async function saveIndex(fs: StorageAdapter, index: BookIndex): Promise<void> {
  await fs.makeFolder(HIDDEN_FOLDER);
  await fs.writeBytes(INDEX_FILE, index.export());
}

/** Brings the index up to date with the files, rereading only what changed. Returns how many files it touched. */
export async function refreshIndex(fs: StorageAdapter, index: BookIndex): Promise<number> {
  const known = index.stamps();
  const seen = new Set<string>();
  let touched = 0;
  for (const root of NOTES_ON ? [BOOKSHELF, PANTRY, RECIPES] : [BOOKSHELF, PANTRY]) {
    if (!(await fs.exists(root))) continue;
    for (const file of walkFiles(await readTree(fs, root))) {
      seen.add(file.path);
      const stamp = await fs.stamp(file.path);
      if (known.get(file.path) === stamp) continue;
      index.upsert(toIndexed(file.path, await readDocument(fs, file.path), stamp));
      touched++;
    }
  }
  for (const path of known.keys()) {
    if (seen.has(path)) continue;
    index.remove(path);
    touched++;
  }
  return touched;
}
