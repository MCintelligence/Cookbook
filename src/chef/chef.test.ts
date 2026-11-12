// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { DEFAULT_SETTINGS, parseSettings, setSettings } from '../settings';
import { cookbookExtensions } from '../editor/extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from '../editor/markdown';
import { DEFAULT_LOOK, inkColour, isDark, lookVars, parseLook } from './look';
import { looksLikeMarkdown } from './markdownPaste';
import { type ChefNote, addChefNote, changeNote, deleteNote, findText, notesState, placeNote, putNotesOn, readChefNotes, writeChefNotes } from './notes';
import { whenWritten } from './ChefMargin';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  setSettings(DEFAULT_SETTINGS);
});

function make(markdown: string) {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  return editor;
}

const note = (over: Partial<ChefNote>): ChefNote => ({ id: 'a', from: 1, to: 1, quote: '', text: 'Hm', at: '2026-11-12T09:00:00Z', ...over });

describe('Chef Mode look', () => {
  it('reads a saved look, putting anything damaged back to the default', () => {
    expect(parseLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(parseLook({ paper: 'night', ink: '#ABCDEF', font: 'EB Garamond', size: 999, line: 0.2, para: 7, width: 10, bar: false })).toEqual({
      ...DEFAULT_LOOK,
      paper: 'night',
      ink: '#ABCDEF',
      font: 'EB Garamond',
      size: 200,
      line: 1,
      para: 2,
      width: 440,
      bar: false,
    });
    expect(parseLook({ paper: 'plaid', font: 'Comic Sans', ink: 'red' })).toEqual(DEFAULT_LOOK);
    expect(parseSettings(JSON.stringify({ chef: { paper: 'cream' } })).chef.paper).toBe('cream');
  });

  it('adds nothing for what is left as styled, so the paragraph styles show through', () => {
    const { vars, classes } = lookVars(DEFAULT_LOOK);
    expect(classes).toEqual([]);
    expect(Object.keys(vars).sort()).toEqual(['--chef-size', '--chef-w']);
  });

  it('gives each paper the ink that reads on it, and a dark paper light things', () => {
    const night = { ...DEFAULT_LOOK, paper: 'night' };
    expect(lookVars(night).classes).toEqual(expect.arrayContaining(['chef-paper', 'chef-dark', 'chef-ink']));
    expect(isDark(inkColour(night)!)).toBe(false);
    expect(inkColour({ ...DEFAULT_LOOK, paper: '#101010' })).toBe('#dcd8cf');
    expect(inkColour({ ...DEFAULT_LOOK, paper: 'night', ink: 'brown' })).toBe('#4a3424');
    expect(lookVars({ ...DEFAULT_LOOK, line: 1.8, para: 0, font: 'sans' }).classes).toEqual(['chef-font', 'chef-line', 'chef-para']);
  });
});

describe('Markdown in Chef Mode', () => {
  it('knows Markdown when it sees it', () => {
    expect(looksLikeMarkdown('# A heading')).toBe(true);
    expect(looksLikeMarkdown('She was **very** sure.')).toBe(true);
    expect(looksLikeMarkdown('- one\n- two')).toBe(true);
    expect(looksLikeMarkdown('It was 5 * 3 or so, she thought.')).toBe(false);
    expect(looksLikeMarkdown('Plain words, nothing more.')).toBe(false);
  });

  it('formats typed Markdown in Chef Mode even with the rule switched off', () => {
    setSettings({ markdownRules: { ...DEFAULT_SETTINGS.markdownRules, bold: false } });
    const typeBold = () => {
      const editor = make('');
      editor.commands.focus('end');
      for (const ch of '**loud** ') {
        const { from, to } = editor.state.selection;
        const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)));
        if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
      }
      return JSON.stringify(editor.getJSON());
    };
    expect(typeBold()).not.toContain('"bold"');
    setSettings({ focus: true });
    expect(typeBold()).toContain('"bold"');
  });
});

describe('Chef notes', () => {
  it('reads and writes chef-notes.json, leaving out what is damaged', () => {
    const items = { item1: [note({ id: 'x', from: 3, to: 8, quote: 'words', replies: [{ id: 'r', text: 'Yes', at: '' }] })], empty: [] };
    const text = writeChefNotes(items);
    expect(JSON.parse(text)).toEqual({ version: 1, items: { item1: items.item1 } });
    expect(readChefNotes(text)).toEqual({ item1: items.item1 });
    expect(readChefNotes('{"items":{"a":[{"from":2}],"b":"no","c":[{"id":"n","from":-4,"to":"x","resolved":"yes"}]}}')).toEqual({
      c: [{ id: 'n', from: 0, to: 0, quote: '', text: '', at: '' }],
    });
    expect(readChefNotes('not json')).toEqual({});
  });

  it('finds its words again after they moved, the nearest first', () => {
    const editor = make('The cat sat.\n\nA dog barked. The cat ran.');
    const doc = editor.state.doc;
    const first = findText(doc, 'cat', 0)!;
    expect(doc.textBetween(first.from, first.to)).toBe('cat');
    const second = findText(doc, 'cat', doc.content.size)!;
    expect(second.from).toBeGreaterThan(first.from);
    expect(doc.textBetween(second.from, second.to)).toBe('cat');
    // Where it was no longer holds the words, so it moves to them; gone words leave it where they were.
    expect(placeNote(doc, note({ from: 2, to: 6, quote: 'dog' }))).toMatchObject({ quote: 'dog' });
    const placed = placeNote(doc, note({ from: 2, to: 6, quote: 'dog' }));
    expect(doc.textBetween(placed.from, placed.to)).toBe('dog');
    expect(placeNote(doc, note({ from: 5, to: 9, quote: 'zebra' }))).toMatchObject({ from: 5, to: 5 });
  });

  it('follows its words as the text is edited, and is never part of the text', () => {
    setSettings({ focus: true });
    const editor = make('Once upon a time.');
    putNotesOn(editor, 'item1');
    const at = findText(editor.state.doc, 'upon', 0)!;
    editor.commands.setTextSelection(at);
    const id = addChefNote(editor)!;
    expect(notesState(editor)?.fresh).toBe(id);
    changeNote(editor, id, { text: 'Too old-fashioned?' });
    editor.commands.insertContentAt(1, 'Well, ');
    const moved = notesState(editor)!.notes[0]!;
    expect(editor.state.doc.textBetween(moved.from, moved.to)).toBe('upon');
    // Typing right after its words doesn't take them in.
    editor.commands.insertContentAt(moved.to, 'x');
    const after = notesState(editor)!.notes[0]!;
    expect(editor.state.doc.textBetween(after.from, after.to)).toBe('upon');
    // It is shown in Chef Mode only, and never written into the Item.
    expect(editor.view.dom.querySelector('.chef-mark')?.textContent).toBe('upon');
    expect(serializeMarkdown(editor.getJSON() as NodeJSON)).not.toContain('old-fashioned');
    setSettings({ focus: false });
    editor.view.dispatch(editor.state.tr);
    expect(editor.view.dom.querySelector('.chef-mark')).toBeNull();
    deleteNote(editor, id);
    expect(notesState(editor)!.notes).toEqual([]);
  });

  it('goes on the word at the cursor when nothing is selected', () => {
    setSettings({ focus: true });
    const editor = make('Hello brave world.');
    putNotesOn(editor, 'item2');
    const at = findText(editor.state.doc, 'brave', 0)!;
    editor.commands.setTextSelection(at.from + 2);
    addChefNote(editor);
    const n = notesState(editor)!.notes[0]!;
    expect(editor.state.doc.textBetween(n.from, n.to)).toBe('brave');
    expect(n.quote).toBe('brave');
  });

  it('says when it was written, briefly', () => {
    const now = new Date('2026-11-12T12:00:00');
    expect(whenWritten('2026-11-12T11:59:40', now)).toBe('Just now');
    expect(whenWritten('2026-11-12T11:45:00', now)).toBe('15 min ago');
    expect(whenWritten('nonsense', now)).toBe('');
  });
});
