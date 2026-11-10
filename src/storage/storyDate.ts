/**
 * Story dates: when an Item happens in the story, or a day that matters to a Pantry Item.
 * They are written in the file as plain text, "1954-09-03", or "1954-09-14/1954-09-16" for
 * a stretch of days, so they read well in any text editor.
 *
 * The year can be any from 1 to 99999 (a story may be set long ago or far ahead), so the
 * sums here are done by hand on the Gregorian calendar rather than with the browser's Date,
 * which gets the first hundred years wrong and knows nothing of the far future.
 */

export interface StoryDate {
  /** The day, or the first day of a stretch: YYYY-MM-DD. */
  on: string;
  /** The last day of a stretch, when there is one. */
  to?: string;
  /** What happens then; Pantry Items say, Shelf Items are the event themselves. */
  what?: string;
}

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DAY = /^(\d{1,5})-(\d{2})-(\d{2})$/;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Reads "1954-09-03". Null when it isn't a real day. */
export function parseDay(text: unknown): Ymd | null {
  const found = typeof text === 'string' ? DAY.exec(text.trim()) : null;
  if (!found) return null;
  const [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function formatDay({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days since 1 January 1970, which may be negative. */
export function dayNumber({ y, m, d }: Ymd): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): Ymd {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 0 for Monday to 6 for Sunday. */
export function weekday(day: Ymd): number {
  return (((dayNumber(day) + 3) % 7) + 7) % 7;
}

export function addDays(day: Ymd, n: number): Ymd {
  return fromDayNumber(dayNumber(day) + n);
}

/** Reads a date as the file has it: one day, or "first/last". A stretch written backwards is turned round. */
export function parseWhen(text: unknown): StoryDate | null {
  if (typeof text !== 'string') return null;
  const [a, b] = text.split('/');
  const first = parseDay(a);
  if (!first) return null;
  const last = b === undefined ? null : parseDay(b);
  if (!last || dayNumber(last) === dayNumber(first)) return { on: formatDay(first) };
  return dayNumber(last) < dayNumber(first) ? { on: formatDay(last), to: formatDay(first) } : { on: formatDay(first), to: formatDay(last) };
}

export function formatWhen(date: Pick<StoryDate, 'on' | 'to'>): string {
  return date.to && date.to !== date.on ? `${date.on}/${date.to}` : date.on;
}

/** First and last day of a date, as day numbers. */
export function span(date: Pick<StoryDate, 'on' | 'to'>): [number, number] {
  const first = dayNumber(parseDay(date.on)!);
  const last = date.to ? dayNumber(parseDay(date.to)!) : first;
  return [first, Math.max(first, last)];
}

/** The same date moved by some days, keeping its length. */
export function shifted<T extends Pick<StoryDate, 'on' | 'to'>>(date: T, days: number): T {
  const [first, last] = span(date);
  const on = formatDay(fromDayNumber(first + days));
  return last > first ? { ...date, on, to: formatDay(fromDayNumber(last + days)) } : { ...date, on, to: undefined };
}

/** The same date starting on another day, keeping its length. */
export function movedTo<T extends Pick<StoryDate, 'on' | 'to'>>(date: T, on: Ymd): T {
  return shifted(date, dayNumber(on) - span(date)[0]);
}

/** "3 September 1954", or "14 to 16 September 1954" for a stretch. */
export function sayWhen(date: Pick<StoryDate, 'on' | 'to'>): string {
  const a = parseDay(date.on);
  if (!a) return '';
  const one = (x: Ymd) => `${x.d} ${MONTHS[x.m - 1]} ${x.y}`;
  const b = date.to ? parseDay(date.to) : null;
  if (!b || date.to === date.on) return one(a);
  if (a.y === b.y && a.m === b.m) return `${a.d} to ${one(b)}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} to ${one(b)}`;
  return `${one(a)} to ${one(b)}`;
}
