import { describe, expect, it } from 'vitest';
import { type PageTaste, hasSomethingToSay, isChecking, sayingCount } from './tasting';

const page = (over: Partial<PageTaste> = {}): PageTaste => ({
  words: 200,
  sam: 0,
  pete: 0,
  sally: 0,
  grade: 6,
  gradeWords: 200,
  talkWords: 200,
  spoken: 80,
  dim: true,
  off: '',
  ...over,
});

describe('the badge beside Seasonings', () => {
  it('counts nobody on a page every seasoning is happy with', () => {
    expect(sayingCount(['sam', 'pete', 'sally', 'daniel'], false, page())).toBe(0);
  });

  it('counts each picked seasoning with something to say', () => {
    const p = page({ sam: 3, pete: 1, grade: 11 });
    expect(hasSomethingToSay('sam', p)).toBe(true);
    expect(hasSomethingToSay('sally', p)).toBe(true);
    expect(sayingCount(['sam', 'pete', 'sally', 'daniel'], false, p)).toBe(3);
    expect(sayingCount(['sam'], false, p)).toBe(1);
  });

  it('leaves out a seasoning whose Check is off, and everyone while Seasonings are off', () => {
    const p = page({ sam: 3, pete: 1, spoken: 5, off: 'spelling' });
    expect(isChecking('sam', p)).toBe(false);
    expect(sayingCount(['sam', 'pete', 'daniel'], false, p)).toBe(2);
    expect(sayingCount(['sam', 'pete', 'daniel'], false, { ...p, dim: false })).toBe(1);
    expect(sayingCount(['sam', 'pete', 'daniel'], true, p)).toBe(0);
  });

  it('says nothing while there is too little page to read', () => {
    expect(hasSomethingToSay('sally', page({ grade: 14, gradeWords: 10 }))).toBe(false);
    expect(hasSomethingToSay('daniel', page({ talkWords: 0, spoken: 0 }))).toBe(false);
    expect(hasSomethingToSay('sam', page({ words: 0, sam: 0 }))).toBe(false);
  });
});
