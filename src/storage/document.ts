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

/** Where a scene is up to. Kept as `status` in the front matter; no status means not started. */
export type SceneStatus = 'not-started' | 'simmering' | 'done';

export const STATUSES: { id: SceneStatus; label: string }[] = [
  { id: 'not-started', label: 'Not started' },
  { id: 'simmering', label: 'Simmering' },
  { id: 'done', label: 'Done' },
];

export function statusOf(fields: Record<string, unknown>): SceneStatus {
  return STATUSES.some((s) => s.id === fields.status) ? (fields.status as SceneStatus) : 'not-started';
}

/** A line or two on what happens, kept as `synopsis` in the front matter. */
export function synopsisOf(fields: Record<string, unknown>): string {
  return typeof fields.synopsis === 'string' ? fields.synopsis : '';
}

/** Sets or clears one front matter field, leaving the rest alone. */
export function withField(doc: CookbookDocument, key: string, value: unknown): CookbookDocument {
  const { [key]: _old, ...fields } = doc.fields;
  return { ...doc, fields: value === undefined || value === '' ? fields : { ...fields, [key]: value } };
}

// ---------- Pantry cards ----------

/** A link from one card to another, read as "<as> <the other card>", like "Mother of June". */
export interface Relationship {
  to: string;
  as: string;
}

/** Front matter keys Cookbook uses itself; everything else on a card is one of the writer's fields. */
const RESERVED = new Set(['notes', 'goal', 'status', 'synopsis', 'aka', 'portrait', 'relationships']);

/** The writer's own fields on a card, like role, age and wants, in order. */
export function cardFieldsOf(fields: Record<string, unknown>): [string, string][] {
  return Object.entries(fields)
    .filter(([key, value]) => !RESERVED.has(key) && (typeof value === 'string' || typeof value === 'number' || value === null))
    .map(([key, value]) => [key, value === null ? '' : String(value)]);
}

/** Replaces the writer's fields, keeping Cookbook's own keys where they were. */
export function withCardFields(doc: CookbookDocument, entries: [string, string][]): CookbookDocument {
  const kept = Object.entries(doc.fields).filter(([key, value]) => RESERVED.has(key) || !(typeof value === 'string' || typeof value === 'number' || value === null));
  return { ...doc, fields: Object.fromEntries([...entries, ...kept]) };
}

/** Other names the card goes by. Written as a YAML list, but a comma-separated line is read too. */
export function akaOf(fields: Record<string, unknown>): string[] {
  const raw = fields.aka;
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
  return list.map((s) => s.trim()).filter(Boolean);
}

export function relationshipsOf(fields: Record<string, unknown>): Relationship[] {
  const raw = fields.relationships;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ to: typeof r.to === 'string' ? r.to : '', as: typeof r.as === 'string' ? r.as : '' }));
}

/** Where the card's picture is, relative to the book folder. */
export function portraitOf(fields: Record<string, unknown>): string | null {
  return typeof fields.portrait === 'string' && fields.portrait ? fields.portrait : null;
}
