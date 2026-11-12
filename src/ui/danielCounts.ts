import { type HistoryRange } from '../storage/goals';

/**
 * Drunk Daniel keeps the count on a phone's Goals pages: a word on today against the daily goal, and
 * one on the week, month or year against the one before. Several lines for each case, chosen by the
 * day, so the same day reads the same and the next day says something new. He never scolds: a day
 * without writing is a day, not a failure.
 */

const TODAY = {
  none: [
    'Not a word yet. Pour yourshelf shomething and shtart. *hic*',
    'Blank page. I’ve sheen worse. Mostly in mirrorsh.',
    'Zero sho far. Thash a very round number. I like round numbersh.',
    'Nothing yet? Shame here. Letsh both shtart after thish one.',
  ],
  started: [
    '{n} wordsh. I counted twishe. Shame anshwer, shurprishingly.',
    'Off to a shtart! Keep going, I’m counting. Shlowly.',
    '{n} down. The resht are jusht… waiting. Like me at the bar.',
    'Good shtart. Don’t shtop now, I jusht got comfy.',
  ],
  half: [
    'More than halfway! Or I’m sheeing double. Could be both.',
    'Pasht the middle. Downhill from here. Wheee.',
    '{left} to go. I can shee the finish. There’sh two of it.',
    'Halfway and then shome. Thish callsh for a shmall one.',
  ],
  met: [
    'Goal met! Thish callsh for a drink. Everything doesh, but shtill.',
    'Done for the day. Anything more ish gravy. I love gravy.',
    'You did it! I’d shtand up and clap if I could shtand up.',
    'Goal’sh in the bag. The bag’sh in me. Don’t ashk.',
  ],
  double: [
    'Twishe the goal?! Shlow down, I can’t count thish fasht.',
    '{n} wordsh! Are you writing or showing off? Both. Good.',
    'Thash a lot. I lost count at “a lot”. Well done, I think.',
  ],
};

const PERIOD = {
  up: [
    'More than {before}. I’m proud. *shniff* Shomething in my eye.',
    'Up on {before}! Shomeone’sh on a roll. Not me, I’m on the floor.',
    '{diff} more than {before}. I checked. Twishe. Thrishe.',
  ],
  down: [
    'Fewer than {before}. Happensh. Tomorrow’sh a fresh bottle.',
    'A bit down on {before}. Even I have quiet nightsh. Shometimesh.',
    'Not ash many ash {before}. Wordsh don’t go anywhere. They wait. Like me.',
  ],
  level: [
    'Shame ash {before}, near enough. Shteady handsh. Unlike mine.',
    'Level with {before}. Conshishtent! Thash my favourite long word.',
  ],
  first: [
    'Nothing to compare with yet. Thish ish the shtart of shomething.',
    'Firsht one on the bookshelf. I’ll remember it. Probably.',
  ],
  empty: [
    'Nothing here. Even I took a day off once. Didn’t like it.',
    'Quiet one. The page ishn’t going anywhere. Neither am I.',
  ],
};

function pick(lines: readonly string[], seed: string): string {
  const n = [...seed].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7);
  return lines[n % lines.length]!;
}

const fmt = (n: number) => n.toLocaleString('en');

/** What Daniel says about today. */
export function danielToday(words: number, goal: number, day: string): string {
  const g = Math.max(1, goal);
  const lines = words === 0 ? TODAY.none : words >= g * 2 ? TODAY.double : words >= g ? TODAY.met : words >= g / 2 ? TODAY.half : TODAY.started;
  return pick(lines, day + 't').replace('{n}', fmt(words)).replace('{left}', fmt(Math.max(0, g - words)));
}

const BEFORE: Record<HistoryRange, [current: string, other: string]> = {
  week: ['this point lasht week', 'the week before'],
  month: ['this point lasht month', 'the month before'],
  year: ['thish time lasht year', 'the year before'],
};

/** What Daniel says about a week, month or year against the one before it. */
export function danielPeriod(total: number, before: number, range: HistoryRange, current: boolean, day: string): string {
  const seed = day + range + total;
  if (total === 0) return pick(PERIOD.empty, seed);
  if (before === 0) return pick(PERIOD.first, seed);
  const when = BEFORE[range][current ? 0 : 1];
  const change = (total - before) / before;
  const lines = Math.abs(change) < 0.05 ? PERIOD.level : change > 0 ? PERIOD.up : PERIOD.down;
  return pick(lines, seed).replace('{before}', when).replace('{diff}', fmt(Math.abs(total - before)));
}
