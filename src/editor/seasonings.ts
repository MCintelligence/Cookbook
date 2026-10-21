import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { countWords } from '../storage/index';
import { dialogueRanges } from './dialogue';
import { textMap, toRange } from './textmap';

/**
 * The review tools that live under Seasonings: notes to self, footnotes and
 * dialogue focus. A note's anchor is a mark in the text and its words live
 * in the scene's front matter; a footnote is a small inline node that holds
 * its own text.
 */

/** Where the writer asked to go next: the Notes or Footnotes tab, with a note or footnote picked. */
export type SeasoningsRequest = { tab: 'notes'; id: string } | { tab: 'footnotes'; index: number };

export const Note = Mark.create<{ onRequest: (r: SeasoningsRequest) => void }>({
  name: 'note',
  // Notes can overlap, and typing at the end of one does not stretch it.
  excludes: '',
  inclusive: false,
  addOptions() {
    return { onRequest: () => {} };
  },
  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-note'),
        renderHTML: (attrs) => ({ 'data-note': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-note]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'cb-note' }), 0];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-m': ({ editor }) => {
        const id = addNoteAnchor(editor);
        if (id) this.options.onRequest({ tab: 'notes', id });
        return true;
      },
    };
  },
});

export const Footnote = Node.create<{ onRequest: (r: SeasoningsRequest) => void }>({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { onRequest: () => {} };
  },
  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-footnote') ?? '',
        renderHTML: (attrs) => ({ 'data-footnote': attrs.text }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },
  renderHTML({ HTMLAttributes }) {
    // The number comes from a CSS counter, so it is always in reading order.
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'cb-footnote', title: HTMLAttributes['data-footnote'] })];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-f': ({ editor }) => {
        this.options.onRequest({ tab: 'footnotes', index: insertFootnote(editor) });
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const onRequest = (index: number) => this.options.onRequest({ tab: 'footnotes', index });
    return [
      new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos) {
            if (node.type.name !== 'footnote') return false;
            onRequest(footnotes(view.state.doc).findIndex((f) => f.pos === nodePos));
            return false;
          },
        },
      }),
    ];
  },
});

// ---------- notes ----------

export interface NoteAnchor {
  id: string;
  /** The words the note is attached to. */
  quote: string;
  from: number;
  to: number;
}

/** Every anchored note in reading order, one entry per note id. */
export function noteAnchors(doc: PMNode): NoteAnchor[] {
  const byId = new Map<string, NoteAnchor>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== 'note') continue;
      const id = mark.attrs.id as string;
      const end = pos + node.nodeSize;
      const seen = byId.get(id);
      if (seen) {
        seen.quote += (seen.to < pos ? ' … ' : '') + node.text!;
        seen.to = end;
      } else byId.set(id, { id, quote: node.text!, from: pos, to: end });
    }
    return false;
  });
  return [...byId.values()];
}

export function nextNoteId(doc: PMNode, existing: Iterable<string>): string {
  let max = 0;
  const ids = [...existing, ...noteAnchors(doc).map((a) => a.id)];
  for (const id of ids) {
    const n = /^n(\d+)$/.exec(id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `n${max + 1}`;
}

/**
 * Anchors a new note to the selected words and returns its id. With nothing
 * selected it returns an id for a note on the whole scene.
 */
export function addNoteAnchor(editor: Editor, existing: Iterable<string> = []): string {
  const { state } = editor;
  const id = nextNoteId(state.doc, existing);
  const { from, to, empty } = state.selection;
  if (!empty) editor.view.dispatch(state.tr.addMark(from, to, state.schema.marks.note!.create({ id })));
  return id;
}

export function removeNoteAnchor(editor: Editor, id: string): void {
  const { state } = editor;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === 'note' && m.attrs.id === id);
    if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function selectRange(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)).scrollIntoView());
  editor.view.focus();
}

// ---------- footnotes ----------

export interface FootnoteEntry {
  pos: number;
  text: string;
}

export function footnotes(doc: PMNode): FootnoteEntry[] {
  const out: FootnoteEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') out.push({ pos, text: node.attrs.text as string });
    return node.isBlock;
  });
  return out;
}

/** Puts an empty footnote at the cursor and returns its number, counting from 0. */
export function insertFootnote(editor: Editor): number {
  const { state } = editor;
  const at = state.selection.to;
  const tr = state.tr.insert(at, state.schema.nodes.footnote!.create({ text: '' }));
  tr.setSelection(TextSelection.create(tr.doc, at + 1));
  editor.view.dispatch(tr);
  return footnotes(editor.state.doc).findIndex((f) => f.pos === at);
}

export function setFootnoteText(editor: Editor, index: number, text: string): void {
  const entry = footnotes(editor.state.doc)[index];
  if (!entry) return;
  editor.view.dispatch(editor.state.tr.setNodeAttribute(entry.pos, 'text', text.replace(/\s*\n\s*/g, ' ')));
}

export function deleteFootnote(editor: Editor, index: number): void {
  const entry = footnotes(editor.state.doc)[index];
  if (entry) editor.view.dispatch(editor.state.tr.delete(entry.pos, entry.pos + 1));
}

export function selectFootnote(editor: Editor, index: number): void {
  const entry = footnotes(editor.state.doc)[index];
  if (!entry) return;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, entry.pos)).scrollIntoView());
  editor.view.focus();
}

// ---------- the scene's checklist ----------

export interface TodoEntry {
  pos: number;
  text: string;
  checked: boolean;
}

export function todos(doc: PMNode): TodoEntry[] {
  const out: TodoEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'taskItem') out.push({ pos, text: node.textContent, checked: !!node.attrs.checked });
    return node.type.name !== 'taskItem';
  });
  return out;
}

export function setTodoChecked(editor: Editor, pos: number, checked: boolean): void {
  editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'checked', checked));
}

// ---------- dialogue focus ----------

export const dialogueKey = new PluginKey<boolean>('dialogue');

export interface DialogueStats {
  dialogueWords: number;
  totalWords: number;
}

/** Document ranges of everything inside quotation marks. */
export function dialogueSpans(doc: PMNode): { from: number; to: number }[] {
  return quoteSpans(doc, false);
}

/** Everything else: the narration that fades while dialogue focus is on. */
export function narrationSpans(doc: PMNode): { from: number; to: number }[] {
  return quoteSpans(doc, true);
}

function quoteSpans(doc: PMNode, outside: boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = textMap(node, pos);
    let ranges = dialogueRanges(map.text);
    if (outside) {
      const gaps: [number, number][] = [];
      let at = 0;
      for (const [a, b] of ranges) {
        if (a > at) gaps.push([at, a]);
        at = b;
      }
      if (at < map.text.length) gaps.push([at, map.text.length]);
      ranges = gaps;
    }
    for (const [a, b] of ranges) out.push(toRange(map, a, b));
    return false;
  });
  return out;
}

export function dialogueStats(doc: PMNode): DialogueStats {
  let dialogueWords = 0;
  let totalWords = 0;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const { text } = textMap(node, pos);
    totalWords += countWords(text);
    for (const [a, b] of dialogueRanges(text)) dialogueWords += countWords(text.slice(a, b));
    return false;
  });
  return { dialogueWords, totalWords };
}

// Moving the cursor does not change the text, so the highlights are worked out once per edit.
const dialogueCache = new WeakMap<PMNode, DecorationSet>();

export const DialogueFocus = Extension.create({
  name: 'dialogueFocus',
  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: dialogueKey,
        state: {
          init: () => false,
          apply: (tr, on) => (tr.getMeta(dialogueKey) as boolean | undefined) ?? on,
        },
        props: {
          attributes(state): Record<string, string> {
            return dialogueKey.getState(state) ? { class: 'cb-dialogue-focus' } : {};
          },
          decorations(state) {
            if (!dialogueKey.getState(state)) return null;
            let set = dialogueCache.get(state.doc);
            if (!set) {
              set = DecorationSet.create(
                state.doc,
                // Fading the narration, rather than colouring the speech, keeps every style's own colour.
                narrationSpans(state.doc).map((s) => Decoration.inline(s.from, s.to, { class: 'cb-narration' })),
              );
              dialogueCache.set(state.doc, set);
            }
            return set;
          },
        },
      }),
    ];
  },
});

export function isDialogueFocus(state: EditorState): boolean {
  return dialogueKey.getState(state) ?? false;
}

export function setDialogueFocus(editor: Editor, on: boolean): void {
  editor.view.dispatch(editor.state.tr.setMeta(dialogueKey, on));
}
