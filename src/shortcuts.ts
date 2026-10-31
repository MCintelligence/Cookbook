import { getSettings, setSettings } from './settings';
import { isTauri } from './storage/platform';

/**
 * Every keyboard shortcut the writer can change. Bindings are written like
 * "Mod-Shift-F": Mod is ⌘ on a Mac and Ctrl elsewhere.
 */
export interface Shortcut {
  id: string;
  label: string;
  key: string;
}

/** True on a Mac, iPhone or iPad, where Mod is ⌘. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const SHORTCUTS: Shortcut[] = [
  { id: 'palette', label: 'Command palette', key: 'Mod-K' },
  { id: 'switcher', label: 'Go to an item or card', key: 'Mod-O' },
  { id: 'find', label: 'Search', key: 'Mod-F' },
  { id: 'shelf', label: 'Name from the Pantry', key: 'Mod-J' },
  { id: 'seasonings', label: 'Seasonings', key: 'Mod-Shift-S' },
  { id: 'focus', label: 'Oven Mode (focus)', key: 'Mod-Shift-F' },
  { id: 'footnote', label: 'Footnote', key: 'Mod-Alt-F' },
  { id: 'strong', label: 'Strong', key: 'Mod-B' },
  { id: 'emphasis', label: 'Emphasis', key: 'Mod-I' },
  { id: 'underline', label: 'Underline', key: 'Mod-U' },
  // The browser keeps Ctrl+N for a new window, so the web version adds Alt.
  { id: 'newScene', label: 'New item', key: isTauri() ? 'Mod-N' : 'Mod-Alt-N' },
  { id: 'bookread', label: 'Read the recipe', key: 'Mod-Shift-R' },
  // Between the open Item on its own and its whole Group as one page, keeping the cursor where it is.
  { id: 'mise', label: 'Mise en Place (the whole group)', key: 'Mod-Shift-G' },
  { id: 'settings', label: 'Settings', key: 'Mod-,' },
  // Cookbook saves as you type; this saves anything still waiting straight away and says so.
  { id: 'save', label: 'Save now', key: 'Mod-S' },
  // Moving around the window: F6 goes round the toolbar, Shelf, page and panels; Mod+1 to 5 jump to one.
  { id: 'nextArea', label: 'Next part of the window', key: 'F6' },
  { id: 'prevArea', label: 'Previous part of the window', key: 'Shift-F6' },
  { id: 'goPage', label: 'Go to the page', key: 'Mod-1' },
  { id: 'goShelf', label: 'Go to the Shelf', key: 'Mod-2' },
  { id: 'goPantry', label: 'Go to the Pantry', key: 'Mod-3' },
  { id: 'goSeasonings', label: 'Go to Seasonings', key: 'Mod-4' },
  { id: 'goToolbar', label: 'Go to the toolbar', key: 'Mod-5' },
  // Proofreading: the next or previous underlined issue, with its card open.
  { id: 'nextIssue', label: 'Next issue', key: 'F7' },
  { id: 'prevIssue', label: 'Previous issue', key: 'Shift-F7' },
  // A web browser keeps Ctrl+Page Up and Ctrl+Page Down for its own tabs, so these are the desktop app's.
  { id: 'prevItem', label: 'Previous item', key: isTauri() ? 'Mod-PageUp' : '' },
  { id: 'nextItem', label: 'Next item', key: isTauri() ? 'Mod-PageDown' : '' },
];

/** The binding in use for a command: the writer's own, or the default. */
export function binding(id: string): string {
  return getSettings().shortcuts[id] ?? SHORTCUTS.find((s) => s.id === id)?.key ?? '';
}

export function setBinding(id: string, key: string | null): void {
  const { [id]: _old, ...rest } = getSettings().shortcuts;
  const fallback = SHORTCUTS.find((s) => s.id === id)?.key;
  setSettings({ shortcuts: key && key !== fallback ? { ...rest, [id]: key } : rest });
}

/**
 * The key itself, as a binding names it. A letter is the one printed on the key, so on a French,
 * German or Dvorak keyboard Ctrl+K is the key marked K, as menus and Settings show it (the page's
 * own Mod-B and Mod-I already work this way). Where the key types no plain letter (a Russian or
 * Greek layout, or ⌥ on a Mac turning M into µ) the key's place on a US keyboard is used instead.
 * Digits always go by place, since French keyboards need Shift to type them.
 */
function keyName(e: KeyboardEvent): string {
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** The binding a key press makes, or null while only modifiers are held. */
export function bindingOf(e: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'].includes(e.key)) return null;
  // AltGr types letters like ń, € and @ on Windows and Linux, and reports itself as Ctrl+Alt; it's never a shortcut.
  if (!IS_MAC && e.getModifierState?.('AltGraph')) return null;
  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (IS_MAC && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyName(e));
  return parts.join('-');
}

/** Whether a key press is a command's shortcut. */
export function pressed(e: KeyboardEvent, id: string): boolean {
  const b = binding(id);
  return !!b && bindingOf(e)?.toLowerCase() === b.toLowerCase();
}

/** The command a key press belongs to, if any, from those given. */
export function commandFor(e: KeyboardEvent, ids: string[]): string | null {
  const b = bindingOf(e)?.toLowerCase();
  return (b && ids.find((id) => binding(id).toLowerCase() === b)) || null;
}

/** Whether shortcuts are shown with ⌘ and ⌥ rather than Ctrl and Alt. */
export function macStyle(): boolean {
  const style = getSettings().shortcutStyle;
  return style === 'auto' ? IS_MAC : style === 'mac';
}

/** A binding as the writer reads it: "Mod-Alt-M" is ⌘⌥M on a Mac and Ctrl+Alt+M elsewhere. */
export function keys(shortcut: string): string {
  const parts = shortcut.split('-').map((p, i, all) => (p === '' && i === all.length - 1 ? '-' : p)).filter(Boolean);
  if (macStyle()) return parts.map((p) => ({ Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' })[p] ?? p).join('');
  return parts.map((p) => ({ Mod: 'Ctrl' })[p] ?? p).join('+');
}

/** A command's shortcut as the writer reads it. */
export function keysFor(id: string): string {
  const b = binding(id);
  return b ? keys(b) : '';
}
