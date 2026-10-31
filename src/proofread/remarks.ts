import { type Issue } from './check';
import { PETE_RULES } from './pete';
import { STYLE_RULES } from './style';

/**
 * The seasonings: four characters who each read the page for one thing and
 * say what they found in their own voice. Which checks run follows which
 * characters the writer picked.
 */
export type SeasoningId = 'sam' | 'pete' | 'daniel' | 'sally';

export const SEASONINGS: { id: SeasoningId; name: string; role: string }[] = [
  { id: 'sam', name: 'Salty Sam', role: 'Spelling' },
  { id: 'pete', name: 'Peppery Pete', role: 'Grammar' },
  { id: 'daniel', name: 'Drunk Daniel', role: 'Dialogue' },
  { id: 'sally', name: 'Spicy Sally', role: 'Style' },
];

export const isSeasoning = (id: unknown): id is SeasoningId => SEASONINGS.some((s) => s.id === id);

/** The proofreader's rule groups (see rules.ts) each character looks after. Daniel needs none. */
export const RULES_OF: Record<SeasoningId, string[]> = {
  sam: ['spelling', 'name'],
  pete: ['grammar', 'unclosed-quote', 'stray-capitals', ...PETE_RULES.map((r) => r.id)],
  daniel: [],
  sally: ['harper-style', ...STYLE_RULES.map((r) => r.id)],
};

/** Rule groups to switch off because nobody picked the character who checks them. */
export function rulesOff(chosen: readonly SeasoningId[]): string[] {
  return SEASONINGS.filter((s) => !chosen.includes(s.id)).flatMap((s) => RULES_OF[s.id]);
}

/** Whose an issue is. */
export function ownerOf(issue: Pick<Issue, 'kind' | 'rule'>): SeasoningId {
  if (issue.kind === 'spelling') return 'sam';
  if (issue.kind === 'grammar') return 'pete';
  return 'sally';
}

/** One of a few lines, the same one each time for the same words, so remarks don't shuffle as the page changes. */
function pick(lines: string[], seed: string): string {
  const n = [...seed].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7);
  return lines[n % lines.length]!;
}

/** Sally names the heat first, then says what's burning. */
const SALLY: Record<string, string> = {
  'harper-style': 'Too much filler in the pot.',
  'simpler-word': 'Fancy talk, cool it down!',
  'sticky-sentence': 'Gloopy!',
  redundancy: 'Double helping, hon.',
};

/** Pete names the trouble first, then says what to do; for the Harper rules writers meet most, in his own words. */
const PETE: Record<string, (word: string, fix: string | undefined, message: string) => string | undefined> = {
  agreement: (_w, _f, m) => `Agreement! ${m}`,
  'word-mixup': (_w, _f, m) => `Mix-up! ${m}`,
  'pronoun-case': (_w, _f, m) => `Wrong case! ${m}`,
  'verb-form': (_w, _f, m) => `Verb form! ${m}`,
  'reported-question': (_w, _f, m) => `Word order! ${m}`,
  PronounVerbAgreement: (_w, f) => f && `Agreement! That verb doesn’t match its subject. Make it “${f}”.`,
  PronounInflectionBe: (_w, f) => f && `Agreement! That verb doesn’t match its subject. Make it “${f}”.`,
  AnA: () => 'Grammar! It’s “an” before a vowel sound and “a” before the rest.',
  ItsContraction: () => 'Mix-up! “Its” owns things. Here you mean “it’s”, short for “it is”.',
  ItsPossessive: () => 'Mix-up! “It’s” is short for “it is”. For belonging, it’s “its”.',
  TheirToThere: (_w, f) => f && `Mix-up! You mean “${f}”.`,
  ThenThan: (_w, f) => f && `Mix-up! You mean “${f}”.`,
  ModalOf: (_w, f) => f && `Grammar! It’s “${f}”. “Of” only sounds like “’ve”.`,
  RepeatedWords: (w) => `Twice! “${w}” says the same word two times.`,
  SimplePastToPastParticiple: (_w, f) => f && `Verb form! After “has” or “had” it’s “${f}”.`,
  SentenceCapitalization: () => 'Capitals! A sentence starts with a capital letter.',
  CapitalizePersonalPronouns: () => 'Capitals! “I” is always a capital.',
  AdjectiveDoubleDegree: (_w, f) => f && `Double helping! “${f}” already means more.`,
};

/** What the issue's character says about it. */
export function remark(issue: Issue, word: string): string {
  const owner = ownerOf(issue);
  if (owner === 'sam') {
    if (issue.rule === 'name') return `That’s not how ${issue.suggestions[0] ?? 'they'} spell it, and they’d know.`;
    if (/apostrophe|doesn’t/.test(issue.message)) return 'No apostrophe? Bold. Wrong, but bold.';
    return pick([`“${word}”? Not in any dictionary I’ve sailed past.`, `Salt in the wound: “${word}” is spelt wrong.`, `“${word}”. Bold spelling. Wrong, but bold.`], word);
  }
  if (owner === 'pete') {
    if (issue.rule === 'unclosed-quote') return 'Punctuation! You opened a quote and walked off. Close it.';
    if (issue.rule === 'stray-capitals') return `Capitals! “${word}” has its big letters in the wrong place.`;
    const own = PETE[issue.rule]?.(word, issue.suggestions[0], issue.message);
    return own ?? `Grammar! ${issue.message}`;
  }
  if (issue.rule === 'passive') return 'Passive voice, how bland. Who’s doing the doing here?';
  if (issue.rule === 'crutch-word') return `Crutch word! Does the sentence really need “${word}”?`;
  if (issue.rule === 'adverb') return `Adverb alert! Could a stronger verb bring the heat instead of “${word}”?`;
  if (issue.rule === 'cliche') return `A cliché? “${word}” lost its kick years ago.`;
  if (issue.rule === 'echo') return `“${word}” again, so soon? Same spice twice. Swap one.`;
  return `${SALLY[issue.rule] ?? SALLY['harper-style']!} ${issue.message}`;
}

/** One step on a seasoning's meter, up to a reading, and what the seasoning says there. */
export interface Taste {
  level: string;
  upTo: number;
  says: string;
}

/**
 * How hard the page is to read, as heat. The grade is the Automated
 * Readability Index. Most published fiction lands between grades 5 and 9,
 * peaking around 7, so Medium covers that peak; each step hotter is a
 * further stretch out along the curve. The old sweet levels fall as: warm
 * honey (6 and under) is Mild to Medium, smooth (7 to 9) is Medium to Hot,
 * chewy (10 and up) is Hot to Inferno.
 */
export const SPICE: Taste[] = [
  { level: 'Mild', upTo: 4, says: 'Easy going down. Not a drop of sweat.' },
  { level: 'Medium', upTo: 7, says: 'Just the right kick, hon.' },
  { level: 'Hot', upTo: 9, says: 'A few long sentences are burning.' },
  { level: 'Extra hot', upTo: 12, says: 'Break a few sentences up before they boil over.' },
  { level: 'Inferno', upTo: Infinity, says: 'My tongue’s on fire! Shorter sentences, quick.' },
];

export function spiceOf(grade: number): number {
  return tasteOf(SPICE, grade);
}

/** Where a reading falls on a meter, as an index into its steps. */
export function tasteOf(steps: readonly Taste[], value: number): number {
  const at = steps.findIndex((s) => value <= s.upTo);
  return at === -1 ? steps.length - 1 : at;
}

/**
 * Each seasoning's meter: the names of its Check and Report, the words at
 * either end, its five steps, and what it says before there is enough page to
 * read. Sam and Pete read slips per 1,000 words, so a long Item and a short
 * one are judged alike (a slip every 100 words is 10 per 1,000); Daniel reads the share of words spoken; Sally reads
 * the grade level.
 */
export interface Meter {
  /** The meter's own word for what it measures, for screen readers. */
  measure: string;
  check: string;
  report: string;
  ends: [string, string];
  steps: Taste[];
  waiting: string;
}

export const METERS: Record<SeasoningId, Meter> = {
  sam: {
    measure: 'Saltiness',
    check: 'Salt Check',
    report: 'Salt Report',
    ends: ['Unsalted', 'Seawater'],
    steps: [
      { level: 'Unsalted', upTo: 0, says: 'Not a grain out of place.' },
      { level: 'A pinch', upTo: 10, says: 'A slip or two. Brush them off.' },
      { level: 'Salty', upTo: 25, says: 'A few words need a second look.' },
      { level: 'Briny', upTo: 50, says: 'The spelling’s getting choppy out here.' },
      { level: 'Seawater', upTo: Infinity, says: 'Man overboard! Too many words spelt wrong.' },
    ],
    waiting: 'Write a few lines and I’ll taste them for salt.',
  },
  pete: {
    measure: 'Pepperiness',
    check: 'Pepper Check',
    report: 'Pepper Report',
    ends: ['Plain', 'Smoking'],
    steps: [
      { level: 'Plain', upTo: 0, says: 'Clean grammar. Nothing to grind.' },
      { level: 'Peppered', upTo: 10, says: 'A slip here and there. Easy fixes.' },
      { level: 'Peppery', upTo: 25, says: 'A few sentences need tidying.' },
      { level: 'Fiery', upTo: 50, says: 'The grammar’s starting to sting.' },
      { level: 'Smoking', upTo: Infinity, says: 'Too many slips! Fix a few before the alarm goes off.' },
    ],
    waiting: 'Nothing to grind yet. Write a sentence or two.',
  },
  daniel: {
    measure: 'Drunkenness',
    check: 'Drunk Check',
    report: 'Drunk Report',
    ends: ['Sober', 'Drunk'],
    steps: [
      { level: 'Sober', upTo: 10, says: 'Barely a word out loud. Shhh… hic.' },
      { level: 'Sipping', upTo: 30, says: 'Mostly walk, a little talk.' },
      { level: 'Tipsy', upTo: 50, says: 'A nice mix of talk and walk. Cheers!' },
      { level: 'Merry', upTo: 70, says: 'Chatty one! Mostly talk… hic. Lovely.' },
      { level: 'Drunk', upTo: Infinity, says: 'All talk! Now that’s a party.' },
    ],
    waiting: 'Nobody’s said a thing yet. Pour me a line.',
  },
  sally: {
    measure: 'Spice',
    check: 'Spice Check',
    report: 'Spice Report',
    ends: ['Mild', 'Inferno'],
    steps: SPICE,
    waiting: 'A paragraph or two and I’ll tell you how hot it runs.',
  },
};

/** What a seasoning says about its meter: the level first, then the line. */
export function meterRemark(id: SeasoningId, at: number): string {
  const step = METERS[id].steps[at]!;
  return `${step.level}! ${step.says}`;
}

/** Slips per 1,000 words, so a long Item and a short one are judged alike. */
export function perThousand(slips: number, words: number): number {
  return words > 0 ? Math.round((slips * 1000) / words) : 0;
}

/** The issue kind each seasoning underlines on the page. Daniel underlines nothing; his Check dims narration. */
export const KIND_OF: Partial<Record<SeasoningId, 'spelling' | 'grammar' | 'style'>> = { sam: 'spelling', pete: 'grammar', sally: 'style' };

/** How a fix reads beside its button. */
export function fixText(problem: string, fix: string): string {
  if (fix === '') return problem.trim() ? `cut “${problem.trim()}”` : 'remove the space';
  if (fix.trim() === '') return fix.length === 1 ? 'one space' : 'spaces';
  return fix;
}
