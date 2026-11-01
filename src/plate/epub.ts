import { strToU8, zipSync, type Zippable } from 'fflate';
import { escapeHtml } from '../export/html';
import { textHtml } from './book';
import { type PlateBook, markFirst, openerHtml, plateCss } from './layout';
import { type PlateSettings, defaultCopyright } from './settings';

/**
 * The served e-book: EPUB 3 with the front matter, one file per chapter set
 * with its opener, drop cap and scene breaks, and the back matter. Readers
 * reflow the text, so there are no pages, running headers or page numbers.
 */
export function plateEpub(book: PlateBook, s: PlateSettings, id: string, now = new Date()): Uint8Array {
  const doc = (title: string, body: string, type = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><link rel="stylesheet" href="style.css" /></head>
<body class="plate-text"${type ? ` epub:type="${type}"` : ''}>
${body}
</body></html>`;
  const files: Zippable = { mimetype: [strToU8('application/epub+zip'), { level: 0 }] };
  const add = (name: string, text: string) => (files[name] = strToU8(text));
  const sections: { file: string; title: string; toc: boolean }[] = [];
  const section = (file: string, title: string, body: string, toc: boolean, type = '') => {
    add(`OEBPS/${file}`, doc(title, body, type));
    sections.push({ file, title, toc });
  };

  add(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  // Readers pick their own font size, so the size is left to them; the rest of the type comes along.
  add(
    'OEBPS/style.css',
    plateCss({ ...s, size: 12 }, '.plate-text').replace(/font-size: 12pt; /, '') +
      '\n.plate-text .opener { margin-top: 3em; }\n.plate-text .tp { padding-top: 20%; }\n.plate-text .dedication { padding-top: 25%; }\n.plate-text .copyright { margin-top: 40%; }\n',
  );

  for (const m of s.front) {
    if (!m.on) continue;
    if (m.id === 'title') {
      section(
        'title.xhtml',
        book.title,
        `<div class="tp"><div class="tp-title">${escapeHtml(book.title)}</div>${s.subtitle.trim() ? `<div class="tp-sub">${escapeHtml(s.subtitle)}</div>` : ''}${s.author.trim() ? `<div class="tp-author">${escapeHtml(s.author)}</div>` : ''}</div>`,
        false,
        'titlepage',
      );
    } else if (m.id === 'copyright') {
      section('copyright.xhtml', 'Copyright', `<div class="copyright">${textHtml(s.copyright || defaultCopyright(s.author, now.getFullYear()))}</div>`, false, 'copyright-page');
    } else if (m.id === 'dedication' && s.dedication.trim()) {
      section('dedication.xhtml', 'Dedication', `<div class="dedication">${textHtml(s.dedication)}</div>`, false, 'dedication');
    }
  }
  book.chapters.forEach((ch, i) => {
    section(`chapter${i + 1}.xhtml`, ch.title, openerHtml(s, i + 1, ch.title, true) + markFirst(ch.html), true, 'chapter');
  });
  for (const m of s.back) {
    if (!m.on) continue;
    const text = m.id === 'about' ? s.about : s.acknowledgements;
    if (!text.trim()) continue;
    const title = m.id === 'about' ? 'About the Author' : 'Acknowledgements';
    section(`${m.id}.xhtml`, title, `<div class="matter-title">${title}</div><div class="matter">${textHtml(text)}</div>`, true, 'backmatter');
  }

  const wantsContents = s.front.some((m) => m.id === 'contents' && m.on);
  const toc = sections.filter((x) => x.toc);
  add(
    'OEBPS/nav.xhtml',
    doc(
      'Contents',
      `<nav epub:type="toc" id="toc"><div class="matter-title">Contents</div><ol>${toc.map((x) => `<li><a href="${x.file}">${escapeHtml(x.title)}</a></li>`).join('')}</ol></nav>`,
    ),
  );
  // The contents page sits where the writer put it among the front matter: after the parts before it.
  const frontCount = sections.filter((x) => !x.toc).length;
  const spineFiles = sections.map((x) => x.file);
  if (wantsContents) spineFiles.splice(frontCount, 0, 'nav.xhtml');

  const itemId = (file: string) => file.replace(/\.xhtml$/, '');
  add(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${escapeHtml(id)}</dc:identifier>
<dc:title>${escapeHtml(book.title)}</dc:title>
${s.author.trim() ? `<dc:creator>${escapeHtml(s.author)}</dc:creator>\n` : ''}<dc:language>en</dc:language>
<meta property="dcterms:modified">${now.toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
${sections.map((x) => `<item id="${itemId(x.file)}" href="${x.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${spineFiles.map((f) => `<itemref idref="${f === 'nav.xhtml' ? 'nav' : itemId(f)}"/>`).join('\n')}
</spine>
</package>`,
  );
  return zipSync(files);
}
