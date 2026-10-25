import { Extension, type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { type TextMap, textMap } from '../editor/textmap';
import { type Issue } from './check';
import { type Hiding, type IssueKeys, isHidden, keysOf } from './rules';
import { isSentenceRule } from './style';
import { type Checker } from './client';

/**
 * The proofreader in the editor. Each paragraph's text is checked in the
 * background and the answer kept by text, so typing only rechecks the
 * paragraph that changed. A word being typed is never underlined: it is
 * checked once the writer moves on.
 */

interface ProofState {
  checker: Checker | null;
  /** Reviewing (Seasonings is open): grammar and style are checked too, not just spelling. */
  review: boolean;
  /** Goes up whenever the checker or its dictionary changes; older answers are dropped. */
  version: number;
  /** Issues by paragraph text, with offsets into that text. */
  cache: Map<string, Issue[]>;
  /** What the writer ignored and the checks they switched off. */
  hiding: Hiding;
  set: DecorationSet;
  /** The word the writer is typing, whose underline waits until they leave it. */
  fresh: { from: number; to: number } | null;
}

interface Meta {
  checker?: Checker | null;
  review?: boolean;
  ignored?: Set<string>;
  off?: Set<string>;
  results?: { version: number; entries: [string, Issue[]][] };
  /** Drops the underlines on a word at once, such as one just added to the dictionary. */
  forget?: string;
}

export interface FoundIssue extends IssueKeys {
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

/**
 * Sally's brackets around a style remark: 『 』 for a single word, 「 」 for a
 * longer passage. Page furniture, never part of the text.
 */
export const bracketsFor = (word: string): [string, string] => (/\s/u.test(word.trim()) ? ['「', '」'] : ['『', '』']);

function bracket(at: number, open: boolean, glyph: string, spec: object): Decoration {
  return Decoration.widget(
    at,
    () => {
      const el = document.createElement('span');
      el.className = `cb-bracket cb-bracket-${open ? 'open' : 'close'}`;
      el.textContent = glyph;
      el.setAttribute('aria-hidden', 'true');
      return el;
    },
    { ...spec, bracket: true, side: open ? -1 : 1, ignoreSelection: true },
  );
}

function decorate(pos: number, map: TextMap, issue: Issue, keys: IssueKeys): Decoration[] {
  const from = pos + 1 + map.positions[issue.from]!;
  const to = pos + 2 + map.positions[issue.to - 1]!;
  const word = map.text.slice(issue.from, issue.to);
  // Spaces can't show an underline, so they are tinted instead.
  const space = word.trim() === '' ? ' cb-issue-space' : '';
  // Each issue gets its own element (nodeName), so a word's underline and its sentence's tint don't merge into one.
  const sentence = isSentenceRule(issue.rule) ? ' cb-issue-sentence' : '';
  const spec = { issue, word, ...keys };
  const mark = Decoration.inline(from, to, { nodeName: 'span', class: `cb-issue cb-issue-${issue.kind}${space}${sentence}`, 'data-rule': issue.rule }, spec);
  if (issue.kind !== 'style') return [mark];
  const [open, close] = bracketsFor(word);
  return [bracket(from, true, open, spec), mark, bracket(to, false, close, spec)];
}

/** Underlines from the cache, keeping the last ones (moved with the text) for paragraphs still being checked. */
function build(doc: PMNode, cache: Map<string, Issue[]>, hiding: Hiding, old: DecorationSet): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = mapOf(node);
    const issues = cache.get(map.text);
    if (issues) {
      for (const issue of issues) {
        const keys = keysOf(issue, map.text);
        if (!isHidden(keys, hiding)) decos.push(...decorate(pos, map, issue, keys));
      }
    } else {
      decos.push(...old.find(pos, pos + node.nodeSize).filter((d) => !isHidden(d.spec as IssueKeys, hiding)));
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
    state.checker.check(texts, state.review).then(
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
          init: () => ({ checker: null, review: false, version: 0, cache: new Map(), hiding: { ignored: new Set(), off: new Set() }, set: DecorationSet.empty, fresh: null }),
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
              if (meta.review !== undefined && meta.review !== next.review) next = { ...next, review: meta.review, version: next.version + 1, cache: new Map() };
              if (meta.ignored) next = { ...next, hiding: { ...next.hiding, ignored: meta.ignored } };
              if (meta.off) next = { ...next, hiding: { ...next.hiding, off: meta.off } };
              if (meta.forget) {
                const word = meta.forget;
                const spelling = (spec: { word: string; issue: Issue }) => spec.issue.kind === 'spelling' && spec.word === word;
                next = { ...next, set: next.set.remove(next.set.find(undefined, undefined, (spec) => spelling(spec as { word: string; issue: Issue }))) };
              }
              if (meta.results && meta.results.version === next.version) {
                const cache = new Map(next.cache);
                for (const [text, issues] of meta.results.entries) cache.set(text, issues);
                next = { ...next, cache: prune(state.doc, cache) };
              }
              if (!next.checker) return { ...next, set: DecorationSet.empty };
              // Leaving review takes grammar and style away at once; spelling stays until rechecked.
              if (meta.review === false) next = { ...next, set: next.set.remove(next.set.find(undefined, undefined, (spec) => (spec as { issue: Issue }).issue.kind !== 'spelling')) };
            }
            if (tr.docChanged || (meta && (meta.ignored || meta.off || meta.results))) next = { ...next, set: build(state.doc, next.cache, next.hiding, next.set) };
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

/** Grammar and style are checked only while the writer is reviewing. */
export function setReview(editor: Editor, review: boolean): void {
  send(editor, { review });
}

/** Rule groups (see ruleGroup) the writer has switched off. */
export function setRulesOff(editor: Editor, off: Iterable<string>): void {
  send(editor, { off: new Set(off) });
}

export function setIgnored(editor: Editor, ignored: Iterable<string>): void {
  send(editor, { ignored: new Set(ignored) });
}

export function forgetWord(editor: Editor, word: string): void {
  send(editor, { forget: word });
}

/** The issues themselves, not Sally's brackets around them. */
const isIssue = (spec: { bracket?: boolean }) => !spec.bracket;

function found(d: Decoration): FoundIssue {
  const spec = d.spec as { issue: Issue; word: string } & IssueKeys;
  return { from: d.from, to: d.to, word: spec.word, issue: spec.issue, key: spec.key, once: spec.once, group: spec.group };
}

/** Every issue shown in the scene, in order. */
export function issuesOf(state: EditorState): FoundIssue[] {
  const ps = proofreadKey.getState(state);
  return ps ? ps.set.find(undefined, undefined, isIssue).map(found).sort((a, b) => a.from - b.from) : [];
}

/** The issue under a document position, for the card that opens when an underline is clicked. */
export function issueAt(state: EditorState, pos: number): FoundIssue | null {
  const ps = proofreadKey.getState(state);
  // The narrowest one: a word's issue, not the sentence around it.
  const here = (ps?.set.find(pos, pos, isIssue) ?? []).sort((a, b) => Number(a.from > pos || a.to <= pos) - Number(b.from > pos || b.to <= pos) || a.to - a.from - (b.to - b.from));
  const d = here[0];
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
