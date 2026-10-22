import { strToU8, zipSync } from 'fflate';
import { type NodeJSON, BODY_STYLE } from '../editor/markdown';
import { type StyleSheet, resolveParagraphStyle } from '../styles/styles';
import { type Manuscript, charStyles } from './manuscript';

/**
 * A Word document (.docx) written by hand: the book's paragraph and character
 * styles become real Word styles with the same names, so the writer (or an
 * editor) can restyle the whole manuscript in Word. Footnotes are real Word
 * footnotes. Notes to self are left out.
 */

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const styleId = (id: string) => 'cb' + id.replace(/[^A-Za-z0-9]/g, '');
const twips = (inches: number) => Math.round(inches * 1440);
const ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'both' } as const;

function runProps(sheet: StyleSheet, styles: string[]): string {
  // One character style per run is all Word allows; the others are applied directly.
  const [first, ...rest] = styles;
  const props: string[] = [];
  if (first) props.push(`<w:rStyle w:val="${styleId(first)}"/>`);
  for (const id of rest) {
    const c = sheet.character.find((s) => s.id === id);
    if (!c) continue;
    if (c.bold) props.push('<w:b/>');
    if (c.italic) props.push('<w:i/>');
    if (c.smallCaps) props.push('<w:smallCaps/>');
    if (c.underline) props.push('<w:u w:val="single"/>');
  }
  return props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
}

function textRun(text: string, rPr = ''): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

class DocxBody {
  readonly notes: string[] = [];
  constructor(private readonly sheet: StyleSheet) {}

  paragraph(style: string, inner: string): string {
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${inner}</w:p>`;
  }

  inline(nodes: NodeJSON[]): string {
    return nodes
      .map((n) => {
        if (n.type === 'footnote') {
          this.notes.push(String(n.attrs?.text ?? ''));
          return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${this.notes.length}"/></w:r>`;
        }
        return n.type === 'text' ? textRun(n.text ?? '', runProps(this.sheet, charStyles(n))) : '';
      })
      .join('');
  }

  block(n: NodeJSON): string {
    if (n.type === 'paragraph') return this.paragraph(styleId(String(n.attrs?.style ?? BODY_STYLE)), this.inline(n.content ?? []));
    if (n.type === 'sceneBreak') return this.paragraph('cbSceneBreak', textRun('* * *'));
    if (n.type === 'bulletList' || n.type === 'taskList') {
      return (n.content ?? [])
        .map((item) => {
          const mark = n.type === 'taskList' ? (item.attrs?.checked ? '☑ ' : '☐ ') : '• ';
          const text = (item.content ?? []).map((p) => this.inline(p.content ?? [])).join('');
          return this.paragraph('cbListItem', textRun(mark) + text);
        })
        .join('');
    }
    return '';
  }
}

function stylesXml(sheet: StyleSheet): string {
  const out: string[] = [];
  for (const { id, name } of sheet.paragraph) {
    const s = resolveParagraphStyle(sheet, id);
    const ppr = [
      `<w:jc w:val="${ALIGN[s.align]}"/>`,
      `<w:spacing w:before="${Math.round(s.spaceBefore * 20)}" w:after="${Math.round(s.spaceAfter * 20)}" w:line="${Math.round(s.lineSpacing * 240)}" w:lineRule="auto"/>`,
      `<w:ind w:left="${twips(s.sideIndent)}" w:right="${twips(s.sideIndent)}" w:firstLine="${twips(s.firstLineIndent)}"/>`,
    ];
    const rpr = [
      `<w:rFonts w:ascii="${xml(s.font)}" w:hAnsi="${xml(s.font)}" w:cs="${xml(s.font)}"/>`,
      s.bold ? '<w:b/>' : '',
      s.italic ? '<w:i/>' : '',
      `<w:color w:val="${s.color.replace('#', '')}"/>`,
      s.letterSpacing ? `<w:spacing w:val="${Math.round((s.letterSpacing / 100) * s.size * 20)}"/>` : '',
      `<w:sz w:val="${Math.round(s.size * 2)}"/>`,
    ];
    out.push(
      `<w:style w:type="paragraph" w:styleId="${styleId(id)}"${id === BODY_STYLE ? ' w:default="1"' : ''}><w:name w:val="${xml(name)}"/>` +
        `<w:qFormat/><w:pPr>${ppr.join('')}</w:pPr><w:rPr>${rpr.join('')}</w:rPr></w:style>`,
    );
  }
  for (const c of sheet.character) {
    const rpr = [
      c.font ? `<w:rFonts w:ascii="${xml(c.font)}" w:hAnsi="${xml(c.font)}"/>` : '',
      c.bold ? '<w:b/>' : c.bold === false ? '<w:b w:val="0"/>' : '',
      c.italic ? '<w:i/>' : c.italic === false ? '<w:i w:val="0"/>' : '',
      c.smallCaps ? '<w:smallCaps/>' : '',
      c.color ? `<w:color w:val="${c.color.replace('#', '')}"/>` : '',
      c.size ? `<w:sz w:val="${Math.round(c.size * 2)}"/>` : '',
      c.underline ? '<w:u w:val="single"/>' : '',
    ];
    out.push(`<w:style w:type="character" w:styleId="${styleId(c.id)}"><w:name w:val="${xml(c.name)}"/><w:qFormat/><w:rPr>${rpr.join('')}</w:rPr></w:style>`);
  }
  const body = styleId(BODY_STYLE);
  const heading = (n: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="${body}"/><w:next w:val="${body}"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/>${n === 1 ? '<w:pageBreakBefore/>' : ''}<w:jc w:val="center"/><w:spacing w:before="480" w:after="360"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  out.push(
    heading(1, 36),
    heading(2, 30),
    heading(3, 26),
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="${body}"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="4000" w:after="480"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="cbSceneBreak"><w:name w:val="Scene break"/><w:basedOn w:val="${body}"/><w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="cbListItem"><w:name w:val="List item"/><w:basedOn w:val="${body}"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="${body}"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>`,
    `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${out.join('')}</w:styles>`;
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function bookDocx(m: Manuscript, sheet: StyleSheet): Uint8Array {
  const w = new DocxBody(sheet);
  const body: string[] = [w.paragraph('Title', textRun(m.title))];
  for (const part of m.parts) {
    if (part.kind === 'heading') body.push(w.paragraph(`Heading${Math.min(3, part.depth)}`, textRun(part.text)));
    else if (part.kind === 'break') body.push(w.paragraph('cbSceneBreak', textRun('* * *')));
    else body.push(...(part.body.content ?? []).map((n) => w.block(n)));
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body.join('')}<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${w.notes
    .map(
      (text, i) =>
        `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${textRun(' ' + text)}</w:p></w:footnote>`,
    )
    .join('')}</w:footnotes>`;
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': stylesXml(sheet),
    'word/footnotes.xml': footnotes,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(m.title)}</dc:title></cp:coreProperties>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
