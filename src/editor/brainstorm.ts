import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { type BrainstormCard, type BrainstormKind, brainstormCardFor, isBrainstormKind } from '../storage/brainstorm';
import { BODY_STYLE, HEADING_STYLES } from './markdown';

/** The paragraph style a brainstorming card's title is written in: a ## heading in the file. */
export const BRAINSTORM_STYLE = HEADING_STYLES[1];

const key = new PluginKey<DecorationSet>('brainstorm');
const isHeading = (n: PMNode) => n.type.name === 'paragraph' && (HEADING_STYLES as readonly string[]).includes(n.attrs.style as string);
const isBlank = (n: PMNode) => n.type.name === 'paragraph' && n.content.size === 0 && n.attrs.style === BODY_STYLE;

/**
 * The explanation shown under a card that has nothing written in it yet, when
 * there is no blank line to show it on. A blank line isn't kept in the file,
 * so a card reopened before anything was written in it has none. Clicking the
 * explanation makes the line, ready to write on.
 */
function hint(card: BrainstormCard) {
  return (view: EditorView, getPos: () => number | undefined) => {
    const dom = document.createElement('p');
    dom.className = 'bs-hint';
    dom.contentEditable = 'false';
    dom.textContent = card.placeholder;
    dom.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = getPos();
      if (pos === undefined) return;
      const tr = view.state.tr.insert(pos, view.state.schema.nodes.paragraph!.create({ style: BODY_STYLE }));
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView());
      view.focus();
    });
    return dom;
  };
}

/** Marks each brainstorming card's heading, and shows its explanation on the blank line under it (or in its place). */
export function brainstormDecorations(doc: PMNode, kind: BrainstormKind): DecorationSet {
  const found: Decoration[] = [];
  let card: BrainstormCard | null = null;
  let cardEnd = 0;
  const unwritten = (next: PMNode | null) => !next || isHeading(next);
  doc.forEach((node, pos) => {
    const above: BrainstormCard | null = card;
    if (above && isBlank(node)) found.push(Decoration.node(pos, pos + node.nodeSize, { class: 'bs-blank', 'data-placeholder': above.placeholder }));
    else if (above && unwritten(node)) found.push(Decoration.widget(cardEnd, hint(above), { side: -1, key: `bs-hint-${above.id}-${cardEnd}`, ignoreSelection: true }));
    const here = isHeading(node) ? brainstormCardFor(kind, node.textContent) : null;
    if (here) found.push(Decoration.node(pos, pos + node.nodeSize, { class: 'bs-heading' }));
    card = here;
    cardEnd = pos + node.nodeSize;
  });
  // The last card on the page, with nothing after it.
  const last = card as BrainstormCard | null;
  if (last) found.push(Decoration.widget(cardEnd, hint(last), { side: -1, key: `bs-hint-${last.id}-${cardEnd}`, ignoreSelection: true }));
  return DecorationSet.create(doc, found);
}

/**
 * Brainstorming cards on character and place pages. Scenes and research
 * notes get nothing, so the plugin costs them nothing; on a card, the
 * decorations are only worked out again when the text changes.
 */
export const Brainstorm = Extension.create<{ kind: string | null }>({
  name: 'brainstorm',
  addOptions() {
    return { kind: null };
  },
  addProseMirrorPlugins() {
    const kind = this.options.kind;
    if (!isBrainstormKind(kind)) return [];
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => brainstormDecorations(state.doc, kind),
          apply: (tr, old) => (tr.docChanged ? brainstormDecorations(tr.doc, kind) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

/** The empty top-level line the cursor is on, where the + can add cards, or null. */
export function emptyLineAt(editor: Editor, kind: BrainstormKind): number | null {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!selection.empty || $from.depth !== 1 || !isBlank($from.parent)) return null;
  // The blank line under a card is for writing in, not for another card.
  const index = $from.index(0);
  const above = index > 0 ? editor.state.doc.child(index - 1) : null;
  if (above && isHeading(above) && brainstormCardFor(kind, above.textContent)) return null;
  return $from.before();
}

/**
 * Turns the empty line at `pos` into cards: each a heading and a blank line,
 * with the cursor on the first card's blank line, ready to write. One undo takes them out.
 */
export function insertBrainstorm(editor: Editor, pos: number, cards: BrainstormCard[]): boolean {
  if (cards.length === 0) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const at = state.doc.nodeAt(pos);
      if (!at || !isBlank(at)) return false;
      const { paragraph } = state.schema.nodes;
      const nodes = cards.flatMap((c) => [paragraph!.create({ style: BRAINSTORM_STYLE }, state.schema.text(c.title)), paragraph!.create({ style: BODY_STYLE })]);
      tr.replaceWith(pos, pos + at.nodeSize, nodes);
      // Inside the first card's blank line: past its heading, then into the paragraph.
      tr.setSelection(TextSelection.create(tr.doc, pos + nodes[0]!.nodeSize + 1)).scrollIntoView();
      return true;
    })
    .run();
}
