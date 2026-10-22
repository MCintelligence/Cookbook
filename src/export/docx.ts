import { strToU8, zipSync } from 'fflate';
import { type NodeJSON, BODY_STYLE, HEADING_STYLES } from '../editor/markdown';
import { type StyleSheet, resolveParagraphStyle } from '../styles/styles';
import { DEFAULT_PAGE, MARGINS, PAGE_SIZES, type PageSettings } from '../storage/page';
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

interface Run {
  styles: string[];
  plain: Set<string>;
  link: boolean;
}

function runProps(sheet: StyleSheet, { styles, plain, link }: Run): string {
  // One character style per run is all Word allows; the others are applied directly.
  const [first, ...rest] = styles;
  const props: string[] = [];
  if (first) props.push(`<w:rStyle w:val="${styleId(first)}"/>`);
  else if (link) props.push('<w:rStyle w:val="Hyperlink"/>');
  let bold = plain.has('bold');
  let italic = plain.has('italic');
  let underline = plain.has('underline');
  let smallCaps = false;
  for (const id of rest) {
    const c = sheet.character.find((s) => s.id === id);
    bold ||= !!c?.bold;
    italic ||= !!c?.italic;
    underline ||= !!c?.underline;
    smallCaps ||= !!c?.smallCaps;
  }
  if (plain.has('code')) props.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
  if (bold) props.push('<w:b/>');
  if (italic) props.push('<w:i/>');
  if (smallCaps) props.push('<w:smallCaps/>');
  if (plain.has('strike')) props.push('<w:strike/>');
  if (link && first) props.push('<w:color w:val="0563C1"/>');
  if (underline || (link && first)) props.push('<w:u w:val="single"/>');
  return props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
}

function textRun(text: string, rPr = ''): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

const PLAIN = new Set(['bold', 'italic', 'underline', 'strike', 'code']);

class DocxBody {
  readonly notes: string[] = [];
  readonly links: string[] = [];
  /** One Word numbering instance per numbered list, so each starts where it should. */
  readonly numbered: number[] = [];
  constructor(
    private readonly sheet: StyleSheet,
    /** The width between the margins, in twentieths of a point. */
    private readonly textWidth = 9360,
  ) {}

  paragraph(style: string, inner: string, extra = ''): string {
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;
  }

  inline(nodes: NodeJSON[]): string {
    return nodes
      .map((n) => {
        if (n.type === 'footnote') {
          this.notes.push(String(n.attrs?.text ?? ''));
          return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${this.notes.length}"/></w:r>`;
        }
        if (n.type === 'hardBreak') return '<w:r><w:br/></w:r>';
        // Pictures aren't carried into exports yet; their description stands in.
        if (n.type === 'image') return n.attrs?.alt ? textRun(`[${String(n.attrs.alt)}]`, '<w:rPr><w:i/></w:rPr>') : '';
        if (n.type !== 'text') return '';
        const link = n.marks?.find((m) => m.type === 'link');
        const plain = new Set((n.marks ?? []).map((m) => m.type).filter((t) => PLAIN.has(t)));
        const run = textRun(n.text ?? '', runProps(this.sheet, { styles: charStyles(n), plain, link: !!link }));
        if (!link || link.type !== 'link') return run;
        this.links.push(link.attrs.href);
        return `<w:hyperlink r:id="rLink${this.links.length}">${run}</w:hyperlink>`;
      })
      .join('');
  }

  block(n: NodeJSON): string {
    if (n.type === 'paragraph') return this.paragraph(styleId(String(n.attrs?.style ?? BODY_STYLE)), this.inline(n.content ?? []));
    if (n.type === 'sceneBreak') return this.paragraph('cbSceneBreak', textRun('* * *'));
    if (n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'taskList') return this.list(n, 0);
    if (n.type === 'codeBlock') {
      const lines = (n.content ?? []).map((t) => t.text ?? '').join('').split('\n');
      return this.paragraph('cbCode', lines.map((l, i) => (i > 0 ? '<w:r><w:br/></w:r>' : '') + textRun(l)).join(''));
    }
    if (n.type === 'table') return this.table(n);
    return '';
  }

  private list(n: NodeJSON, level: number): string {
    // Bullets share Word's list 1; each numbered list gets its own, restarting at its first number.
    let numId = 1;
    if (n.type === 'orderedList') {
      this.numbered.push(Number(n.attrs?.start ?? 1) || 1);
      numId = this.numbered.length + 1;
    }
    return (n.content ?? [])
      .map((item) => {
        const [first, ...rest] = item.content ?? [];
        const text = this.inline(first?.content ?? []);
        const para =
          item.type === 'taskItem'
            ? this.paragraph('cbListItem', textRun(item.attrs?.checked ? '☑ ' : '☐ ') + text, level > 0 ? `<w:ind w:left="${360 * (level + 1)}" w:hanging="360"/>` : '')
            : this.paragraph('cbListItem', text, `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`);
        return para + rest.map((l) => this.list(l, level + 1)).join('');
      })
      .join('');
  }

  private table(n: NodeJSON): string {
    const rows = n.content ?? [];
    const width = Math.max(1, ...rows.map((r) => r.content?.length ?? 0));
    const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
    const grid = Array.from({ length: width }, () => `<w:gridCol w:w="${Math.floor(this.textWidth / width)}"/>`).join('');
    const body = rows
      .map((row) => {
        const cells = Array.from({ length: width }, (_, i) => row.content?.[i]);
        const header = row.content?.[0]?.type === 'tableHeader';
        return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells
          .map((cell) => {
            const text = (cell?.content ?? []).map((p) => this.inline(p.content ?? [])).join('');
            return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(this.textWidth / width)}" w:type="dxa"/></w:tcPr>${this.paragraph(header ? 'cbTableHeader' : 'cbTableText', text)}</w:tc>`;
          })
          .join('')}</w:tr>`;
      })
      .join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl><w:p/>`;
  }
}

function numberingXml(starts: number[]): string {
  const level = (i: number, fmt: string, text: string) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const bullets = Array.from({ length: 9 }, (_, i) => level(i, 'bullet', ['•', '◦', '▪'][i % 3]!)).join('');
  const numbers = Array.from({ length: 9 }, (_, i) => level(i, ['decimal', 'lowerLetter', 'lowerRoman'][i % 3]!, `%${i + 1}.`)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${numbers}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${starts
    .map((start, i) => `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`)
    .join('')}</w:numbering>`;
}

function stylesXml(sheet: StyleSheet): string {
  const out: string[] = [];
  for (const { id, name } of sheet.paragraph) {
    const s = resolveParagraphStyle(sheet, id);
    // Headings get an outline level, so Word's navigation pane lists them.
    const outline = HEADING_STYLES.indexOf(id as (typeof HEADING_STYLES)[number]);
    const ppr = [
      outline !== -1 ? '<w:keepNext/>' : '',
      `<w:spacing w:before="${Math.round(s.spaceBefore * 20)}" w:after="${Math.round(s.spaceAfter * 20)}" w:line="${Math.round(s.lineSpacing * 240)}" w:lineRule="auto"/>`,
      `<w:ind w:left="${twips(s.sideIndent)}" w:right="${twips(s.sideIndent)}" w:firstLine="${twips(s.firstLineIndent)}"/>`,
      `<w:jc w:val="${ALIGN[s.align]}"/>`,
      outline !== -1 ? `<w:outlineLvl w:val="${outline}"/>` : '',
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
      // The alias names the Cookbook style, so importing the file brings each paragraph back in its own style.
      `<w:style w:type="paragraph" w:styleId="${styleId(id)}"${id === BODY_STYLE ? ' w:default="1"' : ''}><w:name w:val="${xml(name)}"/><w:aliases w:val="cb:${xml(id)}"/>` +
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
    out.push(`<w:style w:type="character" w:styleId="${styleId(c.id)}"><w:name w:val="${xml(c.name)}"/><w:aliases w:val="cb:${xml(c.id)}"/><w:qFormat/><w:rPr>${rpr.join('')}</w:rPr></w:style>`);
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
    `<w:style w:type="paragraph" w:styleId="cbListItem"><w:name w:val="List item"/><w:basedOn w:val="${body}"/><w:pPr><w:ind w:left="360" w:hanging="360"/><w:jc w:val="left"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="cbCode"><w:name w:val="Code"/><w:basedOn w:val="${body}"/><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="360" w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="cbTableText"><w:name w:val="Table text"/><w:basedOn w:val="${body}"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="cbTableHeader"><w:name w:val="Table heading"/><w:basedOn w:val="cbTableText"/><w:rPr><w:b/></w:rPr></w:style>`,
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="${body}"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>`,
    `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${out.join('')}</w:styles>`;
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function bookDocx(m: Manuscript, sheet: StyleSheet, page: PageSettings = DEFAULT_PAGE): Uint8Array {
  const twips = (inches: number) => Math.round(inches * 1440);
  const size = PAGE_SIZES[page.size];
  const margin = twips(MARGINS[page.margins].inches);
  const w = new DocxBody(sheet, twips(size.width) - 2 * margin);
  const body: string[] = [w.paragraph('Title', textRun(m.title))];
  for (const part of m.parts) {
    if (part.kind === 'heading') body.push(w.paragraph(`Heading${Math.min(3, part.depth)}`, textRun(part.text)));
    else if (part.kind === 'break') body.push(w.paragraph('cbSceneBreak', textRun('* * *')));
    else body.push(...(part.body.content ?? []).map((n) => w.block(n)));
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body.join('')}<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="${twips(size.width)}" w:h="${twips(size.height)}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${w.notes
    .map(
      (text, i) =>
        `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${textRun(' ' + text)}</w:p></w:footnote>`,
    )
    .join('')}</w:footnotes>`;
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${w.links
      .map((href, i) => `<Relationship Id="rLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(href)}" TargetMode="External"/>`)
      .join('')}</Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': stylesXml(sheet),
    'word/footnotes.xml': footnotes,
    'word/numbering.xml': numberingXml(w.numbered),
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(m.title)}</dc:title></cp:coreProperties>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
