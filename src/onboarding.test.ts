import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import { ENGLISHES, dialectOf, systemEnglish } from './proofread/english';
import { HARPER_DIALECT } from './proofread/grammar';
import { WRITERS, recipeDefaults, rulesFor } from './writers';
import { BOOK_TEMPLATES } from './storage/templates';
import { SEASONINGS } from './proofread/remarks';
import { tableSetBefore } from './ui/tableSet';
import { existsSync } from 'node:fs';

describe('Your English', () => {
  it('reads the system language, region by region', () => {
    expect(systemEnglish(['en-CA', 'fr-CA'])).toBe('en-CA');
    expect(systemEnglish(['fr-FR', 'en-AU'])).toBe('en-AU');
    expect(systemEnglish(['en-UK'])).toBe('en-GB');
    expect(systemEnglish(['en'])).toBe('en-US');
    expect(systemEnglish(['en-PH'])).toBe('en-US');
    expect(systemEnglish(['de-DE'])).toBe('en-US');
  });

  it('gives every English a word list that ships, and a grammar dialect', () => {
    for (const e of ENGLISHES) {
      const d = dialectOf(e.id);
      expect(existsSync(`public/dictionaries/${d}.dic`) && existsSync(`public/dictionaries/${d}.aff`) && existsSync(`public/dictionaries/LICENSE-${d}.txt`)).toBe(true);
      expect(HARPER_DIALECT[d]).toBeTypeOf('number');
    }
    expect(dialectOf('en-NZ')).toBe('en-AU');
    expect(dialectOf('en-IE')).toBe('en-GB');
  });
});

describe('the answers in settings', () => {
  it('keeps what this version understands and drops the rest', () => {
    const s = parseSettings(JSON.stringify({ writerName: 'Lou', english: 'en-CA', writer: 'poetry', dailyGoal: 250, newSeasonings: ['sam', 'nobody', 'sally', 3] }));
    expect(s).toMatchObject({ writerName: 'Lou', english: 'en-CA', writer: 'poetry', dailyGoal: 250, newSeasonings: ['sam', 'sally'] });
    const bad = parseSettings(JSON.stringify({ english: 'en-XX', writer: 'chef', dailyGoal: -4, newSeasonings: 'sam' }));
    expect(bad).toMatchObject({ english: 'auto', writer: '', dailyGoal: DEFAULT_SETTINGS.dailyGoal, newSeasonings: [] });
  });

  it('starts with the daily goal recipes had before', () => {
    expect(DEFAULT_SETTINGS.dailyGoal).toBe(1000);
  });
});

describe('kinds of writer', () => {
  it('point at real templates and Seasonings', () => {
    const seasonings = SEASONINGS.map((s) => s.id as string);
    for (const w of WRITERS) {
      expect(BOOK_TEMPLATES.some((t) => t.id === w.template)).toBe(true);
      expect(w.seasonings.every((id) => seasonings.includes(id))).toBe(true);
      expect(w.dailyGoal).toBeGreaterThan(0);
    }
  });

  it('turn off only their own Markdown rules, keeping the writer’s other switches', () => {
    const rules = { ...DEFAULT_SETTINGS.markdownRules, checklist: false };
    const poet = rulesFor('poetry', rules);
    expect(poet).toMatchObject({ bullets: false, numbers: false, dropCap: false, checklist: false, bold: true });
    expect(rulesFor('novel', rules)).toEqual(rules);
  });

  it('give a new recipe the chosen Seasonings and the writer’s name for its title page', () => {
    expect(recipeDefaults({ newSeasonings: [], writerName: '' })).toEqual({});
    expect(recipeDefaults({ newSeasonings: ['sam', 'daniel'], writerName: ' June Bell ' })).toEqual({
      seasonings: { chosen: ['sam', 'daniel'], tracked: [], gone: [] },
      plate: { author: 'June Bell' },
    });
  });
});

describe('Set the Table', () => {
  it('is shown once per device', () => {
    expect(tableSetBefore({ getItem: () => null })).toBe(false);
    expect(tableSetBefore({ getItem: () => '2026-11-01' })).toBe(true);
  });
});
