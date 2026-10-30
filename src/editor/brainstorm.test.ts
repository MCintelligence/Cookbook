// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { brainstormDecorations, emptyLineAt, insertBrainstorm } from './brainstorm';
import { BRAINSTORM_GROUPS, brainstormCardFor, fieldPlaceholder } from '../storage/brainstorm';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function make(markdown: string, kind: string | null = 'character') {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s, () => {}, kind), content: parseMarkdown(markdown) });
  editors.push(editor);
  return editor;
}
const md = (editor: Editor) => serializeMarkdown(editor.getJSON() as NodeJSON);
const at = (editor: Editor, pos: number) => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
const fire = BRAINSTORM_GROUPS.find((g) => g.id === 'world-on-fire')!;

describe('brainstorming cards', () => {
  it('puts a card in as a heading and a blank line, with the cursor ready to write', () => {
    const editor = make('');
    const line = emptyLineAt(editor, 'character');
    expect(line).toBe(0);
    expect(insertBrainstorm(editor, line!, [fire.cards.character[0]!])).toBe(true);
    editor.commands.insertContent('Trapped in the walk-in.');
    expect(md(editor)).toBe('## The Wildfire\n\nTrapped in the walk-in.\n');
  });

  it('adds all of World on Fire in order, and one undo takes them out', () => {
    const editor = make('');
    insertBrainstorm(editor, 0, fire.cards.character);
    expect(md(editor).match(/^## .+$/gm)).toEqual(['## The Wildfire', '## The Inferno', '## The Cinders', '## The Phoenix']);
    editor.commands.undo();
    expect(md(editor)).toBe('');
  });

  it('explains each card on its blank line, for the kind of page', () => {
    const editor = make('');
    insertBrainstorm(editor, 0, [fire.cards.character[3]!]);
    const dom = editor.view.dom.querySelector('p.bs-blank');
    expect(dom?.getAttribute('data-placeholder')).toBe(fire.cards.character[3]!.placeholder);
    expect(editor.view.dom.querySelectorAll('p.bs-heading')).toHaveLength(1);
    // The same card on a place page explains it for a place.
    const [, blank] = brainstormDecorations(editor.state.doc, 'setting').find();
    expect((blank as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-placeholder']).toBe(fire.cards.setting[3]!.placeholder);
  });

  it('still explains a card reopened before anything was written in it, though the file keeps no blank line', () => {
    const editor = make('');
    insertBrainstorm(editor, 0, fire.cards.character);
    const saved = md(editor);
    expect(saved).toBe('## The Wildfire\n\n## The Inferno\n\n## The Cinders\n\n## The Phoenix\n');
    const reopened = make(saved);
    expect([...reopened.view.dom.querySelectorAll('p.bs-hint')].map((p) => p.textContent)).toEqual(fire.cards.character.map((c) => c.placeholder));
    // Clicking an explanation makes the line to write on, under its own card.
    reopened.view.dom.querySelectorAll('p.bs-hint')[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    reopened.commands.insertContent('The oven door jams.');
    expect(md(reopened)).toBe('## The Wildfire\n\n## The Inferno\n\nThe oven door jams.\n\n## The Cinders\n\n## The Phoenix\n');
    expect(reopened.view.dom.querySelectorAll('p.bs-hint')).toHaveLength(3);
  });

  it('shows no explanation under a card that has writing in it', () => {
    const editor = make('## The Wildfire\n\nTrapped in the walk-in.\n');
    expect(editor.view.dom.querySelector('.bs-hint, .bs-blank')).toBeNull();
  });

  it('leaves scenes alone', () => {
    const editor = make('## The Phoenix\n\n', 'scene');
    expect(editor.view.dom.querySelector('.bs-blank, .bs-heading')).toBeNull();
  });

  it('offers the + only on an empty line that is not already a card’s', () => {
    const editor = make('## Who they are\n\nA cook.\n');
    // On the heading's text: no.
    at(editor, 2);
    expect(emptyLineAt(editor, 'character')).toBeNull();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.splitBlock();
    expect(emptyLineAt(editor, 'character')).not.toBeNull();
    // The blank line straight under a card is for writing in.
    insertBrainstorm(editor, emptyLineAt(editor, 'character')!, [fire.cards.character[0]!]);
    expect(emptyLineAt(editor, 'character')).toBeNull();
  });

  it('offers the + under a heading the writer made, which isn’t a card', () => {
    const editor = make('## Her kitchen\n\nx\n');
    const end = editor.state.doc.content.size - 1;
    editor.commands.deleteRange({ from: end - 1, to: end });
    at(editor, end - 1);
    expect(emptyLineAt(editor, 'character')).not.toBeNull();
  });

  it('matches cards and field hints by name, whatever the case', () => {
    expect(brainstormCardFor('character', '  the wildfire ')?.id).toBe('wildfire');
    expect(brainstormCardFor('setting', 'What it offers')?.id).toBe('offers');
    expect(brainstormCardFor('character', 'What it offers')).toBeNull();
    expect(fieldPlaceholder('setting', 'Threatens')).toBe('What makes it dangerous or hard to leave');
    expect(fieldPlaceholder('character', 'Favourite knife')).toBe('Field value');
  });
});
