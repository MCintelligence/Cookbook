// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import nspell from 'nspell';
import { cookbookExtensions } from '../editor/extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from '../editor/markdown';
import { checkSpelling } from './check';
import { type Checker } from './client';
import { applySuggestion, drawnSet, forgetWord, issueAt, issuesOf, setChecker, setIgnored } from './plugin';

const speller = nspell({ aff: readFileSync('public/dictionaries/en-US.aff'), dic: readFileSync('public/dictionaries/en-US.dic') });
const names = ['Mama Lou'];

/** Runs in place, counting the paragraphs it is asked about. */
function checker() {
  const asked: string[] = [];
  const c: Checker = {
    check: async (texts) => {
      asked.push(...texts);
      return texts.map((t) => checkSpelling(t, speller, names));
    },
    suggest: async (word) => speller.suggest(word),
  };
  return { c, asked };
}

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown: string) {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  return editor;
}

const settle = () => new Promise((r) => setTimeout(r, 300));
const shown = (editor: Editor) => issuesOf(editor.state).map((i) => i.word);
/** What is drawn, which leaves out the word being typed. */
const drawn = (editor: Editor) =>
  drawnSet(editor.state)
    .find()
    .map((d) => editor.state.doc.textBetween(d.from, d.to));

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

describe('proofreading in the editor', () => {
  it('underlines misspellings and near-miss names once checked', async () => {
    const editor = make('Mamma Lou recieved the cornbread.\n\nIt was teh best.');
    setChecker(editor, checker().c);
    expect(shown(editor)).toEqual([]);
    await settle();
    expect(shown(editor)).toEqual(['Mamma Lou', 'recieved', 'teh']);
    expect(issueAt(editor.state, 3)?.issue.suggestions).toEqual(['Mama Lou']);
  });

  it('only rechecks the paragraph that changed', async () => {
    const editor = make('First paragrah.\n\nSecond one.');
    const { c, asked } = checker();
    setChecker(editor, c);
    await settle();
    asked.length = 0;
    editor.commands.focus('end');
    type(editor, ' Mor');
    await settle();
    expect(asked).toEqual(['Second one. Mor']);
    expect(shown(editor)).toEqual(['paragrah', 'Mor']);
  });

  it('waits until the writer leaves a word before underlining it', async () => {
    const editor = make('Hello');
    setChecker(editor, checker().c);
    editor.commands.focus('end');
    type(editor, ' wrld');
    await settle();
    expect(shown(editor)).toEqual(['wrld']);
    expect(drawn(editor)).toEqual([]);
    type(editor, ' ');
    expect(drawn(editor)).toEqual(['wrld']);
    // Clicking back into a word that was already flagged keeps its underline.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 9)));
    expect(drawn(editor)).toEqual(['wrld']);
  });

  it('leaves ignored and forgotten words alone', async () => {
    const editor = make('Teh grits were tasty, Bubba.');
    setChecker(editor, checker().c);
    await settle();
    expect(shown(editor)).toEqual(['Teh', 'Bubba']);
    setIgnored(editor, ['Teh']);
    expect(shown(editor)).toEqual(['Bubba']);
    forgetWord(editor, 'Bubba');
    expect(shown(editor)).toEqual([]);
  });

  it('applies a suggestion without losing the styling', async () => {
    const editor = make('She was *recieved* well.');
    setChecker(editor, checker().c);
    await settle();
    const issue = issuesOf(editor.state)[0]!;
    applySuggestion(editor, issue, 'received');
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).toBe('She was *received* well.\n');
    await settle();
    expect(shown(editor)).toEqual([]);
  });

  it('stops underlining when switched off', async () => {
    const editor = make('Teh end.');
    setChecker(editor, checker().c);
    await settle();
    setChecker(editor, null);
    expect(shown(editor)).toEqual([]);
  });
});
