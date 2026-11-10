import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nspell from 'nspell';
import { checkSpelling, editDistance, isNameLike, nameIssues, rankSuggestions, spellingIssues, words } from './check';
import { supplementEntries } from './supplement';

const load = (d: string) => nspell({ aff: readFileSync(`public/dictionaries/${d}.aff`), dic: readFileSync(`public/dictionaries/${d}.dic`) });
const us = load('en-US');
const gb = load('en-GB');
const names = ['Mama Lou', 'June', 'Earlene'];
us.add('Earlene');
const said = (text: string, found = checkSpelling(text, us, names)) => found.map((i) => [text.slice(i.from, i.to), i.rule]);

const plus = load('en-US');
for (const [word, model] of supplementEntries()) plus.add(word, model);
const flagged = (text: string) => spellingIssues(text, plus).map((i) => text.slice(i.from, i.to));

describe('Sam’s wider dictionary', () => {
  it('takes accented spellings when the plain letters are right', () => {
    expect(flagged('The naïve fiancée met her protégé at the café, déjà vu, and ordered crème brûlée.')).toEqual([]);
    expect(flagged('The cafféé was naïïve.')).toEqual(['cafféé', 'naïïve']);
  });

  it('takes letters held down for effect, but not a stretched typo', () => {
    expect(flagged('“Nooo,” she said. “Sooo good. Aaargh! Hmmmm. Yesss.”')).toEqual([]);
    expect(flagged('“Brekkkfast is teeeh,” he said.')).toEqual(['Brekkkfast', 'teeeh']);
  });

  it('knows the words of the kitchen, the phone and the room', () => {
    expect(flagged('She livestreamed the sous-vide brisket, unfollowed a vlogger, and ate kimchi ramen with gochujang and tahini.')).toEqual([]);
    expect(flagged('There’re three podcasters and an influencer on the Wi-Fi. Ugh. Shh!')).toEqual([]);
    expect(flagged('She livestreemed the kimchee.')).toEqual(['livestreemed', 'kimchee']);
  });
});

describe('likely names', () => {
  it('marks a capital in mid-sentence, not at the start or in capitals', () => {
    const text = 'Then Brannoch smiled. Ysolde did not. “Hush,” Ysolde said, and NASA laughed. Wrnog.';
    const found = spellingIssues(text, plus).map((i) => [text.slice(i.from, i.to), !!i.name]);
    expect(found).toEqual([
      ['Brannoch', true],
      ['Ysolde', false],
      ['Ysolde', true],
      ['Wrnog', false],
    ]);
    expect(isNameLike('He met McAllister', 7, 'McAllister')).toBe(true);
    expect(isNameLike('(Mcallister', 1, 'Mcallister')).toBe(false);
  });
});

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
    expect(fixes('The womens coats and the childrens toys.')).toEqual([
      ['womens', ['women’s']],
      ['childrens', ['children’s']],
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
