// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, plainText, serializeMarkdown, type NodeJSON } from './markdown';
import { docWords } from './docStats';
import { UNTRACKED, acceptedJSON, changesIn, goToChange, hasChanges, setSuggesting, settleAll, settleAt } from './trackChanges';
import { UndoRecorder } from './undoLog';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  setSuggesting(false);
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
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

/** Backspace (or Delete, forward) over one letter, as the browser does it. */
function backspace(editor: Editor, forward = false) {
  const { view } = editor;
  const { from, to, empty } = view.state.selection;
  if (!empty) view.dispatch(view.state.tr.delete(from, to));
  else if (forward) view.dispatch(view.state.tr.delete(from, from + 1));
  else view.dispatch(view.state.tr.delete(from - 1, from));
}

function press(editor: Editor, key: string) {
  const { view } = editor;
  view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key, bubbles: true })));
}

function select(editor: Editor, from: number, to = from) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
}

const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as NodeJSON);

describe('Suggest changes off', () => {
  it('edits go straight in', () => {
    const editor = make('Salt the soup.');
    type(editor, ' Stir.');
    backspace(editor);
    expect(md(editor)).toBe('Salt the soup. Stir\n');
    expect(hasChanges(editor.state.doc)).toBe(false);
  });
});

describe('Suggest changes on', () => {
  it('marks typing as an insertion', () => {
    setSuggesting(true);
    const editor = make('Salt the soup.');
    type(editor, ' Stir it.');
    expect(md(editor)).toBe('Salt the soup.[ Stir it.]{.ins}\n');
  });

  it('strikes through what Backspace takes out, and walks back over it', () => {
    setSuggesting(true);
    const editor = make('Salt the soup.');
    backspace(editor);
    backspace(editor);
    expect(md(editor)).toBe('Salt the sou[p.]{.del}\n');
    // The cursor is before the struck letters, so typing goes in front of them.
    type(editor, 'x');
    expect(md(editor)).toBe('Salt the sou[x]{.ins}[p.]{.del}\n');
  });

  it('Delete strikes forward and leaves the cursor after', () => {
    setSuggesting(true);
    const editor = make('Salt the soup.');
    select(editor, 1);
    backspace(editor, true);
    backspace(editor, true);
    expect(md(editor)).toBe('[Sa]{.del}lt the soup.\n');
    expect(editor.state.selection.from).toBe(3);
  });

  it('typing over a selection keeps the old words, struck, before the new', () => {
    setSuggesting(true);
    const editor = make('Salt the soup.');
    // "soup"
    select(editor, 10, 14);
    type(editor, 'stew');
    expect(md(editor)).toBe('Salt the [soup]{.del}[stew]{.ins}.\n');
    expect(changesIn(editor.state.doc)).toHaveLength(1);
  });

  it('deleting a suggestion of your own just removes it', () => {
    setSuggesting(true);
    const editor = make('Salt.');
    type(editor, ' Stir');
    backspace(editor);
    backspace(editor);
    expect(md(editor)).toBe('Salt.[ St]{.ins}\n');
  });

  it('keeps a struck space through a save and a reload', () => {
    setSuggesting(true);
    const editor = make('one two three');
    select(editor, 4, 8);
    backspace(editor);
    const saved = md(editor);
    expect(saved).toBe('one[ two]{.del} three\n');
    expect(serializeMarkdown(parseMarkdown(saved))).toBe(saved);
  });

  it('lets Enter and Backspace split and join paragraphs as usual', () => {
    setSuggesting(true);
    const editor = make('First.\n\nSecond.');
    // Start of "Second."
    select(editor, 9);
    press(editor, 'Backspace');
    expect(md(editor)).toBe('First.Second.\n');
    press(editor, 'Enter');
    expect(md(editor)).toBe('First.\n\nSecond.\n');
  });

  it('one undo takes back the change and its marks together', () => {
    setSuggesting(true);
    const editor = make('Salt.');
    type(editor, '!');
    undo(editor.state, editor.view.dispatch);
    expect(md(editor)).toBe('Salt.\n');
  });

  it('is not applied to changes marked as untracked', () => {
    setSuggesting(true);
    const editor = make('Salt.');
    editor.chain().setMeta(UNTRACKED, true).insertContentAt(1, 'Sea ').run();
    expect(md(editor)).toBe('Sea Salt.\n');
  });
});

describe('accepting and rejecting', () => {
  const doc = 'Salt the [soup]{.del}[stew]{.ins}. [Stir it.]{.ins}\n';

  it('accepts the change at the cursor', () => {
    const editor = make(doc);
    select(editor, 12);
    expect(settleAt(editor.view, true)).toBe(true);
    expect(md(editor)).toBe('Salt the stew. [Stir it.]{.ins}\n');
  });

  it('rejects the change at the cursor', () => {
    const editor = make(doc);
    select(editor, 12);
    settleAt(editor.view, false);
    expect(md(editor)).toBe('Salt the soup. [Stir it.]{.ins}\n');
  });

  it('says so when the cursor is in no change', () => {
    const editor = make(doc);
    select(editor, 2);
    expect(settleAt(editor.view, true)).toBe(false);
  });

  it('accepts and rejects every change on the page', () => {
    const accepted = make(doc);
    expect(settleAll(accepted.view, true)).toBe(2);
    expect(md(accepted)).toBe('Salt the stew. Stir it.\n');
    const rejected = make(doc);
    settleAll(rejected.view, false);
    expect(md(rejected)).toBe('Salt the soup. \n');
  });

  it('takes out a paragraph that was all suggestion', () => {
    const editor = make('Keep.\n\n[A whole new paragraph.]{.ins}\n\nEnd.');
    settleAll(editor.view, false);
    expect(md(editor)).toBe('Keep.\n\nEnd.\n');
  });

  it('is never tracked itself, even while suggesting', () => {
    setSuggesting(true);
    const editor = make(doc);
    settleAll(editor.view, true);
    expect(md(editor)).toBe('Salt the stew. Stir it.\n');
  });

  it('goes from change to change', () => {
    const editor = make(doc);
    select(editor, 1);
    goToChange(editor.view, 1);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('soupstew');
    goToChange(editor.view, 1);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('Stir it.');
  });
});

describe('counts and exports', () => {
  it('leaves text suggested for deletion out of word counts', () => {
    const editor = make('one [two three]{.del} four [five]{.ins}');
    expect(docWords(editor.state.doc)).toBe(3);
    expect(plainText('one [two three]{.del} four')).toBe('one  four');
  });

  it('exports the text as if every change were accepted', () => {
    const json = acceptedJSON(parseMarkdown('Salt the [soup]{.del}[**stew**]{.ins}.'));
    expect(serializeMarkdown(json)).toBe('Salt the **stew**.\n');
  });
});

describe('the undo log', () => {
  it('replays suggestions without marking them twice', () => {
    setSuggesting(true);
    const editor = make('Salt the soup.');
    const recorder = new UndoRecorder(editor);
    select(editor, 10, 14);
    type(editor, 'stew');
    const log = recorder.toJSON();
    const body = md(editor);
    recorder.destroy();

    // Whether Suggest changes is on when the Item opens again makes no difference.
    for (const on of [true, false]) {
      setSuggesting(on);
      const again = make('');
      const replay = new UndoRecorder(again);
      expect(replay.restore(log, body)).toBe(true);
      expect(md(again)).toBe(body);
      undo(again.state, again.view.dispatch);
      expect(md(again)).toBe('Salt the soup.\n');
      replay.destroy();
    }
  });
});

describe('reading the page', () => {
  it('leaves struck text out of what the proofreader and Search read', async () => {
    const { textMap } = await import('./textmap');
    const editor = make('[Try]{.del}[Test]{.ins} it.');
    const block = editor.state.doc.firstChild!;
    const map = textMap(block, 0);
    expect(map.text).toBe('Test it.');
    expect(map.positions[0]).toBe(4);
  });
});
