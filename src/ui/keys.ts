/** True on a Mac, iPhone or iPad, where shortcuts use ⌘ rather than Ctrl. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A shortcut as this computer writes it: "Mod-Alt-M" is ⌘⌥M on a Mac and Ctrl+Alt+M elsewhere. */
export function keys(shortcut: string): string {
  const parts = shortcut.split('-');
  if (IS_MAC) return parts.map((p) => ({ Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' })[p] ?? p).join('');
  return parts.map((p) => ({ Mod: 'Ctrl' })[p] ?? p).join('+');
}
