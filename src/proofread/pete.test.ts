import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nspell from 'nspell';
import { type Issue } from './check';
import { emptyCounts } from './context';
import { combine, peteIssues } from './pete';

const us = nspell({ aff: readFileSync('public/dictionaries/en-US.aff'), dic: readFileSync('public/dictionaries/en-US.dic') });
const isWord = (w: string) => us.correct(w);
const said = (text: string) => peteIssues(text, isWord).map((i) => [text.slice(i.from, i.to), i.suggestions[0]]);

describe('Peppery Pete', () => {
  it('finds the subject past "of …", ", along with …," and "each of"', () => {
    expect(said('The list of ingredients are on the fridge.')).toEqual([['are', 'is']]);
    expect(said('The recipe, along with the notes, were lost.')).toEqual([['were', 'was']]);
    expect(said('Each of the cooks have their own knife.')).toEqual([['have', 'has']]);
    expect(said('Neither the cook nor the waiters was ready.')).toEqual([['was', 'were']]);
    expect(said('The children was hungry.')).toEqual([['was', 'were']]);
    expect(said('The dogs runs across the yard.')).toEqual([['runs', 'run']]);
  });

  it('checks pronouns anywhere in the sentence, and "there’s three"', () => {
    expect(said('He went to the market, and they was happy to see him.')).toEqual([['was', 'were']]);
    expect(said('Everyone came, but nobody have a bowl.')).toEqual([['have', 'has']]);
    expect(said('There’s three eggs left.')).toEqual([['There’s', 'There are']]);
  });

  it('catches mixed-up words, I and me, and wrong verb forms', () => {
    expect(said('Your going to love this.')).toEqual([['Your', 'You’re']]);
    expect(said('Less people came than last year.')).toEqual([['Less', 'Fewer']]);
    expect(said('Don’t loose the key.')).toEqual([['loose', 'lose']]);
    expect(said('Me and him went to the store.')).toEqual([['Me and him', 'He and I']]);
    expect(said('Between you and I, the soup is cold.')).toEqual([['I', 'me']]);
    expect(said('I seen him yesterday.')).toEqual([['seen', 'saw']]);
    expect(said('She lay the book on the table.')).toEqual([['lay', 'laid']]);
    expect(said('He asked where are you going?')).toEqual([['where are you going?', 'where you are going.']]);
  });

  it('leaves good English alone', () => {
    for (const text of [
      'If he were here, he would know what to do.',
      'I wish she were coming with us.',
      'He looked as if he were about to cry.',
      'Each of them has a knife.',
      'Neither of them was hungry.',
      'The dogs’ bowls were empty.',
      'Your going away hurt me.',
      'Less sugar makes a better pie, but no less than a cup.',
      'The kids, along with their mother, were waiting.',
      'The team are out on the field.',
      'Me and him, we go back a long way.',
      'She lay down on the bed.',
      'He asked where we were going.',
      'The onions in the pan were starting to burn.',
      'One of the jars was cracked.',
      'The bread, like the cakes, was gone by noon.',
      'The smell of onions was everywhere.',
      'Her sisters walk to church every Sunday.',
      'The pots sat on the stove all night.',
    ]) {
      expect(said(text), text).toEqual([]);
    }
  });

  it('leaves speech alone, since that is how people talk', () => {
    expect(said('“We was there,” Ruth said.')).toEqual([]);
  });

  it('lets the books overrule a subject that looks plural', () => {
    const books = emptyCounts();
    books.pairs.set('sweets was', 50);
    books.pairs.set('sweets were', 10);
    expect(peteIssues('The sweets was gone.', isWord)).toHaveLength(1);
    expect(peteIssues('The sweets was gone.', isWord, [books])).toEqual([]);
  });

  it('wins over Harper on the same words, and style gives way to both', () => {
    const at = (from: number, to: number, kind: Issue['kind'], rule: string): Issue => ({ from, to, kind, rule, message: '', suggestions: [] });
    const all = combine([], [at(0, 7, 'grammar', 'SentenceCapitalization')], [], [at(0, 7, 'grammar', 'stray-capitals'), at(0, 7, 'style', 'adverb')], () => false);
    expect(all.map((i) => i.rule)).toEqual(['stray-capitals']);
  });
});
