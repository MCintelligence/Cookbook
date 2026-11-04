import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Ghost text: a draft of the Item showing through, faded, while it is written again. It is drawn
 * over the page and is never part of the text, so nothing counts it, saves it, checks it or
 * exports it. It keeps pace with the writer a paragraph at a time: with three paragraphs written,
 * the ghost carries on from the draft's fourth, starting on the empty line the caret is on (as a
 * placeholder does), or just below the last line written.
 */
interface GhostState {
  paragraphs: string[] | null;
  /** Paragraphs written, and whether the page ends on an empty line, as the decorations were made for. */
  shape: string;
  deco: DecorationSet;
}

export const ghostKey = new PluginKey<GhostState>('ghost');

const EMPTY: GhostState = { paragraphs: null, shape: '', deco: DecorationSet.empty };

/** How far the writer has got: paragraphs with words in them, and whether the last line is empty. */
function shapeOf(doc: PMNode): { written: number; emptyEnd: boolean } {
  let written = 0;
  // Only the page's own blocks are looked at, never their text, so this stays quick on a long Item.
  doc.forEach((node) => {
    if (node.type.name === 'sceneBreak') return;
    if (node.isTextblock ? node.content.size > 0 : true) written += node.isTextblock ? 1 : Math.max(1, node.childCount);
  });
  const last = doc.lastChild;
  return { written, emptyEnd: !!last && last.type.name === 'paragraph' && last.content.size === 0 };
}

function ghostBlock(paragraphs: string[]) {
  return () => {
    const dom = document.createElement('div');
    dom.className = 'cb-ghost';
    dom.contentEditable = 'false';
    dom.setAttribute('aria-hidden', 'true');
    for (const text of paragraphs) {
      const p = document.createElement('p');
      p.textContent = text;
      dom.appendChild(p);
    }
    return dom;
  };
}

export function ghostDecorations(doc: PMNode, paragraphs: string[]): { shape: string; deco: DecorationSet } {
  const { written, emptyEnd } = shapeOf(doc);
  const left = paragraphs.slice(written);
  const shape = `${Math.min(written, paragraphs.length)}:${emptyEnd}`;
  if (left.length === 0) return { shape, deco: DecorationSet.empty };
  const found: Decoration[] = [];
  let rest = left;
  if (emptyEnd) {
    // The next paragraph sits on the empty line itself, so the caret starts at its first word.
    const last = doc.lastChild!;
    const at = doc.content.size - last.nodeSize;
    found.push(Decoration.node(at, doc.content.size, { class: 'ghost-line', 'data-ghost': left[0]! }));
    rest = left.slice(1);
  }
  if (rest.length > 0) found.push(Decoration.widget(doc.content.size, ghostBlock(rest), { side: 1, key: `ghost-${written}-${rest.length}`, ignoreSelection: true }));
  return { shape, deco: DecorationSet.create(doc, found) };
}

export const Ghost = Extension.create({
  name: 'ghost',
  addProseMirrorPlugins() {
    return [
      new Plugin<GhostState>({
        key: ghostKey,
        state: {
          init: () => EMPTY,
          apply: (tr, old) => {
            const set = tr.getMeta(ghostKey) as string[] | null | undefined;
            const paragraphs = set === undefined ? old.paragraphs : set;
            if (!paragraphs || paragraphs.length === 0) return paragraphs === old.paragraphs ? old : EMPTY;
            if (set === undefined && !tr.docChanged) return old;
            // Typing inside a paragraph changes nothing the ghost shows, so its decorations are only moved along.
            if (set === undefined) {
              const { written, emptyEnd } = shapeOf(tr.doc);
              if (`${Math.min(written, paragraphs.length)}:${emptyEnd}` === old.shape && !emptyEnd) return { ...old, deco: old.deco.map(tr.mapping, tr.doc) };
            }
            return { paragraphs, ...ghostDecorations(tr.doc, paragraphs) };
          },
        },
        props: { decorations: (state) => ghostKey.getState(state)?.deco },
      }),
    ];
  },
});

/** Shows `paragraphs` as the page's ghost text, or takes it away with null. */
export function setGhost(editor: Editor, paragraphs: string[] | null): void {
  if (editor.isDestroyed) return;
  try {
    editor.view.dispatch(editor.state.tr.setMeta(ghostKey, paragraphs).setMeta('addToHistory', false));
  } catch {
    // The editor isn't on the page yet; the ghost is set again once it is.
  }
}
