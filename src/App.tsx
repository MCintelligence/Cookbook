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
import { type CookbookDocument, type SceneStatus, LABELS, STATUSES, akaOf, isCard, newId, serializeDocument, statusOf, withField } from './storage/document';
import { applyRescue, dropRescue, keepRescue, takeRescue } from './storage/rescue';
import { type TrashItem, deleteFromTrash, emptyTrash, listTrash, restoreFromTrash } from './storage/trash';
import { backupZip } from './storage/backup';
import { IMPORTABLE, canImport, importFile } from './storage/importer';
import { type ScrivenerSource, findProject, importScrivener, isScrivenerZip, zipSource } from './storage/scrivener';
import { folderFilesSource, pickScrivener } from './ui/scrivenerPick';
import { collect } from './export/manuscript';
import { bookDocx } from './export/docx';
import { bookEpub } from './export/epub';
import { bookHtml } from './export/html';
import { bookMarkdown } from './export/markdownExport';
import { printHtml } from './export/print';
import { type PlateSettings, plateOf } from './plate/settings';
import { KINDS, saveFile } from './ui/saveFile';
import { Menu, type MenuItem } from './ui/Menu';
import { type BarMenu, MenuBar } from './ui/MenuBar';
import { setMacMenu } from './ui/nativeMenu';
const TrashDialog = lazy(() => import('./ui/TrashDialog').then((m) => ({ default: m.TrashDialog })));
import { type Order, loadOrder } from './storage/order';
import { type WritingHistory, loadHistory, recordWords, saveHistory } from './storage/history';
import { type BookTemplateId, type DocTemplate, CARD_TEMPLATES, SCENE_TEMPLATES, applyBookTemplate, createFromTemplate } from './storage/templates';
import { FIRST_ITEM, LEARN_TO_COOK, learnToCookLocation, learnedBefore, makeLearnToCook, rememberLearnToCook } from './storage/learnToCook';
import { type NodeJSON, parseMarkdown, plainText, serializeMarkdown } from './editor/markdown';
import { friendlyError } from './storage/errors';
import { type Goals } from './ui/GoalsPopup';
import { LiveGoals, MiseCount, type SaveState, SavedStatus } from './ui/LiveCounts';
import { createStore } from './ui/store';
import { useStable } from './ui/useStable';
import { docWords } from './editor/docStats';
import { useBookIndex } from './storage/useBookIndex';
import { ownerOf, useBackups } from './storage/useBackups';
import { Palette, type PaletteItem } from './ui/Palette';
import { InsertMenu } from './ui/InsertMenu';
import { TextSelection } from '@tiptap/pm/state';
import { type CardSummary, type SceneMention, type SearchHit, countWords, loadIndex, refreshIndex, shownOf, toIndexed } from './storage/index';
import { type NamedCard, castIn, countNames, nameMatcher, nameMatcherOf, setNameMatcher } from './editor/names';
import { NamePeek } from './ui/NamePeek';
import { PantryShelf, type ShelfCard } from './ui/PantryShelf';
import { PinnedCards } from './ui/PinnedCards';
const Plate = lazy(() => import('./ui/Plate').then((m) => ({ default: m.Plate })));
import {
  type BookLocation,
  DEFAULT_BOOK,
  bookExists,
  childLocation,
  defaultLocation,
  isTauri,
  newBookLocation,
  openLocation,
  pickFolder,
  recentBooks,
  rememberBook,
  sameLocation,
  updateRecent,
} from './storage/platform';
import { type UserTemplate, copyRecipe, deleteForGood, firstLines, freeName, renameCopy, saveTemplate } from './storage/library';
import type { NewRecipeChoice } from './ui/NewRecipe';
import { pageKeyAnywhere } from './ui/scrollKeys';
import type { EditorView } from '@tiptap/pm/view';
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
import { MiseEnPlace } from './ui/MiseEnPlace';
import { type MiseView, findGroup, findNode, inRoots, miseEntries, miseEntriesOf, miseItems, miseWords, viewOfPicked } from './ui/mise';
import { type SeasoningsRequest } from './editor/seasonings';
import { type UndoLog, type UndoRecorder, readUndoLog, writeUndoLog } from './editor/undoLog';
import { undoDepth } from '@tiptap/pm/history';
import { appendScene, mergeNotes, partitionNotes, splitAtBreak } from './editor/scenes';
const BookLibrary = lazy(() => import('./ui/BookLibrary').then((m) => ({ default: m.BookLibrary })));
import { SceneBreakActions } from './ui/SceneBreakActions';
import { AREA_SHORTCUTS, type Area, areaOf, areaRoot, areaShown, landingIn, nextArea } from './ui/areas';
import { BrainstormPlus } from './ui/BrainstormPlus';
import { BRAINSTORM_GROUPS, type BrainstormCard, isBrainstormKind } from './storage/brainstorm';
import { emptyLineAt, insertBrainstorm } from './editor/brainstorm';
import { FindBox } from './ui/FindBox';
import { PageFootnotes, editFootnote } from './ui/PageFootnotes';
import { useProofreader } from './proofread/useProofreader';
import { type Dialect } from './proofread/check';
import { dialectOf, systemEnglish } from './proofread/english';
import { recipeDefaults } from './writers';
import { tableSetBefore } from './ui/tableSet';
import { IssueCard } from './ui/IssueCard';
import { KIND_OF, type SeasoningId, fixText, isSeasoning, needsReview, rulesOff } from './proofread/remarks';
import { type Report, REPORTS, reportMarkdown, reportName } from './proofread/reports';
import { ReportWindow } from './ui/ReportWindow';
import { type FoundIssue, applySuggestion, aroundIssue, issueAt, issuesOf, stepIssue } from './proofread/plugin';
import { RULE_GROUPS } from './proofread/rules';
import { clip, pasteInto, selectedWords } from './editor/pageActions';
import { IS_MAC, binding, commandFor, keys, keysFor } from './shortcuts';
import { getSettings, setSettings, useSettings } from './settings';
import { type SettingsSection } from './ui/Settings';
import { MARGINS, PAGE_SIZES, ZOOMS, pageOf, zoomLabel, zoomStep } from './storage/page';
import { type Backup, BackupCheckError, listBackups, markClosed, markOpen, restoreBackup } from './storage/autoBackup';
import { historyCsv } from './storage/goals';
import { focusKey } from './editor/focusMode';
import { type Snapshot, listSnapshots, takeSnapshot as storeSnapshot, deleteSnapshot } from './storage/snapshots';
import { SnapshotsDialog } from './ui/SnapshotsDialog';
import { type DraftText, deleteDraft, draftsOf, ghostParagraphs, listDrafts, readDraft, saveDraft, writeDraft } from './storage/drafts';
import { setGhost } from './editor/ghost';
const Beside = lazy(() => import('./ui/Beside').then((m) => ({ default: m.Beside })));
import { checkForUpdates } from './ui/UpdatePopup';
import { deleteFootnote, footnotes, insertFootnote, removeNoteAnchor, setChecksOff, setDialogueFocus } from './editor/seasonings';
import { type BasicStyle, clearFormatting, isFormatted, toggleCharStyle, toggleFormat } from './editor/extensions';
import { UpdatePopup } from './ui/UpdatePopup';
import { Seasonings } from './ui/Seasonings';
import { SeasoningsBadge } from './ui/SeasoningsBadge';
import { Toolbar } from './ui/Toolbar';
import { ZoomControl } from './ui/ZoomControl';
import { OvenEdges, useSlideAway } from './ui/OvenEdges';
import { StatusControl, StatusIcon } from './ui/StatusIcon';
import { type Recipe, Tree } from './ui/Tree';
import { BAR_ICONS, PanelBar } from './ui/PanelBar';
import { allPaths, stillThere, topmost } from './ui/selection';
import { ShelfResizer, useShelfWidth } from './ui/ShelfResizer';
import { type CardChoice, PantryCard } from './ui/PantryCard';
import { PantryPanel } from './ui/PantryPanel';
import { ShelfSearch } from './ui/ShelfSearch';
import { UNTRACKED, changesAt, goToChange, hasChanges, hasChangesJSON, setSuggesting, settleAll, settleAt, settledJSON } from './editor/trackChanges';
import { shrinkPicture } from './ui/pictures';
import { type PantrySection, SECTION_KIND, SECTION_LABEL, pictureType, savePicture, sectionOf } from './storage/pantry';
import { Icon } from './ui/Icon';

type Notes = Record<string, string>;
/** The panel open on the right of the page, if any. */
type Panel = 'pantry' | 'seasonings';
/** Where the cursor was in an Item whose editor is being made again elsewhere on the page. */
interface KeptCaret {
  id: string;
  from: number;
  to: number;
  /** Whether the editor had the keyboard, so the new one takes it back. */
  focus: boolean;
}

// Settings opens rarely, so it loads when first needed and keeps the first load light.
const Settings = lazy(() => import('./ui/Settings').then((m) => ({ default: m.Settings })));
const SetTheTable = lazy(() => import('./ui/SetTheTable').then((m) => ({ default: m.SetTheTable })));
const ManualWindow = lazy(() => import('./ui/Manual').then((m) => ({ default: m.Manual })));
/** The interface size's zoom, which the page takes back out so it keeps the book's own zoom. */
/** The right-hand panel's column; matches --drawer-w in styles.css. */
const drawerWidth = () => Math.round(Math.min(320, Math.max(280, window.innerWidth * 0.24)));
const UI_ZOOM = { small: 0.9, medium: 1, large: 1.12 } as const;
/** A window narrow enough for the phone layout, where side panels slide over the page (styles.css, 900px). */
const narrowWindow = () => window.matchMedia('(max-width: 900px)').matches;
/** Fit width's zoom: the page, plus the desk's 24px sides, fills the desk. */
const fitZoom = (deskWidth: number, pageInches: number) => Math.max(0.4, Math.min(2.5, (deskWidth - 48) / (pageInches * 96)));
/** Below this the page is shown as Draft, since a whole sheet of paper won't fit. */
const isSmallDesk = (deskWidth: number, panelColumn: number) => deskWidth > 0 && deskWidth + panelColumn < 640;
/** The character styles that ⌘B, ⌘I and ⌘U apply. */
/** The desktop app on a Mac, whose menus go in the system's menu bar at the top of the screen. */
const MAC_APP = isTauri() && IS_MAC;
/** Closes the desktop app's window, which saves the last words typed before the app ends. */
const quitApp = () => import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close());

const BASIC_KEYS: Record<string, { key: string; style: BasicStyle }> = {
  strong: { key: 'Mod-B', style: 'strong' },
  emphasis: { key: 'Mod-I', style: 'emphasis' },
  underline: { key: 'Mod-U', style: 'underline' },
};

/** The top folder a path is in: the Shelf (bookshelf), the Pantry or the recipes. */
const topOf = (p: string) => p.split('/')[0]!;
const ORDERED = (order: Order) => ({ [PANTRY]: [...PANTRY_SECTIONS], ...order });
/** The Group in the Pantry's Materials where Seasonings reports are kept. */
const REPORT_GROUP = 'Seasoning Reports';

/** The Pantry's sections are fixed: they can hold folders but not be moved or renamed. */
const PANTRY_FOLDERS = new Map(PANTRY_SECTIONS.map((s) => [joinPath(PANTRY, s), SECTION_LABEL[s]]));

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

async function startBook(fs: StorageAdapter, title: string, template: BookTemplateId = 'novel', setup: Partial<BookInfo> = {}): Promise<BookInfo> {
  return makeBookOrUndo(fs, async () => {
    // The writer's own starting points from Set the Table, under anything New Recipe asked for.
    const defaults = recipeDefaults(getSettings());
    const info = { ...(await createBook(fs, title)), ...defaults, ...setup };
    await applyBookTemplate(fs, template);
    if (Object.keys(defaults).length + Object.keys(setup).length > 0) await saveBookInfo(fs, info);
    return info;
  });
}

/** A new recipe that starts as a copy of another: one of the writer's templates, or a recipe being duplicated. */
async function copyBook(from: BookLocation, fs: StorageAdapter, title: string, setup: Partial<BookInfo> = {}): Promise<BookInfo> {
  const { fs: source } = await openLocation(from);
  return makeBookOrUndo(fs, async () => {
    await copyRecipe(source, fs);
    return renameCopy(fs, { title, ...setup });
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

function lastSceneKey(location: BookLocation | null): string {
  return `cookbook.lastScene:${JSON.stringify(location)}`;
}

function folderName(location: BookLocation): string {
  if (location.kind === 'folder') return location.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || DEFAULT_BOOK;
  return location.name;
}

interface AddOptions {
  /** Open the new row's name box straight away. */
  name?: boolean;
}
/** For the panel bars' New buttons, which would otherwise keep focus, so a typed name pressed them again. */
const NAME_IT: AddOptions = { name: true };

export function App() {
  const [fs, setFs] = useState<StorageAdapter | null>(null);
  const [where, setWhere] = useState('');
  /**
   * Words typed since the last save, for the dot in the footer, and whether the last save of
   * the page failed (it is tried again until it works). Kept out of React state so that
   * starting and finishing a save only redraws the footer's Saved.
   */
  const [saveState] = useState(() => createStore<SaveState>({ dirty: false, failed: false }));
  const setDirty = (dirty: boolean) => saveState.get().dirty !== dirty && saveState.set({ ...saveState.get(), dirty });
  const setSaveFailed = (failed: boolean) => saveState.get().failed !== failed && saveState.set({ ...saveState.get(), failed });
  const [book, setBook] = useState<BookInfo | null>(null);
  const [sheet, setSheet] = useState<StyleSheet>(defaultStyles);
  /** The Shelf's pages and books, the Pantry's groups, and the recipes, each as read from its folder. */
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [pantryTree, setPantryTree] = useState<TreeNode[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe[]>>(new Map());
  /** Each Item's drafts by number, by Item id; read from folder names when the Shelf is read. */
  const [draftIds, setDraftIds] = useState<Map<string, number[]>>(new Map());
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<CookbookDocument | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const seasoningsOpen = panel === 'seasonings';
  /** In Oven Mode the Shelf (sideOpen) and the right-hand panel (ovenSide) stay tucked away until asked for. */
  const [sideOpen, setSideOpen] = useState(false);
  const [ovenSide, setOvenSide] = useState(false);
  const panelNow = useRef<{ panel: Panel | null; ovenSide: boolean }>({ panel: null, ovenSide: false });
  panelNow.current = { panel, ovenSide };
  const togglePanel = (p: Panel) => {
    if (!getSettings().focus) {
      // On a small window the panels slide over the page, so only one shows at a time.
      if (narrowWindow()) setSideOpen(false);
      return setPanel((open) => (open === p ? null : p));
    }
    // Oven Mode: the panel slides in over the page, or back out if it is the one showing.
    setSideOpen(false);
    if (panelNow.current.ovenSide && panelNow.current.panel === p) return setOvenSide(false);
    setPanel(p);
    setOvenSide(true);
  };
  /** A panel's own close button: in Oven Mode it only slides away, so Stove Mode keeps it. */
  const closePanel = () => (getSettings().focus ? setOvenSide(false) : setPanel(null));
  const docRef = useRef<CookbookDocument | null>(null);
  /**
   * Set when the editor's text has changed since docRef.current.body was last brought up to
   * date. Serialising a long Item takes milliseconds, so typing only sets this, and the body
   * is worked out when something reads the Item through currentDoc().
   */
  const bodyFrom = useRef<Editor | null>(null);
  /** The open Item as it is now, with its body brought up to date from the editor if needed. */
  const currentDoc = useCallback((): CookbookDocument | null => {
    const ed = bodyFrom.current;
    bodyFrom.current = null;
    if (ed && docRef.current) docRef.current = { ...docRef.current, body: serializeMarkdown(ed.getJSON() as NodeJSON) };
    return docRef.current;
  }, []);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<(() => Promise<void>) | null>(null);
  const started = useRef(false);
  const [location, setLocation] = useState<BookLocation | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** Your Recipes opens straight onto New Recipe. */
  const [libraryNew, setLibraryNew] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<BookLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const { index, version: indexVersion, changed: indexChanged, textChanged, show: showIndex, saveNow: saveIndexNow, textCount } = useBookIndex();
  /** What the Shelf and Pantry show of the open Item as last indexed (see shownOf), to tell a save that only changed words. */
  const shownBefore = useRef<{ path: string; shown: string } | null>(null);
  /** Saves since the Shelf last caught up changed only words, so the open Item's saved word count is behind. */
  const wordsBehind = useRef(false);
  const order = useRef<Order>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pantryGroup, setPantryGroup] = useState<PantrySection>('characters');
  /** Groups and Items picked on the Shelf and in the Pantry, for their toolbars and menus. */
  const [shelfPicked, setShelfMarked] = useState<Set<string>>(() => new Set());
  const [pantryPicked, setPantryMarked] = useState<Set<string>>(() => new Set());
  // What the Pantry shows: the cards and Groups of the section picked.
  const pantryNodes = useMemo(() => childrenOf(pantryTree, PANTRY, joinPath(PANTRY, pantryGroup)), [pantryTree, pantryGroup]);
  // Anything moved away, renamed or deleted is no longer picked.
  const shelfMarked = useMemo(() => stillThere(shelfPicked, tree), [shelfPicked, tree]);
  const pantryMarked = useMemo(() => stillThere(pantryPicked, pantryNodes), [pantryPicked, pantryNodes]);
  const [pantryQuery, setPantryQuery] = useState('');
  /** The Pantry shelf, and where the @ that opened it is. */
  const [shelf, setShelf] = useState<{ at: number | null } | null>(null);
  /** Where the / is that opened the insert menu. */
  const [slash, setSlash] = useState<number | null>(null);
  const [pins, setPinsState] = useState<string[]>([]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  /** Plate mode, with the Shelf as it was when it opened. */
  const [plateShelf, setPlateShelf] = useState<TreeNode[] | null>(null);
  /** The Groups shown as Mise en Place, all their Items as one page, or null for a single Item. */
  const [mise, setMise] = useState<MiseView | null>(null);
  /** Counts up when Items shown in Mise en Place were rewritten behind it, so it reads them again. */
  const [miseRound, setMiseRound] = useState(0);
  /** Words for Search, from "Search everywhere" on a right-click. */
  const [findRequest, setFindRequest] = useState<{ query: string; at: number } | null>(null);
  /** Opens or closes every folder (or every one inside `under`), from a right-click. */
  const [folding, setFolding] = useState<{ open: boolean; under?: string; at: number } | null>(null);
  const portraitInput = useRef<HTMLInputElement>(null);
  const portraitFor = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number; label: string; opener?: HTMLElement } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** The trash dialog's list: undefined while closed, null while it loads. */
  const [trashItems, setTrashItems] = useState<TrashItem[] | null | undefined>(undefined);
  /** A short message at the bottom of the window, sometimes with an Undo. */
  /** A passing message; `undo` adds a button, labelled `action` or else Undo. */
  const [notice, setNotice] = useState<{ text: string; undo?: () => void; action?: string; at: number } | null>(null);
  const say = (text: string, undo?: () => void, action?: string) => setNotice({ text, undo, action, at: Date.now() });
  const importInput = useRef<HTMLInputElement>(null);
  /** A folder input, for a Scrivener project in browsers that can't open folders any other way. */
  const scrivenerInput = useRef<HTMLInputElement>(null);
  /** The folder the next "Import files…" goes into, or null for the usual place. */
  const importInto = useRef<string | null>(null);
  /** The sidebar folder files are being dragged over, for the drop highlight. */
  const [fileDrop, setFileDrop] = useState<string | null>(null);
  const settings = useSettings();
  // On a phone (and in Oven Mode) the sidebar slides out over the page: sideOpen, above.
  const [shelfWidth, setShelfWidth] = useShelfWidth();
  const shelfRef = useRef<HTMLElement>(null);
  /** The Settings screen's section while it is open, or null while writing. */
  const [settingsAt, setSettingsAt] = useState<SettingsSection | null>(null);
  /** Set the Table, the welcome questions: on the very first start, or again from App Settings or Help. */
  const [table, setTable] = useState<'first' | 'again' | null>(null);
  /** The manual, open at a chapter. */
  const [manualAt, setManualAt] = useState<{ chapter: string; at: number } | null>(null);
  const lastSection = useRef<SettingsSection>('general');
  const openSettings = (section: SettingsSection = lastSection.current) => setSettingsAt(section);
  const [goalsRequest, setGoalsRequest] = useState<{ tab: 'targets' | 'history'; at: number } | null>(null);
  // Read by handlers that outlive a render: closing the window, keys, backups.
  const fsRef = useRef(fs);
  fsRef.current = fs;
  const bookRef = useRef(book);
  bookRef.current = book;
  /** Words pasted since the last save, which don't count towards the goal unless the book says so. */
  const pastedWords = useRef(0);
  // Saved before a timed backup, so it has the newest words.
  const { backups, refreshBackups, autoBackup, openBackupStore, changedSinceBackup, lastBackupAt } = useBackups(fsRef, bookRef, () => flushRef.current(), {
    failed: (text) => setError(text),
    mended: (text) => {
      setError((shown) => (shown === text ? null : shown));
      say('Backups are working again.');
    },
    sameDisk: () =>
      say(
        'Your backups are on the same disk as your recipes, so a broken or lost computer would take both. A folder on another drive, or one a cloud service syncs, keeps them apart.',
        () => openSettings('saving'),
        'Choose folder…',
      ),
  });

  /** Changes the open book's settings in book.json. */
  const updateBook = (changes: Partial<BookInfo>) => {
    const current = bookRef.current;
    if (!fs || !current) return;
    const updated = { ...current, ...changes };
    bookRef.current = updated;
    setBook(updated);
    saveBookInfo(fs, updated).catch((e: unknown) => setError(friendlyError(e)));
  };
  // Suggest changes (track changes) is a Recipe setting: every page open follows it.
  useEffect(() => setSuggesting(!!book?.suggest), [book?.suggest]);
  const toggleSuggest = () => {
    if (!bookRef.current) return;
    const on = !bookRef.current.suggest;
    updateBook({ suggest: on || undefined });
    say(on ? 'Suggesting changes: what you type and delete is marked, to accept or reject later.' : 'Stopped suggesting changes. Edits go straight in again.');
  };


  /**
   * Opens the book at a location. `create` starts a new book there; `adopt`
   * turns a folder that is not a book yet into one.
   */
  const openAt = async (
    target: BookLocation,
    mode: {
      create?: string;
      template?: BookTemplateId;
      from?: BookLocation;
      setup?: Partial<BookInfo>;
      adopt?: boolean;
      editingTemplate?: boolean;
      learn?: boolean;
      /** Lays the new recipe out some other way, such as from a Scrivener project. */
      make?: (fs: StorageAdapter) => Promise<BookInfo>;
    } = {},
  ) => {
    await flushSave();
    await saveUndoNow();
    await saveIndexNow();
    if (getSettings().backupOnClose) await autoBackup().catch(() => {});
    const { fs: nextFs, where: nextWhere } = await openLocation(target);
    let info: BookInfo;
    if (mode.create && mode.from) info = await copyBook(mode.from, nextFs, mode.create, mode.setup);
    else if (mode.create && mode.make) info = await makeBookOrUndo(nextFs, () => mode.make!(nextFs));
    else if (mode.create && mode.learn) {
      info = await makeBookOrUndo(nextFs, () => makeLearnToCook(nextFs, keysFor));
      rememberLearnToCook(target);
      // It opens at Welcome, like a recipe reopening where the writer left off.
      try {
        localStorage.setItem(lastSceneKey(target), FIRST_ITEM);
      } catch {
        // It opens without an Item; the Shelf is still there.
      }
    } else if (mode.create) info = await startBook(nextFs, mode.create, mode.template, mode.setup);
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
    noteRecipe.current();
    // A new recipe counts as edited now, so it sorts to the top of Your Recipes.
    lastEdited.current = mode.create ? Date.now() : undefined;
    const crashed = markOpen(window.localStorage, target);
    index.current?.index.close();
    index.current = null;
    setEditor(null);
    docRef.current = null;
    bodyFrom.current = null;
    setDoc(null);
    setPath(null);
    setBook(info);
    setSheet(await loadStyles(nextFs));
    setHistory(await loadHistory(nextFs));
    order.current = await loadOrder(nextFs);
    setFs(nextFs);
    setWhere(nextWhere);
    setLocation(target);
    // A template being edited stays off the list of recipes.
    if (!mode.editingTemplate) rememberBook({ location: target, title: info.title });
    editingTemplate.current = !!mode.editingTemplate;
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
    showIndex();
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
        setLibraryNew(false);
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
    setLibraryNew(false);
    setLibraryError(null);
    setAdopting(null);
  }, []);

  /** A folder for a new recipe that no other recipe uses yet. */
  const freshLocation = async (title: string, parent: BookLocation | null) => {
    const taken = new Set<string>();
    for (const b of recentBooks()) taken.add(b.location.kind === 'folder' ? baseName(b.location.path.replace(/\\/g, '/')) : b.location.name);
    const name = freeName(fileNameFor(title), (n) => taken.has(n));
    return parent ? childLocation(parent, name) : newBookLocation(name, getSettings().newBooksFolder);
  };

  const createNewBook = ({ title, builtIn, template, setup, inFolder }: NewRecipeChoice) =>
    fromLibrary(async () => {
      let parent: BookLocation | null = null;
      if (inFolder) {
        parent = await pickFolder(`Choose where to keep “${title}”`);
        if (!parent) return 'cancelled';
      }
      const target = await freshLocation(title, parent);
      await openAt(target, { create: title, template: builtIn, from: template?.location, setup });
      return 'done';
    });

  /** Copies a recipe beside the others and opens the copy. */
  const duplicateRecipe = (from: BookLocation, title: string) =>
    fromLibrary(async () => {
      const copyTitle = `${title} copy`;
      await openAt(await freshLocation(copyTitle, null), { create: copyTitle, from });
      say(`Made a copy of “${title}”.`);
      return 'done';
    });

  /** Renames a recipe in its book.json, whether it is open or not. */
  const renameRecipe = async (target: BookLocation, title: string) => {
    if (location && sameLocation(target, location)) {
      updateBook({ title });
    } else {
      const { fs: other } = await openLocation(target);
      await saveBookInfo(other, { ...(await openBook(other)), title });
    }
    updateRecent(target, { title });
  };

  /** Opens one of the writer's templates to change it, like any recipe, but kept off the list of recipes. */
  const editTemplate = (template: UserTemplate) =>
    fromLibrary(async () => {
      await openAt(template.location, { editingTemplate: true });
      say(`You’re editing the template “${template.name}”. Changes save into the template; recipes already made from it stay as they are.`);
      return 'done';
    });

  const saveAsTemplate = async (from: BookLocation, name: string, group: string, keepText: boolean) => {
    if (location && sameLocation(from, location)) await flushSave();
    return saveTemplate(from, name, group, keepText);
  };

  /** Points a recipe whose folder moved at where it is now. */
  const locateRecipe = (lost: BookLocation) =>
    fromLibrary(async () => {
      const picked = await pickFolder('Find the recipe’s folder');
      if (!picked) return 'cancelled';
      const { fs: there } = await openLocation(picked);
      if (!(await there.exists('book.json'))) throw new Error('That folder has no Cookbook recipe in it. Pick the folder that holds book.json.');
      updateRecent(lost, { location: picked });
      await openAt(picked);
      return 'done';
    });

  /** Opens Learn to Cook, or makes a fresh one if the last was deleted. */
  const learnToCook = async () => {
    const kept = learnToCookLocation();
    if (kept && (await bookExists(kept))) return openAt(kept);
    const target = await freshLocation(LEARN_TO_COOK, null);
    // One left in its folder by a Cookbook that has forgotten it is opened again rather than written over.
    if (await bookExists(target)) {
      rememberLearnToCook(target);
      return openAt(target);
    }
    return openAt(target, { create: LEARN_TO_COOK, learn: true });
  };

  useEffect(() => {
    // StrictMode runs effects twice in development; open the book only once.
    if (started.current) return;
    started.current = true;
    const last = recentBooks()[0]?.location;
    (async () => {
      // A writer's very first start opens Learn to Cook, unless an older Cookbook already made their first recipe.
      if (!last && !learnedBefore() && !(await bookExists(await defaultLocation()))) {
        try {
          await learnToCook();
          // The welcome questions come first, over Learn to Cook, which is there when they're done.
          if (!tableSetBefore()) setTable('first');
          return;
        } catch {
          // Their own first recipe opens instead.
        }
      }
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
    // A Recipe folder with no Pantry yet (its folder deleted by hand, say) shows an empty one.
    setPantryTree((await fs.exists(PANTRY)) ? await readTree(fs, PANTRY, ordered) : []);
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
    setDraftIds(await listDrafts(fs).catch(() => new Map<string, number[]>()));
  }, [fs]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree, indexVersion > 0]);

  /** The tree a path's top folder holds. */
  const treeOf = (top: string) => (top === PANTRY ? pantryTree : tree);

  const [undoLog, setUndoLog] = useState<UndoLog | null>(null);
  /** Words written each day. Kept in a store, so a save that adds to today redraws the Goals pop-up, not the whole app. */
  const [history] = useState(() => createStore<WritingHistory>(new Map()));
  const setHistory = history.set;
  /** Words in the open scene when it was last saved, to count what was written since. */
  const savedWords = useRef<number | null>(null);
  /** Set while splitting or merging, which moves words without writing any. */
  const movingWords = useRef(false);
  /** The open scene's file text as last read or written, and the newest text still waiting to be saved. */
  const savedText = useRef<string | null>(null);
  const unsaved = useRef<{ path: string; id: string; text: string; base: string } | null>(null);
  const locationRef = useRef<BookLocation | null>(null);
  locationRef.current = location;
  /** The open recipe is one of the writer's templates, opened to edit it. */
  const editingTemplate = useRef(false);
  /** When the open recipe was last saved. Noted in Your Recipes only when the window opens or the recipe closes, never per save. */
  const lastEdited = useRef<number | undefined>(undefined);
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
      lastEdited.current = Date.now();
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
      if (pending && locationRef.current) {
        // The newest words are only serialised now, rather than on every keystroke.
        const scene = currentDoc();
        const text = scene && scene.id === pending.id ? serializeDocument(scene) : pending.text;
        keepRescue(window.localStorage, { location: locationRef.current, path: pending.path, text, base: pending.base });
      }
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
  }, [currentDoc, flushSave, saveIndexNow, saveUndoNow]);

  // Whether the desktop window fills the screen, for View › Full screen. It starts full screen
  // (src-tauri/tauri.conf.json), and a Mac's own Window menu or a double-click on Linux can change it too.
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const check = () => void win.isFullscreen().then((on) => !gone && setFullScreen(on), () => {});
      check();
      const unlisten = await win.onResized(check);
      if (gone) unlisten();
      else stop = unlisten;
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  const toggleFullScreen = useCallback(() => {
    if (!isTauri()) return;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const on = !(await win.isFullscreen());
      await win.setFullscreen(on);
      setFullScreen(on);
    });
  }, []);

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

  /**
   * Saves the open Item a moment after the last change. `next` is the Item with a change
   * made outside the editor; without it, the editor's text changed, and is only serialised
   * when the save runs.
   */
  const scheduleSave = (next?: CookbookDocument) => {
    if (!fs || !path) return;
    const target = path;
    if (next) {
      docRef.current = next;
      bodyFrom.current = null;
    }
    const scene = docRef.current;
    if (!scene) return;
    const current = index.current;
    // Until the save runs, a closing tab rescues the last text that was serialised.
    const known = next ? serializeDocument(next) : unsaved.current?.id === scene.id ? unsaved.current.text : (savedText.current ?? '');
    unsaved.current = { path: target, id: scene.id, text: known, base: savedText.current ?? known };
    setDirty(true);
    pendingSave.current = async () => {
      const latest = currentDoc();
      const next = latest && latest.id === scene.id ? latest : scene;
      // Serialised and turned into plain text once each: the file, the index and the word count share them.
      const text = serializeDocument(next);
      await fs.writeText(target, text);
      savedText.current = text;
      const indexed = toIndexed(target, next, '');
      // Count words written, unless the change only moved words between scenes.
      changedSinceBackup.current = true;
      const words = indexed.words;
      const pasted = pastedWords.current;
      pastedWords.current = 0;
      if (!movingWords.current && savedWords.current !== null) {
        let delta = words - savedWords.current;
        // Pasting a chapter in isn't writing it, unless the book counts pasted words.
        if (delta > 0 && !bookRef.current?.countPasted) delta -= Math.min(delta, pasted);
        const updated = recordWords(history.get(), delta);
        if (updated !== history.get()) {
          history.set(updated);
          await saveHistory(fs, updated).catch((e: unknown) => setError(friendlyError(e)));
        }
      }
      savedWords.current = words;
      if (current && current === index.current) {
        indexed.stamp = await fs.stamp(target);
        current.index.upsert(indexed);
        // Only a change to what the Shelf or Pantry shows redraws them; words alone just tell
        // the few things that read the text (Daniel, the proofreader's suggestions).
        const shown = shownOf(indexed);
        const before = shownBefore.current;
        shownBefore.current = { path: target, shown };
        if (before?.path !== target || before.shown !== shown || pinsRef.current.includes(target)) indexChanged();
        else {
          wordsBehind.current = true;
          textChanged();
        }
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
    const log = await readUndoLog(fs, opened.id);
    // Words typed while the next Item was being read still belong to the one being left.
    if (pendingSave.current) {
      await flushSave();
      await saveUndoNow();
    }
    setSideOpen(false);
    docRef.current = opened;
    bodyFrom.current = null;
    savedText.current = serializeDocument(opened);
    savedWords.current = sceneWords(opened);
    setUndoLog(log);
    setPath(p);
    setDoc(opened);
    try {
      localStorage.setItem(lastSceneKey(locationRef.current), p);
    } catch {
      // The book just opens without a scene next time.
    }
  };

  /**
   * The open Item's editor made again in another place on the page, into or out of Mise en Place:
   * it starts from the text and undo history as they are now, not as the Item was opened.
   * Read once as the editor is made, while the one it replaces is still there.
   */
  const editorTakeOver = useCallback(() => {
    const r = recorder.current;
    const now = currentDoc();
    if (!r || !now || r.id !== now.id) return null;
    // The steps the old editor hadn't written yet are written now, so they survive closing too.
    void saveUndoNow();
    return { initialBody: now.body, undoLog: r.recorder.toJSON() };
  }, [currentDoc, saveUndoNow]);

  // Leaving an Item whose saves only changed words: the Shelf catches up with its word count now.
  useEffect(() => {
    if (!wordsBehind.current) return;
    wordsBehind.current = false;
    showIndex();
  }, [path]);

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

  // A page opens at its top.
  // In Mise en Place the page stays where it is: the open Item is somewhere down it.
  useLayoutEffect(() => {
    if (!path || mise) return;
    document.querySelector('.desk')?.scrollTo({ top: 0 });
  }, [path]);

  // Opening an Item outside the Groups shown (from Search, the Pantry or the Shelf) leaves Mise en Place.
  useEffect(() => {
    if (mise && path && !inRoots(path, mise.roots)) setMise(null);
  }, [path]);
  // What is shown, as the Shelf has it now. Groups moved, renamed or put in the trash drop out; when
  // none is left, Mise en Place closes. Worked out when the Shelf or the view changes.
  const miseShown = useMemo(() => {
    if (!mise) return null;
    const nodes = mise.roots.map((r) => findNode(tree, r)).filter((n): n is TreeNode => !!n);
    const groups = nodes.filter((n) => n.kind === 'folder');
    if (groups.length === 0) return null;
    const anchor = findGroup(tree, mise.anchor) && inRoots(mise.anchor, mise.roots) ? mise.anchor : groups[0]!.path;
    const targetNode = findGroup(tree, mise.target) ?? findGroup(tree, anchor)!;
    const title = nodes.length === 1 ? groups[0]!.name : `${groups.length.toLocaleString('en')} ${groups.length === 1 ? 'group' : 'groups'}${nodes.length > groups.length ? ' and items' : ''}`;
    return { nodes, roots: nodes.map((n) => n.path), groups: new Set(groups.map((g) => g.path)), anchor, target: { path: targetNode.path, name: targetNode.name }, title };
  }, [tree, mise]);
  useEffect(() => {
    if (mise && !miseShown) setMise(null);
  }, [mise, miseShown]);

  /**
   * Shows Groups as Mise en Place, opening at the anchor Group with the open Item (if it is among
   * them) or the anchor's first Item ready to write in.
   */
  const openView = async (view: MiseView) => {
    if (!fs) return;
    const nodes = view.roots.map((r) => findNode(tree, r)).filter((n): n is TreeNode => !!n);
    if (nodes.length === 0) return;
    // Saved before the page changes, since the editor of an Item outside the Groups goes as it does.
    await flushSave();
    await saveUndoNow();
    setSideOpen(false);
    setMise(view);
    if (path && inRoots(path, view.roots)) return;
    const anchorNode = findGroup(tree, view.anchor);
    const first = (anchorNode ? miseItems(miseEntries(anchorNode))[0] : undefined) ?? miseItems(miseEntriesOf(nodes))[0];
    if (first) await select(first);
    // Empty Groups open as an empty page; the Item open before is put away.
    else closeScene();
  };
  /** Clicking a Group on the Shelf: its Items joined as one page. */
  const openGroup = (g: string) => openView({ roots: [g], anchor: g, target: g });
  /**
   * Groups picked together on the Shelf (Ctrl or ⌘-click, Shift-click, Select all) show together, in
   * Shelf order. The page stays at the Group it was showing, or the open Item's Group.
   */
  const showPicked = (picked: Set<string>) => {
    const here = path && topOf(path) === BOOKSHELF && parentOf(path) !== BOOKSHELF ? parentOf(path) : null;
    const view = viewOfPicked(picked, tree, miseShown?.anchor ?? here);
    if (view) void openView(view);
  };

  /** The first words typed into an all-empty page make the first Item, in the Group picked first. */
  const startWriting = async (made: (p: string) => void): Promise<string | null> => {
    const g = miseShown?.target.path;
    if (!fs || !g) return null;
    try {
      const p = await createDocument(fs, g, SCENE_TEMPLATES[0]!.title);
      // Before the Shelf is drawn again, which takes the empty page and its typed words away.
      made(p);
      order.current = await placeNew(fs, order.current, tree, BOOKSHELF, p, null);
      const current = index.current;
      if (current) current.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
      indexChanged();
      await refreshTree();
      await select(p);
      const groupName = baseName(g);
      say(`Started a new item in “${groupName}”.`, () => void trashPath(p));
      return p;
    } catch (e) {
      setError(`Couldn’t start a new item. ${friendlyError(e)}`);
      return null;
    }
  };

  const addScene = (template?: DocTemplate, opts?: AddOptions) => {
    // New pages go in the book of the one being written, so they land in the same chapter.
    const folder = path && path.startsWith(BOOKSHELF + '/') ? parentOf(path) : BOOKSHELF;
    return addFrom(template ?? SCENE_TEMPLATES[0]!, folder, opts);
  };

  /** A new card in the Pantry group being shown, or in the folder of the open card if it is in that group. */
  const addCard = (opts?: AddOptions) => {
    const group = joinPath(PANTRY, pantryGroup);
    const folder = path && path.startsWith(group + '/') ? parentOf(path) : group;
    return addFrom(CARD_TEMPLATES.find((t) => t.folder === pantryGroup)!, folder, opts);
  };

  /** `name` opens the new row's name box, as New group does, so the name typed next goes to it. */
  const addFrom = async (template: DocTemplate, folder: string, opts?: AddOptions) => {
    if (!fs) return;
    const p = await createFromTemplate(fs, folder, template);
    const top = topOf(p);
    if (top === BOOKSHELF || top === PANTRY) order.current = await placeNew(fs, order.current, treeOf(top), top, p, path);
    const current = index.current;
    if (current) current.index.upsert(toIndexed(p, await readDocument(fs, p), await fs.stamp(p)));
    indexChanged();
    await refreshTree();
    await select(p);
    if (opts?.name) setRenaming(p);
  };

  const next = path ? fileAfter(tree, path) : null;

  /** The open scene's snapshots dialog, with its list once read. */
  const [snapshots, setSnapshots] = useState<{ path: string; title: string; list: Snapshot[] | null } | null>(null);
  /** A copy of the open scene's text as it is now, to go back to. */
  const takeSnapshot = async (reason: string) => {
    const scene = currentDoc();
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
    const scene = currentDoc();
    if (!scene) return;
    setSnapshots({ path: p, title: scene.title, list: null });
    setSnapshots({ path: p, title: scene.title, list: await listSnapshots(fs, scene.id) });
  };
  /** Puts a snapshot's text back, after keeping the text it replaces as a snapshot too. Undo still works. */
  const rollBack = async (snapshot: Snapshot) => {
    const scene = currentDoc();
    if (!fs || !scene || !editor) return;
    await storeSnapshot(fs, scene, 'Before rolling back');
    editor.chain().focus().setMeta(UNTRACKED, true).setContent(parseMarkdown(snapshot.body), { emitUpdate: true }).run();
    setSnapshots(null);
    say(`Rolled “${scene.title}” back to ${snapshot.date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}. Undo puts it back.`);
  };

  /**
   * Which draft shows through each Item as ghost text, by Item id: a draft's number, or 0 for none.
   * Without a choice, the newest draft shows. Kept in this browser only, as a way of looking.
   */
  const [ghostPrefs, setGhostPrefs] = useState<Record<string, number>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('cookbook.ghost') ?? '{}');
      return saved && typeof saved === 'object' ? (saved as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const pickGhost = (id: string, n: number) =>
    setGhostPrefs((was) => {
      const next = { ...was, [id]: n };
      try {
        localStorage.setItem('cookbook.ghost', JSON.stringify(next));
      } catch {
        // The newest draft simply shows next time.
      }
      return next;
    });
  /** The draft showing through the open Item, if any. Only Shelf Items have drafts. */
  const ghostN = useMemo(() => {
    if (!doc || doc.kind !== 'scene') return null;
    const list = draftsOf(draftIds, doc.id);
    const pref = ghostPrefs[doc.id];
    if (pref === 0) return null;
    return pref !== undefined && list.includes(pref) ? pref : (list[list.length - 1] ?? null);
  }, [doc?.id, doc?.kind, draftIds, ghostPrefs]);
  // The ghost is read when the Item opens or another draft is picked, never as the writer types.
  useEffect(() => {
    if (!editor || !fs || !doc) return;
    if (ghostN === null) return setGhost(editor, null);
    let live = true;
    readDraft(fs, doc.id, ghostN).then(
      (d) => live && setGhost(editor, ghostParagraphs(plainText(d.body))),
      () => live && setGhost(editor, null),
    );
    return () => {
      live = false;
    };
  }, [editor, fs, doc?.id, ghostN]);

  /** Replaces the open Item's text from outside the editor's typing, as moving words: Undo still works, and nothing counts as written. */
  const replaceOpenText = async (body: string, notes: Record<string, string>) => {
    if (!editor) return;
    editor.chain().focus('start').setMeta(UNTRACKED, true).setContent(parseMarkdown(body), { emitUpdate: true }).run();
    setNotes(notes);
    movingWords.current = true;
    await flushSave().finally(() => (movingWords.current = false));
  };
  /** Gives an Item that isn't open new text, straight in its file. */
  const replaceFileText = async (p: string, item: CookbookDocument, body: string, notes: Record<string, string>) => {
    if (!fs) return;
    const { notes: _old, ...fields } = item.fields;
    const updated = { ...item, body, fields: Object.keys(notes).length > 0 ? { ...fields, notes } : fields };
    await writeDocument(fs, p, updated);
    index.current?.index.upsert(toIndexed(p, updated, await fs.stamp(p)));
    indexChanged();
  };
  /** The Item at `p` as it is now: the open one from the editor (saved first), any other from its file. */
  const itemNow = async (p: string): Promise<CookbookDocument | null> => {
    if (!fs) return null;
    if (p === path) {
      await flushSave();
      return currentDoc();
    }
    return readDocument(fs, p).catch(() => null);
  };

  /**
   * Drafts an Item: its text moves into a new draft listed under it on the Shelf, and the Item is
   * left empty, with the draft showing through as ghost text to write it again from.
   */
  const draftItem = async (p: string) => {
    const item = await itemNow(p);
    if (!fs || !item) return;
    if (!plainText(item.body).trim()) return say(`There’s nothing in “${item.title}” to draft yet.`);
    try {
      const notes = readNotes(item);
      const n = await saveDraft(fs, { id: item.id, title: item.title, body: item.body, notes });
      if (p === path) await replaceOpenText('', {});
      else {
        await replaceFileText(p, item, '', {});
        await select(p);
      }
      pickGhost(item.id, n);
      setDraftIds(await listDrafts(fs));
      say(`Drafted “${item.title}” as Draft ${n}. It shows through as ghost text while you write the Item again.`);
    } catch (e) {
      setError(`Couldn’t draft “${item.title}”. ${friendlyError(e)}`);
    }
  };

  /** Puts a draft's text back in its Item. Any text the Item has now becomes a new draft first, so nothing is lost. */
  const restoreDraft = async (p: string, n: number) => {
    const item = await itemNow(p);
    if (!fs || !item) return;
    try {
      const draft = await readDraft(fs, item.id, n);
      const keep = plainText(item.body).trim() ? await saveDraft(fs, { id: item.id, title: item.title, body: item.body, notes: readNotes(item) }) : null;
      if (p === path) await replaceOpenText(draft.body, draft.notes ?? {});
      else {
        await replaceFileText(p, item, draft.body, draft.notes ?? {});
        await select(p);
      }
      await deleteDraft(fs, item.id, n);
      pickGhost(item.id, 0);
      setDraftIds(await listDrafts(fs));
      say(`Put Draft ${n} back into “${item.title}”.${keep ? ` The text it replaced is kept as Draft ${keep}.` : ''}`);
    } catch (e) {
      setError(`Couldn’t put Draft ${n} back. ${friendlyError(e)}`);
    }
  };

  /** Deletes a draft, with Undo in the notice to bring it back. */
  const removeDraft = async (p: string, n: number) => {
    const id = cards.get(p)?.id;
    const title = cards.get(p)?.title ?? '';
    if (!fs || !id) return;
    let gone: DraftText;
    try {
      gone = await readDraft(fs, id, n);
      await deleteDraft(fs, id, n);
    } catch (e) {
      return setError(`Couldn’t delete Draft ${n}. ${friendlyError(e)}`);
    }
    setDraftIds(await listDrafts(fs));
    say(`Deleted Draft ${n} of “${title}”.`, () => void writeDraft(fs, id, title, gone).then(async () => setDraftIds(await listDrafts(fs))));
  };

  /** Shows a draft through its Item, opening the Item if it isn't open. */
  const showDraft = async (p: string, n: number) => {
    const id = cards.get(p)?.id;
    if (!id) return;
    pickGhost(id, n);
    if (p !== path) await select(p);
  };

  const draftMenu = (p: string, n: number, x: number, y: number) => {
    const id = cards.get(p)?.id;
    const showing = p === path && ghostN === n;
    showMenu(`Draft ${n}`, x, y, [
      showing
        ? { label: 'Hide ghost text', onPick: () => id && pickGhost(id, 0) }
        : { label: 'Show as ghost text', onPick: () => void showDraft(p, n) },
      { label: 'Put back in the item', onPick: () => void restoreDraft(p, n) },
      { separator: true },
      { label: 'Delete draft', onPick: () => void removeDraft(p, n) },
    ]);
  };

  /** Accepts or rejects the change at the cursor (or those in the selection), or every change on the page. */
  const settleChanges = (accept: boolean, all: boolean) => {
    const ed = editor;
    if (!ed) return;
    if (all) {
      const n = settleAll(ed.view, accept);
      say(n ? `${accept ? 'Accepted' : 'Rejected'} ${n === 1 ? 'the change' : `all ${n} changes`} on this page.` : 'There are no changes on this page.');
    } else if (!settleAt(ed.view, accept)) say('Put the cursor in a change first, or use Next change to find one.');
    ed.commands.focus();
  };
  /**
   * Accepts or rejects every change in the Recipe, Shelf and Pantry. The open Item is settled on
   * the page, so Undo takes it back; every other Item with changes gets a snapshot first, then is
   * rewritten. Run only when asked, so reading every file is fine.
   */
  const settleRecipe = async (accept: boolean) => {
    if (!fs || !book) return;
    await flushSave();
    await saveUndoNow();
    let items = 0;
    if (editor && hasChanges(editor.state.doc)) {
      settleAll(editor.view, accept);
      items++;
    }
    const verb = accept ? 'accepting' : 'rejecting';
    try {
      for (const root of [BOOKSHELF, PANTRY]) {
        for (const node of walkFiles(await readTree(fs, root, order.current))) {
          if (node.path === path || !node.path.endsWith('.md')) continue;
          const d = await readDocument(fs, node.path);
          // Most Items have none; only those that might are parsed.
          if (!/\{\.(ins|del|fmt)|change=|was="/.test(d.body)) continue;
          const json = parseMarkdown(d.body);
          if (!hasChangesJSON(json)) continue;
          await storeSnapshot(fs, d, `Before ${verb} all changes`);
          await writeDocument(fs, node.path, { ...d, body: serializeMarkdown(settledJSON(json, accept)) });
          items++;
        }
      }
    } catch (e) {
      setError(`Couldn’t finish ${verb} every change. ${friendlyError(e)}`);
    }
    // Word counts follow the rewritten Items, and Mise en Place, which draws them from what it read, reads them again.
    await reindex();
    setMiseRound((n) => n + 1);
    if (items === 0) say('There are no changes in this recipe.');
    else say(`${accept ? 'Accepted' : 'Rejected'} the changes in ${items === 1 ? 'one item' : `${items} items`}. Items other than the open one have a snapshot from just before.`);
    editor?.commands.focus();
  };
  const nextChange = (dir: 1 | -1) => {
    if (editor && !goToChange(editor.view, dir)) say('There are no changes on this page.');
  };
  /** Track changes, for the Edit menu and the page's right-click menu. */
  const trackItems = (ed: Editor | null): MenuItem[] => {
    const any = !!ed && hasChanges(ed.state.doc);
    const here = !!ed && changesAt(ed.state).length > 0;
    return [
      { label: 'Suggest changes', hint: keysFor('suggest'), binding: binding('suggest'), checked: !!book?.suggest, disabled: !book, onPick: toggleSuggest },
      { separator: true },
      { label: 'Next change', disabled: !any, onPick: () => nextChange(1) },
      { label: 'Previous change', disabled: !any, onPick: () => nextChange(-1) },
      { separator: true },
      { label: 'Accept change', disabled: !here, onPick: () => settleChanges(true, false) },
      { label: 'Reject change', disabled: !here, onPick: () => settleChanges(false, false) },
      { label: 'Accept all on this page', disabled: !any, onPick: () => settleChanges(true, true) },
      { label: 'Reject all on this page', disabled: !any, onPick: () => settleChanges(false, true) },
      { separator: true },
      { label: 'Accept all in the recipe', disabled: !book, onPick: () => void settleRecipe(true) },
      { label: 'Reject all in the recipe', disabled: !book, onPick: () => void settleRecipe(false) },
    ];
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
    const scene = currentDoc();
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
    const scene = currentDoc();
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
    bodyFrom.current = null;
    setDoc(null);
    setPath(null);
  };

  /** Moves a scene, card or folder to the trash, with an Undo. */
  const trashPath = (p: string) => trashPaths([p]);
  /** Moves several to the trash at once, with one Undo that puts them all back. */
  const trashPaths = async (paths: string[]) => {
    const list = topmost(paths).filter((p) => !PANTRY_FOLDERS.has(p));
    if (!fs || list.length === 0) return;
    await flushSave();
    await saveUndoNow();
    const labelOf = (p: string) => cards.get(p)?.title ?? baseName(p).replace(/\.md$/, '');
    const names: string[] = [];
    let failed: unknown = null;
    for (const p of list) {
      try {
        const gone = await moveToTrash(fs, p, new Date(), order.current, await namesIn(parentOf(p)));
        order.current = gone.order;
        names.push(gone.name);
      } catch (e) {
        failed = failed ?? e;
      }
    }
    const under = (q: string) => list.some((p) => q === p || q.startsWith(p + '/'));
    if (path && under(path)) closeScene();
    if (pins.some(under)) setPins(pins.filter((q) => !under(q)));
    await reindex();
    await refreshTree();
    if (failed) setError(`Couldn’t move ${list.length === 1 ? `“${labelOf(list[0]!)}”` : 'everything'} to the trash. ${friendlyError(failed)}`);
    if (names.length > 0) say(names.length === 1 ? `Moved “${labelOf(list[0]!)}” to the trash.` : `Moved ${names.length} to the trash.`, () => void putBackAll(names));
  };

  /** Puts something from the trash back where it was. */
  const putBack = async (name: string): Promise<string | null> => (await putBackAll([name]))[0] ?? null;
  const putBackAll = async (names: string[]): Promise<string[]> => {
    if (!fs) return [];
    const back: string[] = [];
    try {
      // Last in, first out, so each goes back to the place it left.
      for (const name of [...names].reverse()) {
        const put = await restoreFromTrash(fs, name, order.current, namesIn);
        order.current = put.order;
        back.push(put.path);
      }
    } catch (e) {
      setError(`Couldn’t put that back. ${friendlyError(e)}`);
    }
    await reindex();
    await refreshTree();
    setNotice(null);
    return back;
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

  /** Plate mode: the finished book, set and served. */
  const openPlate = async () => {
    if (!fs || !book) return;
    await flushSave();
    await saveUndoNow();
    setPlateShelf(await readTree(fs, BOOKSHELF, order.current));
  };

  /** The book's own id, made and saved the first time an e-book needs one. */
  const ensureBookId = async (): Promise<string> => {
    const current = bookRef.current;
    if (current?.id) return current.id;
    const id = globalThis.crypto.randomUUID();
    updateBook({ id });
    return id;
  };

  /** The whole Bookshelf as a Word file, an e-book, Markdown, or printed (where Save as PDF lives). */
  const exportBook = async (kind: 'docx' | 'epub' | 'md' | 'print', part?: { title: string; nodes: TreeNode[] }) => {
    if (!fs || !book) return;
    await flushSave();
    try {
      // A Word file keeps suggested changes as Word's own tracked changes, for an editor to review there.
      const m = await collect(fs, part?.title ?? book.title, part?.nodes ?? (await readTree(fs, BOOKSHELF, order.current)), kind === 'docx');
      const tracked = kind === 'docx' && m.parts.some((p) => p.kind === 'scene' && hasChangesJSON(p.body));
      if (kind === 'print') return await printHtml(bookHtml(m, sheet, pageOf(book.page)));
      let id = book.id;
      if (kind === 'epub' && !id) {
        id = globalThis.crypto.randomUUID();
        const updated = { ...book, id };
        setBook(updated);
        await saveBookInfo(fs, updated);
      }
      const author = { name: getSettings().writerName.trim() || 'Cookbook', date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
      const data = kind === 'docx' ? bookDocx(m, sheet, pageOf(book.page), author) : kind === 'epub' ? bookEpub(m, sheet, id!) : bookMarkdown(m);
      const title = part?.title ?? book.title;
      if (await saveFile(fileNameFor(title), data, KINDS[kind]))
        say(`Exported “${title}” as ${kind === 'docx' ? 'a Word document' : kind === 'epub' ? 'an EPUB e-book' : 'Markdown'}.${tracked ? ' Your suggested changes are in it as Word tracked changes; accept all first for a clean copy.' : ''}`);
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
    // A zipped Scrivener project, such as one of Scrivener's backups, becomes a recipe of its own.
    const zip = files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (zip && files.length === 1) {
      const bytes = new Uint8Array(await zip.arrayBuffer());
      if (isScrivenerZip(bytes)) return importScrivenerFrom(zipSource(bytes)!);
    }
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

  /**
   * Makes a new recipe from a Scrivener project and opens it. The project is only read. The open
   * recipe is backed up first, and nothing is imported if that fails.
   */
  const importScrivenerFrom = async (source: ScrivenerSource) => {
    try {
      const { scrivx } = await findProject(source);
      const title = (scrivx.split('/').pop() ?? 'Scrivener project').replace(/\.scrivx$/i, '');
      if (fsRef.current && bookRef.current) {
        try {
          await flushSave();
          await saveUndoNow();
          await autoBackup(true);
          await refreshBackups();
        } catch (e) {
          setError(`Nothing was imported, because “${bookRef.current.title}” couldn’t be backed up first. ${e instanceof BackupCheckError ? e.message : friendlyError(e)}`);
          return;
        }
      }
      const target = await freshLocation(title, null);
      let done: Awaited<ReturnType<typeof importScrivener>> | null = null;
      await openAt(target, {
        create: title,
        make: async (nextFs) => {
          done = await importScrivener(source, nextFs, '', title);
          if (done.first) {
            try {
              localStorage.setItem(lastSceneKey(target), done.first);
            } catch {
              // It opens without an Item; the Shelf is still there.
            }
          }
          return done.info;
        },
      });
      const result = done as Awaited<ReturnType<typeof importScrivener>> | null;
      if (!result) return;
      const count = (n: number, one: string, many: string) => (n === 1 ? `one ${one}` : `${n} ${many}`);
      const also = [
        result.files > 0 && count(result.files, 'file', 'files'),
        result.notes > 0 && count(result.notes, 'note', 'notes'),
        result.snapshots > 0 && count(result.snapshots, 'snapshot', 'snapshots'),
      ].filter(Boolean);
      const brought = also.length > 0 ? ` It also brought ${also.length > 1 ? `${also.slice(0, -1).join(', ')} and ${also[also.length - 1]}` : also[0]}.` : '';
      const n = result.skipped.length;
      const missing = n === 0 ? '' : n === 1 ? ` One file (“${result.skipped[0]}”) wasn’t in the project, so only its card came.` : ` ${n} files weren’t in the project, so only their cards came.`;
      say(`Imported “${title}” from Scrivener: ${count(result.items, 'Item', 'Items')} on the Shelf and ${count(result.cards, 'card', 'cards')} in the Pantry.${brought}${missing}`);
    } catch (e) {
      setError(`Couldn’t import the Scrivener project. ${friendlyError(e)}`);
    }
  };

  const chooseScrivener = async () => {
    try {
      const picked = await pickScrivener();
      if (picked === 'files') scrivenerInput.current?.click();
      else if (picked) await importScrivenerFrom(picked);
    } catch (e) {
      setError(`Couldn’t open the Scrivener project. ${friendlyError(e)}`);
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
      setError(e instanceof BackupCheckError ? e.message : `Couldn’t back up the recipe. ${friendlyError(e)}`);
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
    // A second click on the recipe's name closes its menu.
    if (menu?.label === 'Recipe' && menu.opener === e.currentTarget) return setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      label: 'Recipe',
      opener: e.currentTarget,
      x: r.left,
      y: r.bottom + 4,
      items: [
        { label: 'Your Recipes…', onPick: () => setLibraryOpen(true) },
        { label: 'Configure this recipe…', onPick: () => openSettings('page') },
        { label: 'App Settings…', hint: keysFor('settings'), onPick: () => openSettings() },
        { separator: true },
        { label: 'Plate and serve…', onPick: () => void openPlate() },
        { label: 'Export as Word…', hint: '.docx', onPick: () => void exportBook('docx') },
        { label: 'Export as EPUB…', hint: '.epub', onPick: () => void exportBook('epub') },
        { label: 'Export as Markdown…', hint: '.md', onPick: () => void exportBook('md') },
        { label: 'Print or save as PDF…', onPick: () => void exportBook('print') },
        { separator: true },
        { label: 'Import files…', hint: '.docx .md .txt', onPick: () => chooseImport(null) },
        { label: 'Import Scrivener project…', hint: '.scriv', onPick: () => void chooseScrivener() },
        { label: 'Back up as a zip…', onPick: () => void backUp() },
        { separator: true },
        { label: 'Trash', onPick: openTrash },
      ],
    });
  };

  /**
   * Opens a menu. Given the button that opened it, a second press on that button
   * closes the menu instead of opening it again, as the Recipe button does.
   */
  const showMenu = (label: string, x: number, y: number, items: MenuItem[], opener?: HTMLElement) =>
    setMenu((open) => (opener && open?.opener === opener ? null : { label, x, y, items, opener }));

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

  // Words pasted from a menu count as pasted, as Ctrl+V's do.
  const pasteFromMenu = (ed: Editor, plain: boolean) =>
    void pasteInto(ed, plain).then((result) => {
      if (result === 'unreadable') say(`To paste, press ${keys('Mod-V')}.`);
      else if (result === 'empty') say('There are no words on the clipboard to paste.');
      else pastedWords.current += countWords(result.pasted);
    });

  /** Paragraph and character styles and Clear formatting, for the page's menu and Format. */
  const formatItems = (ed: Editor): MenuItem[] => {
    const styleId = (ed.state.selection.$from.parent.attrs.style as string | undefined) ?? 'body';
    const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => void fn(ed.chain().focus()).run();
    return [
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
      // The note's words, such as a comment brought from Scrivener, are read here.
      const said = (readNotes(currentDoc())[id] ?? '').trim();
      const lines = said.split('\n').filter(Boolean).map((l) => (l.length > 90 ? `${l.slice(0, 89)}…` : l));
      const shown = lines.length > 6 ? [...lines.slice(0, 5), '…'] : lines;
      return showMenu('Note', x, y, [
        ...shown.map((line) => ({ label: line, disabled: true, onPick: () => {} })),
        ...(said ? [{ label: 'Copy note', onPick: () => void navigator.clipboard?.writeText(said).catch(() => {}) }, { separator: true as const }] : []),
        {
          label: 'Delete note',
          danger: true,
          onPick: () => {
            removeNoteAnchor(ed, id);
            const { [id]: _gone, ...rest } = readNotes(currentDoc());
            setNotes(rest);
          },
        },
      ]);
    }

    const words = selectedWords(ed);
    const menuPaste = (plain: boolean) => pasteFromMenu(ed, plain);
    // A suggested change under the mouse is accepted or rejected from the top of the menu.
    // A reformatted word, or a paragraph whose break or style is a suggestion (the cursor goes to its start).
    const changeEl = target.closest('.cb-ins, .cb-del, .cb-fmt') ?? target.closest('.cb-prose p[data-change], .cb-prose p[data-was]');
    const changePos = changeEl ? ed.view.posAtDOM(changeEl, 0) : null;
    const onChange = (accept: boolean) => () => {
      if (changePos === null) return;
      ed.commands.setTextSelection(changePos);
      settleChanges(accept, false);
    };
    const items: MenuItem[] = [
      ...(changePos !== null
        ? [{ label: 'Accept change', onPick: onChange(true) }, { label: 'Reject change', onPick: onChange(false) }, { separator: true as const }]
        : []),
      { label: 'Cut', hint: keys('Mod-X'), disabled: ed.state.selection.empty, onPick: () => clip(ed, 'cut') },
      { label: 'Copy', hint: keys('Mod-C'), disabled: ed.state.selection.empty, onPick: () => clip(ed, 'copy') },
      { label: 'Paste', hint: keys('Mod-V'), onPick: () => menuPaste(getSettings().pastePlain) },
      { label: 'Paste as plain text', hint: keys('Mod-Shift-V'), onPick: () => menuPaste(true) },
      { separator: true },
      ...formatItems(ed),
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
      { label: 'Oven Mode', hint: keysFor('focus'), checked: settings.focus, onPick: toggleFocus },
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
    setOvenSide(true);
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
      { label: 'Expand all', onPick: () => setFolding({ open: true, at: Date.now() }) },
      { label: 'Collapse all', onPick: () => setFolding({ open: false, at: Date.now() }) },
      { separator: true },
      { label: 'Select all', hint: keys('Mod-A'), disabled: tree.length === 0, onPick: () => onShelfMark(new Set(allPaths(tree)), true) },
      { label: 'Deselect all', disabled: shelfMarked.size === 0, onPick: () => setShelfMarked(new Set()) },
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
    if (top === BOOKSHELF || top === PANTRY) {
      const [marks, setMarks] = top === PANTRY ? [pantryMarked, setPantryMarked] : [shelfMarked, setShelfMarked];
      // A right-click on one of several picked rows is about all of them; on any other row it picks that row.
      if (marks.has(p) && marks.size > 1) return pickedMenu([...marks], top, x, y);
      if (!marks.has(p)) setMarks(new Set([p]));
    }
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
        ...(onShelf ? [{ label: 'Show as one page', onPick: () => void openGroup(p) }, { separator: true as const }] : []),
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
        ...(onShelf ? [{ label: 'Export group', items: exportItems(p) }] : []),
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
      { label: 'Draft this item', onPick: () => void draftItem(p) },
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

  /** Moves several Groups and Items to the end of `folder`, in the order they are shown. */
  const moveMany = async (paths: string[], folder: string) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    const top = topOf(folder);
    try {
      for (const p of topmost(paths)) {
        const fresh = await readTree(fs, top, ORDERED(order.current));
        const moved = await moveItem(fs, order.current, fresh, top, p, folder, childrenOf(fresh, top, folder).length);
        order.current = moved.order;
        followMove(p, moved.path);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
    await refreshTree();
  };

  /** The right-click menu for several picked rows at once. */
  const pickedMenu = (paths: string[], top: string, x: number, y: number) => {
    const list = topmost(paths);
    const files = paths.filter((p) => p.endsWith('.md'));
    const items = files.filter((p) => cards.get(p)?.kind === 'scene');
    const setMarks = top === PANTRY ? setPantryMarked : setShelfMarked;
    const inside = (f: string) => list.some((p) => f === p || f.startsWith(p + '/'));
    const targets: MenuItem[] = [];
    // Picked Groups can be shown together as one page.
    const together = top === BOOKSHELF ? viewOfPicked(paths, tree, miseShown?.anchor ?? null) : null;
    if (top === BOOKSHELF) targets.push({ label: 'Top of the Shelf', onPick: () => void moveMany(list, top) });
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind !== 'folder' || inside(n.path)) continue;
        targets.push({ label: `${' '.repeat(depth)}${PANTRY_FOLDERS.get(n.path) ?? n.name}`, onPick: () => void moveMany(list, n.path) });
        walk(n.children ?? [], depth + 1);
      }
    };
    walk(top === PANTRY ? pantryNodes : tree, 0);
    const each = (key: string, value: unknown) => () => void Promise.all(files.map((p) => setFieldOf(p, key, value)));
    showMenu('Picked', x, y, [
      { heading: `${paths.length} picked` },
      ...(together ? [{ label: 'Show together as one page', onPick: () => void openView(together) }] : []),
      { label: 'Move to', items: targets.length > 0 ? targets : [{ label: 'No other groups', onPick: () => {}, disabled: true }] },
      {
        label: 'Label',
        disabled: files.length === 0,
        items: [{ label: 'None', onPick: each('label', undefined) }, ...LABELS.map((l) => ({ label: l.name, onPick: each('label', l.id) }))],
      },
      ...(top === BOOKSHELF
        ? [
            {
              label: 'Status',
              disabled: items.length === 0,
              items: STATUSES.map((st) => ({ label: st.label, icon: <StatusIcon status={st.id} decorative />, onPick: () => void Promise.all(items.map((p) => setFieldOf(p, 'status', st.id === 'not-started' ? undefined : st.id))) })),
            },
          ]
        : []),
      { separator: true },
      { label: 'Select all', hint: keys('Mod-A'), onPick: () => setMarks(new Set(allPaths(top === PANTRY ? pantryNodes : tree))) },
      { label: 'Deselect all', hint: 'Esc', onPick: () => setMarks(new Set()) },
      { separator: true },
      { label: `Move ${list.length} to trash`, hint: 'Delete', danger: true, onPick: () => void trashPaths(list) },
    ]);
  };

  /** Delete on a picked row takes every picked row with it. */
  const trashFromTree = (p: string) => {
    const marks = topOf(p) === PANTRY ? pantryMarked : shelfMarked;
    return void (marks.has(p) && marks.size > 1 ? trashPaths([...marks]) : trashPath(p));
  };

  /** A new Item or card goes in the picked Group, if one Group is picked, or where it would anyway. */
  const pickedGroup = (marks: Set<string>, nodes: TreeNode[]): string | null => {
    if (marks.size !== 1) return null;
    const only = [...marks][0]!;
    return allPaths(nodes).includes(only) && !only.endsWith('.md') ? only : null;
  };
  const shelfBar = () => {
    const all = allPaths(tree);
    const everything = all.length > 0 && shelfMarked.size === all.length;
    const group = pickedGroup(shelfMarked, tree);
    return (
      <PanelBar
        label="Shelf tools"
        status={shelfMarked.size > 1 ? `${shelfMarked.size} picked` : undefined}
        buttons={[
          { label: everything ? 'Deselect all' : 'Select all', icon: BAR_ICONS.selectAll, pressed: everything, disabled: all.length === 0, onClick: () => (everything ? setShelfMarked(new Set()) : onShelfMark(new Set(all), true)) },
          { label: 'New group', icon: BAR_ICONS.newGroup, onClick: () => void (group ? addFolderIn(group) : addFolder()) },
          { label: 'New item', icon: BAR_ICONS.newItem, onClick: () => void (group ? addFrom(SCENE_TEMPLATES[0]!, group, NAME_IT) : addScene(undefined, NAME_IT)) },
          { label: shelfMarked.size > 1 ? `Delete ${shelfMarked.size} picked` : 'Delete picked', icon: BAR_ICONS.trash, danger: true, end: true, disabled: shelfMarked.size === 0, onClick: () => void trashPaths([...shelfMarked]) },
        ]}
      />
    );
  };
  const pantryBar = () => {
    const all = allPaths(pantryNodes);
    const everything = all.length > 0 && pantryMarked.size === all.length;
    const group = pickedGroup(pantryMarked, pantryNodes);
    const template = CARD_TEMPLATES.find((t) => t.folder === pantryGroup)!;
    return (
      <PanelBar
        label="Pantry tools"
        status={pantryMarked.size > 1 ? `${pantryMarked.size} picked` : undefined}
        buttons={[
          { label: everything ? 'Deselect all' : 'Select all', icon: BAR_ICONS.selectAll, pressed: everything, disabled: all.length === 0, onClick: () => setPantryMarked(everything ? new Set() : new Set(all)) },
          { label: 'New group', icon: BAR_ICONS.newGroup, onClick: () => void addFolderIn(group ?? joinPath(PANTRY, pantryGroup)) },
          { label: `New ${template.name.toLowerCase()}`, icon: BAR_ICONS.newItem, onClick: () => void (group ? addFrom(template, group, NAME_IT) : addCard(NAME_IT)) },
          { label: pantryMarked.size > 1 ? `Delete ${pantryMarked.size} picked` : 'Delete picked', icon: BAR_ICONS.trash, danger: true, end: true, disabled: pantryMarked.size === 0, onClick: () => void trashPaths([...pantryMarked]) },
        ]}
      />
    );
  };

  /** Right-click on the empty part of the Pantry. */
  const pantryMenu = (x: number, y: number) => {
    const template = CARD_TEMPLATES.find((t) => t.folder === pantryGroup)!;
    const here = joinPath(PANTRY, pantryGroup);
    showMenu('Pantry', x, y, [
      { label: `New ${template.name.toLowerCase()}`, onPick: () => void addFrom(template, here) },
      { label: 'New group', onPick: () => void addFolderIn(here) },
      { separator: true },
      { label: 'Select all', hint: keys('Mod-A'), disabled: pantryNodes.length === 0, onPick: () => setPantryMarked(new Set(allPaths(pantryNodes))) },
      { label: 'Deselect all', disabled: pantryMarked.size === 0, onPick: () => setPantryMarked(new Set()) },
      { separator: true },
      { label: 'Expand all', onPick: () => setFolding({ open: true, under: here, at: Date.now() }) },
      { label: 'Collapse all', onPick: () => setFolding({ open: false, under: here, at: Date.now() }) },
      { separator: true },
      { heading: 'Show' },
      ...PANTRY_SECTIONS.map((sct) => ({ label: SECTION_LABEL[sct], checked: sct === pantryGroup, onPick: () => setPantryGroup(sct) })),
    ]);
  };

  /** A recipe for a page: a source or note to guide work on it, listed under the page and opened to write. */
  const addRecipe = async (page: string) => {
    if (!fs) return;
    await flushSave();
    try {
      const target = page === path && currentDoc() ? currentDoc()! : await readDocument(fs, page);
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
      const base = currentDoc() ?? doc;
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

  /** An Item's page in Mise en Place. */
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
  };

  const moveInTree = async (from: string, folder: string, at: number) => {
    if (!fs) return;
    await flushSave();
    await saveUndoNow();
    try {
      const moved = await moveItem(fs, order.current, treeOf(topOf(from)), topOf(from), from, folder, at);
      order.current = moved.order;
      followMove(from, moved.path);
      await refreshTree();
      return moved.path;
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

  /** Settles with the row's path afterwards, so the Shelf can put the keyboard back on it. */
  const renameInTree = async (from: string, title: string | null): Promise<string> => {
    setRenaming(null);
    if (!fs || title === null) return from;
    if (from.endsWith('.md')) {
      await retitle(from, title).catch((e: unknown) => setError(friendlyError(e)));
      return from;
    }
    await flushSave();
    await saveUndoNow();
    let landed = from;
    try {
      const renamed = await renameFolder(fs, order.current, treeOf(topOf(from)), topOf(from), from, title);
      order.current = renamed.order;
      followMove(from, renamed.path);
      landed = renamed.path;
    } catch (e) {
      setError(friendlyError(e));
    }
    await refreshTree();
    return landed;
  };

  const setCardField = (key: string, value: unknown) => {
    const base = currentDoc() ?? doc;
    if (!base) return;
    const updated = withField(base, key, value);
    setDoc(updated);
    scheduleSave(updated);
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
    const base = currentDoc() ?? doc;
    if (!base) return;
    const { notes: _old, ...fields } = base.fields;
    const updated = { ...base, fields: Object.keys(next).length > 0 ? { ...fields, notes: next } : fields };
    setDoc(updated);
    scheduleSave(updated);
  };

  /** A footnote added or clicked in the text is edited at the foot of the page. */
  const showFootnote = (request: SeasoningsRequest) => editFootnote(request.index);

  /** The seasonings picked for this work, and which of their Checks are off. */
  const seas = book?.seasonings;
  const chosen = useMemo(() => (seas?.chosen ?? []).filter(isSeasoning), [seas?.chosen]);
  const setSeasonings = (changes: Partial<NonNullable<BookInfo['seasonings']>>) => {
    const current = bookRef.current?.seasonings ?? { chosen: [], tracked: [], gone: [] };
    updateBook({ seasonings: { ...current, ...changes } });
  };
  // indexVersion changes whenever the index does, so results stay fresh while the writer types a query.
  // Cards are read from the index, so they follow it like search does.
  const cards = useMemo(() => index.current?.index.cards() ?? new Map(), [indexVersion]);
  /** The drafts listed under each Shelf Item, by its path. Worked out when the Shelf or the drafts change, not as the writer types. */
  const draftRows = useMemo(() => {
    const rows = new Map<string, number[]>();
    if (draftIds.size === 0) return rows;
    for (const [p, c] of cards as Map<string, CardSummary>) {
      const list = c.kind === 'scene' ? draftsOf(draftIds, c.id) : [];
      if (list.length > 0) rows.set(p, list);
    }
    return rows;
  }, [cards, draftIds]);
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
    const base = currentDoc() ?? doc;
    if (!fs || !base) return;
    try {
      const { data, type } = await shrinkPicture(file);
      setCardField('portrait', await savePicture(fs, base.title, data, type));
    } catch (e) {
      setError(`Couldn’t add that picture: ${friendlyError(e)}`);
    }
  };
  // Linked names follow the index, but only change when a name does, not on every save.
  const namedKey = useMemo(
    () =>
      JSON.stringify(
        [...cards]
          .filter(([, c]) => c.kind === 'character' || c.kind === 'setting')
          .map(([p, c]) => ({ id: c.id, path: p, title: c.title, kind: c.kind, aka: c.aka }) as NamedCard),
      ),
    [cards],
  );
  const namedCards = useMemo(() => JSON.parse(namedKey) as NamedCard[], [namedKey]);
  const matcher = useMemo(() => nameMatcher(namedCards), [namedCards]);
  useEffect(() => {
    if (editor) setNameMatcher(editor, matcher);
  }, [editor, matcher]);
  const storyNames = useMemo(() => namedCards.flatMap((c) => [c.title, ...c.aka]), [namedCards]);
  // Through updateBook, so a change made a moment before isn't written back over with the old settings.
  const onDialect = useCallback((dialect: Dialect) => updateBook({ dialect }), [fs, book]);
  const onOff = useCallback((proofreadOff: string[]) => updateBook({ proofreadOff }), [fs, book]);
  // Switched off, every seasoning rests and nothing is marked on the page.
  const paused = !!seas?.paused;
  const resting = useMemo(() => rulesOff(paused ? [] : chosen), [chosen, paused]);
  const bookTexts = useCallback(() => index.current?.index.pageTexts() ?? [], []);
  // A seasoning's Check, switched off, takes its underlines off the page; Daniel's Check is the narration dimming, kept on the page itself.
  const unchecked = useMemo(() => (seas?.unchecked ?? []).filter(isSeasoning), [seas?.unchecked]);
  // The checks keep running with Seasonings closed; see needsReview for when grammar and style are left out.
  const review = !!doc && needsReview(chosen, unchecked, paused, seasoningsOpen);
  const proof = useProofreader({ fs, dialect: book?.dialect ?? dialectOf(settings.english === 'auto' ? systemEnglish() : settings.english), onDialect, off: book?.proofreadOff, resting, onOff, editor, docId: doc?.id ?? null, names: storyNames, review, bookTexts, bookVersion: textCount, onError: setError });
  const uncheckedKinds = unchecked.flatMap((id) => KIND_OF[id] ?? []).join(' ');
  // Every Check is one setting for the whole Recipe, put on each editor as it is made, so every Item,
  // Mise en Place and split view show the same. Daniel dims only while he is picked and not paused.
  const drunk = !!seas?.drunk && !paused && chosen.includes('daniel');
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setChecksOff(editor, uncheckedKinds ? uncheckedKinds.split(' ') : []);
    setDialogueFocus(editor, drunk);
  }, [editor, uncheckedKinds, drunk, doc?.id]);

  // A seasoning's report on the open Item. It is worked out once, when asked for, and kept in the
  // Pantry's Research under Seasoning Reports, named after the seasoning and the time.
  const [report, setReport] = useState<{ report: Report; item: string; saved: string | null } | null>(null);
  useEffect(() => setReport(null), [doc?.id]);
  const saveReport = async (built: Report, item: string, when: Date): Promise<string> => {
    if (!fs) throw new Error('No recipe is open.');
    const folder = joinPath(joinPath(PANTRY, 'research'), REPORT_GROUP);
    const fresh = !(await fs.exists(folder));
    if (fresh) await fs.makeFolder(folder);
    // A second report from the same seasoning in the same minute is numbered, so the two can be told apart.
    let title = reportName(built.id, when);
    for (let n = 2; await fs.exists(joinPath(folder, `${fileNameFor(title)}.md`)); n++) title = `${reportName(built.id, when)} (${n})`;
    const p = await createDocument(fs, folder, title, SECTION_KIND.research);
    const saved: CookbookDocument = { ...(await readDocument(fs, p)), body: reportMarkdown(built, item, when) };
    await writeDocument(fs, p, saved);
    // The Group goes at the end of Research, and each report at the end of the Group, so they read oldest first.
    const pantry = await readTree(fs, PANTRY, ORDERED(order.current));
    if (fresh) order.current = await placeNew(fs, order.current, pantry, PANTRY, folder, null);
    order.current = await placeNew(fs, order.current, pantry, PANTRY, p, null);
    // Only the new card is indexed, rather than checking every file in the Recipe again.
    const current = index.current;
    if (current && current.fs === fs) {
      current.index.upsert(toIndexed(p, saved, await fs.stamp(p)));
      indexChanged();
    }
    setPantryTree(await readTree(fs, PANTRY, ORDERED(order.current)));
    return baseName(p).replace(/\.md$/, '');
  };
  const openReport = (id: SeasoningId) => {
    if (!editor || !doc) return;
    const when = new Date();
    const build = REPORTS[id];
    if (!build) return;
    // A new seed each time, so the same page reported twice still gets fresh words.
    const built = build({ doc: editor.state.doc, issues: issuesOf(editor.state), names: nameMatcherOf(editor.state), seed: Math.floor(Math.random() * 2 ** 31) });
    const item = doc.title;
    setReport({ report: built, item, saved: null });
    saveReport(built, item, when).then(
      (name) => setReport((r) => (r?.report === built ? { ...r, saved: name } : r)),
      (e: unknown) => setError(`Couldn’t save the ${built.title}: ${friendlyError(e)}`),
    );
  };
  const castIds = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? castIn(editor.state).map((c) => c.id).join('\n') : ''),
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
    // In the order the scenes come on the Shelf.
    const at = new Map([...walkFiles(tree)].map((f, i) => [f.path, i]));
    setAppearsIn(mentions.sort((a, b) => (at.get(a.path) ?? Infinity) - (at.get(b.path) ?? Infinity)));
  }, [fs, doc?.id, doc?.kind, indexVersion, matcher, tree]); // the card's own edits show once saved
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
  /**
   * Puts the keyboard in a part of the window, opening it first if it's closed (or hidden by
   * Oven Mode). The page keeps its cursor where it was; a list lands on its current row.
   */
  const goToArea = (area: Area) => {
    if (area === 'page') {
      // An empty Group in Mise en Place has a blank page to type on instead of an editor.
      const blank = editor ? null : document.querySelector<HTMLElement>('.mise-blank');
      if (!editor && !blank) return;
      setSideOpen(false);
      setOvenSide(false);
      if (editor) editor.commands.focus();
      else blank!.focus();
      return;
    }
    if (area === 'seasonings' && !doc) return say('Seasonings needs an open item.');
    // Oven Mode keeps its quiet: the Shelf and panels slide in over the page. Only the toolbar needs Stove Mode.
    const oven = getSettings().focus;
    if (oven && area === 'toolbar') setSettings({ focus: false });
    if (area === 'pantry' && panel !== 'pantry') setPanel('pantry');
    if (area === 'seasonings' && panel !== 'seasonings') setPanel('seasonings');
    if (oven && area !== 'toolbar') {
      setSideOpen(area === 'shelf');
      setOvenSide(area !== 'shelf');
    }
    // On a narrow window the Shelf slides in.
    if (area === 'shelf' && !oven && !areaShown('shelf')) setSideOpen(true);
    // There, only one side panel shows at a time.
    if (!oven && narrowWindow()) {
      if (area === 'shelf') setPanel(null);
      if (area === 'pantry' || area === 'seasonings') setSideOpen(false);
    }
    // After React has drawn what was just opened.
    requestAnimationFrame(() => {
      const root = areaRoot(area);
      const target = root && landingIn(root);
      target?.focus();
    });
  };
  /** F7 and Shift+F7: the next or previous issue in the page, with its card open. */
  const [issueRequest, setIssueRequest] = useState<{ issue: FoundIssue; at: number } | null>(null);
  const goToIssue = (dir: 1 | -1) => {
    if (!editor || !doc) return;
    const found = stepIssue(editor.state, dir);
    if (found) setIssueRequest({ issue: found, at: Date.now() });
    // Grammar and style are only checked while Seasonings is open, so this may be spelling alone.
    else say('Nothing underlined in this item.');
  };
  /** Mod+Page Up and Mod+Page Down: the item before or after this one, in Shelf (or Pantry) order. */
  const stepItem = (dir: 1 | -1) => {
    if (!path) return;
    const files: string[] = [];
    const walk = (list: TreeNode[]) => list.forEach((n) => (n.kind === 'file' ? files.push(n.path) : walk(n.children ?? [])));
    walk(treeOf(topOf(path)));
    const to = files[files.indexOf(path) + dir];
    if (!to) return;
    // The next page's editor takes the keyboard as soon as it's ready, so writing can carry on.
    focusNextPage.current = 'start';
    void select(to);
  };
  /**
   * Mod+Shift+G: between the open Item on its own page and its whole Group as one page (Mise en
   * Place), with the cursor kept where it is. The same editor is made again in its new place.
   */
  const toggleMise = () => {
    const keep = () => {
      if (!editor || !doc) return;
      const { from, to } = editor.state.selection;
      focusNextPage.current = { id: doc.id, from, to, focus: editor.isFocused };
    };
    if (miseShown) {
      if (!path || !inRoots(path, miseShown.roots)) return;
      keep();
      return setMise(null);
    }
    if (!path || topOf(path) !== BOOKSHELF) return say('Mise en Place shows a group from the Shelf.');
    const g = parentOf(path);
    if (g === BOOKSHELF) return say('This item isn’t in a group, so there is nothing to show with it.');
    keep();
    void openGroup(g);
  };
  /** Whether the open Item could be shown with its whole Group, or is being. */
  const canMise = !!miseShown || (!!path && topOf(path) === BOOKSHELF && parentOf(path) !== BOOKSHELF);
  /** Where the next editor to appear takes the keyboard: at the top of a new item, or where its cursor already is. */
  const focusNextPage = useRef<false | 'start' | 'here' | KeptCaret>(false);
  useEffect(() => {
    if (!editor || !focusNextPage.current) return;
    const at = focusNextPage.current;
    focusNextPage.current = false;
    if (typeof at === 'object') {
      // The same Item's editor made again elsewhere on the page: the cursor goes back where it was.
      if (docRef.current?.id !== at.id) return;
      const size = editor.state.doc.content.size;
      const clamp = (n: number) => Math.max(0, Math.min(n, size));
      try {
        editor.commands.setTextSelection({ from: clamp(at.from), to: clamp(at.to) });
      } catch {
        // A place that no longer exists: the cursor stays at the start.
      }
      if (at.focus) editor.commands.focus(undefined, { scrollIntoView: true });
      else editor.commands.scrollIntoView();
      return;
    }
    // Unless something else (a menu, a box) has taken the keyboard meanwhile.
    if (at === 'here' && document.activeElement && document.activeElement !== document.body) return;
    editor.commands.focus(at === 'start' ? 'start' : undefined);
  }, [editor]);
  /** F6 and Shift+F6: round the parts of the window that are on screen. */
  const cycleArea = (dir: 1 | -1) => {
    const go = () => {
      const from = areaOf(document.activeElement);
      // In Oven Mode the Shelf and panels wait off screen, so F6 slides each in as it gets there.
      const oven = getSettings().focus;
      const shown = (a: Area) => {
        if (a === 'page') return (!!editor && !!doc) || !!document.querySelector('.mise-blank');
        if (!oven) return areaShown(a);
        return a === 'shelf' || (a === 'pantry' && (panel === 'pantry' || panel === null)) || (a === 'seasonings' && !!doc && panel === 'seasonings');
      };
      const to = nextArea(from, dir, shown);
      if (to) goToArea(to);
    };
    go();
  };
  /** The app's own shortcuts (Settings › Keyboard shortcuts); the page's are in the editor. */
  const onAppKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onAppKey.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && !settingsAt) {
      // Escape in the Shelf or a panel goes back to the page, unless a box or menu there wanted it.
      const at = document.activeElement;
      const area = areaOf(at);
      if (area && area !== 'page' && area !== 'toolbar' && !(at instanceof Element && at.closest('input, textarea, select, .menu, [role="dialog"]'))) {
        e.preventDefault();
        goToArea('page');
      }
      return;
    }
    const id = commandFor(e, ['palette', 'switcher', 'shelf', 'seasonings', 'focus', 'newScene', 'settings', 'save', 'nextArea', 'prevArea', ...Object.keys(AREA_SHORTCUTS), 'nextIssue', 'prevIssue', 'prevItem', 'nextItem', 'mise', 'fullscreen', 'manual', 'suggest', 'suggestAlt']);
    if (id === 'save') {
      // Writers press it out of habit: it only saves what is waiting (not the index or undo history,
      // which are whole-file writes), and it never opens the browser's Save page dialog.
      e.preventDefault();
      void flushSave().then(() => !pendingSave.current && say('Saved.'));
      return;
    }
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
      if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || !book) return;
      const dir = e.key === '=' || e.key === '+' ? 1 : e.key === '-' ? -1 : null;
      if (dir === null && e.key !== '0') return;
      e.preventDefault();
      if (dir === null) updateBook({ page: { ...pageOf(book.page), zoom: 100 } });
      else zoomPage.current(dir);
      return;
    }
    e.preventDefault();
    if (id === 'palette') setPalette({ scenesOnly: false, at: Date.now() });
    else if (id === 'manual') setManualAt((m) => (m ? null : { chapter: '', at: Date.now() }));
    else if (id === 'switcher') setPalette({ scenesOnly: true, at: Date.now() });
    else if (id === 'shelf') setShelf({ at: null });
    else if (id === 'seasonings') doc && togglePanel('seasonings');
    else if (id === 'focus') toggleFocus();
    else if (id === 'newScene') void addScene();
    else if (id === 'settings') openSettings();
    else if (id === 'nextArea' || id === 'prevArea') cycleArea(id === 'nextArea' ? 1 : -1);
    else if (AREA_SHORTCUTS[id]) goToArea(AREA_SHORTCUTS[id]!);
    else if (id === 'nextIssue' || id === 'prevIssue') goToIssue(id === 'nextIssue' ? 1 : -1);
    else if (id === 'prevItem' || id === 'nextItem') stepItem(id === 'nextItem' ? 1 : -1);
    else if (id === 'mise') toggleMise();
    else if (id === 'suggest' || id === 'suggestAlt') toggleSuggest();
    else if (id === 'fullscreen') toggleFullScreen();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onAppKey.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /** The text that Home, End and the page keys go to from outside it (see scrollKeys). */
  const keysPage = useRef<EditorView | null>(null);
  keysPage.current = editor && !editor.isDestroyed && doc ? editor.view : null;
  useEffect(() => {
    // Caught on the way down, before the Shelf or a list can take them for itself.
    const onKey = (e: KeyboardEvent) => void pageKeyAnywhere(e, keysPage.current, desk.current);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  /** Zooms the open page one step in or out, from what Fit width works out to when it's on. */
  const zoomPage = useRef<(dir: 1 | -1) => void>(() => {});
  const zoomOk = useRef(false);
  zoomOk.current = !!book && !settingsAt;
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
    say(focus ? `Oven Mode. ${keysFor('focus')} or Escape goes back to Stove Mode.` : 'Stove Mode.');
  };
  useEffect(() => {
    // Escape leaves Oven Mode (focus mode) for Stove Mode, unless something else (a menu, Search) wanted it first.
    if (!settings.focus) return;
    const onKey = (e: KeyboardEvent) => {
      // ProseMirror marks every Escape on the page as handled, so that one doesn't count.
      const handled = e.defaultPrevented && !(e.target instanceof Element && e.target.closest('.ProseMirror'));
      if (e.key !== 'Escape' || handled || document.querySelector('.menu, .shelf, .settings, .palette, .goals-pop, .issue-card')) return;
      // A panel slid in over the page goes first; the next Escape leaves Oven Mode.
      if (sideOpen || ovenSide) {
        setSideOpen(false);
        setOvenSide(false);
        return;
      }
      setSettings({ focus: false });
      say('Stove Mode.');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.focus, sideOpen, ovenSide]);
  useEffect(() => {
    // Oven Mode starts with everything tucked away, and Stove Mode has its own columns.
    setSideOpen(false);
    setOvenSide(false);
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
  const cardKind = doc?.kind ?? null;
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
      item('name', 'Name from the Pantry', 'Insert', 'pantry character setting place @ name', () => setShelf({ at: null }), keysFor('shelf')),
      ...sheet.paragraph.map((p) => item(`style-${p.id}`, p.name, 'Style', 'style paragraph heading', () => void editor.chain().focus().updateAttributes('paragraph', { style: p.id }).run(), 'Style')),
      // On a character or place page, the brainstorming cards the + offers, so they can be added without the mouse.
      ...(isBrainstormKind(cardKind)
        ? BRAINSTORM_GROUPS.flatMap((g) => {
            const add = (cards: BrainstormCard[]) => () => {
              const line = emptyLineAt(editor, cardKind);
              if (line === null) say('Brainstorming cards go on an empty line of their own.');
              else insertBrainstorm(editor, line, cards);
            };
            const list = g.cards[cardKind];
            return [
              ...(g.addsAll ? [item(`bs-${g.id}`, `All of ${g.title}`, 'Brainstorm', `brainstorm card ${g.title}`, add(list), `${list.length} cards`)] : []),
              ...list.map((c) => item(`bs-${g.id}-${c.id}`, c.title, 'Brainstorm', `brainstorm card ${g.title}`, add([c]), g.title)),
            ];
          })
        : []),
    ];
  }, [editor, sheet, settings.shortcuts, settings.shortcutStyle, cardKind]);
  const drawerOpen = (seasoningsOpen && !!doc) || panel === 'pantry' || pins.length > 0;
  // What the Pantry and Seasonings buttons show as on: in Oven Mode, only a panel slid in counts.
  const pantryShown = panel === 'pantry' && (!settings.focus || ovenSide);
  /** In Oven Mode a slid-in panel slides away once the pointer leaves it; the keyboard goes back to the page if it was in there. */
  const tuckAway = () => {
    if (areaOf(document.activeElement) && areaOf(document.activeElement) !== 'page') goToArea('page');
    setSideOpen(false);
    setOvenSide(false);
  };
  const shelfAway = useSlideAway(settings.focus && sideOpen, tuckAway);
  const sideAway = useSlideAway(settings.focus && ovenSide, tuckAway);
  const seasoningsShown = seasoningsOpen && (!settings.focus || ovenSide);
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
    // The Shelf's Groups too, each opening as one page. Walked only as the palette opens.
    const groups: PaletteItem[] = [];
    const walk = (list: TreeNode[]) =>
      list.forEach((n) => {
        if (n.kind !== 'folder') return;
        const above = parentOf(n.path) === BOOKSHELF ? '' : ` · ${baseName(parentOf(n.path))}`;
        groups.push({ id: `group:${n.path}`, label: n.name, hint: `Group, as one page${above}`, group: scenesOnly ? 'Go to' : 'Shelf', words: 'group mise en place', run: () => void openGroup(n.path) });
        walk(n.children ?? []);
      });
    walk(tree);
    places.push(...groups);
    if (scenesOnly) return places;
    const cmd = (id: string, label: string, run: () => void, group = 'Actions', hint?: string, words?: string): PaletteItem => ({ id, label, run, group, hint, words });
    const sections: [SettingsSection, string, string][] = [
      ['general', 'General', 'reopen startup shortcuts mac ctrl'],
      ['appearance', 'Appearance', 'theme dark light sepia size motion'],
      ['writing', 'Writing', 'quotes dash markdown drop cap typewriter focus paste @'],
      ['saving', 'Saving and backups', 'backup restore snapshot autosave'],
      ['shortcuts', 'Keyboard shortcuts', 'keys'],
      ['updates', 'Updates and privacy', 'version'],
      ['page', 'Layout', 'page size margins zoom draft letter a4 indent'],
      ['styles', 'Styles', 'paragraph character font'],
      ['proofreader', 'Seasonings', 'proofreader spelling grammar dictionary british american'],
      ['goals', 'Goals', 'target deadline words a day pasted'],
    ];
    const page = pageOf(book?.page);
    return [
      cmd('new', 'New item', () => void addScene(), 'Actions', keysFor('newScene'), 'page chapter scene'),
      cmd('card', 'New card', () => void addCard(), 'Actions', undefined, 'pantry character setting place material materials research'),
      cmd('folder', 'New group', () => void addFolder(), 'Actions', undefined, 'book volume folder part'),
      cmd('manual', 'Open the manual', () => setManualAt({ chapter: '', at: Date.now() }), 'Help', keysFor('manual'), 'help guide how to documentation'),
      cmd('table', 'Set the Table (welcome questions)', () => setTable('again'), 'Help', undefined, 'onboarding name english spelling writer goal'),
      cmd('find', 'Search', () => setFindRequest({ query: '', at: Date.now() }), 'Actions', keysFor('find'), 'find replace'),
      cmd('shelf', 'Name from the Pantry', () => setShelf({ at: null }), 'Actions', keysFor('shelf'), 'cards characters insert'),
      cmd('pantry', panel === 'pantry' ? 'Close the Pantry' : 'Open the Pantry', () => togglePanel('pantry'), 'Actions', undefined, 'cards characters places materials research'),
      ...(doc ? [cmd('seasonings', seasoningsOpen ? 'Close Seasonings' : 'Open Seasonings', () => togglePanel('seasonings'), 'Actions', keysFor('seasonings'), 'spelling grammar dialogue readability proofreader')] : []),
      ...(doc?.kind === 'scene' && path
        ? [
            cmd('draft', 'Draft this item', () => void draftItem(path), 'Actions', undefined, 'version rewrite redraft ghost placeholder'),
            ...(draftsOf(draftIds, doc.id).length > 0
              ? [cmd('ghost', ghostN !== null ? 'Hide the draft’s ghost text' : 'Show the newest draft as ghost text', () => pickGhost(doc.id, ghostN !== null ? 0 : draftsOf(draftIds, doc.id).at(-1)!), 'View', undefined, 'draft version placeholder faded')]
              : []),
          ]
        : []),
      ...(doc ? [cmd('snapshot', 'Take a snapshot of this item', () => void takeSnapshot('By hand')), cmd('snapshots', 'Snapshots of this item…', () => path && void showSnapshots(path))] : []),
      cmd('focus', settings.focus ? 'Stove Mode (leave Oven Mode)' : 'Oven Mode (focus mode)', toggleFocus, 'View', keysFor('focus'), 'focus distraction study oven stove'),
      ...(book
        ? [
            cmd('suggest', book.suggest ? 'Stop suggesting changes' : 'Suggest changes (track changes)', toggleSuggest, 'Edit', keysFor('suggest'), 'track changes review suggest edits insert'),
            cmd('acceptRecipe', 'Accept all changes in the recipe', () => void settleRecipe(true), 'Edit', undefined, 'track changes review suggestion every item'),
            cmd('rejectRecipe', 'Reject all changes in the recipe', () => void settleRecipe(false), 'Edit', undefined, 'track changes review suggestion every item'),
          ]
        : []),
      ...(editor && hasChanges(editor.state.doc)
        ? [
            cmd('nextChange', 'Next change', () => nextChange(1), 'Edit', undefined, 'track changes review suggestion'),
            cmd('acceptAll', 'Accept all changes on this page', () => settleChanges(true, true), 'Edit', undefined, 'track changes review suggestion'),
            cmd('rejectAll', 'Reject all changes on this page', () => settleChanges(false, true), 'Edit', undefined, 'track changes review suggestion'),
          ]
        : []),
      ...(canMise ? [cmd('mise', miseShown ? 'Show this item on its own page' : 'Mise en Place: show this item’s group as one page', toggleMise, 'View', keysFor('mise'), 'mise en place group one page whole chapter')] : []),
      ...(isTauri() && !IS_MAC ? [cmd('fullscreen', fullScreen ? 'Leave full screen' : 'Full screen', toggleFullScreen, 'View', keysFor('fullscreen'), 'full screen fullscreen maximise maximize window')] : []),
      cmd('typewriter', settings.typewriter ? 'Typewriter scrolling off' : 'Typewriter scrolling on', () => setSettings({ typewriter: !settings.typewriter }), 'View'),
      cmd('draft', page.view === 'page' ? 'Show pages as Draft' : 'Show pages as Paper', () => updateBook({ page: { ...page, view: page.view === 'page' ? 'draft' : 'page' } }), 'View'),
      ...ZOOMS.map((z) => cmd(`zoom${z}`, `Zoom: ${zoomLabel(z)}`, () => updateBook({ page: { ...page, zoom: z } }), 'View')),
      ...(['system', 'light', 'dark', 'sepia'] as const).map((t) => cmd(`theme-${t}`, `Theme: ${t[0]!.toUpperCase()}${t.slice(1)}`, () => setSettings({ theme: t }), 'View', settings.theme === t ? '✓' : undefined)),
      cmd('goals', 'Goals', () => setGoalsRequest({ tab: 'targets', at: Date.now() }), 'Recipe', undefined, 'target daily words streak'),
      cmd('history', 'Writing history', () => setGoalsRequest({ tab: 'history', at: Date.now() }), 'Recipe', undefined, 'words written days'),
      cmd('plate', 'Plate and serve (set the finished book)…', () => void openPlate(), 'Recipe', undefined, 'publish typeset print pdf epub book layout trim drop cap serve'),
      cmd('docx', 'Export as Word…', () => void exportBook('docx'), 'Recipe', '.docx'),
      cmd('epub', 'Export as EPUB…', () => void exportBook('epub'), 'Recipe', '.epub'),
      cmd('md', 'Export as Markdown…', () => void exportBook('md'), 'Recipe', '.md'),
      cmd('print', 'Print or save as PDF…', () => void exportBook('print'), 'Recipe'),
      cmd('import', 'Import files…', () => chooseImport(null), 'Recipe', '.docx .md .txt'),
      cmd('scrivener', 'Import Scrivener project…', () => void chooseScrivener(), 'Recipe', '.scriv', 'scrivener scriv binder move switch'),
      cmd('zip', 'Back up as a zip…', () => void backUp(), 'Recipe'),
      cmd('backup', 'Back up now', () => void backUpNow(), 'Recipe', undefined, 'automatic backup'),
      cmd('books', 'Your Recipes…', () => setLibraryOpen(true), 'Recipe', undefined, 'books works open library switch'),
      cmd('trash', 'Trash', openTrash, 'Recipe', undefined, 'deleted restore'),
      cmd('settings', 'App Settings', () => openSettings(), 'App Settings', keysFor('settings'), 'settings preferences options'),
      // Also here because a web browser keeps Ctrl+1 to Ctrl+8 for its own tabs.
      cmd('goShelf', 'Go to the Shelf', () => goToArea('shelf'), 'Go to', keysFor('goShelf'), 'keyboard focus panel'),
      cmd('goPantry', 'Go to the Pantry', () => goToArea('pantry'), 'Go to', keysFor('goPantry'), 'keyboard focus panel'),
      cmd('goSeasonings', 'Go to Seasonings', () => goToArea('seasonings'), 'Go to', keysFor('goSeasonings'), 'keyboard focus panel proofread'),
      cmd('goToolbar', 'Go to the toolbar', () => goToArea('toolbar'), 'Go to', keysFor('goToolbar'), 'keyboard focus formatting'),
      cmd('nextIssue', 'Next issue', () => goToIssue(1), 'Go to', keysFor('nextIssue'), 'proofread spelling grammar mistake'),
      ...sections.map(([id, label, words]) => cmd(`settings-${id}`, `App Settings › ${label}`, () => openSettings(id), 'App Settings', undefined, words)),
      ...places,
    ];
  };

  const searchBook = useCallback((query: string): SearchHit[] => index.current?.index.search(query, { limit: 8 }) ?? [], [indexVersion]);

  const nextStyle = useCallback((style: string) => paragraphStyle(sheet, style).next ?? style, [sheet]);
  const css = useMemo(() => stylesToCss(sheet), [sheet]);

  const page = pageOf(book?.page);
  const goals: Goals = { dailyGoal: book?.dailyGoal ?? settings.dailyGoal, bookTarget: book?.bookTarget, deadline: book?.deadline, weekendsOff: !!book?.weekendsOff };
  // Words on the Shelf but the open Item's, which the footer counts as they are typed.
  const otherWords = useMemo(() => {
    let total = 0;
    for (const [p, c] of cards) if (p.startsWith(BOOKSHELF + '/') && c.kind === 'scene' && p !== path) total += c.words;
    return total;
  }, [cards, path]);
  /** Words on the Shelf now, with the open Item counted from the editor. Read when needed, not while typing. */
  const bookWordsNow = () => {
    if (!path || !path.startsWith(BOOKSHELF + '/') || doc?.kind !== 'scene') return otherWords;
    return otherWords + (editor ? docWords(editor.state.doc) : (cards.get(path)?.words ?? 0));
  };
  /**
   * Notes the open recipe's title, words, goal and series in Your Recipes, so the list shows them without
   * opening it. Run when Your Recipes opens and when the recipe closes, never while typing.
   */
  const noteRecipe = useRef<(extra?: { firstLines?: string }) => void>(() => {});
  noteRecipe.current = (extra = {}) => {
    const at = locationRef.current;
    const info = bookRef.current;
    if (!at || !info || editingTemplate.current) return;
    updateRecent(at, { title: info.title, words: bookWordsNow(), goal: info.bookTarget, series: info.series, seriesNumber: info.seriesNumber, ...(lastEdited.current && { edited: lastEdited.current }), ...extra });
  };
  useEffect(() => {
    const onHide = () => noteRecipe.current();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);
  // Its first lines are read once, when Your Recipes opens.
  const [libraryVersion, setLibraryVersion] = useState(0);
  useEffect(() => {
    if (!libraryOpen || !fs || editingTemplate.current) return;
    let live = true;
    noteRecipe.current();
    setLibraryVersion((v) => v + 1);
    void flushSave()
      .then(() => firstLines(fs, tree, plainText))
      .then((text) => {
        if (!live) return;
        noteRecipe.current({ firstLines: text || undefined });
        setLibraryVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [libraryOpen]);
  const exportHistoryCsv = () =>
    void saveFile(`${book?.title ?? 'Recipe'} writing history`, historyCsv(history.get()), KINDS.csv).catch((e: unknown) => setError(friendlyError(e)));
  // The page is drawn at the book's zoom whatever the interface size; Fit width fills the desk.
  const desk = useRef<HTMLElement>(null);
  const pageSize = PAGE_SIZES[page.size];
  // On a phone a whole sheet of paper won't fit, so the scene is shown as Draft. A side panel takes
  // its own column beside the desk, but opening one shouldn't switch the page between views.
  const panelColumn = drawerOpen && !settings.focus && window.innerWidth > 900 ? drawerWidth() : 0;
  /*
   * While the window is being resized, the page keeps up in the same frame: the desk's width goes
   * straight into the --fit variable that Fit width zooms by, with no re-render of the app. The app
   * only re-renders when the page switches between Page and Draft, and once the resizing stops
   * (for the Fit width percentage in the footer). Re-rendering on every frame made the page lag a
   * frame or more behind the window, most of all on Linux.
   */
  const [deskWidth, setDeskWidth] = useState(0);
  const deskNow = useRef({ pageWidth: pageSize.width, panel: panelColumn, width: 0 });
  deskNow.current.pageWidth = pageSize.width;
  deskNow.current.panel = panelColumn;
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    let settle: number | undefined;
    const watch = new ResizeObserver(() => {
      const now = deskNow.current;
      const width = el.clientWidth;
      el.style.setProperty('--fit', String(fitZoom(width, now.pageWidth)));
      const was = now.width;
      now.width = width;
      window.clearTimeout(settle);
      if (was === 0 || isSmallDesk(was, now.panel) !== isSmallDesk(width, now.panel)) setDeskWidth(width);
      else settle = window.setTimeout(() => setDeskWidth(el.clientWidth), 120);
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      window.clearTimeout(settle);
    };
  }, []);
  // A new paper size changes the fit at once, without waiting for the desk to resize.
  useLayoutEffect(() => {
    const el = desk.current;
    if (el && el.clientWidth > 0) el.style.setProperty('--fit', String(fitZoom(el.clientWidth, pageSize.width)));
  }, [pageSize.width]);
  const small = isSmallDesk(deskWidth, panelColumn);
  const asDraft = page.view === 'draft' || small;
  const fitWidth = page.zoom === 0 && !asDraft;
  const pageZoom = asDraft && (page.zoom === 0 || small) ? 1 / UI_ZOOM[settings.size] : page.zoom === 0 ? fitZoom(deskWidth, pageSize.width) : page.zoom / 100 / UI_ZOOM[settings.size];
  const fittedZoom = Math.round(fitZoom(deskWidth, pageSize.width) * 100);
  zoomPage.current = (dir) => updateBook({ page: { ...page, zoom: zoomStep(page.zoom || Math.round(fitZoom(desk.current?.clientWidth ?? deskWidth, pageSize.width) * 100), dir) } });
  const pageStyle: CSSProperties =
    asDraft
      ? { zoom: pageZoom }
      : { zoom: fitWidth ? 'var(--fit)' : pageZoom, width: pageSize.width * 96, minHeight: pageSize.height * 96, padding: MARGINS[page.margins].inches * 96 };
  // The cards above the page are as wide as the page itself, at any size and zoom.
  const cardStyle: CSSProperties = asDraft ? { width: '100%', maxWidth: 760 * pageZoom } : { width: fitWidth ? `calc(${pageSize.width * 96}px * var(--fit))` : pageSize.width * 96 * pageZoom };

  /** The open Item's editor and what goes with it: on its own page, or in its place in Mise en Place. */
  const pageBody = () => {
    if (!doc || !path) return null;
    const forId = doc.id;
    return (
      <>
        <PageEditor
          initialBody={doc.body}
          undoLog={undoLog}
          takeOver={editorTakeOver}
          onRecorder={onRecorder}
          nextStyle={nextStyle}
          onReady={setEditor}
          onChange={(ed) => {
            // An editor on its way out, typed in after its Item's words were saved, mustn't write into the next one.
            if (docRef.current?.id !== forId) return;
            bodyFrom.current = ed;
            scheduleSave();
          }}
          onSeasonings={showFootnote}
          cardKind={doc.kind}
        />
        {isBrainstormKind(doc.kind) && <BrainstormPlus editor={editor} kind={doc.kind} />}
        <PageFootnotes editor={editor} />
        <SceneBreakActions editor={editor} nextTitle={next ? next.name.replace(/\.md$/, '') : null} onSplit={(pos) => void splitScene(pos)} onMerge={() => void mergeNext()} />
      </>
    );
  };
  // Words in the Group shown as Mise en Place. The others are added up when the Shelf or the index
  // changes, not on every keystroke; the footer adds the open Item's words as they are typed.
  const miseList = useMemo(() => (miseShown ? miseItems(miseEntriesOf(miseShown.nodes)) : []), [miseShown]);
  const miseActive = miseShown && path && inRoots(path, miseShown.roots) ? path : null;
  const miseOthers = useMemo(() => miseWords(miseList, (p) => cards.get(p)?.words ?? 0, miseActive, 0), [miseList, cards, miseActive]);

  /** File, Edit, View, Insert, Format, Recipe and Help along the top bar. Each is built when it opens. */
  const topMenus: BarMenu[] = [
    {
      label: 'File',
      items: () => [
        // Recipes lead the File menu. New Item, Group and Pantry card live on the Shelf and Pantry.
        { label: 'New Recipe…', onPick: () => (setLibraryNew(true), setLibraryOpen(true)) },
        { label: 'Your Recipes…', onPick: () => setLibraryOpen(true) },
        { label: 'Import files…', hint: '.docx .md .txt', disabled: !fs, onPick: () => chooseImport(null) },
        { label: 'Import Scrivener project…', hint: '.scriv', onPick: () => void chooseScrivener() },
        {
          label: 'Export',
          disabled: !fs,
          items: [
            { label: 'Word…', hint: '.docx', onPick: () => void exportBook('docx') },
            { label: 'EPUB…', hint: '.epub', onPick: () => void exportBook('epub') },
            { label: 'Markdown…', hint: '.md', onPick: () => void exportBook('md') },
          ],
        },
        { label: 'Print or save as PDF…', disabled: !fs, onPick: () => void exportBook('print') },
        { separator: true },
        { label: 'Back up now', disabled: !fs, onPick: () => void backUpNow() },
        { label: 'Back up as a zip…', disabled: !fs, onPick: () => void backUp() },
        { label: 'Trash', disabled: !fs, onPick: openTrash },
        // On a Mac, Settings and Quit are in the Cookbook menu.
        ...(MAC_APP
          ? []
          : ([
              { separator: true },
              { label: 'App Settings…', hint: keysFor('settings'), binding: binding('settings'), onPick: () => openSettings() },
              ...(isTauri() ? [{ label: 'Quit', onPick: () => void quitApp() }] : []),
            ] as MenuItem[])),
      ],
    },
    {
      label: 'Edit',
      items: () => {
        const ed = editor;
        const none = !ed;
        const empty = !ed || ed.state.selection.empty;
        return [
          { label: 'Undo', native: 'Undo', hint: keys('Mod-Z'), disabled: none || undoDepth(ed.state) === 0, onPick: () => void ed?.chain().focus().undo().run() },
          { label: 'Redo', native: 'Redo', hint: keys(IS_MAC ? 'Mod-Shift-Z' : 'Mod-Y'), disabled: none || !ed.can().redo(), onPick: () => void ed?.chain().focus().redo().run() },
          { separator: true },
          { label: 'Cut', native: 'Cut', hint: keys('Mod-X'), disabled: empty, onPick: () => ed && clip(ed, 'cut') },
          { label: 'Copy', native: 'Copy', hint: keys('Mod-C'), disabled: empty, onPick: () => ed && clip(ed, 'copy') },
          { label: 'Paste', native: 'Paste', hint: keys('Mod-V'), disabled: none, onPick: () => ed && pasteFromMenu(ed, getSettings().pastePlain) },
          { label: 'Paste as plain text', hint: keys('Mod-Shift-V'), disabled: none, onPick: () => ed && pasteFromMenu(ed, true) },
          { label: 'Select all', native: 'SelectAll', hint: keys('Mod-A'), disabled: none, onPick: () => void ed?.chain().focus().selectAll().run() },
          { separator: true },
          { label: 'Track changes', items: trackItems(ed) },
          { separator: true },
          { label: 'Search', hint: keysFor('find'), binding: binding('find'), onPick: () => setFindRequest({ query: ed ? selectedWords(ed) : '', at: Date.now() }) },
          { label: 'Go to an item or card…', hint: keysFor('switcher'), binding: binding('switcher'), onPick: () => setPalette({ scenesOnly: true, at: Date.now() }) },
          { label: 'Command palette…', hint: keysFor('palette'), binding: binding('palette'), onPick: () => setPalette({ scenesOnly: false, at: Date.now() }) },
        ];
      },
    },
    {
      label: 'View',
      items: () => {
        const page = pageOf(book?.page);
        return [
          { label: 'Stove Mode', checked: !settings.focus, onPick: () => settings.focus && toggleFocus() },
          { label: 'Oven Mode (focus)', hint: keysFor('focus'), binding: binding('focus'), checked: settings.focus, onPick: () => !settings.focus && toggleFocus() },
          { label: 'Typewriter scrolling', checked: settings.typewriter, onPick: () => setSettings({ typewriter: !settings.typewriter }) },
          { label: 'Mise en Place (the whole group)', hint: keysFor('mise'), binding: binding('mise'), checked: !!miseShown, disabled: !canMise, onPick: toggleMise },
          { separator: true },
          // On a Mac the menu bar's own Window › Enter Full Screen does this.
          ...(isTauri() && !IS_MAC ? [{ label: 'Full screen', hint: keysFor('fullscreen'), binding: binding('fullscreen'), checked: fullScreen, onPick: toggleFullScreen }, { separator: true as const }] : []),
          { label: 'Paper', checked: page.view === 'page', disabled: !book, onPick: () => updateBook({ page: { ...page, view: 'page' } }) },
          { label: 'Draft', checked: page.view === 'draft', disabled: !book, onPick: () => updateBook({ page: { ...page, view: 'draft' } }) },
          { label: 'Zoom', disabled: !book, items: ZOOMS.map((z) => ({ label: zoomLabel(z), checked: page.zoom === z, onPick: () => updateBook({ page: { ...page, zoom: z } }) })) },
          {
            label: 'Theme',
            items: (['system', 'light', 'dark', 'sepia'] as const).map((t) => ({ label: `${t[0]!.toUpperCase()}${t.slice(1)}`, checked: settings.theme === t, onPick: () => setSettings({ theme: t }) })),
          },
          { separator: true },
          { label: 'Pantry', checked: pantryShown, onPick: () => togglePanel('pantry') },
          { label: 'Seasonings', hint: keysFor('seasonings'), binding: binding('seasonings'), checked: seasoningsShown, disabled: !doc, onPick: () => togglePanel('seasonings') },
        ];
      },
    },
    {
      label: 'Insert',
      items: () => {
        const ed = editor;
        const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => ed && void fn(ed.chain().focus()).run();
        return [
          { label: 'Footnote', hint: keysFor('footnote'), binding: binding('footnote'), disabled: !ed, onPick: () => ed && editFootnote(insertFootnote(ed)) },
          { label: 'Name from the Pantry', hint: keysFor('shelf'), binding: binding('shelf'), disabled: !ed, onPick: () => setShelf({ at: null }) },
          { separator: true },
          { label: 'Table', disabled: !ed || ed.isActive('table'), onPick: run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })) },
          { label: 'Numbered list', disabled: !ed, onPick: run((c) => c.toggleOrderedList()) },
          { label: 'Bulleted list', disabled: !ed, onPick: run((c) => c.toggleBulletList()) },
          { label: 'Checklist', disabled: !ed, onPick: run((c) => c.toggleTaskList()) },
          { label: 'Section break', disabled: !ed || ed.state.selection.$from.depth !== 1, onPick: run((c) => c.insertContent({ type: 'sceneBreak' })) },
        ];
      },
    },
    {
      label: 'Format',
      items: () => [
        ...(editor ? formatItems(editor) : [{ label: 'Open an item to format it', disabled: true, onPick: () => {} }]),
        { separator: true },
        { label: 'Edit styles…', disabled: !book, onPick: () => openSettings('styles') },
      ],
    },
    {
      label: 'Recipe',
      items: () => [
        { label: 'Configure this recipe…', disabled: !book, onPick: () => openSettings('page') },
        { label: 'Plate and serve…', disabled: !book, onPick: () => void openPlate() },
        { label: 'Goals…', disabled: !book, onPick: () => setGoalsRequest({ tab: 'targets', at: Date.now() }) },
        { label: 'Writing history…', disabled: !book, onPick: () => setGoalsRequest({ tab: 'history', at: Date.now() }) },
        { separator: true },
        { label: 'Draft this item', disabled: !doc || !path || doc.kind !== 'scene', onPick: () => path && void draftItem(path) },
        {
          label: 'Snapshots of this item',
          disabled: !doc || !path,
          items: [
            { label: 'Take a snapshot', onPick: () => void takeSnapshot('By hand') },
            { label: 'Compare and roll back…', onPick: () => path && void showSnapshots(path) },
          ],
        },
        { separator: true },
        { label: 'Expand the Shelf', onPick: () => setFolding({ open: true, at: Date.now() }) },
        { label: 'Collapse the Shelf', onPick: () => setFolding({ open: false, at: Date.now() }) },
      ],
    },
    {
      label: 'Help',
      items: () => [
        { label: 'Manual', hint: keysFor('manual'), binding: binding('manual'), onPick: () => setManualAt({ chapter: '', at: Date.now() }) },
        { label: 'Learn to Cook', onPick: () => void learnToCook().catch((e: unknown) => setError(friendlyError(e))) },
        { label: 'Set the Table…', onPick: () => setTable('again') },
        { separator: true },
        { label: 'Keyboard shortcuts…', onPick: () => openSettings('shortcuts') },
        { label: 'Command palette…', hint: keysFor('palette'), binding: binding('palette'), onPick: () => setPalette({ scenesOnly: false, at: Date.now() }) },
        { separator: true },
        { label: 'Updates and privacy…', onPick: () => openSettings('updates') },
        ...(MAC_APP ? [] : [{ label: `About Cookbook ${__APP_VERSION__}`, onPick: () => say(`Cookbook ${__APP_VERSION__}: an offline writing app. Everything stays on this device.`) }]),
      ],
    },
  ];

  // On a Mac the menus go in the system's own menu bar at the top of the screen, rebuilt when what they show changes.
  const menusNow = useRef(topMenus);
  menusNow.current = topMenus;
  const menuKey = JSON.stringify([settings.focus, settings.typewriter, settings.theme, panel, ovenSide, !!doc, !!editor, !!fs, !!book, pageOf(book?.page), path, settings.shortcuts, settings.shortcutStyle]);
  useEffect(() => {
    if (!MAC_APP) return;
    const t = window.setTimeout(() => {
      void setMacMenu(menusNow.current, () => menusNow.current, { settings: () => openSettings(), quit: () => void quitApp() }).catch(() => {});
    }, 150);
    return () => window.clearTimeout(t);
  }, [menuKey]);

  // The Shelf, the Pantry's list and the toolbar are memoised, so they get handlers that keep
  // their identity; anything else that re-renders the app then leaves them be.
  // An Item picked on the Shelf opens on its own page, even from inside the Group shown.
  const onDraftRow = useStable((p: string, n: number) => void showDraft(p, n));
  const onDraftMenuRow = useStable((p: string, n: number, x: number, y: number) => draftMenu(p, n, x, y));
  const onSelect = useStable((p: string) => {
    setMise(null);
    void select(p);
  });
  const onOpenGroup = useStable((g: string) => void openGroup(g));
  // Picking with Ctrl or ⌘, Shift or Select all shows the Groups picked; a plain click or Escape only marks.
  const onShelfMark = useStable((next: Set<string>, picking?: boolean) => {
    setShelfMarked(next);
    if (picking) showPicked(next);
  });
  const onTreeMove = useStable((from: string, folder: string, at: number) => moveInTree(from, folder, at));
  const onTreeRename = useStable((p: string, title: string | null) => renameInTree(p, title));
  const onRowMenu = useStable(rowMenu);
  const onTreeTrash = useStable(trashFromTree);
  const onEditStyle = useStable(editStyle);
  const onAddStyle = useStable(addStyle);
  const onRenameStyle = useStable((id: string, name: string) => changeSheet(renameParagraphStyle(sheet, id, name)));
  const onHitMenu = useStable((p: string, x: number, y: number) => rowMenu({ name: baseName(p), path: p, kind: 'file' }, x, y));
  // The Shelf's search looks only at its own Items; the Pantry has a search of its own.
  const searchShelf = useCallback(
    (query: string): SearchHit[] => (index.current?.index.search(query, { limit: 120 }) ?? []).filter((h) => h.path.startsWith(`${BOOKSHELF}/`)).slice(0, 40),
    [indexVersion],
  );
  const shelfLive = useMemo(() => (doc && path ? { path, editor } : null), [!!doc, path, editor]);

  return (
    <div
      className={`app${panel === 'pantry' || (seasoningsOpen && doc) ? ' panel-open' : ''}${drawerOpen && !settings.focus ? ' drawer-open' : ''}${settings.focus ? ' focus' : ''}${settings.typewriter ? ' typewriter' : ''}${sideOpen ? ' side-open' : ''}${settings.focus && ovenSide ? ' oven-side' : ''}`}
      style={{ '--shelf-w': `${shelfWidth}px` } as CSSProperties}
    >
      <style>{css}</style>
      <header className="topbar">
        <div className="brand-wrap">
          <button className="side-toggle" aria-label="Shelf" aria-expanded={sideOpen} onClick={() => {
            setSideOpen(!sideOpen);
            setOvenSide(false);
            // On a small window the Shelf slides over the page, so the right-hand panel makes way.
            if (!sideOpen && !settings.focus && narrowWindow()) setPanel(null);
          }}>
            <Icon name="menu" size={20} />
          </button>
          <span className="brand">cookbook</span>
          {!MAC_APP && <MenuBar menus={topMenus} />}
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
                  { label: 'Your Recipes…', onPick: () => setLibraryOpen(true) },
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
          <button className="panel-btn" title="Pantry" aria-pressed={pantryShown} aria-expanded={pantryShown} onClick={() => togglePanel('pantry')}>
            <Icon name="pantry" size={24} />
            Pantry
          </button>
          <button className="panel-btn" title="Seasonings" aria-pressed={seasoningsShown} aria-expanded={seasoningsShown} disabled={!doc} onClick={() => togglePanel('seasonings')}>
            <Icon name="seasonings" size={24} />
            Seasonings
            <SeasoningsBadge editor={doc ? editor : null} chosen={chosen} paused={paused} />
          </button>
          <FindBox editor={editor} search={searchBook} currentPath={path} onOpenHit={select} request={findRequest} beforeReplaceAll={() => autoSnapshot('Before replacing all').catch(() => {})} />
        </div>
      </header>

      <Toolbar editor={editor} sheet={sheet} onEditStyle={onEditStyle} onAddStyle={onAddStyle} onRenameStyle={onRenameStyle} />

      <nav
        ref={shelfRef}
        className={`sidebar${fileDrop !== null ? ' file-drop' : ''}`}
        aria-label="Shelf"
        {...shelfAway}
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
          if ((e.target as Element).closest('[data-tree-path], [data-draft-of], .pantry-results button, input, .menu')) return;
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
        <ShelfSearch search={searchShelf} selected={path} onOpen={onSelect} onMenu={onHitMenu}>
        <Tree
          nodes={tree}
          root={BOOKSHELF}
          selected={path}
          cards={cards}
          live={shelfLive}
          collapseKey={`cookbook.closedFolders:${JSON.stringify(location)}:${BOOKSHELF}`}
          renaming={renaming}
          onSelect={onSelect}
          onMove={onTreeMove}
          onStartRename={setRenaming}
          onRename={onTreeRename}
          onMenu={onRowMenu}
          onTrash={onTreeTrash}
          dropTarget={fileDrop}
          folding={folding}
          recipes={recipes}
          marked={shelfMarked}
          onMark={onShelfMark}
          onOpenGroup={onOpenGroup}
          shownGroups={miseShown?.groups}
          drafts={draftRows}
          ghost={path && ghostN !== null ? { path, n: ghostN } : null}
          onDraft={onDraftRow}
          onDraftMenu={onDraftMenuRow}
        />
        </ShelfSearch>
        {shelfBar()}
      </nav>
      <ShelfResizer width={shelfWidth} onWidth={setShelfWidth} shelf={() => shelfRef.current} />
      {(sideOpen || (settings.focus && ovenSide)) && (
        <div
          className="side-backdrop"
          onClick={() => {
            setSideOpen(false);
            setOvenSide(false);
          }}
        />
      )}
      {settings.focus && <OvenEdges seasonings={!!doc && panel === 'seasonings'} onShelf={() => goToArea('shelf')} onSide={() => goToArea(doc && panel === 'seasonings' ? 'seasonings' : 'pantry')} />}

      <main className={`desk${beside && doc ? ' split' : ''}${page.view === 'draft' ? ' draft' : ''}`} ref={desk}>
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
        {miseShown && fs ? (
          <div className="page-row">
            <MiseEnPlace
              key={`${miseShown.anchor}:${miseRound}`}
              fs={fs}
              roots={miseShown.nodes}
              anchor={miseShown.anchor}
              target={miseShown.target}
              title={miseShown.title}
              active={miseActive}
              editor={editor}
              cards={cards}
              className={`cb-page${asDraft ? ' draft' : ''}${page.zoom !== 0 ? ' eased' : ''}`}
              style={pageStyle}
              renderActive={pageBody}
              onActivate={select}
              onStartWriting={startWriting}
              onDiscard={(p) => void trashPath(p)}
              onPageMenu={pageMenu}
              onItemMenu={readerMenu}
            />
          </div>
        ) : (
          <>
          {doc && path && isCard(doc.kind) && (
            <PantryCard
              style={cardStyle}
              doc={doc}
              choices={cardChoices}
              incoming={incoming}
              appearsIn={appearsIn}
              loadPicture={loadPicture}
              onChange={(changed) => {
                // The card builds on the Item as it was opened, so it keeps the text typed since.
                const next = { ...changed, body: (currentDoc() ?? changed).body };
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
              {pageBody()}
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
        <div className="drawer" {...sideAway}>
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
              onClose={closePanel}
              onMenu={pantryMenu}
              onHitMenu={onHitMenu}
              bar={pantryBar()}
            >
              <Tree
                nodes={pantryNodes}
                root={joinPath(PANTRY, pantryGroup)}
                selected={path}
                cards={cards}
                live={null}
                collapseKey={`cookbook.closedFolders:${JSON.stringify(location)}:${PANTRY}`}
                renaming={renaming}
                onSelect={onSelect}
                onMove={onTreeMove}
                onStartRename={setRenaming}
                onRename={onTreeRename}
                onMenu={onRowMenu}
                onTrash={onTreeTrash}
                folding={folding}
                loadPicture={loadPicture}
                marked={pantryMarked}
                onMark={setPantryMarked}
              />
            </PantryPanel>
          )}
          {seasoningsOpen && doc && (
            <Seasonings
              editor={editor}
              chosen={chosen}
              onChosen={(next) => setSeasonings({ chosen: next })}
              unchecked={unchecked}
              onUnchecked={(next) => setSeasonings({ unchecked: next.length > 0 ? next : undefined })}
              onDrunk={(on) => setSeasonings({ drunk: on || undefined })}
              onClose={closePanel}
              paused={paused}
              onPaused={(on) => setSeasonings({ paused: on || undefined })}
              onMenu={showMenu}
              onReport={openReport}
            />
          )}
        </div>
      )}

      <IssueCard editor={editor} proof={proof} request={issueRequest} />
      {report && editor && <ReportWindow editor={editor} report={report.report} item={report.item} saved={report.saved} onClose={() => setReport(null)} />}
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
          version={libraryVersion}
          startNew={libraryNew}
          defaultWhere={isTauri() ? settings.newBooksFolder || 'Cookbook’s own folder' : 'In this browser’s storage'}
          onOpen={(target) =>
            void fromLibrary(async () => {
              await openAt(target);
              return 'done';
            })
          }
          onOpenFolder={() => void openFolder()}
          onLearn={() =>
            void fromLibrary(async () => {
              await learnToCook();
              return 'done';
            })
          }
          onCreate={(choice) => void createNewBook(choice)}
          onAdopt={(target) =>
            void fromLibrary(async () => {
              await openAt(target, { adopt: true });
              return 'done';
            })
          }
          onCancelAdopt={() => setAdopting(null)}
          onClose={closeLibrary}
          onRename={renameRecipe}
          onDuplicate={(from, title) => void duplicateRecipe(from, title)}
          onLocate={(lost) => void locateRecipe(lost)}
          onDeleteForGood={deleteForGood}
          onSaveTemplate={saveAsTemplate}
          onEditTemplate={(t) => void editTemplate(t)}
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
              {notice.action ?? 'Undo'}
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
        accept={[...IMPORTABLE, '.zip'].join(',')}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          void importFiles(files, importInto.current);
        }}
      />

      <input
        ref={scrivenerInput}
        type="file"
        hidden
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          if (files.length > 0) void importScrivenerFrom(folderFilesSource(files));
        }}
      />

      <footer className="footer">
        <LiveGoals
          editor={editor}
          history={history}
          goals={goals}
          onGoals={(changes) => updateBook(changes)}
          item={doc && path && doc.kind === 'scene' ? { title: doc.title, goal: sceneGoal(doc), onShelf: path.startsWith(BOOKSHELF + '/') } : null}
          savedItemWords={(path && cards.get(path)?.words) || 0}
          otherWords={otherWords}
          onSceneGoal={(goal) => {
            const base = currentDoc() ?? doc;
            if (!base) return;
            const { goal: _old, ...fields } = base.fields;
            const updated = { ...base, fields: goal ? { ...fields, goal } : fields };
            setDoc(updated);
            scheduleSave(updated);
          }}
          onExport={exportHistoryCsv}
          request={goalsRequest}
        />
        <span className="footer-end">
          {miseShown && (
            <MiseCount
              name={miseShown.title}
              items={miseList.length}
              otherWords={miseOthers}
              editor={miseActive ? editor : null}
              savedItemWords={miseActive ? (cards.get(miseActive)?.words ?? 0) : 0}
            />
          )}
          {settings.focus && (
            <button className="oven-exit" title={`Back to Stove Mode (${keysFor('focus')} or Escape)`} onClick={toggleFocus}>
              Oven Mode
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
          {book?.suggest && (
            <button className="suggest-chip" title={`Stop suggesting changes (${[keysFor('suggest'), keysFor('suggestAlt')].filter(Boolean).join(' or ')})`} onClick={toggleSuggest}>
              Suggesting
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
          <SavedStatus state={saveState} editor={doc ? editor : null} where={where} />
          <button className="gear" aria-label="App Settings" title={`App Settings (${keysFor('settings')})`} onClick={() => openSettings()}>
            <Icon name="gear" size={18} />
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
            onSetTable={() => {
              setSettingsAt(null);
              setTable('again');
            }}
          />
        </Suspense>
      )}
      {table && (
        <Suspense fallback={null}>
          <SetTheTable first={table === 'first'} onDone={() => setTable(null)} />
        </Suspense>
      )}
      {manualAt && (
        <Suspense fallback={null}>
          <ManualWindow chapter={manualAt.chapter} at={manualAt.at} onClose={() => setManualAt(null)} onLearn={() => void learnToCook().catch((e: unknown) => setError(friendlyError(e)))} />
        </Suspense>
      )}

      {plateShelf && fs && book && (
        <Suspense fallback={null}>
          <Plate
            fs={fs}
            title={book.title}
            shelf={plateShelf}
            settings={plateOf(book.plate)}
            onChange={(next: PlateSettings) => updateBook({ plate: next as unknown as Record<string, unknown> })}
            bookId={ensureBookId}
            onClose={() => setPlateShelf(null)}
            say={(text) => say(text)}
            onError={setError}
          />
        </Suspense>
      )}

      {palette && <Palette key={palette.at} items={paletteItems(palette.scenesOnly)} placeholder={palette.scenesOnly ? 'Go to an item or card' : 'Type a command, setting or item'} onClose={() => setPalette(null)} />}

      {snapshots && (
        <SnapshotsDialog
          title={snapshots.title}
          current={currentDoc()?.body ?? ''}
          snapshots={snapshots.list}
          onTake={() => void takeSnapshot('By hand')}
          onRollBack={(snap) => void rollBack(snap)}
          onDelete={(snap) =>
            void (async () => {
              const scene = currentDoc();
              if (!fs || !scene) return;
              await deleteSnapshot(fs, snap);
              setSnapshots({ ...snapshots, list: await listSnapshots(fs, scene.id) });
            })()
          }
          onClose={() => setSnapshots(null)}
        />
      )}
      <UpdatePopup beforeRestart={saveEverything} />
    </div>
  );
}
