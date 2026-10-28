import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { createBook, readDocument, writeDocument } from './book';
import { akaOf, cardFieldKeys, cardFieldsOf, parseDocument, relationshipsOf, serializeDocument, withCardFields } from './document';
import { BookIndex, refreshIndex } from './index';
import { savePicture, sectionOf } from './pantry';
import { CARD_TEMPLATES, createFromTemplate } from './templates';

const character = CARD_TEMPLATES.find((t) => t.id === 'character')!;

describe('Pantry cards', () => {
  it('reads the writer’s fields and leaves Cookbook’s own keys alone', () => {
    const fields = { role: 'Cook', age: 62, notes: { n1: 'x' }, aka: ['Mama J'], portrait: 'pictures/June.jpg', wants: null };
    expect(cardFieldsOf(fields)).toEqual([
      ['role', 'Cook'],
      ['age', '62'],
      ['wants', ''],
    ]);
    const doc = { id: '1', title: 'June', kind: 'character' as const, fields, body: '' };
    expect(withCardFields(doc, [['role', 'Baker']]).fields).toEqual({ role: 'Baker', notes: { n1: 'x' }, aka: ['Mama J'], portrait: 'pictures/June.jpg' });
  });

  it('saves every field under a name of its own, never one Cookbook uses', () => {
    expect(cardFieldKeys(['Role', '', 'Age', '', ' Age ', 'status', 'Title', 'kind', 'Eye   Colour'])).toEqual([
      'Role',
      'Field',
      'Age',
      'Field 2',
      'Age 2',
      'status 2',
      'Title',
      'kind 2',
      'Eye Colour',
    ]);
    // A field called "title" keeps the card's name, and one called "status" its status.
    const doc = { id: '1', title: 'June', kind: 'character' as const, fields: { status: 'done' }, body: '' };
    const keys = cardFieldKeys(['title', 'status']);
    const back = parseDocument(serializeDocument(withCardFields(doc, [[keys[0]!, 'Chef'], [keys[1]!, 'Married']])));
    expect(back.title).toBe('June');
    expect(back.kind).toBe('character');
    expect(cardFieldsOf(back.fields)).toEqual([
      ['title 2', 'Chef'],
      ['status 2', 'Married'],
    ]);
  });

  it('reads nicknames as a list or a comma-separated line', () => {
    expect(akaOf({ aka: ['Junie', ' Mama J '] })).toEqual(['Junie', 'Mama J']);
    expect(akaOf({ aka: 'Junie, Mama J,' })).toEqual(['Junie', 'Mama J']);
    expect(akaOf({})).toEqual([]);
  });

  it('reads relationships, ignoring anything malformed', () => {
    expect(relationshipsOf({ relationships: [{ to: 'abc', as: 'Mother of' }, 'junk', { as: 'Friend of' }] })).toEqual([
      { to: 'abc', as: 'Mother of' },
      { to: '', as: 'Friend of' },
    ]);
    expect(relationshipsOf({ relationships: 'nope' })).toEqual([]);
  });

  it('knows which section a path is in', () => {
    expect(sectionOf('pantry/characters/June.md')).toBe('characters');
    expect(sectionOf('pantry/settings/Kitchens/Grandma.md')).toBe('settings');
    expect(sectionOf('pantry/June.md')).toBeNull();
    expect(sectionOf('bookshelf/characters/x.md')).toBeNull();
  });

  it('makes cards in the writer’s own folders inside a section', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('pantry/characters/Family');
    expect(await createFromTemplate(fs, 'pantry/characters/Family', character, 'June')).toBe('pantry/characters/Family/June.md');
    // A folder outside the section sends it to the section.
    expect(await createFromTemplate(fs, 'pantry/settings', character, 'Ruth')).toBe('pantry/characters/Ruth.md');
    expect(await createFromTemplate(fs, 'bookshelf', character, 'Earl')).toBe('pantry/characters/Earl.md');
  });

  it('saves portraits under pictures/ without overwriting', async () => {
    const fs = new MemoryAdapter();
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await savePicture(fs, 'June', bytes, 'image/jpeg')).toBe('pictures/June.jpg');
    expect(await savePicture(fs, 'June', bytes, 'image/jpeg')).toBe('pictures/June 2.jpg');
    expect(await savePicture(fs, 'June: older', bytes, 'image/png')).toBe('pictures/June older.png');
    expect(await fs.readBytes('pictures/June.jpg')).toEqual(bytes);
  });

  it('indexes relationships both ways, and nicknames and fields for search', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const june = await createFromTemplate(fs, '', character, 'June');
    const ruth = await createFromTemplate(fs, '', character, 'Ruth');
    const juneDoc = await readDocument(fs, june);
    const ruthDoc = await readDocument(fs, ruth);
    await writeDocument(fs, june, { ...juneDoc, fields: { ...juneDoc.fields, role: 'Pastry cook', aka: ['Junie'] } });
    await writeDocument(fs, ruth, { ...ruthDoc, fields: { ...ruthDoc.fields, relationships: [{ to: juneDoc.id, as: 'Mother of' }, { to: '', as: '' }] } });
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    expect(index.incoming(juneDoc.id)).toEqual([{ path: ruth, title: 'Ruth', as: 'Mother of' }]);
    expect(index.incoming(ruthDoc.id)).toEqual([]);
    expect(index.search('junie')[0]?.path).toBe(june);
    expect(index.search('pastry', { kinds: ['character'] })[0]?.path).toBe(june);
    expect(index.cards().get(june)?.aka).toEqual(['Junie']);
    // Moving Ruth keeps the relationship.
    index.move('pantry/characters', 'pantry/characters/Family');
    expect(index.incoming(juneDoc.id)[0]?.path).toBe('pantry/characters/Family/Ruth.md');
    // Rewriting Ruth without it removes it.
    await writeDocument(fs, ruth, ruthDoc);
    index.remove('pantry/characters/Family/Ruth.md');
    expect(index.incoming(juneDoc.id)).toEqual([]);
    index.close();
  });
});
