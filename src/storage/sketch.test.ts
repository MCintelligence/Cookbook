import { describe, expect, it } from 'vitest';
import { type CookbookDocument, parseDocument, serializeDocument } from './document';
import { SKETCH, SKETCH_FIELD_HINTS, sketchOf, sketchText, withSketch, withSketchValue } from './sketch';
import { fieldPlaceholder } from './brainstorm';
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
    expect(fieldPlaceholder('setting', 'offers')).toBe('What draws people here');
  });

  it('is found by search', () => {
    const doc = withSketchValue(card({ sketch: {} }), 'quirks', 'Counts the flashes');
    expect(sketchText(doc.fields)).toEqual(['Counts the flashes']);
    expect(toIndexed('pantry/characters/June.md', doc, '1').text).toContain('Counts the flashes');
  });
});
