import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { type ZipEntry, zipEntries, zipProblem } from './zip';

const ENTRIES: ZipEntry[] = [
  { name: 'Supper/', data: new Uint8Array(0), level: 0 },
  { name: 'Supper/book.json', data: strToU8('{"title":"Supper"}'), level: 6 },
  { name: 'Supper/bookshelf/One.md', data: strToU8('Pie.'), level: 6 },
];

describe('checking a backup zip', () => {
  it('passes one that holds every file', () => {
    expect(zipProblem(zipEntries(ENTRIES), ENTRIES)).toBeNull();
  });

  it('finds one cut short, missing a file, changed, or holding more', () => {
    const zip = zipEntries(ENTRIES);
    expect(zipProblem(zip.slice(0, zip.length - 10), ENTRIES)).toMatch(/^it won’t open/);
    expect(zipProblem(new Uint8Array(0), ENTRIES)).toMatch(/^it won’t open/);
    expect(zipProblem(zipEntries(ENTRIES.slice(0, 2)), ENTRIES)).toBe('“Supper/bookshelf/One.md” is missing from it');
    const changed = ENTRIES.map((e) => (e.name.endsWith('One.md') ? { ...e, data: strToU8('Pip.') } : e));
    expect(zipProblem(zipEntries(changed), ENTRIES)).toBe('“Supper/bookshelf/One.md” in it doesn’t match the recipe');
    expect(zipProblem(zip, ENTRIES.slice(0, 2))).toBe('it holds 1 more file than the recipe');
  });
});
