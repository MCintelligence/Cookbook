import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { textMap, toRange } from './textmap';

/**
 * Linked names: every character's and setting's name and nicknames are
 * found in the text as you write, with no markup in the file. The editor
 * draws them as links; hovering one peeks at its card.
 */

export interface NamedCard {
  id: string;
  path: string;
  title: string;
  kind: 'character' | 'setting';
  aka: string[];
}

export interface NameMatcher {
  regex: RegExp;
  byName: Map<string, NamedCard>;
}

export interface NameHit {
  from: number;
  to: number;
  card: NamedCard;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One pattern for every name, longest first so "Mama June" wins over "June".
 * Names match whole words and their case, so June the cook is not the month
 * of june; "June’s" still counts.
 */
export function nameMatcher(cards: NamedCard[]): NameMatcher | null {
  const byName = new Map<string, NamedCard>();
  for (const card of cards) {
    for (const name of [card.title, ...card.aka].map((n) => n.trim())) {
      if (name.length >= 2 && !byName.has(name)) byName.set(name, card);
    }
  }
  if (byName.size === 0) return null;
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
  return { regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu'), byName };
}

/** Every linked name in a piece of plain text, as character offsets. */
export function findNames(text: string, matcher: NameMatcher | null): NameHit[] {
  if (!matcher) return [];
  const hits: NameHit[] = [];
  for (const m of text.matchAll(matcher.regex)) hits.push({ from: m.index, to: m.index + m[0].length, card: matcher.byName.get(m[0])! });
  return hits;
}

/** How often each card is named in a text, by card id. */
export function countNames(text: string, matcher: NameMatcher | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hit of findNames(text, matcher)) counts.set(hit.card.id, (counts.get(hit.card.id) ?? 0) + 1);
  return counts;
}

/** Linked names in a document, in document positions. */
export function docNames(doc: PMNode, matcher: NameMatcher | null): NameHit[] {
  const hits: NameHit[] = [];
  if (!matcher) return hits;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = textMap(node, pos);
    for (const hit of findNames(map.text, matcher)) hits.push({ ...toRange(map, hit.from, hit.to), card: hit.card });
    return false;
  });
  return hits;
}

/** The cards named in a document, in the order they first appear. */
export function castOf(doc: PMNode, matcher: NameMatcher | null): NamedCard[] {
  const seen = new Map<string, NamedCard>();
  for (const hit of docNames(doc, matcher)) if (!seen.has(hit.card.id)) seen.set(hit.card.id, hit.card);
  return [...seen.values()];
}

interface NamesState {
  matcher: NameMatcher | null;
  /** Names per text block, relative to the block, so typing only rescans the paragraph that changed. */
  blocks: WeakMap<PMNode, NameHit[]>;
  sets: WeakMap<PMNode, DecorationSet>;
}

export const namesKey = new PluginKey<NamesState>('linkedNames');

export const LinkedNames = Extension.create({
  name: 'linkedNames',
  addProseMirrorPlugins() {
    return [
      new Plugin<NamesState>({
        key: namesKey,
        state: {
          init: () => ({ matcher: null, blocks: new WeakMap(), sets: new WeakMap() }),
          apply: (tr, value) => {
            const matcher = tr.getMeta(namesKey) as NameMatcher | null | undefined;
            return matcher === undefined ? value : { matcher, blocks: new WeakMap(), sets: new WeakMap() };
          },
        },
        props: {
          decorations(state) {
            const { matcher, blocks, sets } = namesKey.getState(state)!;
            if (!matcher) return null;
            let set = sets.get(state.doc);
            if (set) return set;
            const all: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              let local = blocks.get(node);
              if (!local) {
                const map = textMap(node, -1);
                local = findNames(map.text, matcher).map((hit) => ({ ...toRange(map, hit.from, hit.to), card: hit.card }));
                blocks.set(node, local);
              }
              for (const hit of local) {
                all.push(Decoration.inline(pos + 1 + hit.from, pos + 1 + hit.to, { class: 'cb-name', 'data-card': hit.card.path, 'data-kind': hit.card.kind }));
              }
              return false;
            });
            set = DecorationSet.create(state.doc, all);
            sets.set(state.doc, set);
            return set;
          },
        },
      }),
    ];
  },
});

export function setNameMatcher(editor: Editor, matcher: NameMatcher | null): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(namesKey, matcher).setMeta('addToHistory', false));
}

export function nameMatcherOf(state: EditorState): NameMatcher | null {
  return namesKey.getState(state)?.matcher ?? null;
}
