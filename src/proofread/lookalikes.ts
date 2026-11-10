import { type Issue } from './check';
import { type Counts, emptyCounts, fitter } from './context';

/**
 * Look-alike words, the way Word's contextual spelling finds them: "I went
 * form the house", "it was quite in the room". Each word is spelt right, so
 * Sam can't see it, but the books Sam learnt from (context.ts) say how often
 * each word comes between the words around it. When its look-alike fits there
 * far better, it is probably the one meant.
 *
 * Contractions aren't in the books' counts, so "you’re" is weighed as
 * "you are". A word at the end of a clause has only one neighbour to go on,
 * which isn't enough, so it is left alone, and so are names.
 */

/** Words that are easy to swap, each with the ones it is mistaken for. */
const SETS: string[][] = [
  ['their', 'there', 'they are'],
  ['your', 'you are'],
  ['its', 'it is'],
  ['whose', 'who is'],
  ['to', 'too'],
  ['then', 'than'],
  ['past', 'passed'],
  ['loose', 'lose'],
  ['peak', 'peek'],
  ['breath', 'breathe'],
  ['accept', 'except'],
  ['form', 'from'],
  ['principal', 'principle'],
  ['complement', 'compliment'],
  ['affect', 'effect'],
  ['quiet', 'quite'],
  ['weather', 'whether'],
  ['advice', 'advise'],
  ['bare', 'bear'],
  ['brake', 'break'],
  ['dessert', 'desert'],
  ['piece', 'peace'],
  ['threw', 'through'],
  ['were', 'where', 'wear'],
  ['here', 'hear'],
  ['new', 'knew'],
  ['no', 'know'],
  ['right', 'write'],
];

const CONTRACTED: Record<string, string> = { "they're": 'they are', "you're": 'you are', "it's": 'it is', "who's": 'who is' };
const CONTRACT: Record<string, string> = Object.fromEntries(Object.entries(CONTRACTED).map(([short, long]) => [long, short.replace("'", '’')]));
const SET_OF = new Map(SETS.flatMap((set) => set.map((w) => [w, set] as const)));

/**
 * How much better the look-alike has to fit, in natural logs: about 400 times likelier. Tuned on
 * 40 common slips and three novels: it finds 24 of the 40 and flags about one word in 100,000 of
 * published prose.
 */
const MARGIN = 6;

/** Words with an apostrophe inside, as one. */
const WORD = /\p{L}+(?:['’]\p{L}+)?/gu;
/** Nothing but punctuation (or nothing) after the word: the end of a clause. */
const CLAUSE_END = /^\s*(?:[,.!?;:”"’)\]…—–-]|$)/u;
const SENTENCE_START = /(?:^|[.!?“"‘—]\s*)$/u;

const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);

/** Look-alike slips in one paragraph. `counts` are the books' word pairs and the writer's own. */
export function lookalikes(text: string, counts: Counts[]): Issue[] {
  const [books, book] = counts;
  if (!books || books.total === 0) return [];
  const out: Issue[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const lower = word.toLowerCase().replace(/’/g, "'");
    const key = CONTRACTED[lower] ?? lower;
    const set = SET_OF.get(key);
    if (!set) continue;
    const before = text.slice(Math.max(0, m.index - 80), m.index);
    const after = text.slice(m.index + word.length, m.index + word.length + 80);
    if (CLAUSE_END.test(after)) continue;
    // A capital in mid-sentence is a name: "Peak District", "the Weather Channel".
    if (/^\p{Lu}/u.test(word) && !SENTENCE_START.test(before) && word !== 'I') continue;
    // "No, there were no tears": a "no" that opens a sentence answers something.
    if ((key === 'no' || key === 'know') && SENTENCE_START.test(before)) continue;
    const fit = fitter({ before, after }, books, book ?? emptyCounts());
    const mine = fit(key);
    let best: [string, number] | null = null;
    for (const other of set) {
      if (other === key) continue;
      const score = fit(other);
      if (!best || score > best[1]) best = [other, score];
    }
    if (!best || best[1] - mine <= MARGIN) continue;
    const fix = matchCase(word, CONTRACT[best[0]] ?? best[0]);
    out.push({
      from: m.index,
      to: m.index + word.length,
      kind: 'grammar',
      rule: 'look-alike',
      message: `“${word}” is spelt right, but “${fix}” fits here much better.`,
      suggestions: [fix],
      why: 'Words that sound or look alike are easy to swap, and a spell check can’t see it. Pete compares how often each one is written between the words around it.',
    });
  }
  return out;
}
