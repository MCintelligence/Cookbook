import { unzipSync, strFromU8 } from 'fflate';
import { type MarkJSON, type NodeJSON, BODY_STYLE, HEADING_STYLES, QUOTE_STYLE, parseMarkdown, serializeMarkdown } from '../editor/markdown';
import { parseDocument } from './document';

/**
 * Turns a file from another app into a scene: its title (from the file name)
 * and its body in Cookbook's Markdown. Plain text, Markdown and Word (.docx)
 * are understood. From Word come bold, italic, underline and strikethrough,
 * links, headings, quotes, numbered and bulleted lists (nested), tables,
 * footnotes and line breaks; a file Cookbook wrote brings its styles back by name.
 */
export interface Imported {
  title: string;
  body: string;
}

export const IMPORTABLE = ['.docx', '.md', '.markdown', '.txt'];

export function canImport(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORTABLE.some((ext) => lower.endsWith(ext));
}

function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || 'Imported';
}

const text = (t: string, marks: MarkJSON[] = []): NodeJSON => (marks.length > 0 ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const para = (content: NodeJSON[], style = BODY_STYLE): NodeJSON => ({ type: 'paragraph', attrs: { style }, content });

export function importText(name: string, source: string): Imported {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  // Blank lines separate paragraphs when there are any; otherwise every line is one.
  const chunks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/).map((c) => c.replace(/\s*\n\s*/g, ' ')) : normalized.split('\n');
  const content = chunks.map((c) => c.trim()).filter(Boolean).map((c) => para([text(c)]));
  return { title: titleOf(name), body: serializeMarkdown({ type: 'doc', content }) };
}

export function importMarkdown(name: string, source: string): Imported {
  let body = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  let title = titleOf(name);
  if (body.startsWith('---\n')) {
    const doc = parseDocument(body, title);
    title = doc.title;
    body = doc.body;
  }
  return { title, body: serializeMarkdown(parseMarkdown(body)) };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const attr = (el: Element | null | undefined, name: string, ns = W) => el?.getAttributeNS(ns, name) ?? el?.getAttribute(`${ns === R ? 'r' : 'w'}:${name}`) ?? null;

/** Whether a run property such as <w:b/> is switched on; "w:val=0" switches it off. */
function on(rPr: Element | null, name: string): boolean | null {
  const prop = rPr ? childrenNamed(rPr, name)[0] : undefined;
  if (!prop) return null;
  const val = attr(prop, 'val');
  return val === null || !['0', 'false', 'none'].includes(val);
}

function childrenNamed(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === name);
}

interface WordStyle {
  /** The Cookbook style it came from, when Cookbook wrote the file. */
  cookbook: string | null;
  name: string;
  rPr: Element | null;
}

export function importDocx(name: string, data: Uint8Array): Imported {
  const wanted = ['word/document.xml', 'word/footnotes.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels'];
  const files = unzipSync(data, { filter: (f) => wanted.includes(f.name) });
  const docXml = files['word/document.xml'];
  if (!docXml) throw new Error('This Word file has no document inside it.');
  const parse = (bytes: Uint8Array | undefined) => (bytes ? new DOMParser().parseFromString(strFromU8(bytes), 'application/xml') : null);
  const doc = parse(docXml)!;

  // Footnote text by id.
  const footnotes = new Map<string, string>();
  for (const fn of Array.from(parse(files['word/footnotes.xml'])?.getElementsByTagNameNS(W, 'footnote') ?? [])) {
    const words = Array.from(fn.getElementsByTagNameNS(W, 't')).map((t) => t.textContent ?? '').join('').trim();
    if (words) footnotes.set(attr(fn, 'id') ?? '', words);
  }
  // Link addresses by relationship id.
  const links = new Map<string, string>();
  for (const rel of Array.from(parse(files['word/_rels/document.xml.rels'])?.getElementsByTagName('Relationship') ?? [])) {
    if (rel.getAttribute('Type')?.endsWith('/hyperlink')) links.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }
  const styles = new Map<string, WordStyle>();
  for (const st of Array.from(parse(files['word/styles.xml'])?.getElementsByTagNameNS(W, 'style') ?? [])) {
    const alias = attr(childrenNamed(st, 'aliases')[0], 'val') ?? '';
    styles.set(attr(st, 'styleId') ?? '', {
      cookbook: /^cb:[A-Za-z0-9_-]+$/.test(alias) ? alias.slice(3) : null,
      name: (attr(childrenNamed(st, 'name')[0], 'val') ?? '').toLowerCase(),
      rPr: childrenNamed(st, 'rPr')[0] ?? null,
    });
  }
  // Whether each list (and level) is numbered or bulleted.
  const numbering = parse(files['word/numbering.xml']);
  const abstract = new Map<string, Element>();
  for (const a of Array.from(numbering?.getElementsByTagNameNS(W, 'abstractNum') ?? [])) abstract.set(attr(a, 'abstractNumId') ?? '', a);
  const numbered = (numId: string, level: number): boolean => {
    const num = Array.from(numbering?.getElementsByTagNameNS(W, 'num') ?? []).find((n) => attr(n, 'numId') === numId);
    const lvl = Array.from(abstract.get(attr(childrenNamed(num ?? doc.documentElement, 'abstractNumId')[0], 'val') ?? '')?.getElementsByTagNameNS(W, 'lvl') ?? []).find((l) => attr(l, 'ilvl') === String(level));
    const fmt = attr(lvl ? childrenNamed(lvl, 'numFmt')[0] : null, 'val');
    return fmt !== null && fmt !== 'bullet' && fmt !== 'none';
  };

  const paragraphStyle = (styleId: string): string => {
    const st = styles.get(styleId);
    if (st?.cookbook) return st.cookbook;
    const id = styleId.toLowerCase();
    const named = st?.name ?? id;
    if (/^title$|^heading ?1$/.test(named) || /^(title|heading1)$/.test(id)) return HEADING_STYLES[0];
    if (/^(subtitle|heading ?2)$/.test(named) || /^(subtitle|heading2)$/.test(id)) return HEADING_STYLES[1];
    if (/^heading ?[3-9]$/.test(named) || /^heading[3-9]$/.test(id)) return HEADING_STYLES[2];
    if (/quote/.test(named) || /quote/.test(id)) return QUOTE_STYLE;
    return BODY_STYLE;
  };

  /** A paragraph's runs as inline nodes. */
  const inline = (p: Element): NodeJSON[] => {
    const nodes: NodeJSON[] = [];
    const push = (t: string, marks: MarkJSON[]) => {
      const prev = nodes[nodes.length - 1];
      if (prev?.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(marks)) prev.text += t;
      else nodes.push(text(t, marks));
    };
    const runs = (el: Element, link: string | null) => {
      for (const c of Array.from(el.children)) {
        if (c.namespaceURI !== W) continue;
        // Deleted tracked changes aren't part of the text.
        if (c.localName === 'del' || c.localName === 'moveFrom') continue;
        if (c.localName === 'hyperlink') runs(c, safeLink(links.get(attr(c, 'id', R) ?? '') ?? null) ?? link);
        else if (c.localName === 'ins' || c.localName === 'smartTag' || c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'fldSimple' || c.localName === 'moveTo') runs(c, link);
        else if (c.localName === 'r') run(c, link);
      }
    };
    const run = (r: Element, link: string | null) => {
      const rPr = childrenNamed(r, 'rPr')[0] ?? null;
      const rStyleId = attr(rPr ? childrenNamed(rPr, 'rStyle')[0] : null, 'val') ?? '';
      const rStyle = styles.get(rStyleId);
      const marks: MarkJSON[] = [];
      if (link) marks.push({ type: 'link', attrs: { href: link } });
      // Cookbook's own character styles come back by name; other apps' styles only bring their look.
      if (rStyle?.cookbook) marks.push({ type: 'charStyle', attrs: { style: rStyle.cookbook } });
      const has = (prop: string) => on(rPr, prop) ?? (rStyle?.cookbook || rStyleId === 'Hyperlink' ? false : (on(rStyle?.rPr ?? null, prop) ?? false));
      if (has('b')) marks.push({ type: 'bold' });
      if (has('i')) marks.push({ type: 'italic' });
      if (has('u') && !link) marks.push({ type: 'underline' });
      if (has('strike') || has('dstrike')) marks.push({ type: 'strike' });
      const font = attr(rPr ? childrenNamed(rPr, 'rFonts')[0] : null, 'ascii') ?? '';
      if (/courier|consolas|mono/i.test(font)) marks.push({ type: 'code' });
      for (const c of Array.from(r.children)) {
        if (c.namespaceURI !== W) continue;
        if (c.localName === 't') push(c.textContent ?? '', marks);
        else if (c.localName === 'tab') push(' ', marks);
        else if ((c.localName === 'br' && attr(c, 'type') !== 'page') || c.localName === 'cr') nodes.push({ type: 'hardBreak' });
        else if (c.localName === 'noBreakHyphen') push('-', marks);
        else if (c.localName === 'footnoteReference') {
          const note = footnotes.get(attr(c, 'id') ?? '');
          if (note) nodes.push({ type: 'footnote', attrs: { text: note } });
        }
      }
    };
    runs(p, null);
    // Leading and trailing spaces in a paragraph don't survive the file format anyway.
    while (nodes[0]?.type === 'hardBreak') nodes.shift();
    while (nodes[nodes.length - 1]?.type === 'hardBreak') nodes.pop();
    const first = nodes[0];
    if (first?.type === 'text') first.text = first.text!.replace(/^\s+/, '');
    const last = nodes[nodes.length - 1];
    if (last?.type === 'text') last.text = last.text!.replace(/\s+$/, '');
    return nodes.filter((n) => n.type !== 'text' || n.text !== '');
  };

  const content: NodeJSON[] = [];
  // Open lists by level, so indented items nest.
  let lists: { level: number; node: NodeJSON }[] = [];
  const endLists = () => (lists = []);
  let code: string[] | null = null;
  const endCode = () => {
    if (code) content.push({ type: 'codeBlock', attrs: { language: null }, ...(code.join('\n') ? { content: [{ type: 'text', text: code.join('\n') }] } : {}) });
    code = null;
  };

  const addItem = (level: number, kind: 'bulletList' | 'orderedList' | 'taskList', item: NodeJSON) => {
    while (lists.length > 0 && lists[lists.length - 1]!.level > level) lists.pop();
    let top = lists[lists.length - 1];
    if (top && top.level === level && top.node.type !== kind) {
      lists.pop();
      top = lists[lists.length - 1];
    }
    if (!top || top.level < level) {
      const node: NodeJSON = { type: kind, ...(kind === 'orderedList' ? { attrs: { start: 1 } } : {}), content: [] };
      if (top) {
        const items = top.node.content!;
        items[items.length - 1]!.content!.push(node);
      } else content.push(node);
      top = { level, node };
      lists.push(top);
    }
    top.node.content!.push(item);
  };

  // Word keeps a drop cap in a little paragraph of its own; it comes back as !Word on the paragraph after it.
  let dropCap: string | null = null;
  const paragraph = (p: Element) => {
    const pPr = childrenNamed(p, 'pPr')[0] ?? null;
    const styleId = attr(pPr ? childrenNamed(pPr, 'pStyle')[0] : null, 'val') ?? '';
    const nodes = inline(p);
    const plain = nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'hardBreak' ? '\n' : '')).join('');
    const frame = pPr ? childrenNamed(pPr, 'framePr')[0] : undefined;
    if (frame && /^(drop|margin)$/.test(attr(frame, 'dropCap') ?? '') && /^\p{L}+$/u.test(plain.trim())) {
      dropCap = plain.trim();
      return;
    }
    if (dropCap) {
      if (nodes[0]?.type === 'text') nodes[0].text = `!${dropCap}${nodes[0].text}`;
      else nodes.unshift(text(`!${dropCap}`));
      dropCap = null;
    }
    if (styleId === 'cbCode') {
      endLists();
      code ??= [];
      code.push(plain);
      return;
    }
    endCode();
    const hasText = nodes.some((n) => n.type !== 'text' || (n.text ?? '').trim() !== '');
    if (!hasText) return;
    if (styleId === 'cbSceneBreak' || /^(\*\s*\*\s*\*|#)$/.test(plain.trim())) {
      endLists();
      content.push({ type: 'sceneBreak' });
      return;
    }
    const numPr = pPr ? childrenNamed(pPr, 'numPr')[0] : undefined;
    const box = /^([•☐☑])\s*/.exec(plain);
    if (numPr || styleId === 'cbListItem') {
      const level = Number(attr(numPr ? childrenNamed(numPr, 'ilvl')[0] : null, 'val') ?? (Number(attr(pPr ? childrenNamed(pPr, 'ind')[0] : null, 'left') ?? 360) / 360 - 1));
      const numId = attr(numPr ? childrenNamed(numPr, 'numId')[0] : null, 'val');
      if (box && nodes[0]?.type === 'text') nodes[0].text = nodes[0].text!.slice(box[0].length);
      const kept = nodes.filter((n) => n.type !== 'text' || n.text !== '');
      const task = box?.[1] === '☐' || box?.[1] === '☑';
      const item: NodeJSON = task ? { type: 'taskItem', attrs: { checked: box![1] === '☑' }, content: [para(kept)] } : { type: 'listItem', content: [para(kept)] };
      addItem(Math.max(0, Math.round(level) || 0), task ? 'taskList' : numId && numbered(numId, level) ? 'orderedList' : 'bulletList', item);
      return;
    }
    endLists();
    content.push(para(nodes, paragraphStyle(styleId)));
  };

  const table = (tbl: Element) => {
    endLists();
    endCode();
    const rows = childrenNamed(tbl, 'tr').map((tr) =>
      childrenNamed(tr, 'tc').flatMap((tc) => {
        const words = childrenNamed(tc, 'p').map(inline).filter((n) => n.length > 0);
        // A cell merged across columns becomes that many cells, the first holding the words.
        const span = Number(attr(childrenNamed(childrenNamed(tc, 'tcPr')[0] ?? tc, 'gridSpan')[0], 'val') ?? 1);
        const cell = words.flatMap((n, i) => (i > 0 ? [text(' '), ...n] : n));
        return [cell, ...Array.from({ length: Math.max(0, Math.min(50, span - 1)) }, () => [] as NodeJSON[])];
      }),
    );
    if (rows.length === 0) return;
    const width = Math.max(1, ...rows.map((r) => r.length));
    content.push({
      type: 'table',
      content: rows.map((cells, r) => ({
        type: 'tableRow',
        content: Array.from({ length: width }, (_, c) => ({ type: r === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', ...(cells[c]?.length ? { content: cells[c] } : {}) }] })),
      })),
    });
  };

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.namespaceURI !== W) continue;
      if (child.localName === 'p') paragraph(child);
      else if (child.localName === 'tbl') table(child);
      else if (child.localName === 'sdt' || child.localName === 'sdtContent' || child.localName === 'customXml') walk(child);
    }
  };
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (body) walk(body);
  endCode();
  return { title: titleOf(name), body: serializeMarkdown({ type: 'doc', content }) };
}

function safeLink(href: string | null): string | null {
  return href && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

export function importFile(name: string, data: Uint8Array): Imported {
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) return importDocx(name, data);
  const source = strFromU8(data);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return importMarkdown(name, source);
  if (lower.endsWith('.txt')) return importText(name, source);
  throw new Error(`Cookbook can't import ${name}. It can bring in Word (.docx), Markdown (.md) and plain text (.txt) files.`);
}
