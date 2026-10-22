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
  /** **bold**, _italic_, # headings and the like as you type. */
  markdown: boolean;
  /** - for bullets, -1 for numbers, -TD for a checklist, * * * for a scene break. */
  lineStarters: boolean;
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
  /** In the desktop app, where new books go; empty for Cookbook's own folder. */
  newBooksFolder: string;
  /** Shortcuts the writer changed, by command id. */
  shortcuts: Record<string, string>;
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
  lineStarters: true,
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
  newBooksFolder: '',
  shortcuts: {},
};

const KEY = 'cookbook.settings';
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
  const bar = { light: '#F6EEDF', dark: '#1E1A17', sepia: '#EAD9BB' }[theme];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = bar;
}

/** Keeps the look in step with the settings and with the system's light or dark mode. */
export function watchLook(): void {
  applyLook(current);
  subscribeSettings(() => applyLook(current));
  matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyLook(current));
}
