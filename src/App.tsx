import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type StorageAdapter, baseName, joinPath, parentOf } from './storage/adapter';
import {
  BOOKSHELF,
  PANTRY,
  NOTES_ON,
  RECIPES,
  PANTRY_SECTIONS,
  childrenOf,
  type BookInfo,
  type TreeNode,
  createBook,
  makeBookOrUndo,
  DEFAULT_DAILY_GOAL,
  createDocument,
  createFolder,
  duplicateItem,
  sortFolder,
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
import { type CookbookDocument, type SceneStatus, LABELS, STATUSES, akaOf, isCard, newId, serializeDocument, statusOf, synopsisOf, withField } from './storage/document';
import { applyRescue, dropRescue, keepRescue, takeRescue } from './storage/rescue';
import { type TrashItem, deleteFromTrash, emptyTrash, listTrash, restoreFromTrash } from './storage/trash';
import { backupZip } from './storage/backup';
import { IMPORTABLE, canImport, importFile } from './storage/importer';
import { collect } from './export/manuscript';
import { bookDocx } from './export/docx';
import { bookEpub } from './export/epub';
import { bookHtml } from './export/html';
import { bookMarkdown } from './export/markdownExport';
import { printHtml } from './export/print';
import { KINDS, saveFile } from './ui/saveFile';
import { Menu, type MenuItem } from './ui/Menu';
const TrashDialog = lazy(() => import('./ui/TrashDialog').then((m) => ({ default: m.TrashDialog })));
import { type Order, loadOrder } from './storage/order';
import { type WritingHistory, loadHistory, recordWords, saveHistory } from './storage/history';
import { type BookTemplateId, type DocTemplate, CARD_TEMPLATES, SCENE_TEMPLATES, applyBookTemplate, createFromTemplate } from './storage/templates';
import { parseMarkdown, plainText } from './editor/markdown';
import { friendlyError } from './storage/errors';
import { GoalsPopup, type Goals } from './ui/GoalsPopup';
import { Palette, type PaletteItem } from './ui/Palette';
import { InsertMenu } from './ui/InsertMenu';
import { TextSelection } from '@tiptap/pm/state';
import { type BookIndex, type SceneMention, type SearchHit, countWords, loadIndex, refreshIndex, saveIndex, toIndexed } from './storage/index';
import { type NamedCard, castOf, countNames, nameMatcher, nameMatcherOf, setNameMatcher } from './editor/names';
import { NamePeek } from './ui/NamePeek';
import { PantryShelf, type ShelfCard } from './ui/PantryShelf';
import { PinnedCards } from './ui/PinnedCards';
const Manuscript = lazy(() => import('./ui/Manuscript').then((m) => ({ default: m.Manuscript })));
import {
  type BookLocation,
  DEFAULT_BOOK,
  childLocation,
  defaultLocation,
  isTauri,
  newBookLocation,
  openBackups,
  openLocation,
  canPickFolder,
  pickFolder,
  recentBooks,
  rememberBook,
  sameLocation,
} from './storage/platform';
import {
  type ParagraphStyle,
  type StyleSheet,
  addParagraphStyle,
  defaultStyles,
  loadStyles,
  paragraphStyle,
  renameParagraphStyle,
  saveStyles,
  stylesToCss,
  updateParagraphStyle,
} from './styles/styles';
import { setPictureLoader } from './editor/formatting';
import { PageEditor } from './editor/PageEditor';
import { type SeasoningsRequest } from './editor/seasonings';
import { type UndoLog, type UndoRecorder, readUndoLog, writeUndoLog } from './editor/undoLog';
import { undoDepth } from '@tiptap/pm/history';
import { appendScene, mergeNotes, partitionNotes, splitAtBreak } from './editor/scenes';
const BookLibrary = lazy(() => import('./ui/BookLibrary').then((m) => ({ default: m.BookLibrary })));
import { SceneBreakActions } from './ui/SceneBreakActions';
import { FindBox } from './ui/FindBox';
import { PageFootnotes, editFootnote } from './ui/PageFootnotes';
import { useProofreader } from './proofread/useProofreader';
import { IssueCard } from './ui/IssueCard';
import { fixText, isSeasoning, rulesOff } from './proofread/remarks';
import { type FoundIssue, applySuggestion, aroundIssue, issueAt } from './proofread/plugin';
import { RULE_GROUPS } from './proofread/rules';
import { clip, pasteInto, selectedWords } from './editor/pageActions';
import { IS_MAC, commandFor, keys, keysFor } from './shortcuts';
import { getSettings, setSettings, useSettings } from './settings';
import { type BackupInfo, type SettingsSection } from './ui/Settings';
import { MARGINS, PAGE_SIZES, ZOOMS, pageOf, zoomLabel, zoomStep } from './storage/page';
import { BACKUP_EVERY_MS, type Backup, listBackups, makeBackup, markClosed, markOpen, restoreBackup } from './storage/autoBackup';
import { historyCsv } from './storage/goals';
import { focusKey } from './editor/focusMode';
import { type Snapshot, listSnapshots, takeSnapshot as storeSnapshot, deleteSnapshot } from './storage/snapshots';
import { SnapshotsDialog } from './ui/SnapshotsDialog';
const Beside = lazy(() => import('./ui/Beside').then((m) => ({ default: m.Beside })));
import { checkForUpdates } from './ui/UpdateBanner';
import { deleteFootnote, footnotes, insertFootnote, removeNoteAnchor } from './editor/seasonings';
import { dialogueRanges } from './editor/dialogue';
import { type BasicStyle, clearFormatting, isFormatted, toggleCharStyle, toggleFormat } from './editor/extensions';
import { UpdateBanner } from './ui/UpdateBanner';
import { Seasonings, type Tracked } from './ui/Seasonings';
import { Logo } from './ui/Logo';
import { Toolbar } from './ui/Toolbar';
import { ZoomControl } from './ui/ZoomControl';
import { StatusControl, StatusIcon } from './ui/StatusIcon';
import { type Recipe, Tree } from './ui/Tree';
import { ShelfResizer, useShelfWidth } from './ui/ShelfResizer';
import { CardDetails } from './ui/CardDetails';
import { type CardChoice, PantryCard } from './ui/PantryCard';
import { PantryPanel } from './ui/PantryPanel';
import { shrinkPicture } from './ui/pictures';
import { type PantrySection, SECTION_KIND, SECTION_LABEL, pictureType, savePicture, sectionOf } from './storage/pantry';

type Notes = Record<string, string>;
/** The panel open on the right of the page, if any. */
type Panel = 'pantry' | 'seasonings';

// Settings opens rarely, so it loads when first needed and keeps the first load light.
const Settings = lazy(() => import('./ui/Settings').then((m) => ({ default: m.Settings })));
/** The interface size's zoom, which the page takes back out so it keeps the book's own zoom. */
/** The right-hand panel's column; matches .app.drawer-open in styles.css. */
const DRAWER_WIDTH = 320;
const UI_ZOOM = { small: 0.9, medium: 1, large: 1.12 } as const;
/** The character styles that ⌘B, ⌘I and ⌘U apply. */
const BASIC_KEYS: Record<string, { key: string; style: BasicStyle }> = {
  strong: { key: 'Mod-B', style: 'strong' },
  emphasis: { key: 'Mod-I', style: 'emphasis' },
  underline: { key: 'Mod-U', style: 'underline' },
};

/** The top folder a path is in: the Shelf (bookshelf), the Pantry or the recipes. */
const topOf = (p: string) => p.split('/')[0]!;
const ORDERED = (order: Order) => ({ [PANTRY]: [...PANTRY_SECTIONS], ...order });

/** The Pantry's sections are fixed: they can hold folders but not be moved or renamed. */
const PANTRY_FOLDERS = new Map(PANTRY_SECTIONS.map((s) => [joinPath(PANTRY, s), SECTION_LABEL[s]]));

/** The search index is cheap to rebuild, so it is written back less often than scenes. */
const INDEX_SAVE_DELAY_MS = 5000;
const NOT_A_BOOK = 'This folder is not a Cookbook recipe.';
/** The undo log is bigger than the scene, so it is written at most this often while typing. */
const UNDO_SAVE_INTERVAL_MS = 10_000;
const SAVE_RETRY_MS = 5_000;

/** Notes to self live in the scene's front matter, keyed by the id of their anchor in the text. */
function readNotes(doc: CookbookDocument | null): Notes {
  const raw = doc?.fields.notes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([id, text]) => [id, typeof text === 'string' ? text : String(text ?? '')]));
}

async function startBook(fs: StorageAdapter, title: string, template: BookTemplateId = 'novel'): Promise<BookInfo> {
  return makeBookOrUndo(fs, async () => {
    const info = await createBook(fs, title);
    await applyBookTemplate(fs, template);
    return info;
  });
}

/** Words in a scene, not counting markup. */
function sceneWords(doc: CookbookDocument): number {
  return countWords(plainText(doc.body));
}

function sceneGoal(doc: CookbookDocument | null): number | null {
  const goal = doc?.fields.goal;
  return typeof goal === 'number' && goal > 0 ? goal : null;
}

function* walkFolders(nodes: TreeNode[]): Generator<TreeNode> {
  for (const n of nodes) {
    if (n.kind !== 'folder') continue;
    yield n;
    yield* walkFolders(n.children ?? []);
  }
}

/** Whose backups these are. Every book has an id once it has been opened (see openAt). */
const ownerOf = (info: BookInfo) => ({ title: info.title, id: info.id ?? info.title });

function lastSceneKey(location: BookLocation | null): string {
  return `cookbook.lastScene:${JSON.stringify(location)}`;
}

function folderName(location: BookLocation): string {
  if (location.kind === 'folder') return location.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || DEFAULT_BOOK;
  return location.name;
}

export function App() {
  const [fs, setFs] = useState<StorageAdapter | null>(null);
  const [where, setWhere] = useState('');
  /** Words typed since the last save, for the dot in the footer. */
  const [dirty, setDirty] = useState(false);
  /** The last save of the page failed; it is tried again until it works. */
  const [saveFailed, setSaveFailed] = useState(false);
  const [book, setBook] = useState<BookInfo | null>(null);
  const [sheet, setSheet] = useState<StyleSheet>(defaultStyles);
  /** The Shelf's pages and books, the Pantry's groups, and the recipes, each as read from its folder. */
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [pantryTree, setPantryTree] = useState<TreeNode[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe[]>>(new Map());
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<CookbookDocument | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const seasoningsOpen = panel === 'seasonings';
  const togglePanel = (p: Panel) => setPanel((open) => (open === p ? null : p));
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
  const [pantryGroup, setPantryGroup] = useState<PantrySection>('characters');
  const [pantryQuery, setPantryQuery] = useState('');
  /** The Pantry shelf, and where the @ that opened it is. */
  const [shelf, setShelf] = useState<{ at: number | null } | null>(null);
  /** Where the / is that opened the insert menu. */
  const [slash, setSlash] = useState<number | null>(null);
  const [pins, setPinsState] = useState<string[]>([]);
  /** The Shelf being read as one manuscript (Read book), or null while writing. */
  const [manuscript, setManuscript] = useState<TreeNode[] | null>(null);
  const [manuscriptTitle, setManuscriptTitle] = useState('');
  /** Words for Search, from "Search everywhere" on a right-click. */
  const [findRequest, setFindRequest] = useState<{ query: string; at: number } | null>(null);
  /** Opens or closes every folder (or every one inside `under`), from a right-click. */
  const [folding, setFolding] = useState<{ open: boolean; under?: string; at: number } | null>(null);
  const portraitInput = useRef<HTMLInputElement>(null);
  const portraitFor = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number; label: string } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** The trash dialog's list: undefined while closed, null while it loads. */
  const [trashItems, setTrashItems] = useState<TrashItem[] | null | undefined>(undefined);
  /** A short message at the bottom of the window, sometimes with an Undo. */
  const [notice, setNotice] = useState<{ text: string; undo?: () => void; at: number } | null>(null);
  const say = (text: string, undo?: () => void) => setNotice({ text, undo, at: Date.now() });
  const importInput = useRef<HTMLInputElement>(null);
  /** The folder the next "Import files…" goes into, or null for the usual place. */
  const importInto = useRef<string | null>(null);
  /** The sidebar folder files are being dragged over, for the drop highlight. */
  const [fileDrop, setFileDrop] = useState<string | null>(null);
  const settings = useSettings();
  /** On a phone, the sidebar slides out over the page. */
  const [sideOpen, setSideOpen] = useState(false);
  const [shelfWidth, setShelfWidth] = useShelfWidth();
  const shelfRef = useRef<HTMLElement>(null);
  /** The Settings screen's section while it is open, or null while writing. */
  const [settingsAt, setSettingsAt] = useState<SettingsSection | null>(null);
  const lastSection = useRef<SettingsSection>('general');
  const openSettings = (section: SettingsSection = lastSection.current) => setSettingsAt(section);
  const [goalsRequest, setGoalsRequest] = useState<{ tab: 'targets' | 'history'; at: number } | null>(null);
  const [backups, setBackups] = useState<BackupInfo>({ folder: '', canChoose: canPickFolder(), last: null, count: 0 });
  // Read by handlers that outlive a render: closing the window, keys, backups.
  const fsRef = useRef(fs);
  fsRef.current = fs;
  const bookRef = useRef(book);
  bookRef.current = book;
  /** Words pasted since the last save, which don't count towards the goal unless the book says so. */
  const pastedWords = useRef(0);
  /** Something was saved since the last automatic backup. */
  const changedSinceBackup = useRef(false);
  const lastBackupAt = useRef(0);

  /** Changes the open book's settings in book.json. */
  const updateBook = (changes: Partial<BookInfo>) => {
    const current = bookRef.current;
    if (!fs || !current) return;
    const updated = { ...current, ...changes };
    bookRef.current = updated;
    setBook(updated);
    saveBookInfo(fs, updated).catch((e: unknown) => setError(friendlyError(e)));
  };

  const backupStore = useRef<{ key: string; fs: StorageAdapter; where: string } | null>(null);
  const openBackupStore = async () => {
    const chosen = getSettings().backupFolder;
    const key = JSON.stringify(chosen);
    if (backupStore.current?.key !== key) backupStore.current = { key, ...(await openBackups(chosen)) };
    return backupStore.current;
  };
  const refreshBackups = async () => {
    const info = bookRef.current;
    if (!info) return;
    try {
      const store = await openBackupStore();
      const list = await listBackups(store.fs, ownerOf(info));
      setBackups({ folder: store.where, canChoose: canPickFolder(), last: list[0]?.date ?? null, count: list.length });
    } catch (e) {
      setBackups((b) => ({ ...b, folder: `Can’t reach the backup folder. ${friendlyError(e)}` }));
    }
  };
  /** The backup being made, so a timed one and one on close don't zip the book twice at once. */
  const backingUp = useRef<Promise<void> | null>(null);
  /** Zips the open book into the backups folder; automatic ones only when something changed. */
  const autoBackup = async (always = false): Promise<void> => {
    // Waits its turn; several waiting at once each check again once the one before is done.
    while (backingUp.current) await backingUp.current.catch(() => {});
    const bookFs = fsRef.current;
    const info = bookRef.current;
    if (!bookFs || !info || (!always && !changedSinceBackup.current)) return;
    changedSinceBackup.current = false;
    lastBackupAt.current = Date.now();
    const run = (async () => {
      const store = await openBackupStore();
      await makeBackup(bookFs, store.fs, ownerOf(info), getSettings().keepBackups);
    })();
    backingUp.current = run;
    try {
      await run;
    } catch (e) {
      // Nothing was backed up, so the changes still need one.
      changedSinceBackup.current = true;
      throw e;
    } finally {
      if (backingUp.current === run) backingUp.current = null;
    }
  };

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
    if (getSettings().backupOnClose) await autoBackup().catch(() => {});
    const { fs: nextFs, where: nextWhere } = await openLocation(target);
    let info: BookInfo;
    if (mode.create) info = await startBook(nextFs, mode.create, mode.template);
    else {
      try {
        info = await openBook(nextFs);
      } catch (e) {
        if (!(e instanceof Error && e.message === NOT_A_BOOK)) throw e;
        if (mode.adopt) info = await makeBookOrUndo(nextFs, () => createBook(nextFs, folderName(target)));
        // The first work keeps the old location name, so existing ones are still found, but is titled in today's words.
        else if (sameLocation(target, await defaultLocation())) info = await startBook(nextFs, 'My Recipe');
        else throw e;
      }
    }
    // Backups are filed by the book's id, so every book gets one; older books are given theirs now.
    if (!info.id) {
      info = { ...info, id: newId() };
      await saveBookInfo(nextFs, info).catch(() => {});
    }
    // Words a closing browser tab didn't finish saving go back into their scene.
    const rescue = takeRescue(window.localStorage, target);
    if (rescue) await applyRescue(nextFs, rescue).catch(() => {});
    // The book that was open is closed properly now. If this one was never closed, Cookbook stopped
    // with it open last time, so it is backed up before anything else changes.
    const previous = locationRef.current;
    if (previous) markClosed(window.localStorage, previous);
    const crashed = markOpen(window.localStorage, target);
    index.current?.index.close();
    index.current = null;
    setEditor(null);
    docRef.current = null;
    setDoc(null);
    setPath(null);
    setBook(info);
    setSheet(await loadStyles(nextFs));
    setHistory(await loadHistory(nextFs));
    order.current = await loadOrder(nextFs);
    setFs(nextFs);
    setWhere(nextWhere);
    setLocation(target);
    rememberBook({ location: target, title: info.title });
    bookRef.current = info;
    fsRef.current = nextFs;
    if (crashed && getSettings().backupOnClose) {
      autoBackup(true).then(
        () => say('Cookbook didn’t close properly last time, so it made a backup of this recipe.'),
        () => {},
      ).finally(() => void refreshBackups());
    } else void refreshBackups();

    // The index catches up in the background; search works on whatever it has so far.
    const opened = { fs: nextFs, index: await loadIndex(nextFs) };
    index.current = opened;
    setIndexVersion((v) => v + 1);
    refreshIndex(nextFs, opened.index)
      .then((touched) => {
        if (touched > 0 && index.current === opened) indexChanged();
      })
      .catch((e: unknown) => setError(`Search may miss some files. ${friendlyError(e)}`));
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
      setLibraryError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = () =>
    fromLibrary(async () => {
      const picked = await pickFolder('Open a recipe’s folder');
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
      } else target = await newBookLocation(fileNameFor(title), getSettings().newBooksFolder);
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
          setLibraryError(friendlyError(e));
          setLibraryOpen(true);
        }
      }
      await openAt(await defaultLocation());
    })().catch((e: unknown) => setError(friendlyError(e)));
  }, []);

  const refreshTree = useCallback(async () => {
    if (!fs) return;
    // The Pantry's groups come in their usual order unless the writer has listed them otherwise.
    const ordered = ORDERED(order.current);
    setTree(await readTree(fs, BOOKSHELF, ordered));
    setPantryTree(await readTree(fs, PANTRY, ordered));
    // Recipes are listed under the page they name, so they follow it wherever it moves.
    const byPage = new Map<string, Recipe[]>();
    if (NOTES_ON && (await fs.exists(RECIPES))) {
      const shelf = new Map<string, string>();
      for (const [p, c] of index.current?.index.cards() ?? []) if (c.kind === 'scene') shelf.set(c.id, p);
      for (const file of walkFiles(await readTree(fs, RECIPES, ordered))) {
        const recipe = await readDocument(fs, file.path).catch(() => null);
        const page = recipe && typeof recipe.fields.page === 'string' ? shelf.get(recipe.fields.page) : undefined;
        if (!recipe || !page) continue;
        byPage.set(page, [...(byPage.get(page) ?? []), { path: file.path, title: recipe.title }]);
      }
    }
    setRecipes(byPage);
  }, [fs]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree, indexVersion > 0]);

  /** The tree a path's top folder holds. */
  const treeOf = (top: string) => (top === PANTRY ? pantryTree : tree);

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
  /** The open scene's file text as last read or written, and the newest text still waiting to be saved. */
  const savedText = useRef<string | null>(null);
  const unsaved = useRef<{ path: string; text: string; base: string } | null>(null);
  const locationRef = useRef<BookLocation | null>(null);
  locationRef.current = location;
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
    if (!save) return;
    try {
      await save();
      setSaveFailed(false);
      if (!pendingSave.current) {
        setDirty(false);
        unsaved.current = null;
        dropRescue(window.localStorage);
      }
    } catch (e) {
      setError(friendlyError(e));
      setSaveFailed(true);
      // Keep the words and try again shortly, unless a newer save is already waiting.
      pendingSave.current ??= save;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flushRef.current(), SAVE_RETRY_MS);
    }
  }, []);
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;

  useEffect(() => {
    // Save straight away when the window is hidden or closed, rather than losing the last few words.
    const onHide = (e: Event) => {
      const pending = unsaved.current;
      if (pending && locationRef.current) keepRescue(window.localStorage, { location: locationRef.current, ...pending });
      void flushSave().then(saveUndoNow);
      void saveIndexNow();
      // The browser can't wait for a zip as a tab closes, so the book is backed up whenever it's put away.
      if (!isTauri() && document.visibilityState === 'hidden' && getSettings().backupOnClose && Date.now() - lastBackupAt.current > 10 * 60_000) void autoBackup().catch(() => {});
      // Put away with its words saved, so a phone or browser ending Cookbook in the background isn't taken for a crash.
      if (locationRef.current && (document.visibilityState === 'hidden' || e.type === 'pagehide')) markClosed(window.localStorage, locationRef.current);
    };
    const onShow = () => {
      if (locationRef.current && document.visibilityState === 'visible') markOpen(window.localStorage, locationRef.current);
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [flushSave, saveIndexNow, saveUndoNow]);

  useEffect(() => {
    // The desktop app waits for the last save before the window closes.
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onCloseRequested(async () => {
          await flushSave();
          await saveUndoNow();
          await saveIndexNow();
          if (getSettings().backupOnClose) await autoBackup().catch(() => {});
          if (locationRef.current) markClosed(window.localStorage, locationRef.current);
        })
        .then((unlisten) => (gone ? unlisten() : (stop = unlisten))),
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, [flushSave, saveIndexNow, saveUndoNow]);

  useEffect(() => {
    // A backup every half hour while the writer works, so a long session is never only backed up when it ends.
    const timer = window.setInterval(() => {
      if (!getSettings().backupOnClose || !changedSinceBackup.current) return;
      void (async () => {
        await flushSave();
        await autoBackup();
        await refreshBackups();
      })().catch(() => {});
    }, BACKUP_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [flushSave]);

  useEffect(() => {
    // The app menu's Settings… (Cookbook › Settings… on a Mac, Edit › Settings… elsewhere).
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('open-settings', () => setSettingsAt((at) => at ?? lastSection.current)).then((unlisten) => (gone ? unlisten() : (stop = unlisten))),
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  const scheduleSave = (next: CookbookDocument) => {
    if (!fs || !path) return;
    const target = path;
    docRef.current = next;
    const current = index.current;
    const text = serializeDocument(next);
    unsaved.current = { path: target, text, base: savedText.current ?? text };
    setDirty(true);
    pendingSave.current = async () => {
      await writeDocument(fs, target, next);
      savedText.current = text;
      // Count words written, unless the change only moved words between scenes.
      changedSinceBackup.current = true;
      const words = sceneWords(next);
      const pasted = pastedWords.current;
      pastedWords.current = 0;
      if (!movingWords.current && savedWords.current !== null) {
        let delta = words - savedWords.current;
        // Pasting a chapter in isn't writing it, unless the book counts pasted words.
        if (delta > 0 && !bookRef.current?.countPasted) delta -= Math.min(delta, pasted);
        const updated = recordWords(historyRef.current, delta);
        if (updated !== historyRef.current) {
          historyRef.current = updated;
          setHistoryState(updated);
          await saveHistory(fs, updated).catch((e: unknown) => setError(friendlyError(e)));
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
    saveTimer.current = window.setTimeout(() => void flushSave(), getSettings().saveDelay);
  };

  const select = async (p: string) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    const section = sectionOf(p);
    if (section) setPantryGroup(section);
    const opened = await readDocument(fs, p);
    setManuscript(null);
    setSideOpen(false);
    docRef.current = opened;
    savedText.current = serializeDocument(opened);
    savedWords.current = sceneWords(opened);
    setUndoLog(await readUndoLog(fs, opened.id));
    setPath(p);
    setDoc(opened);
    try {
      localStorage.setItem(lastSceneKey(locationRef.current), p);
    } catch {
      // The book just opens without a scene next time.
    }
  };

  // The scene that was open last time comes back when the book opens.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    const key = lastSceneKey(location);
    if (!fs || !location || restored.current === key) return;
    restored.current = key;
    let last: string | null = null;
    try {
      last = localStorage.getItem(key);
    } catch {
      // Nothing to reopen.
    }
    if (last && !path) {
      const p = last;
      fs.exists(p).then((there) => (there ? select(p) : undefined), () => {});
    }
  }, [fs, location]);

  // A page opens at its top, with its status and synopsis card in view.
  useLayoutEffect(() => {
    if (!path) return;
    document.querySelector('.desk')?.scrollTo({ top: 0 });
  }, [path]);

  const addScene = (template?: DocTemplate) => {
    // New pages go in the book of the one being written, so they land in the same chapter.
    const folder = path && path.startsWith(BOOKSHELF + '/') ? parentOf(path) : BOOKSHELF;
    return addFrom(template ?? SCENE_TEMPLATES[0]!, folder);
  };

  /** A new card in the Pantry group being shown, or in the folder of the open card if it is in that group. */
  const addCard = () => {
    const group = joinPath(PANTRY, pantryGroup);
    const folder = path && path.startsWith(group + '/') ? parentOf(path) : group;
    return addFrom(CARD_TEMPLATES.find((t) => t.folder === pantryGroup)!, folder);
  };

  const addFrom = async (template: DocTemplate, folder: string) => {
    if (!fs) return;
    const p = await createFromTemplate(fs, folder, template);
    const top = topOf(p);
    if (top === BOOKSHELF || top === PANTRY) order.current = await placeNew(fs, order.current, treeOf(top), top, p, path);
    const current = index.current;
    if (current) current.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
    indexChanged();
    await refreshTree();
    await select(p);
  };

  const next = path ? fileAfter(tree, path) : null;

  /** The open scene's snapshots dialog, with its list once read. */
  const [snapshots, setSnapshots] = useState<{ path: string; title: string; list: Snapshot[] | null } | null>(null);
  /** A copy of the open scene's text as it is now, to go back to. */
  const takeSnapshot = async (reason: string) => {
    const scene = docRef.current;
    if (!fs || !scene) return;
    await flushSave();
    try {
      await storeSnapshot(fs, scene, reason);
      if (snapshots?.path === path) setSnapshots({ ...snapshots, list: await listSnapshots(fs, scene.id) });
      else if (reason === 'By hand') say(`Took a snapshot of “${scene.title}”.`);
    } catch (e) {
      setError(`Couldn’t take a snapshot. ${friendlyError(e)}`);
    }
  };
  /** Snapshots are taken before splits, merges and Replace all, unless Settings says not to. */
  const autoSnapshot = (reason: string) => (getSettings().autoSnapshot ? takeSnapshot(reason) : Promise.resolve());
  const showSnapshots = async (p: string) => {
    if (!fs) return;
    if (p !== path) await select(p);
    const scene = docRef.current;
    if (!scene) return;
    setSnapshots({ path: p, title: scene.title, list: null });
    setSnapshots({ path: p, title: scene.title, list: await listSnapshots(fs, scene.id) });
  };
  /** Puts a snapshot's text back, after keeping the text it replaces as a snapshot too. Undo still works. */
  const rollBack = async (snapshot: Snapshot) => {
    const scene = docRef.current;
    if (!fs || !scene || !editor) return;
    await storeSnapshot(fs, scene, 'Before rolling back');
    editor.chain().focus().setContent(parseMarkdown(snapshot.body), { emitUpdate: true }).run();
    setSnapshots(null);
    say(`Rolled “${scene.title}” back to ${snapshot.date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}. Undo puts it back.`);
  };

  /** The scene shown beside the one being written, if any. */
  const [beside, setBeside] = useState<string | null>(null);
  const swapBeside = async (p: string) => {
    const writing = path;
    await select(p);
    setBeside(writing && writing !== p ? writing : null);
  };

  /** Turns everything after a scene break into a new scene that comes right after this one. */
  const splitScene = async (pos: number) => {
    const scene = docRef.current;
    if (!fs || !path || !editor || !scene) return;
    await autoSnapshot('Before splitting');
    const moved = splitAtBreak(editor, pos);
    if (moved === null) return;
    const { stay, go } = partitionNotes(readNotes(scene), moved);
    setNotes(stay);
    movingWords.current = true;
    await flushSave().finally(() => (movingWords.current = false));
    const title = `${scene.title}, part 2`;
    const p = await createDocument(fs, parentOf(path), title, scene.kind);
    const top = topOf(p);
    order.current = await placeNew(fs, order.current, treeOf(top), top, p, path);
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
    await autoSnapshot('Before merging');
    const incoming = await readDocument(fs, next.path);
    const merged = mergeNotes(readNotes(scene), scene.body, readNotes(incoming), incoming.body);
    appendScene(editor, merged.text);
    setNotes(merged.notes);
    movingWords.current = true;
    await flushSave().finally(() => (movingWords.current = false));
    order.current = (await moveToTrash(fs, next.path, new Date(), order.current, await namesIn(parentOf(next.path)))).order;
    index.current?.index.remove(next.path);
    indexChanged();
    await refreshTree();
  };

  /** What a folder shows now, in order, wherever it is in the book. */
  const namesIn = async (folder: string): Promise<string[]> => {
    if (!fs) return [];
    const top = folder.split('/')[0]!;
    if (!(await fs.exists(folder))) return [];
    return childrenOf(await readTree(fs, top, ORDERED(order.current)), top, folder).map((n) => n.name);
  };

  /** The index catches up with files that came or went outside the editor. */
  const reindex = async () => {
    const current = index.current;
    if (!fs || !current || current.fs !== fs) return;
    if ((await refreshIndex(fs, current.index)) > 0) indexChanged();
  };

  const closeScene = () => {
    setEditor(null);
    docRef.current = null;
    setDoc(null);
    setPath(null);
  };

  /** Moves a scene, card or folder to the trash, with an Undo. */
  const trashPath = async (p: string) => {
    if (!fs || PANTRY_FOLDERS.has(p)) return;
    await flushSave();
    await saveUndoNow();
    const label = cards.get(p)?.title ?? baseName(p).replace(/\.md$/, '');
    try {
      const gone = await moveToTrash(fs, p, new Date(), order.current, await namesIn(parentOf(p)));
      order.current = gone.order;
      const under = (q: string) => q === p || q.startsWith(p + '/');
      if (path && under(path)) closeScene();
      if (pins.some(under)) setPins(pins.filter((q) => !under(q)));
      await reindex();
      await refreshTree();
      say(`Moved “${label}” to the trash.`, () => void putBack(gone.name));
    } catch (e) {
      setError(`Couldn’t move “${label}” to the trash. ${friendlyError(e)}`);
    }
  };

  /** Puts something from the trash back where it was. */
  const putBack = async (name: string): Promise<string | null> => {
    if (!fs) return null;
    try {
      const back = await restoreFromTrash(fs, name, order.current, namesIn);
      order.current = back.order;
      await reindex();
      await refreshTree();
      setNotice(null);
      return back.path;
    } catch (e) {
      setError(`Couldn’t put that back. ${friendlyError(e)}`);
      return null;
    }
  };

  const openTrash = () => {
    if (!fs) return;
    setTrashItems(null);
    listTrash(fs).then(setTrashItems, (e: unknown) => {
      setTrashItems(undefined);
      setError(friendlyError(e));
    });
  };

  const inTrash = async (action: () => Promise<unknown>) => {
    if (!fs) return;
    setBusy(true);
    try {
      await action();
      setTrashItems(await listTrash(fs));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** The whole Bookshelf as a Word file, an e-book, Markdown, or printed (where Save as PDF lives). */
  const exportBook = async (kind: 'docx' | 'epub' | 'md' | 'print', part?: { title: string; nodes: TreeNode[] }) => {
    if (!fs || !book) return;
    await flushSave();
    try {
      const m = await collect(fs, part?.title ?? book.title, part?.nodes ?? (await readTree(fs, BOOKSHELF, order.current)));
      if (kind === 'print') return await printHtml(bookHtml(m, sheet, pageOf(book.page)));
      let id = book.id;
      if (kind === 'epub' && !id) {
        id = globalThis.crypto.randomUUID();
        const updated = { ...book, id };
        setBook(updated);
        await saveBookInfo(fs, updated);
      }
      const data = kind === 'docx' ? bookDocx(m, sheet, pageOf(book.page)) : kind === 'epub' ? bookEpub(m, sheet, id!) : bookMarkdown(m);
      const title = part?.title ?? book.title;
      if (await saveFile(fileNameFor(title), data, KINDS[kind])) say(`Exported “${title}” as ${kind === 'docx' ? 'a Word document' : kind === 'epub' ? 'an EPUB e-book' : 'Markdown'}.`);
    } catch (e) {
      setError(`Couldn’t export “${part?.title ?? book.title}”. ${friendlyError(e)}`);
    }
  };

  /** Every file in the book, zipped, to keep somewhere else. */
  const backUp = async () => {
    if (!fs || !book) return;
    await flushSave();
    await saveUndoNow();
    try {
      const name = fileNameFor(book.title);
      const day = new Date().toLocaleDateString('en-CA');
      if (await saveFile(`${name} backup ${day}`, await backupZip(fs, name), KINDS.zip)) say(`Backed up “${book.title}”.`);
    } catch (e) {
      setError(`Couldn’t back up the recipe. ${friendlyError(e)}`);
    }
  };

  /**
   * Brings Word, Markdown and text files in as new scenes (or Pantry cards),
   * after the open one or at the end of `into`.
   */
  const importFiles = async (files: File[], into: string | null) => {
    if (!fs || files.length === 0) return;
    await flushSave();
    await saveUndoNow();
    const folder = into ?? (path?.startsWith(BOOKSHELF + '/') ? parentOf(path) : BOOKSHELF);
    const top = folder.split('/')[0]!;
    const section = sectionOf(folder + '/x');
    const kind = top === PANTRY && section ? SECTION_KIND[section] : 'scene';
    const problems: string[] = files.filter((f) => !canImport(f.name)).map((f) => `${f.name} isn’t a Word, Markdown or text file`);
    let after = path && parentOf(path) === folder ? path : null;
    let first: string | null = null;
    let count = 0;
    for (const file of files.filter((f) => canImport(f.name))) {
      try {
        const imported = importFile(file.name, new Uint8Array(await file.arrayBuffer()));
        const p = await createDocument(fs, folder, imported.title, kind);
        await writeDocument(fs, p, { ...(await readDocument(fs, p)), body: imported.body });
        const shelf = await readTree(fs, top, ORDERED(order.current));
        order.current = await placeNew(fs, order.current, shelf, top, p, after);
        after = p;
        first ??= p;
        count++;
      } catch (e) {
        problems.push(`${file.name}: ${friendlyError(e)}`);
      }
    }
    await reindex();
    await refreshTree();
    if (problems.length > 0) setError(`Some files weren’t imported. ${problems.join('. ')}.`);
    if (first) {
      await select(first);
      const where = folder === top ? (top === BOOKSHELF ? 'the Shelf' : 'the Pantry') : `“${baseName(folder)}”`;
      say(`Imported ${count === 1 ? 'one file' : `${count} files`} into ${where}.`);
    }
  };

  const chooseImport = (into: string | null) => {
    importInto.current = into;
    importInput.current?.click();
  };

  /** Where files dropped on the Shelf go: the book under the pointer, or the book a page is in. */
  const dropFolder = (target: EventTarget | null): string => {
    const row = (target as Element | null)?.closest?.<HTMLElement>('[data-tree-path]');
    if (!row) return BOOKSHELF;
    const p = row.dataset.treePath!;
    return row.dataset.treeKind === 'folder' ? p : parentOf(p);
  };

  const backUpNow = async () => {
    try {
      await flushSave();
      await saveUndoNow();
      await autoBackup(true);
      await refreshBackups();
      say(`Backed up “${bookRef.current?.title ?? 'the recipe'}”.`);
    } catch (e) {
      setError(`Couldn’t back up the recipe. ${friendlyError(e)}`);
    }
  };
  /** Shows the book's backups; picking one opens a copy of the book as it was, beside this one. */
  const chooseRestore = async (x: number, y: number) => {
    const current = bookRef.current;
    if (!current) return;
    const store = await openBackupStore();
    const list = await listBackups(store.fs, ownerOf(current));
    const when = (d: Date) => d.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
    // Backups from before they were filed by recipe may be of another recipe with the same title.
    const label = (b: Backup) => (b.older ? `${when(b.date)} (older, by title)` : when(b.date));
    showMenu('Restore', x, y, [
      { heading: 'Open a copy of the recipe as it was' },
      ...list.slice(0, 25).map((b) => ({ label: label(b), onPick: () => void restoreCopy(b) })),
      ...(list.length === 0 ? [{ label: 'No backups yet', disabled: true, onPick: () => {} }] : []),
    ]);
  };
  const restoreCopy = async (b: Backup) => {
    const current = bookRef.current;
    if (!current) return;
    try {
      const store = await openBackupStore();
      const stamp = b.date.toLocaleString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/[,:]/g, (c) => (c === ':' ? '.' : ''));
      const title = `${current.title} (backup ${stamp})`;
      const target = await newBookLocation(fileNameFor(title), getSettings().newBooksFolder);
      const { fs: into } = await openLocation(target);
      if (!(await into.exists('book.json'))) {
        await restoreBackup(store.fs, b, into);
        // A new id, so the copy's backups are kept apart from the recipe's own.
        await saveBookInfo(into, { ...(await openBook(into)), title, id: newId() });
      }
      setSettingsAt(null);
      await openAt(target);
      say(`Opened a copy of “${current.title}” from ${b.date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}. The recipe itself is unchanged.`);
    } catch (e) {
      setError(`Couldn’t restore that backup. ${friendlyError(e)}`);
    }
  };
  const chooseBackupFolder = async () => {
    try {
      const picked = await pickFolder('Choose a folder for backups');
      if (!picked) return;
      setSettings({ backupFolder: picked });
      await refreshBackups();
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  const chooseNewBooksFolder = async () => {
    const picked = await pickFolder('Choose where new recipes go').catch(() => null);
    if (picked?.kind === 'folder') setSettings({ newBooksFolder: picked.path });
  };

  const bookMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      label: 'Recipe',
      x: r.left,
      y: r.bottom + 4,
      items: [
        { label: 'Your recipes…', onPick: () => setLibraryOpen(true) },
        { label: 'Configure this recipe…', onPick: () => openSettings('page') },
        { label: 'Settings…', hint: keysFor('settings'), onPick: () => openSettings() },
        { separator: true },
        { label: 'Export as Word…', hint: '.docx', onPick: () => void exportBook('docx') },
        { label: 'Export as EPUB…', hint: '.epub', onPick: () => void exportBook('epub') },
        { label: 'Export as Markdown…', hint: '.md', onPick: () => void exportBook('md') },
        { label: 'Print or save as PDF…', onPick: () => void exportBook('print') },
        { separator: true },
        { label: 'Import files…', hint: '.docx .md .txt', onPick: () => chooseImport(null) },
        { label: 'Back up as a zip…', onPick: () => void backUp() },
        { separator: true },
        { label: 'Trash', onPick: openTrash },
      ],
    });
  };

  const showMenu = (label: string, x: number, y: number, items: MenuItem[]) => setMenu({ label, x, y, items });

  /** Proofreader fixes and choices for an issue, for the underline's menu and the Seasonings card's. */
  const issueItems = async (issue: FoundIssue): Promise<MenuItem[]> => {
    const ed = editor;
    if (!ed) return [];
    const fixes = issue.issue.suggestions.length > 0 || issue.issue.rule !== 'spelling' ? issue.issue.suggestions : await proof.suggest(issue.word, aroundIssue(ed.state.doc, issue)).catch(() => []);
    const label = RULE_GROUPS.flatMap((g) => g.rules).find((r) => r.id === issue.group)?.label;
    return [
      ...(fixes.length > 0
        ? fixes.slice(0, 6).map((f) => ({ label: fixText(issue.word, f), onPick: () => applySuggestion(ed, issue, f) }))
        : [{ label: issue.issue.kind === 'spelling' ? 'No suggestions' : issue.issue.message, onPick: () => {}, disabled: true }]),
      { separator: true },
      ...(issue.issue.rule === 'spelling' ? [{ label: 'Add to dictionary', onPick: () => proof.addWord(issue.word) }] : []),
      { label: 'Remove for good', onPick: () => proof.ignore(issue, 'once') },
      ...(issue.issue.rule !== 'spelling' ? [{ label: 'Remove everywhere for good', onPick: () => proof.ignore(issue, 'always') }] : []),
      ...(label ? [{ label: `Stop checking ${label.toLowerCase()}`, onPick: () => proof.setRuleOn(issue.group, false) }] : []),
    ];
  };

  /** Right-click on the page: what it offers depends on what is under the pointer. */
  const pageMenu = (e: React.MouseEvent) => {
    const ed = editor;
    const target = e.target as Element;
    if (!ed || !ed.view.dom.contains(target)) return;
    e.preventDefault();
    const { clientX: x, clientY: y } = e;
    const at = ed.view.posAtCoords({ left: x, top: y });
    const { from, to } = ed.state.selection;
    // A right-click outside the selection moves the cursor there, as a left-click would.
    if (at && (at.pos < from || at.pos > to) && !('$anchorCell' in ed.state.selection)) ed.commands.setTextSelection(at.pos);
    const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => void fn(ed.chain().focus()).run();

    const issueEl = target.closest('.cb-issue:not(.cb-issue-sentence)');
    const issue = issueEl ? issueAt(ed.state, ed.view.posAtDOM(issueEl, 0)) : null;
    if (issue) return void issueItems(issue).then((items) => showMenu('Suggestion', x, y, items));

    const nameEl = target.closest<HTMLElement>('.cb-name');
    if (nameEl?.dataset.card) {
      const card = nameEl.dataset.card;
      return showMenu('Name', x, y, [
        { label: 'Open the card', onPick: () => void select(card) },
        { label: 'Pin beside page', onPick: () => pin(card) },
        { label: 'Search every mention', onPick: () => findEverywhere(cards.get(card)?.title ?? nameEl.textContent ?? '') },
      ]);
    }

    if (target.closest('.cb-prose td, .cb-prose th')) {
      return showMenu('Table', x, y, [
        { label: 'Add row above', onPick: run((c) => c.addRowBefore()) },
        { label: 'Add row below', onPick: run((c) => c.addRowAfter()) },
        { label: 'Add column left', onPick: run((c) => c.addColumnBefore()) },
        { label: 'Add column right', onPick: run((c) => c.addColumnAfter()) },
        { separator: true },
        { label: 'Header row', checked: !!target.closest('table')?.querySelector('tr:first-child th'), onPick: run((c) => c.toggleHeaderRow()) },
        { separator: true },
        { label: 'Delete row', onPick: run((c) => c.deleteRow()) },
        { label: 'Delete column', onPick: run((c) => c.deleteColumn()) },
        { label: 'Delete table', danger: true, onPick: run((c) => c.deleteTable()) },
      ]);
    }

    const breakEl = target.closest('hr[data-scene-break]');
    if (breakEl) {
      const pos = ed.view.posAtDOM(breakEl, 0);
      return showMenu('Section break', x, y, [
        { label: 'Split into a new item here', onPick: () => void splitScene(pos), disabled: doc?.kind !== 'scene' },
        { label: 'Merge with the next item', onPick: () => void mergeNext(), disabled: !next },
        { separator: true },
        { label: 'Remove the break', danger: true, onPick: () => ed.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run() },
      ]);
    }

    const footEl = target.closest('.cb-footnote');
    if (footEl) {
      const pos = ed.view.posAtDOM(footEl, 0);
      const index = Math.max(0, footnotes(ed.state.doc).findIndex((f) => f.pos === pos));
      return showMenu('Footnote', x, y, [
        { label: 'Edit', onPick: () => editFootnote(index) },
        { separator: true },
        { label: 'Delete footnote', danger: true, onPick: () => deleteFootnote(ed, index) },
      ]);
    }

    const noteEl = target.closest<HTMLElement>('.cb-note');
    if (noteEl?.dataset.note) {
      const id = noteEl.dataset.note;
      return showMenu('Note', x, y, [
        {
          label: 'Delete note',
          danger: true,
          onPick: () => {
            removeNoteAnchor(ed, id);
            const { [id]: _gone, ...rest } = readNotes(docRef.current);
            setNotes(rest);
          },
        },
      ]);
    }

    const words = selectedWords(ed);
    const styleId = (ed.state.selection.$from.parent.attrs.style as string | undefined) ?? 'body';
    // Words pasted from the menu count as pasted, as Ctrl+V's do.
    const menuPaste = (plain: boolean) =>
      void pasteInto(ed, plain).then((result) => {
        if (result === 'unreadable') say(`To paste, press ${keys('Mod-V')}.`);
        else if (result === 'empty') say('There are no words on the clipboard to paste.');
        else pastedWords.current += countWords(result.pasted);
      });
    const items: MenuItem[] = [
      { label: 'Cut', hint: keys('Mod-X'), disabled: ed.state.selection.empty, onPick: () => clip(ed, 'cut') },
      { label: 'Copy', hint: keys('Mod-C'), disabled: ed.state.selection.empty, onPick: () => clip(ed, 'copy') },
      { label: 'Paste', hint: keys('Mod-V'), onPick: () => menuPaste(getSettings().pastePlain) },
      { label: 'Paste as plain text', hint: keys('Mod-Shift-V'), onPick: () => menuPaste(true) },
      { separator: true },
      {
        label: 'Paragraph style',
        items: sheet.paragraph.map((st) => ({ label: st.name, checked: st.id === styleId, onPick: run((c) => c.updateAttributes('paragraph', { style: st.id, align: null, lineSpacing: null })) })),
      },
      {
        // Strong, Emphasis and Underline are what ⌘B, ⌘I and ⌘U apply, so they carry those keys here.
        label: 'Character style',
        items: sheet.character.map((st) => {
          const basic = BASIC_KEYS[st.id];
          return {
            label: st.name,
            hint: basic && keys(basic.key),
            checked: basic ? isFormatted(ed, basic.style) : ed.isActive('charStyle', { style: st.id }),
            onPick: () => {
              ed.commands.focus();
              if (basic) toggleFormat(ed, basic.style);
              else toggleCharStyle(ed, st.id);
            },
          };
        }),
      },
      {
        label: 'Clear formatting',
        onPick: () => {
          ed.commands.focus();
          clearFormatting(ed);
        },
      },
      { separator: true },
      { label: 'Add footnote', hint: keys('Mod-Alt-F'), onPick: () => editFootnote(insertFootnote(ed)) },
      {
        label: 'Insert',
        items: [
          { label: 'Table', onPick: run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), disabled: ed.isActive('table') },
          { label: 'Numbered list', onPick: run((c) => c.toggleOrderedList()) },
          { label: 'Bulleted list', onPick: run((c) => c.toggleBulletList()) },
          { label: 'Checklist', onPick: run((c) => c.toggleTaskList()) },
          { label: 'Section break', onPick: run((c) => c.insertContent({ type: 'sceneBreak' })), disabled: ed.state.selection.$from.depth !== 1 },
        ],
      },
      { separator: true },
      { label: 'Search', hint: keys('Mod-F'), onPick: () => findEverywhere(words) },
      { separator: true },
      { label: 'Study', hint: keysFor('focus'), checked: settings.focus, onPick: toggleFocus },
      { label: 'Read the recipe', hint: keysFor('bookread'), onPick: () => void readManuscript() },
    ];
    if (words) {
      const short = words.length > 24 ? `${words.slice(0, 23)}…` : words;
      items.push(
        { separator: true },
        { heading: `“${short}”` },
        { label: 'Look it up in the Pantry', onPick: () => lookUp(words) },
        { label: 'Search everywhere', onPick: () => findEverywhere(words) },
        {
          label: 'Make it a Pantry card',
          items: CARD_TEMPLATES.map((t) => ({ label: t.name, onPick: () => void makeCard(t, words) })),
        },
      );
    }
    showMenu('Page', x, y, items);
  };

  /** Searches the whole work from Search in the top bar. */
  const findEverywhere = (query: string) => setFindRequest({ query, at: Date.now() });

  /** Shows the Pantry cards whose names or notes match. */
  const lookUp = (query: string) => {
    setPanel('pantry');
    setPantryQuery(query);
  };

  /** A new Pantry card named after the selected words, which then link to it. */
  const makeCard = async (template: DocTemplate, title: string) => {
    if (!fs) return;
    const p = await createFromTemplate(fs, '', template, title);
    const shelf = await readTree(fs, PANTRY, ORDERED(order.current));
    order.current = await placeNew(fs, order.current, shelf, PANTRY, p, null);
    index.current?.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
    indexChanged();
    await refreshTree();
    say(`Made a ${template.name.toLowerCase()} card for “${title}”.`);
  };

  /** Right-click on the empty part of the Shelf. */
  const shelfMenu = (x: number, y: number) => {
    showMenu('Shelf', x, y, [
      { label: 'New item', onPick: () => void addScene() },
      { label: 'New group', onPick: () => void addFolder() },
      { label: 'New item from template', items: SCENE_TEMPLATES.map((t) => ({ label: t.name, onPick: () => void addScene(t) })) },
      { label: 'Import files…', onPick: () => chooseImport(null) },
      { separator: true },
      { label: 'Read the recipe', onPick: () => void readManuscript() },
      { separator: true },
      { label: 'Expand all', onPick: () => setFolding({ open: true, at: Date.now() }) },
      { label: 'Collapse all', onPick: () => setFolding({ open: false, at: Date.now() }) },
    ]);
  };

  /** Every folder something could move to, with the top of the Shelf first. */
  const moveTargets = (item: string): MenuItem[] => {
    const top = topOf(item);
    const inside = (f: string) => f === item || f.startsWith(item + '/');
    const out: MenuItem[] = [];
    if (top === BOOKSHELF && parentOf(item) !== top) out.push({ label: 'Top of the Shelf', onPick: () => void moveInto(item, top) });
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind !== 'folder' || inside(n.path)) continue;
        if (parentOf(item) !== n.path) out.push({ label: `${' '.repeat(depth)}${PANTRY_FOLDERS.get(n.path) ?? n.name}`, onPick: () => void moveInto(item, n.path) });
        walk(n.children ?? [], depth + 1);
      }
    };
    walk(treeOf(top), 0);
    return out.length > 0 ? out : [{ label: 'No other groups', onPick: () => {}, disabled: true }];
  };
  const moveInto = (item: string, folder: string) => moveInTree(item, folder, childrenOf(treeOf(topOf(item)), topOf(item), folder).length);

  const rowMenu = (node: TreeNode, x: number, y: number) => {
    const p = node.path;
    const top = topOf(p);
    const onShelf = top === BOOKSHELF;
    const fixed = PANTRY_FOLDERS.has(p);
    const card = cards.get(p);
    const trash: MenuItem[] = fixed ? [] : [{ separator: true }, { label: 'Move to trash', hint: 'Delete', danger: true, onPick: () => void trashPath(p) }];
    if (top === RECIPES) {
      showMenu('Note', x, y, [
        { label: 'Open', onPick: () => void select(p) },
        ...(path && p !== path ? [{ label: 'Open beside this one', onPick: () => setBeside(p) }] : []),
        { label: 'Rename', hint: 'F2', onPick: () => setRenaming(p) },
        ...trash,
      ]);
      return;
    }
    const common = {
      label: {
        label: 'Label',
        items: [
          { label: 'None', checked: !card?.label, onPick: () => void setFieldOf(p, 'label', undefined) },
          ...LABELS.map((l) => ({ label: l.name, checked: card?.label === l.id, onPick: () => void setFieldOf(p, 'label', l.id) })),
        ],
      },
      duplicate: { label: 'Duplicate', onPick: () => void duplicate(p) },
      move: { label: 'Move to', items: moveTargets(p) },
    };
    if (node.kind === 'folder') {
      const kids = childrenOf(treeOf(top), top, p);
      showMenu('Group', x, y, [
        {
          label: onShelf ? 'New item here' : 'New card here',
          onPick: () => void addFrom(onShelf ? SCENE_TEMPLATES[0]! : CARD_TEMPLATES.find((t) => t.folder === sectionOf(p + '/x'))!, p),
        },
        { label: 'New group inside', onPick: () => void addFolderIn(p) },
        ...(onShelf ? [{ label: 'Import files here…', onPick: () => chooseImport(p) }] : []),
        { separator: true },
        ...(fixed ? [] : [{ label: 'Rename', hint: 'F2', onPick: () => setRenaming(p) }, common.duplicate, common.move]),
        {
          label: 'Sort contents',
          disabled: kids.length < 2,
          items: [
            { label: 'A to Z', onPick: () => void sortContents(p, false) },
            { label: 'Z to A', onPick: () => void sortContents(p, true) },
          ],
        },
        ...(onShelf ? [{ label: 'Read this group', onPick: () => void readManuscript(p) }, { label: 'Export group', items: exportItems(p) }] : []),
        { label: 'Expand all inside', onPick: () => setFolding({ open: true, under: p, at: Date.now() }) },
        { label: 'Collapse all inside', onPick: () => setFolding({ open: false, under: p, at: Date.now() }) },
        ...trash,
      ]);
      return;
    }
    if (isCard(card?.kind)) {
      showMenu('Card', x, y, [
        { label: 'Open', onPick: () => void select(p) },
        { label: 'Rename', hint: 'F2', onPick: () => setRenaming(p) },
        { label: 'Pin beside page', disabled: pins.includes(p), onPick: () => pin(p) },
        { label: 'Insert name on the page', disabled: !editor || doc?.kind === undefined || isCard(doc.kind), onPick: () => editor?.chain().focus().insertContent(card!.title).run() },
        { label: 'Set portrait…', disabled: card?.kind === 'research', onPick: () => choosePortrait(p) },
        common.label,
        { separator: true },
        common.duplicate,
        common.move,
        ...trash,
      ]);
      return;
    }
    const status = card?.status ?? 'not-started';
    showMenu('Item', x, y, [
      { label: 'Open', onPick: () => void select(p) },
      ...(path && p !== path ? [{ label: 'Open beside this one', onPick: () => setBeside(p) }] : []),
      { label: 'Rename', hint: 'F2', onPick: () => setRenaming(p) },
      ...(NOTES_ON ? [{ label: 'Add note…', onPick: () => void addRecipe(p) }] : []),
      common.duplicate,
      common.label,
      { label: 'Include in export', checked: !card?.skipExport, onPick: () => void setFieldOf(p, 'export', card?.skipExport ? undefined : false) },
      {
        label: 'Snapshots',
        items: [
          { label: 'Take a snapshot', onPick: () => void (p === path ? takeSnapshot('By hand') : select(p).then(() => takeSnapshot('By hand'))) },
          { label: 'Compare and roll back…', onPick: () => void showSnapshots(p) },
        ],
      },
      {
        label: 'Status',
        items: STATUSES.map((st) => ({ label: st.label, icon: <StatusIcon status={st.id} decorative />, checked: st.id === status, onPick: () => void setFieldOf(p, 'status', st.id === 'not-started' ? undefined : st.id) })),
      },
      { separator: true },
      common.move,
      { label: 'Put in a new group', onPick: () => void groupIntoFolder(p) },
      ...(p === path ? [{ label: 'Merge with next', disabled: !next, onPick: () => void mergeNext() }] : []),
      { separator: true },
      { label: 'Copy as Markdown', onPick: () => void copyMarkdown(p) },
      { label: 'Export item', items: exportItems(p) },
      ...trash,
    ]);
  };

  /** A recipe for a page: a source or note to guide work on it, listed under the page and opened to write. */
  const addRecipe = async (page: string) => {
    if (!fs) return;
    await flushSave();
    try {
      const target = page === path && docRef.current ? docRef.current : await readDocument(fs, page);
      if (!(await fs.exists(RECIPES))) await fs.makeFolder(RECIPES);
      const p = await createDocument(fs, RECIPES, 'New note', 'recipe');
      await writeDocument(fs, p, withField(await readDocument(fs, p), 'page', target.id));
      index.current?.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
      indexChanged();
      await refreshTree();
      await select(p);
      setRenaming(p);
    } catch (e) {
      setError(`Couldn’t add a note. ${friendlyError(e)}`);
    }
  };

  /** Sets a front matter field on any scene, open or not. */
  const setFieldOf = async (p: string, key: string, value: unknown) => {
    if (p === path) return setCardField(key, value);
    if (!fs) return;
    const updated = withField(await readDocument(fs, p), key, value);
    await writeDocument(fs, p, updated);
    index.current?.index.upsert(toIndexed(p, updated, await fs.stamp(p)));
    indexChanged();
  };

  const duplicate = async (p: string) => {
    if (!fs) return;
    await flushSave();
    try {
      const copied = await duplicateItem(fs, order.current, treeOf(topOf(p)), topOf(p), p);
      order.current = copied.order;
      await reindex();
      await refreshTree();
      say(`Duplicated “${cards.get(p)?.title ?? baseName(p).replace(/\.md$/, '')}”.`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const sortContents = async (folder: string, descending: boolean) => {
    if (!fs) return;
    order.current = await sortFolder(fs, order.current, treeOf(topOf(folder)), topOf(folder), folder, descending);
    await refreshTree();
  };

  /** Puts a scene in a new folder of its own, where it was, with the folder's name ready to type. */
  const groupIntoFolder = async (p: string) => {
    if (!fs) return;
    await flushSave();
    try {
      const top = topOf(p);
      const created = await createFolder(fs, parentOf(p));
      order.current = await placeNew(fs, order.current, treeOf(top), top, created, p);
      const fresh = await readTree(fs, top, ORDERED(order.current));
      const moved = await moveItem(fs, order.current, fresh, top, p, created, 0);
      order.current = moved.order;
      followMove(p, moved.path);
      await reindex();
      await refreshTree();
      setRenaming(created);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  /** Gives a page or card a new title, open or not. */
  const retitle = async (p: string, title: string) => {
    if (p === path) {
      const base = docRef.current ?? doc;
      if (!base || base.title === title) return;
      const next = { ...base, title };
      setDoc(next);
      scheduleSave(next);
      return;
    }
    if (!fs) return;
    const found = await readDocument(fs, p);
    if (found.title === title) return;
    const updated = { ...found, title };
    await writeDocument(fs, p, updated);
    index.current?.index.upsert(toIndexed(p, updated, await fs.stamp(p)));
    indexChanged();
  };

  const copyMarkdown = async (p: string) => {
    if (!fs) return;
    await flushSave();
    try {
      const d = await readDocument(fs, p);
      await navigator.clipboard.writeText(d.body);
      say(`Copied “${d.title}” as Markdown.`);
    } catch (e) {
      setError(`Couldn’t copy that. ${friendlyError(e)}`);
    }
  };

  /** Export › for one page or book of the Shelf. */
  const exportItems = (p: string): MenuItem[] => {
    const part = async () => {
      const node = [...walkFolders(tree)].find((n) => n.path === p) ?? { name: baseName(p), path: p, kind: 'file' as const };
      const title = cards.get(p)?.title ?? baseName(p).replace(/\.md$/, '');
      return { title, nodes: node.kind === 'folder' ? (node.children ?? []) : [node] };
    };
    return [
      { label: 'Word…', hint: '.docx', onPick: () => void part().then((x) => exportBook('docx', x)) },
      { label: 'Markdown…', hint: '.md', onPick: () => void part().then((x) => exportBook('md', x)) },
      { label: 'Print or save as PDF…', onPick: () => void part().then((x) => exportBook('print', x)) },
    ];
  };

  /** A page in Read book. */
  const readerMenu = (p: string, x: number, y: number) =>
    showMenu('Item', x, y, [
      { label: 'Open to write', onPick: () => void select(p) },
      { label: 'Copy text', onPick: () => void copyText(p) },
      { label: 'Export', items: exportItems(p) },
    ]);

  const copyText = async (p: string) => {
    if (!fs) return;
    try {
      const d = await readDocument(fs, p);
      await navigator.clipboard.writeText(plainText(d.body));
      say(`Copied the text of “${d.title}”.`);
    } catch (e) {
      setError(`Couldn’t copy that. ${friendlyError(e)}`);
    }
  };

  const pinMenu = (p: string, x: number, y: number) =>
    showMenu('Pinned card', x, y, [
      { label: 'Open', onPick: () => void select(p) },
      { label: 'Unpin', onPick: () => setPins(pins.filter((q) => q !== p)) },
      { label: 'Unpin all', onPick: () => setPins([]) },
    ]);

  /** Asks for a picture for a card, open or not; the file chooser needs the click that asked for it. */
  const choosePortrait = (p: string) => {
    portraitFor.current = p;
    portraitInput.current?.click();
  };

  /** Keeps the open scene, the index and closed folders pointing at a file or folder that moved. */
  const followMove = (from: string, to: string) => {
    if (from === to) return;
    index.current?.index.move(from, to);
    indexChanged();
    const moved = (p: string) => p === from || p.startsWith(from + '/');
    if (path && moved(path)) setPath(to + path.slice(from.length));
    if (pins.some(moved)) setPins(pins.map((p) => (moved(p) ? to + p.slice(from.length) : p)));
    const tracked = bookRef.current?.seasonings?.tracked ?? [];
    if (tracked.some(moved)) setSeasonings({ tracked: tracked.map((p) => (moved(p) ? to + p.slice(from.length) : p)) });
  };

  const moveInTree = async (from: string, folder: string, at: number) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    try {
      const moved = await moveItem(fs, order.current, treeOf(topOf(from)), topOf(from), from, folder, at);
      order.current = moved.order;
      followMove(from, moved.path);
    } catch (e) {
      setError(friendlyError(e));
    }
    await refreshTree();
  };

  /** A new book goes beside the book of the page being written, and its name is ready to type. */
  const addFolder = async () => {
    if (!fs) return;
    const here = path && path.startsWith(BOOKSHELF + '/') ? parentOf(path) : BOOKSHELF;
    const parent = here === BOOKSHELF ? BOOKSHELF : parentOf(here);
    const created = await createFolder(fs, parent);
    order.current = await placeNew(fs, order.current, tree, BOOKSHELF, created, here === BOOKSHELF ? path : here);
    await refreshTree();
    setRenaming(created);
  };

  /** A new folder inside `parent`, at its end, with its name ready to type. */
  const addFolderIn = async (parent: string) => {
    if (!fs) return;
    const created = await createFolder(fs, parent);
    order.current = await placeNew(fs, order.current, treeOf(topOf(parent)), topOf(parent), created, null);
    await refreshTree();
    setRenaming(created);
  };

  const renameInTree = async (from: string, title: string | null) => {
    setRenaming(null);
    if (!fs || title === null) return;
    if (from.endsWith('.md')) return void retitle(from, title).catch((e: unknown) => setError(friendlyError(e)));
    await flushSave();
    await saveUndoNow();
    try {
      const renamed = await renameFolder(fs, order.current, treeOf(topOf(from)), topOf(from), from, title);
      order.current = renamed.order;
      followMove(from, renamed.path);
    } catch (e) {
      setError(friendlyError(e));
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

  /** Read book, for the whole Shelf or for one book on it. */
  const readManuscript = async (folder?: string) => {
    if (!fs) return;
    await flushSave();
    const shelf = await readTree(fs, BOOKSHELF, order.current);
    const only = folder ? [...walkFolders(shelf)].find((n) => n.path === folder) : undefined;
    setManuscriptTitle(only ? only.name : 'The whole recipe');
    setManuscript(only ? [only] : shelf);
  };

  const changeSheet = (next: StyleSheet) => {
    setSheet(next);
    if (fs) saveStyles(fs, next).catch((e: unknown) => setError(friendlyError(e)));
  };
  const editStyle = (id: string, changes: Partial<ParagraphStyle>) => changeSheet(updateParagraphStyle(sheet, id, changes));
  const addStyle = (name: string, basedOn: string) => {
    const added = addParagraphStyle(sheet, name, basedOn);
    changeSheet(added.sheet);
    return added.id;
  };

  const setNotes = (next: Notes) => {
    const base = docRef.current ?? doc;
    if (!base) return;
    const { notes: _old, ...fields } = base.fields;
    const updated = { ...base, fields: Object.keys(next).length > 0 ? { ...fields, notes: next } : fields };
    setDoc(updated);
    scheduleSave(updated);
  };

  /** A footnote added or clicked in the text is edited at the foot of the page. */
  const showFootnote = (request: SeasoningsRequest) => editFootnote(request.index);

  /** The seasonings picked for this work, what Daniel tracks, and remarks removed for good. */
  const seas = book?.seasonings;
  const chosen = useMemo(() => (seas?.chosen ?? []).filter(isSeasoning), [seas?.chosen]);
  const setSeasonings = (changes: Partial<NonNullable<BookInfo['seasonings']>>) => {
    const current = bookRef.current?.seasonings ?? { chosen: [], tracked: [], gone: [] };
    updateBook({ seasonings: { ...current, ...changes } });
  };
  const [tracked, setTracked] = useState<Tracked[]>([]);
  // indexVersion changes whenever the index does, so results stay fresh while the writer types a query.
  // Cards are read from the index, so they follow it like search does.
  const cards = useMemo(() => index.current?.index.cards() ?? new Map(), [indexVersion]);
  const pantryHits = useMemo(() => {
    if (!pantryQuery.trim()) return null;
    return index.current?.index.search(pantryQuery, { kinds: PANTRY_SECTIONS.map((s) => SECTION_KIND[s]), limit: 40 }) ?? [];
  }, [pantryQuery, indexVersion]);
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
      if (!fs) throw new Error('No recipe is open.');
      return URL.createObjectURL(new Blob([(await fs.readBytes(p)).slice()], { type: pictureType(p) }));
    },
    [fs],
  );
  useEffect(() => {
    // Pictures written into scenes as ![…](path) are read from the book.
    setPictureLoader(fs ? loadPicture : null);
  }, [fs, loadPicture]);
  const pickPortrait = async (file: File) => {
    const base = docRef.current ?? doc;
    if (!fs || !base) return;
    try {
      const { data, type } = await shrinkPicture(file);
      setCardField('portrait', await savePicture(fs, base.title, data, type));
    } catch (e) {
      setError(`Couldn’t add that picture: ${friendlyError(e)}`);
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
  // Through updateBook, so a change made a moment before isn't written back over with the old settings.
  const onDialect = useCallback((dialect: 'en-US' | 'en-GB') => updateBook({ dialect }), [fs, book]);
  const onOff = useCallback((proofreadOff: string[]) => updateBook({ proofreadOff }), [fs, book]);
  const resting = useMemo(() => rulesOff(chosen), [chosen]);
  const bookTexts = useCallback(() => index.current?.index.pageTexts() ?? [], []);
  const proof = useProofreader({ fs, dialect: book?.dialect, onDialect, off: book?.proofreadOff, resting, onOff, editor, docId: doc?.id ?? null, names: storyNames, review: seasoningsOpen && !!doc, bookTexts, bookVersion: indexVersion, onError: setError });

  // Daniel counts the spoken words in what he tracks, the open page as it is now and the rest as saved.
  const trackedKey = (seas?.tracked ?? []).join('\n');
  useEffect(() => {
    const paths = trackedKey ? trackedKey.split('\n') : [];
    if (!fs || !chosen.includes('daniel') || paths.length === 0) return setTracked([]);
    let live = true;
    const titled = paths.map((p) => ({ path: p, title: cards.get(p)?.title ?? baseName(p).replace(/\.md$/, ''), share: null as number | null }));
    setTracked((before) => titled.map((t) => ({ ...t, share: before.find((b) => b.path === t.path)?.share ?? null })));
    const timer = window.setTimeout(async () => {
      const counted: Tracked[] = [];
      for (const t of titled) {
        const files = t.path.endsWith('.md') ? [t.path] : [...walkFiles(childrenOf(tree, BOOKSHELF, t.path))].map((f) => f.path);
        let spoken = 0;
        let all = 0;
        for (const f of files) {
          const body = f === path && docRef.current ? docRef.current.body : await readDocument(fs, f).then((d) => d.body, () => '');
          for (const line of plainText(body).split('\n')) {
            all += countWords(line);
            for (const [a, b] of dialogueRanges(line)) spoken += countWords(line.slice(a, b));
          }
        }
        counted.push({ ...t, share: all > 0 ? Math.round((spoken / all) * 100) : 0 });
      }
      if (live) setTracked(counted);
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [fs, trackedKey, chosen, tree, indexVersion]);
  const trackMenu = (x: number, y: number) => {
    const have = new Set(seas?.tracked ?? []);
    const add = (p: string) => setSeasonings({ tracked: [...(bookRef.current?.seasonings?.tracked ?? []), p] });
    const books = [...walkFolders(tree)].filter((n) => !have.has(n.path));
    showMenu('Track', x, y, [
      ...(path?.startsWith(BOOKSHELF + '/') && !have.has(path) ? [{ label: 'This item', onPick: () => add(path) }] : []),
      ...(books.length > 0 ? [{ heading: 'Groups' } as const, ...books.map((n) => ({ label: n.name, onPick: () => add(n.path) }))] : []),
      ...(have.size === 0 && books.length === 0 && !path?.startsWith(BOOKSHELF + '/') ? [{ label: 'Open an item to track it', disabled: true, onPick: () => {} }] : []),
    ]);
  };
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
  const loadCard = useCallback((p: string) => (fs ? readDocument(fs, p) : Promise.reject(new Error('No recipe is open.'))), [fs]);

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
  /** The app's own shortcuts (Settings › Keyboard shortcuts); the page's are in the editor. */
  const onAppKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onAppKey.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const id = commandFor(e, ['palette', 'switcher', 'shelf', 'seasonings', 'focus', 'newScene', 'bookread', 'settings']);
    if (settingsAt) {
      // Only the Settings shortcut itself works over Settings: it closes it again.
      if (id === 'settings') {
        e.preventDefault();
        setSettingsAt(null);
      }
      return;
    }
    if (!id) {
      // ⌘= and ⌘− zoom the page as far as the zoom pop-up goes; ⌘0 goes back to 100%.
      if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || !book || manuscript) return;
      const dir = e.key === '=' || e.key === '+' ? 1 : e.key === '-' ? -1 : null;
      if (dir === null && e.key !== '0') return;
      e.preventDefault();
      if (dir === null) updateBook({ page: { ...pageOf(book.page), zoom: 100 } });
      else zoomPage.current(dir);
      return;
    }
    e.preventDefault();
    if (id === 'palette') setPalette({ scenesOnly: false, at: Date.now() });
    else if (id === 'switcher') setPalette({ scenesOnly: true, at: Date.now() });
    else if (id === 'shelf') setShelf({ at: null });
    else if (id === 'seasonings') doc && togglePanel('seasonings');
    else if (id === 'focus') toggleFocus();
    else if (id === 'newScene') void addScene();
    else if (id === 'bookread') manuscript ? setManuscript(null) : void readManuscript();
    else if (id === 'settings') openSettings();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onAppKey.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /** Zooms the open page one step in or out, from what Fit width works out to when it's on. */
  const zoomPage = useRef<(dir: 1 | -1) => void>(() => {});
  const zoomOk = useRef(false);
  zoomOk.current = !!book && !manuscript && !settingsAt;
  // Ctrl and the mouse wheel (or a pinch on a trackpad) zoom the page too, instead of the whole window.
  useEffect(() => {
    let spun = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!zoomOk.current) return;
      // A wheel notch is about 100; a pinch comes in many small turns, gathered up until they make a step.
      if (e.timeStamp - last > 300) spun = 0;
      last = e.timeStamp;
      spun += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 40;
      if (Math.abs(spun) < 50) return;
      zoomPage.current(spun < 0 ? 1 : -1);
      spun = 0;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);
  const toggleFocus = () => {
    const focus = !getSettings().focus;
    setSettings({ focus });
    say(focus ? `Study. ${keysFor('focus')} or Escape brings everything back.` : 'Study off.');
  };
  useEffect(() => {
    // Escape leaves Study, unless something else (a menu, Search) wanted it first.
    if (!settings.focus) return;
    const onKey = (e: KeyboardEvent) => {
      // ProseMirror marks every Escape on the page as handled, so that one doesn't count.
      const handled = e.defaultPrevented && !(e.target instanceof Element && e.target.closest('.ProseMirror'));
      if (e.key !== 'Escape' || handled || document.querySelector('.menu, .shelf, .settings, .palette, .goals-pop, .issue-card')) return;
      setSettings({ focus: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.focus]);
  useEffect(() => {
    // The page redraws its fading when focus mode or what it keeps bright changes.
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(focusKey, true));
  }, [editor, settings.focus, settings.fade]);
  useEffect(() => {
    // Typewriter scrolling keeps the line being typed in the middle of the window.
    if (!editor || !settings.typewriter) return;
    const center = () => {
      const desk = document.querySelector<HTMLElement>('.desk');
      if (!desk || !editor.isFocused) return;
      const caret = editor.view.coordsAtPos(editor.state.selection.head);
      const box = desk.getBoundingClientRect();
      desk.scrollBy({ top: (caret.top + caret.bottom) / 2 - (box.top + box.height / 2) });
    };
    editor.on('selectionUpdate', center);
    editor.on('focus', center);
    return () => {
      editor.off('selectionUpdate', center);
      editor.off('focus', center);
    };
  }, [editor, settings.typewriter]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    let escapedAt = 0;
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && (escapedAt += 1);
    // Typing @ opens the shelf to pick a name; the @ stays if the writer closes it.
    const onInput = (e: Event) => {
      if ((e as InputEvent).data === '/' && getSettings().slashMenu) {
        const typedAt = escapedAt;
        window.setTimeout(() => {
          const { $head, empty } = editor.state.selection;
          // Escape pressed straight after the / means no menu.
          if (!empty || escapedAt !== typedAt) return;
          const line = $head.parent.textBetween(0, $head.parentOffset, undefined, '\ufffc');
          // At the start of a line or after a space, so dates and and/or are left alone.
          const found = /(^|\s)\/[\p{L}\p{N} ]{0,30}$/u.exec(line);
          if (found) setSlash($head.start() + found.index + found[1]!.length);
        }, 0);
        return;
      }
      if ((e as InputEvent).data !== '@' || !getSettings().atShelf) return;
      window.setTimeout(() => {
        // Letters typed quickly may already follow the @, so look back for it.
        const { $head } = editor.state.selection;
        const line = $head.parent.textBetween(0, $head.parentOffset, undefined, '\ufffc');
        const found = /(^|[^\p{L}\p{N}._%+-])@[\p{L}\p{N}'’-]{0,40}$/u.exec(line);
        // After a letter or number it's an email address, not a name.
        if (!found) return;
        setShelf({ at: $head.start() + found.index + found[1]!.length });
      }, 0);
    };
    // Pasted words are counted apart from typed ones; and Settings can make every paste plain text.
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      pastedWords.current += countWords(text);
      if (getSettings().pastePlain && text && e.clipboardData?.types.includes('text/html') && !editor.isActive('codeBlock')) {
        e.preventDefault();
        e.stopPropagation();
        editor.view.pasteText(text);
      }
    };
    const host = dom.parentElement ?? dom;
    dom.addEventListener('input', onInput);
    dom.addEventListener('keydown', onEscape, true);
    host.addEventListener('paste', onPaste, true);
    return () => {
      dom.removeEventListener('input', onInput);
      dom.removeEventListener('keydown', onEscape, true);
      host.removeEventListener('paste', onPaste, true);
    };
  }, [editor]);
  /** Letters typed after @ before the shelf opened: they leave the page and become its search. */
  const takeTyped = () => {
    const at = shelf?.at;
    if (at === null || at === undefined || !editor) return '';
    const { state } = editor;
    const head = state.selection.head;
    if (head <= at + 1 || state.doc.textBetween(at, at + 1) !== '@') return '';
    const typed = state.doc.textBetween(at + 1, head, '');
    if (typed.length > 40 || /\n/.test(typed)) return '';
    editor.view.dispatch(state.tr.delete(at + 1, head));
    return typed;
  };
  const insertName = (name: string) => {
    const at = shelf?.at ?? null;
    setShelf(null);
    if (!editor) return;
    const chain = editor.chain().focus();
    if (at !== null && editor.state.doc.textBetween(at, at + 1) === '@') chain.insertContentAt({ from: at, to: at + 1 }, { type: 'text', text: name }).run();
    else chain.insertContent({ type: 'text', text: name }).run();
  };
  const closeShelf = (typed = '') => {
    const at = shelf?.at ?? null;
    setShelf(null);
    if (at === null || !editor) return;
    // Closing without a pick leaves what was typed after the @ on the page.
    const { state } = editor;
    if (typed && /^[^\n]{1,40}$/.test(typed) && state.doc.textBetween(at, at + 1) === '@') editor.chain().focus().insertContentAt(at + 1, typed).run();
    else editor.commands.focus();
  };
  const insertItems = useMemo<PaletteItem[]>(() => {
    if (!editor) return [];
    const item = (id: string, label: string, group: string, words: string, run: () => void, hint?: string): PaletteItem => ({ id, label, group, words, run, hint });
    const breakHere = () =>
      editor.commands.command(({ tr, state }) => {
        const { $from } = state.selection;
        if ($from.depth !== 1) return false;
        const empty = $from.parent.content.size === 0;
        const start = empty ? $from.before() : $from.after();
        if (empty) tr.replaceWith(start, $from.after(), state.schema.nodes.sceneBreak!.create());
        else tr.insert(start, state.schema.nodes.sceneBreak!.create());
        const after = start + 1;
        if (after >= tr.doc.content.size || tr.doc.nodeAt(after)?.type.name !== 'paragraph') tr.insert(after, state.schema.nodes.paragraph!.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
        return true;
      });
    return [
      item('break', 'Section break', 'Insert', 'section scene break * * * divider hr', breakHere),
      item('bullets', 'Bulleted list', 'Insert', 'list bullets ul', () => void editor.chain().focus().toggleBulletList().run()),
      item('numbers', 'Numbered list', 'Insert', 'list numbers ol ordered', () => void editor.chain().focus().toggleOrderedList().run()),
      item('checklist', 'Checklist', 'Insert', 'list todo tasks checkbox', () => void editor.chain().focus().toggleTaskList().run()),
      item('table', 'Table', 'Insert', 'table grid', () => void editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
      item('footnote', 'Footnote', 'Insert', 'footnote note', () => editFootnote(insertFootnote(editor)), keysFor('footnote')),
      item('name', 'Name from the Pantry', 'Insert', 'pantry character place @ name', () => setShelf({ at: null }), keysFor('shelf')),
      ...sheet.paragraph.map((p) => item(`style-${p.id}`, p.name, 'Style', 'style paragraph heading', () => void editor.chain().focus().updateAttributes('paragraph', { style: p.id }).run(), 'Style')),
    ];
  }, [editor, sheet, settings.shortcuts, settings.shortcutStyle]);
  const drawerOpen = (seasoningsOpen && !!doc) || panel === 'pantry' || pins.length > 0;
  const saveEverything = useCallback(async () => {
    await flushSave();
    await saveUndoNow();
    await saveIndexNow();
  }, [flushSave, saveUndoNow, saveIndexNow]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.undo ? 10_000 : 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** The command palette (⌘K) or, with scenesOnly, the quick switcher (⌘O). */
  const [palette, setPalette] = useState<{ scenesOnly: boolean; at: number } | null>(null);
  const paletteItems = (scenesOnly: boolean): PaletteItem[] => {
    const places: PaletteItem[] = [...cards]
      .map(([p, c]) => {
        const top = p.split('/')[0];
        const folder = parentOf(p) === top ? '' : ` · ${baseName(parentOf(p))}`;
        const group = top === PANTRY ? 'Pantry' : top === RECIPES ? 'Notes' : 'Shelf';
        return { id: `open:${p}`, label: c.title || 'Untitled', hint: `${group}${folder}`, group: scenesOnly ? 'Go to' : group, words: c.aka.join(' '), run: () => void select(p) };
      })
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label, 'en', { numeric: true }));
    if (scenesOnly) return places;
    const cmd = (id: string, label: string, run: () => void, group = 'Actions', hint?: string, words?: string): PaletteItem => ({ id, label, run, group, hint, words });
    const sections: [SettingsSection, string, string][] = [
      ['general', 'General', 'reopen startup shortcuts mac ctrl'],
      ['appearance', 'Appearance', 'theme dark light sepia size motion page colour'],
      ['writing', 'Writing', 'quotes dash markdown typewriter focus paste @'],
      ['saving', 'Saving and backups', 'backup restore snapshot autosave'],
      ['shortcuts', 'Keyboard shortcuts', 'keys'],
      ['updates', 'Updates and privacy', 'version'],
      ['page', 'Layout', 'page size margins zoom draft letter a4 indent'],
      ['styles', 'Styles', 'paragraph character font'],
      ['proofreader', 'Proofreader', 'spelling grammar dictionary british american'],
      ['goals', 'Goals', 'target deadline words a day pasted'],
    ];
    const page = pageOf(book?.page);
    return [
      cmd('new', 'New item', () => void addScene(), 'Actions', keysFor('newScene'), 'page chapter scene'),
      cmd('card', 'New card', () => void addCard(), 'Actions', undefined, 'pantry character place research'),
      cmd('folder', 'New group', () => void addFolder(), 'Actions', undefined, 'book volume folder part'),
      cmd('bookread', manuscript ? 'Back to writing' : 'Read the recipe', () => (manuscript ? setManuscript(null) : void readManuscript()), 'Actions', keysFor('bookread'), 'read manuscript'),
      cmd('find', 'Search', () => setFindRequest({ query: '', at: Date.now() }), 'Actions', keysFor('find'), 'find replace'),
      cmd('shelf', 'Name from the Pantry', () => setShelf({ at: null }), 'Actions', keysFor('shelf'), 'cards characters insert'),
      cmd('pantry', panel === 'pantry' ? 'Close the Pantry' : 'Open the Pantry', () => togglePanel('pantry'), 'Actions', undefined, 'cards characters places research'),
      ...(doc ? [cmd('seasonings', seasoningsOpen ? 'Close Seasonings' : 'Open Seasonings', () => togglePanel('seasonings'), 'Actions', keysFor('seasonings'), 'spelling grammar dialogue readability proofreader')] : []),
      ...(doc ? [cmd('snapshot', 'Take a snapshot of this item', () => void takeSnapshot('By hand')), cmd('snapshots', 'Snapshots of this item…', () => path && void showSnapshots(path))] : []),
      cmd('focus', settings.focus ? 'Study off' : 'Study', toggleFocus, 'View', keysFor('focus'), 'focus distraction'),
      cmd('typewriter', settings.typewriter ? 'Typewriter scrolling off' : 'Typewriter scrolling on', () => setSettings({ typewriter: !settings.typewriter }), 'View'),
      cmd('draft', page.view === 'page' ? 'Show pages as Draft' : 'Show pages as Paper', () => updateBook({ page: { ...page, view: page.view === 'page' ? 'draft' : 'page' } }), 'View'),
      ...ZOOMS.map((z) => cmd(`zoom${z}`, `Zoom: ${zoomLabel(z)}`, () => updateBook({ page: { ...page, zoom: z } }), 'View')),
      ...(['system', 'light', 'dark', 'sepia'] as const).map((t) => cmd(`theme-${t}`, `Theme: ${t[0]!.toUpperCase()}${t.slice(1)}`, () => setSettings({ theme: t }), 'View', settings.theme === t ? '✓' : undefined)),
      cmd('goals', 'Goals', () => setGoalsRequest({ tab: 'targets', at: Date.now() }), 'Recipe', undefined, 'target daily words streak'),
      cmd('history', 'Writing history', () => setGoalsRequest({ tab: 'history', at: Date.now() }), 'Recipe', undefined, 'words written days'),
      cmd('docx', 'Export as Word…', () => void exportBook('docx'), 'Recipe', '.docx'),
      cmd('epub', 'Export as EPUB…', () => void exportBook('epub'), 'Recipe', '.epub'),
      cmd('md', 'Export as Markdown…', () => void exportBook('md'), 'Recipe', '.md'),
      cmd('print', 'Print or save as PDF…', () => void exportBook('print'), 'Recipe'),
      cmd('import', 'Import files…', () => chooseImport(null), 'Recipe', '.docx .md .txt'),
      cmd('zip', 'Back up as a zip…', () => void backUp(), 'Recipe'),
      cmd('backup', 'Back up now', () => void backUpNow(), 'Recipe', undefined, 'automatic backup'),
      cmd('books', 'Your recipes…', () => setLibraryOpen(true), 'Recipe', undefined, 'books works open library switch'),
      cmd('trash', 'Trash', openTrash, 'Recipe', undefined, 'deleted restore'),
      cmd('settings', 'Settings', () => openSettings(), 'Settings', keysFor('settings'), 'preferences options'),
      ...sections.map(([id, label, words]) => cmd(`settings-${id}`, `Settings › ${label}`, () => openSettings(id), 'Settings', undefined, words)),
      ...places,
    ];
  };

  const searchBook = useCallback((query: string): SearchHit[] => index.current?.index.search(query, { limit: 8 }) ?? [], [indexVersion]);

  const nextStyle = useCallback((style: string) => paragraphStyle(sheet, style).next ?? style, [sheet]);
  const css = useMemo(() => stylesToCss(sheet), [sheet]);
  const undoSteps = useEditorState({ editor, selector: ({ editor }) => (editor ? undoDepth(editor.state) : 0) }) ?? 0;
  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')) : 0),
  });

  const page = pageOf(book?.page);
  const goals: Goals = { dailyGoal: book?.dailyGoal ?? DEFAULT_DAILY_GOAL, bookTarget: book?.bookTarget, deadline: book?.deadline, weekendsOff: !!book?.weekendsOff };
  const bookWords = useMemo(() => {
    let total = 0;
    for (const [p, c] of cards) if (p.startsWith(BOOKSHELF + '/') && c.kind === 'scene') total += p === path ? (words ?? c.words) : c.words;
    return total;
  }, [cards, path, words]);
  const exportHistoryCsv = () =>
    void saveFile(`${book?.title ?? 'Recipe'} writing history`, historyCsv(history), KINDS.csv).catch((e: unknown) => setError(friendlyError(e)));
  // The page is drawn at the book's zoom whatever the interface size; Fit width fills the desk.
  const desk = useRef<HTMLElement>(null);
  const [deskWidth, setDeskWidth] = useState(0);
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setDeskWidth(el.clientWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const pageSize = PAGE_SIZES[page.size];
  // On a phone a whole sheet of paper won't fit, so the scene is shown as Draft. A side panel takes
  // its own column beside the desk, but opening one shouldn't switch the page between views.
  const panelColumn = drawerOpen && !settings.focus && window.innerWidth > 900 ? DRAWER_WIDTH : 0;
  const small = deskWidth > 0 && deskWidth + panelColumn < 640;
  const asDraft = page.view === 'draft' || small;
  const pageZoom = asDraft && (page.zoom === 0 || small) ? 1 / UI_ZOOM[settings.size] : page.zoom === 0 ? Math.max(0.4, Math.min(2.5, (deskWidth - 48) / (pageSize.width * 96))) : page.zoom / 100 / UI_ZOOM[settings.size];
  const fittedZoom = Math.round(Math.max(0.4, Math.min(2.5, (deskWidth - 48) / (pageSize.width * 96))) * 100);
  zoomPage.current = (dir) => updateBook({ page: { ...page, zoom: zoomStep(page.zoom || fittedZoom, dir) } });
  const pageStyle =
    asDraft
      ? { zoom: pageZoom }
      : { zoom: pageZoom, width: pageSize.width * 96, minHeight: pageSize.height * 96, padding: MARGINS[page.margins].inches * 96 };
  // The cards above the page are as wide as the page itself, at any size and zoom.
  const cardStyle = asDraft ? { width: '100%', maxWidth: 760 * pageZoom } : { width: pageSize.width * 96 * pageZoom };

  return (
    <div
      className={`app${panel === 'pantry' || (seasoningsOpen && doc) ? ' panel-open' : ''}${drawerOpen && !settings.focus ? ' drawer-open' : ''}${settings.focus ? ' focus' : ''}${settings.typewriter ? ' typewriter' : ''}${sideOpen ? ' side-open' : ''}`}
      style={{ '--shelf-w': `${shelfWidth}px` } as CSSProperties}
    >
      <style>{css}</style>
      <header className="topbar">
        <div className="brand-wrap">
          <button className="side-toggle" aria-label="Shelf" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo />
          <span className="brand">cookbook</span>
          <span className="crumb">
            <button
              className="crumb-book"
              aria-haspopup="menu"
              aria-expanded={menu?.label === 'Recipe'}
              onClick={bookMenu}
              onContextMenu={(e) => {
                e.preventDefault();
                showMenu('Recipe', e.clientX, e.clientY, [
                  { label: 'Configure…', onPick: () => openSettings('page') },
                  { label: 'Goals…', onPick: () => setGoalsRequest({ tab: 'targets', at: Date.now() }) },
                  { label: 'Writing history…', onPick: () => setGoalsRequest({ tab: 'history', at: Date.now() }) },
                  { separator: true },
                  { label: 'Back up now', onPick: () => void backUpNow() },
                  { label: 'Your recipes…', onPick: () => setLibraryOpen(true) },
                ]);
              }}
            >
              {book?.title ?? 'Recipes'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {doc ? ` · ${doc.title}` : ''}
          </span>
        </div>
        <div className="top-actions">
          <button className="panel-btn" aria-pressed={panel === 'pantry'} aria-expanded={panel === 'pantry'} onClick={() => togglePanel('pantry')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4.2C8.6 4.2 5.5 9.4 5.5 13.4 5.5 16.8 8.4 19.7 12 19.7s6.5-2.9 6.5-6.3C18.5 9.4 15.4 4.2 12 4.2z" />
            </svg>
            Pantry
          </button>
          <button className="panel-btn" aria-pressed={seasoningsOpen} aria-expanded={seasoningsOpen} disabled={!doc} onClick={() => togglePanel('seasonings')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" />
              <path d="M5 19 13 11" />
            </svg>
            Seasonings
          </button>
          <FindBox editor={editor} search={searchBook} currentPath={path} onOpenHit={select} request={findRequest} beforeReplaceAll={() => autoSnapshot('Before replacing all').catch(() => {})} />
        </div>
      </header>

      {/* Read book is for reading, so the formatting toolbar steps aside. */}
      {!manuscript && (
        <Toolbar editor={editor} sheet={sheet} onEditStyle={editStyle} onAddStyle={addStyle} onRenameStyle={(id, name) => changeSheet(renameParagraphStyle(sheet, id, name))} />
      )}

      <nav
        ref={shelfRef}
        className={`sidebar${fileDrop !== null ? ' file-drop' : ''}`}
        aria-label="Shelf"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const folder = dropFolder(e.target);
          if (folder !== fileDrop) setFileDrop(folder);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFileDrop(null)}
        onContextMenu={(e) => {
          // Rows have their own menu; this one is for the space around them.
          if ((e.target as Element).closest('[data-tree-path], input, .menu')) return;
          e.preventDefault();
          shelfMenu(e.clientX, e.clientY);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setFileDrop(null);
          void importFiles(Array.from(e.dataTransfer.files), dropFolder(e.target));
        }}
      >
        <h2 className="panel-h shelf-h">Shelf</h2>
        <Tree
          nodes={tree}
          root={BOOKSHELF}
          selected={path}
          cards={cards}
          live={doc && path ? { path, words: words ?? 0 } : null}
          collapseKey={`cookbook.closedFolders:${JSON.stringify(location)}:${BOOKSHELF}`}
          renaming={renaming}
          onSelect={select}
          onMove={(from, folder, at) => void moveInTree(from, folder, at)}
          onStartRename={setRenaming}
          onRename={(p, title) => void renameInTree(p, title)}
          onMenu={rowMenu}
          onTrash={(p) => void trashPath(p)}
          dropTarget={fileDrop}
          folding={folding}
          recipes={recipes}
        />
      </nav>
      <ShelfResizer width={shelfWidth} onWidth={setShelfWidth} shelf={() => shelfRef.current} />
      {sideOpen && <div className="side-backdrop" onClick={() => setSideOpen(false)} />}

      <main className={`desk${beside && doc ? ' split' : ''}${page.view === 'draft' ? ' draft' : ''}`} ref={desk}>
        <UpdateBanner beforeRestart={saveEverything} />
        {error && (
          <div role="alert" className="error" title={error}>
            <span>{error.replace(/ \([^]*\)$/, '')}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        {manuscript && fs ? (
          <Suspense fallback={null}><Manuscript fs={fs} tree={manuscript} title={manuscriptTitle} onOpen={(p) => void select(p)} onClose={() => setManuscript(null)} onMenu={readerMenu} /></Suspense>
        ) : (
          <>
          {doc && path && doc.kind === 'scene' && (
            <CardDetails
              style={cardStyle}
              synopsis={synopsisOf(doc.fields)}
              onSynopsis={(text) => setCardField('synopsis', text)}
              cast={cast}
            />
          )}
          {doc && path && isCard(doc.kind) && (
            <PantryCard
              style={cardStyle}
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
          <div className="page-row">
          {doc && path ? (
            <article className={`cb-page${asDraft ? ' draft' : ''}${isCard(doc.kind) ? ' card-page' : ''}${page.zoom !== 0 ? ' eased' : ''}`} key={path} style={pageStyle} onContextMenu={pageMenu}>
              <PageEditor
                initialBody={doc.body}
                undoLog={undoLog}
                onRecorder={onRecorder}
                nextStyle={nextStyle}
                onReady={setEditor}
                onChange={(body) => scheduleSave({ ...(docRef.current ?? doc), body })}
                onSeasonings={showFootnote}
              />
              <PageFootnotes editor={editor} />
              <SceneBreakActions editor={editor} nextTitle={next ? next.name.replace(/\.md$/, '') : null} onSplit={(pos) => void splitScene(pos)} onMerge={() => void mergeNext()} />
            </article>
          ) : null}
          {doc && path && beside && beside !== path ? (
            <Suspense fallback={null}><Beside path={beside} load={loadCard} version={indexVersion} onWrite={(p) => void swapBeside(p)} onClose={() => setBeside(null)} /></Suspense>
          ) : null}
          </div>
          {doc && path ? null : <p className="empty">Pick an item from the Shelf to start writing.</p>}
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
              onMenu={pinMenu}
            />
          )}
          {panel === 'pantry' && (
            <PantryPanel
              group={pantryGroup}
              onGroup={setPantryGroup}
              query={pantryQuery}
              onQuery={setPantryQuery}
              hits={pantryHits}
              selected={path}
              onOpen={(p) => void select(p)}
              onNew={() => void addCard()}
              onClose={() => setPanel(null)}
            >
              <Tree
                nodes={childrenOf(pantryTree, PANTRY, joinPath(PANTRY, pantryGroup))}
                root={joinPath(PANTRY, pantryGroup)}
                selected={path}
                cards={cards}
                live={null}
                collapseKey={`cookbook.closedFolders:${JSON.stringify(location)}:${PANTRY}`}
                renaming={renaming}
                onSelect={select}
                onMove={(from, folder, at) => void moveInTree(from, folder, at)}
                onStartRename={setRenaming}
                onRename={(p, title) => void renameInTree(p, title)}
                onMenu={rowMenu}
                onTrash={(p) => void trashPath(p)}
                folding={folding}
                loadPicture={loadPicture}
              />
            </PantryPanel>
          )}
          {seasoningsOpen && doc && (
            <Seasonings
              editor={editor}
              proof={proof}
              chosen={chosen}
              onChosen={(next) => setSeasonings({ chosen: next })}
              tracked={tracked}
              onTrack={trackMenu}
              onUntrack={(p) => setSeasonings({ tracked: (seas?.tracked ?? []).filter((q) => q !== p) })}
              gone={seas?.gone ?? []}
              onGone={(key) => setSeasonings({ gone: [...new Set([...(seas?.gone ?? []), key])] })}
              onClose={() => setPanel(null)}
              onIssueMenu={(i, x, y) => void issueItems(i).then((items) => showMenu('Suggestion', x, y, items))}
            />
          )}
        </div>
      )}

      <IssueCard editor={editor} proof={proof} />
      {slash !== null && editor && <InsertMenu editor={editor} at={slash} items={insertItems} onClose={() => setSlash(null)} />}

      {shelf && (
        <PantryShelf
          cards={shelfCards}
          castIds={cast.map((c) => c.id)}
          search={searchPantry}
          inserting={shelf.at !== null}
          typed={takeTyped}
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
        <Suspense fallback={null}><BookLibrary
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
          openBookItems={[
            { label: 'Back up as a zip…', onPick: () => void backUp() },
            {
              label: 'Export',
              items: [
                { label: 'Word…', hint: '.docx', onPick: () => void exportBook('docx') },
                { label: 'EPUB…', hint: '.epub', onPick: () => void exportBook('epub') },
                { label: 'Markdown…', hint: '.md', onPick: () => void exportBook('md') },
                { label: 'Print or save as PDF…', onPick: () => void exportBook('print') },
              ],
            },
            { label: 'Trash', onPick: openTrash },
          ]}
        /></Suspense>
      )}

      {menu && <Menu {...menu} onClose={closeMenu} />}

      {trashItems !== undefined && (
        <Suspense fallback={null}><TrashDialog
          items={trashItems}
          busy={busy}
          onRestore={(name) =>
            void inTrash(async () => {
              const p = await putBack(name);
              if (p) say(`Put “${baseName(p).replace(/\.md$/, '')}” back in ${parentOf(p) === BOOKSHELF ? 'the Shelf' : `“${baseName(parentOf(p))}”`}.`);
            })
          }
          onDelete={(name) =>
            void inTrash(async () => {
              if (fs) order.current = await deleteFromTrash(fs, name, order.current);
            })
          }
          onEmpty={() =>
            void inTrash(async () => {
              if (fs) order.current = await emptyTrash(fs, order.current);
            })
          }
          onClose={() => setTrashItems(undefined)}
        /></Suspense>
      )}

      {notice && (
        <div className="notice" role="status">
          <span className={notice.text.length > 70 ? 'notice-long' : undefined}>{notice.text}</span>
          {notice.undo && (
            <button
              className="notice-undo"
              onClick={() => {
                const undo = notice.undo!;
                setNotice(null);
                undo();
              }}
            >
              Undo
            </button>
          )}
          <button className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <input
        ref={portraitInput}
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          const p = portraitFor.current;
          if (!file || !p) return;
          void (p === path ? Promise.resolve() : select(p)).then(() => pickPortrait(file));
        }}
      />

      <input
        ref={importInput}
        type="file"
        multiple
        hidden
        accept={IMPORTABLE.join(',')}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          void importFiles(files, importInto.current);
        }}
      />

      <footer className="footer">
        <GoalsPopup
          history={history}
          goals={goals}
          onGoals={(changes) => updateBook(changes)}
          scene={doc && doc.kind === 'scene' ? { title: doc.title, words: words ?? 0, goal: sceneGoal(doc) } : null}
          onSceneGoal={(goal) => {
            const base = docRef.current ?? doc;
            if (!base) return;
            const { goal: _old, ...fields } = base.fields;
            const updated = { ...base, fields: goal ? { ...fields, goal } : fields };
            setDoc(updated);
            scheduleSave(updated);
          }}
          bookWords={bookWords}
          onExport={exportHistoryCsv}
          request={goalsRequest}
        />
        <span className="footer-end">
          {settings.focus && (
            <button className="study-exit" title={`Leave Study (${keysFor('focus')} or Escape)`} onClick={toggleFocus}>
              Study
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
          {doc && (
            <ZoomControl
              zoom={page.zoom}
              fitted={fittedZoom}
              label={page.view === 'draft' ? 'Draft' : PAGE_SIZES[page.size].label}
              onZoom={(zoom) => updateBook({ page: { ...page, zoom } })}
            />
          )}
          {doc && doc.kind === 'scene' && <StatusControl status={statusOf(doc.fields)} onStatus={(s: SceneStatus) => setCardField('status', s === 'not-started' ? undefined : s)} />}
          <span className={`saved${saveFailed ? ' is-failed' : dirty ? ' is-dirty' : ''}`} tabIndex={0} title={[where, doc && undoSteps > 0 ? `Undo remembers ${undoSteps.toLocaleString('en')} ${undoSteps === 1 ? 'step' : 'steps'}, even after closing` : ''].filter(Boolean).join('\n')}>
            {saveFailed || dirty ? (
              <span className="saved-dot" aria-hidden="true" />
            ) : (
              <svg className="saved-tick" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8.5 6.5 12 13 4.5" />
              </svg>
            )}
            {saveFailed ? 'Not saved' : dirty ? 'Saving…' : 'Saved'}
          </span>
          <button className="gear" aria-label="Settings" title={`Settings (${keysFor('settings')})`} onClick={() => openSettings()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </span>
      </footer>

      {settingsAt && (
        <Suspense fallback={<div className="settings" aria-busy="true" />}>
          <Settings
            section={settingsAt}
            onSection={(section) => {
              lastSection.current = section;
              setSettingsAt(section);
            }}
            onClose={() => setSettingsAt(null)}
            book={book}
            onBook={updateBook}
            sheet={sheet}
            onEditStyle={editStyle}
            onAddStyle={addStyle}
            onRenameStyle={(id, name) => changeSheet(renameParagraphStyle(sheet, id, name))}
            proof={proof}
            onExportHistory={exportHistoryCsv}
            backups={backups}
            onBackUpNow={backUpNow}
            onRestore={() => {
              const r = document.activeElement?.getBoundingClientRect();
              void chooseRestore(r?.left ?? 200, (r?.bottom ?? 200) + 4);
            }}
            onChooseBackupFolder={() => void chooseBackupFolder()}
            newBooksFolder={isTauri() ? settings.newBooksFolder || 'Cookbook’s own folder, with its app data' : null}
            onChooseNewBooksFolder={() => void chooseNewBooksFolder()}
            version={__APP_VERSION__}
            onCheckUpdates={checkForUpdates}
          />
        </Suspense>
      )}

      {palette && <Palette key={palette.at} items={paletteItems(palette.scenesOnly)} placeholder={palette.scenesOnly ? 'Go to an item or card' : 'Type a command, setting or item'} onClose={() => setPalette(null)} />}

      {snapshots && (
        <SnapshotsDialog
          title={snapshots.title}
          current={docRef.current?.body ?? ''}
          snapshots={snapshots.list}
          onTake={() => void takeSnapshot('By hand')}
          onRollBack={(snap) => void rollBack(snap)}
          onDelete={(snap) =>
            void (async () => {
              if (!fs || !docRef.current) return;
              await deleteSnapshot(fs, snap);
              setSnapshots({ ...snapshots, list: await listSnapshots(fs, docRef.current.id) });
            })()
          }
          onClose={() => setSnapshots(null)}
        />
      )}
    </div>
  );
}
