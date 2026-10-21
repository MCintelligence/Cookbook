import { describe, expect, it } from 'vitest';
import { findInText } from './find';

describe('find', () => {
  const text = 'Lou asked Louise about Lou’s porch. lou laughed.';
  it('ignores case unless asked', () => {
    expect(findInText(text, 'lou', { matchCase: false, wholeWord: false })).toHaveLength(4);
    expect(findInText(text, 'Lou', { matchCase: true, wholeWord: false })).toHaveLength(3);
  });
  it('matches whole words, including before an apostrophe', () => {
    expect(findInText(text, 'lou', { matchCase: false, wholeWord: true })).toEqual([
      [0, 3],
      [23, 26],
      [36, 39],
    ]);
  });
  it('treats the query as plain text', () => {
    expect(findInText('a.b a+b (c)', '(c)', { matchCase: false, wholeWord: false })).toEqual([[8, 11]]);
    expect(findInText('abc', '', { matchCase: false, wholeWord: false })).toEqual([]);
  });
});
