/// <reference lib="webworker" />
import nspell from 'nspell';
import { type LocalLinter } from 'harper.js';
import { type Dialect, type Issue, checkSpelling, rankSuggestions } from './check';
import { type Around, type Counts, countText, emptyCounts, fitter, parseCounts } from './context';
import { isSentenceRule, styleIssues } from './style';

/**
 * The proofreader's background worker: it holds the Hunspell dictionary and,
 * once the writer starts reviewing, Harper's grammar engine and the style
 * checks, so loading them
 * and checking text never stalls typing.
 */
export type Request =
  | { id: number; type: 'configure'; dialect: Dialect; words: string[]; names: string[] }
  | { id: number; type: 'check'; texts: string[]; review: boolean }
  | { id: number; type: 'suggest'; word: string; around?: Around }
  | { id: number; type: 'learn'; texts: string[] };

export type Response = { id: number; result: unknown } | { id: number; error: string };

type Speller = ReturnType<typeof nspell>;

const loaded = new Map<Dialect, Promise<{ aff: string; dic: string }>>();
let ready: Promise<{ speller: Speller; names: string[] }> | null = null;
let config: { dialect: Dialect; words: string[] } = { dialect: 'en-US', words: [] };
/** Harper is large, so it is only loaded the first time grammar is wanted. */
let grammar: Promise<{ linter: LocalLinter; why: Record<string, string>; grammarIssues: typeof import('./grammar').grammarIssues }> | null = null;
let grammarConfigured: Promise<void> | null = null;
/** Which words follow which in the books, loaded the first time a suggestion is wanted; empty if it can't be. */
let pairs: Promise<Counts> | null = null;
/** The same for the writer's own book. */
let book: Counts = emptyCounts();

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
      const [{ LocalLinter }, { slimBinary }, g] = await Promise.all([import('harper.js'), import('harper.js/slimBinary'), import('./grammar')]);
      const linter = new LocalLinter({ binary: slimBinary });
      await g.setUpLinter(linter, config.dialect, config.words);
      return { linter, why: await linter.getLintDescriptions(), grammarIssues: g.grammarIssues };
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
    ready = files(req.dialect).then(({ aff, dic }) => {
      const speller = nspell(aff, dic);
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
  const spelling = req.texts.map((t): Issue[] => checkSpelling(t, speller, names));
  if (!req.review) return spelling;
  const g = await loadGrammar();
  await grammarConfigured;
  const found = await g.grammarIssues(g.linter, req.texts, spelling, g.why);
  return spelling.map((s, i) => {
    const marked = [...s, ...found[i]!];
    // Our style notes give way to a mistake on the same words; whole sentences can hold both.
    const style = styleIssues(req.texts[i]!, names).filter((st) => isSentenceRule(st.rule) || !marked.some((m) => st.from < m.to && st.to > m.from));
    return [...marked, ...style].sort((a, b) => a.from - b.from);
  });
}

self.onmessage = (e: MessageEvent<Request>) => {
  handle(e.data).then(
    (result) => self.postMessage({ id: e.data.id, result } satisfies Response),
    (err: unknown) => self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) } satisfies Response),
  );
};
