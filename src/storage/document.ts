import { parse, stringify } from 'yaml';

/**
 * Every scene and Pantry card is one Markdown file with YAML front matter:
 *
 *   ---
 *   id: 7c1f…
 *   title: Sunday Dinner
 *   kind: scene
 *   ---
 *   The kitchen smelled of cornbread…
 *
 * Paragraph and character styles are written as Pandoc-style tags
 * (`::: letter` blocks, `[text]{.thought}` spans) so the file still reads
 * well in any text editor.
 */
export type DocumentKind = 'scene' | 'character' | 'setting' | 'research';

export interface CookbookDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  /** Anything else in the front matter: card fields, status, labels. */
  fields: Record<string, unknown>;
  body: string;
}

const FENCE = '---';
const KINDS: readonly DocumentKind[] = ['scene', 'character', 'setting', 'research'];

export function parseDocument(text: string, fallbackTitle = 'Untitled'): CookbookDocument {
  const normalized = text.replace(/\r\n/g, '\n');
  let front: Record<string, unknown> = {};
  let body = normalized;
  if (normalized.startsWith(FENCE + '\n')) {
    const end = normalized.indexOf('\n' + FENCE, FENCE.length);
    if (end !== -1) {
      const parsed: unknown = parse(normalized.slice(FENCE.length + 1, end));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) front = parsed as Record<string, unknown>;
      body = normalized.slice(end + FENCE.length + 1).replace(/^\n/, '');
    }
  }
  const { id, title, kind, ...fields } = front;
  return {
    id: typeof id === 'string' && id ? id : newId(),
    title: typeof title === 'string' && title ? title : fallbackTitle,
    kind: KINDS.includes(kind as DocumentKind) ? (kind as DocumentKind) : 'scene',
    fields,
    body,
  };
}

export function serializeDocument(doc: CookbookDocument): string {
  const front = stringify({ id: doc.id, title: doc.title, kind: doc.kind, ...doc.fields }).trimEnd();
  const body = doc.body.endsWith('\n') || doc.body === '' ? doc.body : doc.body + '\n';
  return `${FENCE}\n${front}\n${FENCE}\n${body}`;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
