import { useSyncExternalStore } from 'react';
import { FONTS } from './styles/styles';
import { isTauri } from './storage/platform';

/**
 * The fonts installed on this computer, offered in the font menus after
 * Cookbook's own. Nothing leaves the computer.
 *
 * - Desktop app: read from the system's font folders on Windows, macOS and Linux.
 * - Chrome and Edge: the full list once the writer allows it (the browser asks
 *   once), and a short list of common fonts until then.
 * - Firefox and Safari: the browser doesn't share the list, so common fonts are
 *   tried one by one and the ones that draw are offered. Safari only answers for
 *   the fonts that come with macOS.
 */
export interface FontList {
  /** Installed font names, sorted, without Cookbook's own. */
  system: string[];
  /** True when `system` is everything installed, not a guess from common names. */
  complete: boolean;
  /** True when the browser can show every installed font if the writer allows it. */
  canAsk: boolean;
}

interface LocalFontData {
  family: string;
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

/** Common fonts on Windows, macOS and Linux, tried when the browser won't list them. */
export const COMMON_FONTS = [
  'American Typewriter', 'Arial', 'Athelas', 'Avenir', 'Avenir Next', 'Baskerville', 'Big Caslon', 'Book Antiqua', 'Bookman Old Style',
  'Calibri', 'Cambria', 'Candara', 'Cantarell', 'Century Gothic', 'Century Schoolbook', 'Charter', 'Cochin', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier New', 'Crimson Text', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Didot', 'Franklin Gothic Medium',
  'Futura', 'Garamond', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Iowan Old Style', 'Liberation Mono',
  'Liberation Sans', 'Liberation Serif', 'Lucida Bright', 'Lucida Grande', 'Menlo', 'Monaco', 'New York', 'Noto Sans', 'Noto Serif', 'Optima',
  'Palatino', 'Palatino Linotype', 'PT Serif', 'Seravek', 'Segoe UI', 'SF Pro', 'Sitka Text', 'Source Serif Pro', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Ubuntu', 'Verdana',
];

const own = new Set<string>(FONTS.map((f) => f.toLowerCase()));
let list: FontList = { system: [], complete: false, canAsk: false };
const listeners = new Set<() => void>();
let started = false;

function publish(names: string[], complete: boolean, canAsk: boolean): void {
  const system = [...new Set(names.map((n) => n.trim()).filter((n) => n && !n.startsWith('.') && !own.has(n.toLowerCase())))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  list = { system, complete, canAsk };
  for (const l of listeners) l();
}

/** True when a font draws differently from the browser's own fallbacks, so it is installed. */
export function probeFonts(names: string[], measure = canvasMeasure()): string[] {
  if (!measure) return [];
  const sample = 'mmmmmmmmmmlli WQ@#0 Hamburgefonstiv';
  const bases = ['monospace', 'serif', 'sans-serif'];
  const plain = bases.map((b) => measure(sample, `72px ${b}`));
  return names.filter((name) => bases.some((b, i) => measure(sample, `72px "${name.replace(/"/g, '')}", ${b}`) !== plain[i]));
}

function canvasMeasure(): ((text: string, font: string) => number) | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  return (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

async function fromBrowser(): Promise<string[]> {
  const fonts = await window.queryLocalFonts!();
  return fonts.map((f) => f.family);
}

/** Looks for installed fonts once, without asking the writer anything. */
export function loadSystemFonts(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (isTauri()) {
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string[]>('system_fonts'))
      .then((names) => publish(names, true, false))
      .catch(() => publish(probeFonts(COMMON_FONTS), false, false));
    return;
  }
  const canAsk = typeof window.queryLocalFonts === 'function';
  publish(probeFonts(COMMON_FONTS), false, canAsk);
  if (!canAsk) return;
  // Allowed before: the full list comes without asking again.
  void navigator.permissions
    ?.query({ name: 'local-fonts' as PermissionName })
    .then((p) => (p.state === 'granted' ? fromBrowser().then((names) => publish(names, true, false)) : undefined))
    .catch(() => {});
}

/**
 * Asks the browser for every installed font. Must run from a click or a menu
 * pick, because Chrome only asks the writer then. Resolves to false if refused.
 */
export async function askForSystemFonts(): Promise<boolean> {
  if (typeof window.queryLocalFonts !== 'function') return false;
  try {
    const names = await fromBrowser();
    if (!names.length) return false;
    publish(names, true, false);
    return true;
  } catch {
    return false;
  }
}

export function useFontList(): FontList {
  loadSystemFonts();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
    () => list,
  );
}

/** Test hook: forget what was found. */
export function resetSystemFonts(): void {
  started = false;
  list = { system: [], complete: false, canAsk: false };
}
