import { unzipSync, strFromU8 } from 'fflate';
import { type MarkJSON, type NodeJSON, BODY_STYLE, parseMarkdown, serializeMarkdown } from '../editor/markdown';
import { parseDocument } from './document';

/**
 * Turns a file from another app into a scene: its title (from the file name)
 * and its body in Cookbook's Markdown. Plain text, Markdown and Word (.docx)
 * are understood; bold, italic, underline, headings, lists and footnotes
 * come across from Word.
 */
export interface Imported {
  title: string;
  body: string;
}

export const IMPORTABLE = ['.docx', '.md', '.markdown', '.txt'];
const CHAPTER_TITLE = 'chapter-title';
const SCENE_BREAK_STYLE = '\u0000break';

export function canImport(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORTABLE.some((ext) => lower.endsWith(ext));
}

function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || 'Imported';
}

const text = (t: string, marks: MarkJSON[] = []): NodeJSON => (marks.length > 0 ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const para = (content: NodeJSON[], style = BODY_STYLE): NodeJSON => ({ type: 'paragraph', attrs: { style }, content });
const charStyle = (style: string): MarkJSON => ({ type: 'charStyle', attrs: { style } });

export function importText(name: string, source: string): Imported {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  // Blank lines separate paragraphs when there are any; otherwise every line is one.
  const chunks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/).map((c) => c.replace(/\s*\n\s*/g, ' ')) : normalized.split('\n');
  const content = chunks.map((c) => c.trim()).filter(Boolean).map((c) => para([text(c)]));
  return { title: titleOf(name), body: serializeMarkdown({ type: 'doc', content }) };
}

export function importMarkdown(name: string, source: string): Imported {
  let body = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  let title = titleOf(name);
  if (body.startsWith('---\n')) {
    const doc = parseDocument(body, title);
    title = doc.title;
    body = doc.body;
  }
  // Headings become Chapter title paragraphs until Cookbook has heading styles of its own.
  body = body.replace(/^#{1,6}[ \t]+(.+?)[ \t#]*$/gm, (_, heading: string) => `::: ${CHAPTER_TITLE}\n${heading}\n:::\n`);
  return { title, body: serializeMarkdown(parseMarkdown(body)) };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function on(el: Element | null, name: string): boolean {
  const prop = el?.getElementsByTagNameNS(W, name)[0];
  if (!prop) return false;
  const val = prop.getAttributeNS(W, 'val') ?? prop.getAttribute('w:val');
  return val === null || !['0', 'false', 'none'].includes(val);
}

function childrenNamed(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === name);
}

export function importDocx(name: string, data: Uint8Array): Imported {
  const files = unzipSync(data, { filter: (f) => f.name === 'word/document.xml' || f.name === 'word/footnotes.xml' || f.name === 'word/styles.xml' });
  const docXml = files['word/document.xml'];
  if (!docXml) throw new Error('This Word file has no document inside it.');
  const parse = (bytes: Uint8Array) => new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  const doc = parse(docXml);

  // Footnote text by id.
  const footnotes = new Map<string, string>();
  if (files['word/footnotes.xml']) {
    for (const fn of Array.from(parse(files['word/footnotes.xml']).getElementsByTagNameNS(W, 'footnote'))) {
      const id = fn.getAttributeNS(W, 'id') ?? fn.getAttribute('w:id') ?? '';
      const words = Array.from(fn.getElementsByTagNameNS(W, 't')).map((t) => t.textContent ?? '').join('').trim();
      if (words) footnotes.set(id, words);
    }
  }
  // Style ids whose display name is a title or heading, and what each character style looks like.
  const headings = new Set<string>();
  const runStyles = new Map<string, Element | null>();
  if (files['word/styles.xml']) {
    for (const st of Array.from(parse(files['word/styles.xml']).getElementsByTagNameNS(W, 'style'))) {
      const id = st.getAttributeNS(W, 'styleId') ?? st.getAttribute('w:styleId') ?? '';
      const display = st.getElementsByTagNameNS(W, 'name')[0]?.getAttributeNS(W, 'val') ?? '';
      if (/^(title|heading ?1|heading ?2)$/i.test(display) || /^(Title|Heading[12])$/.test(id)) headings.add(id);
      if ((st.getAttributeNS(W, 'type') ?? st.getAttribute('w:type')) === 'character') runStyles.set(id, childrenNamed(st, 'rPr')[0] ?? null);
    }
  }
  headings.add('Title').add('Heading1').add('Heading2');

  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const content: NodeJSON[] = [];
  let list: NodeJSON[] | null = null;
  const endList = () => {
    if (list && list.length > 0) {
      // A run of checkboxes is a task list; anything else is bullets.
      const tasks = list.every((item) => item.type === 'taskItem');
      content.push({ type: tasks ? 'taskList' : 'bulletList', content: list.map((item) => (tasks || item.type === 'listItem' ? item : { type: 'listItem', content: item.content })) });
    }
    list = null;
  };

  const paragraph = (p: Element): { nodes: NodeJSON[]; style: string; listItem: boolean } => {
    const pPr = childrenNamed(p, 'pPr')[0] ?? null;
    const styleEl = pPr ? childrenNamed(pPr, 'pStyle')[0] : undefined;
    const styleId = styleEl?.getAttributeNS(W, 'val') ?? styleEl?.getAttribute('w:val') ?? '';
    const nodes: NodeJSON[] = [];
    const push = (t: string, marks: MarkJSON[]) => {
      const prev = nodes[nodes.length - 1];
      const key = marks.map((m) => (m.type === 'charStyle' ? m.attrs.style : '')).join(' ');
      const prevKey = (prev?.marks ?? []).map((m) => (m.type === 'charStyle' ? m.attrs.style : '')).join(' ');
      if (prev?.type === 'text' && key === prevKey) prev.text += t;
      else nodes.push(text(t, marks));
    };
    for (const r of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
      // Deleted tracked changes and field codes aren't part of the text.
      if (r.closest?.('del') || (r.parentElement?.localName === 'del')) continue;
      const rPr = childrenNamed(r, 'rPr')[0] ?? null;
      // Formatting set on the run wins over its character style (Cookbook's own Word files use styles).
      const rStyle = rPr ? childrenNamed(rPr, 'rStyle')[0] : undefined;
      const styled = runStyles.get(rStyle?.getAttributeNS(W, 'val') ?? rStyle?.getAttribute('w:val') ?? '') ?? null;
      const has = (name: string) => (rPr && childrenNamed(rPr, name).length > 0 ? on(rPr, name) : on(styled, name));
      const marks: MarkJSON[] = [];
      if (has('b')) marks.push(charStyle('strong'));
      if (has('i')) marks.push(charStyle('emphasis'));
      if (has('u')) marks.push(charStyle('underline'));
      for (const c of Array.from(r.children)) {
        if (c.namespaceURI !== W) continue;
        if (c.localName === 't') push(c.textContent ?? '', marks);
        else if (c.localName === 'tab' || c.localName === 'br' || c.localName === 'cr') push(' ', marks);
        else if (c.localName === 'noBreakHyphen') push('-', marks);
        else if (c.localName === 'footnoteReference') {
          const note = footnotes.get(c.getAttributeNS(W, 'id') ?? c.getAttribute('w:id') ?? '');
          if (note) nodes.push({ type: 'footnote', attrs: { text: note } });
        }
      }
    }
    // Cookbook's own Word files write list items and scene breaks as plain paragraphs in their own styles.
    const listItem = !!(pPr && childrenNamed(pPr, 'numPr').length > 0) || styleId === 'cbListItem';
    return { nodes, style: headings.has(styleId) ? CHAPTER_TITLE : styleId === 'cbSceneBreak' ? SCENE_BREAK_STYLE : BODY_STYLE, listItem };
  };

  for (const el of body ? Array.from(body.children) : []) {
    if (el.namespaceURI !== W) continue;
    const ps = el.localName === 'p' ? [el] : el.localName === 'tbl' ? Array.from(el.getElementsByTagNameNS(W, 'p')) : [];
    for (const p of ps) {
      const { nodes, style, listItem } = paragraph(p);
      const hasText = nodes.some((n) => n.type !== 'text' || (n.text ?? '').trim() !== '');
      if (!hasText) continue;
      // Leading and trailing spaces in a paragraph don't survive the file format anyway.
      const first = nodes[0];
      if (first?.type === 'text') first.text = first.text!.replace(/^\s+/, '');
      const last = nodes[nodes.length - 1];
      if (last?.type === 'text') last.text = last.text!.replace(/\s+$/, '');
      const kept = nodes.filter((n) => n.type !== 'text' || n.text !== '');
      const plain = kept.map((n) => n.text ?? '').join('');
      if (style === SCENE_BREAK_STYLE || /^(\*\s*\*\s*\*|#)$/.test(plain)) {
        endList();
        content.push({ type: 'sceneBreak' });
      } else if (listItem) {
        const box = /^([•☐☑])\s*/.exec(plain);
        if (box && kept[0]?.type === 'text') kept[0].text = kept[0].text!.slice(box[0].length);
        const item = kept.filter((n) => n.type !== 'text' || n.text !== '');
        list ??= [];
        list.push(box?.[1] === '☐' || box?.[1] === '☑' ? { type: 'taskItem', attrs: { checked: box[1] === '☑' }, content: [para(item)] } : { type: 'listItem', content: [para(item)] });
      } else {
        endList();
        content.push(para(kept, style));
      }
    }
  }
  endList();
  return { title: titleOf(name), body: serializeMarkdown({ type: 'doc', content }) };
}

export function importFile(name: string, data: Uint8Array): Imported {
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) return importDocx(name, data);
  const source = strFromU8(data);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return importMarkdown(name, source);
  if (lower.endsWith('.txt')) return importText(name, source);
  throw new Error(`Cookbook can't import ${name}. It can bring in Word (.docx), Markdown (.md) and plain text (.txt) files.`);
}
