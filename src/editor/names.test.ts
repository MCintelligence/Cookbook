// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown } from './markdown';
import { type NamedCard, castOf, countNames, docNames, findNames, nameMatcher, setNameMatcher } from './names';
import { MemoryAdapter } from '../storage/memory';
import { createBook, createDocument, readDocument, writeDocument } from '../storage/book';
import { BookIndex, refreshIndex } from '../storage/index';

const june: NamedCard = { id: 'j', path: 'pantry/characters/June.md', title: 'June', kind: 'character', aka: ['Junie', 'Mama June'] };
const kitchen: NamedCard = { id: 'k', path: 'pantry/settings/The Kitchen.md', title: 'The Kitchen', kind: 'setting', aka: [] };
const ed: NamedCard = { id: 'e', path: 'pantry/characters/E.md', title: 'E', kind: 'character', aka: ['Ed.'] };
const matcher = nameMatcher([june, kitchen, ed]);

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

describe('linked names', () => {
  it('matches whole names with their case, longest first', () => {
    const text = 'Mama June came in June’s apron. In june, Junie and Junebug ate in The Kitchen.';
    expect(findNames(text, matcher).map((h) => text.slice(h.from, h.to))).toEqual(['Mama June', 'June', 'Junie', 'The Kitchen']);
    expect(Object.fromEntries(countNames(text, matcher))).toEqual({ j: 3, k: 1 });
  });

  it('skips one-letter names and copes with punctuation in names', () => {
    expect(findNames('E said so. Ed. said so.', matcher).map((h) => h.card.id)).toEqual(['e']);
    expect(nameMatcher([])).toBeNull();
    expect(findNames('June', null)).toEqual([]);
  });

  it('finds names in a scene and decorates them as links', () => {
    const editor = new Editor({
      extensions: cookbookExtensions((s) => s),
      content: parseMarkdown('Junie^[A note.] waited in The Kitchen.\n\n::: letter\nDear June,\n:::'),
    });
    editors.push(editor);
    const hits = docNames(editor.state.doc, matcher);
    expect(hits.map((h) => editor.state.doc.textBetween(h.from, h.to))).toEqual(['Junie', 'The Kitchen', 'June']);
    expect(castOf(editor.state.doc, matcher).map((c) => c.title)).toEqual(['June', 'The Kitchen']);
    setNameMatcher(editor, matcher);
    const links = [...editor.view.dom.querySelectorAll('.cb-name')].map((el) => [el.textContent, el.getAttribute('data-card')]);
    expect(links).toEqual([
      ['Junie', june.path],
      ['The Kitchen', kitchen.path],
      ['June', june.path],
    ]);
    // Typing a name links it straight away, and nothing is written into the file.
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' Love, Mama June');
    expect(editor.view.dom.querySelectorAll('.cb-name').length).toBe(4);
    expect(editor.getHTML()).not.toContain('cb-name');
    setNameMatcher(editor, null);
    expect(editor.view.dom.querySelectorAll('.cb-name').length).toBe(0);
  });

  it('lists the scenes a card appears in', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    for (const [title, body] of [
      ['Supper', 'June burned the rice. Junie laughed.'],
      ['Breakfast', 'In june the kitchen was cold.'],
      ['Dessert', 'Nobody came.'],
    ]) {
      const p = await createDocument(fs, 'bookshelf', title!);
      await writeDocument(fs, p, { ...(await readDocument(fs, p)), body: body! });
    }
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    const count = (text: string) => countNames(text, matcher).get('j') ?? 0;
    expect(index.scenesNaming(['June', 'Junie', 'Mama June'], count)).toEqual([{ path: 'bookshelf/Supper.md', title: 'Supper', count: 2 }]);
    expect(index.scenesNaming(['!!'], count)).toEqual([]);
    index.close();
  });
});
