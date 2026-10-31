// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { cookbookExtensions } from './extensions';
import { parseMarkdown } from './markdown';
import { docReading, docWords, footnoteTexts } from './docStats';
import { castIn, castOf, nameMatcher, nameMatcherOf, setNameMatcher } from './names';
import { footnotes } from './seasonings';
import { countWords } from '../storage/index';
import { readingGrade, textGrade } from '../proofread/style';
import { spokenWords } from '../ui/useTracked';

const STORY = [
  'June set the bowl down. “Not another word,” she said, and didn’t look up.^[Her mother’s bowl.]',
  '* flour\n* salt\n  * a pinch more',
  '| Day | Bread |\n| --- | --- |\n| Monday | rye |',
  '> The oven ticked as it cooled.',
  '***',
  'Ruth came in at six.^[Late again.] The Kitchen was quiet.',
].join('\n\n');

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));
const open = (md: string) => {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(md) });
  editors.push(editor);
  return editor;
};
const paragraphs = (doc: PMNode) => {
  const out: string[] = [];
  doc.descendants((n) => (n.isTextblock ? (out.push(n.textContent), false) : true));
  return out;
};

describe('counts that only redo what changed', () => {
  it('give the same answers as counting the whole Item', () => {
    const { state } = open(STORY);
    expect(docWords(state.doc)).toBe(countWords(state.doc.textBetween(0, state.doc.content.size, ' ')));
    expect(footnoteTexts(state.doc)).toEqual(footnotes(state.doc).map((f) => f.text));
    expect(readingGrade(docReading(state.doc))).toEqual(textGrade(paragraphs(state.doc)));
  });

  it('keep up with typing, and recount only the paragraph typed in', () => {
    const editor = open(STORY);
    const before = editor.state.doc;
    const words = docWords(before);
    editor.commands.setTextSelection(3);
    editor.commands.insertContent('very ');
    const after = editor.state.doc;
    expect(docWords(after)).toBe(words + 1);
    expect(docWords(after)).toBe(countWords(after.textBetween(0, after.content.size, ' ')));
    expect(readingGrade(docReading(after))).toEqual(textGrade(paragraphs(after)));
    // Every block but the first is the same object, so its count is reused.
    expect(after.child(0)).not.toBe(before.child(0));
    for (let i = 1; i < after.childCount; i++) expect(after.child(i)).toBe(before.child(i));
  });

  it('see a footnote change', () => {
    const editor = open(STORY);
    const pos = footnotes(editor.state.doc)[1]!.pos;
    editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'text', 'Late.'));
    expect(footnoteTexts(editor.state.doc)).toEqual(['Her mother’s bowl.', 'Late.']);
  });

  it('find the cast from the linked names already found', () => {
    const editor = open(STORY);
    const matcher = nameMatcher([
      { id: 'r', path: 'pantry/characters/Ruth.md', title: 'Ruth', kind: 'character', aka: [] },
      { id: 'j', path: 'pantry/characters/June.md', title: 'June', kind: 'character', aka: [] },
      { id: 'k', path: 'pantry/settings/The Kitchen.md', title: 'The Kitchen', kind: 'setting', aka: [] },
    ]);
    expect(castIn(editor.state)).toEqual([]);
    setNameMatcher(editor, matcher);
    expect(castIn(editor.state)).toEqual(castOf(editor.state.doc, nameMatcherOf(editor.state)));
    expect(castIn(editor.state).map((c) => c.id)).toEqual(['j', 'r', 'k']);
    // The same document gives the same list back, so a cursor move costs nothing.
    expect(castIn(editor.state)).toBe(castIn(editor.state));
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('Ruth and ');
    expect(castIn(editor.state).map((c) => c.id)).toEqual(['r', 'j', 'k']);
  });
});

describe('Daniel’s count', () => {
  it('counts words and the spoken ones line by line', () => {
    expect(spokenWords('June said, “Not another word.”\nNobody spoke.')).toEqual({ all: 7, spoken: 3 });
  });
});
