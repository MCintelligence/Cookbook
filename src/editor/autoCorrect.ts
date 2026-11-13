import { Extension } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { type EditorView } from '@tiptap/pm/view';
import { getSettings } from '../settings';

/**
 * Scrivener's typing corrections, with its default settings: capitalising the first word of a
 * sentence and a lone "i", superscript ordinals (1st, 2nd) and web addresses made into links.
 * Like Scrivener, each one happens as a word is finished, when a space, a new line or a mark of
 * punctuation is typed after it, never while the word is being written and never on paste.
 *
 * The rules follow Scrivener 3.5's own (its KBTextView), read from the app, so the odd cases come
 * out the same: "e.g." and "i.e." don't start sentences, nor does a full stop inside a word
 * ("3.5", "www."); "?" or "!" before a closing quote doesn't end one, but "." does; nothing after
 * "…" is capitalised; and "i" only becomes "I" after a space, a new line or an opening bracket.
 */

/** Scrivener's trigger: a space, a new line or any punctuation (NSCharacterSet punctuationCharacterSet). */
const DELIMITER = /[\s\p{P}]/u;
/** NSCharacterSet alphanumericCharacterSet: letters, marks and numbers. */
const ALNUM = /[\p{L}\p{M}\p{N}]/u;
const LOWER = /\p{Ll}/u;
const SPACE = /\s/u;
/** What ends a sentence for Scrivener. A paragraph break is "\n". */
const ENDS = '.!?\n\r\f';
/** Opening and closing quotes, double then single (the English set macOS gives Scrivener). */
const OPEN_DOUBLE = '“';
const CLOSE_DOUBLE = '”';
const OPEN_SINGLE = '‘';
const CLOSE_SINGLE = '’';
/** Words Scrivener never capitalises at the start of a sentence. */
const NOT_CAPITALISED = ['e.', 'http:', 'https:', 'ftp:'];

function lastIndexIn(text: string, chars: string, end: number): number {
  for (let i = end - 1; i >= 0; i--) if (chars.includes(text[i]!)) return i;
  return -1;
}

function firstMatch(text: string, re: RegExp, from: number, to: number): number {
  for (let i = from; i < to; i++) if (re.test(text[i]!)) return i;
  return -1;
}

/**
 * Where the first word of the sentence just finished should get its capital, or null. `text` runs
 * up to and including the character just typed, at `typed`; a paragraph break before is "\n".
 * 'stop' means Scrivener goes no further: not even "i" is capitalised (as in "i.e.").
 */
export function sentenceCapital(text: string, typed: number): number | null | 'stop' {
  // The end of the last word before the typed character.
  let wordEnd = typed;
  for (let i = typed - 1; i >= 0; i--) {
    if (ALNUM.test(text[i]!)) {
      wordEnd = i + 1;
      break;
    }
  }
  // Where the sentence starts: the last stop before that word, if a space follows it.
  let start = 0;
  const stop = lastIndexIn(text, ENDS, wordEnd);
  if (stop >= 0) {
    const after = text[stop + 1];
    if (after === undefined || text[stop] === '\n' || SPACE.test(after)) start = stop;
    else if ((after === CLOSE_DOUBLE || after === CLOSE_SINGLE || after === '"' || after === "'") && stop !== 0 && text[stop] === '.') start = stop;
    else return null;
  }
  // The sentence's first letter or number must be a small letter, and its word the one just finished.
  const first = firstMatch(text, ALNUM, start, typed);
  if (first < 0 || first !== firstMatch(text, LOWER, start, typed)) return null;
  if (firstMatch(text, DELIMITER, first, typed + 1) !== typed) return null;
  if (text[first] === 'i' && text[first + 1] === '.') return 'stop';
  for (const phrase of NOT_CAPITALISED) if (text.slice(first, first + phrase.length).toLowerCase() === phrase) return null;
  if (first >= 5 && ['i.e. ', 'e.g. '].includes(text.slice(first - 5, first))) return null;

  const notAfterEllipsis = () => (text[first - 1] === '…' ? null : first);
  /** After a dash, a word straight after an opening quote isn't a new sentence (“—and so). */
  const afterDash = (at: number) => {
    let c = text[at];
    if (c === '-') {
      for (let i = at - 1; i >= 0; i--) {
        if (text[i] !== '-') {
          c = text[i];
          break;
        }
      }
    }
    return c === OPEN_DOUBLE || c === OPEN_SINGLE || c === '"' || c === "'" ? null : notAfterEllipsis();
  };
  if (first < 2) return first === 0 ? first : notAfterEllipsis();
  const before = text[first - 1];
  if (before === '-' || before === '—' || before === '–') return afterDash(first - 2);
  if (first === 2) return notAfterEllipsis();
  if (text.slice(first - 2, first) === '- ') return afterDash(first - 3);
  return notAfterEllipsis();
}

/** Where a lone "i" just finished should become "I", or null. */
export function iCapital(text: string, typed: number): number | null {
  if (typed < 1 || text[typed - 1] !== 'i') return null;
  if (typed > 1) {
    const before = text[typed - 2]!;
    if (!SPACE.test(before) && !'([{<'.includes(before)) return null;
  }
  const c = text[typed]!;
  if (!DELIMITER.test(c)) return null;
  if (c === '.') {
    // "i." ends a sentence (so did i.), but not when it starts one (i.e.).
    if (typed === 1) return null;
    const stop = lastIndexIn(text, ENDS + '…', typed - 2);
    if (stop >= 0 && firstMatch(text, /\S/u, stop + 1, typed - 2) < 0) return null;
  }
  return typed - 1;
}

/** The capital Scrivener would make after `typed` was typed: sentence first, else "i". */
export function capitalAt(text: string, typed: number, sentences: boolean, i: boolean): number | null {
  if (!DELIMITER.test(text[typed] ?? '')) return null;
  if (sentences) {
    const at = sentenceCapital(text, typed);
    if (at === 'stop') return null;
    if (at !== null) return at;
  }
  return i ? iCapital(text, typed) : null;
}

/** The ordinal suffix English gives n: 1st, 2nd, 3rd, 4th, 11th, 21st. */
function suffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

/**
 * The suffix of an ordinal just finished ("1st", "22nd") to raise, as [from, to) in `text`, or null.
 * As in Scrivener, the word must be all digits then exactly the right suffix, in small letters.
 */
export function ordinalAt(text: string, typed: number): [number, number] | null {
  if (typed < 2 || !/[\s\p{P}]/u.test(text[typed] ?? '')) return null;
  let start = typed;
  while (start > 0 && !/[\s\p{P}]/u.test(text[start - 1]!)) start--;
  const m = /^(\d+)([a-z]+)$/.exec(text.slice(start, typed));
  if (!m || m[2] !== suffix(Number(m[1]!.slice(-3)))) return null;
  return [start + m[1]!.length, typed];
}

/** Top-level domains a bare address (example.com) is linked with; www. and http:// always are. */
const DOMAINS = 'com|org|net|edu|gov|mil|int|info|biz|io|co|uk|us|ca|au|nz|ie|de|fr|es|it|nl|eu|me|app|dev';
const ADDRESS = new RegExp(`^(?:(?:https?|ftp)://[^\\s<>"]+|www\\.[^\\s<>"]+\\.[^\\s<>"]+|[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${DOMAINS})(?:/[^\\s<>"]*)?|[\\w.+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+)$`, 'i');

/**
 * A web or mail address just finished, as [from, to, href], or null. Punctuation typed or left
 * at its end (a full stop after it) is not part of it.
 */
export function addressAt(text: string, typed: number): [number, number, string] | null {
  if (!DELIMITER.test(text[typed] ?? '')) return null;
  let start = typed;
  while (start > 0 && !SPACE.test(text[start - 1]!) && !'([{<“‘"'.includes(text[start - 1]!)) start--;
  let end = typed;
  // A typed "." or "/" may be the middle of the address, not its end.
  if (!SPACE.test(text[typed]!) && /[./:@\-_~?=&#%+]/.test(text[typed]!)) return null;
  while (end > start && /[.,;:!?'"’”)\]}>]/.test(text[end - 1]!)) end--;
  const word = text.slice(start, end);
  if (!ADDRESS.test(word)) return null;
  const href = /^(?:https?|ftp):\/\//i.test(word) ? word : word.includes('@') && !word.includes('/') ? `mailto:${word}` : `http://${word}`;
  return [start, end, href];
}

// ---------- in the editor ----------

export const autoCorrectKey = new PluginKey('autoCorrect');

/**
 * The text Scrivener would look back over: the paragraph up to the caret, after the paragraph
 * before it and a "\n". Pictures and notes count as one character, as they take one place.
 * `own` is where this paragraph starts in the text.
 */
function textBefore(state: EditorState, pos: number): { text: string; own: number; offset: number } | null {
  const $pos = state.doc.resolve(pos);
  const block = $pos.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const own = state.doc.textBetween($pos.start(), pos, undefined, (leaf) => (leaf.type.name === 'hardBreak' ? '\u2028' : '\ufffc'));
  let prior = '';
  if ($pos.before() > 0) {
    let previous: PMNode | null = null;
    state.doc.nodesBetween(0, $pos.before(), (node) => {
      if (node.isTextblock) previous = node;
      return !node.isTextblock;
    });
    prior = `${(previous as PMNode | null)?.textContent ?? ''}\n`;
  }
  return {
    text: prior + own,
    own: prior.length,
    offset: $pos.start() - prior.length,
  };
}

function hasMark(state: EditorState, from: number, to: number, name: string): boolean {
  const type = state.schema.marks[name];
  return !!type && state.doc.rangeHasMark(from, to, type);
}

/**
 * Scrivener's corrections for the word finished at `pos`: by the character just before it, or,
 * when `newLine` is set, by the paragraph break about to be made there. Adds them to `tr`.
 */
export function correctionsAt(state: EditorState, pos: number, newLine: boolean, tr: Transaction): boolean {
  const s = getSettings();
  const found = textBefore(state, pos);
  if (!found) return false;
  const text = found.text + (newLine ? '\n' : '');
  const typed = text.length - 1;
  if (typed < found.own) return false;
  const at = (i: number) => found.offset + i;
  const plain = (from: number, to: number) => from >= at(found.own) && !hasMark(state, from, to, 'code') && !hasMark(state, from, to, 'link');
  let changed = false;

  const capital = capitalAt(text, typed, s.capitalSentences, s.capitalI);
  if (capital !== null && plain(at(capital), at(capital) + 1)) {
    const from = at(capital);
    const node = state.doc.nodeAt(from);
    const upper = text[capital]!.toUpperCase();
    if (node?.isText && upper.length === 1) {
      tr.replaceWith(from, from + 1, state.schema.text(upper, node.marks));
      changed = true;
    }
  }

  const sup = state.schema.marks.superscript;
  const ordinal = s.ordinals && sup ? ordinalAt(text, typed) : null;
  if (ordinal && sup && plain(at(ordinal[0]), at(ordinal[1])) && !state.doc.rangeHasMark(at(ordinal[0]), at(ordinal[1]), sup)) {
    tr.addMark(at(ordinal[0]), at(ordinal[1]), sup.create());
    changed = true;
  }

  const link = state.schema.marks.link;
  const address = s.webLinks && link ? addressAt(text, typed) : null;
  if (address && link && plain(at(address[0]), at(address[1]))) {
    tr.addMark(at(address[0]), at(address[1]), link.create({ href: address[2] }));
    changed = true;
  }
  return changed;
}

/** Makes the corrections a change of their own, so Undo takes back just the correction, as in Scrivener. */
function dispatchOwn(view: EditorView, tr: Transaction) {
  view.dispatch(closeHistory(tr.setMeta(autoCorrectKey, true)));
}

/** A new paragraph or line is Scrivener's "\n": the word before it is finished. */
export const AutoCorrectKeys = Extension.create({
  name: 'autoCorrectKeys',
  // Ahead of the keys that make the new paragraph.
  priority: 1100,
  addKeyboardShortcuts() {
    const finish = () => {
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const tr = state.tr;
      // Keep any formatting the caret was holding for the new line.
      if (correctionsAt(state, selection.from, true, tr)) dispatchOwn(view, tr.setStoredMarks(state.storedMarks));
      return false;
    };
    return { Enter: finish, 'Shift-Enter': finish };
  },
});

/**
 * Runs the corrections after each character typed, once the typing is on the page. It comes after
 * the typing shortcuts: when one of them takes the key (" becoming “), the correction follows its
 * change instead; otherwise the key is noted here as it goes by.
 */
export const AutoCorrect = Extension.create({
  name: 'autoCorrect',
  priority: 1,
  addProseMirrorPlugins() {
    let typed = false;
    let pending = false;
    return [
      new Plugin({
        key: autoCorrectKey,
        props: {
          handleTextInput(_view, _from, _to, text) {
            typed = text.length === 1 && DELIMITER.test(text);
            return false;
          },
        },
        appendTransaction(transactions, _old, state) {
          const byKey = typed;
          typed = false;
          const byShortcut = transactions.some((t) => t.getMeta('inputRule'));
          if (!byKey && !byShortcut) return null;
          if (!transactions.some((t) => t.docChanged) || transactions.some((t) => t.getMeta(autoCorrectKey) || t.getMeta('paste') || t.getMeta('uiEvent') === 'paste' || t.getMeta('uiEvent') === 'drop')) return null;
          const { selection } = state;
          if (!selection.empty || selection.$from.parentOffset === 0) return null;
          if (byShortcut && !DELIMITER.test(state.doc.textBetween(selection.from - 1, selection.from, undefined, '￼'))) return null;
          pending = true;
          return null;
        },
        view: () => ({
          update(view) {
            if (!pending) return;
            pending = false;
            const { state } = view;
            const tr = state.tr;
            if (state.selection.empty && correctionsAt(state, state.selection.from, false, tr)) dispatchOwn(view, tr);
          },
        }),
      }),
    ];
  },
});
