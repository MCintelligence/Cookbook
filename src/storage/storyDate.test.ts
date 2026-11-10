import { describe, expect, it } from 'vitest';
import { arcOf, datesOf, eventsField, eventsOf, whenOf } from './document';
import { addDays, dayNumber, daysInMonth, formatDay, formatWhen, fromDayNumber, isLeap, movedTo, parseDay, parseWhen, sayWhen, shifted, span, weekday } from './storyDate';

describe('story dates', () => {
  it('reads real days and turns away the rest', () => {
    expect(parseDay('1954-09-03')).toEqual({ y: 1954, m: 9, d: 3 });
    expect(parseDay(' 12000-01-31 ')).toEqual({ y: 12000, m: 1, d: 31 });
    expect(parseDay('1954-02-29')).toBeNull();
    expect(parseDay('1952-02-29')).not.toBeNull();
    expect(parseDay('1954-13-01')).toBeNull();
    expect(parseDay('0000-01-01')).toBeNull();
    expect(parseDay('3 September')).toBeNull();
    expect(parseDay(19540903)).toBeNull();
  });

  it('knows leap years by the Gregorian rule', () => {
    expect([1900, 2000, 1952, 1954].map(isLeap)).toEqual([false, true, true, false]);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('counts days from 1970 and back again, in any year', () => {
    expect(dayNumber({ y: 1970, m: 1, d: 1 })).toBe(0);
    expect(dayNumber({ y: 2000, m: 3, d: 1 })).toBe(11017);
    expect(dayNumber({ y: 1969, m: 12, d: 31 })).toBe(-1);
    for (const text of ['0001-01-01', '0066-07-19', '1582-10-15', '1954-09-03', '2400-02-29', '99999-12-31']) {
      const day = parseDay(text)!;
      expect(formatDay(fromDayNumber(dayNumber(day)))).toBe(text);
    }
  });

  it('knows the day of the week, Monday first', () => {
    expect(weekday({ y: 1970, m: 1, d: 1 })).toBe(3); // a Thursday
    expect(weekday({ y: 1954, m: 9, d: 3 })).toBe(4); // a Friday
    expect(weekday({ y: 2026, m: 11, d: 9 })).toBe(0); // a Monday
  });

  it('adds days across months and years', () => {
    expect(formatDay(addDays({ y: 1954, m: 12, d: 30 }, 3))).toBe('1955-01-02');
    expect(formatDay(addDays({ y: 1952, m: 3, d: 1 }, -1))).toBe('1952-02-29');
  });

  it('reads one day or a stretch, turning a backwards stretch round', () => {
    expect(parseWhen('1954-09-03')).toEqual({ on: '1954-09-03' });
    expect(parseWhen('1954-09-14/1954-09-16')).toEqual({ on: '1954-09-14', to: '1954-09-16' });
    expect(parseWhen('1954-09-16/1954-09-14')).toEqual({ on: '1954-09-14', to: '1954-09-16' });
    expect(parseWhen('1954-09-14/1954-09-14')).toEqual({ on: '1954-09-14' });
    expect(parseWhen('soon')).toBeNull();
    expect(formatWhen({ on: '1954-09-14', to: '1954-09-16' })).toBe('1954-09-14/1954-09-16');
    expect(formatWhen({ on: '1954-09-14' })).toBe('1954-09-14');
  });

  it('moves a date and keeps its length', () => {
    const stretch = { on: '1954-09-29', to: '1954-10-01', what: 'The fair' };
    expect(span(stretch)[1] - span(stretch)[0]).toBe(2);
    expect(shifted(stretch, 3)).toEqual({ on: '1954-10-02', to: '1954-10-04', what: 'The fair' });
    expect(movedTo(stretch, { y: 1955, m: 1, d: 1 })).toEqual({ on: '1955-01-01', to: '1955-01-03', what: 'The fair' });
    expect(shifted({ on: '1954-09-03' }, -3).on).toBe('1954-08-31');
  });

  it('says a date as a writer would', () => {
    expect(sayWhen({ on: '1954-09-03' })).toBe('3 September 1954');
    expect(sayWhen({ on: '1954-09-14', to: '1954-09-16' })).toBe('14 to 16 September 1954');
    expect(sayWhen({ on: '1954-09-29', to: '1954-10-01' })).toBe('29 September to 1 October 1954');
    expect(sayWhen({ on: '1954-12-31', to: '1955-01-01' })).toBe('31 December 1954 to 1 January 1955');
  });
});

describe('dates and arcs in the front matter', () => {
  it('reads a Shelf Item’s day from `when`', () => {
    expect(whenOf({ when: '1954-09-03' })).toEqual({ on: '1954-09-03' });
    expect(whenOf({ when: 'never' })).toBeNull();
    expect(whenOf({})).toBeNull();
  });

  it('reads a Pantry Item’s events, skipping what isn’t one', () => {
    const fields = { events: [{ on: '1912-03-08', what: 'Born' }, { on: 'unknown', what: 'Lost' }, 'nonsense', { on: '1954-09-14/1954-09-16' }] };
    expect(eventsOf(fields)).toEqual([
      { on: '1912-03-08', what: 'Born' },
      { on: '1954-09-14', to: '1954-09-16', what: '' },
    ]);
    expect(eventsField(eventsOf(fields))).toEqual([
      { on: '1912-03-08', what: 'Born' },
      { on: '1954-09-14/1954-09-16', what: '' },
    ]);
    expect(eventsField([])).toBeUndefined();
  });

  it('gives a Shelf Item its own day and a Pantry Item its events', () => {
    expect(datesOf({ kind: 'scene', fields: { when: '1954-09-03', events: [{ on: '1912-03-08' }] } })).toEqual([{ on: '1954-09-03' }]);
    expect(datesOf({ kind: 'character', fields: { when: '1954-09-03', events: [{ on: '1912-03-08', what: 'Born' }] } })).toEqual([{ on: '1912-03-08', what: 'Born' }]);
  });

  it('reads arc beats and keeps them between rock bottom and flying', () => {
    expect(arcOf({ arc: { a: { level: 2, note: 'Wins' }, b: { level: -9 }, c: { level: 'high' }, d: 'no' } })).toEqual({ a: { level: 2, note: 'Wins' }, b: { level: -2, note: '' } });
    expect(arcOf({ arc: ['x'] })).toEqual({});
  });
});
