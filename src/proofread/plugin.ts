import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { type TextMap, textMap } from '../editor/textmap';
import { type Issue } from './check';
import { type Checker } from './client';

/**
 * The proofreader in the editor. Each paragraph's text is checked in the
 * background and the answer kept by text, so typing only rechecks the
 * paragraph that changed. A word being typed is never underlined: it is
 * checked once the writer moves on.
 */

interface ProofState {
  checker: Checker | null;
  /** Goes up whenever the checker or its dictionary changes; older answers are dropped. */
  version: number;
  /** Issues by paragraph text, with offsets into that text. */
  cache: Map<string, Issue[]>;
  /** Words the writer chose to leave alone in this scene. */
  ignored: Set<string>;
  set: DecorationSet;
  /** The word the writer is typing, whose underline waits until they leave it. */
  fresh: { from: number; to: number } | null;
}

interface Meta {
  checker?: Checker | null;
  ignored?: Set<string>;
  results?: { version: number; entries: [string, Issue[]][] };
  /** Drops the underlines on a word at once, such as one just added to the dictionary. */
  forget?: string;
}

export interface FoundIssue {
  from: number;
  to: number;
  word: string;
  issue: Issue;
}

export const proofreadKey = new PluginKey<ProofState>('proofread');

const DELAY_MS = 250;
const WORD_CHAR = /[\p{L}\p{M}'’-]/u;

/** Text maps per paragraph node, relative to the node, so unchanged paragraphs aren't walked again. */
const maps = new WeakMap<PMNode, TextMap>();
function mapOf(node: PMNode): TextMap {
  let map = maps.get(node);
  if (!map) maps.set(node, (map = textMap(node, -1)));
  return map;
}

function decorate(pos: number, map: TextMap, issue: Issue): Decoration {
  const from = pos + 1 + map.positions[issue.from]!;
  const to = pos + 2 + map.positions[issue.to - 1]!;
  const word = map.text.slice(issue.from, issue.to);
  return Decoration.inline(from, to, { class: `cb-issue cb-issue-${issue.kind}`, 'data-rule': issue.rule }, { issue, word });
}

/** Underlines from the cache, keeping the last ones (moved with the text) for paragraphs still being checked. */
function build(doc: PMNode, cache: Map<string, Issue[]>, ignored: Set<string>, old: DecorationSet): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = mapOf(node);
    const issues = cache.get(map.text);
    if (issues) {
      for (const issue of issues) if (!ignored.has(map.text.slice(issue.from, issue.to))) decos.push(decorate(pos, map, issue));
    } else {
      decos.push(...old.find(pos, pos + node.nodeSize).filter((d) => !ignored.has((d.spec as { word: string }).word)));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** Only the answers for paragraphs still in the scene are kept. */
function prune(doc: PMNode, cache: Map<string, Issue[]>): Map<string, Issue[]> {
  const kept = new Map<string, Issue[]>();
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    const text = mapOf(node).text;
    const issues = cache.get(text);
    if (issues) kept.set(text, issues);
    return false;
  });
  return kept;
}

/** The word around an empty selection, if the cursor touches one. */
function wordAt(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const text = mapOf($from.parent).text;
  let a = $from.parentOffset;
  let b = a;
  while (a > 0 && WORD_CHAR.test(text[a - 1]!)) a--;
  while (b < text.length && WORD_CHAR.test(text[b]!)) b++;
  return a === b ? null : { from: $from.start() + a, to: $from.start() + b };
}

function uncheckedTexts(doc: PMNode, cache: Map<string, Issue[]>, skip: Set<string>): string[] {
  const texts = new Set<string>();
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    const text = mapOf(node).text;
    if (/\p{L}/u.test(text) && !cache.has(text) && !skip.has(text)) texts.add(text);
    return false;
  });
  return [...texts];
}

function checkInBackground(view: EditorView) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asking = new Set<string>();
  let askingFor = -1;
  const run = () => {
    const state = proofreadKey.getState(view.state)!;
    if (!state.checker) return;
    if (askingFor !== state.version) asking = new Set();
    askingFor = state.version;
    const texts = uncheckedTexts(view.state.doc, state.cache, asking);
    if (texts.length === 0) return;
    for (const t of texts) asking.add(t);
    const { version } = state;
    const done = () => {
      if (askingFor === version) for (const t of texts) asking.delete(t);
    };
    state.checker.check(texts).then(
      (results) => {
        done();
        if (view.isDestroyed) return;
        const meta: Meta = { results: { version, entries: texts.map((t, i) => [t, results[i] ?? []]) } };
        view.dispatch(view.state.tr.setMeta(proofreadKey, meta).setMeta('addToHistory', false));
      },
      done,
    );
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DELAY_MS);
  };
  schedule();
  return {
    update(view: EditorView, prev: EditorState) {
      const now = proofreadKey.getState(view.state)!;
      if (view.state.doc !== prev.doc || now.version !== proofreadKey.getState(prev)!.version) schedule();
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}

export const Proofread = Extension.create({
  name: 'proofread',
  addProseMirrorPlugins() {
    return [
      new Plugin<ProofState>({
        key: proofreadKey,
        state: {
          init: () => ({ checker: null, version: 0, cache: new Map(), ignored: new Set(), set: DecorationSet.empty, fresh: null }),
          apply(tr, value, _old, state) {
            const meta = tr.getMeta(proofreadKey) as Meta | undefined;
            let next = value;
            if (tr.docChanged) {
              next = { ...next, set: next.set.map(tr.mapping, tr.doc), fresh: wordAt(state) };
            } else if (next.fresh) {
              const from = tr.mapping.map(next.fresh.from, -1);
              const to = tr.mapping.map(next.fresh.to, 1);
              const { selection } = state;
              const inside = selection.empty && selection.from >= from && selection.from <= to;
              next = { ...next, fresh: inside ? { from, to } : null };
            }
            if (meta) {
              if ('checker' in meta) next = { ...next, checker: meta.checker ?? null, version: next.version + 1, cache: new Map() };
              if (meta.ignored) next = { ...next, ignored: meta.ignored };
              if (meta.forget) {
                const word = meta.forget;
                next = { ...next, set: next.set.remove(next.set.find(undefined, undefined, (spec) => (spec as { word: string }).word === word)) };
              }
              if (meta.results && meta.results.version === next.version) {
                const cache = new Map(next.cache);
                for (const [text, issues] of meta.results.entries) cache.set(text, issues);
                next = { ...next, cache: prune(state.doc, cache) };
              }
              if (!next.checker) return { ...next, set: DecorationSet.empty };
            }
            if (tr.docChanged || (meta && (meta.ignored || meta.results))) next = { ...next, set: build(state.doc, next.cache, next.ignored, next.set) };
            return next;
          },
        },
        view: checkInBackground,
        props: {
          decorations: drawnSet,
        },
      }),
    ];
  },
});

/** The underlines on screen: all of them but the word being typed. */
export function drawnSet(state: EditorState): DecorationSet {
  const { set, fresh } = proofreadKey.getState(state)!;
  if (!fresh) return set;
  return set.remove(set.find(fresh.from, fresh.to, (spec) => (spec as { issue: Issue }).issue.kind === 'spelling'));
}

function send(editor: Editor, meta: Meta) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(proofreadKey, meta).setMeta('addToHistory', false));
}

/** Starts (or restarts, after the dictionary changes) checking with this checker; null turns it off. */
export function setChecker(editor: Editor, checker: Checker | null): void {
  send(editor, { checker });
}

export function setIgnored(editor: Editor, ignored: Iterable<string>): void {
  send(editor, { ignored: new Set(ignored) });
}

export function forgetWord(editor: Editor, word: string): void {
  send(editor, { forget: word });
}

function found(d: Decoration): FoundIssue {
  const spec = d.spec as { issue: Issue; word: string };
  return { from: d.from, to: d.to, word: spec.word, issue: spec.issue };
}

/** Every issue shown in the scene, in order. */
export function issuesOf(state: EditorState): FoundIssue[] {
  const ps = proofreadKey.getState(state);
  return ps ? ps.set.find().map(found).sort((a, b) => a.from - b.from) : [];
}

/** The issue under a document position, for the card that opens when an underline is clicked. */
export function issueAt(state: EditorState, pos: number): FoundIssue | null {
  const ps = proofreadKey.getState(state);
  const d = ps?.set.find(pos, pos).find((d) => d.from <= pos && pos < d.to) ?? ps?.set.find(pos, pos)[0];
  return d ? found(d) : null;
}

/** Puts a suggestion in place of an issue, keeping the text's character styles. */
export function applySuggestion(editor: Editor, at: FoundIssue, text: string): void {
  const { state, view } = editor;
  if (state.doc.textBetween(at.from, at.to, undefined, '￼') !== at.word) return;
  const tr = state.tr.insertText(text, at.from, at.to);
  tr.setSelection(TextSelection.create(tr.doc, at.from + text.length));
  view.dispatch(tr);
  view.focus();
}

export function selectIssue(editor: Editor, at: FoundIssue): void {
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at.from, at.to)).scrollIntoView());
  view.focus();
}
