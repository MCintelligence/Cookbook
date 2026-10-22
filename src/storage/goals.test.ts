import { describe, expect, it } from 'vitest';
import { historyRows, historyStats, streakOf, wordsADay } from './goals';
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
