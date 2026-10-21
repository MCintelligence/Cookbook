import { type StorageAdapter } from './adapter';
import { BOOKSHELF, PANTRY, readDocument, readTree, walkFiles } from './book';
import { type DocumentKind } from './document';

/**
 * The hidden index: everything that can be worked out again from the files
 * (search, links between scenes and Pantry cards, word counts). It lives in
 * `.cookbook/` and is rebuilt whenever it is missing or out of date.
 *
 * Phase 0 ships an in-memory index behind this interface; the SQLite FTS5
 * index (native in Tauri, WebAssembly in the browser) replaces it in Phase 1
 * without changing callers.
 */
export interface IndexedDocument {
  path: string;
  id: string;
  title: string;
  kind: DocumentKind;
  words: number;
  text: string;
}

export interface SearchOptions {
  kinds?: DocumentKind[];
  limit?: number;
}

export interface BookIndex {
  upsert(doc: IndexedDocument): Promise<void>;
  remove(path: string): Promise<void>;
  clear(): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<IndexedDocument[]>;
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)?.length ?? 0;
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export class MemoryIndex implements BookIndex {
  private docs = new Map<string, IndexedDocument>();

  async upsert(doc: IndexedDocument): Promise<void> {
    this.docs.set(doc.path, doc);
  }

  async remove(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async clear(): Promise<void> {
    this.docs.clear();
  }

  /** Every query word must prefix-match a word in the title or text; title hits rank first. */
  async search(query: string, { kinds, limit = 50 }: SearchOptions = {}): Promise<IndexedDocument[]> {
    const wanted = tokens(query);
    if (wanted.length === 0) return [];
    const scored: { doc: IndexedDocument; score: number }[] = [];
    for (const doc of this.docs.values()) {
      if (kinds && !kinds.includes(doc.kind)) continue;
      const title = tokens(doc.title);
      const body = tokens(doc.text);
      let score = 0;
      for (const w of wanted) {
        if (title.some((t) => t.startsWith(w))) score += 10;
        else if (body.some((t) => t.startsWith(w))) score += 1;
        else {
          score = 0;
          break;
        }
      }
      if (score > 0) scored.push({ doc, score });
    }
    scored.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return scored.slice(0, limit).map((s) => s.doc);
  }
}

/** Reads every scene and card and rebuilds the index from scratch. */
export async function rebuildIndex(fs: StorageAdapter, index: BookIndex): Promise<number> {
  await index.clear();
  let count = 0;
  for (const root of [BOOKSHELF, PANTRY]) {
    if (!(await fs.exists(root))) continue;
    for (const file of walkFiles(await readTree(fs, root))) {
      const doc = await readDocument(fs, file.path);
      await index.upsert({
        path: file.path,
        id: doc.id,
        title: doc.title,
        kind: doc.kind,
        words: countWords(doc.body),
        text: doc.body,
      });
      count++;
    }
  }
  return count;
}
