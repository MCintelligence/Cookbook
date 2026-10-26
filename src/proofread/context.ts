/**
 * Salty Sam's sense of context: how often words come one after another, so
 * a misspelling's suggestions can be put in order by the words around it.
 * In "the stroe was shut", "store" comes before "strobe" because "the store"
 * and "store was" are common pairs. The counts come from public-domain books
 * (public/dictionaries/word-pairs.txt, made by scripts/build-word-pairs.mjs)
 * and from the writer's own book, which counts for more. See rankSuggestions
 * in check.ts for how the fit is weighed against the letters a suggestion changes.
 */
export interface Counts {
  words: Map<string, number>;
  /** Keyed "first second". */
  pairs: Map<string, number>;
  total: number;
}

export const emptyCounts = (): Counts => ({ words: new Map(), pairs: new Map(), total: 0 });

/** The words of check.ts, with digits too so "3 pm" isn't read as a pair. */
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}]|['’-](?=\p{L}))*/gu;
/** What ends a run of words that read on from each other: sentence ends, dashes, brackets, quotes and line breaks. */
const BREAK = /[.!?;:()[\]{}"“”—–…\n]+/u;

const norm = (w: string) => w.toLowerCase().replace(/’/g, "'");
const wordsOf = (run: string) => [...run.matchAll(WORD)].map((m) => norm(m[0]));

/** Lowercased words in runs, each run ended by a break. */
export function runs(text: string): string[][] {
  return text
    .split(BREAK)
    .map(wordsOf)
    .filter((r) => r.length > 0);
}

export function addText(counts: Counts, text: string): void {
  for (const run of runs(text)) {
    for (let i = 0; i < run.length; i++) {
      counts.words.set(run[i]!, (counts.words.get(run[i]!) ?? 0) + 1);
      counts.total++;
      if (i > 0) {
        const pair = `${run[i - 1]} ${run[i]}`;
        counts.pairs.set(pair, (counts.pairs.get(pair) ?? 0) + 1);
      }
    }
  }
}

export function countText(texts: string[]): Counts {
  const counts = emptyCounts();
  for (const t of texts) addText(counts, t);
  return counts;
}

/**
 * The shipped counts: "word count" lines for words, and "first<tab>second
 * count second count…" lines for the words that follow one. Lines starting
 * with # are notes.
 */
export function parseCounts(file: string): Counts {
  const counts = emptyCounts();
  for (const line of file.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) {
      const [word, n] = line.split(' ');
      const count = Number(n);
      if (!word || !(count > 0)) continue;
      counts.words.set(word, count);
      counts.total += count;
      continue;
    }
    const first = line.slice(0, tab);
    const rest = line.slice(tab + 1).split(' ');
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const count = Number(rest[i + 1]);
      if (count > 0) counts.pairs.set(`${first} ${rest[i]}`, count);
    }
  }
  return counts;
}

/** The words just before and after a misspelling, when nothing breaks the sentence between. */
export interface Around {
  before: string;
  after: string;
}

/**
 * The writer's own book weighs as much as this share of all the books Sam
 * learnt from, however long it is, so the words it uses often come first.
 */
const BOOK_SHARE = 0.05;
/**
 * A pair never seen is worth this share of the second word alone, and never
 * more than this share of a pair seen once: "a his" is never written, so
 * "his" being common doesn't make it likely there.
 */
const BACKOFF = 0.4;

/** The likelihood of words in a row, from the books and the writer's own words together. */
function model(books: Counts, book: Counts) {
  const weight = book.total === 0 ? 0 : books.total === 0 ? 1 : (BOOK_SHARE * books.total) / book.total;
  const total = Math.max(1, books.total + weight * book.total);
  const word = (w: string) => (books.words.get(w) ?? 0) + weight * (book.words.get(w) ?? 0);
  const pair = (p: string) => (books.pairs.get(p) ?? 0) + weight * (book.pairs.get(p) ?? 0);
  // A word never seen gets half of one.
  const alone = (w: string) => (word(w) || 0.5) / total;
  const after = (a: string, b: string) => {
    const both = pair(`${a} ${b}`);
    const first = word(a);
    if (both > 0) return both / first;
    return BACKOFF * (first > 0 ? Math.min(alone(b), 1 / first) : alone(b));
  };
  /** The log likelihood of the words, starting from the word before them if there is one. */
  return (words: string[], before?: string) => {
    let score = 0;
    let prev = before;
    for (const w of words) {
      score += Math.log(prev === undefined ? alone(w) : after(prev, w));
      prev = w;
    }
    return score;
  };
}

function lastWord(text: string): string | undefined {
  return wordsOf(text.split(BREAK).at(-1) ?? '').at(-1);
}

function firstWord(text: string): string | undefined {
  return wordsOf(text.split(BREAK)[0] ?? '')[0];
}

/**
 * How well each suggestion fits between the words around it, as a log
 * likelihood from the books and the writer's own words: higher is better.
 */
export function fitter(around: Around | undefined, books: Counts, book: Counts): (suggestion: string) => number {
  const chain = model(books, book);
  const before = around && lastWord(around.before);
  const next = around && firstWord(around.after);
  return (s) => {
    const words = wordsOf(s);
    return chain(next === undefined ? words : [...words, next], before);
  };
}
