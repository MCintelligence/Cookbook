import { describe, expect, it } from 'vitest';
import { effectiveOff } from './rules';
import { styleIssues } from './style';

const notes = (text: string, rule: string) =>
  styleIssues(text)
    .filter((i) => i.rule === rule)
    .map((i) => text.slice(i.from, i.to));

describe('Sally’s notes from Word’s style list', () => {
  it('notes a split infinitive only when more than one word splits it', () => {
    expect(notes('I need to really quickly finish the cake.', 'split-infinitive')).toEqual(['to really quickly finish']);
    expect(notes('To boldly go is fine.', 'split-infinitive')).toEqual([]);
  });

  it('notes four prepositional phrases in a row, not three', () => {
    expect(notes('The bowl on the table in the kitchen of the house by the river was blue.', 'preposition-chain')).toHaveLength(1);
    expect(notes('She sat on the chair by the window in the kitchen.', 'preposition-chain')).toEqual([]);
  });

  it('notes piled-up marks but leaves a single ?!', () => {
    expect(notes('It was cold!!! What?!? She left?! Fine.', 'loud-punctuation')).toEqual(['!!!', '?!?']);
  });

  it('starts gendered words and And/But openers switched off, and leaves speech alone', () => {
    expect(effectiveOff([])).toEqual(expect.arrayContaining(['gendered-word', 'conjunction-start']));
    expect(notes('The chairman spoke to the firemen. “The chairman is late,” she said.', 'gendered-word')).toEqual(['chairman', 'firemen']);
    expect(notes('It rained. And then it stopped. But she stayed.', 'conjunction-start')).toEqual(['And', 'But']);
  });
});
