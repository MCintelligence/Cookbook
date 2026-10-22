import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { readTree } from './book';
import { dayOf, folderDates, loadPinned, movePinned, savePinned, showDay, withPinned } from './journal';

const at = (s: string) => new Date(s).getTime();

describe('journal folder dates', () => {
  it('uses the last change inside a folder, nested folders included, unless a date is pinned', async () => {
    const fs = new MemoryAdapter();
    await fs.makeFolder('journal/Trip/Day trips');
    await fs.makeFolder('journal/Empty');
    fs.clock = () => at('2026-10-01T10:00:00');
    await fs.writeText('journal/Trip/Day one.md', 'x');
    fs.clock = () => at('2026-10-14T09:00:00');
    await fs.writeText('journal/Trip/Day trips/Sintra.md', 'x');
    fs.clock = () => at('2026-09-30T23:30:00');
    await fs.writeText('journal/Ideas.md', 'x');
    const tree = await readTree(fs, 'journal');
    let dates = await folderDates(fs, tree, {});
    expect(dates.get('journal/Trip')).toEqual({ date: '2026-10-14', pinned: false });
    expect(dates.get('journal/Trip/Day trips')).toEqual({ date: '2026-10-14', pinned: false });
    expect(dates.has('journal/Empty')).toBe(false);

    const pinned = withPinned({}, 'journal/Trip', '2026-08-02');
    dates = await folderDates(fs, tree, pinned);
    expect(dates.get('journal/Trip')).toEqual({ date: '2026-08-02', pinned: true });
    expect(withPinned(pinned, 'journal/Trip', null)).toEqual({});
  });

  it('keeps pinned dates through a move, and round-trips the file', async () => {
    const fs = new MemoryAdapter();
    expect(await loadPinned(fs)).toEqual({});
    const pinned = movePinned({ 'journal/A': '2026-01-02', 'journal/A/B': '2026-01-03', 'journal/AB': '2026-01-04' }, 'journal/A', 'journal/Z');
    expect(pinned).toEqual({ 'journal/Z': '2026-01-02', 'journal/Z/B': '2026-01-03', 'journal/AB': '2026-01-04' });
    await savePinned(fs, pinned);
    expect(await loadPinned(fs)).toEqual(pinned);
    await fs.writeText('journal.json', '{"journal/X": "not a date", "journal/Y": "2026-02-03"}');
    expect(await loadPinned(fs)).toEqual({ 'journal/Y': '2026-02-03' });
  });

  it('shows dates the short way, in local time', () => {
    expect(showDay('2026-10-14')).toBe('Oct 14, 2026');
    expect(dayOf(at('2026-03-05T00:10:00'))).toBe('2026-03-05');
  });
});
