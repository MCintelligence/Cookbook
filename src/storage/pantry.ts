import { type StorageAdapter, joinPath } from './adapter';
import { PANTRY, PANTRY_SECTIONS, fileNameFor } from './book';
import { type DocumentKind } from './document';
import { freeName } from './order';

/** Portraits and other pictures live in their own visible folder, so moving a card never loses its picture. */
export const PICTURES = 'pictures';

export type PantrySection = (typeof PANTRY_SECTIONS)[number];

export const SECTION_KIND: Record<PantrySection, DocumentKind> = { characters: 'character', settings: 'setting', research: 'research' };

export const SECTION_LABEL: Record<PantrySection, string> = { characters: 'Characters', settings: 'Settings', research: 'Research' };

/** The Pantry section a path is in, if any. */
export function sectionOf(path: string): PantrySection | null {
  const [root, section] = path.split('/');
  return root === PANTRY && (PANTRY_SECTIONS as readonly string[]).includes(section ?? '') ? (section as PantrySection) : null;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Saves a picture for a card under pictures/, named after the card, and returns its path. */
export async function savePicture(fs: StorageAdapter, title: string, bytes: Uint8Array, type: string): Promise<string> {
  await fs.makeFolder(PICTURES);
  const ext = `.${EXTENSIONS[type] ?? 'jpg'}`;
  const name = await freeName(fs, PICTURES, `${fileNameFor(title)}${ext}`, ext);
  const path = joinPath(PICTURES, name);
  await fs.writeBytes(path, bytes);
  return path;
}

export function pictureType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'))?.[0] ?? 'image/jpeg';
}
