import { type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, PANTRY, createDocument, readDocument, writeDocument } from './book';
import { type DocumentKind } from './document';

/**
 * Starting points. A book template lays out the Bookshelf and Pantry; a
 * scene or card template fills in a new file. They only write ordinary
 * scenes and cards, so nothing about a book depends on its template.
 */

export type BookTemplateId = 'novel' | 'short-story' | 'nonfiction';

export const BOOK_TEMPLATES: { id: BookTemplateId; name: string; description: string }[] = [
  { id: 'novel', name: 'Novel', description: 'Chapters of pages, with a main character and a place in the Pantry.' },
  { id: 'short-story', name: 'Short story', description: 'A single page and a main character.' },
  { id: 'nonfiction', name: 'Nonfiction', description: 'Chapters of sections, with a note for your sources.' },
];

export interface DocTemplate {
  id: string;
  name: string;
  kind: DocumentKind;
  /** The Pantry folder it goes in; scenes go wherever the writer is. */
  folder?: string;
  title: string;
  body: string;
  fields?: Record<string, unknown>;
}

export const SCENE_TEMPLATES: DocTemplate[] = [
  { id: 'scene', name: 'Blank page', kind: 'scene', title: 'New page', body: '' },
  {
    id: 'chapter-opener',
    name: 'Chapter opener',
    kind: 'scene',
    title: 'Chapter opener',
    body: '# Chapter title\n\nThe first line of the chapter.\n',
  },
  {
    id: 'letter',
    name: 'Letter',
    kind: 'scene',
    title: 'A letter',
    body: '::: letter\nDear friend,\n\nYours,\n:::\n',
  },
];

export const CARD_TEMPLATES: DocTemplate[] = [
  {
    id: 'character',
    name: 'Character',
    kind: 'character',
    folder: 'characters',
    title: 'New character',
    fields: { role: '', age: '', wants: '', fears: '' },
    body: 'How they look, how they talk, and what they would never say out loud.\n',
  },
  {
    id: 'setting',
    name: 'Place',
    kind: 'setting',
    folder: 'settings',
    title: 'New place',
    fields: { when: '' },
    body: 'What it smells like, what it sounds like, and who belongs here.\n',
  },
  { id: 'research', name: 'Research note', kind: 'research', folder: 'research', title: 'New note', body: '' },
];

/** Writes a new scene or card from a template and returns its path. */
export async function createFromTemplate(fs: StorageAdapter, folder: string, template: DocTemplate, title = template.title): Promise<string> {
  // A card goes in its Pantry section, or in a folder of the writer's inside that section.
  const section = template.folder ? joinPath(PANTRY, template.folder) : null;
  const target = section && folder !== section && !folder.startsWith(section + '/') ? section : folder;
  await fs.makeFolder(target);
  const path = await createDocument(fs, target, title, template.kind);
  const doc = await readDocument(fs, path);
  await writeDocument(fs, path, { ...doc, body: template.body, fields: { ...template.fields } });
  return path;
}

const card = (id: string) => CARD_TEMPLATES.find((t) => t.id === id)!;
const blank = SCENE_TEMPLATES[0]!;

/** Lays out a new book. Run right after `createBook`. */
export async function applyBookTemplate(fs: StorageAdapter, template: BookTemplateId): Promise<void> {
  if (template === 'novel') {
    await createFromTemplate(fs, joinPath(BOOKSHELF, 'Chapter 1'), blank, 'Page 1');
    await createFromTemplate(fs, '', card('character'), 'Main character');
    await createFromTemplate(fs, '', card('setting'), 'Main setting');
  } else if (template === 'short-story') {
    await createFromTemplate(fs, BOOKSHELF, blank, 'Page 1');
    await createFromTemplate(fs, '', card('character'), 'Main character');
  } else {
    await createFromTemplate(fs, joinPath(BOOKSHELF, 'Chapter 1'), blank, 'Section 1');
    await createFromTemplate(fs, joinPath(BOOKSHELF, 'Chapter 2'), blank, 'Section 1');
    await createFromTemplate(fs, '', card('research'), 'Sources');
  }
}
