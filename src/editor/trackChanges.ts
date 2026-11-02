import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Fragment, type Mark as PMMark, type Node as PMNode, type MarkType, type Schema, Slice } from '@tiptap/pm/model';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { AddMarkStep, AttrStep, Mapping, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, canJoin } from '@tiptap/pm/transform';
import { type EditorView } from '@tiptap/pm/view';
import { type MarkJSON, type NodeJSON, BODY_STYLE, keyToMark, markKey } from './markdown';
import { parseParagraphFormat } from './format';

/**
 * Track changes: with Suggest changes on, what the writer types is marked as
 * an insertion and what they delete stays on the page, struck through, as a
 * deletion. Each change can then be accepted or rejected.
 *
 * Text, paragraph breaks and formatting are tracked:
 *
 * - Words typed are marked as inserted, words deleted stay on the page, marked as deleted.
 * - A new paragraph (Enter) marks the break before it as inserted (`change: 'ins'`
 *   on the paragraph after the break); joining two (Backspace at the start of
 *   one) keeps them apart and marks the break as deleted (`change: 'del'`).
 * - Bold, italic, character styles and font set by hand mark the words as
 *   reformatted, remembering how they looked before (the formatChange mark).
 * - A new paragraph style, alignment or spacing remembers the paragraph's
 *   look before (`was` on the paragraph).
 *
 * Only top-level paragraphs track their breaks and styles; lists and tables
 * change straight away. In the file, a change is a span or a fence like any
 * other: [new words]{.ins}, [old words]{.del}, [words]{.fmt was="*i"} and
 * ::: {change=ins was="body"} (see markdown.ts and format.ts).
 */

export const INSERTION = 'insertion';
export const DELETION = 'deletion';
export const FORMAT_CHANGE = 'formatChange';

/** The marks that are formatting, whose changes are suggestions: not notes, links or the changes themselves. */
const FORMATTING = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'charStyle', 'textStyle']);

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

export const FormatChange = Mark.create({
  name: FORMAT_CHANGE,
  inclusive: false,
  addAttributes() {
    return {
      // The formatting the words had before, as mark keys (see markdown.ts), so rejecting puts it back.
      was: { default: '', parseHTML: (el) => el.getAttribute('data-was') ?? '', renderHTML: (attrs) => ({ 'data-was': attrs.was }) },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-format-change]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-format-change': '', class: 'cb-fmt', title: 'Formatting changed' }), 0];
  },
});

// ---------- formatting, written down ----------

/** Words' formatting as one string, the same whatever order the marks are in. */
export function formatOfJSON(marks: readonly MarkJSON[] | undefined): string {
  return (marks ?? [])
    .filter((m) => FORMATTING.has(m.type))
    .map((m) => encodeURIComponent(markKey(m)))
    .sort()
    .join(' ');
}

export function formatOf(marks: readonly PMMark[]): string {
  return formatOfJSON(marks.map((m) => m.toJSON() as MarkJSON));
}

/** The marks a `was` string stands for, as JSON; ones it can't read are left out. */
export function formatMarksJSON(was: string): MarkJSON[] {
  const out: MarkJSON[] = [];
  for (const key of was.split(' ').filter(Boolean)) {
    try {
      const mark = keyToMark(decodeURIComponent(key));
      if (FORMATTING.has(mark.type)) out.push(mark);
    } catch {
      // A key that doesn't decode is left out.
    }
  }
  return out;
}

function formatMarks(was: string, schema: Schema): PMMark[] {
  const out: PMMark[] = [];
  for (const m of formatMarksJSON(was)) {
    try {
      out.push(schema.markFromJSON(m));
    } catch {
      // A style the schema can't make is left out.
    }
  }
  return out;
}

/** A paragraph's look, its style and anything set by hand: "letter align=center spacing=2". */
export function paragraphLook(attrs: Record<string, unknown> | undefined): string {
  return [(attrs?.style as string) || BODY_STYLE, attrs?.align ? `align=${String(attrs.align)}` : '', attrs?.lineSpacing ? `spacing=${String(attrs.lineSpacing)}` : ''].filter(Boolean).join(' ');
}

/** The paragraph attributes a look stands for. */
export function lookAttrs(was: string): { style: string; align: string | null; lineSpacing: number | null } {
  const [style, ...rest] = was.split(' ');
  const f = parseParagraphFormat(rest.join(' '));
  return { style: style || BODY_STYLE, align: f.align ?? null, lineSpacing: f.lineSpacing ?? null };
}

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
  /** Whether taking it out joined two paragraphs. */
  joined: boolean;
}

/** Words reformatted, in the finished document, and how they looked before. */
interface Reformat {
  from: number;
  to: number;
  was: string;
}

/** A paragraph restyled, where it starts in the finished document, and its look before. */
interface Restyle {
  pos: number;
  was: string;
}

/** The top-level paragraphs that start between `from` and `to` and follow another paragraph: each is a paragraph break. */
function breaksBetween(doc: PMNode, from: number, to: number): number[] {
  const out: number[] = [];
  doc.forEach((node, pos, index) => {
    if (pos < from || pos >= to || index === 0 || node.type.name !== 'paragraph') return;
    if (doc.child(index - 1).type.name === 'paragraph') out.push(pos);
  });
  return out;
}

/**
 * Turns the writer's edits into suggestions: new text is marked as inserted,
 * and removed text is put back, marked as deleted. New paragraph breaks are
 * marked as inserted and joined paragraphs are split again, with the break
 * marked as deleted. New formatting and paragraph styles remember the old.
 * Runs only while Suggest changes is on, after the edit, so typing, pasting,
 * input rules and the proofreader's fixes are all tracked the same way.
 */
export function suggestTransaction(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState, composing = false): Transaction | null {
  if (composing || !transactions.some(tracked)) return null;
  const { schema } = newState;
  const ins = schema.marks[INSERTION];
  const del = schema.marks[DELETION];
  const fmt = schema.marks[FORMAT_CHANGE];
  if (!ins || !del || !fmt) return null;
  const changes: Change[] = [];
  const reformats: Reformat[] = [];
  const restyles: Restyle[] = [];
  transactions.forEach((t, i) => {
    if (!tracked(t)) return;
    t.steps.forEach((step, s) => {
      // Map by map: appending a sliced Mapping would take in the maps before the slice too.
      const mapping = (own: boolean) => {
        const m = new Mapping();
        t.mapping.maps.slice(own ? s : s + 1).forEach((map) => m.appendMap(map));
        for (const later of transactions.slice(i + 1)) later.mapping.maps.forEach((map) => m.appendMap(map));
        return m;
      };
      const before = t.docs[s]!;
      if (step instanceof ReplaceStep) {
        const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
        const after = mapping(false);
        changes.push({
          from: after.map(from, -1),
          to: after.map(from + slice.size, 1),
          removed: before.slice(from, to),
          stepFrom: from,
          stepTo: to,
          joined: breaksBetween(before, from, to).length > 0,
        });
      } else if ((step instanceof AddMarkStep || step instanceof RemoveMarkStep) && FORMATTING.has(step.mark.type.name)) {
        const after = mapping(true);
        before.nodesBetween(step.from, step.to, (node, pos) => {
          if (!node.isText) return true;
          // Formatting words that are themselves a suggestion just formats them.
          if (ins.isInSet(node.marks)) return false;
          const was = (fmt.isInSet(node.marks)?.attrs.was as string | undefined) ?? formatOf(node.marks);
          reformats.push({ from: after.map(Math.max(pos, step.from), 1), to: after.map(Math.min(pos + node.nodeSize, step.to), -1), was });
          return false;
        });
      } else if (step instanceof ReplaceAroundStep || step instanceof AttrStep) {
        const after = mapping(true);
        const [from, to] = step instanceof AttrStep ? [step.pos, step.pos + 1] : [(step as unknown as { from: number }).from, (step as unknown as { to: number }).to];
        before.forEach((node, pos) => {
          if (pos < from || pos >= to || node.type.name !== 'paragraph' || node.attrs.change === 'ins') return;
          restyles.push({ pos: after.map(pos, -1), was: (node.attrs.was as string | null) ?? paragraphLook(node.attrs) });
        });
      }
    });
  });
  if (changes.length === 0 && reformats.length === 0 && restyles.length === 0) return null;

  const tr = newState.tr;
  let cursor: { pos: number; bias: 1 | -1 } | null = null;
  for (const change of changes) {
    const a = tr.mapping.map(change.from, -1);
    const b = tr.mapping.map(change.to, 1);
    if (b > a) {
      tr.removeMark(a, b, del);
      tr.addMark(a, b, ins.create());
      // A new paragraph: the break before it is a suggestion.
      for (const pos of breaksBetween(tr.doc, a, b)) {
        const node = tr.doc.nodeAt(pos)!;
        if (node.attrs.change !== 'ins') tr.setNodeMarkup(pos, undefined, { ...node.attrs, change: 'ins', was: null });
      }
    }
    const back = asDeleted(change.removed.content, del, ins);
    const { joined } = change;
    // Text comes back, and so does a paragraph break taken out; taking out an empty list item or the like just happens.
    if (!hasInline(back) && !joined) continue;
    const size = tr.doc.content.size;
    tr.replace(a, a, new Slice(back, change.removed.openStart, change.removed.openEnd));
    const put = tr.doc.content.size - size;
    if (joined) {
      // The breaks put back are suggested for deletion, unless they were the writer's own suggestion, which just goes.
      for (const pos of breaksBetween(tr.doc, a, a + put).reverse()) {
        const node = tr.doc.nodeAt(pos)!;
        if (node.attrs.change === 'ins' && canJoin(tr.doc, pos)) tr.join(pos);
        else if (node.attrs.change !== 'del') tr.setNodeMarkup(pos, undefined, { ...node.attrs, change: 'del' });
      }
    }
    const end = a + (tr.doc.content.size - size);
    // Backspace leaves the cursor before what it struck through, so the next press strikes the letter before.
    const old = oldState.selection;
    if (changes.length === 1 && b === a && old.empty && old.head === change.stepTo && change.stepTo > change.stepFrom) cursor = { pos: a, bias: -1 };
    else if (changes.length === 1 && b === a) cursor = { pos: Math.min(end, tr.doc.content.size), bias: 1 };
  }

  // Reformatted words remember their first look; when they look that way again, there is no change left.
  for (const r of [...reformats].reverse()) {
    const from = tr.mapping.map(r.from, 1);
    const to = tr.mapping.map(r.to, -1);
    if (to <= from) continue;
    const runs: { from: number; to: number; same: boolean }[] = [];
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      if (!ins.isInSet(node.marks)) runs.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to), same: formatOf(node.marks) === r.was });
      return false;
    });
    for (const run of runs) {
      if (run.same) tr.removeMark(run.from, run.to, fmt);
      else tr.addMark(run.from, run.to, fmt.create({ was: r.was }));
    }
  }
  for (const r of [...restyles].reverse()) {
    const pos = tr.mapping.map(r.pos, -1);
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph' || node.attrs.change === 'ins' || tr.doc.resolve(pos).depth !== 0) continue;
    const was = paragraphLook(node.attrs) === r.was ? null : r.was;
    if (node.attrs.was !== was) tr.setNodeMarkup(pos, undefined, { ...node.attrs, was });
  }

  if (cursor) tr.setSelection(Selection.near(tr.doc.resolve(Math.max(0, Math.min(cursor.pos, tr.doc.content.size))), cursor.bias));
  if (!tr.docChanged) return null;
  return tr.setMeta(UNTRACKED, true).setMeta(trackKey, true);
}

export const TrackChanges = Extension.create({
  name: 'trackChanges',
  addExtensions() {
    return [Insertion, Deletion, FormatChange];
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
  return node.marks.some((m) => m.type.name === INSERTION || m.type.name === DELETION || m.type.name === FORMAT_CHANGE);
}

/** A top-level paragraph's suggested break before it, as a range from the end of the paragraph before to the start of this one. */
function breakAt(doc: PMNode, node: PMNode, pos: number): ChangeRange | null {
  if (!node.attrs.change || pos === 0 || doc.resolve(pos).depth !== 0) return null;
  return { from: pos - 1, to: pos + 1 };
}

/**
 * Every change in a document, in order: each a run of suggested text, where a
 * deletion next to an insertion is one change (a word replaced) and a
 * suggested paragraph break joins the text either side of it. A restyled
 * paragraph is a change of its own, covering the paragraph.
 */
export function changesIn(doc: PMNode, from = 0, to = doc.content.size): ChangeRange[] {
  const runs: ChangeRange[] = [];
  const restyled: ChangeRange[] = [];
  const add = (r: ChangeRange) => {
    const last = runs[runs.length - 1];
    if (last && last.to >= r.from) last.to = Math.max(last.to, r.to);
    else runs.push({ ...r });
  };
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') {
      const brk = breakAt(doc, node, pos);
      if (brk && brk.to > from && brk.from < to) add(brk);
      if (node.attrs.was && doc.resolve(pos).depth === 0) restyled.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
    }
    if (!node.isInline) return true;
    if (isChange(node)) add({ from: pos, to: pos + node.nodeSize });
    return false;
  });
  return [...runs, ...restyled].sort((x, y) => x.from - y.from || x.to - y.to);
}

/** Whether a document has any changes waiting. */
export function hasChanges(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isInline ? isChange(node) : node.type.name === 'paragraph' && (!!node.attrs.change || !!node.attrs.was)) found = true;
    return !found;
  });
  return found;
}

/** The change the cursor is in or touching, or the changes inside the selection. */
export function changesAt(state: EditorState): ChangeRange[] {
  const { from, to, empty } = state.selection;
  const { doc } = state;
  if (!empty) return changesIn(doc, from, to).map((c) => ({ from: Math.max(c.from, from), to: Math.min(c.to, to) }));
  const $pos = doc.resolve(from);
  const block = $pos.parent;
  if (!block.isTextblock) return [];
  const start = $pos.start();
  // Out to the start of the next paragraph, so a suggested break after this one is found from its end.
  return changesIn(doc, Math.max(0, start - 1), Math.min(doc.content.size, start + block.content.size + 2)).filter((c) => c.from <= from && from <= c.to);
}

/**
 * Accepts (keeps insertions, removes deletions) or rejects (the other way
 * round) the changes between `from` and `to`. A paragraph that is left with
 * nothing in it, where it had only suggested text, goes as well. A suggested
 * break that goes joins its paragraph onto the one before; reformatted words
 * and restyled paragraphs keep their new look, or get their old one back.
 */
export function settle(tr: Transaction, from: number, to: number, accept: boolean): Transaction {
  const { schema } = tr.doc.type;
  const ins = schema.marks[INSERTION]!;
  const del = schema.marks[DELETION]!;
  const fmt = schema.marks[FORMAT_CHANGE]!;
  const goes = accept ? del : ins;
  const stays = accept ? ins : del;
  const cuts: ChangeRange[] = [];
  const emptied: ChangeRange[] = [];
  const reformatted: { from: number; to: number; marks: readonly PMMark[] }[] = [];
  const breaks: { pos: number; change: string; afterEmptied: boolean }[] = [];
  const restyled: { pos: number; node: PMNode }[] = [];
  let lastEmptiedEnd = -1;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph' && tr.doc.resolve(pos).depth === 0) {
      const brk = breakAt(tr.doc, node, pos);
      if (brk && from <= brk.from && brk.to <= to) breaks.push({ pos, change: node.attrs.change as string, afterEmptied: lastEmptiedEnd === pos });
      if (node.attrs.was && from <= pos + 1 && pos + node.nodeSize - 1 <= to) restyled.push({ pos, node });
    }
    if (node.isTextblock && pos >= from - 1 && pos + node.nodeSize <= to + 1 && node.content.size > 0) {
      let all = true;
      node.forEach((child) => {
        if (!goes.isInSet(child.marks)) all = false;
      });
      // Only top-level paragraphs are taken out whole: a list item or table cell must keep one.
      if (all && tr.doc.resolve(pos).depth === 0) {
        emptied.push({ from: pos, to: pos + node.nodeSize });
        lastEmptiedEnd = pos + node.nodeSize;
        return false;
      }
    }
    if (node.isInline && goes.isInSet(node.marks)) cuts.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to) });
    else if (node.isInline && fmt.isInSet(node.marks)) reformatted.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to), marks: node.marks });
    return !node.isInline;
  });

  // Looks first, while positions are as found.
  for (const { pos, node } of restyled) {
    const back = accept ? {} : lookAttrs(node.attrs.was as string);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...back, was: null });
  }
  for (const r of reformatted) {
    if (!accept) {
      for (const m of r.marks) if (FORMATTING.has(m.type.name)) tr.removeMark(r.from, r.to, m.type);
      for (const m of formatMarks(fmt.isInSet(r.marks)!.attrs.was as string, schema)) tr.addMark(r.from, r.to, m);
    }
    tr.removeMark(r.from, r.to, fmt);
  }
  tr.removeMark(from, to, stays);
  const all = [...cuts, ...emptied].sort((a, b) => b.from - a.from);
  for (const r of all) {
    // Never leave the page without a paragraph to type in.
    if (emptied.includes(r) && tr.doc.childCount === 1) tr.delete(r.from + 1, r.to - 1);
    else tr.delete(r.from, r.to);
  }
  // Breaks last, from the end, so joining one doesn't move the others.
  for (const b of [...breaks].reverse()) {
    if (emptied.some((e) => e.from === b.pos)) continue;
    const pos = tr.mapping.map(b.pos, 1);
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') continue;
    const join = (accept ? b.change === 'del' : b.change === 'ins') && !b.afterEmptied && pos > 0 && tr.doc.resolve(pos).nodeBefore?.type.name === 'paragraph' && canJoin(tr.doc, pos);
    if (join) tr.join(pos);
    else tr.setNodeMarkup(pos, undefined, { ...node.attrs, change: null });
  }
  return tr.setMeta(UNTRACKED, true);
}

/** Accepts or rejects the change at the cursor, or every change in the selection. Returns false when there is none. */
export function settleAt(view: EditorView, accept: boolean): boolean {
  const ranges = changesAt(view.state);
  if (ranges.length === 0) return false;
  const tr = view.state.tr;
  for (const r of [...ranges].reverse()) {
    const m = { from: tr.mapping.map(r.from, -1), to: tr.mapping.map(r.to, 1) };
    settle(tr, m.from, m.to, accept);
  }
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
  // A break on its own is shown with the cursor at the start of the paragraph after it.
  const doc = view.state.doc;
  const sel = TextSelection.between(doc.resolve(next.from), doc.resolve(next.to));
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  view.focus();
  return true;
}

// ---------- the file, without editing ----------

/** The marks on words once their change is settled: the suggestion marks go, and rejected formatting gets its old look back. */
function settledMarks(marks: MarkJSON[], accept: boolean): MarkJSON[] {
  const change = marks.find((m) => m.type === FORMAT_CHANGE) as { attrs: { was: string } } | undefined;
  let out = marks.filter((m) => m.type !== INSERTION && m.type !== DELETION && m.type !== FORMAT_CHANGE);
  if (change && !accept) out = [...out.filter((m) => !FORMATTING.has(m.type)), ...formatMarksJSON(change.attrs.was)];
  return out;
}

/**
 * A document with every change accepted (or rejected), without an editor:
 * the same as settling them all on the page. Accepted, it is what Plate,
 * Serve and exports read.
 */
export function settledJSON(node: NodeJSON, accept: boolean, top = true): NodeJSON {
  if (!node.content) return node;
  const goes = accept ? DELETION : INSERTION;
  const content: NodeJSON[] = [];
  // Whether the block before was a paragraph taken out because only suggested words were in it.
  let emptiedBefore = false;
  for (const child of node.content) {
    if (child.marks?.some((m) => m.type === goes)) continue;
    let out = settledJSON(child, accept, false);
    if (child.marks) {
      const marks = settledMarks(child.marks, accept);
      out = { ...out };
      if (marks.length > 0) out.marks = marks;
      else delete out.marks;
    }
    if (top && child.type === 'paragraph') {
      const had = child.content ?? [];
      const emptied = had.length > 0 && had.every((n) => n.marks?.some((m) => m.type === goes));
      if (emptied) {
        emptiedBefore = true;
        continue;
      }
      const attrs = { ...(out.attrs ?? {}) };
      const change = attrs.change;
      const was = attrs.was;
      delete attrs.change;
      delete attrs.was;
      if (typeof was === 'string' && was && !accept) Object.assign(attrs, lookAttrs(was));
      out = { ...out, attrs };
      const prev = content[content.length - 1];
      if (change === (accept ? 'del' : 'ins') && !emptiedBefore && prev?.type === 'paragraph') {
        const joined = [...(prev.content ?? []), ...(out.content ?? [])];
        content[content.length - 1] = { ...prev, ...(joined.length > 0 ? { content: joined } : {}) };
        continue;
      }
    }
    emptiedBefore = false;
    content.push(out);
  }
  return { ...node, content };
}

/** A document as it would read with every change accepted, for Plate, Serve and exports. */
export function acceptedJSON(node: NodeJSON): NodeJSON {
  return settledJSON(node, true);
}

/** Whether a document (as JSON) has any changes waiting. */
export function hasChangesJSON(node: NodeJSON): boolean {
  if (node.marks?.some((m) => m.type === INSERTION || m.type === DELETION || m.type === FORMAT_CHANGE)) return true;
  if (node.type === 'paragraph' && (node.attrs?.change || node.attrs?.was)) return true;
  return (node.content ?? []).some(hasChangesJSON);
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
