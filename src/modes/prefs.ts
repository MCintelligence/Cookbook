import { type StorageAdapter } from '../storage/adapter';
import { createStore } from '../ui/store';
import { type BoardLine, type CardLook, type CardSize, type Ends, type Flow, type Route, readLines, readLooks } from './diagram';

/**
 * Cook, Prep and Plan: the three ways to look at a recipe. Cook is the page being written;
 * Prep lays the Items out to be put in order (an outline and a board); Plan sets them in
 * story time (a calendar and plots). The Pantry has its own Prep (an atlas of ties and
 * a board) and its own Plan (arcs and a calendar), shared by the whole Pantry. Each of Prep
 * and Plan offers all three of its views whatever is open: the board and the calendar show the
 * side of the open Item, and the other four are always the Shelf's or always the Pantry's.
 *
 * Which mode is on is kept for the sitting only. How the views are set up (which view,
 * where the cards of a free board lie, what the plotlines are called) is kept with the
 * recipe in modes.json, so it travels with the folder and its backups.
 */
export type Mode = 'cook' | 'prep' | 'plan';
/** Whose views are showing: the Shelf's, or the Pantry's while a Pantry Item is open. */
export type Side = 'shelf' | 'pantry';
export type ViewId = 'outline' | 'board' | 'atlas' | 'pboard' | 'calendar' | 'plots' | 'arcs' | 'pcalendar';

/** What a view is called, whichever side of it shows: the three choices each of Prep and Plan offers. */
export type ViewKey = 'outline' | 'board' | 'atlas' | 'calendar' | 'plots' | 'arcs';

export const MODES: { id: Mode; name: string; hint: string; shortcut: string }[] = [
  { id: 'cook', name: 'Cook', hint: 'The page', shortcut: 'modeCook' },
  { id: 'prep', name: 'Prep', hint: 'Outline, board and atlas', shortcut: 'modePrep' },
  { id: 'plan', name: 'Plan', hint: 'Calendar, plots and arcs', shortcut: 'modePlan' },
];

/**
 * The views of Prep and of Plan, with the view each is on either side. One with both sides (the
 * board, the calendar) follows the open Item; one with a single side is that side's whatever is open.
 */
export const VIEWS: Record<Exclude<Mode, 'cook'>, { key: ViewKey; name: string; ids: Partial<Record<Side, ViewId>> }[]> = {
  prep: [
    { key: 'outline', name: 'Outline', ids: { shelf: 'outline' } },
    { key: 'board', name: 'Board', ids: { shelf: 'board', pantry: 'pboard' } },
    { key: 'atlas', name: 'Atlas', ids: { pantry: 'atlas' } },
  ],
  plan: [
    { key: 'calendar', name: 'Calendar', ids: { shelf: 'calendar', pantry: 'pcalendar' } },
    { key: 'plots', name: 'Plots', ids: { shelf: 'plots' } },
    { key: 'arcs', name: 'Arcs', ids: { pantry: 'arcs' } },
  ],
};

export type Spot = [number, number];

export interface ModePrefs {
  /** The view last used in "prep" and in "plan", by its key. (Older files kept one for each side, as "prep:shelf".) */
  view: Record<string, string>;
  outline: { columns: string[] };
  board: BoardSetUp & { rows: 'none' | 'label' | 'status' };
  pboard: BoardSetUp & { rows: 'none' | 'label' };
  /** Where things lie on the free boards and the atlas, by board and then by the Item's id. */
  spots: Record<string, Record<string, Spot>>;
  /** The lines drawn between cards on the free boards, by board. */
  lines: Record<string, BoardLine[]>;
  /** The shapes and colours given to cards on the free boards, by board and then by the Item's id. */
  looks: Record<string, Record<string, CardLook>>;
  atlas: { kinds: string[]; near: boolean };
  calendar: { span: 'month' | 'year'; at: string | null };
  /** Plots: what gets a line, how wide a day is, whether empty time is folded away, and whether the telling is threaded through. */
  plots: { lanes: 'label' | 'group' | 'who'; px: number; fold: boolean; thread: boolean };
  arcs: { kinds: string[]; quiet: boolean };
  /** The writer's names for the label colours when they stand for plotlines. */
  plotlines: Record<string, string>;
  /**
   * Items taken out of Prep or out of Plan with Remove, by id. Only the view leaves them out: the
   * Item itself is untouched, and dragging it in from the Shelf or Pantry brings it back.
   */
  hidden: { prep: string[]; plan: string[] };
}

/** How a board is set up. Everything after `layout` is for the free board, as a mindmap or flowchart. */
export interface BoardSetUp {
  layout: 'grid' | 'free';
  /** Whole cards, or only their names (smaller, for a mindmap). */
  cards: CardSize;
  /** Whether cards dropped on the free board settle on its dots. */
  snap: boolean;
  /** How new lines are drawn. */
  route: Route;
  ends: Ends;
  /** Which way elbow and curved lines leave their cards; set by the last Tree laid out. */
  flow: Flow;
}

const BOARD_SET_UP: BoardSetUp = { layout: 'grid', cards: 'full', snap: false, route: 'curved', ends: 'end', flow: 'auto' };

export const OUTLINE_COLUMNS = [
  { id: 'synopsis', name: 'Synopsis' },
  { id: 'label', name: 'Plotline' },
  { id: 'status', name: 'Status' },
  { id: 'when', name: 'Story date' },
  { id: 'words', name: 'Words' },
] as const;

export const DEFAULT_PREFS: ModePrefs = {
  view: {},
  outline: { columns: ['synopsis', 'label', 'status', 'when', 'words'] },
  board: { ...BOARD_SET_UP, rows: 'none' },
  pboard: { ...BOARD_SET_UP, rows: 'none' },
  spots: {},
  lines: {},
  looks: {},
  atlas: { kinds: ['character', 'setting', 'research'], near: false },
  calendar: { span: 'month', at: null },
  plots: { lanes: 'label', px: 18, fold: true, thread: false },
  arcs: { kinds: ['character'], quiet: false },
  plotlines: {},
  hidden: { prep: [], plan: [] },
};

export const MODES_FILE = 'modes.json';

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What a modes.json says, with anything missing or damaged filled in from the defaults. */
export function readPrefs(text: string): ModePrefs {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!isRecord(raw)) return DEFAULT_PREFS;
  const part = <K extends keyof ModePrefs>(key: K): ModePrefs[K] => (isRecord(raw[key]) && isRecord(DEFAULT_PREFS[key]) ? ({ ...(DEFAULT_PREFS[key] as object), ...(raw[key] as object) } as ModePrefs[K]) : DEFAULT_PREFS[key]);
  // Plots was the timeline once: how close in it was is kept, and the rest starts as Plots does.
  const px = Number(isRecord(raw.plots) ? raw.plots.px : isRecord(raw.timeline) ? raw.timeline.px : NaN);
  const lanes = part('plots').lanes;
  return {
    view: part('view'),
    outline: { columns: Array.isArray(part('outline').columns) ? part('outline').columns.filter((c) => typeof c === 'string') : DEFAULT_PREFS.outline.columns },
    board: part('board'),
    pboard: part('pboard'),
    spots: part('spots'),
    lines: readLines(raw.lines),
    looks: readLooks(raw.looks),
    atlas: part('atlas'),
    calendar: part('calendar'),
    plots: { lanes: lanes === 'group' || lanes === 'who' ? lanes : 'label', px: Number.isFinite(px) ? Math.max(MIN_PX, Math.min(MAX_PX, px)) : DEFAULT_PREFS.plots.px, fold: part('plots').fold !== false, thread: part('plots').thread === true },
    arcs: part('arcs'),
    plotlines: part('plotlines'),
    hidden: { prep: ids(part('hidden').prep), plan: ids(part('hidden').plan) },
  };
}

/** How wide a day is in Plots, at its closest and furthest. */
export const MIN_PX = 0.05;
export const MAX_PX = 96;

export const modeStore = createStore<Mode>('cook');
export const prefsStore = createStore<ModePrefs>(DEFAULT_PREFS);

let saving: { fs: StorageAdapter; timer: number } | null = null;
let home: StorageAdapter | null = null;

/** Reads the open recipe's modes.json; a recipe without one starts from the defaults. */
export async function loadPrefs(fs: StorageAdapter | null): Promise<void> {
  flushPrefs();
  home = fs;
  prefsStore.set(DEFAULT_PREFS);
  if (!fs) return;
  try {
    if (await fs.exists(MODES_FILE)) {
      const read = readPrefs(await fs.readText(MODES_FILE));
      if (home === fs) prefsStore.set(read);
    }
  } catch {
    // An unreadable file is as good as none: the views open as they do the first time.
  }
}

function write(fs: StorageAdapter) {
  void fs.writeText(MODES_FILE, JSON.stringify(prefsStore.get(), null, 2) + '\n').catch(() => {});
}

/** Writes anything waiting, before another recipe opens. */
export function flushPrefs(): void {
  if (!saving) return;
  window.clearTimeout(saving.timer);
  write(saving.fs);
  saving = null;
}

/** Changes the set-up and writes it a moment later, so dragging a card about is one write, not fifty. */
export function setPrefs(change: Partial<ModePrefs> | ((now: ModePrefs) => Partial<ModePrefs>)): void {
  const now = prefsStore.get();
  prefsStore.set({ ...now, ...(typeof change === 'function' ? change(now) : change) });
  const fs = home;
  if (!fs) return;
  if (saving) window.clearTimeout(saving.timer);
  saving = { fs, timer: window.setTimeout(() => { saving = null; write(fs); }, 600) };
}

/** Whose views show for the file that is open: a Pantry Item brings up the Pantry's, anything else the Shelf's. */
export function sideOf(openIsCard: boolean): Side {
  return openIsCard ? 'pantry' : 'shelf';
}

/** The view each mode begins on, before one is picked: as it was when each side had only its own two. */
const FIRST: Record<Exclude<Mode, 'cook'>, Record<Side, ViewKey>> = { prep: { shelf: 'outline', pantry: 'atlas' }, plan: { shelf: 'calendar', pantry: 'arcs' } };

/** The view to show, and whose: the one last picked in this mode, or to begin with the first that belongs to the open Item's side. */
export function viewOf(prefs: ModePrefs, mode: Exclude<Mode, 'cook'>, open: Side): { key: ViewKey; name: string; id: ViewId; side: Side } {
  const views = VIEWS[mode];
  // A file from before the views were offered together remembers one for each side.
  const old = prefs.view[`${mode}:${open}`];
  const pick = views.find((v) => v.key === prefs.view[mode]) ?? views.find((v) => old !== undefined && v.ids[open] === old) ?? views.find((v) => v.key === FIRST[mode][open])!;
  const side: Side = pick.ids[open] ? open : pick.ids.shelf ? 'shelf' : 'pantry';
  return { key: pick.key, name: pick.name, id: pick.ids[side]!, side };
}
