import { useEffect } from 'react';
import { type ModePrefs, onPrefsEdit, prefsStore, setPrefs } from './prefs';

/**
 * What a board keeps of its own in modes.json: a part of the prefs (where cards lie, the lines,
 * the shapes and colours, the board-only cards) and, for those kept by mode rather than by board,
 * which key of it (the free board's Items taken out of Prep are `['hidden', 'prep']`).
 */
export type Kept = 'spots' | 'lines' | 'looks' | 'notes' | ['hidden', 'prep' | 'plan'];
const partOf = (k: Kept, name: string): [keyof ModePrefs, string] => (Array.isArray(k) ? k : [k, name]);
type Snapshot = unknown[];

/** How many steps back a board remembers. */
const DEPTH = 100;

/** A board's own part of the prefs, as one snapshot. */
export function snapshotOf(prefs: ModePrefs, name: string, kept: Kept[]): Snapshot {
  return kept.map((k) => {
    const [part, key] = partOf(k, name);
    return (prefs[part] as unknown as Record<string, unknown>)[key];
  });
}

/** The prefs with a board's part put back to `snap`. */
export function restoreOf(prefs: ModePrefs, name: string, kept: Kept[], snap: Snapshot): Partial<ModePrefs> {
  const out: Record<string, unknown> = {};
  kept.forEach((k, i) => {
    const [part, key] = partOf(k, name);
    const { [key]: _was, ...rest } = (out[part] ?? prefs[part]) as Record<string, unknown>;
    out[part] = snap[i] === undefined ? rest : { ...rest, [key]: snap[i] };
  });
  return out as Partial<ModePrefs>;
}

/**
 * Undo and redo for one board. Every change the writer makes to the board's part of the prefs is
 * a step, whichever control made it. A recipe being read in is not a change (it never comes
 * through setPrefs), and the steps go with the recipe they were made in.
 */
export function boardHistory(name: string, kept: Kept[]) {
  const back: Snapshot[] = [];
  const ahead: Snapshot[] = [];
  let stepping = false;
  const same = (a: Snapshot, b: Snapshot) => a.every((v, i) => v === b[i]);
  let recipe = prefsStore.get();
  const off = onPrefsEdit((before) => {
    const now = prefsStore.get();
    // The recipe changed under us (another one was opened): its steps are not this one's.
    if (before !== recipe) {
      back.length = 0;
      ahead.length = 0;
    }
    recipe = now;
    const was = snapshotOf(before, name, kept);
    if (stepping || same(was, snapshotOf(now, name, kept))) return;
    back.push(was);
    if (back.length > DEPTH) back.shift();
    ahead.length = 0;
  });
  const step = (from: Snapshot[], to: Snapshot[]): boolean => {
    if (prefsStore.get() !== recipe) {
      back.length = 0;
      ahead.length = 0;
      return false;
    }
    const snap = from.pop();
    if (!snap) return false;
    to.push(snapshotOf(prefsStore.get(), name, kept));
    stepping = true;
    try {
      setPrefs((now) => restoreOf(now, name, kept, snap));
    } finally {
      stepping = false;
    }
    return true;
  };
  return { undo: () => step(back, ahead), redo: () => step(ahead, back), stop: off };
}

/** A text box, which keeps ⌘Z for its own words. */
const inBox = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');

/**
 * ⌘Z and ⌘⇧Z (Ctrl+Z, Ctrl+Y) for a free board or the atlas while it is on screen: moving cards,
 * drawing and changing lines, shapes and colours, and laying cards out all step back and forward.
 */
export function useBoardUndo(name: string, kept: Kept[]): void {
  useEffect(() => {
    const history = boardHistory(name, kept);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || inBox(e.target) || document.querySelector('.menu, [role="dialog"]')) return;
      const k = e.key.toLowerCase();
      const redo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey);
      if (k !== 'z' && !redo) return;
      e.preventDefault();
      if (redo) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      history.stop();
      window.removeEventListener('keydown', onKey);
    };
  }, [name]);
}
