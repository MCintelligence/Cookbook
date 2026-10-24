import { describe, expect, it } from 'vitest';
import { type Issue } from './check';
import { fixText, gradeRemark, ownerOf, remark, rulesOff, talkRemark } from './remarks';
import { unclosedQuote } from './style';

const issue = (kind: Issue['kind'], rule: string, message = ''): Issue => ({ from: 0, to: 1, kind, rule, message, suggestions: [] });

describe('seasonings', () => {
  it('hands each issue to the character who looks after it', () => {
    expect(ownerOf(issue('spelling', 'spelling'))).toBe('sam');
    expect(ownerOf(issue('style', 'hard-sentence'))).toBe('sally');
    expect(ownerOf(issue('style', 'adverb'))).toBe('pete');
    expect(ownerOf(issue('grammar', 'grammar'))).toBe('pete');
  });

  it('switches off the checks of characters nobody picked', () => {
    const off = rulesOff(['pete']);
    expect(off).toContain('spelling');
    expect(off).toContain('hard-sentence');
    expect(off).not.toContain('grammar');
    expect(rulesOff(['sam', 'pete', 'daniel', 'sally'])).toEqual([]);
  });

  it('says the same thing each time for the same words', () => {
    const a = remark(issue('spelling', 'spelling'), 'recieve');
    expect(remark(issue('spelling', 'spelling'), 'recieve')).toBe(a);
    expect(a).toContain('recieve');
    expect(remark(issue('style', 'passive'), 'was eaten')).toMatch(/^Passive voice!/);
    expect(remark(issue('grammar', 'grammar', 'Use “an” here.'), 'a')).toBe('Grammar! Use “an” here.');
  });

  it('remarks on grade and talk', () => {
    expect(gradeRemark(5)).toContain('Grade 5');
    expect(gradeRemark(12)).toContain('Shorter sentences');
    expect(talkRemark(0)).toMatch(/Not a word/);
    expect(talkRemark(80)).toMatch(/All talk/);
  });

  it('describes fixes that remove or space things', () => {
    expect(fixText(' very', '')).toBe('cut “very”');
    expect(fixText('  ', ' ')).toBe('one space');
    expect(fixText('teh', 'the')).toBe('the');
  });
});

describe('unclosed quote', () => {
  it('offers to close a quote left open', () => {
    const text = 'She said, “Come in now';
    const found = unclosedQuote(text)!;
    expect(text.slice(found.from, found.to)).toBe('now');
    expect(found.suggestions).toEqual(['now”']);
  });

  it('leaves closed and straight quotes alone', () => {
    expect(unclosedQuote('“Come in,” she said.')).toBeNull();
    expect(unclosedQuote('A 6" pan')).toBeNull();
  });
});
