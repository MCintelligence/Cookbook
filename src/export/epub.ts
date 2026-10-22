import { strToU8, zipSync, type Zippable } from 'fflate';
import { type StyleSheet } from '../styles/styles';
import { HtmlWriter, bookCss, escapeHtml } from './html';
import { type Manuscript, type Part } from './manuscript';

/**
 * An EPUB 3 e-book: one XHTML file per top-level folder (chapter or part),
 * a table of contents, and the book's styles. Footnotes are listed at the end
 * of their chapter and linked both ways.
 */
export function bookEpub(m: Manuscript, sheet: StyleSheet, id: string, now = new Date()): Uint8Array {
  // Split into chapters at each top-level heading.
  const chapters: { title: string; parts: Part[] }[] = [];
  for (const part of m.parts) {
    if (part.kind === 'heading' && part.depth === 1) chapters.push({ title: part.text, parts: [part] });
    else {
      if (chapters.length === 0) chapters.push({ title: m.title, parts: [] });
      chapters[chapters.length - 1]!.parts.push(part);
    }
  }
  const w = new HtmlWriter(true);
  const page = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><link rel="stylesheet" href="style.css" /></head>
<body class="book">
${body}
</body></html>`;
  const files: Zippable = { mimetype: [strToU8('application/epub+zip'), { level: 0 }] };
  const add = (name: string, text: string) => (files[name] = strToU8(text));
  add(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  add('OEBPS/style.css', bookCss(sheet, '.book').replace(/\.book h1\.book-title \{[^}]*\}/, '.book h1.book-title { font-size: 2em; margin-top: 30%; }'));
  add('OEBPS/title.xhtml', page(m.title, `<h1 class="book-title">${escapeHtml(m.title)}</h1>`));
  chapters.forEach((ch, i) => {
    const body = ch.parts
      .map((part) => {
        if (part.kind === 'heading') {
          const level = Math.min(3, part.depth);
          return `<h${level}>${escapeHtml(part.text)}</h${level}>`;
        }
        if (part.kind === 'break') return '<p class="scene-break">* * *</p>';
        return w.body(part.body);
      })
      .join('\n');
    add(`OEBPS/chapter${i + 1}.xhtml`, page(ch.title, body + '\n' + w.takeNotes()));
  });
  const items = chapters.map((_, i) => `<item id="c${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n');
  add(
    'OEBPS/nav.xhtml',
    page(
      'Contents',
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map((ch, i) => `<li><a href="chapter${i + 1}.xhtml">${escapeHtml(ch.title)}</a></li>`).join('')}</ol></nav>`,
    ),
  );
  add(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${escapeHtml(id)}</dc:identifier>
<dc:title>${escapeHtml(m.title)}</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${now.toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${items}
</manifest>
<spine>
<itemref idref="title"/>
${spine}
</spine>
</package>`,
  );
  return zipSync(files);
}
