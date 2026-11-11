import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Ghost text: a draft of the Item showing through, faded, while it is written again. It is drawn
 * over the page and is never part of the text, so nothing counts it, saves it, checks it or
 * exports it. It keeps pace with the writer a sentence at a time: in the paragraph being written,
 * each sentence typed takes the place of one of the draft's, and the rest of that paragraph carries
 * on just after the caret. The draft's later paragraphs follow below, and an empty line starts the
 * next one, as a placeholder does.
 */
interface GhostState {
  paragraphs: string[] | null;
  /** How far the writer had got when the decorations were made (see shapeOf). */
  shape: string;
  deco: DecorationSet;
}

export const ghostKey = new PluginKey<GhostState>('ghost');

const EMPTY: GhostState = { paragraphs: null, shape: '', deco: DecorationSet.empty };

/**
 * A paragraph's sentences, each with the space after it. A sentence ends at a stop (and any closing
 * quote) followed by a capital or an opening quote, so “Run!” she said. stays one sentence. Text
 * after the last full stop is a sentence too.
 */
export function sentencesOf(text: string): string[] {
  return (text.match(/[^]*?[.!?…]+["'”’)\]]*(?:\s+(?=[\p{Lu}\p{N}“"‘'(])|\s*$)|[^]+$/gu) ?? []).filter((s) => s.trim() !== '');
}

interface Shape {
  /** Paragraphs with words in them. */
  written: number;
  /** The page ends on an empty line. */
  emptyEnd: boolean;
  /** Sentences begun in the last paragraph, when it is a paragraph with words in it. */
  typed: number;
  /** That paragraph ends in a space, so the ghost needs none of its own. */
  spaced: boolean;
}

/** How far the writer has got. Only the last paragraph's words are read, so this stays quick on a long Item. */
function shapeOf(doc: PMNode): Shape {
  let written = 0;
  doc.forEach((node) => {
    if (node.type.name === 'sceneBreak') return;
    if (node.isTextblock ? node.content.size > 0 : true) written += node.isTextblock ? 1 : Math.max(1, node.childCount);
  });
  const last = doc.lastChild;
  const emptyEnd = !!last && last.type.name === 'paragraph' && last.content.size === 0;
  const text = last && last.type.name === 'paragraph' && !emptyEnd ? last.textContent : '';
  return { written, emptyEnd, typed: text ? sentencesOf(text).length : 0, spaced: /\s$/.test(text) };
}

const keyOf = (s: Shape, paragraphs: string[]) => (s.written > paragraphs.length + 1 ? 'done' : `${s.written}:${s.emptyEnd}:${s.typed}:${s.spaced}`);

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

function ghostInline(text: string) {
  return () => {
    const dom = document.createElement('span');
    dom.className = 'cb-ghost-inline';
    dom.contentEditable = 'false';
    dom.setAttribute('aria-hidden', 'true');
    dom.textContent = text;
    return dom;
  };
}

export function ghostDecorations(doc: PMNode, paragraphs: string[]): { shape: string; deco: DecorationSet } {
  const shape = shapeOf(doc);
  const { written, emptyEnd, typed, spaced } = shape;
  const found: Decoration[] = [];
  const end = doc.content.size;
  // The rest of the draft's paragraph that is being written, after the caret.
  if (typed > 0) {
    const rest = sentencesOf(paragraphs[written - 1] ?? '').slice(typed).join('').trim();
    if (rest) found.push(Decoration.widget(end - 1, ghostInline(spaced ? rest : ` ${rest}`), { side: 1, key: `ghost-in-${written}-${typed}-${spaced}`, ignoreSelection: true }));
  }
  let left = paragraphs.slice(written);
  if (emptyEnd && left.length > 0) {
    // The next paragraph sits on the empty line itself, so the caret starts at its first word.
    const last = doc.lastChild!;
    found.push(Decoration.node(end - last.nodeSize, end, { class: 'ghost-line', 'data-ghost': left[0]! }));
    left = left.slice(1);
  }
  if (left.length > 0) found.push(Decoration.widget(end, ghostBlock(left), { side: 1, key: `ghost-${written}-${left.length}`, ignoreSelection: true }));
  return { shape: keyOf(shape, paragraphs), deco: found.length ? DecorationSet.create(doc, found) : DecorationSet.empty };
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
            // Typing inside a sentence changes nothing the ghost shows, so its decorations are only moved along.
            if (set === undefined && keyOf(shapeOf(tr.doc), paragraphs) === old.shape) return { ...old, deco: old.deco.map(tr.mapping, tr.doc) };
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
