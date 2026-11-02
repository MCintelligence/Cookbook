// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, plainText, serializeMarkdown, type NodeJSON } from './markdown';
import { docWords } from './docStats';
import { UNTRACKED, acceptedJSON, changesIn, goToChange, hasChanges, hasChangesJSON, setSuggesting, settleAll, settleAt, settledJSON } from './trackChanges';
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

  it('marks a new paragraph as a suggested break', () => {
    setSuggesting(true);
    const editor = make('First. Second.');
    // Before "Second."
    select(editor, 8);
    press(editor, 'Enter');
    expect(md(editor)).toBe('First. \n\n::: {change=ins}\nSecond.\n:::\n');
    expect(changesIn(editor.state.doc)).toHaveLength(1);
  });

  it('keeps joined paragraphs apart, with the break struck', () => {
    setSuggesting(true);
    const editor = make('First.\n\nSecond.');
    // Start of "Second."
    select(editor, 9);
    press(editor, 'Backspace');
    expect(md(editor)).toBe('First.\n\n::: {change=del}\nSecond.\n:::\n');
    // The cursor is at the end of "First.", so the next Backspace strikes its full stop.
    expect(editor.state.selection.from).toBe(7);
    backspace(editor);
    expect(md(editor)).toBe('First[.]{.del}\n\n::: {change=del}\nSecond.\n:::\n');
  });

  it('Delete at the end of a paragraph strikes the break after it', () => {
    setSuggesting(true);
    const editor = make('First.\n\nSecond.');
    select(editor, 7);
    press(editor, 'Delete');
    expect(md(editor)).toBe('First.\n\n::: {change=del}\nSecond.\n:::\n');
  });

  it('joining back a paragraph you split yourself just joins it', () => {
    setSuggesting(true);
    const editor = make('First. Second.');
    select(editor, 8);
    press(editor, 'Enter');
    press(editor, 'Backspace');
    expect(md(editor)).toBe('First. Second.\n');
    expect(hasChanges(editor.state.doc)).toBe(false);
  });

  it('deleting across two paragraphs strikes the words and the break', () => {
    setSuggesting(true);
    const editor = make('First.\n\nSecond.');
    // "st." and "Sec"
    select(editor, 4, 12);
    backspace(editor);
    expect(md(editor)).toBe('Fir[st.]{.del}\n\n::: {change=del}\n[Sec]{.del}ond.\n:::\n');
    const accepted = make(md(editor));
    settleAll(accepted.view, true);
    expect(md(accepted)).toBe('Firond.\n');
    const rejected = make(md(editor));
    settleAll(rejected.view, false);
    expect(md(rejected)).toBe('First.\n\nSecond.\n');
  });

  it('a new paragraph typed in comes out whole when rejected', () => {
    setSuggesting(true);
    const editor = make('First.');
    press(editor, 'Enter');
    type(editor, 'More.');
    expect(md(editor)).toBe('First.\n\n::: {change=ins}\n[More.]{.ins}\n:::\n');
    const saved = md(editor);
    expect(serializeMarkdown(parseMarkdown(saved))).toBe(saved);
    const rejected = make(saved);
    settleAll(rejected.view, false);
    expect(md(rejected)).toBe('First.\n');
    const accepted = make(saved);
    settleAll(accepted.view, true);
    expect(md(accepted)).toBe('First.\n\nMore.\n');
  });

  it('marks bold and italic as a formatting change, remembering the old look', () => {
    setSuggesting(true);
    const editor = make('Salt the *soup*.');
    select(editor, 10, 14);
    editor.commands.toggleMark('bold');
    expect(md(editor)).toBe('Salt the [***soup***]{.fmt was="*i"}.\n');
    // Taking the bold off again leaves nothing to review.
    editor.commands.toggleMark('bold');
    expect(md(editor)).toBe('Salt the *soup*.\n');
    expect(hasChanges(editor.state.doc)).toBe(false);
  });

  it('accepts and rejects a formatting change', () => {
    const doc = 'Salt the [**soup**]{.fmt}.';
    const accepted = make(doc);
    expect(settleAll(accepted.view, true)).toBe(1);
    expect(md(accepted)).toBe('Salt the **soup**.\n');
    const rejected = make(doc);
    settleAll(rejected.view, false);
    expect(md(rejected)).toBe('Salt the soup.\n');
    const back = make('Salt the [**soup**]{.fmt was="*i"}.');
    settleAll(back.view, false);
    expect(md(back)).toBe('Salt the *soup*.\n');
  });

  it('formatting your own new words is not a change of its own', () => {
    setSuggesting(true);
    const editor = make('Salt.');
    type(editor, ' Stir');
    select(editor, 6, 11);
    editor.commands.toggleMark('italic');
    expect(md(editor)).toBe('Salt.[ *Stir*]{.ins}\n');
  });

  it('marks a new paragraph style and puts the old one back on reject', () => {
    setSuggesting(true);
    const editor = make('A title');
    select(editor, 2);
    editor.commands.updateAttributes('paragraph', { style: 'chapter-title' });
    const saved = md(editor);
    expect(saved).toBe('::: {.chapter-title was="body"}\nA title\n:::\n');
    expect(serializeMarkdown(parseMarkdown(saved))).toBe(saved);
    const rejected = make(saved);
    settleAll(rejected.view, false);
    expect(md(rejected)).toBe('A title\n');
    const accepted = make(saved);
    settleAll(accepted.view, true);
    expect(md(accepted)).toBe('# A title\n');
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

  it('settles breaks, formatting and styles without an editor, the same as on the page', () => {
    const doc = 'Fir[st.]{.del}\n\n::: {.chapter-title change=del was="body"}\n[Sec]{.del}ond [**now**]{.fmt}.\n:::\n\n::: {change=ins}\n[More.]{.ins}\n:::';
    for (const accept of [true, false]) {
      const editor = make(doc);
      settleAll(editor.view, accept);
      expect(serializeMarkdown(settledJSON(parseMarkdown(doc), accept))).toBe(md(editor));
    }
    expect(hasChangesJSON(parseMarkdown(doc))).toBe(true);
    expect(hasChangesJSON(settledJSON(parseMarkdown(doc), true))).toBe(false);
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
