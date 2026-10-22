/**
 * The scene body format: Markdown with Pandoc-style tags, so files stay
 * readable in any editor and open in other Markdown apps.
 *
 *   Ordinary paragraphs are Body text, separated by blank lines.
 *
 *   # Chapter title    ## Heading 2    ### Heading 3    > a Quote
 *
 *   ::: letter
 *   A paragraph in any other style, such as Letter.
 *   :::
 *
 *   * * *                      a scene break
 *   - a list item              1. a numbered item     (indent to nest)
 *   - [ ] a checklist item     (- [x] when ticked)
 *   | a | table |              with a | --- | line under the first row
 *   ```                        a code block, ended by another ```
 *
 *   **bold**  *italic*  [underline]{.ul}  ~~struck~~  `code`  [a link](https://…)
 *   ![a picture](pantry/pictures/lou.jpg)
 *   [any character style]{.thought}   [text a note is attached to]{.note #n1}
 *   ^[an inline footnote]     a line ending in \ breaks the line there
 *
 * Bold, italic and so on are plain formatting; character styles such as
 * Strong and Emphasis are always written in brackets, so restyling one
 * restyles every use. Every literal *, _, ~, `, [, ] and \ is escaped, so
 * every unescaped one is markup. Both functions work on ProseMirror JSON and
 * need no editor, so they run in tests and on any platform.
 */

export type PlainMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
export type MarkJSON =
  | { type: 'charStyle'; attrs: { style: string } }
  | { type: 'note'; attrs: { id: string } }
  | { type: 'link'; attrs: { href: string } }
  | { type: PlainMark; attrs?: undefined };

export interface NodeJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJSON[];
  text?: string;
  marks?: MarkJSON[];
}

export const BODY_STYLE = 'body';
/** Paragraph styles written with Markdown's own syntax rather than a ::: fence. */
export const HEADING_STYLES = ['chapter-title', 'heading-2', 'heading-3'] as const;
export const QUOTE_STYLE = 'quote';
const SCENE_BREAK = '* * *';
const FENCE = ':::';
const NOTE_PREFIX = 'note#';
const LINK_PREFIX = '@';
/** Internal keys for plain formatting. Style ids can't start with *, so they never clash. */
const PLAIN_KEY: Record<PlainMark, string> = { bold: '*b', italic: '*i', underline: '*u', strike: '*s', code: '*c' };
const KEY_PLAIN = Object.fromEntries(Object.entries(PLAIN_KEY).map(([k, v]) => [v, k])) as Record<string, PlainMark>;
/** Outermost first: notes, links, character styles, then bold, italic, underline, strike, and code innermost. */
const RANK: Record<string, number> = { '*b': 1, '*i': 2, '*u': 3, '*s': 4, '*c': 5 };

/** Marks are handled internally as string keys: a style id, *b for bold, note#<id>, @<href>. */
export function markKey(m: MarkJSON): string {
  if (m.type === 'note') return NOTE_PREFIX + m.attrs.id;
  if (m.type === 'charStyle') return m.attrs.style;
  if (m.type === 'link') return LINK_PREFIX + m.attrs.href;
  return PLAIN_KEY[m.type];
}

function keyToMark(key: string): MarkJSON {
  if (key.startsWith(NOTE_PREFIX)) return { type: 'note', attrs: { id: key.slice(NOTE_PREFIX.length) } };
  if (key.startsWith(LINK_PREFIX)) return { type: 'link', attrs: { href: key.slice(LINK_PREFIX.length) } };
  if (KEY_PLAIN[key]) return { type: KEY_PLAIN[key]! };
  return { type: 'charStyle', attrs: { style: key } };
}

// ---------- parsing blocks ----------

const LIST_ITEM = /^( *)([-*]|\d{1,3}[.)])( +)(?:\[([ xX])\] +)?(.*)$/;
const TABLE_RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const CODE_FENCE = /^(`{3,}|~{3,})\s*([^`\s]*)\s*$/;

type ListKind = 'bullet' | 'ordered' | 'task';
interface OpenList {
  indent: number;
  /** Where the newest item's text starts; lines indented this far belong to it. */
  content: number;
  kind: ListKind;
  node: NodeJSON;
}

export function parseMarkdown(markdown: string): NodeJSON {
  const lines = markdown.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const content: NodeJSON[] = [];
  let style = BODY_STYLE;
  let paragraph: string[] = [];
  let lists: OpenList[] = [];
  // Each list item's lines, made into its paragraph when the list ends.
  const itemLines = new Map<NodeJSON, string[]>();

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    content.push(paragraphNode(paragraph, style));
    paragraph = [];
  };
  const flushList = () => {
    for (const [item, source] of itemLines) {
      const para = paragraphNode(source, BODY_STYLE, false);
      item.content!.splice(0, 1, para);
    }
    itemLines.clear();
    lists = [];
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };
  const newList = (kind: ListKind, start: number): NodeJSON =>
    kind === 'bullet' ? { type: 'bulletList', content: [] } : kind === 'task' ? { type: 'taskList', content: [] } : { type: 'orderedList', attrs: { start }, content: [] };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '') {
      flush();
      continue;
    }

    const code = CODE_FENCE.exec(trimmed);
    if (code) {
      flush();
      const close = new RegExp(`^${code[1]![0] === '`' ? '`' : '~'}{${code[1]!.length},}\\s*$`);
      const body: string[] = [];
      for (i++; i < lines.length && !close.test(lines[i]!.trim()); i++) body.push(lines[i]!);
      const text = body.join('\n');
      content.push({ type: 'codeBlock', attrs: { language: code[2] || null }, ...(text ? { content: [{ type: 'text', text }] } : {}) });
      continue;
    }

    const fence = /^:::\s*\{?\.?([A-Za-z0-9_-]+)\}?\s*$/.exec(trimmed);
    if (fence && style === BODY_STYLE) {
      flush();
      style = fence[1]!;
      continue;
    }
    if (trimmed === FENCE && style !== BODY_STYLE) {
      flush();
      style = BODY_STYLE;
      continue;
    }

    // Inside a list, an indented line carries on the item above it.
    const top = lists[lists.length - 1];
    const indent = raw.length - raw.trimStart().length;
    const item = LIST_ITEM.exec(raw);
    if (top && !item && indent >= top.content) {
      const items = top.node.content!;
      itemLines.get(items[items.length - 1]!)!.push(raw);
      continue;
    }

    if (paragraph.length === 0 && /^(\* \* \*|\*\*\*+|---+)$/.test(trimmed)) {
      flush();
      content.push({ type: 'sceneBreak' });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(heading[1]!.length, HEADING_STYLES.length);
      content.push(paragraphNode([heading[2]!], HEADING_STYLES[level - 1]!));
      continue;
    }

    if (trimmed.startsWith('>')) {
      flush();
      // A run of > lines; a > on its own separates paragraphs.
      for (; i < lines.length && lines[i]!.trim().startsWith('>'); i++) {
        const inner = lines[i]!.trimStart().replace(/^>\s?/, '');
        if (inner.trim() === '') flushParagraph();
        else paragraph.push(inner);
        style = style === BODY_STYLE ? QUOTE_STYLE : style;
      }
      i--;
      flushParagraph();
      if (style === QUOTE_STYLE) style = BODY_STYLE;
      continue;
    }

    if (trimmed.startsWith('|') && paragraph.length === 0 && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!.trim()) && lines[i + 1]!.includes('-')) {
      flush();
      const rows: string[][] = [splitRow(trimmed)];
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith('|'); i++) rows.push(splitRow(lines[i]!.trim()));
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      content.push({
        type: 'table',
        content: rows.map((cells, r) => ({
          type: 'tableRow',
          content: Array.from({ length: width }, (_, c) => ({
            type: r === 0 ? 'tableHeader' : 'tableCell',
            content: [paragraphNode([cells[c] ?? ''], BODY_STYLE, false)],
          })),
        })),
      });
      continue;
    }

    if (item && paragraph.length === 0) {
      const [, spaces, marker, gap, box, text] = item;
      const kind: ListKind = box !== undefined ? 'task' : /\d/.test(marker!) ? 'ordered' : 'bullet';
      const at = spaces!.length;
      const textAt = at + marker!.length + Math.min(gap!.length, 4);
      while (lists.length > 0 && at < lists[lists.length - 1]!.indent) lists.pop();
      let open = lists[lists.length - 1];
      if (open && at >= open.content) {
        // Indented under the item above: a list inside that item.
        const node = newList(kind, parseInt(marker!, 10) || 1);
        const items = open.node.content!;
        items[items.length - 1]!.content!.push(node);
        open = { indent: at, content: textAt, kind, node };
        lists.push(open);
      } else if (!open || open.kind !== kind) {
        if (open) lists.pop();
        const node = newList(kind, parseInt(marker!, 10) || 1);
        const parent = lists[lists.length - 1];
        if (parent) {
          const items = parent.node.content!;
          items[items.length - 1]!.content!.push(node);
        } else {
          flushParagraph();
          if (!open) flushList();
          content.push(node);
        }
        open = { indent: at, content: textAt, kind, node };
        lists.push(open);
      }
      open.content = textAt;
      const node: NodeJSON =
        kind === 'task'
          ? { type: 'taskItem', attrs: { checked: box !== ' ' }, content: [{ type: 'paragraph' }] }
          : { type: 'listItem', content: [{ type: 'paragraph' }] };
      open.node.content!.push(node);
      itemLines.set(node, [text!]);
      continue;
    }

    flushList();
    paragraph.push(raw);
  }
  flush();
  if (content.length === 0) content.push({ type: 'paragraph', attrs: { style: BODY_STYLE } });
  return { type: 'doc', content };
}

/** A table row's cells, split at unescaped pipes. */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '\\' && i + 1 < row.length) {
      cell += ch + row[i + 1];
      i++;
    } else if (ch === '|') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  // The pipes at either end don't start or end a cell.
  if (row.startsWith('|')) cells.shift();
  if (row.trimEnd().endsWith('|') && !row.trimEnd().endsWith('\\|')) cells.pop();
  return cells.map((c) => c.trim());
}

/**
 * Joins a paragraph's lines. A line ending in a backslash (or two spaces)
 * breaks the line there; otherwise lines run together with a space.
 */
function paragraphNode(lines: string[], style: string, withStyle = true): NodeJSON {
  let source = '';
  lines.forEach((raw, i) => {
    let line = raw.trim();
    const last = i === lines.length - 1;
    const slashes = /\\*$/.exec(line)![0].length;
    let hard = false;
    if (!last && slashes % 2 === 1) {
      line = line.slice(0, -1);
      hard = true;
    } else if (!last && / {2,}$/.test(raw)) hard = true;
    source += line + (last ? '' : hard ? '\n' : ' ');
  });
  const inline = parseInline(source);
  const node: NodeJSON = { type: 'paragraph' };
  if (withStyle) node.attrs = { style };
  if (inline.length > 0) node.content = inline;
  return node;
}

// ---------- parsing inline ----------

type Delim = '*' | '_' | '~';
type Token =
  | { kind: 'text'; text: string }
  | { kind: 'delim'; char: Delim; count: number; left: number; canOpen: boolean; canClose: boolean }
  | { kind: 'open' }
  | { kind: 'close'; style: string; raw: string }
  | { kind: 'footnote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'break' };

const unescape = (s: string) => s.replace(/\\(.)/g, '$1');
const wordChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  const pushText = () => {
    if (text) tokens.push({ kind: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      pushText();
      tokens.push({ kind: 'break' });
      i++;
      continue;
    }
    if (ch === '`') {
      let j = i;
      while (src[j] === '`') j++;
      const ticks = src.slice(i, j);
      // A code span runs to the next run of exactly as many backticks.
      const end = new RegExp(`(?<!\`)${ticks}(?!\`)`, 'g');
      end.lastIndex = j;
      const m = end.exec(src);
      if (m) {
        let code = src.slice(j, m.index).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1);
        pushText();
        tokens.push({ kind: 'code', text: code });
        i = m.index + ticks.length;
        continue;
      }
      text += ticks;
      i = j;
      continue;
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      let j = i;
      while (src[j] === ch) j++;
      const before = i > 0 ? src[i - 1]! : ' ';
      const after = j < src.length ? src[j]! : ' ';
      const count = j - i;
      if (ch === '~' && count < 2) {
        text += src.slice(i, j);
        i = j;
        continue;
      }
      pushText();
      let canOpen = !/\s/.test(after);
      let canClose = !/\s/.test(before);
      // Underscores inside a word, as in snake_case, are just underscores.
      if (ch === '_') {
        canOpen &&= !wordChar(before);
        canClose &&= !wordChar(after);
      }
      tokens.push({ kind: 'delim', char: ch, count, left: count, canOpen, canClose });
      i = j;
      continue;
    }
    if (ch === '^' && src[i + 1] === '[') {
      // An inline footnote runs to the first unescaped ].
      let j = i + 2;
      let note = '';
      while (j < src.length && src[j] !== ']') {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        note += src[j];
        j++;
      }
      if (j < src.length) {
        pushText();
        tokens.push({ kind: 'footnote', text: note });
        i = j + 1;
        continue;
      }
    }
    if (ch === '!' && src[i + 1] === '[') {
      const m = /^!\[((?:\\.|[^\]\\])*)\]\((<[^>\n]*>|(?:\\.|[^()\s\\])+)(?:\s+"(?:\\.|[^"\\])*")?\)/.exec(src.slice(i));
      if (m) {
        pushText();
        tokens.push({ kind: 'image', alt: unescape(m[1]!), src: unescape(m[2]!.replace(/^<|>$/g, '')) });
        i += m[0].length;
        continue;
      }
    }
    if (ch === '[') {
      pushText();
      tokens.push({ kind: 'open' });
      i++;
      continue;
    }
    if (ch === ']') {
      const rest = src.slice(i);
      const m = /^\]\{\.([A-Za-z0-9_-]+)(?: #([A-Za-z0-9_-]+))?\}/.exec(rest);
      if (m && (m[2] === undefined || m[1] === 'note')) {
        pushText();
        const style = m[2] !== undefined ? NOTE_PREFIX + m[2] : m[1] === 'ul' ? PLAIN_KEY.underline : m[1]!;
        tokens.push({ kind: 'close', style, raw: m[0] });
        i += m[0].length;
        continue;
      }
      const link = /^\]\((<[^>\n]*>|(?:\\.|[^()\s\\]|\((?:\\.|[^()\s\\])*\))*)(?:\s+"(?:\\.|[^"\\])*")?\)/.exec(rest);
      if (link) {
        pushText();
        tokens.push({ kind: 'close', style: LINK_PREFIX + unescape(link[1]!.replace(/^<|>$/g, '')), raw: link[0] });
        i += link[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  pushText();
  return tokens;
}

interface Span {
  from: number;
  to: number;
  style: string;
}

export function parseInline(src: string): NodeJSON[] {
  const tokens = tokenize(src);
  const spans: Span[] = [];
  const openers: Record<Delim, number[]> = { '*': [], _: [], '~': [] };
  const bracketOpeners: number[] = [];
  const literal = new Set<number>();

  tokens.forEach((t, i) => {
    if (t.kind === 'delim') {
      const stack = openers[t.char];
      if (t.canClose) {
        // Always match the nearest opener; it may be used twice (***both***).
        while (t.left > 0 && stack.length > 0) {
          const oi = stack[stack.length - 1]!;
          const opener = tokens[oi] as Extract<Token, { kind: 'delim' }>;
          if (t.char === '~' && (opener.left < 2 || t.left < 2)) break;
          const use = opener.left >= 2 && t.left >= 2 ? 2 : 1;
          spans.push({ from: oi, to: i, style: t.char === '~' ? PLAIN_KEY.strike : use === 2 ? PLAIN_KEY.bold : PLAIN_KEY.italic });
          opener.left -= use;
          t.left -= use;
          if (opener.left === 0 || (t.char === '~' && opener.left < 2)) stack.pop();
        }
      }
      if (t.left > 0 && t.canOpen) stack.push(i);
    } else if (t.kind === 'open') {
      bracketOpeners.push(i);
    } else if (t.kind === 'close') {
      const oi = bracketOpeners.pop();
      if (oi === undefined) literal.add(i);
      else spans.push({ from: oi, to: i, style: t.style });
    }
  });
  for (const oi of bracketOpeners) literal.add(oi);

  const out: NodeJSON[] = [];
  const stylesAt = (i: number, extra: string[] = []) => [...new Set([...spans.filter((s) => s.from < i && i < s.to).map((s) => s.style), ...extra])].sort(compareStyles);
  const push = (text: string, i: number, extra: string[] = []) => {
    if (!text) return;
    const marks = stylesAt(i, extra).map(keyToMark);
    const prev = out[out.length - 1];
    if (prev?.type === 'text' && sameMarks(prev.marks, marks)) prev.text += text;
    else out.push(marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'text') push(t.text, i);
    else if (t.kind === 'delim') push(t.char.repeat(t.left), i);
    else if (t.kind === 'code') push(t.text, i, [PLAIN_KEY.code]);
    else if (t.kind === 'footnote') out.push({ type: 'footnote', attrs: { text: t.text } });
    else if (t.kind === 'image') out.push({ type: 'image', attrs: { src: t.src, alt: t.alt } });
    else if (t.kind === 'break') out.push({ type: 'hardBreak' });
    else if (literal.has(i)) push(t.kind === 'open' ? '[' : t.raw, i);
  });
  return out;
}

function sameMarks(a: MarkJSON[] | undefined, b: MarkJSON[]): boolean {
  return (a ?? []).map(markKey).join('\u0000') === b.map(markKey).join('\u0000');
}

function rank(key: string): number {
  if (key.startsWith(NOTE_PREFIX)) return -2;
  if (key.startsWith(LINK_PREFIX)) return -1;
  return RANK[key] ?? 0;
}

function compareStyles(a: string, b: string): number {
  return rank(a) - rank(b) || a.localeCompare(b);
}

// ---------- serializing ----------

const STAR: Record<string, string> = { '*b': '**', '*i': '*', '*s': '~~' };

export function serializeMarkdown(doc: NodeJSON): string {
  const blocks: string[] = [];
  let fenced: string | null = null;
  let quoting = false;
  const closeFence = () => {
    if (fenced) blocks.push(FENCE);
    fenced = null;
  };
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') {
      const text = serializeInline(node.content ?? []);
      if (text.trim() === '') continue;
      const style = (node.attrs?.style as string | undefined) || BODY_STYLE;
      const heading = HEADING_STYLES.indexOf(style as (typeof HEADING_STYLES)[number]);
      if (heading !== -1) {
        closeFence();
        quoting = false;
        // A heading is one line, so its line breaks become spaces.
        blocks.push(`${'#'.repeat(heading + 1)} ${text.replace(/\\\n/g, ' ')}`);
        continue;
      }
      if (style === QUOTE_STYLE) {
        closeFence();
        const quoted = linesOf(text).map((l) => `> ${l}`).join('\n');
        // Quote paragraphs in a row stay one quote, separated by a bare >.
        if (quoting) blocks[blocks.length - 1] += `\n>\n${quoted}`;
        else blocks.push(quoted);
        quoting = true;
        continue;
      }
      quoting = false;
      if (style !== fenced) {
        closeFence();
        if (style !== BODY_STYLE) {
          blocks.push(`${FENCE} ${style}`);
          fenced = style;
        }
      }
      blocks.push(linesOf(text).join('\n'));
      continue;
    }
    closeFence();
    quoting = false;
    if (node.type === 'sceneBreak') blocks.push(SCENE_BREAK);
    else if (isList(node)) blocks.push(serializeList(node, 0));
    else if (node.type === 'table') blocks.push(serializeTable(node));
    else if (node.type === 'codeBlock') {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('');
      const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length));
      const ticks = '`'.repeat(longest + 1);
      blocks.push(`${ticks}${(node.attrs?.language as string | null) ?? ''}\n${text}${text ? '\n' : ''}${ticks}`);
    }
  }
  closeFence();
  // Fences hug their paragraphs; everything else is separated by a blank line.
  let out = '';
  blocks.forEach((b, i) => {
    if (i > 0) out += b === FENCE || blocks[i - 1]!.startsWith(FENCE + ' ') ? '\n' : '\n\n';
    out += b;
  });
  return out === '' ? '' : out + '\n';
}

/** A serialized paragraph's lines, each made safe to start a line. */
function linesOf(text: string): string[] {
  return text.split('\n').map((l, i) => (i === 0 ? escapeLineStart(l) : escapeLineStart(l.trimStart())));
}

const isList = (n: NodeJSON) => n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'taskList';

function serializeList(list: NodeJSON, indent: number): string {
  const pad = ' '.repeat(indent);
  let n = Number(list.attrs?.start ?? 1) || 1;
  return (list.content ?? [])
    .map((item) => {
      const marker =
        item.type === 'taskItem' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : list.type === 'orderedList' ? `${n++}. ` : '- ';
      const [first, ...rest] = item.content ?? [];
      // Nested lists sit under the item's text; continued lines line up with it.
      const inner = indent + (item.type === 'taskItem' ? 2 : marker.length);
      const text = serializeInline(first?.content ?? [])
        .split('\n')
        .map((l, i) => (i === 0 ? escapeLineStart(l) : ' '.repeat(inner) + l.trimStart()))
        .join('\n');
      const nested = rest.filter(isList).map((l) => serializeList(l, inner));
      return [pad + marker + text, ...nested].join('\n');
    })
    .join('\n');
}

function serializeTable(table: NodeJSON): string {
  const rows = (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((p) => serializeInline(p.content ?? []).replace(/\\\n/g, ' '))
        .join(' ')
        .replace(/\|/g, '\\|'),
    ),
  );
  if (rows.length === 0) return '';
  const width = Math.max(1, ...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  return [line(rows[0]!), line(Array.from({ length: width }, () => '---')), ...rows.slice(1).map(line)].join('\n');
}

function escapeText(text: string): string {
  // A ! right before a bracket would make a picture.
  return text.replace(/[\\*_~`[\]]/g, (c) => '\\' + c).replace(/!$/, '\\!');
}

function escapeLineStart(line: string): string {
  if (/^([-+] |#|>|\||-{3,}$)/.test(line) || line.startsWith(FENCE)) return '\\' + line;
  // "1. " would start a numbered list.
  return line.replace(/^(\d{1,3})([.)] )/, '$1\\$2');
}

interface Piece {
  text: string;
  styles: string[];
  space: boolean;
  /** An inline node written out as is: a footnote, a picture or a line break. */
  raw?: string;
}

function serializeInline(nodes: NodeJSON[]): string {
  // Split whitespace off the edges of each text run so delimiters always touch words.
  const pieces: Piece[] = [];
  for (const n of nodes) {
    if (n.type === 'footnote' || n.type === 'image') {
      // Footnotes and pictures sit inside whatever styles surround them, so they keep the run going.
      const prev = pieces[pieces.length - 1];
      const raw =
        n.type === 'footnote'
          ? `^[${escapeText(String(n.attrs?.text ?? ''))}]`
          : `![${escapeText(String(n.attrs?.alt ?? ''))}](${linkTarget(String(n.attrs?.src ?? ''))})`;
      pieces.push({ text: '', styles: prev && !prev.space ? prev.styles : [], space: false, raw });
      continue;
    }
    if (n.type === 'hardBreak') {
      pieces.push({ text: '\n', styles: [], space: true });
      continue;
    }
    if (n.type !== 'text' || !n.text) continue;
    const styles = [...new Set((n.marks ?? []).map(markKey))].sort(compareStyles);
    // Code keeps its spaces; it is one piece.
    if (styles.includes(PLAIN_KEY.code)) {
      const prev = pieces[pieces.length - 1];
      if (prev && !prev.space && prev.styles.join() === styles.join() && prev.raw === undefined) prev.text += n.text;
      else pieces.push({ text: n.text, styles, space: false });
      continue;
    }
    for (const part of n.text.split(/(\s+)/)) {
      if (part) pieces.push({ text: part, styles, space: /^\s+$/.test(part) });
    }
  }
  pieces.forEach((p, i) => {
    if (!p.space) return;
    const prev = pieces.slice(0, i).reverse().find((q) => !q.space);
    const next = pieces.slice(i + 1).find((q) => !q.space);
    p.styles = prev && next ? p.styles.filter((s) => prev.styles.includes(s) && next.styles.includes(s)) : [];
    if (p.text.includes('\n')) p.styles = p.styles.filter((s) => s !== PLAIN_KEY.code);
  });

  let out = '';
  const stack: string[] = [];
  const close = (style: string) =>
    STAR[style] ??
    (style.startsWith(NOTE_PREFIX)
      ? `]{.note #${style.slice(NOTE_PREFIX.length)}}`
      : style.startsWith(LINK_PREFIX)
        ? `](${linkTarget(style.slice(LINK_PREFIX.length))})`
        : style === PLAIN_KEY.underline
          ? ']{.ul}'
          : `]{.${style}}`);
  const open = (style: string) => STAR[style] ?? '[';
  for (const p of pieces) {
    if (p.raw !== undefined) {
      out += p.raw;
      continue;
    }
    const styles = p.styles.filter((s) => s !== PLAIN_KEY.code);
    let keep = 0;
    while (keep < stack.length && styles.includes(stack[keep]!)) keep++;
    while (stack.length > keep) out += close(stack.pop()!);
    for (const s of styles) {
      if (!stack.includes(s)) {
        stack.push(s);
        out += open(s);
      }
    }
    if (p.text === '\n' || (p.space && p.text.includes('\n'))) out += '\\\n';
    else if (p.styles.includes(PLAIN_KEY.code)) out += codeSpan(p.text);
    else out += escapeText(p.text);
  }
  while (stack.length > 0) out += close(stack.pop()!);
  return out;
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') ? ' ' : '';
  return ticks + pad + text + pad + ticks;
}

/** A link or picture address, in <angle brackets> when it has spaces or brackets in it. */
function linkTarget(href: string): string {
  if (href === '' || /[\s()<>\\]/.test(href)) return `<${href.replace(/[<>\n]/g, encodeURIComponent)}>`;
  return href;
}

/** The words of a scene without any markup, one block per line; footnotes follow the text they belong to. */
export function plainText(markdown: string): string {
  const lines: string[] = [];
  const walk = (node: NodeJSON, line: string[]): void => {
    if (node.type === 'text') line.push(node.text ?? '');
    else if (node.type === 'footnote') line.push(` ${String(node.attrs?.text ?? '')} `);
    else if (node.type === 'hardBreak') line.push(' ');
    else for (const child of node.content ?? []) walk(child, line);
  };
  const block = (node: NodeJSON): void => {
    if (node.type === 'paragraph' || node.type === 'codeBlock') {
      const line: string[] = [];
      walk(node, line);
      lines.push(line.join(''));
    } else for (const child of node.content ?? []) block(child);
  };
  block(parseMarkdown(markdown));
  return lines.join('\n');
}
