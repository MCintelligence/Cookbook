import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { countWords } from '../storage/index';
import { dialogueRanges } from './dialogue';
import { textMap, toRange } from './textmap';

/**
 * The review tools that live under Seasonings: notes to self, footnotes,
 * dialogue focus (Drunk Daniel's Check) and the other seasonings' Checks. A note's anchor is a mark in the text and its words live
 * in the scene's front matter; a footnote is a small inline node that holds
 * its own text.
 */

/** A footnote the writer asked to edit, by its place among the page's footnotes. */
export type SeasoningsRequest = { tab: 'footnotes'; index: number };

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

// ---------- checks ----------

/**
 * Each seasoning's Check: with it off, its underlines leave the page but its
 * meter keeps reading. Only a class on the page changes, so nothing is
 * checked again and the issues stay counted. Holds issue kinds (spelling,
 * grammar, style).
 */
export const checksKey = new PluginKey<ReadonlySet<string>>('seasoningChecks');
const ALL_ON: ReadonlySet<string> = new Set();

export const SeasoningChecks = Extension.create({
  name: 'seasoningChecks',
  addProseMirrorPlugins() {
    return [
      new Plugin<ReadonlySet<string>>({
        key: checksKey,
        state: {
          init: () => ALL_ON,
          apply: (tr, off) => (tr.getMeta(checksKey) as ReadonlySet<string> | undefined) ?? off,
        },
        props: {
          attributes(state): Record<string, string> {
            const off = checksKey.getState(state) ?? ALL_ON;
            return off.size > 0 ? { class: [...off].map((k) => `cb-off-${k}`).join(' ') } : {};
          },
        },
      }),
    ];
  },
});

/** The issue kinds whose Check is off. */
export function checkedOff(state: EditorState): ReadonlySet<string> {
  return checksKey.getState(state) ?? ALL_ON;
}

/** Turns off the Checks for these issue kinds and on for the rest; does nothing when that is already so. */
export function setChecksOff(editor: Editor, kinds: Iterable<string>): void {
  const next = new Set(kinds);
  const now = checkedOff(editor.state);
  if (next.size === now.size && [...next].every((k) => now.has(k))) return;
  editor.view.dispatch(editor.state.tr.setMeta(checksKey, next).setMeta('addToHistory', false));
}
