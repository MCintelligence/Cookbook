import { type StorageAdapter } from '../storage/adapter';
import { createStore } from '../ui/store';

/**
 * Cook, Prep and Plan: the three ways to look at a recipe. Cook is the page being written;
 * Prep lays the Items out to be put in order (an outline and a board); Plan sets them in
 * story time (a calendar and a timeline). The Pantry has its own Prep (an atlas of ties and
 * a board) and its own Plan (arcs and a calendar), shared by the whole Pantry.
 *
 * Which mode is on is kept for the sitting only. How the views are set up (which view,
 * where the cards of a free board lie, what the plotlines are called) is kept with the
 * recipe in modes.json, so it travels with the folder and its backups.
 */
export type Mode = 'cook' | 'prep' | 'plan';
/** Whose views are showing: the Shelf's, or the Pantry's while a Pantry Item is open. */
export type Side = 'shelf' | 'pantry';
export type ViewId = 'outline' | 'board' | 'atlas' | 'pboard' | 'calendar' | 'timeline' | 'arcs' | 'pcalendar';

export const MODES: { id: Mode; name: string; hint: Record<Side, string>; shortcut: string }[] = [
  { id: 'cook', name: 'Cook', hint: { shelf: 'The page', pantry: 'The page' }, shortcut: 'modeCook' },
  { id: 'prep', name: 'Prep', hint: { shelf: 'Outline and board', pantry: 'Atlas and board' }, shortcut: 'modePrep' },
  { id: 'plan', name: 'Plan', hint: { shelf: 'Calendar and timeline', pantry: 'Arcs and calendar' }, shortcut: 'modePlan' },
];

export const VIEWS: Record<Exclude<Mode, 'cook'>, Record<Side, { id: ViewId; name: string }[]>> = {
  prep: {
    shelf: [
      { id: 'outline', name: 'Outline' },
      { id: 'board', name: 'Board' },
    ],
    pantry: [
      { id: 'atlas', name: 'Atlas' },
      { id: 'pboard', name: 'Board' },
    ],
  },
  plan: {
    shelf: [
      { id: 'calendar', name: 'Calendar' },
      { id: 'timeline', name: 'Timeline' },
    ],
    pantry: [
      { id: 'arcs', name: 'Arcs' },
      { id: 'pcalendar', name: 'Calendar' },
    ],
  },
};

export type Spot = [number, number];

export interface ModePrefs {
  /** The view last used, by "prep:shelf", "plan:pantry" and so on. */
  view: Record<string, ViewId>;
  outline: { columns: string[] };
  board: { layout: 'grid' | 'free'; rows: 'none' | 'label' | 'status' };
  pboard: { layout: 'grid' | 'free'; rows: 'none' | 'label' };
  /** Where things lie on the free boards and the atlas, by board and then by the Item's id. */
  spots: Record<string, Record<string, Spot>>;
  atlas: { kinds: string[]; near: boolean };
  calendar: { span: 'month' | 'year'; at: string | null };
  timeline: { lanes: 'group' | 'label'; px: number };
  arcs: { kinds: string[]; quiet: boolean };
  /** The writer's names for the label colours when they stand for plotlines. */
  plotlines: Record<string, string>;
  /**
   * Items taken out of Prep or out of Plan with Remove, by id. Only the view leaves them out: the
   * Item itself is untouched, and dragging it in from the Shelf or Pantry brings it back.
   */
  hidden: { prep: string[]; plan: string[] };
}

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
  board: { layout: 'grid', rows: 'none' },
  pboard: { layout: 'grid', rows: 'none' },
  spots: {},
  atlas: { kinds: ['character', 'setting', 'research'], near: false },
  calendar: { span: 'month', at: null },
  timeline: { lanes: 'group', px: 18 },
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
  const px = Number(part('timeline').px);
  return {
    view: part('view'),
    outline: { columns: Array.isArray(part('outline').columns) ? part('outline').columns.filter((c) => typeof c === 'string') : DEFAULT_PREFS.outline.columns },
    board: part('board'),
    pboard: part('pboard'),
    spots: part('spots'),
    atlas: part('atlas'),
    calendar: part('calendar'),
    timeline: { ...part('timeline'), px: Number.isFinite(px) ? Math.max(MIN_PX, Math.min(MAX_PX, px)) : DEFAULT_PREFS.timeline.px },
    arcs: part('arcs'),
    plotlines: part('plotlines'),
    hidden: { prep: ids(part('hidden').prep), plan: ids(part('hidden').plan) },
  };
}

/** How wide a day is on the timeline, at its closest and furthest. */
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

/** The view to show: the one last used here, if this side still has it. */
export function viewOf(prefs: ModePrefs, mode: Exclude<Mode, 'cook'>, side: Side): ViewId {
  const views = VIEWS[mode][side];
  const last = prefs.view[`${mode}:${side}`];
  return views.some((v) => v.id === last) ? last! : views[0]!.id;
}
