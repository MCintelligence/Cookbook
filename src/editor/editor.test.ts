// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions, toggleCharStyle } from './extensions';
import { getFind, replaceAll, setFindQuery, stepFind } from './findPlugin';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import {
  addNoteAnchor,
  deleteFootnote,
  dialogueSpans,
  dialogueStats,
  footnotes,
  insertFootnote,
  noteAnchors,
  removeNoteAnchor,
  setDialogueFocus,
  setFootnoteText,
  setTodoChecked,
  todos,
} from './seasonings';

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

  it('finds words on both sides of a footnote', () => {
    const editor = make('Cornbread.^[Lou’s recipe.] Lou baked.');
    setFindQuery(editor, 'Lou', { matchCase: true, wholeWord: true });
    stepFind(editor, 1);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('Lou');
  });
});

describe('notes', () => {
  it('anchors a note to the selected words', () => {
    const editor = make('The church had burned that summer.');
    editor.commands.setTextSelection({ from: 5, to: 22 });
    expect(addNoteAnchor(editor, ['n1'])).toBe('n2');
    expect(md(editor)).toBe('The [church had burned]{.note #n2} that summer.\n');
    expect(noteAnchors(editor.state.doc)).toMatchObject([{ id: 'n2', quote: 'church had burned' }]);
  });

  it('does not stretch a note when typing after it', () => {
    const editor = make('[pie]{.note #n1}');
    editor.commands.focus('end');
    type(editor, ' crust');
    expect(md(editor)).toBe('[pie]{.note #n1} crust\n');
  });

  it('removes a note anchor but keeps the words and other styles', () => {
    const editor = make('[**hot** pie]{.note #n1} and [tea]{.note #n2}');
    removeNoteAnchor(editor, 'n1');
    expect(md(editor)).toBe('**hot** pie and [tea]{.note #n2}\n');
  });
});

describe('footnotes', () => {
  it('inserts, fills and deletes a footnote at the cursor', () => {
    const editor = make('One. Two.');
    editor.commands.setTextSelection(5);
    expect(insertFootnote(editor)).toBe(0);
    setFootnoteText(editor, 0, 'First\nline.');
    editor.commands.focus('end');
    expect(insertFootnote(editor)).toBe(1);
    setFootnoteText(editor, 1, 'Second [one].');
    expect(md(editor)).toBe('One.^[First line.] Two.^[Second \\[one\\].]\n');
    expect(footnotes(editor.state.doc).map((f) => f.text)).toEqual(['First line.', 'Second [one].']);
    deleteFootnote(editor, 0);
    expect(md(editor)).toBe('One. Two.^[Second \\[one\\].]\n');
  });
});

describe('scene checklist', () => {
  it('lists and ticks checklist items', () => {
    const editor = make('- [ ] find the hymn\n- [x] done');
    const list = todos(editor.state.doc);
    expect(list.map((t) => [t.text, t.checked])).toEqual([['find the hymn', false], ['done', true]]);
    setTodoChecked(editor, list[0]!.pos, true);
    expect(md(editor)).toBe('- [x] find the hymn\n- [x] done\n');
  });
});

describe('dialogue focus', () => {
  it('measures and marks the dialogue', () => {
    const editor = make('“You writing about me again?” Lou asked.\n\nShe stirred the pot.');
    expect(dialogueStats(editor.state.doc)).toEqual({ dialogueWords: 5, totalWords: 11 });
    const [span] = dialogueSpans(editor.state.doc);
    expect(editor.state.doc.textBetween(span!.from, span!.to)).toBe('“You writing about me again?”');
    setDialogueFocus(editor, true);
    expect(editor.view.dom.classList.contains('cb-dialogue-focus')).toBe(true);
    expect([...editor.view.dom.querySelectorAll('.cb-narration')].map((e) => e.textContent)).toEqual([' Lou asked.', 'She stirred the pot.']);
    setDialogueFocus(editor, false);
    expect(editor.view.dom.classList.contains('cb-dialogue-focus')).toBe(false);
  });
});
