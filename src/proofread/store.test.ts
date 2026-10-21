import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memory';
import { defaultDialect, parseDictionary, readDictionary, readIgnored, saveDictionary, saveIgnored } from './store';

describe('proofreader storage', () => {
  it('keeps the dictionary as plain lines, skipping comments', async () => {
    expect(parseDictionary('# mine\nEarlene\n\n  grits  \nEarlene\n')).toEqual(['Earlene', 'grits']);
    const fs = new MemoryAdapter();
    expect(await readDictionary(fs)).toEqual([]);
    await saveDictionary(fs, ['zydeco', 'Earlene']);
    expect(await fs.readText('dictionary.txt')).toMatch(/^# .*\nEarlene\nzydeco\n$/);
    expect(await readDictionary(fs)).toEqual(['Earlene', 'zydeco']);
  });

  it('remembers ignored words per scene and survives a damaged file', async () => {
    const fs = new MemoryAdapter();
    await saveIgnored(fs, { a: ['Teh'], b: [] });
    expect(await readIgnored(fs)).toEqual({ a: ['Teh'] });
    await fs.writeText('.cookbook/ignored.json', '{oops');
    expect(await readIgnored(fs)).toEqual({});
  });

  it('picks British spelling for Commonwealth English', () => {
    expect(defaultDialect(['en-GB', 'en'])).toBe('en-GB');
    expect(defaultDialect(['fr-FR', 'en-AU'])).toBe('en-GB');
    expect(defaultDialect(['en-US'])).toBe('en-US');
    expect(defaultDialect([])).toBe('en-US');
  });
});
