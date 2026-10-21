import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { type FindOptions, findInText } from './find';

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
    // Text offsets map straight to positions because blocks hold only text.
    for (const [a, b] of findInText(node.textContent, query, options)) out.push({ from: pos + 1 + a, to: pos + 1 + b });
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
            if (!find || find.matches.length === 0) return null;
            return DecorationSet.create(
              state.doc,
              find.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, { class: i === find.current ? 'cb-find cb-find-current' : 'cb-find' }),
              ),
            );
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
