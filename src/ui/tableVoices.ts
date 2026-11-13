import { type English } from '../proofread/english';
import { type SeasoningId } from '../proofread/remarks';
import { type Theme } from '../settings';
import { type WriterKind } from '../writers';

/**
 * What the Seasonings say while they set the table with a new writer on a phone. Each question has
 * a host who asks it in their own voice and answers back when the writer picks: Peppery Pete asks
 * what they write, Spicy Sally whose name goes on the cover and how it should look, Salty Sam which
 * English, and Drunk Daniel how many words a day.
 */

export const PETE_ASKS = 'Let me guess. Another novel? Go on, surprise me.';
export const PETE_ON: Record<WriterKind, string> = {
  novel: 'A novel. How original. I’ll be reading every last one of its eighty thousand words.',
  short: 'Short stories. Fewer words for me to fix. I approve, grudgingly.',
  screen: 'Scripts. People talking at each other. Daniel will be thrilled. I’m thrilled-adjacent.',
  nonfiction: 'Facts! Finally, someone who respects a full sentence. Don’t prove me wrong.',
  student: 'Essays. I’ve marked worse. Not many, but some.',
  journal: 'A journal. I’ll pretend I’m not reading it. I will be reading it.',
  poetry: 'Poems. Fine, break the rules. On purpose, I trust.',
  mixed: 'A bit of everything. Commitment issues. Noted.',
};

export const SALLY_ASKS_NAME = 'Every book needs a name on the cover, darling. Yours would look lovely there.';
export const sallyOnName = (first: string) => `“By ${first}.” Mm. That has a ring to it.`;

export const SAM_ASKS = 'Every port spells it different, sailor. Which one’s yours?';
export const SAM_ON: Record<English, string> = {
  'en-US': 'Color, no U. Saves ink, I s’pose.',
  'en-GB': 'Colour, with the U, as the sea intended.',
  'en-CA': 'Colour but realize. Canadians, hedging their bets as ever.',
  'en-AU': 'Colour and realise. Good, salt-stained spelling.',
  'en-NZ': 'Kiwi it is. I’ll mind your colours, mate.',
  'en-IE': 'Irish. I’ll spell it right and say nothing about the weather.',
  'en-IN': 'Indian English. Colour, centre, and no nonsense.',
  'en-ZA': 'South African. Colour, centre, and the Cape of Good Spelling.',
};

export const SALLY_ASKS_LOOK = 'First impressions matter, darling. Pick something that suits you.';
export const SALLY_ON: Record<Theme, string> = {
  system: 'Follow the phone’s lead. Easy-going. I like that.',
  light: 'Bright and clean. Bold of you.',
  dark: 'Dark. Mysterious. I like where this is going.',
  sepia: 'Sepia. Old paper and candlelight. How romantic.',
};

export const DANIEL_ASKS = 'Wordsh a day. I’ll count ’em for you. *hic* Might count shome twice.';
export const danielOn = (goal: number) =>
  goal <= 0
    ? 'Shero? Thash… brave. Very relaxing.'
    : goal <= 300
      ? 'Shmall and steady. Like shipping. Sipping. Shipping.'
      : goal <= 1000
        ? 'Thash a lovely number. I like numbersh. They’re round.'
        : goal <= 2000
          ? 'Ooh, ambishious. Pace yourshelf. I never do.'
          : 'Thash… thash a lot of wordsh. I need to shit down. Sit. Shit.';

/** What each Seasoning says about the job when the writer asks them to the table. */
export const JOINS: Record<SeasoningId, string> = {
  sam: 'Spelling’s my watch. Nothing misspelt gets past me, not on my ship.',
  pete: 'I’ll fix your grammar. You’re welcome, in advance.',
  daniel: 'I tell you how mush of the page ish talk. *hic* Lotsh, ushually.',
  sally: 'Adverbs, clichés, sentences that drag. I’ll tell you. Sweetly.',
};

/** What each one catches in the sample line on the Seasonings screen. */
export const CATCHES: Record<SeasoningId, (english: English) => string> = {
  sam: (e) => `harbur → ${e === 'en-US' ? 'harbor' : 'harbour'}`,
  pete: () => 'Their going → They’re going',
  sally: () => '“very quietly” → try “whispered”',
  daniel: () => 'Most of this line is talk. Lovely.',
};

/** How long a first draft runs, for the line under the daily goal. */
export const DRAFTS: Partial<Record<WriterKind, [words: number, what: string]>> = {
  novel: [80000, 'a novel’s first draft'],
  short: [5000, 'a short story'],
  screen: [20000, 'a feature script'],
  nonfiction: [60000, 'a book’s first draft'],
  student: [10000, 'a 10,000-word dissertation'],
};

/** The line under the daily goal: what that pace makes, and by when. */
export function payoff(goal: number, writer: WriterKind | '', today = new Date()): string {
  if (goal <= 0) return 'No goal is a goal too. Any recipe can still set its own.';
  const draft = writer ? DRAFTS[writer] : undefined;
  if (!draft) return `That’s ${(goal * 365).toLocaleString('en')} words by this time next year.`;
  const [words, what] = draft;
  const days = Math.ceil(words / goal);
  if (days <= 1) return `That’s ${what} in a single day. Ambitious.`;
  if (days <= 14) return `That’s ${what} in ${days} days.`;
  const by = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const date = by.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(by.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
  return `That’s ${what} by ${date}.`;
}
