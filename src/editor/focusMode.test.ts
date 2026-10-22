import { describe, expect, it } from 'vitest';
import { sentenceAround } from './focusMode';

describe('focus mode', () => {
  const text = 'June burned the rice. Nobody said a word! “Pass the grits,” Lou said.';
  const at = (offset: number) => text.slice(...sentenceAround(text, offset));
  it('finds the sentence around the caret', () => {
    expect(at(3)).toBe('June burned the rice.');
    expect(at(21)).toBe('June burned the rice.');
    expect(at(25)).toBe('Nobody said a word!');
    expect(at(text.length)).toBe('“Pass the grits,” Lou said.');
  });
  it('treats a paragraph without a full stop as one sentence', () => {
    expect(sentenceAround('and then', 4)).toEqual([0, 8]);
  });
});
