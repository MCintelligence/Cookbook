import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { MemoryAdapter } from '../storage/memory';
import { createBook, createDocument, openBook, readDocument, readTree, saveBookInfo, writeDocument } from '../storage/book';
import { withField } from '../storage/document';
import { readChapters, textHtml } from './book';
import { plateEpub } from './epub';
import { geometry, markFirst, plateCss, openerHtml, printBookHtml } from './layout';
import { DEFAULT_PLATE, numberWords, orderChapters, plateOf, withTemplate } from './settings';

async function sampleShelf() {
  const fs = new MemoryAdapter();
  await createBook(fs, 'The Summer Kitchen');
  const write = async (folder: string, title: string, body: string) => {
    const p = await createDocument(fs, folder, title);
    await writeDocument(fs, p, { ...(await readDocument(fs, p)), body });
    return p;
  };
  await fs.makeFolder('bookshelf/Morning');
  await write('bookshelf/Morning', 'Kitchen', 'The kitchen smelled of **cornbread**.\n');
  await write('bookshelf/Morning', 'Porch', 'Lou hummed on the porch.\n');
  const cut = await write('bookshelf/Morning', 'Cut', 'Not for readers.\n');
  await writeDocument(fs, cut, withField(await readDocument(fs, cut), 'export', false));
  await write('bookshelf', 'Night', 'The night was hot.\n');
  return { fs, shelf: await readTree(fs, 'bookshelf') };
}

describe('plate settings', () => {
  it('falls back part by part to the defaults', () => {
    const s = plateOf({ trim: '6x9', size: 99, font: 'Comic Sans', front: [{ id: 'contents', on: false }, { id: 'nope', on: true }] });
    expect(s.trim).toBe('6x9');
    expect(s.size).toBe(DEFAULT_PLATE.size);
    expect(s.font).toBe(DEFAULT_PLATE.font);
    // The saved part keeps its place; the rest come back after it.
    expect(s.front.map((m) => m.id)).toEqual(['contents', 'title', 'copyright', 'dedication']);
    expect(s.front[0]!.on).toBe(false);
  });

  it('reads nothing at all as the defaults', () => {
    expect(plateOf(undefined)).toEqual(DEFAULT_PLATE);
  });

  it('sets a template’s look and keeps the rest', () => {
    const s = withTemplate({ ...DEFAULT_PLATE, author: 'June Ashby', trim: '5x8' }, 'modern');
    expect(s).toMatchObject({ template: 'modern', opener: 'numeral', dropCap: false, author: 'June Ashby', trim: '5x8' });
  });

  it('spells chapter numbers', () => {
    expect([1, 12, 20, 42, 100, 121].map(numberWords)).toEqual(['One', 'Twelve', 'Twenty', 'Forty-Two', 'One Hundred', 'One Hundred Twenty-One']);
  });

  it('orders chapters by the saved order, new ones after in Shelf order', () => {
    const list = ['a', 'b', 'c', 'd'].map((path) => ({ path }));
    expect(orderChapters(list, ['c', 'gone', 'a']).map((c) => c.path)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('is kept in book.json', async () => {
    const fs = new MemoryAdapter();
    const info = await createBook(fs, 'Kept');
    await saveBookInfo(fs, { ...info, plate: { trim: '5x8', author: 'June' } });
    expect(plateOf((await openBook(fs)).plate)).toMatchObject({ trim: '5x8', author: 'June' });
  });
});

describe('the book’s chapters', () => {
  it('makes one chapter of each top-level Group or Item, leaving out what isn’t exported', async () => {
    const { fs, shelf } = await sampleShelf();
    const chapters = await readChapters(fs, shelf);
    expect(chapters.map((c) => c.title)).toEqual(['Morning', 'Night']);
    expect(chapters[0]!.html).toContain('<strong>cornbread</strong>');
    expect(chapters[0]!.html).toContain('<p class="scene-break"></p>');
    expect(chapters[0]!.html).not.toContain('Not for readers');
  });

  it('marks the first body paragraph for the drop cap, past any heading', () => {
    expect(markFirst('<p data-style="chapter-title">Morning</p><p>The kitchen</p><p>Then</p>')).toBe('<p data-style="chapter-title">Morning</p><p class="first">The kitchen</p><p>Then</p>');
  });

  it('leaves the template drop cap off a chapter that starts with a !Word one', () => {
    expect(markFirst('<p>The kitchen</p>')).toBe('<p class="first">The kitchen</p>');
    expect(markFirst('<p><span class="cb-dropcap cb-dropcap-start">O</span>nce</p><p>Then</p>')).toBe('<p class="first own-cap"><span class="cb-dropcap cb-dropcap-start">O</span>nce</p><p>Then</p>');
    expect(plateCss({ ...DEFAULT_PLATE, dropCap: true })).toContain('p.first:not(.own-cap)::first-letter');
  });

  it('sets openers the way the writer picked', () => {
    expect(openerHtml({ ...DEFAULT_PLATE, opener: 'words' }, 3, 'Night')).toContain('Chapter Three');
    expect(openerHtml({ ...DEFAULT_PLATE, opener: 'numeral' }, 3, 'Night')).toContain('>3<');
    expect(openerHtml({ ...DEFAULT_PLATE, opener: 'title' }, 3, 'A & B')).toBe('<div class="opener"><div class="title">A &amp; B</div></div>');
  });

  it('turns typed matter into paragraphs', () => {
    expect(textHtml('For Mama Lou\nand June\n\nAlways')).toBe('<p>For Mama Lou<br />and June</p>\n<p>Always</p>');
  });

  it('gives the gutter the wider margin', () => {
    const g = geometry({ ...DEFAULT_PLATE, trim: '6x9' });
    expect(g.width).toBe(576);
    expect(g.inside).toBeGreaterThan(g.outside);
  });
});

describe('serving', () => {
  it('makes an EPUB with front matter, chapters and contents in order', async () => {
    const { fs, shelf } = await sampleShelf();
    const chapters = await readChapters(fs, shelf);
    const s = { ...DEFAULT_PLATE, author: 'June Ashby', dedication: 'For Lou', front: DEFAULT_PLATE.front.map((m) => ({ ...m, on: true })) };
    const files = unzipSync(plateEpub({ title: 'The Summer Kitchen', chapters }, s, 'id-1', new Date('2026-11-01T00:00:00Z')));
    const opf = strFromU8(files['OEBPS/content.opf']!);
    expect(opf).toContain('<dc:creator>June Ashby</dc:creator>');
    const spine = [...opf.matchAll(/itemref idref="([^"]+)"/g)].map((m) => m[1]);
    expect(spine).toEqual(['title', 'copyright', 'dedication', 'nav', 'chapter1', 'chapter2']);
    expect(strFromU8(files['OEBPS/chapter1.xhtml']!)).toContain('Chapter One');
    expect(strFromU8(files['OEBPS/copyright.xhtml']!)).toContain('Copyright © 2026 June Ashby');
    expect(strFromU8(files['OEBPS/style.css']!)).toContain('::first-letter');
  });

  it('prints pages at the trim size with their numbers and headers', () => {
    const s = { ...DEFAULT_PLATE, author: 'June Ashby' };
    const html = printBookHtml(
      [
        { kind: 'title', html: 'T' },
        { kind: 'blank', html: '' },
        { kind: 'body', html: '<p>One</p>', opener: true, folio: 1 },
        { kind: 'body', html: '<p>Two</p>', folio: 2 },
      ],
      s,
      'The Summer Kitchen',
    );
    expect(html).toContain('@page { size: 5.5in 8.5in; margin: 0; }');
    // The opener has a number but no header; the next page, a left-hand one, has the author.
    expect(html.match(/pp-head/g)?.length).toBe(1 + 1);
    expect(html).toContain('>June Ashby</div>');
    expect(html).toContain('<div class="pp-folio"');
  });
});

describe('served e-books stay well-formed', () => {
  it('drops characters XML cannot hold', async () => {
    const { xmlSafe } = await import('../export/html');
    expect(xmlSafe('a\u0000b\u000bc\u0008d\te\nf')).toBe('abcd\te\nf');
    expect(xmlSafe('chef 👩‍🍳 ok')).toBe('chef 👩‍🍳 ok');
    expect(xmlSafe('half \uD83D here')).toBe('half  here');
  });

  it('keeps a pasted vertical tab out of the EPUB', () => {
    const book = { title: 'T', chapters: [{ path: 'bookshelf/a.md', title: 'A', html: '<p>Line\u000bbreak\u0000</p>', words: 2 }] };
    const zip = unzipSync(plateEpub(book as never, DEFAULT_PLATE, 'id'));
    const chapter = strFromU8(zip['OEBPS/chapter1.xhtml']!);
    expect(chapter).toContain('Linebreak');
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(chapter)).toBe(false);
  });
});
