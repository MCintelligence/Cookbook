/**
 * The proofreader's checks that need no engine of their own: spelling (with
 * a Hunspell speller passed in) and story names. Everything works on a
 * paragraph's plain text and reports character offsets into it.
 */

export type IssueKind = 'spelling' | 'grammar' | 'style';

export interface Issue {
  from: number;
  to: number;
  kind: IssueKind;
  /** Which check found it, such as "spelling" or "name"; used to ignore and to switch checks off. */
  rule: string;
  message: string;
  /** Replacements for the whole of from–to; an empty one removes it. Spelling suggestions are worked out only when asked for. */
  suggestions: string[];
  /** What the rule looks for, for the card's Why? */
  why?: string;
}

/** What Ignore remembers: the word for spelling, the rule and its text for anything else. */
export function ignoreKey(issue: Pick<Issue, 'kind' | 'rule'>, text: string): string {
  return issue.kind === 'spelling' ? text : `${issue.rule}:${text}`;
}

export interface Speller {
  correct(word: string): boolean;
}

export type Dialect = 'en-US' | 'en-GB';

export const DIALECTS: { id: Dialect; label: string }[] = [
  { id: 'en-US', label: 'American' },
  { id: 'en-GB', label: 'British' },
];

/** Letters with apostrophes or hyphens inside, like "didn’t" and "well-to-do". */
const WORD = /\p{L}(?:[\p{L}\p{M}]|['’-](?=\p{L}))*/gu;
/** Things that look like words but aren't prose: links, emails, handles and code. */
const NOT_PROSE = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|[#@]\w+|`[^`]*`/gu;

export interface Word {
  word: string;
  from: number;
  to: number;
}

export function words(text: string): Word[] {
  const skip: [number, number][] = [...text.matchAll(NOT_PROSE)].map((m) => [m.index, m.index + m[0].length]);
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) {
    const from = m.index;
    const to = from + m[0].length;
    if (skip.some(([a, b]) => from < b && to > a)) continue;
    // Words joined to numbers ("3rd", "B12") aren't spelling.
    if (/\p{N}/u.test(text[from - 1] ?? '') || /\p{N}/u.test(text[to] ?? '')) continue;
    out.push({ word: m[0], from, to });
  }
  return out;
}

/** Whether a word is spelled right, trying it without a possessive and part by part when hyphenated. */
export function isCorrect(word: string, speller: Speller): boolean {
  const w = word.replace(/’/g, "'");
  if (speller.correct(w)) return true;
  // Acronyms and shouting are left alone.
  if (w.length > 1 && w === w.toUpperCase()) return true;
  const base = w.replace(/'s$/i, '');
  if (base !== w && speller.correct(base)) return true;
  if (w.includes('-')) return w.split('-').every((part) => part === '' || isCorrect(part, speller));
  return false;
}

/** Misspelt words. `ignored` holds words the writer has said to leave alone in this scene. */
export function spellingIssues(text: string, speller: Speller, ignored: Set<string> = new Set()): Issue[] {
  return words(text)
    .filter((w) => !ignored.has(w.word) && !isCorrect(w.word, speller))
    .map((w) => ({ ...w, kind: 'spelling', rule: 'spelling', message: `“${w.word}” may be misspelt.`, suggestions: [] }))
    .map(({ word: _w, ...issue }) => issue as Issue);
}

/** Optimal string alignment distance: edits, counting a swap of two letters as one. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

const capitalised = (w: string) => /^\p{Lu}/u.test(w);
const allowed = (name: string) => (name.length <= 4 ? 1 : 2);

/**
 * Near misses of the story's names, like "Mamma Lou" for Mama Lou. A
 * name of several words is caught even when each word is a real one; a
 * one-word name only when the word isn't in the dictionary, so Jane is
 * never mistaken for June.
 */
export function nameIssues(text: string, names: string[], speller: Speller): Issue[] {
  const tokens = words(text);
  const exact = new Set(names);
  const issues: Issue[] = [];
  const taken: [number, number][] = [];
  // Longest names first, so a whole name wins over a part of it.
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0 || !parts.every(capitalised)) continue;
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      const window = tokens.slice(i, i + parts.length);
      if (!window.every((t) => capitalised(t.word))) continue;
      // The words of a name are only one space apart.
      if (window.some((t, k) => k > 0 && text.slice(window[k - 1]!.to, t.from) !== ' ')) continue;
      const found = window.map((t) => t.word).join(' ');
      if (found === name || exact.has(found)) continue;
      const distance = editDistance(found, name);
      if (distance === 0 || distance > allowed(name)) continue;
      if (parts.length === 1 && isCorrect(found, speller)) continue;
      const from = window[0]!.from;
      const to = window[window.length - 1]!.to;
      if (taken.some(([a, b]) => from < b && to > a)) continue;
      taken.push([from, to]);
      issues.push({ from, to, kind: 'spelling', rule: 'name', message: `Did you mean ${name}?`, suggestions: [name] });
    }
  }
  return issues;
}

/** Contractions typed without their apostrophe. */
const CONTRACTIONS: Record<string, string> = Object.fromEntries(
  ['don’t', 'doesn’t', 'didn’t', 'can’t', 'won’t', 'isn’t', 'wasn’t', 'aren’t', 'weren’t', 'hasn’t', 'haven’t', 'hadn’t', 'couldn’t', 'wouldn’t', 'shouldn’t', 'mustn’t', 'ain’t', 'I’m', 'I’ve', 'you’re', 'they’re', 'we’ve', 'they’ve', 'you’ve', 'that’s', 'what’s', 'there’s', 'here’s', 'who’s', 'it’ll', 'she’ll', 'he’ll', 'we’ll', 'they’ll', 'you’ll', 'I’ll'].map((c) => [c.replace('’', '').toLowerCase(), c]),
);

/**
 * "dont" and its kind: the fix puts the apostrophe back, and after he, she or
 * it gives "doesn’t" straight away, so "She dont know" is caught in one go.
 */
function missingApostrophe(issue: Issue, text: string): Issue {
  const word = text.slice(issue.from, issue.to);
  let fixed = CONTRACTIONS[word.toLowerCase()];
  if (!fixed) return issue;
  if (/^[A-Z]/.test(word) && !fixed.startsWith('I’')) fixed = fixed[0]!.toUpperCase() + fixed.slice(1);
  const before = /(\p{L}+)\s+$/u.exec(text.slice(Math.max(0, issue.from - 12), issue.from))?.[1]?.toLowerCase();
  if (word.toLowerCase() === 'dont' && (before === 'he' || before === 'she' || before === 'it')) {
    return { ...issue, message: `With “${before}”, it’s “doesn’t”.`, suggestions: [word[0] === 'D' ? 'Doesn’t' : 'doesn’t', fixed] };
  }
  return { ...issue, message: `“${word}” needs an apostrophe.`, suggestions: [fixed] };
}

/** Spelling and names together, with a name's near miss taking the place of a plain misspelling. */
export function checkSpelling(text: string, speller: Speller, names: string[], ignored: Set<string> = new Set()): Issue[] {
  const near = nameIssues(text, names, speller).filter((i) => !ignored.has(text.slice(i.from, i.to)));
  const plain = spellingIssues(text, speller, ignored)
    .filter((s) => !near.some((n) => s.from < n.to && s.to > n.from))
    .map((s) => missingApostrophe(s, text));
  return [...near, ...plain].sort((a, b) => a.from - b.from);
}

const sorted = (w: string) => [...w.toLowerCase()].sort().join('');

/**
 * What one more edit costs against how well a suggestion fits (in natural
 * logs): one letter further off, it has to be about 150 times likelier where
 * it stands to come first.
 */
const EDIT_COST = 5;

/**
 * Hunspell's suggestions, best first: the fewest edits (a swap of two
 * letters counts as one), then the same letters rearranged, so "teh" offers
 * "the" before "ten". Acronyms only for words in capitals, and names after
 * ordinary words when the word is in lower case. With `fit` (see
 * context.ts), how well each suggestion fits the words around it is weighed
 * against its edits, so "the stroe was" offers "store" before "strobe".
 */
export function rankSuggestions(word: string, suggestions: string[], limit = 6, fit?: (suggestion: string) => number): string[] {
  const shouting = word.length > 1 && word === word.toUpperCase();
  const lower = word === word.toLowerCase();
  return suggestions
    .filter((s) => shouting || !(s.length > 1 && s === s.toUpperCase()))
    .map((s, i) => {
      const edits = editDistance(word.toLowerCase(), s.toLowerCase());
      const anagram = sorted(s) === sorted(word) ? 0 : 1;
      // Letters typed in the wrong order are the likeliest slip, so they count as half an edit against the fit.
      const cost = fit ? EDIT_COST * (edits - (1 - anagram) / 2) - fit(s) : edits;
      return { s, i, cost, anagram, name: lower && s !== s.toLowerCase() ? 1 : 0 };
    })
    .sort((a, b) => a.cost - b.cost || a.anagram - b.anagram || a.name - b.name || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.s);
}
