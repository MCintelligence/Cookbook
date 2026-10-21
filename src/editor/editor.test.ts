// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions, toggleCharStyle } from './extensions';
import { getFind, replaceAll, setFindQuery, stepFind } from './findPlugin';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown = '') {
  const next = (style: string) => (style === 'chapter-title' ? 'body-first' : style === 'body-first' ? 'body' : style);
  const editor = new Editor({ extensions: cookbookExtensions(next), content: parseMarkdown(markdown) });
  editors.push(editor);
  editor.commands.focus('end');
  return editor;
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

function press(editor: Editor, key: string) {
  const { view } = editor;
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  const handled = view.someProp('handleKeyDown', (f) => f(view, event));
  if (!handled && key === 'Backspace') {
    const { from } = view.state.selection;
    view.dispatch(view.state.tr.delete(from - 1, from));
  }
}

const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as NodeJSON);

describe('typing shortcuts', () => {
  it('turns a dash and a space into a list', () => {
    const editor = make();
    type(editor, '- eggs');
    expect(md(editor)).toBe('- eggs\n');
  });

  it('turns -TD and a space into a checklist', () => {
    const editor = make();
    type(editor, '-TD find the hymn');
    expect(md(editor)).toBe('- [ ] find the hymn\n');
  });

  it('turns a checklist back into the typed text on Backspace, keeping the space', () => {
    const editor = make();
    type(editor, '-TD ');
    expect(editor.getJSON().content?.[0]?.type).toBe('taskList');
    press(editor, 'Backspace');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    expect(editor.getText()).toBe('-TD ');
  });

  it('applies Strong, Emphasis and Underline from Markdown', () => {
    const editor = make();
    type(editor, 'a **bold** and *soft* and _under_ end');
    expect(md(editor)).toBe('a **bold** and *soft* and [under]{.underline} end\n');
  });

  it('keeps an outer character style when Markdown adds another', () => {
    const editor = make('[she thought]{.thought}');
    editor.commands.focus('end');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    type(editor, ' **so**');
    expect(md(editor)).toBe('[she thought **so**]{.thought}\n');
  });

  it('turns * * * on its own line into a scene break', () => {
    const editor = make('Before.');
    editor.commands.focus('end');
    press(editor, 'Enter');
    type(editor, '* * *');
    type(editor, 'After.');
    expect(md(editor)).toBe('Before.\n\n* * *\n\nAfter.\n');
  });

  it('makes em dashes and curly quotes', () => {
    const editor = make();
    type(editor, '"Well--" she said');
    expect(editor.getText()).toBe('“Well—” she said');
  });

  it('toggles character styles with the keyboard shortcuts', () => {
    const editor = make('plain words');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    toggleCharStyle(editor, 'emphasis');
    toggleCharStyle(editor, 'strong');
    expect(md(editor)).toBe('***plain*** words\n');
    toggleCharStyle(editor, 'emphasis');
    expect(md(editor)).toBe('**plain** words\n');
  });
});

describe('paragraph styles', () => {
  it('gives the next paragraph the style that follows', () => {
    const editor = make('::: chapter-title\nSunday Dinner\n:::');
    editor.commands.focus('end');
    press(editor, 'Enter');
    type(editor, 'The kitchen.');
    press(editor, 'Enter');
    type(editor, 'Her greens.');
    expect(md(editor)).toBe('::: chapter-title\nSunday Dinner\n:::\n\n::: body-first\nThe kitchen.\n:::\n\nHer greens.\n');
  });
});

describe('find and replace', () => {
  it('finds, steps and replaces across paragraphs', () => {
    const editor = make('Lou asked.\n\nLouise and Lou.');
    setFindQuery(editor, 'lou', { matchCase: false, wholeWord: true });
    expect(getFind(editor.state).matches).toHaveLength(2);
    stepFind(editor, 1);
    expect(replaceAll(editor, 'Mama Lou')).toBe(2);
    expect(md(editor)).toBe('Mama Lou asked.\n\nLouise and Mama Lou.\n');
    // Matches follow the edit: "lou" now appears inside each replacement.
    expect(getFind(editor.state).matches).toHaveLength(2);
  });
});
