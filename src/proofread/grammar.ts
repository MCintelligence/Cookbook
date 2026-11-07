import { type Lint, type LintKind, type LocalLinter, SuggestionKind } from 'harper.js';
import { type Dialect, type Issue, type IssueKind } from './check';

/**
 * Grammar from Harper, which runs on the device as WebAssembly. Spelling is
 * left to Hunspell (see check.ts), so Harper's own spelling rules are off.
 */
// Unclosed quotes are Pete's own check (style.ts), which can offer the closing quote.
// OrthographicConsistency turns names such as Sam into acronyms (SAM).
// Sentence length is left to Sally's spice meter.
// RedundantThat and ThatWhich flag "that that", which is good English ("he knew that that was the end").
// The rest misfire on good fiction, found by running whole novels through Pete:
// CompoundNouns ("the poor boy" → "poorboy", "draw back"), AvoidCurses (the name Dick),
// PossessiveYour ("you fellows"), TheyToThem ("for they were coming"), Overall ("thought over all"),
// MassNouns ("a glimmering"), MissingPreposition ("I am afraid"), OneOfTheSingular,
// PronounKnew ("anything new"), FindOut and GoodAt (both good English), DiscourseMarkers ("Thus it was"),
// TheirToTheyre ("their earlier walk").
export const OFF_RULES = [
  'SpellCheck',
  'Misspell',
  'UnclosedQuotes',
  'OrthographicConsistency',
  'LongSentences',
  'RedundantThat',
  'ThatWhich',
  'CompoundNouns',
  'AvoidCurses',
  'PossessiveYour',
  'TheyToThem',
  'Overall',
  'MassNouns',
  'MissingPreposition',
  'OneOfTheSingular',
  'PronounKnew',
  'FindOut',
  'GoodAt',
  'DiscourseMarkers',
  // "Their two friends", "their earlier walk": Pete's own your/their check covers the real mistakes.
  'TheirToTheyre',
];

/**
 * Past tenses Harper's verb agreement reads as a present tense that needs an s: "she hid" → "hides".
 * Fiction is told in the past, so these come up on every page.
 */
const PAST_TENSES = new Set(
  'arose awoke bore beat became began bent bet bid bit bled blew broke bred brought built burnt burned burst bought cast caught chose clung came cost crept cut dealt dug dove drew dreamt drank drove dwelt ate fell fed felt fought found fled flung flew forbade forgot forgave froze got gave went ground grew hung had heard hid hit held hurt kept knelt knit knew laid led leant leapt learnt left lent let lay lit lost made meant met mistook paid put quit read rode rang rose ran said saw sought sold sent set sewed shook shed shone shot showed shrank shut sang sank sat slew slept slid slung slit smelt spoke sped spelt spent spilt spun spat split spread sprang stood stole stuck stung stank strode struck strung strove swore swept swam swung took taught tore told thought threw thrust trod understood upset woke wore wove wed wept won wound withdrew wrung wrote'.split(' '),
);
/** A past tense: "-ed", one of the irregular ones, or one with a prefix ("foresaw", "overcame"). */
function isPast(word: string): boolean {
  if (/[^e]ed$/.test(word) && word.length > 4) return true;
  if (PAST_TENSES.has(word)) return true;
  const prefix = /^(?:fore|over|under|with|mis|re|out|up|be)/.exec(word);
  return !!prefix && PAST_TENSES.has(word.slice(prefix[0].length));
}

const lastWord = (text: string) => /(\p{L}+)\s*$/u.exec(text)?.[1]?.toLowerCase() ?? '';

/** Prepositions: "whom" is right after them ("one of whom", "to whom"), and so is "its being" ("of its being offered"). */
const PREPOSITIONS = new Set('of to with for from by about at on in among between under upon without against'.split(' '));
const AUX_THEN_SUBJECT = /^\s*(?:did|do|does|will|would|shall|should|can|could|may|might|must|have|has|had)\s+(?:i|you|he|she|it|we|they|the|a|an|my|your|his|her|our|their)\b/i;

/** Words that are often doubled on purpose: "had had enough", "what it is is". */
const FINE_TWICE = new Set(['had', 'that', 'is']);
/** Mistakes Harper files as style, which are Pete's: "more happier". */
const GRAMMAR_NOT_STYLE = new Set(['AdjectiveDoubleDegree']);

/** Harper's kinds of lint that read as style advice rather than mistakes. */
const STYLE_KINDS = new Set<LintKind>(['Style', 'Readability', 'Enhancement', 'Redundancy']);
/** Already covered by the spelling check. */
const SKIP_KINDS = new Set<LintKind>(['Spelling', 'Typo']);

export const HARPER_DIALECT: Record<Dialect, number> = { 'en-US': 0, 'en-GB': 1, 'en-AU': 2, 'en-CA': 3 };

/** Harper writes code in backticks; on a writer's card it reads better in quotes. */
export const quoteTicks = (s: string) => s.replace(/`([^`]*)`/g, '“$1”');

/** Whether Harper's note is one of its known misreadings of good prose. */
function misreads(rule: string, text: string, from: number, to: number): boolean {
  const word = text.slice(from, to).toLowerCase();
  const before = text.slice(0, from);
  const after = text.slice(to);
  if (rule === 'PronounVerbAgreement') return isPast(word) || /^\s+of\b/i.test(after);
  // "too frank to be understood": only "to" for "too" is a slip worth a note.
  if (rule === 'ToTwoToo') return word === 'too';
  // "She let out a breath": only a sentence that starts with "let" can mean "let’s".
  if (rule === 'LetsConfusion') return /\p{L}[\s,]*$/u.test(before);
  // "The idea of its being offered", "on its being proposed"; "its raining" is still a slip.
  // "It’s no use", "it’s not fair": Harper takes these for "its".
  if (rule === 'ItsPossessive' && /^\s+(?:no|not|never)\b/i.test(after)) return true;
  if (rule === 'ItsContraction') return /^\s+being\b/i.test(after) && PREPOSITIONS.has(lastWord(before));
  if (rule === 'WhomSubjectOfVerb') return PREPOSITIONS.has(lastWord(before)) || AUX_THEN_SUBJECT.test(after);
  return false;
}

/** Each suggestion as the text that replaces the whole problem. */
function replacement(lint: Lint, problem: string): string[] {
  return lint.suggestions().map((s) => {
    const kind = s.kind();
    if (kind === SuggestionKind.Remove) return '';
    if (kind === SuggestionKind.InsertAfter) return problem + s.get_replacement_text();
    return s.get_replacement_text();
  });
}

export function lintsToIssues(text: string, organized: Record<string, Lint[]>, why: Record<string, string>): Issue[] {
  const issues: Issue[] = [];
  for (const [rule, lints] of Object.entries(organized)) {
    if (OFF_RULES.includes(rule)) continue;
    for (const lint of lints) {
      const kind = lint.lint_kind() as LintKind;
      if (SKIP_KINDS.has(kind)) continue;
      // harper.js gives positions in JavaScript's own UTF-16 units.
      const { start: from, end: to } = lint.span();
      if (to <= from || to > text.length) continue;
      const problem = text.slice(from, to);
      if (misreads(rule, text, from, to)) continue;
      if (rule === 'RepeatedWords' && FINE_TWICE.has(problem.split(/\s+/)[0]!.toLowerCase())) continue;
      const issueKind: IssueKind = STYLE_KINDS.has(kind) && !GRAMMAR_NOT_STYLE.has(rule) ? 'style' : 'grammar';
      issues.push({
        from,
        to,
        kind: issueKind,
        rule,
        message: quoteTicks(lint.message()),
        suggestions: [...new Set(replacement(lint, problem).map((r) => (text.includes('’') ? curl(r) : r)))].filter((s) => s !== problem).slice(0, 4),
        ...(why[rule] && { why: quoteTicks(why[rule]) }),
      });
    }
  }
  return issues.sort((a, b) => a.from - b.from);
}

/**
 * Harper only knows the straight apostrophe, so "it’s tail" and "she don’t" slip past it
 * when typed with curly quotes on. It reads a copy with straight ones after letters (an
 * opening ‘ or a leading ’ as in ’tis stays as it is): one character for
 * one, so every position still holds, and its fixes are given back with curly ones.
 */
export const straighten = (text: string) => text.replace(/(?<=\p{L})’/gu, "'");
const curl = (s: string) => s.replace(/(?<=\p{L})'(?=\p{L})/gu, '’');

/** Grammar issues in each text, leaving out any that overlap a spelling issue. */
export async function grammarIssues(linter: LocalLinter, texts: string[], spelling: Issue[][], why: Record<string, string>): Promise<Issue[][]> {
  const out: Issue[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    const organized = await linter.organizedLints(straighten(text), { language: 'plaintext' });
    const taken = spelling[i] ?? [];
    out.push(lintsToIssues(text, organized, why).filter((g) => !taken.some((s) => g.from < s.to && g.to > s.from)));
  }
  return out;
}

/** A linter set up for Cookbook: our dialect, our words, Harper's spelling off. */
export async function setUpLinter(linter: LocalLinter, dialect: Dialect, words: string[]): Promise<void> {
  await linter.setup();
  await linter.setDialect(HARPER_DIALECT[dialect]);
  const config = await linter.getLintConfig();
  for (const rule of OFF_RULES) if (rule in config) config[rule] = false;
  await linter.setLintConfig(config);
  await linter.clearWords();
  if (words.length > 0) await linter.importWords(words);
}
