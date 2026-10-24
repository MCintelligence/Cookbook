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
  { id: 'switcher', label: 'Go to a page or card', key: 'Mod-O' },
  { id: 'find', label: 'Find', key: 'Mod-F' },
  { id: 'shelf', label: 'Pantry shelf', key: 'Mod-J' },
  { id: 'seasonings', label: 'Seasonings', key: 'Mod-Shift-S' },
  { id: 'focus', label: 'Focus mode', key: 'Mod-Shift-F' },
  { id: 'note', label: 'Note', key: 'Mod-Alt-M' },
  { id: 'footnote', label: 'Footnote', key: 'Mod-Alt-F' },
  { id: 'strong', label: 'Strong', key: 'Mod-B' },
  { id: 'emphasis', label: 'Emphasis', key: 'Mod-I' },
  { id: 'underline', label: 'Underline', key: 'Mod-U' },
  // The browser keeps Ctrl+N for a new window, so the web version adds Alt.
  { id: 'newScene', label: 'New page', key: isTauri() ? 'Mod-N' : 'Mod-Alt-N' },
  { id: 'bookread', label: 'Bookread', key: 'Mod-Shift-R' },
  { id: 'settings', label: 'Settings', key: 'Mod-,' },
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

/** The key itself, as a binding names it: letters upper case, and ⌥ on a Mac doesn't turn M into µ. */
function keyName(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** The binding a key press makes, or null while only modifiers are held. */
export function bindingOf(e: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null;
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
