import { Extension } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getSettings } from '../settings';

/**
 * Focus mode, as in iA Writer: everything but the paragraph (or sentence)
 * being written fades. The setting is read whenever the page is drawn, so a
 * transaction with this key's meta redraws it after the setting changes.
 */
export const focusKey = new PluginKey('focusMode');

/** The sentence around `offset` in a paragraph's text, as [from, to] offsets. */
export function sentenceAround(text: string, offset: number): [number, number] {
  const ends = /[.!?…]+["'”’)\]]*(?:\s+|$)/g;
  let from = 0;
  for (let m = ends.exec(text); m; m = ends.exec(text)) {
    const end = m.index + m[0].length;
    // The caret right after a full stop still belongs to the sentence it ends.
    if (offset < end || (offset === end && /\S$/.test(m[0]))) return [from, Math.min(text.length, m.index + m[0].trimEnd().length)];
    from = end;
  }
  return [from, text.length];
}

function decorate(doc: PMNode, at: number): DecorationSet {
  const s = getSettings();
  if (!s.focus) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  let current: { node: PMNode; pos: number } | null = null;
  doc.forEach((node, pos) => {
    const inside = at >= pos && at <= pos + node.nodeSize;
    if (inside && !current) current = { node, pos };
    else decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'cb-faded' }));
  });
  const here = current as { node: PMNode; pos: number } | null;
  if (s.fade === 'sentence' && here && here.node.isTextblock) {
    // Fade the paragraph, then light the sentence inside it again.
    decorations.push(Decoration.node(here.pos, here.pos + here.node.nodeSize, { class: 'cb-faded' }));
    const [from, to] = sentenceAround(here.node.textContent, at - here.pos - 1);
    if (to > from) decorations.push(Decoration.inline(here.pos + 1 + from, here.pos + 1 + to, { class: 'cb-lit' }));
  }
  return DecorationSet.create(doc, decorations);
}

export const FocusMode = Extension.create({
  name: 'focusMode',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: focusKey,
        props: {
          decorations: (state) => decorate(state.doc, state.selection.head),
        },
      }),
    ];
  },
});
