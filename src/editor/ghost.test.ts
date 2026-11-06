// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { ghostKey, setGhost } from './ghost';
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
  };
};
const draft = ['June burned the rice.', 'Nobody spoke.', 'Lou laughed.'];

describe('ghost text', () => {
  it('fills an empty Item like a placeholder, starting on the caret’s line', () => {
    const editor = make('');
    setGhost(editor, draft);
    expect(shown(editor)).toEqual({ line: 'June burned the rice.', below: ['Nobody spoke.', 'Lou laughed.'] });
  });

  it('keeps pace a paragraph at a time as the Item is written again', () => {
    const editor = make('');
    setGhost(editor, draft);
    editor.commands.insertContent('June scorched the grits.');
    expect(shown(editor)).toEqual({ line: null, below: ['Nobody spoke.', 'Lou laughed.'] });
    editor.commands.enter();
    expect(shown(editor)).toEqual({ line: 'Nobody spoke.', below: ['Lou laughed.'] });
    editor.commands.insertContent('No one said a word.');
    editor.commands.enter();
    editor.commands.insertContent('Lou cackled.');
    expect(shown(editor)).toEqual({ line: null, below: [] });
  });

  it('is never part of the text, its words or its undo history', () => {
    const editor = make('');
    setGhost(editor, draft);
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).toBe('');
    expect(docWords(editor.state.doc)).toBe(0);
    expect(editor.can().undo()).toBe(false);
    setGhost(editor, null);
    expect(ghostKey.getState(editor.state)?.paragraphs).toBe(null);
    expect(shown(editor)).toEqual({ line: null, below: [] });
  });
});
