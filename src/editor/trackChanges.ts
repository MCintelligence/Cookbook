import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Fragment, type Node as PMNode, type MarkType, Slice } from '@tiptap/pm/model';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Mapping, ReplaceStep } from '@tiptap/pm/transform';
import { type EditorView } from '@tiptap/pm/view';
import { type NodeJSON } from './markdown';

/**
 * Track changes: with Suggest changes on, what the writer types is marked as
 * an insertion and what they delete stays on the page, struck through, as a
 * deletion. Each change can then be accepted or rejected.
 *
 * Only text is tracked. Splitting or joining paragraphs (Enter, and Backspace
 * at the start of one), formatting and styles take effect straight away, as
 * they would with Suggest changes off.
 *
 * In the file, a change is a span like any other: [new words]{.ins} and
 * [old words]{.del} (see markdown.ts).
 */

export const INSERTION = 'insertion';
export const DELETION = 'deletion';

/** A transaction with this meta set to true is never tracked: accepting, rejecting, rolling back to a snapshot. */
export const UNTRACKED = 'cbUntracked';

/** Suggest changes is a Recipe setting (book.json `suggest`), so it is the same for every page open. */
let suggesting = false;
const listeners = new Set<(on: boolean) => void>();

export function isSuggesting(): boolean {
  return suggesting;
}

export function setSuggesting(on: boolean): void {
  if (suggesting === on) return;
  suggesting = on;
  for (const l of listeners) l(on);
}

export function onSuggesting(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const Insertion = Mark.create({
  name: INSERTION,
  // Typing at either end of a suggestion with Suggest changes off is not a suggestion.
  inclusive: false,
  excludes: DELETION,
  parseHTML() {
    return [{ tag: 'ins[data-change]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { 'data-change': '', class: 'cb-ins' }), 0];
  },
});

export const Deletion = Mark.create({
  name: DELETION,
  inclusive: false,
  excludes: INSERTION,
  parseHTML() {
    // Before Strike, which also reads <del>; only Cookbook's own deletions carry data-change.
    return [{ tag: 'del[data-change]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { 'data-change': '', class: 'cb-del' }), 0];
  },
});

export const trackKey = new PluginKey('trackChanges');

/** Whether a transaction is the writer's own edit, which Suggest changes should mark. */
function tracked(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(UNTRACKED) || isHistoryTransaction(tr)) return false;
  // Other plugins' tidying up, and changes kept out of undo (a page loading, the undo log catching up).
  if (tr.getMeta('appendedTransaction') || tr.getMeta('addToHistory') === false) return false;
  return true;
}

/** The deleted content, with the writer's own suggestions taken out (deleting them just removes them) and the rest marked as deleted. */
function asDeleted(fragment: Fragment, del: MarkType, ins: MarkType): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isInline) {
      if (ins.isInSet(node.marks)) return;
      out.push(node.mark(del.create().addToSet(node.marks)));
    } else out.push(node.copy(asDeleted(node.content, del, ins)));
  });
  return Fragment.fromArray(out);
}

function hasInline(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (node.isInline) found = true;
    return !found;
  });
  return found;
}

interface Change {
  /** The new content, in the finished document. */
  from: number;
  to: number;
  /** What the step took out, from the document before it. */
  removed: Slice;
  /** Where the step's deletion started and ended, before it. */
  stepFrom: number;
  stepTo: number;
}

/**
 * Turns the writer's edits into suggestions: new text is marked as inserted,
 * and removed text is put back, marked as deleted. Runs only while Suggest
 * changes is on, after the edit, so typing, pasting, input rules and the
 * proofreader's fixes are all tracked the same way.
 */
export function suggestTransaction(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState, composing = false): Transaction | null {
  if (composing || !transactions.some(tracked)) return null;
  const ins = newState.schema.marks[INSERTION];
  const del = newState.schema.marks[DELETION];
  if (!ins || !del) return null;
  const changes: Change[] = [];
  transactions.forEach((t, i) => {
    if (!tracked(t)) return;
    t.steps.forEach((step, s) => {
      if (!(step instanceof ReplaceStep)) return;
      const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
      const after = new Mapping();
      // Map by map: appending a sliced Mapping would take in the maps before the slice too.
      t.mapping.maps.slice(s + 1).forEach((m) => after.appendMap(m));
      for (const later of transactions.slice(i + 1)) later.mapping.maps.forEach((m) => after.appendMap(m));
      changes.push({
        from: after.map(from, -1),
        to: after.map(from + slice.size, 1),
        removed: t.docs[s]!.slice(from, to),
        stepFrom: from,
        stepTo: to,
      });
    });
  });
  if (changes.length === 0) return null;

  const tr = newState.tr;
  let backspaced: number | null = null;
  for (const change of changes) {
    const a = tr.mapping.map(change.from, -1);
    const b = tr.mapping.map(change.to, 1);
    if (b > a) {
      tr.removeMark(a, b, del);
      tr.addMark(a, b, ins.create());
    }
    const back = asDeleted(change.removed.content, del, ins);
    // Only text comes back: joining two paragraphs, or taking out an empty one, just happens.
    if (!hasInline(back)) continue;
    const before = tr.doc.content.size;
    tr.replace(a, a, new Slice(back, change.removed.openStart, change.removed.openEnd));
    const put = tr.doc.content.size - before;
    // Backspace leaves the cursor before what it struck through, so the next press strikes the letter before.
    const old = oldState.selection;
    if (changes.length === 1 && b === a && old.empty && old.head === change.stepTo && change.stepTo > change.stepFrom) backspaced = a;
    else if (changes.length === 1 && b === a) tr.setSelection(TextSelection.create(tr.doc, Math.min(a + put, tr.doc.content.size)));
  }
  if (backspaced !== null) tr.setSelection(TextSelection.create(tr.doc, backspaced));
  if (!tr.docChanged) return null;
  return tr.setMeta(UNTRACKED, true).setMeta(trackKey, true);
}

export const TrackChanges = Extension.create({
  name: 'trackChanges',
  addExtensions() {
    return [Insertion, Deletion];
  },
  addProseMirrorPlugins() {
    let view: EditorView | null = null;
    return [
      new Plugin({
        key: trackKey,
        view(v) {
          view = v;
          return { destroy: () => void (view = null) };
        },
        appendTransaction(transactions, oldState, newState) {
          if (!suggesting) return null;
          return suggestTransaction(transactions, oldState, newState, !!view?.composing);
        },
      }),
    ];
  },
});

// ---------- finding, accepting and rejecting changes ----------

export interface ChangeRange {
  from: number;
  to: number;
}

function isChange(node: PMNode): boolean {
  return node.marks.some((m) => m.type.name === INSERTION || m.type.name === DELETION);
}

/** Every change in a document, in order: each a run of suggested text, where a deletion next to an insertion is one change (a word replaced). */
export function changesIn(doc: PMNode, from = 0, to = doc.content.size): ChangeRange[] {
  const out: ChangeRange[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    if (!isChange(node)) return false;
    const last = out[out.length - 1];
    if (last && last.to === pos) last.to = pos + node.nodeSize;
    else out.push({ from: pos, to: pos + node.nodeSize });
    return false;
  });
  return out;
}

/** Whether a document has any changes waiting. */
export function hasChanges(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isInline && isChange(node)) found = true;
    return !found;
  });
  return found;
}

/** The change the cursor is in or touching, or the changes inside the selection. */
export function changesAt(state: EditorState): ChangeRange[] {
  const { from, to, empty } = state.selection;
  if (!empty) return changesIn(state.doc, from, to).map((c) => ({ from: Math.max(c.from, from), to: Math.min(c.to, to) }));
  const $pos = state.doc.resolve(from);
  const block = $pos.parent;
  if (!block.isTextblock) return [];
  const start = $pos.start();
  return changesIn(state.doc, start, start + block.content.size).filter((c) => c.from <= from && from <= c.to);
}

/**
 * Accepts (keeps insertions, removes deletions) or rejects (the other way
 * round) the changes between `from` and `to`. A paragraph that is left with
 * nothing in it, where it had only suggested text, goes as well.
 */
export function settle(tr: Transaction, from: number, to: number, accept: boolean): Transaction {
  const { schema } = tr.doc.type;
  const ins = schema.marks[INSERTION]!;
  const del = schema.marks[DELETION]!;
  const goes = accept ? del : ins;
  const stays = accept ? ins : del;
  const cuts: ChangeRange[] = [];
  const emptied: ChangeRange[] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && pos >= from - 1 && pos + node.nodeSize <= to + 1 && node.content.size > 0) {
      let all = true;
      node.forEach((child) => {
        if (!goes.isInSet(child.marks)) all = false;
      });
      // Only top-level paragraphs are taken out whole: a list item or table cell must keep one.
      if (all && tr.doc.resolve(pos).depth === 0) {
        emptied.push({ from: pos, to: pos + node.nodeSize });
        return false;
      }
    }
    if (node.isInline && goes.isInSet(node.marks)) cuts.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to) });
    return !node.isInline;
  });
  tr.removeMark(from, to, stays);
  const all = [...cuts, ...emptied].sort((a, b) => b.from - a.from);
  for (const r of all) {
    // Never leave the page without a paragraph to type in.
    if (emptied.includes(r) && tr.doc.childCount === 1) tr.delete(r.from + 1, r.to - 1);
    else tr.delete(r.from, r.to);
  }
  return tr.setMeta(UNTRACKED, true);
}

/** Accepts or rejects the change at the cursor, or every change in the selection. Returns false when there is none. */
export function settleAt(view: EditorView, accept: boolean): boolean {
  const ranges = changesAt(view.state);
  if (ranges.length === 0) return false;
  const tr = view.state.tr;
  for (const r of [...ranges].reverse()) settle(tr, r.from, r.to, accept);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Accepts or rejects every change on the page. Returns how many there were. */
export function settleAll(view: EditorView, accept: boolean): number {
  const n = changesIn(view.state.doc).length;
  if (n === 0) return 0;
  view.dispatch(settle(view.state.tr, 0, view.state.doc.content.size, accept));
  return n;
}

/** Selects the next (or previous) change after the cursor, going round from the end. Returns false when the page has none. */
export function goToChange(view: EditorView, dir: 1 | -1): boolean {
  const all = changesIn(view.state.doc);
  if (all.length === 0) return false;
  const { from, to } = view.state.selection;
  const next = dir > 0 ? (all.find((c) => c.from >= to && !(c.from === from && c.to === to)) ?? all[0]!) : ([...all].reverse().find((c) => c.to <= from) ?? all[all.length - 1]!);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, next.from, next.to)).scrollIntoView());
  view.focus();
  return true;
}

// ---------- the file, without editing ----------

/** A document as it would read with every change accepted, for Plate, Serve and exports. */
export function acceptedJSON(node: NodeJSON): NodeJSON {
  if (!node.content) return node;
  const content = node.content
    .filter((child) => !child.marks?.some((m) => m.type === DELETION))
    .map((child) => {
      const out = acceptedJSON(child);
      if (!child.marks) return out;
      const kept = child.marks.filter((m) => m.type !== INSERTION);
      const copy = { ...out };
      if (kept.length > 0) copy.marks = kept;
      else delete copy.marks;
      return copy;
    });
  return { ...node, content };
}

/** A text block's words, leaving out text suggested for deletion; the same as textBetween when there is none. */
export function liveText(block: PMNode): string {
  const plain = block.textBetween(0, block.content.size, ' ');
  if (!block.type.schema.marks[DELETION] || !plain) return plain;
  let any = false;
  block.descendants((n) => {
    if (n.isInline && n.marks.some((m) => m.type.name === DELETION)) any = true;
    return !any;
  });
  if (!any) return plain;
  let text = '';
  let first = true;
  block.descendants((n) => {
    if (n.isTextblock) {
      if (!first) text += ' ';
      first = false;
      return true;
    }
    if (n.isText && !n.marks.some((m) => m.type.name === DELETION)) text += n.text;
    return true;
  });
  return text;
}
