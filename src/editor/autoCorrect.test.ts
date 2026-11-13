// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { DEFAULT_SETTINGS, setSettings } from '../settings';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown } from './markdown';
import { addressAt, capitalAt, ordinalAt } from './autoCorrect';
import { setSuggesting } from './trackChanges';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  setSettings(DEFAULT_SETTINGS);
});

function make(markdown = '') {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  editor.commands.focus('end');
  return editor;
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { view } = editor;
    if (ch === '\n') {
      view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'Enter' })));
      continue;
    }
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

const typed = (text: string, start = '') => {
  const editor = make(start);
  type(editor, text);
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
};

const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as never);

describe('Scrivener corrections while typing', () => {
  it('capitalises each sentence and a lone i as the word is finished', () => {
    expect(typed("hello world. this is a test. i think i'm fine, and i'll go. what? yes! ok")).toBe('Hello world. This is a test. I think I’m fine, and I’ll go. What? Yes! ok');
  });

  it('starts each paragraph with a capital, finished by Enter too', () => {
    expect(typed('one\ntwo three\nfour')).toBe('One\nTwo three\nfour');
  });

  it('leaves alone what Scrivener leaves alone', () => {
    expect(typed('e.g. this is it. i.e. so is this. pi is 3.14 and so on. wait... what ')).toBe('e.g. this is it. i.e. so is this. Pi is 3.14 and so on. Wait… what ');
    expect(typed('so did i. visit http://x.org now ')).toBe('So did I. Visit http://x.org now ');
  });

  it('follows quotes the way Scrivener does', () => {
    expect(typed('"stop." she said. "why?" he asked. "yes," i said. ')).toBe('“Stop.” She said. “Why?” he asked. “Yes,” I said. ');
  });

  it('makes en and em dashes from hyphens', () => {
    expect(typed('well - ok. a---b and c--d ')).toBe('Well – ok. A—b and c—d ');
  });

  it('raises the ending of an ordinal once it is finished', () => {
    const editor = make();
    type(editor, 'the 1st, 22nd and 11th but not 2th or 1st');
    expect(md(editor)).toBe('The 1[st]{.sup}, 22[nd]{.sup} and 11[th]{.sup} but not 2th or 1st\n');
  });

  it('makes web and mail addresses into links', () => {
    const editor = make();
    type(editor, 'see www.example.com. or write to me@example.org ');
    expect(md(editor)).toBe('See [www.example.com](http://www.example.com). Or write to [me@example.org](mailto:me@example.org) \n');
  });

  it('does nothing when the corrections are switched off', () => {
    setSettings({ capitalSentences: false, capitalI: false, ordinals: false, webLinks: false });
    const editor = make();
    type(editor, 'hello. i saw the 1st www.example.com ');
    expect(md(editor)).toBe('hello. i saw the 1st www.example.com \n');
  });

  it('makes the capital part of a suggested insertion while suggesting changes', () => {
    setSuggesting(true);
    try {
      const editor = make('Before.');
      type(editor, ' after it');
      expect(md(editor)).toBe('Before.[ After it]{.ins}\n');
    } finally {
      setSuggesting(false);
    }
  });

  it('takes back just the correction on Undo, as Scrivener does', () => {
    const editor = make();
    type(editor, 'hello ');
    expect(editor.getText()).toBe('Hello ');
    editor.commands.undo();
    expect(editor.getText()).toBe('hello ');
  });

  it('keeps superscript through Markdown', () => {
    const body = 'The 21[st]{.sup} time.\n';
    expect(serializeMarkdown(parseMarkdown(body))).toBe(body);
  });
});

describe('Scrivener’s rules', () => {
  const cap = (text: string) => capitalAt(text, text.length - 1, true, true);
  it('capitalises i after a space or an opening bracket, not after a quote', () => {
    expect(cap('So (i ')).toBe(4);
    expect(cap('So “i ')).toBe(null);
    expect(cap('So xi ')).toBe(null);
  });
  it('waits for the word to be finished, and only the first word', () => {
    expect(cap('hello')).toBe(null);
    expect(cap('hello world ')).toBe(null);
    expect(cap('Done. hello,')).toBe(6);
  });
  it('does not start a sentence after an ellipsis or a dash after a quote', () => {
    expect(cap('Wait… so ')).toBe(null);
    expect(cap('Well.\n“—and ')).toBe(null);
    expect(cap('Well.\n—and ')).toBe(7);
  });
  it('knows ordinals and addresses', () => {
    expect(ordinalAt('the 3rd ', 7)).toEqual([5, 7]);
    expect(ordinalAt('the 13rd ', 8)).toBe(null);
    expect(addressAt('go to example.com ', 17)).toEqual([6, 17, 'http://example.com']);
    expect(addressAt('file.txt ', 8)).toBe(null);
  });
});

describe('Scrivener’s substitutions and dashes', () => {
  it('swaps its list as each word is finished', () => {
    expect(typed('teh cat (c) 2026 and 1/2 a cup --> there <-- ==> <== tehn ok')).toBe('The cat © 2026 and ½ a cup → there ← ⇒ ⇐ then ok');
    expect(typed('so 11/2 and 1/2/3 and xteh ')).toBe('So 11/2 and 1/2/3 and xteh ');
  });

  it('deletes a curly quote or dash with Backspace, and Undo gives the hyphens back', () => {
    const editor = make('Text');
    type(editor, ' a--');
    expect(editor.getText()).toBe('Text a—');
    editor.commands.undo();
    expect(editor.getText()).toBe('Text a--');
    type(editor, '"');
    expect(editor.getText()).toBe('Text a--”');
    // Backspace tries to take a shortcut back first; for a quote there is nothing to take back, so it just deletes.
    expect(editor.commands.undoInputRule()).toBe(false);
    expect(editor.getText()).toBe('Text a--”');
  });
});

describe('Undo steps', () => {
  it('takes back a whole run of typing, however long it took, until the caret moves', () => {
    const editor = make('Start.');
    const { view } = editor;
    let clock = 1_000_000;
    const slow = (text: string) => {
      for (const ch of text) {
        clock += 3000;
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(ch, from, to).setTime(clock));
      }
    };
    slow(' one');
    slow(' two');
    editor.commands.setTextSelection(1);
    editor.commands.focus('end');
    slow(' three');
    editor.commands.undo();
    expect(editor.getText()).toBe('Start. one two');
    editor.commands.undo();
    expect(editor.getText()).toBe('Start.');
  });
});
