import { describe, expect, it } from 'vitest';
import { matchStyles, parseSize, stepSize } from './combo';

const styles = [{ name: 'Body' }, { name: 'Chapter title' }, { name: 'Heading 2' }, { name: 'Heading 3' }, { name: 'Quote' }, { name: 'Letter' }];
const names = (text: string) => matchStyles(styles, text).map((s) => s.name);

describe('Style box', () => {
  it('lists names that start with the typing first, then names with a word that does', () => {
    expect(names('he')).toEqual(['Heading 2', 'Heading 3']);
    expect(names('T')).toEqual(['Chapter title']);
    expect(names('l')).toEqual(['Letter']);
    expect(names('QU')).toEqual(['Quote']);
  });

  it('lists everything for no typing and nothing for a name no style has', () => {
    expect(names('  ')).toHaveLength(styles.length);
    expect(names('Headline')).toEqual([]);
  });

});

describe('Size box', () => {
  it('takes sizes from 1 to 400 points, to the half point', () => {
    expect(parseSize('12')).toBe(12);
    expect(parseSize(' 10.5 ')).toBe(10.5);
    expect(parseSize('10,5')).toBe(10.5);
    expect(parseSize('11.3')).toBe(11.5);
    expect(parseSize('14pt')).toBe(14);
    expect(parseSize('400')).toBe(400);
  });

  it('turns away anything else', () => {
    for (const bad of ['', 'big', '0', '-4', '401', '1e9', 'NaN', '12px']) expect(parseSize(bad)).toBeNull();
  });

  it('steps a point at a time, onto whole points, within the limits', () => {
    expect(stepSize(12, true)).toBe(13);
    expect(stepSize(12, false)).toBe(11);
    expect(stepSize(10.5, true)).toBe(11);
    expect(stepSize(10.5, false)).toBe(10);
    expect(stepSize(1, false)).toBe(1);
    expect(stepSize(400, true)).toBe(400);
  });
});
