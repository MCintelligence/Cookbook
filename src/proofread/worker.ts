/// <reference lib="webworker" />
import nspell from 'nspell';
import { type LocalLinter } from 'harper.js';
import { type Dialect, type Issue, checkSpelling, rankSuggestions } from './check';
import { type Around, type Counts, countText, emptyCounts, fitter, parseCounts } from './context';
import { combine, peteIssues } from './pete';
import { NO_PATTERNS, type OwnPatterns, compilePatterns, ownPatternIssues, spareExceptions, withOwn } from './ownPatterns';
import { isSentenceRule, styleIssues } from './style';
import { supplementEntries } from './supplement';

/**
 * The proofreader's background worker: it holds the Hunspell dictionary and,
 * once grammar or style is first wanted, Harper's grammar engine and the style
 * checks, so loading them
 * and checking text never stalls typing.
 */
export type Request =
  | { id: number; type: 'configure'; dialect: Dialect; words: string[]; names: string[] }
  | { id: number; type: 'check'; texts: string[]; review: boolean }
  | { id: number; type: 'suggest'; word: string; around?: Around }
  | { id: number; type: 'learn'; texts: string[] }
  | { id: number; type: 'patterns'; lines: string[] };

export type Response = { id: number; result: unknown } | { id: number; error: string };

type Speller = ReturnType<typeof nspell>;

const loaded = new Map<Dialect, Promise<{ aff: string; dic: string }>>();
let ready: Promise<{ speller: Speller; names: string[] }> | null = null;
let config: { dialect: Dialect; words: string[] } = { dialect: 'en-US', words: [] };
/** Harper is large, so it is only loaded the first time grammar is wanted. */
let grammar: Promise<{ linter: LocalLinter; why: Record<string, string>; grammarIssues: typeof import('./grammar').grammarIssues; parsedIssues: typeof import('./parse').parsedIssues }> | null = null;
let grammarConfigured: Promise<void> | null = null;
/** The writer's own list for Spicy Sally (see ownPatterns.ts). */
let own: OwnPatterns = NO_PATTERNS;
/** Which words follow which in the books, loaded the first time a suggestion is wanted; empty if it can't be. */
let pairs: Promise<Counts> | null = null;
/** The same for the writer's own book. */
let book: Counts = emptyCounts();

/**
 * Answers already worked out, by paragraph text, for every editor at once: opening an Item again,
 * split view and Mise en Place don't check unchanged paragraphs a second time. Cleared when the
 * dictionary or the writer's words change. Grammar answers don't depend on the book's word pairs
 * enough to go stale between them (only Pete's agreement guard reads them), so they are kept.
 */
const answers = { spelling: new Map<string, Issue[]>(), review: new Map<string, Issue[]>() };
const MOST_ANSWERS = 5000;
/** Goes up with each new dictionary, so answers worked out with the old one are never kept. */
let generation = 0;

function remember(store: Map<string, Issue[]>, text: string, issues: Issue[], from: number) {
  if (from !== generation) return;
  if (store.size >= MOST_ANSWERS) store.delete(store.keys().next().value!);
  store.set(text, issues);
}

function loadPairs() {
  pairs ??= fetch(`${import.meta.env.BASE_URL}dictionaries/word-pairs.txt`)
    .then((r) => (r.ok ? r.text() : ''))
    .then(parseCounts, () => emptyCounts());
  return pairs;
}

function files(dialect: Dialect) {
  let files = loaded.get(dialect);
  if (!files) {
    const url = (ext: string) => `${import.meta.env.BASE_URL}dictionaries/${dialect}.${ext}`;
    const text = (ext: string) =>
      fetch(url(ext)).then((r) => {
        if (!r.ok) throw new Error(`The ${dialect} dictionary is missing.`);
        return r.text();
      });
    files = Promise.all([text('aff'), text('dic')]).then(([aff, dic]) => ({ aff, dic }));
    files.catch(() => loaded.delete(dialect));
    loaded.set(dialect, files);
  }
  return files;
}

function loadGrammar() {
  if (!grammar) {
    grammar = (async () => {
      const [{ LocalLinter }, { slimBinary }, g, parse] = await Promise.all([import('harper.js'), import('harper.js/slimBinary'), import('./grammar'), import('./parse')]);
      const linter = new LocalLinter({ binary: slimBinary });
      await g.setUpLinter(linter, config.dialect, config.words);
      return { linter, why: await linter.getLintDescriptions(), grammarIssues: g.grammarIssues, parsedIssues: parse.parsedIssues };
    })();
    grammar.catch(() => (grammar = null));
    grammarConfigured = grammar.then(() => {});
  }
  return grammar;
}

async function handle(req: Request): Promise<unknown> {
  if (req.type === 'configure') {
    // Every word of every story name is a word, so names are never misspelt.
    const words = [...req.words, ...req.names.flatMap((n) => n.split(/\s+/))].filter(Boolean);
    config = { dialect: req.dialect, words };
    answers.spelling.clear();
    answers.review.clear();
    generation++;
    ready = files(req.dialect).then(({ aff, dic }) => {
      const speller = nspell(aff, dic);
      for (const [word, model] of supplementEntries()) speller.add(word, model);
      for (const word of words) speller.add(word);
      return { speller, names: req.names };
    });
    if (grammar) {
      const g = grammar;
      grammarConfigured = g.then(async ({ linter }) => (await import('./grammar')).setUpLinter(linter, req.dialect, words));
    }
    await ready;
    // Read the word pairs while the writer is busy, so the first suggestion doesn't wait for them.
    void loadPairs();
    return null;
  }
  if (req.type === 'patterns') {
    own = compilePatterns(req.lines);
    // The writer's own list changes what Sally says, so earlier full reviews are stale.
    answers.review.clear();
    generation++;
    return null;
  }
  if (req.type === 'learn') {
    book = countText(req.texts);
    return null;
  }
  if (!ready) throw new Error('The proofreader is not set up yet.');
  const { speller, names } = await ready;
  if (req.type === 'suggest') {
    const word = req.word.replace(/’/g, "'");
    const found = speller.suggest(word);
    return rankSuggestions(word, found, 6, found.length > 1 ? fitter(req.around, await loadPairs(), book) : undefined);
  }
  const store = req.review ? answers.review : answers.spelling;
  const from = generation;
  const known = req.texts.map((t) => store.get(t));
  const todo = req.texts.filter((_, i) => !known[i]);
  if (todo.length > 0) {
    const spelling = todo.map((t): Issue[] => answers.spelling.get(t) ?? checkSpelling(t, speller, names));
    todo.forEach((t, i) => remember(answers.spelling, t, spelling[i]!, from));
    if (req.review) {
      const g = await loadGrammar();
      await grammarConfigured;
      const found = await g.grammarIssues(g.linter, todo, spelling, g.why);
      const counts = [await loadPairs(), book];
      const isWord = (w: string) => speller.correct(w);
      const reviewed = todo.map((text, i) => {
        const style = withOwn(styleIssues(text, names), ownPatternIssues(text, own));
        return spareExceptions(text, combine(spelling[i]!, found[i]!, ownGrammar(peteIssues(text, isWord, counts), g.parsedIssues(text)), style, isSentenceRule), own);
      });
      todo.forEach((text, i) => remember(answers.review, text, reviewed[i]!, from));
      const fresh = new Map(todo.map((t, i) => [t, reviewed[i]!]));
      return req.texts.map((t, i) => known[i] ?? fresh.get(t)!);
    }
    const fresh = new Map(todo.map((t, i) => [t, spelling[i]!]));
    return req.texts.map((t, i) => known[i] ?? fresh.get(t)!);
  }
  return known as Issue[][];
}

/** Pete's word rules first; the sentence reader adds what they didn't already mark. */
function ownGrammar(pete: Issue[], parsed: Issue[]): Issue[] {
  return [...pete, ...parsed.filter((p) => !pete.some((i) => p.from < i.to && p.to > i.from))];
}

self.onmessage = (e: MessageEvent<Request>) => {
  handle(e.data).then(
    (result) => self.postMessage({ id: e.data.id, result } satisfies Response),
    (err: unknown) => self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) } satisfies Response),
  );
};
