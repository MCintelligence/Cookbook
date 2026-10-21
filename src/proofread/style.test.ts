import { describe, expect, it } from 'vitest';
import { gradeLevel, sentences, styleIssues, textGrade } from './style';

const said = (text: string, names: string[] = []) => styleIssues(text, names).map((i) => [i.rule, text.slice(i.from, i.to), ...i.suggestions]);

describe('style', () => {
  it('splits sentences, keeping closing quotes', () => {
    const text = '“Come in!” she said. He did… Then nothing';
    expect(sentences(text).map((s) => text.slice(s.from, s.to))).toEqual(['“Come in!”', 'she said.', 'He did…', 'Then nothing']);
  });

  it('flags adverbs, but not in speech, names or words that only look like them', () => {
    expect(said('She quickly ate the jelly with her family. “Honestly,” Billy said.', ['Billy'])).toEqual([['adverb', 'quickly']]);
  });

  it('offers simpler words and shorter phrases, keeping capitals', () => {
    expect(said('Utilize the pan in order to fry it. Each and every egg was a free gift.')).toEqual([
      ['simpler-word', 'Utilize', 'Use'],
      ['simpler-word', 'in order to', 'to'],
      ['redundancy', 'Each and every', 'Each'],
      ['redundancy', 'free gift', 'gift'],
    ]);
  });

  it('spots the passive voice but not common adjectives', () => {
    expect(said('The cake was eaten. The pie was quietly baked. She was tired.').map((x) => x.slice(0, 2))).toEqual([
      ['passive', 'was eaten'],
      ['passive', 'was quietly baked'],
    ]);
  });

  it('flags crutch words outside speech, and clichés', () => {
    expect(said('He just sat there. “I just can’t,” she said. It was a piece of cake.').map((x) => x.slice(0, 2))).toEqual([
      ['crutch-word', 'just'],
      ['cliche', 'piece of cake'],
    ]);
  });

  it('marks hard, very hard and sticky sentences', () => {
    const hard = 'The extraordinarily complicated recipe demanded considerable patience, meticulous preparation and remarkable concentration from everybody involved in the kitchen.';
    expect(said(hard).map((x) => x[0])).toContain('very-hard-sentence');
    const medium = 'The cooks in the kitchen prepared the gravy and biscuits carefully while everyone waited patiently at the table outside.';
    expect(said(medium).map((x) => x[0])).toContain('hard-sentence');
    const sticky = 'It was the end of the day and it was time for all of us to go to the house.';
    expect(said(sticky).map((x) => x[0])).toEqual(['sticky-sentence']);
    expect(said('She cooked. He ate. They laughed.')).toEqual([]);
  });

  it('hears echoes, but not names or glue words', () => {
    expect(said('The gravy was thick. Mama Lou stirred the gravy. Mama Lou smiled.', ['Mama Lou']).map((x) => x.slice(0, 2))).toEqual([['echo', 'gravy']]);
  });

  it('works out the grade level', () => {
    expect(gradeLevel(0, 0, 0)).toBe(0);
    expect(textGrade(['She cooked. He ate. They laughed.']).grade).toBeLessThan(3);
    expect(textGrade(['The extraordinarily complicated recipe demanded considerable patience and meticulous preparation.']).grade).toBeGreaterThan(12);
  });
});
