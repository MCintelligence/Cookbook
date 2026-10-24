/**
 * What the toolbar's typeable Style and Size boxes do with the text in them.
 * Kept apart from the components so the rules can be tested.
 */

export const MIN_SIZE = 1;
export const MAX_SIZE = 400;

/**
 * Styles whose names start with the typed text, then those with a word that
 * does, ignoring case. Empty text matches everything.
 */
export function matchStyles<T extends { name: string }>(styles: readonly T[], text: string): T[] {
  const typed = text.trim().toLowerCase();
  if (!typed) return [...styles];
  const starts = styles.filter((s) => s.name.toLowerCase().startsWith(typed));
  const words = styles.filter((s) => !starts.includes(s) && s.name.toLowerCase().split(/[\s,]+/).some((w) => w.startsWith(typed)));
  return [...starts, ...words];
}

/** A typed size in points, to the nearest half point, or null if it isn't one Cookbook can use. */
export function parseSize(text: string): number | null {
  const n = Number(text.trim().replace(',', '.').replace(/\s*pt$/i, ''));
  if (!text.trim() || !Number.isFinite(n)) return null;
  const size = Math.round(n * 2) / 2;
  return size >= MIN_SIZE && size <= MAX_SIZE ? size : null;
}

/** One point up or down, landing on whole points first (10.5 goes to 11 or 10). */
export function stepSize(size: number, up: boolean): number {
  const next = up ? Math.floor(size) + 1 : Math.ceil(size) - 1;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, next));
}
