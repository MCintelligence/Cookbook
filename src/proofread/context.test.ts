import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nspell from 'nspell';
import { rankSuggestions } from './check';
import { countText, emptyCounts, fitter, parseCounts, runs } from './context';

const us = nspell({ aff: readFileSync('public/dictionaries/en-US.aff'), dic: readFileSync('public/dictionaries/en-US.dic') });
const books = parseCounts(readFileSync('public/dictionaries/word-pairs.txt', 'utf8'));
const none = emptyCounts();

/** Sam's suggestions for the word in [brackets], in the order they fit the sentence. */
function suggest(sentence: string, book = none): string[] {
  const [before, word, after] = sentence.split(/\[|\]/) as [string, string, string];
  return rankSuggestions(word, us.suggest(word), 6, fitter({ before, after }, books, book));
}

describe('word pairs', () => {
  it('reads runs of words that a sentence end, dash or quote breaks', () => {
    expect(runs('The cat sat. “Shoo,” she said—and it went’s off\nhome')).toEqual([['the', 'cat', 'sat'], ['shoo'], ['she', 'said'], ['and', 'it', "went's", 'off'], ['home']]);
  });

  it('counts words and the pairs they make', () => {
    const c = countText(['The cat sat on the mat. The cat ran.']);
    expect(c.words.get('the')).toBe(3);
    expect(c.pairs.get('the cat')).toBe(2);
    expect(c.pairs.get('mat the')).toBeUndefined();
    expect(c.total).toBe(9);
  });

  it('reads the shipped file', () => {
    expect(books.words.get('the')).toBeGreaterThan(1_000_000);
    expect(books.pairs.get('of the')).toBeGreaterThan(books.pairs.get('of a')!);
    expect(books.total).toBeGreaterThan(books.words.get('the')!);
  });
});

describe('suggestions in context', () => {
  it('picks the word that fits between its neighbours', () => {
    expect(suggest('She sat on the [bech] by the river')[0]).toBe('bench');
    expect(suggest('He looked at the [clok] on the wall')[0]).toBe('clock');
    expect(suggest('She gave him a [kis] on the cheek')[0]).toBe('kiss');
    expect(suggest('The [wheather] was cold')[0]).toBe('weather');
    expect(suggest('Her [har] was long')[0]).toBe('hair');
  });

  it('still puts the closest spelling first when the words around say nothing', () => {
    expect(suggest('[teh]')[0]).toBe('the');
    expect(suggest('I went to the [stroe] to buy milk')[0]).toBe('store');
    expect(suggest('In the [midle] of the night')[0]).toBe('middle');
  });

  it('counts the writer’s own words for more', () => {
    // Out on the moor, "a beck" (a stream) is what this writer means.
    const book = countText(['They crossed the beck at dawn. The beck was high after the rain. He fished in the beck.']);
    expect(suggest('Next morning he fished in the [bech].')[0]).not.toBe('beck');
    expect(suggest('Next morning he fished in the [bech].', book)[0]).toBe('beck');
  });

  it('keeps the plain order with nothing to go on', () => {
    expect(rankSuggestions('teh', us.suggest('teh'), 6, fitter(undefined, none, none))[0]).toBe('the');
  });
});
