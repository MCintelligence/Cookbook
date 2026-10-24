import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { createBook, readDocument, readTree, walkFiles } from './book';
import { CARD_TEMPLATES, SCENE_TEMPLATES, applyBookTemplate, createFromTemplate, type BookTemplateId } from './templates';
import { parseMarkdown, serializeMarkdown } from '../editor/markdown';

async function files(template: BookTemplateId) {
  const fs = new MemoryAdapter();
  await createBook(fs, 'Book');
  await applyBookTemplate(fs, template);
  const out: string[] = [];
  for (const root of ['bookshelf', 'pantry']) for (const f of walkFiles(await readTree(fs, root))) out.push(f.path);
  return out;
}

describe('templates', () => {
  it('lays out each kind of book', async () => {
    expect(await files('novel')).toEqual([
      'bookshelf/Chapter 1/Page 1.md',
      'pantry/characters/Main character.md',
      'pantry/settings/Main setting.md',
    ]);
    expect(await files('short-story')).toEqual(['bookshelf/Page 1.md', 'pantry/characters/Main character.md']);
    expect(await files('nonfiction')).toEqual(['bookshelf/Chapter 1/Section 1.md', 'bookshelf/Chapter 2/Section 1.md', 'pantry/research/Sources.md']);
  });

  it('fills a card with its fields and puts it in its Pantry shelf', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const path = await createFromTemplate(fs, 'bookshelf', CARD_TEMPLATES[0]!, 'Mama Lou');
    expect(path).toBe('pantry/characters/Mama Lou.md');
    expect(await readDocument(fs, path)).toMatchObject({ title: 'Mama Lou', kind: 'character', fields: { role: '', wants: '' } });
  });

  it('only uses Markdown the editor writes back unchanged', () => {
    for (const t of [...SCENE_TEMPLATES, ...CARD_TEMPLATES]) expect(serializeMarkdown(parseMarkdown(t.body))).toBe(t.body);
  });
});
