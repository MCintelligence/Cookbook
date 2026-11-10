import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyCounts, parseCounts } from './context';
import { lookalikes } from './lookalikes';

const books = parseCounts(readFileSync('public/dictionaries/word-pairs.txt', 'utf8'));
const found = (text: string) => lookalikes(text, [books, emptyCounts()]).map((i) => [text.slice(i.from, i.to), i.suggestions[0]]);

describe('look-alike words', () => {
  it('finds a right spelling of the wrong word from the words around it', () => {
    expect(found('I went form the house to the shop.')).toEqual([['form', 'from']]);
    expect(found('I wonder weather it will rain.')).toEqual([['weather', 'whether']]);
    expect(found('He could not breath in the smoke.')).toEqual([['breath', 'breathe']]);
    expect(found('They left they’re shoes at the door.')).toEqual([['they’re', 'their']]);
    expect(found('You’re coat is on the chair.')).toEqual([['You’re', 'Your']]);
    expect(found('He sat their for an hour.')).toEqual([['their', 'there']]);
  });

  it('leaves the right word alone, and names, and words at the end of a clause', () => {
    for (const text of [
      'They left their shoes at the door.',
      'They’re late again.',
      'You’re late.',
      'Who’s there?',
      'He took the form from the desk.',
      'It was quite late, and very quiet.',
      'I have to go too.',
      'The Peak District was wet.',
      'No, there were no tears.',
      'The weather was fine.',
      'He passed the window and walked past the shop.',
    ]) {
      expect(found(text), text).toEqual([]);
    }
  });

  it('needs the books’ word pairs', () => {
    expect(lookalikes('I went form the house.', [])).toEqual([]);
  });
});
