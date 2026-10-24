import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nspell from 'nspell';
import { checkSpelling, editDistance, nameIssues, rankSuggestions, words } from './check';

const load = (d: string) => nspell({ aff: readFileSync(`public/dictionaries/${d}.aff`), dic: readFileSync(`public/dictionaries/${d}.dic`) });
const us = load('en-US');
const gb = load('en-GB');
const names = ['Mama Lou', 'June', 'Earlene'];
us.add('Earlene');
const said = (text: string, found = checkSpelling(text, us, names)) => found.map((i) => [text.slice(i.from, i.to), i.rule]);

describe('spelling', () => {
  it('splits prose into words, skipping links, emails and numbers', () => {
    expect(words('She didn’t see www.example.com or me@x.io, only the 3rd well-to-do #tag.').map((w) => w.word)).toEqual([
      'She',
      'didn’t',
      'see',
      'or',
      'only',
      'the',
      'well-to-do',
    ]);
  });

  it('flags misspellings, not possessives, hyphenations, acronyms or names', () => {
    expect(said('June’s cornbread was recieved by the well-to-do NAACP and Earlene’s teh.')).toEqual([
      ['recieved', 'spelling'],
      ['teh', 'spelling'],
    ]);
  });

  it('accepts real words with a common prefix or suffix, and hyphenated words, but not typos', () => {
    expect(said('The untextured, textureless, texture-less bread was unbuttered and overbaked.')).toEqual([]);
    expect(said('The untexturred bread was unbutterred and reless.')).toEqual([
      ['untexturred', 'spelling'],
      ['unbutterred', 'spelling'],
      ['reless', 'spelling'],
    ]);
  });

  it('follows the dialect', () => {
    expect(said('The colour of the realised plan.', checkSpelling('The colour of the realised plan.', us, []))).toEqual([
      ['colour', 'spelling'],
      ['realised', 'spelling'],
    ]);
    expect(checkSpelling('The colour of the realised plan.', gb, [])).toEqual([]);
  });

  it('puts back a missing apostrophe, and catches “she dont” in one go', () => {
    const fixes = (text: string) => checkSpelling(text, us, []).map((i) => [text.slice(i.from, i.to), i.suggestions]);
    expect(fixes('She dont know. They wasnt. Dont go.')).toEqual([
      ['dont', ['doesn’t', 'don’t']],
      ['wasnt', ['wasn’t']],
      ['Dont', ['Don’t']],
    ]);
  });

  it('leaves words the writer ignored', () => {
    expect(checkSpelling('Teh end.', us, [], new Set(['Teh']))).toEqual([]);
  });
});

describe('suggestions', () => {
  it('puts swapped letters and ordinary words first', () => {
    expect(rankSuggestions('teh', us.suggest('teh'))[0]).toBe('the');
    expect(rankSuggestions('Teh', us.suggest('Teh'))[0]).toBe('The');
    expect(rankSuggestions('adn', us.suggest('adn'))[0]).toBe('and');
    expect(rankSuggestions('Thier', us.suggest('Thier'))[0]).toBe('Their');
    expect(rankSuggestions('recieve', us.suggest('recieve'))[0]).toBe('receive');
    expect(rankSuggestions('adn', us.suggest('adn'))).not.toContain('ADC');
  });
});

describe('story names', () => {
  it('measures edits, counting swapped letters once', () => {
    expect(editDistance('June', 'Juen')).toBe(1);
    expect(editDistance('Mamma Lou', 'Mama Lou')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('catches near misses of names made of real words', () => {
    const text = 'Mamma Lou came in. Mama Lou sat. mamma said lowercase is fine. Earleen waved. Jane waved too.';
    expect(said(text)).toEqual([
      ['Mamma Lou', 'name'],
      ['Earleen', 'name'],
    ]);
    expect(nameIssues(text, names, us).map((i) => i.suggestions)).toEqual([['Mama Lou'], ['Earlene']]);
  });

  it('only treats words a space apart as one name', () => {
    expect(said('Mamma. Lou was there.')).toEqual([]);
  });
});
