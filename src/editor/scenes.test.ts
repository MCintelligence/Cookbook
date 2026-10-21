// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { appendScene, mergeNotes, noteIds, partitionNotes, renameNotes, splitAtBreak } from './scenes';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown: string) {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(markdown) });
  editors.push(editor);
  return editor;
}
const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as NodeJSON);

function breakPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.forEach((node, offset) => {
    if (found === -1 && node.type.name === 'sceneBreak') found = offset;
  });
  return found;
}

describe('split and merge', () => {
  it('splits at a scene break', () => {
    const editor = make('Supper.\n\n* * *\n\n::: letter\nDear June,\n:::\n\nAfter^[Late.] supper.');
    const after = splitAtBreak(editor, breakPos(editor));
    expect(md(editor)).toBe('Supper.\n');
    expect(after).toBe('::: letter\nDear June,\n:::\n\nAfter^[Late.] supper.\n');
    editor.commands.undo();
    expect(md(editor)).toContain('* * *');
  });

  it('keeps a paragraph to type in when the break was first', () => {
    const editor = make('* * *\n\nAll of it.');
    expect(splitAtBreak(editor, 0)).toBe('All of it.\n');
    expect(editor.state.doc.childCount).toBe(1);
    expect(md(editor)).toBe('');
  });

  it('refuses positions that are not a scene break', () => {
    const editor = make('Just words.');
    expect(splitAtBreak(editor, 0)).toBeNull();
  });

  it('merges the next scene in after a scene break', () => {
    const editor = make('Supper.');
    appendScene(editor, 'Dessert.\n\n- [ ] pie\n');
    expect(md(editor)).toBe('Supper.\n\n* * *\n\nDessert.\n\n- [ ] pie\n');
    editor.commands.undo();
    expect(md(editor)).toBe('Supper.\n');
  });

  it('moves notes with the text they belong to', () => {
    const moved = 'The [church]{.note #n2} burned.';
    expect(noteIds(moved)).toEqual(new Set(['n2']));
    expect(partitionNotes({ n1: 'Year?', n2: 'Which church?', n3: 'Scene note' }, moved)).toEqual({
      stay: { n1: 'Year?', n3: 'Scene note' },
      go: { n2: 'Which church?' },
    });
  });

  it('renumbers clashing notes when merging', () => {
    const merged = mergeNotes({ n1: 'Ours' }, '[a]{.note #n1}', { n1: 'Theirs', n2: 'Also theirs' }, '[b]{.note #n1} [c]{.note #n2}');
    expect(merged.notes).toEqual({ n1: 'Ours', n3: 'Theirs', n2: 'Also theirs' });
    expect(merged.text).toBe('[b]{.note #n3} [c]{.note #n2}\n');
    expect(renameNotes('plain', new Map())).toBe('plain');
  });
});
