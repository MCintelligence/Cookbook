import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { MemoryAdapter } from '../storage/memory';
import { createBook, createDocument, readDocument, readTree, writeDocument } from '../storage/book';
import { backupZip } from '../storage/backup';
import { importDocx, importFile, importMarkdown, importText } from '../storage/importer';
import { defaultStyles } from '../styles/styles';
import { collect } from './manuscript';
import { bookDocx } from './docx';
import { bookEpub } from './epub';
import { bookHtml } from './html';
import { bookMarkdown } from './markdownExport';

// Only the XML parser is borrowed from jsdom; a whole jsdom window gives zips a second, foreign Uint8Array.
// @ts-expect-error jsdom ships without type declarations.
const { JSDOM } = (await import('jsdom')) as { JSDOM: new () => { window: { DOMParser: typeof DOMParser } } };
globalThis.DOMParser ??= new JSDOM().window.DOMParser;

async function sampleBook() {
  const fs = new MemoryAdapter();
  await createBook(fs, 'The Summer Kitchen');
  await fs.makeFolder('bookshelf/Chapter 1');
  const write = async (folder: string, title: string, body: string) => {
    const p = await createDocument(fs, folder, title);
    await writeDocument(fs, p, { ...(await readDocument(fs, p)), body });
  };
  await write('bookshelf/Chapter 1', 'Morning', 'The kitchen smelled of **cornbread** & [greens]{.thought}.^[Collards, really.]\n');
  await write('bookshelf/Chapter 1', 'Noon', 'Lou hummed <hymns>.\n\n- butter\n- salt\n');
  await fs.makeFolder('bookshelf/Chapter 2');
  await write('bookshelf/Chapter 2', 'Night', 'The [porch]{.note #n1} was hot.\n');
  const m = await collect(fs, 'The Summer Kitchen', await readTree(fs, 'bookshelf'));
  return { fs, m };
}

describe('the manuscript', () => {
  it('lays folders out as headings with breaks between scenes', async () => {
    const { m } = await sampleBook();
    expect(m.parts.map((p) => p.kind)).toEqual(['heading', 'scene', 'break', 'scene', 'heading', 'scene']);
  });

  it('never lets notes to self leave the app', async () => {
    const { m } = await sampleBook();
    expect(JSON.stringify(m)).not.toContain('"note"');
    expect(bookMarkdown(m)).toContain('The porch was hot.');
  });
});

describe('exports', () => {
  it('prints with page breaks before each chapter, escaping text', async () => {
    const { m } = await sampleBook();
    const html = bookHtml(m, defaultStyles());
    expect(html).toContain('<h2 class="chapter new-page">Chapter 1</h2>');
    expect(html).toContain('Lou hummed &lt;hymns&gt;.');
    expect(html).toContain('@page { size: 8.5in 11in');
    expect(html).toMatch(/Collards, really\./);
    expect(html).not.toContain('<hymns>');
  });

  it('writes a Word file that opens as XML, with real styles and footnotes', async () => {
    const { m } = await sampleBook();
    const files = unzipSync(bookDocx(m, defaultStyles()));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/footnotes.xml']));
    for (const [name, data] of Object.entries(files)) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
      const parsed = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
      expect(parsed.getElementsByTagName('parsererror'), name).toHaveLength(0);
    }
    const styles = strFromU8(files['word/styles.xml']!);
    expect(styles).toContain('w:styleId="cbbody"');
    expect(styles).toContain('w:styleId="FootnoteText"');
    expect(strFromU8(files['word/footnotes.xml']!)).toContain('Collards, really.');
  });

  it('comes back through import with its words, bold, list and footnote', async () => {
    const { m } = await sampleBook();
    const back = importDocx('Summer.docx', bookDocx(m, defaultStyles()));
    expect(back.title).toBe('Summer');
    expect(back.body).toContain('**cornbread**');
    expect(back.body).toContain('^[Collards, really.]');
    expect(back.body).toContain('Lou hummed <hymns>.');
    expect(back.body).toMatch(/::: chapter-title\nChapter 2\n:::/);
    expect(back.body).toContain('\n\n- butter\n- salt\n\n');
    expect(back.body).toContain('cornbread** & *greens*.^[Collards, really.]\n\n* * *\n\nLou');
  });

  it('writes an EPUB that readers accept: mimetype first and stored, every page valid XHTML', async () => {
    const { m } = await sampleBook();
    const data = bookEpub(m, defaultStyles(), 'abc', new Date('2026-10-22T10:00:00Z'));
    // The first entry's name starts 30 bytes in, uncompressed.
    expect(strFromU8(data.slice(30, 38))).toBe('mimetype');
    expect(strFromU8(data.slice(38, 58))).toBe('application/epub+zip');
    const files = unzipSync(data);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['OEBPS/chapter1.xhtml', 'OEBPS/chapter2.xhtml', 'OEBPS/nav.xhtml', 'OEBPS/content.opf']));
    for (const [name, bytes] of Object.entries(files)) {
      if (!/\.(xhtml|opf|xml)$/.test(name)) continue;
      const parsed = new DOMParser().parseFromString(strFromU8(bytes), 'application/xhtml+xml');
      expect(parsed.getElementsByTagName('parsererror'), name).toHaveLength(0);
    }
    expect(strFromU8(files['OEBPS/content.opf']!)).toContain('<meta property="dcterms:modified">2026-10-22T10:00:00Z</meta>');
  });

  it('writes one Markdown file with folders as headings', async () => {
    const { m } = await sampleBook();
    const md = bookMarkdown(m);
    expect(md.startsWith('# The Summer Kitchen\n\n## Chapter 1\n\n')).toBe(true);
    expect(md).toContain('\n\n* * *\n\n');
  });
});

describe('backup', () => {
  it('zips every file and folder, but not the hidden folder', async () => {
    const { fs } = await sampleBook();
    await fs.makeFolder('pantry/characters/Empty');
    const files = unzipSync(await backupZip(fs, 'The Summer Kitchen'));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['The Summer Kitchen/book.json', 'The Summer Kitchen/bookshelf/Chapter 1/Morning.md', 'The Summer Kitchen/pantry/characters/Empty/']),
    );
    expect(Object.keys(files).some((n) => n.includes('.cookbook'))).toBe(false);
    expect(strFromU8(files['The Summer Kitchen/bookshelf/Chapter 1/Morning.md']!)).toContain('cornbread');
  });
});

describe('import', () => {
  it('reads plain text with or without blank lines between paragraphs', () => {
    expect(importText('Notes.txt', 'One line\nTwo line\r\n').body).toBe('One line\n\nTwo line\n');
    expect(importText('Notes.txt', 'First\nstill first\n\nSecond').body).toBe('First still first\n\nSecond\n');
  });

  it('reads Markdown, taking the title from front matter and turning headings into chapter titles', () => {
    const got = importMarkdown('x.md', '---\ntitle: Porch\n---\n# Part One\n\nHot *night*.\n');
    expect(got).toEqual({ title: 'Porch', body: '::: chapter-title\nPart One\n:::\n\nHot *night*.\n' });
  });

  it('reads Word files from other apps: tracked deletions, tables and empty paragraphs', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Kept</w:t></w:r><w:del><w:r><w:t>gone</w:t></w:r></w:del><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t xml:space="preserve"> words</w:t></w:r></w:p>
<w:p></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
    const data = zipSync({ 'word/document.xml': strToU8(doc) });
    expect(importFile('Draft.DOCX', data)).toEqual({ title: 'Draft', body: '*Kept* words\n\nCell\n' });
  });

  it('says plainly what it cannot read', () => {
    expect(() => importFile('cover.png', new Uint8Array())).toThrow(/Word \(\.docx\), Markdown \(\.md\) and plain text/);
    expect(() => importDocx('bad.docx', zipSync({ 'x.txt': strToU8('') }))).toThrow(/no document/);
  });
});
