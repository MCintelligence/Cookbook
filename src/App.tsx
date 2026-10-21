import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type StorageAdapter } from './storage/adapter';
import {
  BOOKSHELF,
  PANTRY,
  type BookInfo,
  type TreeNode,
  createBook,
  createDocument,
  fileNameFor,
  openBook,
  readDocument,
  readTree,
  writeDocument,
} from './storage/book';
import { type CookbookDocument } from './storage/document';
import { type BookIndex, type SearchHit, countWords, loadIndex, refreshIndex, saveIndex, toIndexed } from './storage/index';
import {
  type BookLocation,
  DEFAULT_BOOK,
  childLocation,
  defaultLocation,
  newBookLocation,
  openLocation,
  pickFolder,
  recentBooks,
  rememberBook,
  sameLocation,
} from './storage/platform';
import { type ParagraphStyle, type StyleSheet, defaultStyles, loadStyles, paragraphStyle, saveStyles, stylesToCss, updateParagraphStyle } from './styles/styles';
import { PageEditor } from './editor/PageEditor';
import { type SeasoningsRequest } from './editor/seasonings';
import { BookLibrary } from './ui/BookLibrary';
import { FindBox } from './ui/FindBox';
import { PageFootnotes } from './ui/PageFootnotes';
import { type Notes, Seasonings, type SeasoningsTab, useSeasoningsCount } from './ui/Seasonings';
import { Logo } from './ui/Logo';
import { Toolbar } from './ui/Toolbar';
import { Tree } from './ui/Tree';

type Tab = 'book' | 'pantry';

const SAVE_DELAY_MS = 600;
/** The search index is cheap to rebuild, so it is written back less often than scenes. */
const INDEX_SAVE_DELAY_MS = 5000;
const NOT_A_BOOK = 'This folder is not a Cookbook book.';

/** Notes to self live in the scene's front matter, keyed by the id of their anchor in the text. */
function readNotes(doc: CookbookDocument | null): Notes {
  const raw = doc?.fields.notes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([id, text]) => [id, typeof text === 'string' ? text : String(text ?? '')]));
}

async function startBook(fs: StorageAdapter, title: string): Promise<BookInfo> {
  const info = await createBook(fs, title);
  await fs.makeFolder(`${BOOKSHELF}/Chapter 1`);
  await createDocument(fs, `${BOOKSHELF}/Chapter 1`, 'First scene');
  return info;
}

function folderName(location: BookLocation): string {
  if (location.kind === 'folder') return location.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || DEFAULT_BOOK;
  return location.name;
}

export function App() {
  const [fs, setFs] = useState<StorageAdapter | null>(null);
  const [where, setWhere] = useState('');
  const [book, setBook] = useState<BookInfo | null>(null);
  const [sheet, setSheet] = useState<StyleSheet>(defaultStyles);
  const [tab, setTab] = useState<Tab>('book');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<CookbookDocument | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasoningsOpen, setSeasoningsOpen] = useState(false);
  const [seasoningsTab, setSeasoningsTab] = useState<SeasoningsTab>('all');
  const [seasoningsRequest, setSeasoningsRequest] = useState<(SeasoningsRequest & { at: number }) | null>(null);
  const docRef = useRef<CookbookDocument | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<(() => Promise<void>) | null>(null);
  const started = useRef(false);
  const [location, setLocation] = useState<BookLocation | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<BookLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const index = useRef<{ fs: StorageAdapter; index: BookIndex } | null>(null);
  const indexTimer = useRef<number | undefined>(undefined);
  const [indexVersion, setIndexVersion] = useState(0);

  const saveIndexNow = useCallback(async () => {
    window.clearTimeout(indexTimer.current);
    indexTimer.current = undefined;
    const current = index.current;
    if (current) await saveIndex(current.fs, current.index).catch(() => {});
  }, []);

  const indexChanged = useCallback(() => {
    setIndexVersion((v) => v + 1);
    window.clearTimeout(indexTimer.current);
    indexTimer.current = window.setTimeout(() => void saveIndexNow(), INDEX_SAVE_DELAY_MS);
  }, [saveIndexNow]);

  /**
   * Opens the book at a location. `create` starts a new book there; `adopt`
   * turns a folder that is not a book yet into one.
   */
  const openAt = async (target: BookLocation, mode: { create?: string; adopt?: boolean } = {}) => {
    await flushSave();
    await saveIndexNow();
    const { fs: nextFs, where: nextWhere } = await openLocation(target);
    let info: BookInfo;
    if (mode.create) info = await startBook(nextFs, mode.create);
    else {
      try {
        info = await openBook(nextFs);
      } catch (e) {
        if (!(e instanceof Error && e.message === NOT_A_BOOK)) throw e;
        if (mode.adopt) info = await createBook(nextFs, folderName(target));
        else if (sameLocation(target, await defaultLocation())) info = await startBook(nextFs, DEFAULT_BOOK);
        else throw e;
      }
    }
    index.current?.index.close();
    index.current = null;
    setEditor(null);
    docRef.current = null;
    setDoc(null);
    setPath(null);
    setTab('book');
    setBook(info);
    setSheet(await loadStyles(nextFs));
    setFs(nextFs);
    setWhere(nextWhere);
    setLocation(target);
    rememberBook({ location: target, title: info.title });

    // The index catches up in the background; search works on whatever it has so far.
    const opened = { fs: nextFs, index: await loadIndex(nextFs) };
    index.current = opened;
    setIndexVersion((v) => v + 1);
    refreshIndex(nextFs, opened.index)
      .then((touched) => {
        if (touched > 0 && index.current === opened) indexChanged();
      })
      .catch((e: unknown) => setError(`Search may miss some files: ${String(e)}`));
  };

  /** Runs a library action. The dialog closes when it succeeds and stays open, with the reason, when it fails. */
  const fromLibrary = async (action: () => Promise<'done' | 'cancelled'>) => {
    setBusy(true);
    setLibraryError(null);
    try {
      if ((await action()) === 'done') {
        setLibraryOpen(false);
        setAdopting(null);
      }
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = () =>
    fromLibrary(async () => {
      const picked = await pickFolder('Open a book folder');
      if (!picked) return 'cancelled';
      try {
        await openAt(picked);
        return 'done';
      } catch (e) {
        if (!(e instanceof Error && e.message === NOT_A_BOOK)) throw e;
        setAdopting(picked);
        return 'cancelled';
      }
    });

  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
    setLibraryError(null);
    setAdopting(null);
  }, []);

  const createNewBook = (title: string, inFolder: boolean) =>
    fromLibrary(async () => {
      let target: BookLocation;
      if (inFolder) {
        const parent = await pickFolder(`Choose where to keep “${title}”`);
        if (!parent) return 'cancelled';
        target = await childLocation(parent, fileNameFor(title));
      } else target = await newBookLocation(fileNameFor(title));
      await openAt(target, { create: title });
      return 'done';
    });

  useEffect(() => {
    // StrictMode runs effects twice in development; open the book only once.
    if (started.current) return;
    started.current = true;
    const last = recentBooks()[0]?.location;
    (async () => {
      if (last) {
        try {
          await openAt(last);
          return;
        } catch (e) {
          // A folder that moved, or one the browser needs a click to reopen: show the books instead.
          setLibraryError(e instanceof Error ? e.message : String(e));
          setLibraryOpen(true);
        }
      }
      await openAt(await defaultLocation());
    })().catch((e: unknown) => setError(String(e)));
  }, []);

  const refreshTree = useCallback(async () => {
    if (fs) setTree(await readTree(fs, tab === 'book' ? BOOKSHELF : PANTRY));
  }, [fs, tab]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const save = pendingSave.current;
    pendingSave.current = null;
    if (save) await save().catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    // Save straight away when the window is hidden or closed, rather than losing the last few words.
    const onHide = () => {
      void flushSave();
      void saveIndexNow();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushSave, saveIndexNow]);

  const scheduleSave = (next: CookbookDocument) => {
    if (!fs || !path) return;
    const target = path;
    docRef.current = next;
    const current = index.current;
    pendingSave.current = async () => {
      await writeDocument(fs, target, next);
      if (current && current === index.current) {
        current.index.upsert(toIndexed(target, next, await fs.stamp(target)));
        indexChanged();
      }
    };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS);
  };

  const select = async (p: string) => {
    if (!fs) return;
    await flushSave();
    if (p.startsWith(PANTRY + '/')) setTab('pantry');
    else if (p.startsWith(BOOKSHELF + '/')) setTab('book');
    const opened = await readDocument(fs, p);
    docRef.current = opened;
    setPath(p);
    setDoc(opened);
  };

  const addScene = async () => {
    if (!fs) return;
    const folder = tab === 'book' ? BOOKSHELF : `${PANTRY}/characters`;
    const p = await createDocument(fs, folder, tab === 'book' ? 'New scene' : 'New character', tab === 'book' ? 'scene' : 'character');
    const current = index.current;
    if (current) current.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
    indexChanged();
    await refreshTree();
    await select(p);
  };

  const editStyle = (id: string, changes: Partial<ParagraphStyle>) => {
    const next = updateParagraphStyle(sheet, id, changes);
    setSheet(next);
    if (fs) saveStyles(fs, next).catch((e: unknown) => setError(String(e)));
  };

  const notes = readNotes(doc);
  const setNotes = (next: Notes) => {
    const base = docRef.current ?? doc;
    if (!base) return;
    const { notes: _old, ...fields } = base.fields;
    const updated = { ...base, fields: Object.keys(next).length > 0 ? { ...fields, notes: next } : fields };
    setDoc(updated);
    scheduleSave(updated);
  };

  const showInSeasonings = (request: SeasoningsRequest) => {
    // A note added from the keyboard needs its entry in the front matter too.
    if (request.tab === 'notes' && !(request.id in readNotes(docRef.current))) setNotes({ ...readNotes(docRef.current), [request.id]: '' });
    setSeasoningsOpen(true);
    setSeasoningsTab((t) => (t === 'all' || t === request.tab ? t : request.tab));
    setSeasoningsRequest({ ...request, at: Date.now() });
  };
  const seasoningsCount = useSeasoningsCount(editor, notes);
  // indexVersion changes whenever the index does, so results stay fresh while the writer types a query.
  const searchBook = useCallback((query: string): SearchHit[] => index.current?.index.search(query, { limit: 8 }) ?? [], [indexVersion]);

  const nextStyle = useCallback((style: string) => paragraphStyle(sheet, style).next ?? style, [sheet]);
  const css = useMemo(() => stylesToCss(sheet), [sheet]);
  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')) : 0),
  });

  return (
    <div className={`app${seasoningsOpen && doc ? ' with-seasonings' : ''}`}>
      <style>{css}</style>
      <header className="topbar">
        <div className="brand-wrap">
          <Logo />
          <span className="brand">Cookbook</span>
          <span className="crumb">
            <button className="crumb-book" aria-haspopup="dialog" title="Your books" onClick={() => setLibraryOpen(true)}>
              {book?.title ?? 'Books'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {doc ? ` · ${doc.title}` : ''}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="seasonings-button"
            aria-pressed={seasoningsOpen}
            aria-expanded={seasoningsOpen}
            disabled={!doc}
            onClick={() => setSeasoningsOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
            Seasonings
            {seasoningsCount > 0 && <span className="badge">{seasoningsCount}</span>}
          </button>
          <FindBox editor={editor} search={searchBook} currentPath={path} onOpenHit={select} />
        </div>
      </header>

      <Toolbar editor={editor} sheet={sheet} onEditStyle={editStyle} />

      <nav className="sidebar" aria-label="Book and Pantry">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>
            Book
          </button>
          <button role="tab" aria-selected={tab === 'pantry'} onClick={() => setTab('pantry')}>
            Pantry
          </button>
        </div>
        <div className="section-label">
          <span>{tab === 'book' ? 'Bookshelf' : 'Pantry'}</span>
          <button className="ghost" onClick={addScene}>
            {tab === 'book' ? 'New scene' : 'New card'}
          </button>
        </div>
        <Tree nodes={tree} selected={path} onSelect={select} />
      </nav>

      <main className="desk">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {doc && path ? (
          <article className="cb-page" key={path}>
            <input
              className="scene-title"
              aria-label="Scene title"
              value={doc.title}
              onChange={(e) => {
                const next = { ...(docRef.current ?? doc), title: e.target.value };
                setDoc(next);
                scheduleSave(next);
              }}
            />
            <PageEditor
              initialBody={doc.body}
              nextStyle={nextStyle}
              onReady={setEditor}
              onChange={(body) => scheduleSave({ ...(docRef.current ?? doc), body })}
              onSeasonings={showInSeasonings}
            />
            <PageFootnotes editor={editor} />
          </article>
        ) : (
          <p className="empty">Pick a scene from the Bookshelf to start writing.</p>
        )}
      </main>

      {seasoningsOpen && doc && (
        <Seasonings
          editor={editor}
          notes={notes}
          onNotesChange={setNotes}
          tab={seasoningsTab}
          onTab={setSeasoningsTab}
          request={seasoningsRequest}
          onRequest={showInSeasonings}
          onClose={() => setSeasoningsOpen(false)}
        />
      )}

      {libraryOpen && (
        <BookLibrary
          current={location}
          adopting={adopting}
          error={libraryError}
          busy={busy}
          onOpen={(target) =>
            void fromLibrary(async () => {
              await openAt(target);
              return 'done';
            })
          }
          onOpenFolder={() => void openFolder()}
          onCreate={(title, inFolder) => void createNewBook(title, inFolder)}
          onAdopt={(target) =>
            void fromLibrary(async () => {
              await openAt(target, { adopt: true });
              return 'done';
            })
          }
          onCancelAdopt={() => setAdopting(null)}
          onClose={closeLibrary}
        />
      )}

      <footer className="footer">
        <span>{doc ? `${(words ?? 0).toLocaleString('en')} words` : ''}</span>
        <span>
          {doc ? 'US Letter · 100% · ' : ''}
          {where}
        </span>
      </footer>
    </div>
  );
}
