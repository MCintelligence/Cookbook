import { type AppSettings, MARKDOWN_RULES, type MarkdownRule } from './settings';
import { type BookInfo } from './storage/book';
import { type BookTemplateId } from './storage/templates';

/**
 * The kinds of writer Set the Table asks about, and the starting points each
 * one gets: which template New Recipe offers first, a daily goal, which
 * Seasonings a new recipe starts with, and Markdown shortcuts that get in the
 * way of that kind of writing. Every one of these can be changed afterwards.
 */
export type WriterKind = 'novel' | 'short' | 'screen' | 'nonfiction' | 'student' | 'journal' | 'poetry' | 'mixed';

export interface Writer {
  id: WriterKind;
  name: string;
  blurb: string;
  template: BookTemplateId;
  dailyGoal: number;
  seasonings: string[];
  /** Markdown rules turned off for them; every other rule stays as it is. */
  markdownOff: MarkdownRule[];
}

export const WRITERS: Writer[] = [
  { id: 'novel', name: 'Novels', blurb: 'Long fiction, chapter by chapter.', template: 'novel', dailyGoal: 1000, seasonings: ['sam', 'pete', 'daniel'], markdownOff: [] },
  { id: 'short', name: 'Short stories', blurb: 'Fiction that fits in one sitting.', template: 'short-story', dailyGoal: 500, seasonings: ['sam', 'pete', 'sally'], markdownOff: [] },
  { id: 'screen', name: 'Scripts', blurb: 'Screen, stage or audio, where the talk carries the scene.', template: 'empty', dailyGoal: 500, seasonings: ['sam', 'daniel'], markdownOff: ['dropCap'] },
  { id: 'nonfiction', name: 'Nonfiction', blurb: 'Memoir, essays, how-to and books of fact.', template: 'nonfiction', dailyGoal: 750, seasonings: ['sam', 'pete', 'sally'], markdownOff: ['dropCap'] },
  { id: 'student', name: 'School or study', blurb: 'Essays, reports and a thesis.', template: 'nonfiction', dailyGoal: 300, seasonings: ['sam', 'pete', 'sally'], markdownOff: ['dropCap'] },
  { id: 'journal', name: 'A journal', blurb: 'Diary pages, morning pages, notes to self.', template: 'empty', dailyGoal: 250, seasonings: ['sam'], markdownOff: ['dropCap'] },
  { id: 'poetry', name: 'Poems or lyrics', blurb: 'Lines that keep their shape: no lists made by accident.', template: 'empty', dailyGoal: 100, seasonings: ['sam'], markdownOff: ['dropCap', 'bullets', 'numbers', 'heading', 'quote'] },
  { id: 'mixed', name: 'A bit of everything', blurb: 'Keep every door open.', template: 'novel', dailyGoal: 500, seasonings: ['sam', 'pete'], markdownOff: [] },
];

export const isWriterKind = (v: unknown): v is WriterKind => WRITERS.some((w) => w.id === v);
export const writerOf = (id: WriterKind | '') => WRITERS.find((w) => w.id === id);

/** What a new recipe starts with from the writer's answers: their Seasonings, and their name on its title page. */
export function recipeDefaults(s: Pick<AppSettings, 'newSeasonings' | 'writerName'>): Partial<BookInfo> {
  return {
    ...(s.newSeasonings.length > 0 && { seasonings: { chosen: [...s.newSeasonings], tracked: [], gone: [] } }),
    ...(s.writerName.trim() && { plate: { author: s.writerName.trim() } }),
  };
}

/** The Markdown rules turned off for a kind of writer; every other rule keeps its own switch. */
export function rulesFor(writer: WriterKind, rules: AppSettings['markdownRules']): AppSettings['markdownRules'] {
  const off = writerOf(writer)?.markdownOff ?? [];
  return Object.fromEntries(MARKDOWN_RULES.map((r) => [r.id, off.includes(r.id) ? false : rules[r.id]])) as AppSettings['markdownRules'];
}
