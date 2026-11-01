import { useSyncExternalStore } from 'react';
import { type BookLocation } from './storage/platform';

/**
 * Settings for the app on this device, kept in the browser's storage (or the
 * desktop app's). Settings for one book live in its book.json instead, so they
 * travel with it; see BookInfo.
 */

export type Theme = 'system' | 'light' | 'dark' | 'sepia';
export type Fade = 'paragraph' | 'sentence' | 'off';

export interface AppSettings {
  /** Opens the last book at the scene that was open, rather than at the Bookshelf. */
  reopenLast: boolean;
  /** How shortcuts are written: as this computer does, or always ⌘ or always Ctrl. */
  shortcutStyle: 'auto' | 'mac' | 'pc';
  theme: Theme;
  /** In a dark theme, the page can stay light like paper. */
  paper: 'theme' | 'paper';
  size: 'small' | 'medium' | 'large';
  reduceMotion: boolean;
  curlyQuotes: boolean;
  emDash: boolean;
  /** Markdown as a whole: when off, no rule below works, whatever its own switch says. */
  markdown: boolean;
  /** Each Markdown rule on its own (see MARKDOWN_RULES). */
  markdownRules: Record<MarkdownRule, boolean>;
  /** Typing @ (not after a letter) opens the Pantry shelf. */
  atShelf: boolean;
  /** Typing / at the start of a line (or after a space) opens the insert menu. */
  slashMenu: boolean;
  /** What focus mode leaves bright. */
  fade: Exclude<Fade, 'off'>;
  focus: boolean;
  typewriter: boolean;
  /** What ⌘V does: keep formatting, or paste plain text. */
  pastePlain: boolean;
  /** How long after the last key the scene is saved. */
  saveDelay: number;
  backupOnClose: boolean;
  /** Automatic backups kept per book; 0 keeps them all. */
  keepBackups: number;
  /** A snapshot of the scene before split, merge or replace all. */
  autoSnapshot: boolean;
  checkUpdates: boolean;
  /** A folder the writer chose for automatic backups, or null for Cookbook's own. */
  backupFolder: BookLocation | null;
  /** The writer was told once that backups sit on the same disk as their recipes. */
  backupDiskNudged: boolean;
  /** In the desktop app, where new books go; empty for Cookbook's own folder. */
  newBooksFolder: string;
  /** Shortcuts the writer changed, by command id. */
  shortcuts: Record<string, string>;
}

/**
 * The Markdown rules a writer can turn on and off one by one, in the order
 * Settings lists them. Each is a typing shortcut except drop caps, which is
 * how !Word is shown.
 */
export const MARKDOWN_RULES = [
  { id: 'bold', label: 'Bold', example: '**bold**' },
  { id: 'italic', label: 'Italic', example: '*italic*' },
  { id: 'underline', label: 'Underline', example: '_underline_' },
  { id: 'strike', label: 'Strikethrough', example: '~~struck~~' },
  { id: 'code', label: 'Code', example: '`code`' },
  { id: 'dropCap', label: 'Drop cap', example: '!Word' },
  { id: 'heading', label: 'Headings', example: '# , ## or ### at the start of a line' },
  { id: 'quote', label: 'Quote', example: '> at the start of a line' },
  { id: 'codeBlock', label: 'Code block', example: '``` at the start of a line' },
  { id: 'bullets', label: 'Bullets', example: '- at the start of a line' },
  { id: 'numbers', label: 'Numbered list', example: '-1 or 1. at the start of a line' },
  { id: 'checklist', label: 'Checklist', example: '-TD at the start of a line' },
  { id: 'sceneBreak', label: 'Section break', example: '* * * then Enter' },
] as const;
export type MarkdownRule = (typeof MARKDOWN_RULES)[number]['id'];

function allRules(on: boolean): Record<MarkdownRule, boolean> {
  return Object.fromEntries(MARKDOWN_RULES.map((r) => [r.id, on])) as Record<MarkdownRule, boolean>;
}

/** Whether a Markdown rule works now: Markdown is on, and so is the rule. */
export function markdownOn(rule: MarkdownRule, s: AppSettings = current): boolean {
  return s.markdown && s.markdownRules[rule];
}

export const DEFAULT_SETTINGS: AppSettings = {
  reopenLast: true,
  shortcutStyle: 'auto',
  theme: 'system',
  paper: 'theme',
  size: 'medium',
  reduceMotion: false,
  curlyQuotes: true,
  emDash: true,
  markdown: true,
  markdownRules: allRules(true),
  atShelf: true,
  slashMenu: true,
  fade: 'paragraph',
  focus: false,
  typewriter: false,
  pastePlain: false,
  saveDelay: 600,
  backupOnClose: true,
  keepBackups: 10,
  autoSnapshot: true,
  checkUpdates: true,
  backupFolder: null,
  backupDiskNudged: false,
  newBooksFolder: '',
  shortcuts: {},
};

const KEY = 'cookbook.settings';
const LINE_STARTERS: MarkdownRule[] = ['bullets', 'numbers', 'checklist', 'sceneBreak'];
const TYPED_MARKS: MarkdownRule[] = ['bold', 'italic', 'underline', 'strike', 'code', 'heading', 'quote', 'codeBlock'];
const CHOICES: { [K in keyof AppSettings]?: readonly unknown[] } = {
  shortcutStyle: ['auto', 'mac', 'pc'],
  theme: ['system', 'light', 'dark', 'sepia'],
  paper: ['theme', 'paper'],
  size: ['small', 'medium', 'large'],
  fade: ['paragraph', 'sentence'],
  saveDelay: [600, 1000, 5000],
  keepBackups: [10, 25, 0],
};

/** Reads saved settings, keeping only values this version understands. */
export function parseSettings(raw: string | null): AppSettings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    // Damaged settings start again from the defaults.
  }
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = saved[key];
    const choices = CHOICES[key as keyof AppSettings];
    if (choices ? choices.includes(value) : typeof value === typeof fallback && !Array.isArray(value) && value !== null) out[key] = value;
  }
  // Each rule a boolean, and any this version doesn't save yet on.
  const rules = saved.markdownRules && typeof saved.markdownRules === 'object' ? (saved.markdownRules as Record<string, unknown>) : {};
  out.markdownRules = Object.fromEntries(MARKDOWN_RULES.map((r) => [r.id, typeof rules[r.id] === 'boolean' ? rules[r.id] : true]));
  // Before the rules had their own switches, one switch turned the typed list starters and section break off together.
  // and the Markdown switch only the rest, so a writer who had one off keeps the other working.
  if (!saved.markdownRules) {
    const migrated = out.markdownRules as Record<MarkdownRule, boolean>;
    if (saved.lineStarters === false) for (const id of LINE_STARTERS) migrated[id] = false;
    if (saved.markdown === false) {
      out.markdown = true;
      for (const id of TYPED_MARKS) migrated[id] = false;
    }
  }
  out.shortcuts = Object.fromEntries(Object.entries(out.shortcuts as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return out as unknown as AppSettings;
}

function read(): AppSettings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current: AppSettings = typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : read();
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  return current;
}

export function setSettings(changes: Partial<AppSettings>): void {
  current = { ...current, ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Kept for this session only.
  }
  for (const l of listeners) l();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The settings, kept up to date as they change. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

// Another window of the app changing a setting changes it here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    current = read();
    for (const l of listeners) l();
  });
}

/** Whether the page is drawn dark, for the theme and the system's choice. */
export function darkPage(s: AppSettings, systemDark: boolean): boolean {
  return s.paper === 'theme' && (s.theme === 'dark' || (s.theme === 'system' && systemDark));
}

/** Puts the theme, size and motion settings on the page, where the CSS picks them up. */
export function applyLook(s: AppSettings, root: HTMLElement = document.documentElement): void {
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = s.theme === 'system' ? (systemDark ? 'dark' : 'light') : s.theme;
  root.dataset.theme = theme;
  root.dataset.page = darkPage(s, systemDark) ? 'dark' : 'light';
  root.dataset.size = s.size;
  root.toggleAttribute('data-reduce-motion', s.reduceMotion);
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  const bar = { light: '#FAFAF9', dark: '#181818', sepia: '#EAD9BB' }[theme];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = bar;
}

/** Keeps the look in step with the settings and with the system's light or dark mode. */
export function watchLook(): void {
  applyLook(current);
  subscribeSettings(() => applyLook(current));
  matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyLook(current));
}
