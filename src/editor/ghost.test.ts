// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { ghostKey, sentencesOf, setGhost } from './ghost';
import { docWords } from './docStats';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown: string) {
  const editor = new Editor({ element: document.createElement('div'), extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  return editor;
}
const shown = (editor: Editor) => {
  const dom = editor.view.dom;
  return {
    line: dom.querySelector('p.ghost-line')?.getAttribute('data-ghost') ?? null,
    below: [...dom.querySelectorAll('.cb-ghost p')].map((p) => p.textContent),
    after: dom.querySelector('.cb-ghost-inline')?.textContent ?? null,
  };
};
const draft = ['June burned the rice.', 'Nobody spoke.', 'Lou laughed.'];

describe('ghost text', () => {
  it('fills an empty Item like a placeholder, starting on the caret’s line', () => {
    const editor = make('');
    setGhost(editor, draft);
    expect(shown(editor)).toEqual({ line: 'June burned the rice.', below: ['Nobody spoke.', 'Lou laughed.'], after: null });
  });

  it('keeps pace a paragraph at a time as the Item is written again', () => {
    const editor = make('');
    setGhost(editor, draft);
    editor.commands.insertContent('June scorched the grits.');
    expect(shown(editor)).toEqual({ line: null, below: ['Nobody spoke.', 'Lou laughed.'], after: null });
    editor.commands.enter();
    expect(shown(editor)).toEqual({ line: 'Nobody spoke.', below: ['Lou laughed.'], after: null });
    editor.commands.insertContent('No one said a word.');
    editor.commands.enter();
    editor.commands.insertContent('Lou cackled.');
    expect(shown(editor)).toEqual({ line: null, below: [], after: null });
  });

  it('takes the place of the draft a sentence at a time, carrying on after the caret', () => {
    const editor = make('');
    setGhost(editor, ['June burned the rice. Lou laughed. Nobody spoke.', 'Then supper.']);
    editor.commands.insertContent('June scorched');
    expect(shown(editor)).toEqual({ line: null, below: ['Then supper.'], after: ' Lou laughed. Nobody spoke.' });
    editor.commands.insertContent(' the grits. ');
    expect(shown(editor).after).toBe('Lou laughed. Nobody spoke.');
    editor.commands.insertContent('Lou');
    expect(shown(editor).after).toBe(' Nobody spoke.');
    editor.commands.insertContent(' cackled. Silence.');
    expect(shown(editor)).toEqual({ line: null, below: ['Then supper.'], after: null });
  });

  it('splits sentences after their stops and closing quotes', () => {
    expect(sentencesOf('“Run!” she said. Why? Because')).toEqual(['“Run!” she said. ', 'Why? ', 'Because']);
    expect(sentencesOf('He left. “Good,” said June.')).toEqual(['He left. ', '“Good,” said June.']);
  });

  it('is never part of the text, its words or its undo history', () => {
    const editor = make('');
    setGhost(editor, draft);
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).toBe('');
    expect(docWords(editor.state.doc)).toBe(0);
    expect(editor.can().undo()).toBe(false);
    setGhost(editor, null);
    expect(ghostKey.getState(editor.state)?.paragraphs).toBe(null);
    expect(shown(editor)).toEqual({ line: null, below: [], after: null });
  });
});
