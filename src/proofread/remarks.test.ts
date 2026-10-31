import { describe, expect, it } from 'vitest';
import { type Issue } from './check';
import { METERS, SPICE, fixText, meterRemark, ownerOf, perThousand, remark, rulesOff, spiceOf, tasteOf } from './remarks';
import { strayCapitals, unclosedQuote } from './style';

const issue = (kind: Issue['kind'], rule: string, message = ''): Issue => ({ from: 0, to: 1, kind, rule, message, suggestions: [] });

describe('seasonings', () => {
  it('hands each issue to the character who looks after it', () => {
    expect(ownerOf(issue('spelling', 'spelling'))).toBe('sam');
    expect(ownerOf(issue('style', 'sticky-sentence'))).toBe('sally');
    expect(ownerOf(issue('style', 'adverb'))).toBe('sally');
    expect(ownerOf(issue('style', 'harper-style'))).toBe('sally');
    expect(ownerOf(issue('grammar', 'stray-capitals'))).toBe('pete');
    expect(ownerOf(issue('grammar', 'grammar'))).toBe('pete');
  });

  it('switches off the checks of characters nobody picked', () => {
    const off = rulesOff(['pete']);
    expect(off).toContain('spelling');
    expect(off).toContain('sticky-sentence');
    expect(off).toContain('adverb');
    expect(off).not.toContain('grammar');
    expect(off).not.toContain('stray-capitals');
    expect(rulesOff(['sam', 'pete', 'daniel', 'sally'])).toEqual([]);
  });

  it('says the same thing each time for the same words', () => {
    const a = remark(issue('spelling', 'spelling'), 'recieve');
    expect(remark(issue('spelling', 'spelling'), 'recieve')).toBe(a);
    expect(a).toContain('recieve');
    expect(remark(issue('style', 'passive'), 'was eaten')).toMatch(/^Passive voice/);
    expect(remark(issue('grammar', 'grammar', 'Use “an” here.'), 'a')).toBe('Grammar! Use “an” here.');
    expect(remark({ ...issue('grammar', 'ThenThan'), suggestions: ['than'] }, 'then')).toBe('Mix-up! You mean “than”.');
    expect(remark(issue('grammar', 'ThenThan', 'Did you mean “than”?'), 'then')).toBe('Grammar! Did you mean “than”?');
    expect(remark(issue('grammar', 'agreement', 'With “they”, it’s “were”.'), 'was')).toBe('Agreement! With “they”, it’s “were”.');
  });

  it('turns the grade into heat, with most fiction at Medium', () => {
    expect([2, 4, 5, 7, 8, 9, 10, 12, 13, 20].map((g) => SPICE[spiceOf(g)]!.level)).toEqual(['Mild', 'Mild', 'Medium', 'Medium', 'Hot', 'Hot', 'Extra hot', 'Extra hot', 'Inferno', 'Inferno']);
  });

  it('gives each seasoning five steps and a remark for each', () => {
    for (const meter of Object.values(METERS)) {
      expect(meter.steps).toHaveLength(5);
      expect(meter.steps[4]!.upTo).toBe(Infinity);
    }
    expect(meterRemark('daniel', tasteOf(METERS.daniel.steps, 79))).toBe('Drunk! All talk! Now that’s a party.');
    expect(meterRemark('daniel', tasteOf(METERS.daniel.steps, 0))).toMatch(/^Sober!/);
    expect(meterRemark('sally', spiceOf(9))).toBe('Hot! A few long sentences are burning.');
    expect(meterRemark('pete', tasteOf(METERS.pete.steps, 0))).toMatch(/^Plain!/);
    expect(meterRemark('sam', tasteOf(METERS.sam.steps, 80))).toMatch(/^Seawater!/);
    // The mockup's 23 per 1,000 words is in the middle of Pete's meter.
    expect(meterRemark('pete', tasteOf(METERS.pete.steps, 23))).toMatch(/^Peppery!/);
  });

  it('judges slips per 1,000 words', () => {
    expect(perThousand(2, 87)).toBe(23);
    expect(perThousand(3, 0)).toBe(0);
  });

  it('describes fixes that remove or space things', () => {
    expect(fixText(' very', '')).toBe('cut “very”');
    expect(fixText('  ', ' ')).toBe('one space');
    expect(fixText('teh', 'the')).toBe('the');
  });
});

describe('stray capitals', () => {
  const found = (text: string, names: string[] = []) => strayCapitals(text, names).map((i) => [text.slice(i.from, i.to), i.suggestions[0]]);

  it('catches a held Shift and Caps Lock', () => {
    expect(found('The MOnster ate THe pie. mONSTER!')).toEqual([
      ['MOnster', 'Monster'],
      ['THe', 'The'],
      ['mONSTER', 'Monster'],
    ]);
  });

  it('leaves acronyms, plurals of them, mixed-case brands and names alone', () => {
    expect(found('NASA sold DVDs and URLs to the iOS fans with an MSc at McDonald’s, said DeShawn.', ['DeShawn'])).toEqual([]);
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
