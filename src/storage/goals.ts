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
