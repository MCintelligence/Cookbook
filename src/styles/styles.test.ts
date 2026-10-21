import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memory';
import { defaultStyles, loadStyles, resolveParagraphStyle, saveStyles, stylesToCss, updateParagraphStyle } from './styles';

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
    expect(css).toContain('text-indent: 48px');
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
});
