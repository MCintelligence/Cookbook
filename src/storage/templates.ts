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
    body: '# Chapter title\n\n::: body-first\nThe first line of the chapter.\n:::\n',
  },
  {
    id: 'letter',
    name: 'Letter',
    kind: 'scene',
    title: 'A letter',
    body: '::: letter\nDear friend,\n\nYours,\n:::\n',
  },
];

/**
 * The character and place cards share one shape, so the Pantry reads the
 * same whichever you open: what it is, what it wants or offers, what stands
 * in the way, where it comes from, and its terrible trouble. Each prompt is
 * one line the writer writes over. A card holds one character or one place,
 * so nothing here asks about the cast or the plot as a whole.
 */
const CHARACTER_BODY = [
  '## Who they are',
  'How they look, how they move, how they talk, and what they would never say out loud.',
  '## What they want',
  'The goal they chase, the need underneath it they may not see, and what they will do to get it.',
  '## What stands in their way',
  'What keeps them from getting it: another person, the world around them, or something in themselves.',
  '## Where they come from',
  'The past that made them want this. Keep only what still shapes them now.',
  '## Their terrible trouble',
  '### The worst of it',
  'The worst predicament this story could plunge them into.',
  '### It gets worse',
  'The complications that make things worse, one after another.',
  '### The darkest moment',
  'What their most hopeless moment looks like.',
  '### What they learn',
  'What all this teaches them, and how it gives them what they need to win in the end.',
];

const PLACE_BODY = [
  '## What it is',
  'How it looks, what it smells and sounds like, and who belongs here.',
  '## What it offers',
  'Why people come here, why they stay, and what they would give to keep it.',
  '## What stands in the way',
  'What makes it hard to reach, to live in, or to leave: its walls, its weather, its rules, or the people who guard it.',
  '## Where it comes from',
  'The history that made it this way. Keep only what still shows today.',
  '## Its terrible trouble',
  '### The worst of it',
  'The worst thing this story could bring down on it: a flood, a siege, a sale, a secret let out.',
  '### It gets worse',
  'The complications that make things worse, one after another.',
  '### The darkest moment',
  'What it looks like at its most hopeless.',
  '### What remains',
  'What is still standing in the end, and what it gives the people who fought for it.',
];

const lines = (list: string[]) => list.join('\n\n') + '\n';

export const CARD_TEMPLATES: DocTemplate[] = [
  {
    id: 'character',
    name: 'Character',
    kind: 'character',
    folder: 'characters',
    title: 'New character',
    fields: { role: '', age: '', wants: '', fears: '' },
    body: lines(CHARACTER_BODY),
  },
  {
    id: 'setting',
    name: 'Place',
    kind: 'setting',
    folder: 'settings',
    title: 'New place',
    fields: { role: '', when: '', offers: '', threatens: '' },
    body: lines(PLACE_BODY),
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
    await createFromTemplate(fs, '', card('setting'), 'Main place');
  } else if (template === 'short-story') {
    await createFromTemplate(fs, BOOKSHELF, blank, 'Page 1');
    await createFromTemplate(fs, '', card('character'), 'Main character');
  } else {
    await createFromTemplate(fs, joinPath(BOOKSHELF, 'Chapter 1'), blank, 'Section 1');
    await createFromTemplate(fs, joinPath(BOOKSHELF, 'Chapter 2'), blank, 'Section 1');
    await createFromTemplate(fs, '', card('research'), 'Sources');
  }
}
