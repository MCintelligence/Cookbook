// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { DEFAULT_SETTINGS, parseSettings, setSettings } from '../settings';
import { applyDropCaps, findDropCaps, withDropCaps } from './dropCaps';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { HtmlWriter } from '../export/html';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  setSettings(DEFAULT_SETTINGS);
});

function make(markdown: string) {
  const editor = new Editor({ element: document.createElement('div'), extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  // The caret away from any !Word, which shows its ! while the caret is in it.
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
}

const caps = (editor: Editor) => Array.from(editor.view.dom.querySelectorAll('.cb-dropcap')).map((el) => `${el.textContent}${el.classList.contains('cb-dropcap-start') ? '^' : ''}`);
const hidden = (editor: Editor) => editor.view.dom.querySelectorAll('.cb-dropmark').length;

describe('finding !Word', () => {
  it('needs a ! that starts a word and a letter after it', () => {
    expect(findDropCaps('!Sword was drawn')).toEqual([{ at: 0, length: 1, start: true }]);
    expect(findDropCaps('She drew the !Sword.')).toEqual([{ at: 13, length: 1, start: false }]);
    expect(findDropCaps('“!Run,” he said, and (!then) —!now')).toEqual([
      { at: 1, length: 1, start: false },
      { at: 22, length: 1, start: false },
      { at: 30, length: 1, start: false },
    ]);
    expect(findDropCaps('\t!Indented')[0]!.start).toBe(true);
  });

  it('leaves other !s alone', () => {
    for (const text of ['Hello!', 'Hello!World', '!!Sword', '! Sword', '!1984', '![a picture](lou.jpg)', 'a!b']) expect(findDropCaps(text)).toEqual([]);
  });

  it('takes a whole letter outside the Basic Multilingual Plane', () => {
    expect(findDropCaps('!𝔄ncient')).toEqual([{ at: 0, length: 2, start: true }]);
  });
});

describe('drop caps in the editor', () => {
  it('hides the ! and drops the letter, and the file keeps the !', () => {
    const editor = make('!Once upon a time, the !Sword sang.');
    expect(caps(editor)).toEqual(['O^', 'S']);
    expect(hidden(editor)).toBe(2);
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).toBe('!Once upon a time, the !Sword sang.\n');
  });

  it('shows the ! again while the caret is in the word', () => {
    const editor = make('The !Sword sang.');
    editor.commands.setTextSelection(7);
    expect(caps(editor)).toEqual([]);
    editor.commands.setTextSelection(14);
    expect(caps(editor)).toEqual(['S']);
  });

  it('keeps up with typing, looking only at the paragraph changed', () => {
    const editor = make('First.\n\nSecond.');
    editor.commands.setTextSelection(9);
    editor.commands.insertContent('!');
    editor.commands.setTextSelection(1);
    expect(caps(editor)).toEqual(['S^']);
    editor.commands.insertContent('the !Blade ');
    expect(caps(editor)).toEqual(['B', 'S^']);
    editor.commands.undo();
    expect(caps(editor)).toEqual(['S^']);
  });

  it('leaves code alone', () => {
    const editor = make('`!Sword` and\n\n```\n!Sword\n```');
    expect(caps(editor)).toEqual([]);
  });

  it('shows !Word as written when the rule or Markdown is off, and back again', () => {
    const editor = make('!Sword drawn');
    setSettings({ markdownRules: { ...DEFAULT_SETTINGS.markdownRules, dropCap: false } });
    expect(caps(editor)).toEqual([]);
    expect(editor.view.dom.textContent).toBe('!Sword drawn');
    setSettings({ markdownRules: DEFAULT_SETTINGS.markdownRules });
    expect(caps(editor)).toEqual(['S^']);
    setSettings({ markdown: false });
    expect(caps(editor)).toEqual([]);
    expect(editor.state.doc.textContent).toBe('!Sword drawn');
  });
});

describe('drop caps outside the editor', () => {
  it('splits the letter out for exports', () => {
    const body = parseMarkdown('!Once the **!Sword** sang!');
    const out = withDropCaps(body.content![0]!.content!);
    expect(out.map((n) => [n.text, n.dropCap ?? ''])).toEqual([
      ['O', 'start'],
      ['nce the ', ''],
      ['S', 'inline'],
      ['word', ''],
      [' sang!', ''],
    ]);
    expect(new HtmlWriter().body(body)).toBe('<p><span class="cb-dropcap cb-dropcap-start">O</span>nce the <strong><span class="cb-dropcap">S</span></strong><strong>word</strong> sang!</p>');
  });

  it('draws them on a page made from the schema', () => {
    const page = document.createElement('div');
    page.innerHTML = '<p>!Once the <em>!Sword</em> <code>!no</code> sang!</p>';
    applyDropCaps(page);
    expect(page.innerHTML).toBe('<p><span class="cb-dropcap cb-dropcap-start">O</span>nce the <em><span class="cb-dropcap">S</span>word</em> <code>!no</code> sang!</p>');
  });

  it('leaves exports as written when the rule is off', () => {
    setSettings({ markdown: false });
    expect(new HtmlWriter().body(parseMarkdown('!Sword'))).toBe('<p>!Sword</p>');
  });
});

describe('Markdown settings', () => {
  it('turns each typing rule off on its own', () => {
    setSettings({ markdownRules: { ...DEFAULT_SETTINGS.markdownRules, bold: false, heading: false } });
    const editor = make('');
    editor.commands.focus('end');
    const type = (text: string) => {
      for (const ch of text) {
        const { view } = editor;
        const { from, to } = view.state.selection;
        if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    };
    type('# **so** *very*');
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).toBe('\\# \\*\\*so\\*\\* *very*\n');
  });

  it('keeps what the old switches said', () => {
    const old = parseSettings(JSON.stringify({ markdown: false, lineStarters: false }));
    expect(old.markdown).toBe(true);
    expect(Object.entries(old.markdownRules).filter(([, on]) => on).map(([id]) => id)).toEqual(['dropCap']);
    const starters = parseSettings(JSON.stringify({ lineStarters: false })).markdownRules;
    expect([starters.bullets, starters.sceneBreak, starters.bold]).toEqual([false, false, true]);
    expect(parseSettings(JSON.stringify({ markdownRules: { bold: false, nonsense: 3, italic: 'yes' } })).markdownRules).toMatchObject({ bold: false, italic: true, dropCap: true });
  });
});
