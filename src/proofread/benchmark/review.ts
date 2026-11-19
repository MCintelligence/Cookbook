import { readFileSync } from 'node:fs';
import nspell from 'nspell';
import { LocalLinter } from 'harper.js';
import { slimBinary } from 'harper.js/slimBinary';
import { type Issue, checkSpelling, rankSuggestions } from '../check';
import { type Counts, parseCounts } from '../context';
import { grammarIssues, setUpLinter } from '../grammar';
import { parsedIssues } from '../parse';
import { useDictionary } from '../core/lexicon';
import { combine, peteIssues } from '../pete';
import { effectiveOff, ruleGroup } from '../rules';
import { isSentenceRule, styleIssues } from '../style';
import { supplementEntries } from '../supplement';

/**
 * Seasonings as the worker runs it, for the benchmarks: Sam, Harper, Pete and Pete's sentence
 * reader, every check at its default setting. Test-only (reads the dictionaries from disk).
 */

const speller = nspell({
  aff: readFileSync('public/dictionaries/en-US.aff'),
  dic: readFileSync('public/dictionaries/en-US.dic'),
});
for (const [word, model] of supplementEntries()) speller.add(word, model);
const counts: Counts[] = [parseCounts(readFileSync('public/dictionaries/word-pairs.txt', 'utf8'))];
const linter = new LocalLinter({ binary: slimBinary });
let why: Record<string, string> = {};
// SEASONINGS_ON=rule,rule switches on checks that start off, to measure them.
const switchedOn = new Set((process.env.SEASONINGS_ON ?? '').split(',').filter(Boolean));
const off = new Set(effectiveOff([]).filter((r) => !switchedOn.has(r)));
const isWord = (w: string) => speller.correct(w);
// CORE_OFF=1 scores Seasonings without Pete's grammar core, for a before-and-after.
if (!process.env.CORE_OFF) useDictionary(readFileSync('public/dictionaries/en-US.dic', 'utf8'), isWord);

export async function setUp(): Promise<void> {
  await setUpLinter(linter, 'en-US', []);
  why = await linter.getLintDescriptions();
}

export async function review(text: string): Promise<Issue[]> {
  const spelling = checkSpelling(text, speller, []);
  const harper = (await grammarIssues(linter, [text], [spelling], why))[0]!;
  const pete = peteIssues(text, isWord, counts);
  const parsed = parsedIssues(text, isWord, counts).filter((p) => !pete.some((i) => p.from < i.to && p.to > i.from));
  // Sam works out spelling suggestions only when the card opens; do the same here.
  for (const s of spelling) if (s.suggestions.length === 0) s.suggestions = rankSuggestions(text.slice(s.from, s.to), speller.suggest(text.slice(s.from, s.to)), 6);
  return combine(spelling, harper, [...pete, ...parsed], styleIssues(text), isSentenceRule).filter((i) => !off.has(ruleGroup(i)));
}

/** Underlines that mark a mistake, not Sally's style notes. */
export const marks = (issues: Issue[]) => issues.filter((i) => i.kind !== 'style');
export { isWord };
