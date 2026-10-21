import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type StorageAdapter, parentOf } from './storage/adapter';
import {
  BOOKSHELF,
  PANTRY,
  type BookInfo,
  type TreeNode,
  createBook,
  DEFAULT_DAILY_GOAL,
  createDocument,
  fileAfter,
  fileNameFor,
  moveToTrash,
  openBook,
  readDocument,
  readTree,
  saveBookInfo,
  writeDocument,
} from './storage/book';
import { type CookbookDocument } from './storage/document';
import { type WritingHistory, loadHistory, recordWords, saveHistory, summarize } from './storage/history';
import { type BookTemplateId, type DocTemplate, CARD_TEMPLATES, SCENE_TEMPLATES, applyBookTemplate, createFromTemplate } from './storage/templates';
import { plainText } from './editor/markdown';
import { exportHistory } from './ui/exportHistory';
import { TemplateMenu } from './ui/TemplateMenu';
import { WritingFooter } from './ui/WritingFooter';
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
import { type UndoLog, type UndoRecorder, readUndoLog, writeUndoLog } from './editor/undoLog';
import { undoDepth } from '@tiptap/pm/history';
import { appendScene, mergeNotes, partitionNotes, splitAtBreak } from './editor/scenes';
import { BookLibrary } from './ui/BookLibrary';
import { SceneBreakActions } from './ui/SceneBreakActions';
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
/** The undo log is bigger than the scene, so it is written at most this often while typing. */
const UNDO_SAVE_INTERVAL_MS = 10_000;

/** Notes to self live in the scene's front matter, keyed by the id of their anchor in the text. */
function readNotes(doc: CookbookDocument | null): Notes {
  const raw = doc?.fields.notes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([id, text]) => [id, typeof text === 'string' ? text : String(text ?? '')]));
}

async function startBook(fs: StorageAdapter, title: string, template: BookTemplateId = 'novel'): Promise<BookInfo> {
  const info = await createBook(fs, title);
  await applyBookTemplate(fs, template);
  return info;
}

/** Words in a scene, not counting markup. */
function sceneWords(doc: CookbookDocument): number {
  return countWords(plainText(doc.body));
}

function sceneGoal(doc: CookbookDocument | null): number | null {
  const goal = doc?.fields.goal;
  return typeof goal === 'number' && goal > 0 ? goal : null;
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
  const openAt = async (target: BookLocation, mode: { create?: string; template?: BookTemplateId; adopt?: boolean } = {}) => {
    await flushSave();
    await saveUndoNow();
    await saveIndexNow();
    const { fs: nextFs, where: nextWhere } = await openLocation(target);
    let info: BookInfo;
    if (mode.create) info = await startBook(nextFs, mode.create, mode.template);
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
    setHistory(await loadHistory(nextFs));
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

  const createNewBook = (title: string, template: BookTemplateId, inFolder: boolean) =>
    fromLibrary(async () => {
      let target: BookLocation;
      if (inFolder) {
        const parent = await pickFolder(`Choose where to keep “${title}”`);
        if (!parent) return 'cancelled';
        target = await childLocation(parent, fileNameFor(title));
      } else target = await newBookLocation(fileNameFor(title));
      await openAt(target, { create: title, template });
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

  const [undoLog, setUndoLog] = useState<UndoLog | null>(null);
  const [history, setHistoryState] = useState<WritingHistory>(() => new Map());
  const historyRef = useRef<WritingHistory>(history);
  const setHistory = (h: WritingHistory) => {
    historyRef.current = h;
    setHistoryState(h);
  };
  /** Words in the open scene when it was last saved, to count what was written since. */
  const savedWords = useRef<number | null>(null);
  /** Set while splitting or merging, which moves words without writing any. */
  const movingWords = useRef(false);
  const recorder = useRef<{ recorder: UndoRecorder; fs: StorageAdapter; id: string; saved: number; at: number } | null>(null);

  const onRecorder = useCallback(
    (r: UndoRecorder | null) => {
      const scene = docRef.current;
      recorder.current = r && fs && scene ? { recorder: r, fs, id: scene.id, saved: r.version, at: Date.now() } : null;
    },
    [fs],
  );

  const saveUndoNow = useCallback(async () => {
    const r = recorder.current;
    if (!r || r.recorder.version === r.saved) return;
    const version = r.recorder.version;
    await writeUndoLog(r.fs, r.id, r.recorder.toJSON()).catch(() => {});
    r.saved = version;
    r.at = Date.now();
  }, []);

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const save = pendingSave.current;
    pendingSave.current = null;
    if (save) await save().catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    // Save straight away when the window is hidden or closed, rather than losing the last few words.
    const onHide = () => {
      void flushSave().then(saveUndoNow);
      void saveIndexNow();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushSave, saveIndexNow, saveUndoNow]);

  const scheduleSave = (next: CookbookDocument) => {
    if (!fs || !path) return;
    const target = path;
    docRef.current = next;
    const current = index.current;
    pendingSave.current = async () => {
      await writeDocument(fs, target, next);
      // Count words written, unless the change only moved words between scenes.
      const words = sceneWords(next);
      if (!movingWords.current && savedWords.current !== null) {
        const updated = recordWords(historyRef.current, words - savedWords.current);
        if (updated !== historyRef.current) {
          historyRef.current = updated;
          setHistoryState(updated);
          await saveHistory(fs, updated).catch((e: unknown) => setError(String(e)));
        }
      }
      savedWords.current = words;
      if (current && current === index.current) {
        current.index.upsert(toIndexed(target, next, await fs.stamp(target)));
        indexChanged();
      }
      if (recorder.current && Date.now() - recorder.current.at > UNDO_SAVE_INTERVAL_MS) await saveUndoNow();
    };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS);
  };

  const select = async (p: string) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    if (p.startsWith(PANTRY + '/')) setTab('pantry');
    else if (p.startsWith(BOOKSHELF + '/')) setTab('book');
    const opened = await readDocument(fs, p);
    docRef.current = opened;
    savedWords.current = sceneWords(opened);
    setUndoLog(await readUndoLog(fs, opened.id));
    setPath(p);
    setDoc(opened);
  };

  const addScene = (template?: DocTemplate) => {
    const chosen = template ?? (tab === 'book' ? SCENE_TEMPLATES[0]! : CARD_TEMPLATES[0]!);
    // New scenes go in the folder of the scene being written, so they land in the same chapter.
    const folder = path && path.startsWith(BOOKSHELF + '/') ? parentOf(path) : BOOKSHELF;
    return addFrom(chosen, folder);
  };

  const addFrom = async (template: DocTemplate, folder: string) => {
    if (!fs) return;
    const p = await createFromTemplate(fs, folder, template);
    const current = index.current;
    if (current) current.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
    indexChanged();
    await refreshTree();
    await select(p);
  };

  const next = path ? fileAfter(tree, path) : null;

  /** Turns everything after a scene break into a new scene that comes right after this one. */
  const splitScene = async (pos: number) => {
    const scene = docRef.current;
    if (!fs || !path || !editor || !scene) return;
    const moved = splitAtBreak(editor, pos);
    if (moved === null) return;
    const { stay, go } = partitionNotes(readNotes(scene), moved);
    setNotes(stay);
    movingWords.current = true;
    await flushSave().finally(() => (movingWords.current = false));
    const title = `${scene.title}, part 2`;
    const p = await createDocument(fs, parentOf(path), title, scene.kind);
    const created = await readDocument(fs, p);
    await writeDocument(fs, p, { ...created, body: moved, fields: Object.keys(go).length > 0 ? { notes: go } : {} });
    index.current?.index.upsert(toIndexed(p, { ...created, body: moved }, await fs.stamp(p)));
    indexChanged();
    await refreshTree();
  };

  /** Adds the next scene in this folder to the end of this one, and puts its file in the trash. */
  const mergeNext = async () => {
    const scene = docRef.current;
    if (!fs || !path || !editor || !scene || !next) return;
    await flushSave();
    const incoming = await readDocument(fs, next.path);
    const merged = mergeNotes(readNotes(scene), scene.body, readNotes(incoming), incoming.body);
    appendScene(editor, merged.text);
    setNotes(merged.notes);
    movingWords.current = true;
    await flushSave().finally(() => (movingWords.current = false));
    await moveToTrash(fs, next.path);
    index.current?.index.remove(next.path);
    indexChanged();
    await refreshTree();
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
  const summary = useMemo(() => summarize(history), [history]);
  const undoSteps = useEditorState({ editor, selector: ({ editor }) => (editor ? undoDepth(editor.state) : 0) }) ?? 0;
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
          <button className="ghost" onClick={() => void addScene()}>
            {tab === 'book' ? 'New scene' : 'New card'}
          </button>
        </div>
        <Tree nodes={tree} selected={path} onSelect={select} />
        <TemplateMenu
          label={tab === 'book' ? 'New scene from template' : 'New card from template'}
          templates={tab === 'book' ? SCENE_TEMPLATES : CARD_TEMPLATES}
          onPick={(t) => void addScene(t)}
        />
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
              undoLog={undoLog}
              onRecorder={onRecorder}
              nextStyle={nextStyle}
              onReady={setEditor}
              onChange={(body) => scheduleSave({ ...(docRef.current ?? doc), body })}
              onSeasonings={showInSeasonings}
            />
            <PageFootnotes editor={editor} />
            <SceneBreakActions editor={editor} nextTitle={next ? next.name.replace(/\.md$/, '') : null} onSplit={(pos) => void splitScene(pos)} onMerge={() => void mergeNext()} />
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
          onCreate={(title, template, inFolder) => void createNewBook(title, template, inFolder)}
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
        <WritingFooter
          summary={summary}
          dailyGoal={book?.dailyGoal ?? DEFAULT_DAILY_GOAL}
          sceneWords={doc ? (words ?? 0) : null}
          sceneGoal={sceneGoal(doc)}
          onDailyGoal={(goal) => {
            if (!fs || !book) return;
            const updated = { ...book, dailyGoal: goal };
            setBook(updated);
            saveBookInfo(fs, updated).catch((e: unknown) => setError(String(e)));
          }}
          onSceneGoal={(goal) => {
            const base = docRef.current ?? doc;
            if (!base) return;
            const { goal: _old, ...fields } = base.fields;
            const updated = { ...base, fields: goal ? { ...fields, goal } : fields };
            setDoc(updated);
            scheduleSave(updated);
          }}
          onExport={() => void exportHistory(book?.title ?? 'Book', history).catch((e: unknown) => setError(String(e)))}
        />
        <span>
          {doc && undoSteps > 0 ? `Undo remembers ${undoSteps.toLocaleString('en')} ${undoSteps === 1 ? 'step' : 'steps'}, even after closing · ` : ''}
          {doc ? 'US Letter · 100% · ' : ''}
          {where}
        </span>
      </footer>
    </div>
  );
}
