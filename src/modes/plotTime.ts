import { MONTHS, dayNumber, fromDayNumber } from '../storage/storyDate';

/**
 * The time Plots runs along. Unlike a calendar it need not give every day the same room: a
 * stretch of the story where nothing is dated can be folded down to a mark that says how long
 * it is, so a year of story with a flashback thirty years back still fits one screen.
 */
export interface Stretch {
  /** The first day, and the day after the last. */
  d0: number;
  d1: number;
  /** Where it starts on the sheet and how wide it is, in pixels. */
  x0: number;
  w: number;
  folded: boolean;
}

export interface TimeScale {
  stretches: Stretch[];
  width: number;
  /** Where a day (or a point within one) falls on the sheet. */
  xOf(day: number): number;
  /** The day at a point on the sheet, with the part of the day gone by; floor it for the day itself. */
  dayAt(x: number): number;
}

/** An empty stretch folds once it would be wider than this (and is a week or more), down to FOLD_W. Both in pixels. */
export const FOLD_AT = 360;
const FOLD_DAYS = 7;
export const FOLD_W = 60;
/** Room kept clear before the first day and after the last, and each side of a fold. */
export const EDGE = 96;
const KEEP = 36;

/**
 * Lays time out for what is dated. `spans` are first and last days (both counted); `px` is the
 * width of a day where time is not folded; `blank` is what to show when nothing is dated yet.
 */
export function timeScale(spans: [number, number][], px: number, fold: boolean, blank: [number, number]): TimeScale {
  const busy: [number, number][] = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = busy[busy.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b + 1);
    else busy.push([a, b + 1]);
  }
  const parts: { d0: number; d1: number; folded: boolean }[] = [];
  const add = (d0: number, d1: number, folded = false) => {
    if (d1 <= d0) return;
    const last = parts[parts.length - 1];
    if (last && !last.folded && !folded) last.d1 = d1;
    else parts.push({ d0, d1, folded });
  };
  if (busy.length === 0) add(blank[0], blank[1] + 1);
  else {
    const edge = Math.max(1, Math.ceil(EDGE / px));
    const keep = Math.max(1, Math.ceil(KEEP / px));
    add(busy[0]![0] - edge, busy[0]![0]);
    busy.forEach(([a, b], i) => {
      add(a, b);
      const next = busy[i + 1];
      if (!next) return add(b, b + edge);
      const gap = next[0] - b;
      if (fold && gap >= FOLD_DAYS && gap * px > FOLD_AT && gap - 2 * keep >= 1) {
        add(b, b + keep);
        add(b + keep, next[0] - keep, true);
        add(next[0] - keep, next[0]);
      } else add(b, next[0]);
    });
  }
  let x = 0;
  const stretches: Stretch[] = parts.map((p) => {
    const w = p.folded ? FOLD_W : (p.d1 - p.d0) * px;
    const s = { ...p, x0: x, w };
    x += w;
    return s;
  });
  const first = stretches[0]!;
  const last = stretches[stretches.length - 1]!;
  return {
    stretches,
    width: x,
    xOf(day) {
      if (day < first.d0) return (day - first.d0) * px;
      if (day >= last.d1) return x + (day - last.d1) * px;
      const s = stretches.find((t) => day < t.d1)!;
      return s.x0 + ((day - s.d0) / (s.d1 - s.d0)) * s.w;
    },
    dayAt(at) {
      if (at < 0) return first.d0 + at / px;
      if (at >= x) return last.d1 + (at - x) / px;
      const s = stretches.find((t) => at < t.x0 + t.w)!;
      return s.d0 + ((at - s.x0) / s.w) * (s.d1 - s.d0);
    },
  };
}

/** The day width at which everything dated fits in `room` pixels, folds and all. */
export function fitPx(spans: [number, number][], fold: boolean, room: number, min: number, max: number): number {
  let px = 18;
  for (let i = 0; i < 12; i++) {
    const { stretches, width } = timeScale(spans, px, fold, [0, 0]);
    const folds = stretches.filter((s) => s.folded).length;
    // The clear room at each end and beside each fold is so many pixels however close in, so it is taken off, not scaled.
    const fixed = folds * (FOLD_W + 2 * KEEP) + 2 * EDGE;
    const next = Math.max(min, Math.min(max, (px * Math.max(40, room - fixed)) / Math.max(1, width - fixed)));
    if (Math.abs(next - px) < px * 0.01) return next;
    px = next;
  }
  return px;
}

/** How long a stretch of days is, in the roundest words that are still true: "9 days", "5 weeks", "30 years". */
export function sayStretch(days: number): string {
  const say = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  if (days < 14) return say(days, 'day');
  if (days < 60) return say(Math.round(days / 7), 'week');
  if (days < 730) return say(Math.round(days / 30.44), 'month');
  return say(Math.round(days / 365.25), 'year');
}

export interface Mark {
  n: number;
  text: string;
  /** A shorter way to say it, for a mark with little room ("Sep 1954"). */
  short?: string;
}

/** About how wide a ruler name is drawn, in pixels. */
export const markWidth = (text: string) => text.length * 8 + 12;

/** The marks along the top: months or years, as closely as there is room to name them. */
export function rulerMarks(left: number, right: number, px: number): { majors: Mark[]; minors: Mark[] } {
  const majors: Mark[] = [];
  const minors: Mark[] = [];
  const from = fromDayNumber(Math.floor(left));
  if (px * 30 >= 64) {
    for (let y = from.y, m = from.m, i = 0; i < 400; i++) {
      const n = dayNumber({ y, m, d: 1 });
      if (n > right) break;
      majors.push({ n, text: `${MONTHS[m - 1]} ${y}`, short: `${MONTHS[m - 1]!.slice(0, 3)} ${y}` });
      if (++m > 12) [y, m] = [y + 1, 1];
    }
    const step = px >= 15 ? 1 : px >= 4 ? 7 : 0;
    if (step > 0) {
      // Weeks are marked on their Mondays.
      let n = Math.floor(left);
      if (step === 7) n -= (((n + 3) % 7) + 7) % 7;
      for (; n <= right; n += step) minors.push({ n, text: String(fromDayNumber(n).d) });
    }
  } else {
    const room = 72 / (px * 365.2425);
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => s >= room) ?? 10000;
    for (let y = Math.max(1, Math.floor(from.y / step) * step), i = 0; i < 400 && y <= 99999; y += step, i++) {
      const n = dayNumber({ y: Math.max(1, y), m: 1, d: 1 });
      if (n > right) break;
      majors.push({ n, text: String(Math.max(1, y)) });
    }
    if (px * 30 >= 16 && step === 1) {
      for (let y = from.y, m = from.m, i = 0; i < 600; i++) {
        const n = dayNumber({ y, m, d: 1 });
        if (n > right) break;
        if (m !== 1) minors.push({ n, text: MONTHS[m - 1]!.slice(0, px * 30 >= 34 ? 3 : 1) });
        if (++m > 12) [y, m] = [y + 1, 1];
      }
    }
  }
  return { majors, minors };
}

/**
 * The marks of one unfolded stretch between two points of the sheet, placed in pixels. A stretch
 * that begins partway through a month (or year) is still named at its start, unless the next
 * name would crowd it.
 */
export function stretchMarks(scale: TimeScale, s: Stretch, px: number, from: number, to: number): { majors: (Mark & { x: number; room: number })[]; minors: (Mark & { x: number })[] } {
  const left = Math.max(s.d0, Math.floor(scale.dayAt(Math.max(from, s.x0))));
  const right = Math.min(s.d1 - 1, Math.ceil(scale.dayAt(Math.min(to, s.x0 + s.w - 0.01))));
  if (right < left) return { majors: [], minors: [] };
  const { majors, minors } = rulerMarks(left, right, px);
  const placed = majors.map((m) => ({ ...m, n: Math.max(m.n, s.d0), x: scale.xOf(Math.max(m.n, s.d0)) })).filter((m) => m.x >= s.x0);
  // A stretch that begins partway through a month is named at its start. When the next name follows too
  // closely, that one names the stretch instead, unless it has too little room itself before the stretch ends
  // (a flashback a few days long, between two folds): then the start keeps its name, as the only place that
  // says which year this is.
  const end = s.x0 + s.w;
  const [a, b, c] = placed;
  const crowded = !!a && !!b && majors[0]!.n < s.d0 && b.x - a.x < a.text.length * 8 + 24;
  const fits = (m: Mark & { x: number }, next: number) => next - m.x >= markWidth(m.short ?? m.text);
  const named = !crowded ? placed : fits(b!, c?.x ?? end) ? placed.slice(1) : [a!, ...placed.slice(2)];
  return {
    majors: named.map((m, i) => ({ ...m, room: (named[i + 1]?.x ?? end) - m.x })),
    minors: minors.filter((m) => m.n >= s.d0 && m.n < s.d1).map((m) => ({ ...m, x: scale.xOf(m.n) })),
  };
}

/** How many times the telling goes back in time: Items in reading order whose day is before the one told just before. */
export function backSteps(firstDays: number[]): number {
  return firstDays.reduce((n, day, i) => n + (i > 0 && day < firstDays[i - 1]! ? 1 : 0), 0);
}

export interface Placed {
  row: number;
  /** How wide the name may be before it would run into the next thing on its row; null for all it needs. */
  room: number | null;
}

/** The least of a name that must show for a thing to share a row with what follows it, in pixels. */
const NAME_MIN = 76;
const NAME_GAP = 7;

/**
 * Puts the things of one lane on as few rows as will do. Each is a mark from `x0` to `x1` with a
 * name after it `name` pixels wide. A name gives way (it is cut short with an ellipsis) before a
 * new row is opened, so a lane only grows where days are truly crowded.
 */
export function placeLane(things: { x0: number; x1: number; name: number }[]): Placed[] {
  const order = things.map((_, i) => i).sort((p, q) => things[p]!.x0 - things[q]!.x0 || p - q);
  const ends: number[] = [];
  const lastOn: number[] = [];
  const placed: Placed[] = things.map(() => ({ row: 0, room: null }));
  for (const i of order) {
    const t = things[i]!;
    let row = ends.findIndex((end) => end <= t.x0);
    if (row === -1) row = ends.length;
    const before = lastOn[row];
    if (before !== undefined) placed[before]!.room = Math.max(0, t.x0 - things[before]!.x1 - NAME_GAP * 2);
    ends[row] = t.x1 + NAME_GAP + Math.min(t.name, NAME_MIN) + NAME_GAP;
    lastOn[row] = i;
    placed[i]!.row = row;
  }
  return placed;
}
