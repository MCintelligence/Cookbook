import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { plainText } from '../editor/markdown';
import { type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, HIDDEN_FOLDER, PANTRY, readDocument, readTree, walkFiles } from './book';
import { type CookbookDocument, type DocumentKind } from './document';

/**
 * The hidden index: everything that can be worked out again from the files
 * (search now; links between scenes and Pantry cards later). It is a SQLite
 * database with full-text search, kept in `.cookbook/index.sqlite`. Each
 * file's stamp is stored with it, so opening a book only rereads the files
 * that changed since last time. Deleting it is always safe.
 */
export const INDEX_FILE = joinPath(HIDDEN_FOLDER, 'index.sqlite');
const SCHEMA_VERSION = 1;

export interface IndexedDocument {
  path: string;
  id: string;
  title: string;
  kind: DocumentKind;
  words: number;
  /** The words of the file without markup. */
  text: string;
  stamp: string;
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
  const text = plainText(doc.body);
  return { path, id: doc.id, title: doc.title, kind: doc.kind, words: countWords(text), text, stamp };
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
      create table docs (rowid integer primary key, path text unique not null, id text, title text, kind text, words integer, stamp text);
      create virtual table docs_fts using fts5(title, text, tokenize = 'porter unicode61 remove_diacritics 2');
      pragma user_version = ${SCHEMA_VERSION};
    `);
    return new BookIndex(sqlite3, db);
  }

  upsert(doc: IndexedDocument): void {
    this.db.transaction(() => {
      this.removeRow(doc.path);
      this.db.exec({
        sql: 'insert into docs (path, id, title, kind, words, stamp) values (?, ?, ?, ?, ?, ?)',
        bind: [doc.path, doc.id, doc.title, doc.kind, doc.words, doc.stamp],
      });
      const rowid = this.db.selectValue('select last_insert_rowid()') as number;
      this.db.exec({ sql: 'insert into docs_fts (rowid, title, text) values (?, ?, ?)', bind: [rowid, doc.title, doc.text] });
    });
  }

  remove(path: string): void {
    this.db.transaction(() => this.removeRow(path));
  }

  private removeRow(path: string): void {
    const rowid = this.db.selectValue('select rowid from docs where path = ?', [path]) as number | undefined;
    if (rowid === undefined) return;
    this.db.exec({ sql: 'delete from docs_fts where rowid = ?', bind: [rowid] });
    this.db.exec({ sql: 'delete from docs where rowid = ?', bind: [rowid] });
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
  for (const root of [BOOKSHELF, PANTRY]) {
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
