// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, setSettings } from '../settings';
import { Editor } from '@tiptap/core';
import { cookbookExtensions, dropTakenFormat, selectedParagraphs, selectionBlock, setParagraphFormat, setTextFormat, textFormatAt, toggleCharStyle } from './extensions';
import { getFind, replaceAll, setFindQuery, stepFind } from './findPlugin';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { EditorState } from '@tiptap/pm/state';
import {
  checkedOff,
  deleteFootnote,
  dialogueSpans,
  dialogueStats,
  footnotes,
  insertFootnote,
  isDialogueFocus,
  removeNoteAnchor,
  setChecksOff,
  setDialogueFocus,
  setFootnoteText,
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

  it('leaves the list completely on Enter in an empty item, even from a sub-list', () => {
    const editor = make('- one\n  - two');
    press(editor, 'Enter');
    press(editor, 'Enter');
    type(editor, 'after');
    expect(md(editor)).toBe('- one\n  - two\n\nafter\n');
  });

  it('makes an empty item a paragraph on Backspace instead of joining the item above', () => {
    const editor = make('- one');
    press(editor, 'Enter');
    press(editor, 'Backspace');
    type(editor, 'two');
    expect(md(editor)).toBe('- one\n\ntwo\n');
  });

  it('indents a plain paragraph with a tab that survives saving, and never starts a list', () => {
    const editor = make();
    press(editor, 'Tab');
    type(editor, 'Once upon a time');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    expect(md(editor)).toBe('&#9;Once upon a time\n');
    expect(parseMarkdown(md(editor)).content?.[0]?.content?.[0]?.text).toBe('\tOnce upon a time');
  });

  it('applies plain bold, italic, underline, strikethrough and code from Markdown', () => {
    const editor = make();
    type(editor, 'a **bold** and *soft* and _under_ and ~~gone~~ and `x` end');
    expect(md(editor)).toBe('a **bold** and *soft* and [under]{.ul} and ~~gone~~ and `x` end\n');
    expect(editor.getJSON().content?.[0]?.content?.[1]?.marks).toEqual([{ type: 'bold' }]);
  });

  it('starts numbered lists with -1 or 1., and headings and quotes with # and >', () => {
    const editor = make();
    type(editor, '-1 one');
    press(editor, 'Enter');
    type(editor, 'two');
    expect(md(editor)).toBe('1. one\n2. two\n');
    const other = make();
    type(other, '## Part one');
    press(other, 'Enter');
    type(other, '> Said she');
    expect(md(other)).toBe('## Part one\n\n> Said she\n');
    const year = make();
    type(year, '1962. That summer');
    expect(md(year)).toBe('1962. That summer\n');
  });

  it('breaks a line with Shift+Enter', () => {
    const editor = make('Roses');
    editor.commands.focus('end');
    press(editor, 'Shift-Enter');
    type(editor, 'violets');
    expect(md(editor)).toBe('Roses\\\nviolets\n');
  });

  it('opens every new kind of block from its Markdown and writes it back unchanged', () => {
    const body = [
      '# Title',
      '',
      '1. one',
      '   - nested',
      '2. two',
      '',
      '| a | b |',
      '| --- | --- |',
      '| c | d |',
      '',
      '```',
      'code *here*',
      '```',
      '',
      '> quote',
      '',
      'Pie ~~cake~~ [site](https://x.org) `x` [u]{.ul} ![Lou](pantry/lou.jpg)\\',
      'next',
      '',
    ].join('\n');
    expect(md(make(body))).toBe(body);
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
    press(editor, 'Enter');
    type(editor, 'After.');
    // Enter makes the break and goes on below it, with no empty line in between.
    expect(md(editor)).toBe('Before.\n\n* * *\n\nAfter.\n');
    expect(editor.state.doc.childCount).toBe(3);
  });

  it('leaves typing shortcuts alone when they are switched off', () => {
    setSettings({ curlyQuotes: false, emDash: false, markdown: false });
    try {
      const editor = make();
      type(editor, '"Well--" **so**');
      press(editor, 'Enter');
      type(editor, '- * * *');
      press(editor, 'Enter');
      expect(md(editor)).toBe('"Well--" \\*\\*so\\*\\*\n\n\\- \\* \\* \\*\n');
    } finally {
      setSettings(DEFAULT_SETTINGS);
    }
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
    // Character styles are written by name, so restyling Strong restyles every use.
    expect(md(editor)).toBe('[[plain]{.strong}]{.emphasis} words\n');
    toggleCharStyle(editor, 'emphasis');
    expect(md(editor)).toBe('[plain]{.strong} words\n');
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
    expect(md(editor)).toBe('# Sunday Dinner\n\n::: body-first\nThe kitchen.\n:::\n\nHer greens.\n');
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

  it('fades every word but the matches, and clears with the search', () => {
    const editor = make('Lou asked.\n\nLouise and Lou.');
    const text = (sel: string) => [...editor.view.dom.querySelectorAll(sel)].map((e) => e.textContent);
    setFindQuery(editor, 'lou', { matchCase: false, wholeWord: true });
    expect(text('.cb-find')).toEqual(['Lou', 'Lou']);
    expect(text('.cb-find-dim')).toEqual([' asked.', 'Louise and ', '.']);
    stepFind(editor, 1);
    expect(editor.view.dom.querySelectorAll('.cb-find-current')).toHaveLength(1);
    setFindQuery(editor, '', { matchCase: false, wholeWord: true });
    expect(editor.view.dom.querySelectorAll('.cb-find, .cb-find-dim')).toHaveLength(0);
  });

  it('fades nothing when there are no matches', () => {
    const editor = make('Lou asked.');
    setFindQuery(editor, 'Ruth', { matchCase: false, wholeWord: false });
    expect(editor.view.dom.querySelectorAll('.cb-find-dim')).toHaveLength(0);
  });
});

describe('notes', () => {
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

  it('keeps the Checks when the page state is made afresh, as opening an Item with its undo history does', () => {
    const editor = make('“Hi,” she said.');
    setDialogueFocus(editor, true);
    setChecksOff(editor, ['spelling']);
    editor.view.updateState(EditorState.create({ doc: editor.state.doc, plugins: editor.state.plugins }));
    expect(isDialogueFocus(editor.state)).toBe(true);
    expect([...checkedOff(editor.state)]).toEqual(['spelling']);
  });
});

describe('tables', () => {
  it('leaves a paragraph after a table inserted at the end, and Ctrl+End reaches the very end', () => {
    const editor = make('Hello');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    editor.commands.setTextSelection(1);
    const { view } = editor;
    view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'End', ctrlKey: true })));
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
  });

  it('does not add a paragraph when the table goes in the middle', () => {
    const editor = make('One\n\nTwo');
    editor.commands.setTextSelection(1);
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    expect(editor.state.doc.childCount).toBe(3);
  });
});

describe('the writer’s own font, size and colour', () => {
  /** The font of each paragraph's words, in order ('' for none). */
  const fonts = (editor: Editor) => {
    const out: string[] = [];
    editor.state.doc.forEach((block) => {
      let font = '';
      block.descendants((n) => {
        const m = n.marks.find((k) => k.type.name === 'textStyle');
        if (n.isText) font = (m?.attrs.font as string | null) ?? '';
      });
      out.push(font);
    });
    return out;
  };

  it('carries on into the next paragraph after Enter', () => {
    const editor = make('');
    setTextFormat(editor, { font: 'Caudex', size: 14 });
    type(editor, 'One');
    press(editor, 'Enter');
    type(editor, 'Two');
    expect(fonts(editor)).toEqual(['Caudex', 'Caudex']);
    expect(textFormatAt(editor)).toMatchObject({ font: 'Caudex', size: 14 });
  });

  it('is kept when Enter is pressed before typing anything, and across blank lines', () => {
    const editor = make('Plain');
    setTextFormat(editor, { font: 'Caudex' });
    press(editor, 'Enter');
    press(editor, 'Enter');
    type(editor, 'Fancy');
    expect(fonts(editor)).toEqual(['', '', 'Caudex']);
  });

  it('follows a heading into the Body paragraph after it', () => {
    const editor = make('# Chapter');
    setTextFormat(editor, { color: '#aa3300' });
    press(editor, 'Enter');
    type(editor, 'Text');
    const last = editor.state.doc.lastChild!;
    expect(last.attrs.style).not.toBe('chapter-title');
    expect(last.firstChild!.marks.find((m) => m.type.name === 'textStyle')?.attrs.color).toBe('#aa3300');
  });

  it('carries on in a list and after Shift+Enter', () => {
    const editor = make('- item');
    setTextFormat(editor, { font: 'Caudex' });
    type(editor, 'x');
    press(editor, 'Enter');
    type(editor, 'y');
    press(editor, 'Shift-Enter');
    type(editor, 'z');
    const texts: string[] = [];
    editor.state.doc.descendants((n) => {
      if (n.isText && n.text !== 'item') texts.push(`${n.text}:${n.marks.find((m) => m.type.name === 'textStyle')?.attrs.font ?? ''}`);
    });
    expect(texts).toEqual(['x:Caudex', 'y:Caudex', 'z:Caudex']);
  });
});

describe('the toolbar after Select all', () => {
  const md = '# Chapter\n\nOne\n\n> Quote\n\nTwo';
  const textFonts = (editor: Editor) => {
    const out: string[] = [];
    editor.state.doc.descendants((n) => {
      if (n.isText) out.push(n.marks.find((m) => m.type.name === 'textStyle')?.attrs.font ?? '');
    });
    return out;
  };

  it('finds a paragraph to show, though the selection starts outside any', () => {
    const editor = make(md);
    editor.commands.selectAll();
    expect(editor.state.selection.$from.depth).toBe(0);
    const block = selectionBlock(editor);
    expect(block?.top).toBe(true);
    expect(block?.node.textContent).toBe('Chapter');
  });

  it('sets font, size and colour on every word', () => {
    const editor = make(md);
    editor.commands.selectAll();
    setTextFormat(editor, { font: 'Caudex', size: 14 });
    expect(textFonts(editor).every((f) => f === 'Caudex')).toBe(true);
    expect(textFormatAt(editor)).toMatchObject({ font: 'Caudex', size: 14 });
  });

  it('sets alignment on every top-level paragraph, not just the first', () => {
    const editor = make(md);
    editor.commands.selectAll();
    const all = selectedParagraphs(editor);
    expect(all.length).toBe(editor.state.doc.childCount);
    expect(all.length).toBeGreaterThan(1);
    setParagraphFormat(editor, { align: 'center' });
    const aligns: unknown[] = [];
    editor.state.doc.forEach((n) => n.type.name === 'paragraph' && aligns.push(n.attrs.align));
    expect(aligns.every((a) => a === 'center')).toBe(true);
  });

  it('gives every paragraph the Style picked', () => {
    const editor = make(md);
    editor.commands.selectAll();
    editor.chain().updateAttributes('paragraph', { style: 'body', align: null, lineSpacing: null }).run();
    const styles: unknown[] = [];
    editor.state.doc.forEach((n) => n.type.name === 'paragraph' && styles.push(n.attrs.style));
    expect(styles.every((s) => s === 'body')).toBe(true);
  });

  it('lets several paragraphs follow their style again at once', () => {
    const editor = make('One\n\nTwo');
    editor.commands.selectAll();
    setParagraphFormat(editor, { align: 'center' });
    setTextFormat(editor, { font: 'Caudex' });
    dropTakenFormat(editor, selectedParagraphs(editor).map((p) => p.pos), { align: 'center', font: 'Caudex' });
    editor.state.doc.forEach((n) => expect(n.attrs.align).toBeNull());
    expect(textFonts(editor)).toEqual(['', '']);
  });
});
