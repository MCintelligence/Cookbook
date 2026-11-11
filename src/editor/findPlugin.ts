import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { type FindOptions, findInText } from './find';
import { textMap, toRange } from './textmap';

export interface FindState {
  query: string;
  options: FindOptions;
  matches: { from: number; to: number }[];
  /** Index of the current match, or -1 when there are none. */
  current: number;
}

export const findKey = new PluginKey<FindState>('find');

const EMPTY: FindState = { query: '', options: { matchCase: false, wholeWord: false }, matches: [], current: -1 };

/** Document positions of every match, block by block. */
export function findMatches(doc: PMNode, query: string, options: FindOptions): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  if (!query) return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = textMap(node, pos);
    for (const [a, b] of findInText(map.text, query, options)) out.push(toRange(map, a, b));
    return false;
  });
  return out;
}

function recompute(state: FindState, doc: PMNode, anchor: number): FindState {
  const matches = findMatches(doc, state.query, state.options);
  let current = matches.findIndex((m) => m.from >= anchor);
  if (current === -1) current = matches.length > 0 ? 0 : -1;
  return { ...state, matches, current };
}

/**
 * Built once per find state, not on every keystroke or caret move: the plugin
 * keeps the same state object until the matches or the current one change.
 */
const decoCache = new WeakMap<FindState, DecorationSet>();

/**
 * Every match highlighted, the current one strongest, and all the text between
 * them faded, so the page shows at a glance where and how often the words come up.
 */
export function findDecorations(doc: PMNode, find: FindState): DecorationSet | null {
  if (find.matches.length === 0) return null;
  const cached = decoCache.get(find);
  if (cached) return cached;
  const decos: Decoration[] = [];
  let gap = 0;
  find.matches.forEach((m, i) => {
    if (m.from > gap) decos.push(Decoration.inline(gap, m.from, { class: 'cb-find-dim' }));
    decos.push(Decoration.inline(m.from, m.to, { class: i === find.current ? 'cb-find cb-find-current' : 'cb-find' }));
    gap = Math.max(gap, m.to);
  });
  if (doc.content.size > gap) decos.push(Decoration.inline(gap, doc.content.size, { class: 'cb-find-dim' }));
  const set = DecorationSet.create(doc, decos);
  decoCache.set(find, set);
  return set;
}

export const FindExtension = Extension.create({
  name: 'find',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
            if (meta) {
              const next = { ...value, ...meta };
              if ('current' in meta && !('query' in meta) && !('options' in meta)) return next;
              return recompute(next, newState.doc, newState.selection.from);
            }
            if (tr.docChanged && value.query) {
              const kept = value.matches[value.current];
              const anchor = kept ? tr.mapping.map(kept.from) : newState.selection.from;
              return recompute(value, newState.doc, anchor);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const find = findKey.getState(state);
            return find ? findDecorations(state.doc, find) : null;
          },
        },
      }),
    ];
  },
});

export function getFind(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY;
}

export function setFindQuery(editor: Editor, query: string, options: FindOptions): void {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { query, options }));
}

/** Moves to the next (or previous) match and scrolls it into view. */
export function stepFind(editor: Editor, direction: 1 | -1): void {
  const find = getFind(editor.state);
  if (find.matches.length === 0) return;
  const current = (find.current + direction + find.matches.length) % find.matches.length;
  const m = find.matches[current]!;
  const tr = editor.state.tr
    .setMeta(findKey, { current })
    .setSelection(TextSelection.create(editor.state.doc, m.from, m.to))
    .scrollIntoView();
  editor.view.dispatch(tr);
}

export function replaceCurrent(editor: Editor, replacement: string): void {
  const find = getFind(editor.state);
  const m = find.matches[find.current];
  if (!m) return;
  const tr = editor.state.tr;
  if (replacement) tr.insertText(replacement, m.from, m.to);
  else tr.delete(m.from, m.to);
  editor.view.dispatch(tr);
}

export function replaceAll(editor: Editor, replacement: string): number {
  const find = getFind(editor.state);
  if (find.matches.length === 0) return 0;
  const tr = editor.state.tr;
  // Back to front, so earlier positions stay valid.
  for (const m of [...find.matches].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  editor.view.dispatch(tr);
  return find.matches.length;
}
