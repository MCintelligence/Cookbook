import { type WritingHistory, dayKey, netWords } from './history';

/**
 * What the goals pop-up shows: today against the daily goal, the streak, the
 * book against its target, and the whole writing history by day, week or month.
 * Everything comes from writing-history.csv, so it is the same on every device.
 */

export interface GoalOptions {
  dailyGoal: number;
  /** Saturdays and Sundays without the goal met are skipped rather than ending a streak. */
  weekendsOff: boolean;
}

const addDays = (date: Date, days: number) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
};
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const fromKey = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
/** Monday of the week a day is in. */
export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/**
 * Days in a row with the daily goal met, up to today. Today counts once the
 * goal is met, and doesn't break the streak before then.
 */
export function streakOf(history: WritingHistory, { dailyGoal, weekendsOff }: GoalOptions, now = new Date()): number {
  const met = (d: Date) => netWords(history.get(dayKey(d))) >= dailyGoal;
  let streak = 0;
  let cursor = met(now) ? now : addDays(now, -1);
  for (let guard = 0; guard < 20_000; guard++) {
    if (met(cursor)) streak++;
    else if (!(weekendsOff && isWeekend(cursor))) break;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface HistoryStats {
  week: number;
  month: number;
  all: number;
  best: { day: string; words: number } | null;
  /** The longest run of days with the goal met. */
  longest: number;
  metDays: number;
  writtenDays: number;
}

export function historyStats(history: WritingHistory, options: GoalOptions, now = new Date()): HistoryStats {
  const monday = dayKey(mondayOf(now));
  const month = dayKey(now).slice(0, 7);
  const today = dayKey(now);
  let week = 0;
  let monthWords = 0;
  let all = 0;
  let best: HistoryStats['best'] = null;
  let metDays = 0;
  let writtenDays = 0;
  for (const [day, totals] of history) {
    if (day > today) continue;
    const words = netWords(totals);
    all += words;
    if (day >= monday) week += words;
    if (day.startsWith(month)) monthWords += words;
    if (words > 0) writtenDays++;
    if (words >= options.dailyGoal) metDays++;
    if (words > 0 && (!best || words > best.words)) best = { day, words };
  }
  // The longest streak, walking every day from the first one written.
  let longest = 0;
  const first = [...history.keys()].sort()[0];
  if (first) {
    let run = 0;
    for (let d = fromKey(first); dayKey(d) <= today; d = addDays(d, 1)) {
      const words = netWords(history.get(dayKey(d)));
      if (words >= options.dailyGoal) run++;
      else if (!(options.weekendsOff && isWeekend(d))) run = 0;
      longest = Math.max(longest, run);
    }
  }
  return { week, month: monthWords, all, best, longest, metDays, writtenDays };
}

export type HistoryView = 'days' | 'weeks' | 'months';

export interface HistoryRow {
  /** A month heading in the day view. */
  heading?: boolean;
  key: string;
  label: string;
  sub: string;
  words: number;
  /** 0 to 1, for the little bar. */
  fill: number;
  met: boolean;
  today: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (m: number) => MONTHS[m]!.slice(0, 3);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (n: number) => n.toLocaleString('en');

/** Every day, week or month from the first day written to today, newest first. */
export function historyRows(history: WritingHistory, view: HistoryView, options: GoalOptions, now = new Date()): HistoryRow[] {
  const today = dayKey(now);
  const days = [...history.keys()].filter((d) => d <= today).sort();
  if (days.length === 0) return [];
  const all: { day: string; date: Date; words: number }[] = [];
  for (let d = fromKey(days[0]!); dayKey(d) <= today; d = addDays(d, 1)) all.push({ day: dayKey(d), date: d, words: netWords(history.get(dayKey(d))) });
  all.reverse();
  const goal = Math.max(1, options.dailyGoal);
  const out: HistoryRow[] = [];

  if (view === 'days') {
    const monthTotals = new Map<string, number>();
    for (const d of all) monthTotals.set(d.day.slice(0, 7), (monthTotals.get(d.day.slice(0, 7)) ?? 0) + d.words);
    let month = '';
    for (const d of all) {
      if (d.day.slice(0, 7) !== month) {
        month = d.day.slice(0, 7);
        out.push({ heading: true, key: month, label: `${MONTHS[d.date.getMonth()]!.toUpperCase()} ${d.date.getFullYear()}`, sub: '', words: monthTotals.get(month)!, fill: 0, met: false, today: false });
      }
      const isToday = d.day === today;
      out.push({
        key: d.day,
        label: isToday ? 'Today' : `${WEEKDAYS[d.date.getDay()]} ${short(d.date.getMonth())} ${d.date.getDate()}`,
        sub: '',
        words: d.words,
        fill: Math.min(1, d.words / (goal * 1.4)),
        met: d.words >= goal,
        today: isToday,
      });
    }
    return out;
  }

  const groups = new Map<string, typeof all>();
  for (const d of all) {
    const key = view === 'weeks' ? dayKey(mondayOf(d.date)) : d.day.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  for (const [key, group] of groups) {
    const total = group.reduce((a, d) => a + d.words, 0);
    if (view === 'weeks') {
      const start = fromKey(key);
      const end = addDays(start, 6);
      const met = group.filter((d) => d.words >= goal).length;
      // A week counts as met with the goal reached on five of its days (or all of them, if fewer have passed).
      const needed = Math.min(5, group.length);
      out.push({
        key,
        label: `${short(start.getMonth())} ${start.getDate()}–${end.getMonth() !== start.getMonth() ? short(end.getMonth()) + ' ' : ''}${end.getDate()}`,
        sub: `${met} of ${group.length} ${group.length === 1 ? 'day' : 'days'} met goal`,
        words: total,
        fill: Math.min(1, total / (goal * 7)),
        met: met >= needed && met > 0,
        today: key === dayKey(mondayOf(now)),
      });
    } else {
      const wrote = group.filter((d) => d.words > 0).length;
      const [y, m] = key.split('-').map(Number);
      out.push({
        key,
        label: `${MONTHS[m! - 1]} ${y}`,
        sub: `${wrote} ${wrote === 1 ? 'day' : 'days'} · ${fmt(Math.round(total / Math.max(1, wrote)))} a day`,
        words: total,
        fill: Math.min(1, total / (goal * 30)),
        met: false,
        today: key === today.slice(0, 7),
      });
    }
  }
  return out;
}

/** Words a day still needed to reach the target by the deadline, counting today; null with no deadline or once it's reached. */
export function wordsADay(current: number, target: number, deadline: string | undefined, now = new Date()): number | null {
  if (!deadline || current >= target) return null;
  const days = Math.round((fromKey(deadline).getTime() - fromKey(dayKey(now)).getTime()) / 86_400_000) + 1;
  if (days <= 0) return null;
  return Math.ceil((target - current) / days);
}

/** The history as CSV for a spreadsheet: one line per day, oldest first. */
export function historyCsv(history: WritingHistory): string {
  const days = [...history.keys()].sort();
  return ['date,written,deleted,net', ...days.map((d) => `${d},${history.get(d)!.written},${history.get(d)!.deleted},${netWords(history.get(d))}`)].join('\n') + '\n';
}

export type HistoryRange = 'week' | 'month' | 'year';

export interface PeriodBar {
  key: string;
  /** A short label under the bar: a weekday letter, a day of the month, a month letter. */
  label: string;
  /** A full name for a reader and the tapped bar: "Tue 10 Nov", "March 2026". */
  name: string;
  words: number;
  met: boolean;
  today: boolean;
  /** Not yet come. */
  future: boolean;
}

export interface Period {
  /** "This week", "3–9 Nov", "November", "March 2025", "2026". */
  label: string;
  /** One per day (a week or a month) or per month (a year). */
  bars: PeriodBar[];
  total: number;
  /** The period before, counted to the same point, so a week three days in meets three days of the last. */
  before: number;
  /** Words a day over the days so far. */
  perDay: number;
  /** Days with some writing. */
  wrote: number;
  /** Whether the period holds today. */
  current: boolean;
  /** Monday of the week, or the 1st of the month, for laying out a calendar. */
  start: string;
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A week, month or year of the history, `offset` periods back from the one holding today (0 is now,
 * -1 the one before). Reads only the days in the period and the one before it, so paging back
 * through years of history costs the same as this week.
 */
export function periodOf(history: WritingHistory, range: HistoryRange, offset: number, { dailyGoal }: GoalOptions, now = new Date()): Period {
  const today = dayKey(now);
  const goal = Math.max(1, dailyGoal);
  const words = (d: Date) => netWords(history.get(dayKey(d)));
  const sum = (from: Date, days: number) => {
    let total = 0;
    for (let i = 0; i < days; i++) total += words(addDays(from, i));
    return total;
  };
  /** Days of the period that have come, today included. */
  const elapsed = (from: Date, days: number) => Math.max(0, Math.min(days, Math.round((fromKey(today).getTime() - from.getTime()) / 86_400_000) + 1));

  if (range === 'year') {
    const year = now.getFullYear() + offset;
    const bars: PeriodBar[] = [];
    let total = 0;
    let wrote = 0;
    let before = 0;
    let gone = 0;
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const days = new Date(year, m + 1, 0).getDate();
      const past = elapsed(first, days);
      let n = 0;
      for (let i = 0; i < days; i++) {
        const w = words(addDays(first, i));
        n += w;
        if (w > 0) wrote++;
      }
      // Last year, to the same day of the year.
      before += sum(new Date(year - 1, m, 1), Math.min(past, new Date(year - 1, m + 1, 0).getDate()));
      gone += past;
      total += n;
      const key = dayKey(first).slice(0, 7);
      bars.push({ key, label: LONG_MONTHS[m]![0]!, name: `${LONG_MONTHS[m]} ${year}`, words: n, met: false, today: key === today.slice(0, 7), future: past === 0 });
    }
    return { label: String(year), bars, total, before, perDay: Math.round(total / Math.max(1, gone)), wrote, current: offset === 0, start: `${year}-01-01` };
  }

  const start = range === 'week' ? addDays(mondayOf(now), offset * 7) : new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = range === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const past = elapsed(start, days);
  const prior = range === 'week' ? addDays(start, -7) : new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const priorDays = range === 'week' ? 7 : new Date(prior.getFullYear(), prior.getMonth() + 1, 0).getDate();
  const bars: PeriodBar[] = [];
  let total = 0;
  let wrote = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const key = dayKey(d);
    const w = words(d);
    total += w;
    if (w > 0) wrote++;
    bars.push({
      key,
      label: range === 'week' ? 'MTWTFSS'[i]! : String(d.getDate()),
      name: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${short(d.getMonth())}`,
      words: w,
      met: w >= goal,
      today: key === today,
      future: key > today,
    });
  }
  const end = addDays(start, days - 1);
  const thisYear = start.getFullYear() === now.getFullYear();
  const label =
    range === 'week'
      ? offset === 0
        ? 'This week'
        : offset === -1
          ? 'Last week'
          : `${start.getDate()}${start.getMonth() !== end.getMonth() ? ' ' + short(start.getMonth()) : ''}–${end.getDate()} ${short(end.getMonth())}${end.getFullYear() !== now.getFullYear() ? ' ' + end.getFullYear() : ''}`
      : `${LONG_MONTHS[start.getMonth()]}${thisYear ? '' : ' ' + start.getFullYear()}`;
  return {
    label,
    bars,
    total,
    before: sum(prior, Math.min(past, priorDays)),
    perDay: Math.round(total / Math.max(1, past)),
    wrote,
    current: offset === 0,
    start: dayKey(start),
  };
}

/** Words a day over the last `days` days, today included, counting the days nothing was written. */
export function recentPace(history: WritingHistory, now = new Date(), days = 14): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += netWords(history.get(dayKey(addDays(now, -i))));
  return Math.round(total / days);
}

/** The day a target is reached at a steady pace, or null when there is no pace or it is already reached. */
export function finishAt(current: number, target: number, pace: number, now = new Date()): Date | null {
  if (current >= target || pace <= 0) return null;
  return addDays(now, Math.ceil((target - current) / pace));
}
