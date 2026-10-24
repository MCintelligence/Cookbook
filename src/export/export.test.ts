import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { MemoryAdapter } from '../storage/memory';
import { createBook, createDocument, readDocument, readTree, writeDocument } from '../storage/book';
import { withField } from '../storage/document';
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

  it('leaves out scenes marked so, and a chapter left empty by them', async () => {
    const { fs } = await sampleBook();
    for (const p of ['bookshelf/Chapter 1/Noon.md', 'bookshelf/Chapter 2/Night.md']) await writeDocument(fs, p, withField(await readDocument(fs, p), 'export', false));
    const m = await collect(fs, 'The Summer Kitchen', await readTree(fs, 'bookshelf'));
    expect(m.parts.map((p) => (p.kind === 'heading' ? p.text : p.kind))).toEqual(['Chapter 1', 'scene']);
  });

  it('prints and writes Word files on the book’s page size', async () => {
    const { m } = await sampleBook();
    const page = { size: 'a5', margins: 'narrow', view: 'page', zoom: 100 } as const;
    expect(bookHtml(m, defaultStyles(), page)).toContain('@page { size: 5.83in 8.27in; margin: 0.6in; }');
    const xml = strFromU8(unzipSync(bookDocx(m, defaultStyles(), page))['word/document.xml']!);
    expect(xml).toContain('<w:pgSz w:w="8395" w:h="11909"/>');
    expect(xml).toContain('w:left="864"');
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
    expect(back.body).toMatch(/\n# Chapter 2\n/);
    expect(back.body).toContain('\n\n- butter\n- salt\n\n');
    expect(back.body).toContain('cornbread** & [greens]{.thought}.^[Collards, really.]\n\n* * *\n\nLou');
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

describe('the new formatting', () => {
  const rich = [
    '## Part one',
    '',
    '::: letter',
    'Dear June,\\',
    'with love.',
    ':::',
    '',
    '> A quote.',
    '',
    '1. first [salt]{.strong}',
    '   - nested *soft*',
    '2. second',
    '',
    '- [x] done',
    '',
    '| Dish | Who |',
    '| --- | --- |',
    '| Pie | Lou |',
    '',
    '```',
    'code line',
    'second line',
    '```',
    '',
    'A [link](https://example.com/pie) and ~~struck~~ and `code` and [under]{.ul}.',
    '',
  ].join('\n');

  async function richBook() {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Rich');
    const p = await createDocument(fs, 'bookshelf', 'Everything');
    await writeDocument(fs, p, { ...(await readDocument(fs, p)), body: rich });
    return collect(fs, 'Rich', await readTree(fs, 'bookshelf'));
  }

  it('comes back from Word exactly as it was written', async () => {
    const back = importDocx('Rich.docx', bookDocx(await richBook(), defaultStyles()));
    expect(back.body).toBe('# Rich\n\n' + rich);
  });

  it('writes Word lists with real numbering and links as hyperlinks', async () => {
    const files = unzipSync(bookDocx(await richBook(), defaultStyles()));
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>');
    expect(xml).toContain('<w:hyperlink r:id="rLink1">');
    expect(strFromU8(files['word/_rels/document.xml.rels']!)).toContain('Target="https://example.com/pie" TargetMode="External"');
    expect(strFromU8(files['word/numbering.xml']!)).toContain('<w:startOverride w:val="1"/>');
  });

  it('prints and makes e-books with lists, tables, code and links', async () => {
    const html = bookHtml(await richBook(), defaultStyles());
    for (const bit of ['<ol><li>first', '<ul><li>nested <em>soft</em></li></ul>', '<th>Dish</th>', '<pre><code>code line\nsecond line</code></pre>', '<a href="https://example.com/pie">link</a>', '<s>struck</s>', 'Dear June,<br>with love.'])
      expect(html).toContain(bit);
    const files = unzipSync(bookEpub(await richBook(), defaultStyles(), 'id'));
    const chapter = strFromU8(files['OEBPS/chapter1.xhtml']!);
    expect(new DOMParser().parseFromString(chapter, 'application/xhtml+xml').getElementsByTagName('parsererror')).toHaveLength(0);
    expect(chapter).toContain('Dear June,<br />with love.');
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
    expect(got).toEqual({ title: 'Porch', body: '# Part One\n\nHot *night*.\n' });
  });

  it('reads Word files from other apps: tracked deletions, tables and empty paragraphs', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Kept</w:t></w:r><w:del><w:r><w:t>gone</w:t></w:r></w:del><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t xml:space="preserve"> words</w:t></w:r></w:p>
<w:p></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
    const data = zipSync({ 'word/document.xml': strToU8(doc) });
    expect(importFile('Draft.DOCX', data)).toEqual({ title: 'Draft', body: '*Kept* words\n\n| Cell |\n| --- |\n' });
  });

  it('says plainly what it cannot read', () => {
    expect(() => importFile('cover.png', new Uint8Array())).toThrow(/Word \(\.docx\), Markdown \(\.md\) and plain text/);
    expect(() => importDocx('bad.docx', zipSync({ 'x.txt': strToU8('') }))).toThrow(/no document/);
  });
});
