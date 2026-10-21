import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type StorageAdapter, joinPath, parentOf } from './storage/adapter';
import {
  BOOKSHELF,
  PANTRY,
  PANTRY_SECTIONS,
  childrenOf,
  type BookInfo,
  type TreeNode,
  createBook,
  DEFAULT_DAILY_GOAL,
  createDocument,
  createFolder,
  fileAfter,
  fileNameFor,
  moveItem,
  moveToTrash,
  openBook,
  placeNew,
  readDocument,
  readTree,
  renameFolder,
  walkFiles,
  saveBookInfo,
  writeDocument,
} from './storage/book';
import { type CookbookDocument, type SceneStatus, akaOf, statusOf, synopsisOf, withField } from './storage/document';
import { type Order, loadOrder } from './storage/order';
import { type WritingHistory, loadHistory, recordWords, saveHistory, summarize } from './storage/history';
import { type BookTemplateId, type DocTemplate, CARD_TEMPLATES, SCENE_TEMPLATES, applyBookTemplate, createFromTemplate } from './storage/templates';
import { plainText } from './editor/markdown';
import { exportHistory } from './ui/exportHistory';
import { TemplateMenu } from './ui/TemplateMenu';
import { WritingFooter } from './ui/WritingFooter';
import { type BookIndex, type SceneMention, type SearchHit, countWords, loadIndex, refreshIndex, saveIndex, toIndexed } from './storage/index';
import { type NamedCard, castOf, countNames, nameMatcher, nameMatcherOf, setNameMatcher } from './editor/names';
import { NamePeek } from './ui/NamePeek';
import { PantryShelf, type ShelfCard } from './ui/PantryShelf';
import { PinnedCards } from './ui/PinnedCards';
import { Manuscript } from './ui/Manuscript';
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
import { useProofreader } from './proofread/useProofreader';
import { IssueCard } from './ui/IssueCard';
import { type Notes, Seasonings, type SeasoningsTab, useSeasoningsCount } from './ui/Seasonings';
import { Logo } from './ui/Logo';
import { Toolbar } from './ui/Toolbar';
import { Tree } from './ui/Tree';
import { CardDetails } from './ui/CardDetails';
import { type CardChoice, PantryCard } from './ui/PantryCard';
import { type PantryView, PantryBar, PantryResults } from './ui/PantryBar';
import { shrinkPicture } from './ui/pictures';
import { SECTION_KIND, SECTION_LABEL, pictureType, savePicture, sectionOf } from './storage/pantry';

type Tab = 'book' | 'pantry';

/** The Pantry's sections are fixed: they can hold folders but not be moved or renamed. */
const PANTRY_FOLDERS = new Map(PANTRY_SECTIONS.map((s) => [joinPath(PANTRY, s), SECTION_LABEL[s]]));

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
  const order = useRef<Order>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pantryView, setPantryView] = useState<PantryView>('all');
  const [pantryQuery, setPantryQuery] = useState('');
  /** The Pantry shelf, and where the @ that opened it is. */
  const [shelf, setShelf] = useState<{ at: number | null } | null>(null);
  const [pins, setPinsState] = useState<string[]>([]);
  /** The Bookshelf being read as one manuscript, or null while writing. */
  const [manuscript, setManuscript] = useState<TreeNode[] | null>(null);

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
    order.current = await loadOrder(nextFs);
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

  const root = tab === 'book' ? BOOKSHELF : PANTRY;
  /** The folder the sidebar shows: the Bookshelf, the whole Pantry, or one Pantry section. */
  const viewRoot = tab === 'pantry' && pantryView !== 'all' ? joinPath(PANTRY, pantryView) : root;
  const refreshTree = useCallback(async () => {
    // The Pantry's sections come in their usual order unless the writer has listed them otherwise.
    if (fs) setTree(await readTree(fs, root, { [PANTRY]: [...PANTRY_SECTIONS], ...order.current }));
  }, [fs, root]);

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
    setManuscript(null);
    docRef.current = opened;
    savedWords.current = sceneWords(opened);
    setUndoLog(await readUndoLog(fs, opened.id));
    setPath(p);
    setDoc(opened);
  };

  const addScene = (template?: DocTemplate) => {
    // New scenes and cards go in the folder of the one being written, so they land in the same chapter.
    const folder = path && path.startsWith(viewRoot + '/') ? parentOf(path) : viewRoot;
    if (tab === 'book') return addFrom(template ?? SCENE_TEMPLATES[0]!, folder);
    const section = pantryView !== 'all' ? pantryView : ((path && sectionOf(path)) ?? 'characters');
    return addFrom(template ?? CARD_TEMPLATES.find((t) => t.folder === section)!, folder);
  };

  const addFrom = async (template: DocTemplate, folder: string) => {
    if (!fs) return;
    const p = await createFromTemplate(fs, folder, template);
    if (p.startsWith(root + '/')) order.current = await placeNew(fs, order.current, tree, root, p, path);
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
    if (p.startsWith(root + '/')) order.current = await placeNew(fs, order.current, tree, root, p, path);
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

  /** Keeps the open scene, the index and closed folders pointing at a file or folder that moved. */
  const followMove = (from: string, to: string) => {
    if (from === to) return;
    index.current?.index.move(from, to);
    indexChanged();
    const moved = (p: string) => p === from || p.startsWith(from + '/');
    if (path && moved(path)) setPath(to + path.slice(from.length));
    if (pins.some(moved)) setPins(pins.map((p) => (moved(p) ? to + p.slice(from.length) : p)));
  };

  const moveInTree = async (from: string, folder: string, at: number) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    try {
      const moved = await moveItem(fs, order.current, tree, root, from, folder, at);
      order.current = moved.order;
      followMove(from, moved.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await refreshTree();
  };

  /** A new folder goes beside the folder of the scene being written, and its name is ready to type. */
  const addFolder = async () => {
    if (!fs) return;
    const here = path && path.startsWith(viewRoot + '/') ? parentOf(path) : viewRoot;
    // In the Pantry, folders go inside the section; the sections themselves stay as they are.
    const parent = tab === 'pantry' ? (here === PANTRY ? joinPath(PANTRY, 'characters') : here) : here === root ? root : parentOf(here);
    const created = await createFolder(fs, parent);
    order.current = await placeNew(fs, order.current, tree, root, created, here === root ? path : here);
    await refreshTree();
    setRenaming(created);
  };

  const renameInTree = async (from: string, title: string | null) => {
    setRenaming(null);
    if (!fs || title === null) return;
    await flushSave();
    await saveUndoNow();
    try {
      const renamed = await renameFolder(fs, order.current, tree, root, from, title);
      order.current = renamed.order;
      followMove(from, renamed.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await refreshTree();
  };

  const setCardField = (key: string, value: unknown) => {
    const base = docRef.current ?? doc;
    if (!base) return;
    const updated = withField(base, key, value);
    setDoc(updated);
    scheduleSave(updated);
  };

  const readManuscript = async () => {
    if (!fs) return;
    await flushSave();
    setManuscript(await readTree(fs, BOOKSHELF, order.current));
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
  // Cards are read from the index, so they follow it like search does.
  const cards = useMemo(() => index.current?.index.cards() ?? new Map(), [indexVersion]);
  const pantryHits = useMemo(() => {
    if (tab !== 'pantry' || !pantryQuery.trim()) return null;
    const kinds = pantryView === 'all' ? PANTRY_SECTIONS.map((s) => SECTION_KIND[s]) : [SECTION_KIND[pantryView]];
    return index.current?.index.search(pantryQuery, { kinds, limit: 40 }) ?? [];
  }, [tab, pantryQuery, pantryView, indexVersion]);
  const cardChoices = useMemo<CardChoice[]>(
    () =>
      [...cards]
        .filter(([, c]) => c.kind === 'character' || c.kind === 'setting')
        .map(([p, c]) => ({ id: c.id, title: c.title, path: p }))
        .filter((c) => c.id !== doc?.id)
        .sort((a, b) => a.title.localeCompare(b.title, 'en')),
    [cards, doc?.id],
  );
  const incoming = useMemo(() => (doc && doc.kind !== 'scene' ? (index.current?.index.incoming(doc.id) ?? []) : []), [doc?.id, doc?.kind, indexVersion]);
  const loadPicture = useCallback(
    async (p: string) => {
      if (!fs) throw new Error('No book is open.');
      return URL.createObjectURL(new Blob([(await fs.readBytes(p)).slice()], { type: pictureType(p) }));
    },
    [fs],
  );
  const pickPortrait = async (file: File) => {
    const base = docRef.current ?? doc;
    if (!fs || !base) return;
    try {
      const { data, type } = await shrinkPicture(file);
      setCardField('portrait', await savePicture(fs, base.title, data, type));
    } catch (e) {
      setError(`Couldn’t add that picture: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // Linked names follow the index, but only change when a name does, not on every save.
  const namedKey = JSON.stringify(
    [...cards]
      .filter(([, c]) => c.kind === 'character' || c.kind === 'setting')
      .map(([p, c]) => ({ id: c.id, path: p, title: c.title, kind: c.kind, aka: c.aka }) as NamedCard),
  );
  const namedCards = useMemo(() => JSON.parse(namedKey) as NamedCard[], [namedKey]);
  const matcher = useMemo(() => nameMatcher(namedCards), [namedCards]);
  useEffect(() => {
    if (editor) setNameMatcher(editor, matcher);
  }, [editor, matcher]);
  const storyNames = useMemo(() => namedCards.flatMap((c) => [c.title, ...c.aka]), [namedCards]);
  const onDialect = useCallback(
    (dialect: 'en-US' | 'en-GB') => {
      if (!fs || !book) return;
      const updated = { ...book, dialect };
      setBook(updated);
      saveBookInfo(fs, updated).catch((e: unknown) => setError(String(e)));
    },
    [fs, book],
  );
  const onOff = useCallback(
    (proofreadOff: string[]) => {
      if (!fs || !book) return;
      const updated = { ...book, proofreadOff };
      setBook(updated);
      saveBookInfo(fs, updated).catch((e: unknown) => setError(String(e)));
    },
    [fs, book],
  );
  const proof = useProofreader({ fs, dialect: book?.dialect, onDialect, off: book?.proofreadOff, onOff, editor, docId: doc?.id ?? null, names: storyNames, review: seasoningsOpen && !!doc, onError: setError });
  const castIds = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? castOf(editor.state.doc, nameMatcherOf(editor.state)).map((c) => c.id).join('\n') : ''),
  });
  const cast = useMemo(() => {
    const byId = new Map(namedCards.map((c) => [c.id, c]));
    return (castIds ?? '').split('\n').flatMap((id) => byId.get(id) ?? []);
  }, [castIds, namedCards]);

  const [appearsIn, setAppearsIn] = useState<SceneMention[] | null>(null);
  useEffect(() => {
    const current = index.current;
    if (!fs || !current || !doc || (doc.kind !== 'character' && doc.kind !== 'setting')) return setAppearsIn(null);
    const { id } = doc;
    const mentions = current.index.scenesNaming([doc.title, ...akaOf(doc.fields)], (text) => countNames(text, matcher).get(id) ?? 0);
    let live = true;
    // In the order the scenes come on the Bookshelf.
    readTree(fs, BOOKSHELF, order.current).then((shelf) => {
      const at = new Map([...walkFiles(shelf)].map((f, i) => [f.path, i]));
      if (live) setAppearsIn(mentions.sort((a, b) => (at.get(a.path) ?? Infinity) - (at.get(b.path) ?? Infinity)));
    }, () => live && setAppearsIn(mentions));
    return () => {
      live = false;
    };
  }, [fs, doc?.id, doc?.kind, indexVersion, matcher]); // the card's own edits show once saved
  const loadCard = useCallback((p: string) => (fs ? readDocument(fs, p) : Promise.reject(new Error('No book is open.'))), [fs]);

  // Pinned cards are remembered per book on this device.
  const pinsKey = `cookbook.pins:${JSON.stringify(location)}`;
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(pinsKey) ?? '[]');
      setPinsState(Array.isArray(saved) ? saved.filter((p): p is string => typeof p === 'string') : []);
    } catch {
      setPinsState([]);
    }
  }, [pinsKey]);
  const setPins = (next: string[]) => {
    setPinsState(next);
    try {
      localStorage.setItem(pinsKey, JSON.stringify(next));
    } catch {
      // Pins just won't be there next time.
    }
  };
  const pin = (p: string) => {
    setShelf(null);
    if (!pins.includes(p)) setPins([p, ...pins]);
  };

  const shelfCards = useMemo<ShelfCard[]>(
    () =>
      [...cards]
        .filter(([, c]) => c.kind !== 'scene')
        .map(([p, c]) => ({ id: c.id, path: p, title: c.title, kind: c.kind as ShelfCard['kind'], aka: c.aka })),
    [cards],
  );
  const searchPantry = useCallback(
    (query: string): SearchHit[] => index.current?.index.search(query, { kinds: ['character', 'setting', 'research'], limit: 20 }) ?? [],
    // indexVersion changes whenever the index does, like searchBook below.
    [indexVersion],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setShelf({ at: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // Typing @ opens the shelf to pick a name; the @ stays if the writer closes it.
    if (!editor) return;
    const dom = editor.view.dom;
    const onInput = (e: Event) => {
      if ((e as InputEvent).data !== '@') return;
      window.setTimeout(() => {
        const at = editor.state.selection.from - 1;
        if (at >= 0 && editor.state.doc.textBetween(at, at + 1) === '@') setShelf({ at });
      }, 0);
    };
    dom.addEventListener('input', onInput);
    return () => dom.removeEventListener('input', onInput);
  }, [editor]);
  const insertName = (name: string) => {
    const at = shelf?.at ?? null;
    setShelf(null);
    if (!editor) return;
    const chain = editor.chain().focus();
    if (at !== null && editor.state.doc.textBetween(at, at + 1) === '@') chain.insertContentAt({ from: at, to: at + 1 }, { type: 'text', text: name }).run();
    else chain.insertContent({ type: 'text', text: name }).run();
  };
  const closeShelf = () => {
    const wasTyping = shelf?.at !== null;
    setShelf(null);
    if (wasTyping) editor?.commands.focus();
  };
  const drawerOpen = (seasoningsOpen && !!doc) || pins.length > 0;

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
    <div className={`app${drawerOpen ? ' with-seasonings' : ''}${seasoningsOpen && doc ? ' seasonings-open' : ''}`}>
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
          <span>{tab === 'book' ? 'Bookshelf' : pantryView === 'all' ? 'Pantry' : SECTION_LABEL[pantryView]}</span>
          <span className="section-actions">
            <button className="ghost" onClick={() => void addFolder()}>
              New folder
            </button>
            <button className="ghost" onClick={() => void addScene()}>
              {tab === 'book' ? 'New scene' : 'New card'}
            </button>
          </span>
        </div>
        {tab === 'pantry' && <PantryBar view={pantryView} onView={setPantryView} query={pantryQuery} onQuery={setPantryQuery} />}
        {pantryHits ? (
          <PantryResults hits={pantryHits} selected={path} onOpen={select} />
        ) : (
        <Tree
          nodes={viewRoot === root ? tree : childrenOf(tree, root, viewRoot)}
          root={viewRoot}
          locked={tab === 'pantry' ? PANTRY_FOLDERS : undefined}
          selected={path}
          cards={cards}
          live={doc && path ? { path, words: words ?? 0 } : null}
          collapseKey={`cookbook.closedFolders:${JSON.stringify(location)}:${root}`}
          renaming={renaming}
          onSelect={select}
          onMove={(from, folder, at) => void moveInTree(from, folder, at)}
          onStartRename={setRenaming}
          onRename={(p, title) => void renameInTree(p, title)}
        />
        )}
        {tab === 'book' && (
          <button className="ms-open" aria-pressed={manuscript !== null} onClick={() => (manuscript ? setManuscript(null) : void readManuscript())}>
            {manuscript ? 'Back to writing' : 'Read the whole manuscript'}
          </button>
        )}
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
        {manuscript && fs ? (
          <Manuscript fs={fs} tree={manuscript} onOpen={(p) => void select(p)} onClose={() => setManuscript(null)} />
        ) : (
          <>
          {doc && path && doc.kind === 'scene' && (
            <CardDetails
              status={statusOf(doc.fields)}
              synopsis={synopsisOf(doc.fields)}
              onStatus={(s: SceneStatus) => setCardField('status', s === 'not-started' ? undefined : s)}
              onSynopsis={(text) => setCardField('synopsis', text)}
              cast={cast}
            />
          )}
          {doc && path && doc.kind !== 'scene' && (
            <PantryCard
              doc={doc}
              choices={cardChoices}
              incoming={incoming}
              appearsIn={appearsIn}
              loadPicture={loadPicture}
              onChange={(next) => {
                setDoc(next);
                scheduleSave(next);
              }}
              onPickPortrait={(file) => void pickPortrait(file)}
              onOpen={(p) => void select(p)}
            />
          )}
          {doc && path ? (
            <article className="cb-page" key={path}>
              <input
                className="scene-title"
                aria-label={doc.kind === 'scene' ? 'Scene title' : 'Card name'}
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
          </>
        )}
      </main>

      {drawerOpen && (
        <div className="drawer">
          {pins.length > 0 && (
            <PinnedCards
              paths={pins}
              version={indexVersion}
              loadCard={loadCard}
              loadPicture={loadPicture}
              onUnpin={(p) => setPins(pins.filter((x) => x !== p))}
              onOpen={(p) => void select(p)}
            />
          )}
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
              proof={proof}
            />
          )}
        </div>
      )}

      <IssueCard editor={editor} proof={proof} />

      {shelf && (
        <PantryShelf
          cards={shelfCards}
          castIds={cast.map((c) => c.id)}
          search={searchPantry}
          inserting={shelf.at !== null}
          canInsert={!!editor}
          loadCard={loadCard}
          loadPicture={loadPicture}
          onInsert={insertName}
          onPin={pin}
          onOpen={(p) => {
            setShelf(null);
            void select(p);
          }}
          onClose={closeShelf}
        />
      )}

      <NamePeek loadCard={loadCard} loadPicture={loadPicture} onOpen={(p) => void select(p)} onPin={pin} />

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
        <button className="shelf-button" title="Pantry shelf (⌘J, or type @ while writing)" onClick={() => setShelf({ at: null })}>
          Pantry shelf <kbd>⌘J</kbd>
        </button>
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
