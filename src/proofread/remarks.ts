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
  { id: 'pete', name: 'Peppery Pete', role: 'Grammar, style' },
  { id: 'daniel', name: 'Drunk Daniel', role: 'Dialogue' },
  { id: 'sally', name: 'Sweet Sally', role: 'Readability' },
];

export const isSeasoning = (id: unknown): id is SeasoningId => SEASONINGS.some((s) => s.id === id);

const READABILITY = ['hard-sentence', 'very-hard-sentence'];

/** The proofreader's rule groups (see rules.ts) each character looks after. Daniel needs none. */
export const RULES_OF: Record<SeasoningId, string[]> = {
  sam: ['spelling', 'name'],
  pete: ['grammar', 'harper-style', 'unclosed-quote', ...STYLE_RULES.map((r) => r.id).filter((id) => !READABILITY.includes(id))],
  daniel: [],
  sally: READABILITY,
};

/** Rule groups to switch off because nobody picked the character who checks them. */
export function rulesOff(chosen: readonly SeasoningId[]): string[] {
  return SEASONINGS.filter((s) => !chosen.includes(s.id)).flatMap((s) => RULES_OF[s.id]);
}

/** Whose an issue is. */
export function ownerOf(issue: Pick<Issue, 'kind' | 'rule'>): SeasoningId {
  if (issue.kind === 'spelling') return 'sam';
  if (READABILITY.includes(issue.rule)) return 'sally';
  return 'pete';
}

/** One of a few lines, the same one each time for the same words, so remarks don't shuffle as the page changes. */
function pick(lines: string[], seed: string): string {
  const n = [...seed].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7);
  return lines[n % lines.length]!;
}

/** Pete names the kind of trouble first, then says what it is. */
const PETE: Record<string, string> = {
  grammar: 'Grammar!',
  'harper-style': 'Wordy, wordy.',
  'unclosed-quote': 'Punctuation!',
  adverb: 'Adverb alert!',
  'simpler-word': 'Fancy talk!',
  passive: 'Passive voice!',
  'sticky-sentence': 'Sticky!',
  'crutch-word': 'Crutch word!',
  echo: 'Repeat alert!',
  cliche: 'A cliché, in MY pot?',
  redundancy: 'Wordy, wordy, wordy.',
};

/** What the issue's character says about it. */
export function remark(issue: Issue, word: string): string {
  const owner = ownerOf(issue);
  if (owner === 'sam') {
    if (issue.rule === 'name') return `That’s not how ${issue.suggestions[0] ?? 'they'} spell it, and they’d know.`;
    if (/apostrophe|doesn’t/.test(issue.message)) return 'No apostrophe? Bold. Wrong, but bold.';
    return pick([`“${word}”? Not in any dictionary I’ve sailed past.`, `Salt in the wound: “${word}” is spelt wrong.`, `“${word}”. Bold spelling. Wrong, but bold.`], word);
  }
  if (owner === 'sally') {
    return issue.rule === 'very-hard-sentence' ? 'Oh honey, I lost my place twice. Could this be two sentences?' : 'This one’s a long stir, sugar. Split it for me?';
  }
  if (issue.rule === 'unclosed-quote') return 'Punctuation! You opened a quote and walked off. Close it.';
  if (issue.rule === 'passive') return 'Passive voice! Who’s doing the doing here?';
  if (issue.rule === 'crutch-word') return `Crutch word! Does the sentence really need “${word}”?`;
  if (issue.rule === 'adverb') return `Adverb alert! Could a stronger verb do the work of “${word}”?`;
  if (issue.rule === 'cliche') return `A cliché, in MY pot? “${word}” was simmered to mush years ago.`;
  if (issue.rule === 'echo') return `Repeat alert! “${word}” again, so soon? Swap one, I beg you.`;
  const lead = PETE[issue.rule] ?? (issue.kind === 'grammar' ? PETE.grammar! : PETE['harper-style']!);
  return `${lead} ${issue.message}`;
}

/** Sally on the whole page, from its grade level. */
export function gradeRemark(grade: number): string {
  if (grade <= 6) return `Reads like warm honey, sweetheart! Grade ${grade}.`;
  if (grade <= 9) return `Nice and smooth, dear. Grade ${grade}.`;
  return `A little chewy, love. Grade ${grade}. Shorter sentences will sweeten it.`;
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
