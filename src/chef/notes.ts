import { Extension } from '@tiptap/core';
import { type Editor } from '@tiptap/react';
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { type StorageAdapter } from '../storage/adapter';
import { getSettings } from '../settings';
import { createStore } from '../ui/store';

/**
 * Chef notes: comments in the margin, as in Word, that are only made and only seen in Chef Mode.
 *
 * They are kept with the recipe, in chef-notes.json beside book.json, by each Item's id, so they
 * travel with the folder and its backups and are still there the next time Chef Mode opens. They
 * are never part of an Item's text: nothing that reads the Items (Plate and Serve, export, Mise en
 * Place, search, the Seasonings) ever sees them.
 *
 * Each note remembers where it sits as positions in the Item's text and the words it was on. While
 * the Item is open (in Chef Mode or not) the positions follow every edit; when it opens again, the
 * words are looked for if the positions no longer hold them, as after an edit made somewhere else.
 */
export interface ChefReply {
  id: string;
  text: string;
  /** When it was written, as an ISO time. */
  at: string;
}

export interface ChefNote {
  id: string;
  from: number;
  to: number;
  /** The words it was put on, to find them again. Empty for a note on a place, not on words. */
  quote: string;
  text: string;
  at: string;
  resolved?: boolean;
  replies?: ChefReply[];
}

export const CHEF_NOTES_FILE = 'chef-notes.json';

/* ---------- Kept with the recipe ---------- */

/** Every Item's notes, by the Item's id, as the recipe's chef-notes.json has them. */
let kept: Record<string, ChefNote[]> = {};
let home: StorageAdapter | null = null;
let saving: { fs: StorageAdapter; timer: number } | null = null;
/** Goes up when a recipe's notes have been read, so the open Item can pick its own up. */
export const chefNotesRead = createStore(0);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

/** What a chef-notes.json says, leaving out anything damaged. */
export function readChefNotes(text: string): Record<string, ChefNote[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  const items = isRecord(raw) && isRecord(raw.items) ? raw.items : {};
  const out: Record<string, ChefNote[]> = {};
  for (const [item, list] of Object.entries(items)) {
    if (!Array.isArray(list)) continue;
    const notes = list.filter(isRecord).flatMap((n): ChefNote[] => {
      const id = str(n.id);
      if (!id) return [];
      const from = int(n.from);
      const replies = Array.isArray(n.replies)
        ? n.replies.filter(isRecord).map((r) => ({ id: str(r.id) || newId(), text: str(r.text), at: str(r.at) })).filter((r) => r.text)
        : [];
      return [{ id, from, to: Math.max(from, int(n.to)), quote: str(n.quote), text: str(n.text), at: str(n.at), ...(n.resolved === true && { resolved: true }), ...(replies.length > 0 && { replies }) }];
    });
    if (notes.length > 0) out[item] = notes;
  }
  return out;
}

export function writeChefNotes(items: Record<string, ChefNote[]>): string {
  const kept = Object.fromEntries(Object.entries(items).filter(([, list]) => list.length > 0));
  return JSON.stringify({ version: 1, items: kept }, null, 2) + '\n';
}

/** Reads the open recipe's notes. A recipe without any has none. */
export async function loadChefNotes(fs: StorageAdapter | null): Promise<void> {
  flushChefNotes();
  home = fs;
  kept = {};
  if (fs) {
    try {
      if (await fs.exists(CHEF_NOTES_FILE)) {
        const read = readChefNotes(await fs.readText(CHEF_NOTES_FILE));
        if (home === fs) kept = read;
      }
    } catch {
      // An unreadable file is as good as none.
    }
  }
  chefNotesRead.set(chefNotesRead.get() + 1);
}

function write(fs: StorageAdapter) {
  void fs.writeText(CHEF_NOTES_FILE, writeChefNotes(kept)).catch(() => {});
}

/** Writes anything waiting, before another recipe opens or the app closes. */
export function flushChefNotes(): void {
  if (!saving) return;
  window.clearTimeout(saving.timer);
  write(saving.fs);
  saving = null;
}

export function notesOf(item: string): ChefNote[] {
  return kept[item] ?? [];
}

/**
 * Keeps an Item's notes and writes the file a moment later. Called when a note is written or
 * changed, and when the words under the notes move, so typing is one write once it stops.
 */
function keep(item: string, notes: ChefNote[], wait: number) {
  const before = kept[item];
  if (before === notes || (!before && notes.length === 0)) return;
  if (notes.length > 0) kept = { ...kept, [item]: notes };
  else {
    const { [item]: _gone, ...rest } = kept;
    kept = rest;
  }
  const fs = home;
  if (!fs) return;
  if (saving) window.clearTimeout(saving.timer);
  saving = { fs, timer: window.setTimeout(() => ((saving = null), write(fs)), wait) };
}

/* ---------- On the page ---------- */

interface NotesState {
  /** The Item these notes belong to, once they have been put on it. */
  item: string | null;
  notes: ChefNote[];
  /** The note picked, by a click on it or on its words. */
  active: string | null;
  /** A note just made, waiting for its words to be typed. */
  fresh: string | null;
}

type NotesMeta =
  | { load: { item: string; notes: ChefNote[] } }
  | { notes: ChefNote[]; active?: string | null; fresh?: string | null }
  | { active: string | null };

export const chefNotesKey = new PluginKey<NotesState>('chefNotes');

/** Where a note's words are now: where they were if they are still there, otherwise the nearest place they are. */
export function placeNote(doc: PMNode, note: ChefNote): ChefNote {
  const size = doc.content.size;
  const from = Math.min(note.from, size);
  const to = Math.min(Math.max(note.to, from), size);
  if (!note.quote) return from === note.from && to === note.to ? note : { ...note, from, to };
  if (to > from && doc.textBetween(from, to, '\n', ' ') === note.quote) return from === note.from && to === note.to ? note : { ...note, from, to };
  const found = findText(doc, note.quote, note.from);
  if (found) return { ...note, ...found };
  // The words are gone: the note stays, on the place where they were.
  return { ...note, from, to: from };
}

/** The place of `text` inside one paragraph of the doc nearest to `near`, or null. */
export function findText(doc: PMNode, text: string, near: number): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Offsets in textContent are offsets in the paragraph only while it holds nothing but text,
    // so the paragraph's leaves are walked to turn one into a position.
    const content = node.textContent;
    for (let at = content.indexOf(text); at >= 0; at = content.indexOf(text, at + 1)) {
      const from = posOfOffset(node, pos, at);
      const to = posOfOffset(node, pos, at + text.length);
      if (from === null || to === null) continue;
      if (!best || Math.abs(from - near) < Math.abs(best.from - near)) best = { from, to };
    }
    return false;
  });
  return best;
}

function posOfOffset(block: PMNode, blockPos: number, offset: number): number | null {
  let seen = 0;
  let found: number | null = null;
  block.forEach((child, childOffset) => {
    if (found !== null) return;
    const length = child.isText ? child.text!.length : child.textContent.length;
    if (offset <= seen + length && child.isText) found = blockPos + 1 + childOffset + (offset - seen);
    seen += length;
  });
  if (found === null && offset === seen) found = blockPos + 1 + block.content.size;
  return found;
}

function mapNotes(notes: ChefNote[], tr: Transaction): ChefNote[] {
  let changed = false;
  const next = notes.map((n) => {
    // Typing just before or after a note's words doesn't take it in, as in Word.
    const from = tr.mapping.map(n.from, 1);
    const to = Math.max(from, tr.mapping.map(n.to, -1));
    if (from === n.from && to === n.to) return n;
    changed = true;
    return { ...n, from, to };
  });
  return changed ? next : notes;
}

function decorate(state: EditorState): DecorationSet {
  const s = chefNotesKey.getState(state);
  if (!s || s.notes.length === 0 || !getSettings().focus || !getSettings().chef.notes) return DecorationSet.empty;
  const marks: Decoration[] = [];
  for (const n of s.notes) {
    if (n.resolved) continue;
    const cls = `chef-mark${n.id === s.active ? ' on' : ''}`;
    if (n.to > n.from) marks.push(Decoration.inline(n.from, n.to, { class: cls, 'data-chef-note': n.id }));
    else {
      const pin = document.createElement('span');
      pin.className = `chef-pin${n.id === s.active ? ' on' : ''}`;
      pin.dataset.chefNote = n.id;
      marks.push(Decoration.widget(n.from, pin, { key: `chef-pin-${n.id}-${n.id === s.active}`, side: -1 }));
    }
  }
  return DecorationSet.create(state.doc, marks);
}

export const ChefNotes = Extension.create({
  name: 'chefNotes',
  addProseMirrorPlugins() {
    return [
      new Plugin<NotesState>({
        key: chefNotesKey,
        state: {
          init: () => ({ item: null, notes: [], active: null, fresh: null }),
          apply: (tr, s, _old, newState) => {
            const meta = tr.getMeta(chefNotesKey) as NotesMeta | undefined;
            let next = s;
            if (tr.docChanged && s.notes.length > 0) {
              const notes = mapNotes(s.notes, tr);
              if (notes !== s.notes) next = { ...next, notes };
            }
            if (meta && 'load' in meta) {
              const notes = meta.load.notes.map((n) => placeNote(newState.doc, n));
              return { item: meta.load.item, notes, active: null, fresh: null };
            }
            if (meta && 'notes' in meta) next = { ...next, notes: meta.notes, ...(meta.active !== undefined && { active: meta.active }), ...(meta.fresh !== undefined && { fresh: meta.fresh }) };
            else if (meta && 'active' in meta) next = { ...next, active: meta.active };
            return next;
          },
        },
        props: {
          decorations: decorate,
          handleClick: (view, pos) => {
            const s = chefNotesKey.getState(view.state);
            if (!s || s.notes.length === 0 || !getSettings().focus || !getSettings().chef.notes) return false;
            const hit = s.notes.filter((n) => !n.resolved && n.from <= pos && pos <= n.to && (n.to > n.from || n.from === pos));
            // The smallest note under the click, as nested comments are picked in Word.
            const id = hit.sort((a, b) => a.to - a.from - (b.to - b.from))[0]?.id ?? null;
            if (id !== s.active) view.dispatch(view.state.tr.setMeta(chefNotesKey, { active: id }));
            return false;
          },
        },
        view: () => ({
          update: (view, prev) => {
            const s = chefNotesKey.getState(view.state);
            const was = chefNotesKey.getState(prev);
            if (!s?.item || s.notes === was?.notes || s.item !== was?.item) return;
            // Words typed move the notes along: kept once the typing stops. A note written is kept straight away.
            const meta = view.state.doc === prev.doc ? 300 : 1500;
            keep(s.item, s.notes.map((n) => withQuote(view.state.doc, n)), meta);
          },
        }),
      }),
    ];
  },
});

function withQuote(doc: PMNode, n: ChefNote): ChefNote {
  if (n.to <= n.from) return n;
  const quote = doc.textBetween(n.from, n.to, '\n', ' ');
  return quote === n.quote ? n : { ...n, quote };
}

export function notesState(editor: Editor | null): NotesState | null {
  return editor && !editor.isDestroyed ? (chefNotesKey.getState(editor.state) ?? null) : null;
}

/** Puts an Item's kept notes on its page, once it opens. */
export function putNotesOn(editor: Editor, item: string): void {
  if (editor.isDestroyed) return;
  const s = notesState(editor);
  if (s?.item === item) return;
  editor.view.dispatch(editor.state.tr.setMeta(chefNotesKey, { load: { item, notes: notesOf(item) } } satisfies NotesMeta).setMeta('addToHistory', false));
}

/** Redraws the notes' marks, as when Chef Mode comes on or goes off. */
export function redrawNotes(editor: Editor): void {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(chefNotesKey, { active: notesState(editor)?.active ?? null } satisfies NotesMeta));
}

export function newId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function setNotes(editor: Editor, notes: ChefNote[], extra: { active?: string | null; fresh?: string | null } = {}) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(chefNotesKey, { notes, ...extra } satisfies NotesMeta).setMeta('addToHistory', false));
}

/** The word around a place with nothing selected, as Word puts a comment on the word the cursor is in. */
function wordAround(doc: PMNode, pos: number): { from: number; to: number } {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return { from: pos, to: pos };
  const text = $pos.parent.textContent;
  const offset = $pos.parentOffset;
  let a = offset;
  let b = offset;
  const word = /[\p{L}\p{N}'’-]/u;
  while (a > 0 && word.test(text[a - 1]!)) a--;
  while (b < text.length && word.test(text[b]!)) b++;
  const start = $pos.start();
  const from = posOfOffset($pos.parent, start - 1, a);
  const to = posOfOffset($pos.parent, start - 1, b);
  return from !== null && to !== null && to > from ? { from, to } : { from: pos, to: pos };
}

/** Adds a note on the words selected (or the word at the cursor), and opens it to be written. */
export function addChefNote(editor: Editor): string | null {
  const s = notesState(editor);
  if (!s?.item) return null;
  const { from: a, to: b, empty } = editor.state.selection;
  const { from, to } = empty ? wordAround(editor.state.doc, a) : { from: a, to: b };
  const note: ChefNote = { id: newId(), from, to, quote: to > from ? editor.state.doc.textBetween(from, to, '\n', ' ') : '', text: '', at: new Date().toISOString() };
  // Kept in order down the page, so the margin and the keyboard go through them top to bottom.
  const notes = [...s.notes, note].sort((x, y) => x.from - y.from || x.to - y.to);
  setNotes(editor, notes, { active: note.id, fresh: note.id });
  return note.id;
}

export function changeNote(editor: Editor, id: string, change: Partial<ChefNote> | ((n: ChefNote) => Partial<ChefNote>)): void {
  const s = notesState(editor);
  if (!s) return;
  setNotes(editor, s.notes.map((n) => (n.id === id ? { ...n, ...(typeof change === 'function' ? change(n) : change) } : n)), { fresh: s.fresh === id ? null : s.fresh });
}

export function deleteNote(editor: Editor, id: string): void {
  const s = notesState(editor);
  if (!s) return;
  setNotes(editor, s.notes.filter((n) => n.id !== id), { active: s.active === id ? null : s.active, fresh: s.fresh === id ? null : s.fresh });
}

export function pickNote(editor: Editor, id: string | null): void {
  const s = notesState(editor);
  if (!s || s.active === id || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(chefNotesKey, { active: id } satisfies NotesMeta));
}
