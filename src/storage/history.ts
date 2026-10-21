import { type StorageAdapter } from './adapter';

/**
 * Writing history: words written and deleted per day, like Scrivener's. It is
 * kept in the book folder as `writing-history.csv`, so it travels with the
 * book and opens in any spreadsheet:
 *
 *   date,written,deleted
 *   2026-10-20,1710,230
 */
export const HISTORY_FILE = 'writing-history.csv';
const HEADER = 'date,written,deleted';

export interface DayTotals {
  written: number;
  deleted: number;
}

/** Day (YYYY-MM-DD, local time) to totals. */
export type WritingHistory = Map<string, DayTotals>;

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseHistory(csv: string): WritingHistory {
  const history: WritingHistory = new Map();
  for (const line of csv.split(/\r?\n/)) {
    const m = /^(\d{4}-\d{2}-\d{2}),(\d+),(\d+)\s*$/.exec(line);
    if (m) history.set(m[1]!, { written: Number(m[2]), deleted: Number(m[3]) });
  }
  return history;
}

export function serializeHistory(history: WritingHistory): string {
  const days = [...history.keys()].sort();
  return [HEADER, ...days.map((d) => `${d},${history.get(d)!.written},${history.get(d)!.deleted}`)].join('\n') + '\n';
}

export async function loadHistory(fs: StorageAdapter): Promise<WritingHistory> {
  if (!(await fs.exists(HISTORY_FILE))) return new Map();
  return parseHistory(await fs.readText(HISTORY_FILE).catch(() => ''));
}

export async function saveHistory(fs: StorageAdapter, history: WritingHistory): Promise<void> {
  await fs.writeText(HISTORY_FILE, serializeHistory(history));
}

/** Adds a change in a scene's word count to the day's totals. */
export function recordWords(history: WritingHistory, delta: number, now = new Date()): WritingHistory {
  if (delta === 0) return history;
  const key = dayKey(now);
  const day = history.get(key) ?? { written: 0, deleted: 0 };
  const next = new Map(history);
  next.set(key, delta > 0 ? { ...day, written: day.written + delta } : { ...day, deleted: day.deleted - delta });
  return next;
}

/** Words that stayed: written minus deleted, never below zero. */
export function netWords(day: DayTotals | undefined): number {
  return day ? Math.max(0, day.written - day.deleted) : 0;
}

export interface HistorySummary {
  today: number;
  /** Days in a row with some writing, counting today only once something is written. */
  streak: number;
  /** The last `days` days, oldest first, ending today. */
  recent: { day: string; words: number }[];
  /** The last four calendar months, oldest first. */
  months: { month: string; label: string; words: number }[];
  best: { day: string; words: number } | null;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function summarize(history: WritingHistory, now = new Date(), days = 14): HistorySummary {
  const today = netWords(history.get(dayKey(now)));

  let streak = 0;
  let cursor = today > 0 ? now : addDays(now, -1);
  while (netWords(history.get(dayKey(cursor))) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const recent = Array.from({ length: days }, (_, i) => {
    const day = dayKey(addDays(now, i - days + 1));
    return { day, words: netWords(history.get(day)) };
  });

  const months = Array.from({ length: 4 }, (_, i) => {
    const first = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1);
    const month = dayKey(first).slice(0, 7);
    let words = 0;
    for (const [day, totals] of history) if (day.startsWith(month)) words += netWords(totals);
    return { month, label: first.toLocaleString('en', { month: 'short' }), words };
  });

  let best: HistorySummary['best'] = null;
  for (const [day, totals] of history) {
    const words = netWords(totals);
    if (words > 0 && (!best || words > best.words)) best = { day, words };
  }
  return { today, streak, recent, months, best };
}
