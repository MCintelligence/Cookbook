import { readFileSync } from 'node:fs';
import nspell from 'nspell';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCounts } from '../context';
import { coreOnly } from '../parse';
import { supplementEntries } from '../supplement';
import { isNoun, partsOf, readVerb, regularisedPlural, singular, useDictionary } from './lexicon';

const counts = [parseCounts(readFileSync('public/dictionaries/word-pairs.txt', 'utf8'))];

beforeAll(() => {
  const speller = nspell({ aff: readFileSync('public/dictionaries/en-US.aff'), dic: readFileSync('public/dictionaries/en-US.dic') });
  for (const [word, model] of supplementEntries()) speller.add(word, model);
  useDictionary(readFileSync('public/dictionaries/en-US.dic', 'utf8'), (w) => speller.correct(w));
});

/** The core's underlines in a sentence, as "rule:words→fix". */
const found = (text: string) => coreOnly(text, counts).map((i) => `${i.rule}:${text.slice(i.from, i.to)}→${i.suggestions[0] ?? ''}`);
const fixes = (text: string) => coreOnly(text, counts).map((i) => i.suggestions[0]);

describe('the lexicon', () => {
  it('reads verb forms from the dictionary and the irregular list', () => {
    expect([...readVerb('went')!.forms]).toEqual(['past']);
    expect(readVerb('went')!.base).toBe('go');
    expect(readVerb('exposed')!.base).toBe('expose');
    expect(readVerb('stopping')!.base).toBe('stop');
    expect(readVerb('cut')!.forms.has('participle')).toBe(true);
    // "wound" is "wind" in the past and a verb of its own.
    expect(readVerb('wound')!.forms.has('base')).toBe(true);
    expect(readVerb('me')).toBeNull();
    expect(partsOf('eat')).toMatchObject({ past: 'ate', participle: 'eaten', ing: 'eating' });
    expect(partsOf('stop').past).toBe('stopped');
  });

  it('knows nouns and their plurals', () => {
    expect(isNoun('beauty')).toBe(true);
    expect(isNoun('angry')).toBe(false);
    expect(singular('knives')).toBe('knife');
    expect(singular('boxes')).toBe('box');
    expect(regularisedPlural('knifes')).toBe('knives');
    expect(regularisedPlural('mouses')).toBe('mice');
    expect(regularisedPlural('sheeps')).toBe('sheep');
    expect(regularisedPlural('books')).toBeNull();
  });
});

describe('1. a helper verb governs the next verb’s form', () => {
  it('catches the wrong form', () => {
    expect(fixes('She could went home early.')).toEqual(['go']);
    expect(fixes('He has went to the shop.')).toEqual(['gone']);
    expect(fixes('We were expose to the cold all night.')).toEqual(['exposed']);
    expect(fixes('I am interested in learn French.')).toEqual(['learning']);
    expect(fixes('The scraping will causes heat.')).toEqual(['cause']);
    expect(fixes('Did you went to the market?')).toEqual(['go']);
  });

  it('leaves nouns, describing words and old usage alone', () => {
    expect(found('She had faults, and he had freckles.')).toEqual([]);
    expect(found('There was want of spirit in it.')).toEqual([]);
    expect(found('He had always clean shoes to wear.')).toEqual([]);
    expect(found('She might wound him deeper.')).toEqual([]);
    expect(found('He was unfit to be seen.')).toEqual([]);
    expect(found('"I won\'t!" said Alice.')).toEqual([]);
    expect(found('Do cats eat bats?')).toEqual([]);
    expect(found('He was like a brother to me.')).toEqual([]);
  });
});

describe('2. a noun agrees in number with what counts it', () => {
  it('catches the wrong number', () => {
    expect(fixes('I would like to learn it in every details.')).toEqual(['detail']);
    expect(fixes('One of the reason is clear.')).toEqual(['reasons']);
    expect(fixes('It will lessen the number of car on the road.')).toEqual(['cars']);
    expect(fixes('I need two knifes for the table.')).toEqual(['knives']);
    expect(fixes('This companies used the fish.')).toEqual(['These']);
    expect(fixes('All the student passed the exam.')).toEqual(['students']);
    expect(fixes('Several guest arrived early.')).toEqual(['guests']);
    expect(fixes('The dogs barks all night.')).toEqual(['bark']);
  });

  it('leaves compounds, pairs and verbs alone', () => {
    expect(found('Both husband and wife were glad.')).toEqual([]);
    expect(found('A few minutes’ conversation was enough.')).toEqual([]);
    expect(found('Several years back she left.')).toEqual([]);
    expect(found('Each lad passes the gate.')).toEqual([]);
    expect(found('One of the family came.')).toEqual([]);
    expect(found('Two persons entered.')).toEqual([]);
    expect(found('These sheep are mine.')).toEqual([]);
  });
});

describe('3. verbs and describing words take the prepositions their frames name', () => {
  it('catches the wrong preposition', () => {
    expect(found('We discussed about the plan.')).toHaveLength(1);
    expect(fixes('She entered into the room quietly.')).toEqual(['']);
    expect(fixes('He was angry on me.')).toEqual(['with']);
    expect(fixes('We went the beach last summer.')).toEqual(['went to']);
  });

  it('leaves nouns and proper uses alone', () => {
    expect(found('Her first visit to Bath was short.')).toEqual([]);
    expect(found('They entered into an agreement.')).toEqual([]);
    expect(found('The curtains reached to the floor.')).toEqual([]);
    expect(found('He walked the streets all night.')).toEqual([]);
    expect(found('In came the doctor.')).toEqual([]);
  });
});

describe('4. an owner takes ’s', () => {
  it('catches the missing ’s', () => {
    expect(fixes('This is my sisters car.')).toEqual(['sister’s']);
    expect(fixes('The teacher desk was covered in papers.')).toEqual(['teacher’s']);
    expect(fixes('I borrowed John bicycle.')).toEqual(['John’s']);
  });

  it('leaves two objects and compounds alone', () => {
    expect(found('She gave her father books.')).toEqual([]);
    expect(found('I gave John money.')).toEqual([]);
    expect(found('It was a sports car.')).toEqual([]);
  });
});

describe('5. describing words where English wants one', () => {
  it('catches nouns and the wrong side of a feeling', () => {
    expect(fixes('She is a very beauty woman.')).toEqual(['beautiful']);
    expect(fixes('The film was really bored.')).toEqual(['boring']);
    expect(fixes('I am interesting in art.')).toEqual(['interested']);
    expect(fixes('She seemed happily.')).toEqual(['happy']);
  });

  it('leaves the emphatic “very” and real feelings alone', () => {
    expect(found('At the very end, she smiled.')).toEqual([]);
    expect(found('He was the very man for it.')).toEqual([]);
    expect(found('He is interesting in conversation.')).toEqual([]);
    expect(found('She seemed hardly to hear.')).toEqual([]);
    expect(found('The class was bored.')).toEqual([]);
  });
});

describe('6. one story, one time', () => {
  it('catches a slip into the present', () => {
    expect(fixes('She was tired, so she goes to bed early.')).toEqual(['went']);
    expect(fixes('When I was young, I am going to the market every Saturday.')).toEqual(['was']);
    expect(fixes('She picked up the knife and cuts the bread.')).toEqual(['cut']);
  });

  it('leaves a present that belongs alone', () => {
    expect(found('She was tired, so she still goes to bed early now.')).toEqual([]);
    expect(found('He brought senses and nerves that could be useful.')).toEqual([]);
  });
});

describe('word order and punctuation', () => {
  it('moves “always” after “be”', () => {
    expect(fixes('I always am late.')).toEqual(['am always']);
    expect(found('They generally are of two sorts.')).toEqual([]);
  });

  it('asks for a comma after a long opening, and an article for a counted noun (both off at first)', () => {
    expect(found('In the case of young people the best way is to study.')).toEqual(['opening-comma:people→people,']);
    expect(found('He lives with dog now.')).toEqual(['missing-article:dog→a dog']);
    expect(found('He went to bed at night by car.')).toEqual([]);
  });
});
