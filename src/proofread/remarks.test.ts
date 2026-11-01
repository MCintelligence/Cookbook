import { describe, expect, it } from 'vitest';
import { type Issue } from './check';
import { METERS, SPICE, fixText, meterRemark, ownerOf, perThousand, remark, rulesOff, spiceOf, tasteOf, waitingRemark } from './remarks';
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
    expect(remark(issue('style', 'passive'), 'was eaten')).toBe(remark(issue('style', 'passive'), 'was eaten'));
    expect(remark(issue('style', 'passive'), 'was eaten')).toMatch(/[Pp]assive|who|Who|charge/);
    expect(remark(issue('grammar', 'grammar', 'Use “an” here.'), 'a')).toMatch(/^Grammar!\ Use\ “an”\ here\./);
    expect(remark({ ...issue('grammar', 'ThenThan'), suggestions: ['than'] }, 'then')).toMatch(/^Mix\-up!\ You\ mean\ “than”\./);
    expect(remark(issue('grammar', 'ThenThan', 'Did you mean “than”?'), 'then')).toMatch(/^Grammar!\ Did\ you\ mean\ “than”\?/);
    expect(remark(issue('grammar', 'agreement', 'With “they”, it’s “were”.'), 'was')).toMatch(/^Agreement!\ With\ “they”,\ it’s\ “were”\./);
  });

  it('turns the grade into heat, with most fiction at Medium', () => {
    expect([2, 4, 5, 7, 8, 9, 10, 12, 13, 20].map((g) => SPICE[spiceOf(g)]!.level)).toEqual(['Mild', 'Mild', 'Medium', 'Medium', 'Hot', 'Hot', 'Extra hot', 'Extra hot', 'Inferno', 'Inferno']);
  });

  it('gives each seasoning five steps, each with plenty to say', () => {
    const all: string[] = [];
    for (const meter of Object.values(METERS)) {
      expect(meter.steps).toHaveLength(5);
      expect(meter.steps[4]!.upTo).toBe(Infinity);
      for (const step of meter.steps) {
        expect(step.says.length).toBeGreaterThanOrEqual(6);
        all.push(...step.says);
      }
      expect(meter.waiting.length).toBeGreaterThanOrEqual(3);
    }
    // No line is used twice anywhere, so each one belongs to its moment.
    expect(new Set(all).size).toBe(all.length);
    // The mockup's 23 per 1,000 words is in the middle of Pete's meter.
    expect(METERS.pete.steps[tasteOf(METERS.pete.steps, 23)]!.level).toBe('Peppery');
    expect(METERS.daniel.steps[tasteOf(METERS.daniel.steps, 79)]!.level).toBe('Drunk');
  });

  it('picks a line from the right step, steadily for one seed and freshly across seeds', () => {
    const at = tasteOf(METERS.daniel.steps, 79);
    expect(METERS.daniel.steps[at]!.says).toContain(meterRemark('daniel', at, 7));
    expect(meterRemark('daniel', at, 7)).toBe(meterRemark('daniel', at, 7));
    const lines = new Set(Array.from({ length: 60 }, (_, seed) => meterRemark('sally', spiceOf(9), seed)));
    expect(lines.size).toBeGreaterThanOrEqual(5);
    expect(METERS.sam.waiting).toContain(waitingRemark('sam', 3));
  });

  it('gives each character many ways to flag the same kind of slip', () => {
    const sam = new Set(['recieve', 'teh', 'wierd', 'definately', 'seperate', 'occured', 'untill', 'beleive', 'alot', 'tommorow', 'accomodate', 'goverment'].map((w) => remark(issue('spelling', 'spelling'), w).replace(/“[^”]*”/, '“…”')));
    expect(sam.size).toBeGreaterThanOrEqual(5);
    const pete = new Set(['was', 'were', 'is', 'are', 'has', 'have', 'do', 'does', 'go', 'goes', 'run', 'runs'].map((w) => remark(issue('grammar', 'agreement', 'Fix it.'), w)));
    expect(pete.size).toBeGreaterThanOrEqual(5);
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
