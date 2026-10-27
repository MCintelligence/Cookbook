import { type Issue } from './check';
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
  pete: ['grammar', 'unclosed-quote', 'stray-capitals'],
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
    return `Grammar! ${issue.message}`;
  }
  if (issue.rule === 'passive') return 'Passive voice, how bland. Who’s doing the doing here?';
  if (issue.rule === 'crutch-word') return `Crutch word! Does the sentence really need “${word}”?`;
  if (issue.rule === 'adverb') return `Adverb alert! Could a stronger verb bring the heat instead of “${word}”?`;
  if (issue.rule === 'cliche') return `A cliché? “${word}” lost its kick years ago.`;
  if (issue.rule === 'echo') return `“${word}” again, so soon? Same spice twice. Swap one.`;
  return `${SALLY[issue.rule] ?? SALLY['harper-style']!} ${issue.message}`;
}

/**
 * How hard the page is to read, as heat. The grade is the Automated
 * Readability Index. Most published fiction lands between grades 5 and 9,
 * peaking around 7, so Medium covers that peak; each step hotter is a
 * further stretch out along the curve. The old sweet levels fall as: warm
 * honey (6 and under) is Mild to Medium, smooth (7 to 9) is Medium to Hot,
 * chewy (10 and up) is Hot to Inferno.
 */
export const SPICE: { level: string; upTo: number }[] = [
  { level: 'Mild', upTo: 4 },
  { level: 'Medium', upTo: 7 },
  { level: 'Hot', upTo: 9 },
  { level: 'Extra hot', upTo: 12 },
  { level: 'Inferno', upTo: Infinity },
];

export function spiceOf(grade: number): number {
  return SPICE.findIndex((s) => grade <= s.upTo);
}

/** Daniel on how much of a page or book is spoken. */
export function talkRemark(share: number): string {
  if (share === 0) return 'Not a word out loud. Shhh… hic.';
  if (share < 20) return 'Shhh. Everyone’s thinking, nobody’s talking.';
  if (share < 45) return 'A nice mix of talk and walk. Cheers!';
  if (share < 70) return 'Chatty one! Mostly talk… hic. Lovely.';
  return 'All talk! Now that’s a party.';
}

/** How a fix reads beside its button. */
export function fixText(problem: string, fix: string): string {
  if (fix === '') return problem.trim() ? `cut “${problem.trim()}”` : 'remove the space';
  if (fix.trim() === '') return fix.length === 1 ? 'one space' : 'spaces';
  return fix;
}
