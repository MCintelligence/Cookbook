import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memory';
import { darkPageColor, defaultStyles, loadStyles, resolveParagraphStyle, saveStyles, stylesToCss, updateParagraphStyle } from './styles';

describe('styles', () => {
  it('fills unset properties from the based-on chain', () => {
    const letter = resolveParagraphStyle(defaultStyles(), 'letter');
    expect(letter).toMatchObject({ font: 'Literata', size: 12, italic: true, sideIndent: 0.5, firstLineIndent: 0 });
  });

  it('follows changes to Body into styles based on it', () => {
    const sheet = updateParagraphStyle(defaultStyles(), 'body', { font: 'EB Garamond', size: 13 });
    expect(resolveParagraphStyle(sheet, 'letter')).toMatchObject({ font: 'EB Garamond', size: 13 });
    expect(resolveParagraphStyle(sheet, 'chapter-title')).toMatchObject({ font: 'Fraunces', size: 18 });
  });

  it('survives a based-on loop', () => {
    const sheet = defaultStyles();
    sheet.paragraph.push({ id: 'a', name: 'A', basedOn: 'b' }, { id: 'b', name: 'B', basedOn: 'a' });
    expect(resolveParagraphStyle(sheet, 'a').font).toBe('Literata');
  });

  it('draws 12 pt as 16 px and inches at 96 px', () => {
    const css = stylesToCss(defaultStyles());
    expect(css).toContain("font-family: 'Literata', serif; font-size: 16px");
    // Quotes and letters are indented half an inch on both sides.
    expect(css).toContain('margin: 8px 48px 8px');
    // New books start every paragraph at the margin.
    expect(css).toContain('text-indent: 0px');
    expect(css).toContain('line-height: 1.5');
  });

  it('only sets what a character style names', () => {
    const css = stylesToCss(defaultStyles());
    const emphasis = css.split('\n').find((l) => l.includes('"emphasis"'))!;
    expect(emphasis).toContain('font-style: italic');
    expect(emphasis).not.toContain('font-family');
    expect(emphasis).not.toContain('font-size');
  });

  it('saves to and loads from the book folder', async () => {
    const fs = new MemoryAdapter();
    expect(await loadStyles(fs)).toEqual(defaultStyles());
    const changed = updateParagraphStyle(defaultStyles(), 'body', { lineSpacing: 2 });
    await saveStyles(fs, changed);
    expect(resolveParagraphStyle(await loadStyles(fs), 'body').lineSpacing).toBe(2);
  });

  it('drops the old "Body, first after break" style when it was never changed', async () => {
    const fs = new MemoryAdapter();
    const old = defaultStyles();
    old.paragraph.splice(1, 0, { id: 'body-first', name: 'Body, first after break', basedOn: 'body', next: 'body', firstLineIndent: 0 });
    old.paragraph = old.paragraph.map((s) => (s.id === 'chapter-title' ? { ...s, next: 'body-first' } : s));
    await saveStyles(fs, old);
    const sheet = await loadStyles(fs);
    expect(sheet.paragraph.some((s) => s.id === 'body-first')).toBe(false);
    expect(sheet.paragraph.find((s) => s.id === 'chapter-title')?.next).toBe('body');
    // Paragraphs still marked with it are drawn as Body.
    expect(stylesToCss(sheet)).toContain('.cb-page p[data-style="body"], .cb-page p[data-style="body-first"] {');
  });

  it('keeps "Body, first after break" when someone has changed it', async () => {
    const fs = new MemoryAdapter();
    const old = defaultStyles();
    old.paragraph.splice(1, 0, { id: 'body-first', name: 'Body, first after break', basedOn: 'body', next: 'body', firstLineIndent: 0, spaceBefore: 6 });
    await saveStyles(fs, old);
    expect((await loadStyles(fs)).paragraph.find((s) => s.id === 'body-first')?.spaceBefore).toBe(6);
  });
});

describe('darkPageColor', () => {
  it('turns dark ink light and keeps its hue', () => {
    expect(darkPageColor('#3B2A20')).toBe('#dfcec4');
    expect(darkPageColor('#111111')).toBe('#e6e6e6');
  });
  it('keeps light colours and anything that is not a hex colour', () => {
    expect(darkPageColor('#f2c46b')).toBe('#f2c46b');
    expect(darkPageColor('rebeccapurple')).toBe('rebeccapurple');
  });
  it('is added for the dark page by stylesToCss', () => {
    expect(stylesToCss(defaultStyles())).toContain(':root[data-page="dark"] .cb-page p:not([data-style])');
    expect(stylesToCss(defaultStyles(), '.x', false)).not.toContain('data-page');
  });
});
