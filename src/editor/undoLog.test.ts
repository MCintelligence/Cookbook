// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { MAX_ENTRIES, UndoRecorder, parseUndoLog } from './undoLog';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown = '') {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  editor.commands.focus('end');
  return { editor, recorder: new UndoRecorder(editor) };
}

let clock = 1_000_000;
/** Types like a person: each character its own change, close together in time. */
function type(editor: Editor, text: string, gap = 50) {
  for (const ch of text) {
    clock += gap;
    const { view } = editor;
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(ch, from, to).setTime(clock));
  }
}
function pause() {
  clock += 5000;
}

const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as NodeJSON);

/** Saves the log as the app would, and opens the scene again from it. */
function reopen(text: string, logText: string) {
  const log = parseUndoLog(logText)!;
  const { editor, recorder } = make(serializeMarkdown(log.base));
  return { editor, recorder, restored: recorder.restore(log, text) };
}

describe('undo that survives closing', () => {
  it('undoes the same steps after reopening', () => {
    const { editor, recorder } = make('The kitchen.');
    type(editor, ' It smelled of cornbread.');
    pause();
    type(editor, ' Lou hummed.');
    const saved = JSON.stringify(recorder.toJSON());
    const text = md(editor);

    const again = reopen(text, saved);
    expect(again.restored).toBe(true);
    expect(md(again.editor)).toBe(text);
    expect(again.recorder.depth()).toBe(2);
    again.editor.commands.undo();
    expect(md(again.editor)).toBe('The kitchen. It smelled of cornbread.\n');
    again.editor.commands.undo();
    expect(md(again.editor)).toBe('The kitchen.\n');
    again.editor.commands.redo();
    expect(md(again.editor)).toBe('The kitchen. It smelled of cornbread.\n');
  });

  it('keeps the history when the scene ends with a space', () => {
    const { editor, recorder } = make('The kitchen.');
    type(editor, ' It smelled of cornbread. ');
    const text = md(editor);
    const again = reopen(text, JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(true);
    again.editor.commands.undo();
    expect(md(again.editor)).toBe('The kitchen.\n');
  });

  it('keeps the history when a line in the middle ends with spaces', () => {
    const { editor, recorder } = make('First line.');
    type(editor, '  ');
    editor.commands.enter();
    type(editor, 'Second line.');
    const again = reopen(md(editor), JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(true);
  });

  it('keeps undos and redos made before closing', () => {
    const { editor, recorder } = make('Pie.');
    type(editor, ' Peach.');
    pause();
    type(editor, ' Cobbler.');
    editor.commands.undo();
    pause();
    const saved = JSON.stringify(recorder.toJSON());
    const again = reopen(md(editor), saved);
    expect(again.restored).toBe(true);
    expect(md(again.editor)).toBe('Pie. Peach.\n');
    again.editor.commands.redo();
    expect(md(again.editor)).toBe('Pie. Peach. Cobbler.\n');
  });

  it('logs styles, scene breaks and footnotes too', () => {
    const { editor, recorder } = make('Plain words');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleMark('charStyle', { style: 'strong' });
    pause();
    editor.commands.focus('end');
    editor.commands.insertContent({ type: 'footnote', attrs: { text: 'A note.' } });
    const text = md(editor);
    const again = reopen(text, JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(true);
    expect(md(again.editor)).toBe(text);
    again.editor.commands.undo();
    again.editor.commands.undo();
    expect(md(again.editor)).toBe('Plain words\n');
  });

  it('keeps typing shortcuts as their own undo step', () => {
    const { editor, recorder } = make('');
    const typeShortcut = (text: string) => {
      for (const ch of text) {
        const { view } = editor;
        const { from, to } = view.state.selection;
        const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    };
    typeShortcut('Supper.');
    editor.commands.enter();
    typeShortcut('After **dinner** came pie.');
    const depth = recorder.depth();
    expect(depth).toBeGreaterThan(1);
    const again = reopen(md(editor), JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(true);
    expect(again.recorder.depth()).toBe(depth);
  });

  it('starts fresh when the file was changed somewhere else', () => {
    const { editor, recorder } = make('Pie.');
    type(editor, ' Peach.');
    const again = reopen('Edited in another app.\n', JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(false);
    expect(md(again.editor)).toBe('Edited in another app.\n');
    expect(again.recorder.depth()).toBe(0);
    expect(again.recorder.toJSON().entries).toEqual([]);
  });

  it('keeps only the most recent changes', () => {
    const { editor, recorder } = make('');
    type(editor, 'x'.repeat(MAX_ENTRIES + 5), 1000);
    const text = md(editor);
    const again = reopen(text, JSON.stringify(recorder.toJSON()));
    expect(again.restored).toBe(true);
    const log = again.recorder.toJSON();
    expect(log.entries).toHaveLength(MAX_ENTRIES);
    expect(serializeMarkdown(log.base)).toBe('xxxxx\n');
  });

  it('replays off screen and shows the result once', () => {
    const { editor, recorder } = make('The kitchen.');
    type(editor, ' It smelled of cornbread.');
    pause();
    type(editor, ' Lou hummed.');
    const text = md(editor);
    const log = parseUndoLog(JSON.stringify(recorder.toJSON()))!;
    const again = make(serializeMarkdown(log.base));
    let updates = 0;
    again.editor.on('transaction', () => updates++);
    expect(again.recorder.restore(log, text)).toBe(true);
    expect(updates).toBe(1);
    expect(md(again.editor)).toBe(text);
    expect(again.recorder.depth()).toBe(2);
  });

  it('ignores a damaged log file', () => {
    expect(parseUndoLog('{not json')).toBeNull();
    expect(parseUndoLog('{"version":2}')).toBeNull();
  });
});
