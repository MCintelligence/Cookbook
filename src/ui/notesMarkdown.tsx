import { Fragment, type ReactNode } from 'react';

/**
 * Draws release notes, which are written in Markdown, as formatted text:
 * headings, paragraphs, bulleted and numbered lists, rules, bold, italics,
 * inline code and links. Everything becomes React elements, never raw HTML,
 * so nothing in the notes can run in the app.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Splits release notes into blocks. A leading top heading is dropped: the popup has its own title. */
export function parseNotes(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
    if (list) blocks.push({ kind: 'list', ...list });
    para = [];
    list = null;
  };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    if (bullet || number) {
      const ordered = !!number;
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? number)![1]!.trim());
      continue;
    }
    if (list && /^\s+/.test(line)) {
      // An indented line carries on the item above it.
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1] ?? ''} ${line.trim()}`;
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  const first = blocks[0];
  if (first?.kind === 'heading' && first.level === 1) blocks.shift();
  while (blocks[0]?.kind === 'rule') blocks.shift();
  return blocks;
}

const INLINE = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Bold, italics, code and links inside one block of text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    // Underscores inside a word (snake_case) are not italics.
    if (m[3] === '_' && (/\w/.test(text[start - 1] ?? '') || /\w/.test(text[start + m[0].length] ?? ''))) continue;
    if (start > at) out.push(text.slice(at, start));
    if (m[2] !== undefined) out.push(<strong key={key++}>{inline(m[2])}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key++}>{inline(m[4])}</em>);
    else if (m[5] !== undefined) out.push(<code key={key++}>{m[5]}</code>);
    else if (m[7] && /^https?:\/\//i.test(m[7]))
      out.push(
        <a key={key++} href={m[7]} target="_blank" rel="noopener noreferrer">
          {inline(m[6] ?? '')}
        </a>,
      );
    else out.push(<Fragment key={key++}>{inline(m[6] ?? '')}</Fragment>);
    at = start + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Release notes drawn as formatted text. Headings start at h3 so they sit under the popup's own title. */
export function NotesMarkdown({ source }: { source: string }) {
  return (
    <>
      {parseNotes(source).map((b, i) => {
        if (b.kind === 'rule') return <hr key={i} />;
        if (b.kind === 'para') return <p key={i}>{inline(b.text)}</p>;
        if (b.kind === 'heading') {
          const Tag = b.level <= 2 ? 'h3' : b.level === 3 ? 'h4' : b.level === 4 ? 'h5' : 'h6';
          return <Tag key={i}>{inline(b.text)}</Tag>;
        }
        const List = b.ordered ? 'ol' : 'ul';
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}
