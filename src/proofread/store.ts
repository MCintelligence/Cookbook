import { type StorageAdapter, joinPath } from '../storage/adapter';
import { HIDDEN_FOLDER } from '../storage/book';
import { type Dialect } from './check';

/**
 * What the proofreader remembers for a book:
 *
 *   dictionary.txt           the writer's own words, one a line, so they
 *                            travel with the book and can be edited by hand
 *   .cookbook/ignored.json   what was ignored in each scene, by scene id,
 *                            and in the whole book, under "*"
 */
export const DICTIONARY_FILE = 'dictionary.txt';
export const IGNORED_FILE = joinPath(HIDDEN_FOLDER, 'ignored.json');

const HEADER = '# Words Cookbook’s proofreader should never flag, one a line.';

export type Ignored = Record<string, string[]>;

/** The key in ignored.json for things ignored everywhere in the book. */
export const BOOK_WIDE = '*';

export function parseDictionary(text: string): string[] {
  const words = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return [...new Set(words)];
}

export function serializeDictionary(words: string[]): string {
  return [HEADER, ...[...new Set(words)].sort((a, b) => a.localeCompare(b, 'en'))].join('\n') + '\n';
}

export async function readDictionary(fs: StorageAdapter): Promise<string[]> {
  return (await fs.exists(DICTIONARY_FILE)) ? parseDictionary(await fs.readText(DICTIONARY_FILE)) : [];
}

export async function saveDictionary(fs: StorageAdapter, words: string[]): Promise<void> {
  await fs.writeText(DICTIONARY_FILE, serializeDictionary(words));
}

export async function readIgnored(fs: StorageAdapter): Promise<Ignored> {
  try {
    const data = JSON.parse(await fs.readText(IGNORED_FILE)) as unknown;
    if (!data || typeof data !== 'object') return {};
    return Object.fromEntries(
      Object.entries(data).filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((w) => typeof w === 'string')),
    );
  } catch {
    // Missing or damaged: nothing is ignored.
    return {};
  }
}

export async function saveIgnored(fs: StorageAdapter, ignored: Ignored): Promise<void> {
  const kept = Object.fromEntries(Object.entries(ignored).filter(([, words]) => words.length > 0));
  if (!(await fs.exists(HIDDEN_FOLDER))) await fs.makeFolder(HIDDEN_FOLDER);
  await fs.writeText(IGNORED_FILE, JSON.stringify(kept, null, 2) + '\n');
}

/** British spelling for writers whose system is set to a Commonwealth English; American otherwise. */
export function defaultDialect(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Dialect {
  const english = languages.find((l) => /^en\b/i.test(l));
  return english && /^en-(GB|AU|NZ|IE|ZA|IN)\b/i.test(english) ? 'en-GB' : 'en-US';
}
