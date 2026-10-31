import { type StorageAdapter, joinPath } from './adapter';
import { BOOKSHELF, BOOK_FILE, HIDDEN_FOLDER, PANTRY, type BookInfo, type TreeNode, fileNameFor, makeBookOrUndo, openBook, readDocument, readTree, saveBookInfo, walkFiles, writeDocument } from './book';
import { newId } from './document';
import { type BookLocation, deleteBrowserBook, forgetBook, openLocation, templateLocation } from './platform';
import { type BookTemplateId } from './templates';

/**
 * Your Recipes: copying whole recipes, for Duplicate and for templates, and
 * the writer's own templates. A template is an ordinary recipe kept in a
 * hidden folder, so editing one is opening it like any other recipe.
 */

/** Copies a recipe's files. Its hidden folder (search index, undo, trash, snapshots) is left behind: the copy starts fresh. */
export async function copyRecipe(from: StorageAdapter, to: StorageAdapter, folder = ''): Promise<void> {
  if (folder === '' && (await to.exists(BOOK_FILE))) throw new Error('There is already a recipe in this folder.');
  for (const entry of await from.list(folder)) {
    const path = joinPath(folder, entry.name);
    if (path === HIDDEN_FOLDER || entry.name.endsWith('.cookbook-tmp')) continue;
    if (entry.kind === 'folder') {
      await to.makeFolder(path);
      await copyRecipe(from, to, path);
    } else await to.writeBytes(path, await from.readBytes(path));
  }
  if (folder === '') await to.makeFolder(HIDDEN_FOLDER);
}

/** Gives a copied recipe its own title and id, so its backups are filed apart from the original's. */
export async function renameCopy(fs: StorageAdapter, changes: Partial<BookInfo>, now = new Date()): Promise<BookInfo> {
  const info: BookInfo = { ...(await openBook(fs)), created: now.toISOString(), id: newId(), ...changes };
  await saveBookInfo(fs, info);
  return info;
}

/** Empties the text of every Item on the Shelf, keeping their titles, order and notes fields. */
export async function blankShelf(fs: StorageAdapter): Promise<void> {
  if (!(await fs.exists(BOOKSHELF))) return;
  for (const node of walkFiles(await readTree(fs, BOOKSHELF))) {
    if (!node.path.endsWith('.md')) continue;
    const doc = await readDocument(fs, node.path);
    await writeDocument(fs, node.path, { ...doc, body: '' });
  }
}

/** The first words of the first Item on the Shelf, for the preview in Your Recipes. */
export async function firstLines(fs: StorageAdapter, tree: TreeNode[], plain: (markdown: string) => string, length = 220): Promise<string> {
  for (const node of walkFiles(tree)) {
    if (!node.path.endsWith('.md')) continue;
    const text = plain((await readDocument(fs, node.path)).body).replace(/\s+/g, ' ').trim();
    if (text) return text.length > length ? text.slice(0, text.lastIndexOf(' ', length) > 0 ? text.lastIndexOf(' ', length) : length) + '…' : text;
  }
  return '';
}

/** What a template lays out, for the preview in New Recipe. */
export interface TemplateOutline {
  shelf: { name: string; group: boolean; depth: number }[];
  pantry: { name: string; kind: 'character' | 'setting' | 'research' }[];
}

const stem = (name: string) => name.replace(/\.md$/, '');

export async function outlineOf(fs: StorageAdapter, limit = 8): Promise<TemplateOutline> {
  const shelf: TemplateOutline['shelf'] = [];
  const visit = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (shelf.length >= limit) return;
      shelf.push({ name: stem(n.name), group: n.kind === 'folder', depth });
      if (n.children) visit(n.children, depth + 1);
    }
  };
  visit(await readTree(fs, BOOKSHELF), 0);
  const pantry: TemplateOutline['pantry'] = [];
  for (const section of ['characters', 'settings', 'research'] as const) {
    const folder = joinPath(PANTRY, section);
    if (!(await fs.exists(folder))) continue;
    for (const n of walkFiles(await readTree(fs, folder))) {
      if (pantry.length >= limit) break;
      if (n.path.endsWith('.md')) pantry.push({ name: stem(n.name), kind: section === 'characters' ? 'character' : section === 'settings' ? 'setting' : 'research' });
    }
  }
  return { shelf, pantry };
}

/** The outlines of the built-in templates, matching applyBookTemplate. */
export const BUILT_IN_OUTLINES: Record<BookTemplateId, TemplateOutline> = {
  empty: { shelf: [{ name: 'Item 1', group: false, depth: 0 }], pantry: [] },
  novel: { shelf: [{ name: 'Group 1', group: true, depth: 0 }, { name: 'Item 1', group: false, depth: 1 }], pantry: [{ name: 'Main character', kind: 'character' }, { name: 'Main setting', kind: 'setting' }] },
  'short-story': { shelf: [{ name: 'Item 1', group: false, depth: 0 }], pantry: [{ name: 'Main character', kind: 'character' }] },
  nonfiction: {
    shelf: [{ name: 'Group 1', group: true, depth: 0 }, { name: 'Item 1', group: false, depth: 1 }, { name: 'Item 2', group: false, depth: 1 }],
    pantry: [{ name: 'Sources', kind: 'research' }],
  },
};

// ---------- the writer's own templates ----------

export interface TemplateGroup {
  id: string;
  name: string;
}

export interface UserTemplate {
  id: string;
  name: string;
  /** The group it is listed under. */
  group: string;
  location: BookLocation;
  description?: string;
}

export interface TemplateShelf {
  groups: TemplateGroup[];
  templates: UserTemplate[];
}

const TEMPLATES_KEY = 'cookbook.templates';
export const DEFAULT_GROUP: TemplateGroup = { id: 'yours', name: 'Yours' };

/** Kept on this device, like the list of recipes. Losing it only empties the list: the templates' folders stay. */
export function loadTemplates(storage: Pick<Storage, 'getItem'> = localStorage): TemplateShelf {
  try {
    const parsed = JSON.parse(storage.getItem(TEMPLATES_KEY) ?? 'null') as Partial<TemplateShelf> | null;
    const groups = Array.isArray(parsed?.groups) ? parsed.groups.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string') : [];
    const templates = Array.isArray(parsed?.templates) ? parsed.templates.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && t.location) : [];
    // A template whose group was lost goes back under the first group.
    const all = groups.length > 0 ? groups : [DEFAULT_GROUP];
    return { groups: all, templates: templates.map((t) => (all.some((g) => g.id === t.group) ? t : { ...t, group: all[0]!.id })) };
  } catch {
    return { groups: [DEFAULT_GROUP], templates: [] };
  }
}

export function saveTemplates(shelf: TemplateShelf, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(TEMPLATES_KEY, JSON.stringify(shelf));
  } catch {
    // Private windows may refuse; the templates' folders are still there.
  }
}

/** A name for a new folder that is not already taken. */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let n = 2; ; n++) if (!taken(`${name} ${n}`)) return `${name} ${n}`;
}

/** Keeps a copy of a recipe as one of the writer's templates, with or without the text of its Items. */
export async function saveTemplate(from: BookLocation, name: string, group: string, keepText: boolean): Promise<UserTemplate> {
  const id = newId();
  // The id keeps two templates with one name in folders of their own.
  const target = await templateLocation(`${fileNameFor(name)} ${id.slice(0, 6)}`);
  const { fs: source } = await openLocation(from);
  const { fs: copy } = await openLocation(target);
  await makeBookOrUndo(copy, async () => {
    await copyRecipe(source, copy);
    if (!keepText) await blankShelf(copy);
    await renameCopy(copy, { title: name });
  });
  const template: UserTemplate = { id, name, group, location: target };
  const shelf = loadTemplates();
  saveTemplates({ ...shelf, templates: [...shelf.templates, template] });
  return template;
}

/** Deletes a template's folder. Templates are Cookbook's own copies, so nothing of the writer's goes with it. */
export async function deleteTemplateFiles(template: UserTemplate): Promise<void> {
  if (template.location.kind === 'browser') await deleteBrowserBook(template.location.name);
  else if (template.location.kind === 'folder') {
    const { remove } = await import('@tauri-apps/plugin-fs');
    await remove(template.location.path, { recursive: true });
  }
}

/** Deletes a recipe for good. Only a recipe kept in the browser, which has no other copy, loses its files; a folder on disk only leaves the list. */
export async function deleteForGood(location: BookLocation): Promise<void> {
  if (location.kind === 'browser') await deleteBrowserBook(location.name);
  forgetBook(location);
}
