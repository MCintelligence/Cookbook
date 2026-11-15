import { describe, expect, it } from 'vitest';
import { finishAt, historyRows, historyStats, periodOf, recentPace, streakOf, wordsADay } from './goals';
import { type WritingHistory } from './history';

const history = (days: Record<string, number>): WritingHistory => new Map(Object.entries(days).map(([d, w]) => [d, { written: w, deleted: 0 }]));
// Thursday, October 22, 2026.
const now = new Date(2026, 9, 22, 15);
const goal = { dailyGoal: 1000, weekendsOff: false };

describe('goals', () => {
  it('counts the streak in days with the goal met, and today only once it is', () => {
    const h = history({ '2026-10-19': 1200, '2026-10-20': 1000, '2026-10-21': 1500, '2026-10-22': 300 });
    expect(streakOf(h, goal, now)).toBe(3);
    h.set('2026-10-22', { written: 1000, deleted: 0 });
    expect(streakOf(h, goal, now)).toBe(4);
  });

  it('lets a weekend off keep the streak going', () => {
    // Friday the 16th, a weekend with nothing, then Monday to Wednesday.
    const h = history({ '2026-10-16': 1000, '2026-10-19': 1000, '2026-10-20': 1000, '2026-10-21': 1000 });
    expect(streakOf(h, goal, now)).toBe(3);
    expect(streakOf(h, { ...goal, weekendsOff: true }, now)).toBe(4);
    expect(historyStats(h, { ...goal, weekendsOff: true }, now).longest).toBe(4);
  });

  it('adds up the week from Monday, the month and all time', () => {
    const h = history({ '2026-09-30': 500, '2026-10-18': 700, '2026-10-19': 1200, '2026-10-22': 800 });
    const s = historyStats(h, goal, now);
    expect(s).toMatchObject({ week: 2000, month: 2700, all: 3200, best: { day: '2026-10-19', words: 1200 }, metDays: 1, writtenDays: 4, longest: 1 });
  });

  it('lists every day since the first, newest first, under month headings', () => {
    const rows = historyRows(history({ '2026-09-29': 1100, '2026-10-02': 400 }), 'days', goal, now);
    expect(rows[0]).toMatchObject({ heading: true, label: 'OCTOBER 2026', words: 400 });
    expect(rows[1]).toMatchObject({ label: 'Today', words: 0, today: true });
    expect(rows.filter((r) => !r.heading)).toHaveLength(24);
    expect(rows.at(-1)).toMatchObject({ label: 'Tue Sep 29', words: 1100, met: true });
    expect(rows.find((r) => r.heading && r.label === 'SEPTEMBER 2026')?.words).toBe(1100);
  });

  it('groups by week and by month', () => {
    const h = history({ '2026-10-12': 1000, '2026-10-13': 1000, '2026-10-14': 1000, '2026-10-15': 1000, '2026-10-16': 1000, '2026-10-20': 50 });
    const weeks = historyRows(h, 'weeks', goal, now);
    expect(weeks.map((w) => [w.label, w.words, w.met])).toEqual([
      ['Oct 19–25', 50, false],
      ['Oct 12–18', 5000, true],
    ]);
    expect(weeks[1]!.sub).toBe('5 of 7 days met goal');
    const months = historyRows(h, 'months', goal, now);
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ label: 'October 2026', words: 5050, sub: '6 days · 842 a day' });
  });

  it('works out the words a day still needed, counting today', () => {
    expect(wordsADay(41_200, 90_000, '2026-10-31', now)).toBe(4880);
    expect(wordsADay(90_000, 90_000, '2026-10-31', now)).toBeNull();
    expect(wordsADay(1, 90_000, undefined, now)).toBeNull();
    expect(wordsADay(1, 90_000, '2026-10-01', now)).toBeNull();
  });
});

describe('a week, month or year at a time', () => {
  // Thursday, October 22, 2026.
  const h = history({ '2026-10-12': 900, '2026-10-13': 1200, '2026-10-14': 400, '2026-10-19': 1000, '2026-10-20': 300, '2026-10-22': 500, '2026-09-03': 2000 });

  it('shows this week day by day, against the same days of last week', () => {
    const p = periodOf(h, 'week', 0, goal, now);
    expect(p.label).toBe('This week');
    expect(p.bars.map((b) => b.label).join('')).toBe('MTWTFSS');
    expect(p.bars.map((b) => b.words)).toEqual([1000, 300, 0, 500, 0, 0, 0]);
    expect(p.bars[0]!.met).toBe(true);
    expect(p.bars[3]!.today).toBe(true);
    expect(p.bars[4]!.future).toBe(true);
    expect(p.total).toBe(1800);
    // Monday to Thursday of the week before, not the whole of it.
    expect(p.before).toBe(2500);
    expect(p.perDay).toBe(450);
    expect(p.wrote).toBe(3);
  });

  it('pages back a week, a month or a year', () => {
    const w = periodOf(h, 'week', -1, goal, now);
    expect(w.label).toBe('Last week');
    expect(w.total).toBe(2500);
    expect(periodOf(h, 'week', -2, goal, now).label).toBe('5–11 Oct');
    const m = periodOf(h, 'month', -1, goal, now);
    expect(m.label).toBe('September');
    expect(m.bars).toHaveLength(30);
    expect(m.total).toBe(2000);
    expect(m.start).toBe('2026-09-01');
    expect(periodOf(h, 'month', -10, goal, now).label).toBe('December 2025');
  });

  it('shows a year month by month', () => {
    const y = periodOf(h, 'year', 0, goal, now);
    expect(y.label).toBe('2026');
    expect(y.bars).toHaveLength(12);
    expect(y.bars[8]!.words).toBe(2000);
    expect(y.bars[9]!.words).toBe(4300);
    expect(y.bars[9]!.today).toBe(true);
    expect(y.bars[10]!.future).toBe(true);
    expect(y.total).toBe(6300);
    expect(y.before).toBe(0);
  });

  it('works out a pace and the day it reaches a target', () => {
    expect(recentPace(h, now, 14)).toBe(Math.round(4300 / 14));
    expect(finishAt(1000, 2000, 100, now)).toEqual(new Date(2026, 10, 1));
    expect(finishAt(2000, 2000, 100, now)).toBeNull();
    expect(finishAt(1000, 2000, 0, now)).toBeNull();
  });
});
