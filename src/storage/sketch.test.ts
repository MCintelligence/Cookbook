import { describe, expect, it } from 'vitest';
import { type CookbookDocument, parseDocument, serializeDocument } from './document';
import { BRAINSTORMERS, SKETCH, SKETCH_FIELD_HINTS, fieldPlaceholder, hasBrainstormer, sketchOf, sketchText, withBrainstormer, withSketch, withSketchValue, withoutBrainstormer } from './sketch';
import { toIndexed } from './index';

const card = (fields: Record<string, unknown> = {}): CookbookDocument => ({ id: 'a', title: 'June', kind: 'character', fields, body: '' });

describe('the Pantry Sketch', () => {
  it('asks every kind the same questions, with a hint of its own for each', () => {
    const keys = SKETCH.flatMap((s) => s.slots.map((slot) => slot.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const section of SKETCH) {
      for (const kind of ['character', 'setting', 'research'] as const) {
        expect(section.question[kind]).toBeTruthy();
        for (const slot of section.slots) expect(slot.hint[kind]).toBeTruthy();
      }
    }
  });

  it('says they for a character and it for the rest', () => {
    const nature = SKETCH.find((s) => s.id === 'nature')!;
    expect(nature.question.character).toBe('How do they behave?');
    expect(nature.question.setting).toBe('How does it behave?');
    expect(nature.question.research).toBe('How does it behave?');
    for (const s of SKETCH) expect(s.question.character).not.toMatch(/\bit\b/);
  });

  it('keeps what is typed, and drops a box when it is emptied', () => {
    let doc = withSketchValue(card({ sketch: {} }), 'want', 'To keep the light');
    expect(sketchOf(doc.fields)).toEqual({ want: 'To keep the light' });
    doc = withSketchValue(doc, 'want', '');
    expect(sketchOf(doc.fields)).toEqual({});
  });

  it('round-trips through the file', () => {
    const doc = withSketchValue(withSketchValue(card({ 'role in story': 'Hero', sketch: {} }), 'line', 'A keeper’s daughter'), 'past', 'Raised at the light.\nNursed her father.');
    const back = parseDocument(serializeDocument(doc));
    expect(sketchOf(back.fields)).toEqual({ line: 'A keeper’s daughter', past: 'Raised at the light.\nNursed her father.' });
    expect(back.fields['role in story']).toBe('Hero');
  });

  it('gives an older card the Sketch without touching its own fields', () => {
    expect(sketchOf(card({ role: 'Hero' }).fields)).toBeNull();
    const doc = withSketch({ ...card({ role: 'Hero', Where: 'Gull Point' }), order: ['role', 'Where'] });
    expect(doc.fields).toEqual({ role: 'Hero', Where: 'Gull Point', 'role in story': '', when: '', work: '', sketch: {} });
    expect(withSketch(doc)).toBe(doc);
  });

  it('fits the short facts’ hints to the kind', () => {
    expect(fieldPlaceholder('character', 'When')).toBe(SKETCH_FIELD_HINTS.when!.character);
    expect(fieldPlaceholder('research', 'Role in story')).toBe(SKETCH_FIELD_HINTS['role in story']!.research);
    expect(fieldPlaceholder('setting', 'Favourite knife')).toBe('Field value');
  });

  it('offers brainstormers in the Sketch’s own form, for every kind', () => {
    expect(BRAINSTORMERS[0]!.title).toBe('World on Fire');
    expect(BRAINSTORMERS[0]!.slots.map((s) => s.label)).toEqual(['The Wildfire', 'The Inferno', 'The Cinders', 'The Phoenix']);
    const keys = [...SKETCH, ...BRAINSTORMERS].flatMap((s) => s.slots.map((slot) => slot.key));
    expect(new Set(['line', ...keys]).size).toBe(keys.length + 1);
    for (const b of BRAINSTORMERS) {
      expect(b.question.character).toMatch(/\b(they|them|their)\b/);
      expect(b.question.setting).toBe(b.question.research);
      for (const kind of ['character', 'setting', 'research'] as const) for (const slot of b.slots) expect(slot.hint[kind]).toBeTruthy();
    }
  });

  it('adds a brainstormer whole, keeps it while it is empty, and takes it off again', () => {
    const fire = BRAINSTORMERS[0]!;
    let doc = withBrainstormer(withSketchValue(card({ sketch: {} }), 'want', 'To keep the light'), fire);
    expect(sketchOf(doc.fields)).toEqual({ wildfire: '', inferno: '', cinders: '', phoenix: '', want: 'To keep the light' });
    doc = withSketchValue(withSketchValue(doc, 'cinders', 'The light goes out'), 'cinders', '');
    expect(hasBrainstormer(sketchOf(doc.fields)!, fire)).toBe(true);
    const back = parseDocument(serializeDocument(doc));
    expect(hasBrainstormer(sketchOf(back.fields)!, fire)).toBe(true);
    expect(hasBrainstormer(sketchOf(back.fields)!, BRAINSTORMERS[1]!)).toBe(false);
    expect(sketchOf(withoutBrainstormer(back, fire).fields)).toEqual({ want: 'To keep the light' });
  });

  it('is found by search', () => {
    const doc = withSketchValue(card({ sketch: {} }), 'quirks', 'Counts the flashes');
    expect(sketchText(doc.fields)).toEqual(['Counts the flashes']);
    expect(toIndexed('pantry/characters/June.md', doc, '1').text).toContain('Counts the flashes');
  });
});
