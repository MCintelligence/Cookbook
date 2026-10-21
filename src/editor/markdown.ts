/**
 * The scene body format: plain Markdown with Pandoc-style tags, so files stay
 * readable in any editor.
 *
 *   Ordinary paragraphs are Body text, separated by blank lines.
 *
 *   ::: letter
 *   A paragraph in the Letter style.
 *   :::
 *
 *   * * *                      a scene break
 *   - a list item
 *   - [ ] a checklist item      (- [x] when ticked)
 *
 *   **strong**  *emphasis*  [any character style]{.thought}
 *
 * Every literal *, [, ] and \ is escaped, so every unescaped one is markup.
 * Both functions work on ProseMirror JSON and need no editor, so they run in
 * tests and on any platform.
 */

export interface MarkJSON {
  type: 'charStyle';
  attrs: { style: string };
}

export interface NodeJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJSON[];
  text?: string;
  marks?: MarkJSON[];
}

export const BODY_STYLE = 'body';
const SCENE_BREAK = '* * *';
const FENCE = ':::';
const STAR_STYLES: Record<string, number> = { strong: 2, emphasis: 1 };

// ---------- parsing ----------

export function parseMarkdown(markdown: string): NodeJSON {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const content: NodeJSON[] = [];
  let style = BODY_STYLE;
  let paragraph: string[] = [];
  let list: { kind: 'bullet' | 'task'; items: NodeJSON[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    content.push(paragraphNode(paragraph.join(' '), style));
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    content.push(
      list.kind === 'bullet' ? { type: 'bulletList', content: list.items } : { type: 'taskList', content: list.items },
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const fence = /^:::\s*\{?\.?([A-Za-z0-9_-]+)\}?\s*$/.exec(line);
    if (fence && style === BODY_STYLE) {
      flushParagraph();
      flushList();
      style = fence[1]!;
      continue;
    }
    if (line === FENCE && style !== BODY_STYLE) {
      flushParagraph();
      style = BODY_STYLE;
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (paragraph.length === 0 && /^\* \* \*$|^\*\*\*+$|^---+$/.test(line.trim())) {
      flushList();
      content.push({ type: 'sceneBreak' });
      continue;
    }
    const item = /^- (?:\[([ xX])\] )?(.*)$/.exec(line);
    if (item && paragraph.length === 0) {
      const kind = item[1] === undefined ? 'bullet' : 'task';
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      const para = paragraphNode(item[2]!, BODY_STYLE, false);
      list.items.push(
        kind === 'bullet'
          ? { type: 'listItem', content: [para] }
          : { type: 'taskItem', attrs: { checked: item[1] !== ' ' }, content: [para] },
      );
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (content.length === 0) content.push({ type: 'paragraph', attrs: { style: BODY_STYLE } });
  return { type: 'doc', content };
}

function paragraphNode(source: string, style: string, withStyle = true): NodeJSON {
  const inline = parseInline(source);
  const node: NodeJSON = { type: 'paragraph' };
  if (withStyle) node.attrs = { style };
  if (inline.length > 0) node.content = inline;
  return node;
}

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'stars'; count: number; left: number; canOpen: boolean; canClose: boolean }
  | { kind: 'open' }
  | { kind: 'close'; style: string };

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
    if (ch === '\\' && i + 1 < src.length) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '*') {
      let j = i;
      while (src[j] === '*') j++;
      const before = i > 0 ? src[i - 1]! : ' ';
      const after = j < src.length ? src[j]! : ' ';
      pushText();
      const count = j - i;
      tokens.push({ kind: 'stars', count, left: count, canOpen: !/\s/.test(after), canClose: !/\s/.test(before) });
      i = j;
      continue;
    }
    if (ch === '[') {
      pushText();
      tokens.push({ kind: 'open' });
      i++;
      continue;
    }
    if (ch === ']') {
      const m = /^\]\{\.([A-Za-z0-9_-]+)\}/.exec(src.slice(i));
      if (m) {
        pushText();
        tokens.push({ kind: 'close', style: m[1]! });
        i += m[0].length;
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
  const starOpeners: number[] = [];
  const bracketOpeners: number[] = [];
  const literal = new Set<number>();

  tokens.forEach((t, i) => {
    if (t.kind === 'stars') {
      if (t.canClose) {
        // Always match the nearest opener; it may be used twice (***both***).
        while (t.left > 0 && starOpeners.length > 0) {
          const oi = starOpeners[starOpeners.length - 1]!;
          const opener = tokens[oi] as Extract<Token, { kind: 'stars' }>;
          const use = opener.left >= 2 && t.left >= 2 ? 2 : 1;
          spans.push({ from: oi, to: i, style: use === 2 ? 'strong' : 'emphasis' });
          opener.left -= use;
          t.left -= use;
          if (opener.left === 0) starOpeners.pop();
        }
      }
      if (t.left > 0 && t.canOpen) starOpeners.push(i);
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
  const push = (text: string, i: number) => {
    if (!text) return;
    const styles = spans.filter((s) => s.from < i && i < s.to).map((s) => s.style);
    const marks = [...new Set(styles)].sort(compareStyles).map((style) => ({ type: 'charStyle' as const, attrs: { style } }));
    const prev = out[out.length - 1];
    if (prev && sameMarks(prev.marks, marks)) prev.text += text;
    else out.push(marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'text') push(t.text, i);
    else if (t.kind === 'stars') push('*'.repeat(t.left), i);
    else if (literal.has(i)) push(t.kind === 'open' ? '[' : `]{.${t.style}}`, i);
  });
  return out;
}

function sameMarks(a: MarkJSON[] | undefined, b: MarkJSON[]): boolean {
  const x = (a ?? []).map((m) => m.attrs.style).join(' ');
  return x === b.map((m) => m.attrs.style).join(' ');
}

/** Bracket styles wrap outermost, then strong, then emphasis. */
function compareStyles(a: string, b: string): number {
  const rank = (s: string) => STAR_STYLES[s] === undefined ? 0 : 3 - STAR_STYLES[s]!;
  return rank(a) - rank(b) || a.localeCompare(b);
}

// ---------- serializing ----------

export function serializeMarkdown(doc: NodeJSON): string {
  const blocks: string[] = [];
  let fenced: string | null = null;
  const closeFence = () => {
    if (fenced) blocks.push(FENCE);
    fenced = null;
  };
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') {
      const text = serializeInline(node.content ?? []);
      if (text.trim() === '') continue;
      const style = (node.attrs?.style as string | undefined) || BODY_STYLE;
      if (style !== fenced) {
        closeFence();
        if (style !== BODY_STYLE) {
          blocks.push(`${FENCE} ${style}`);
          fenced = style;
        }
      }
      blocks.push(escapeLineStart(text));
      continue;
    }
    closeFence();
    if (node.type === 'sceneBreak') blocks.push(SCENE_BREAK);
    else if (node.type === 'bulletList' || node.type === 'taskList') {
      const items = (node.content ?? []).map((item) => {
        const para = item.content?.[0];
        const text = serializeInline(para?.content ?? []);
        return item.type === 'taskItem' ? `- [${item.attrs?.checked ? 'x' : ' '}] ${text}` : `- ${text}`;
      });
      blocks.push(items.join('\n'));
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

function escapeText(text: string): string {
  return text.replace(/[\\*[\]]/g, (c) => '\\' + c);
}

function escapeLineStart(line: string): string {
  if (/^- /.test(line) || /^-{3,}$/.test(line) || line.startsWith(FENCE)) return '\\' + line;
  return line;
}

interface Piece {
  text: string;
  styles: string[];
  space: boolean;
}

function serializeInline(nodes: NodeJSON[]): string {
  // Split whitespace off the edges of each text run so delimiters always touch words.
  const pieces: Piece[] = [];
  for (const n of nodes) {
    if (n.type !== 'text' || !n.text) continue;
    const styles = [...new Set((n.marks ?? []).map((m) => m.attrs.style))].sort(compareStyles);
    for (const part of n.text.split(/(\s+)/)) {
      if (part) pieces.push({ text: part, styles, space: /^\s+$/.test(part) });
    }
  }
  pieces.forEach((p, i) => {
    if (!p.space) return;
    const prev = pieces.slice(0, i).reverse().find((q) => !q.space);
    const next = pieces.slice(i + 1).find((q) => !q.space);
    p.styles = prev && next ? p.styles.filter((s) => prev.styles.includes(s) && next.styles.includes(s)) : [];
  });

  let out = '';
  const stack: string[] = [];
  const close = (style: string) => (STAR_STYLES[style] ? '*'.repeat(STAR_STYLES[style]!) : `]{.${style}}`);
  const open = (style: string) => (STAR_STYLES[style] ? '*'.repeat(STAR_STYLES[style]!) : '[');
  for (const p of pieces) {
    let keep = 0;
    while (keep < stack.length && p.styles.includes(stack[keep]!)) keep++;
    while (stack.length > keep) out += close(stack.pop()!);
    for (const s of p.styles) {
      if (!stack.includes(s)) {
        stack.push(s);
        out += open(s);
      }
    }
    out += escapeText(p.text);
  }
  while (stack.length > 0) out += close(stack.pop()!);
  return out;
}
