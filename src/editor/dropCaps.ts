import { Extension } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { markdownOn, subscribeSettings } from '../settings';
import { type NodeJSON } from './markdown';

/**
 * Drop caps, Cookbook's own Markdown: a ! at the start of a word, as in
 * !Sword, shows the word's first letter as a drop cap and hides the !. The
 * file keeps the !, so it stays plain text that any app can open.
 *
 * - The ! must start a word: at the start of a line, or after a space, an
 *   opening quote or bracket, or a dash. "Hello!" and "!!" are left alone.
 * - A letter must follow it, so "![a picture](…)" and "!1984" are left alone.
 * - At the start of a paragraph the letter is a classic drop cap two lines
 *   tall; anywhere else it is a raised initial within the line, since a cap
 *   can only drop into the lines below where a paragraph begins.
 * - Nothing in code. With the Drop cap rule (or Markdown) off, !Sword shows
 *   as written.
 */

export interface DropCap {
  /** Where the ! is in the text. */
  at: number;
  /** The letter's length: 2 for a letter outside the Basic Multilingual Plane. */
  length: number;
  /** At the very start of the paragraph, so it drops into the lines below. */
  start: boolean;
}

const DROP = /(^|[\s"'“‘«(\[{—–])!(\p{L})/gu;

/** Every !Word in a paragraph's text. */
export function findDropCaps(text: string): DropCap[] {
  const out: DropCap[] = [];
  if (!text.includes('!')) return out;
  DROP.lastIndex = 0;
  for (let m = DROP.exec(text); m; m = DROP.exec(text)) {
    const at = m.index + m[1]!.length;
    out.push({ at, length: m[2]!.length, start: at === 0 || /^[ \t]*$/.test(text.slice(0, at)) });
    // The letter can't start the next one, so go on from just after the !.
    DROP.lastIndex = at + 1;
  }
  return out;
}

/** The word a drop cap starts, to the end of its letters: the stretch where the caret shows the ! again. */
function wordLength(text: string): number {
  return /^!\p{L}[\p{L}\p{M}\p{N}'’-]*/u.exec(text)?.[0].length ?? 2;
}

export const dropCapClass = (start: boolean) => (start ? 'cb-dropcap cb-dropcap-start' : 'cb-dropcap');

// ---------- in the editor ----------

/** One character for each position in a paragraph, so offsets in the text are offsets in the paragraph. */
const blockText = (block: PMNode) => block.textBetween(0, block.content.size, undefined, (leaf) => (leaf.type.name === 'hardBreak' ? '\n' : '￼'));

function decorateBlock(block: PMNode, pos: number, out: Decoration[]): void {
  if (block.type.spec.code) return;
  for (const cap of findDropCaps(blockText(block))) {
    if (block.childAfter(cap.at).node?.marks.some((m) => m.type.name === 'code')) continue;
    const at = pos + 1 + cap.at;
    out.push(Decoration.inline(at, at + 1, { class: 'cb-dropmark' }, { dropCap: true }));
    out.push(Decoration.inline(at + 1, at + 1 + cap.length, { class: dropCapClass(cap.start) }));
  }
}

function decorateAll(doc: PMNode): DecorationSet {
  if (!markdownOn('dropCap')) return DecorationSet.empty;
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    decorateBlock(node, pos, out);
    return false;
  });
  return DecorationSet.create(doc, out);
}

/**
 * Brings the drop caps up to date after a change, looking again only at the
 * paragraphs it touched, so typing costs the same in a long Item as a short one.
 */
function update(set: DecorationSet, tr: Transaction): DecorationSet {
  const { doc } = tr;
  const blocks = new Map<number, PMNode>();
  const touch = (a: number, b: number) => {
    const to = Math.min(b, doc.content.size);
    const from = Math.min(a, to);
    const $from = doc.resolve(from);
    if ($from.parent.isTextblock && to <= $from.end()) blocks.set($from.before(), $from.parent);
    else
      doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return true;
        blocks.set(pos, node);
        return false;
      });
  };
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_a, _b, from, to) => touch(rest.map(from, -1), rest.map(to, 1)));
  });
  let next = set.map(tr.mapping, doc);
  for (const [pos, block] of blocks) {
    next = next.remove(next.find(pos + 1, pos + block.nodeSize - 1));
    const out: Decoration[] = [];
    decorateBlock(block, pos, out);
    if (out.length > 0) next = next.add(doc, out);
  }
  return next;
}

export const dropCapsKey = new PluginKey<DecorationSet>('dropCaps');

export const DropCaps = Extension.create({
  name: 'dropCaps',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: dropCapsKey,
        state: {
          init: (_config, state) => decorateAll(state.doc),
          apply: (tr, set) => {
            if (tr.getMeta(dropCapsKey)) return decorateAll(tr.doc);
            if (!tr.docChanged || !markdownOn('dropCap')) return set;
            return update(set, tr);
          },
        },
        props: {
          // Where the caret is in a !Word, the ! shows again and the letter is plain, so it can be edited.
          decorations: (state) => {
            const set = dropCapsKey.getState(state)!;
            const { $from, from, to } = state.selection;
            if (set === DecorationSet.empty || !$from.parent.isTextblock) return set;
            const start = $from.start();
            const marks = set.find(start, Math.min(to, $from.end()), (spec) => spec.dropCap);
            const editing = marks.filter((d) => from <= d.from + wordLength($from.parent.textBetween(d.from - start, $from.parent.content.size, undefined, '￼')));
            return editing.length === 0 ? set : set.remove(editing.flatMap((d) => set.find(d.from, d.from + 2)));
          },
        },
        // Turning the rule (or Markdown) on or off redraws the page.
        view: (view) => {
          let on = markdownOn('dropCap');
          const stop = subscribeSettings(() => {
            if (markdownOn('dropCap') === on || view.isDestroyed) return;
            on = !on;
            view.dispatch(view.state.tr.setMeta(dropCapsKey, true).setMeta('addToHistory', false));
          });
          return { destroy: stop };
        },
      }),
    ];
  },
});

// ---------- in Read the recipe and exports ----------

export type DropCapNode = NodeJSON & { dropCap?: 'start' | 'inline' };

const leafChar = (n: NodeJSON) => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : '￼');

/**
 * A paragraph's inline content with each !Word's ! taken out and its letter
 * split into a text node of its own, marked dropCap. Unchanged when the rule is off.
 */
export function withDropCaps(nodes: NodeJSON[]): DropCapNode[] {
  if (!markdownOn('dropCap')) return nodes;
  const caps = findDropCaps(nodes.map(leafChar).join(''));
  if (caps.length === 0) return nodes;
  const out: DropCapNode[] = [];
  let offset = 0;
  for (const node of nodes) {
    const length = leafChar(node).length;
    const end = offset + length;
    const here = node.type === 'text' && !node.marks?.some((m) => m.type === 'code') ? caps.filter((c) => c.at >= offset && c.at < end) : [];
    if (here.length === 0) out.push(node);
    else {
      const text = node.text!;
      let from = 0;
      const piece = (a: number, b: number, dropCap?: DropCapNode['dropCap']) => {
        if (b > a) out.push({ ...node, text: text.slice(a, b), ...(dropCap ? { dropCap } : {}) });
      };
      for (const cap of here) {
        const at = cap.at - offset;
        piece(from, at);
        // A letter cut off by the node's end (another mark starts on it) stays plain.
        if (at + 1 + cap.length <= text.length) {
          piece(at + 1, at + 1 + cap.length, cap.start ? 'start' : 'inline');
          from = at + 1 + cap.length;
        } else from = at + 1;
      }
      piece(from, text.length);
    }
    offset = end;
  }
  return out;
}

/**
 * The same for text already drawn on the page (Read the recipe and the page
 * beside), drawn from the same schema as the editor: every paragraph's !Words
 * get their drop caps.
 */
export function applyDropCaps(root: HTMLElement): void {
  if (!markdownOn('dropCap')) return;
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (!p.textContent?.includes('!')) continue;
    const texts: { node: Text; at: number }[] = [];
    let text = '';
    const walk = (el: Node) => {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          texts.push({ node: child as Text, at: text.length });
          text += (child as Text).data;
        } else if (child instanceof HTMLElement) {
          // Code and footnote numbers keep their characters but can't hold a drop cap.
          if (child.tagName === 'CODE' || child.tagName === 'SUP') text += '￼'.repeat(child.textContent?.length ?? 0);
          else if (child.tagName === 'BR') text += '\n';
          else if (child.tagName === 'IMG') text += '￼';
          else walk(child);
        }
      }
    };
    walk(p);
    const locate = (offset: number) => {
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i]!.at <= offset) return { node: texts[i]!.node, index: offset - texts[i]!.at };
      return null;
    };
    // Last first, so the offsets of the earlier ones still hold.
    for (const cap of findDropCaps(text).reverse()) {
      const letter = locate(cap.at + 1);
      const bang = locate(cap.at);
      if (!letter || !bang || letter.index + cap.length > letter.node.data.length) continue;
      const rest = letter.node.splitText(letter.index);
      rest.splitText(cap.length);
      const span = document.createElement('span');
      span.className = dropCapClass(cap.start);
      rest.replaceWith(span);
      span.append(rest);
      bang.node.deleteData(bang.index, 1);
    }
  }
}
