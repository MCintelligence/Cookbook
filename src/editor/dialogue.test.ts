import { describe, expect, it } from 'vitest';
import { dialogueRanges } from './dialogue';

const spoken = (text: string) => dialogueRanges(text).map(([a, b]) => text.slice(a, b));

describe('dialogue', () => {
  it('finds curly-quoted speech', () => {
    expect(spoken('“You writing about me again?” Lou asked. “Hush.”')).toEqual(['“You writing about me again?”', '“Hush.”']);
  });

  it('finds straight-quoted speech', () => {
    expect(spoken('She said "no" and then "yes."')).toEqual(['"no"', '"yes."']);
  });

  it('runs an unclosed quote to the end of the paragraph', () => {
    expect(spoken('Lou said, “The pie wants nutmeg')).toEqual(['“The pie wants nutmeg']);
  });

  it('ignores apostrophes and single quotes', () => {
    expect(spoken('Lou’s pie isn’t ‘done’ yet.')).toEqual([]);
  });

  it('does not open a straight quote in the middle of a word', () => {
    expect(spoken('A 6" pan.')).toEqual([]);
  });
});
