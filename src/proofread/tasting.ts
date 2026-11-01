import { type EditorState } from '@tiptap/pm/state';
import { checkedOff, isDialogueFocus } from '../editor/seasonings';
import { docReading, docTalk, docWords } from '../editor/docStats';
import { type FoundIssue, issuesOf } from './plugin';
import { KIND_OF, METERS, type SeasoningId, ownerOf, perThousand, spiceOf, tasteOf } from './remarks';
import { readingGrade } from './style';

/**
 * What the seasonings taste on the open page, as plain numbers. Every count is kept per paragraph or per
 * set of underlines (see docStats and issuesOf), so a cursor move costs nothing and a keystroke recounts
 * one paragraph. The Seasonings panel and the badge beside the Seasonings button both read from here,
 * so the badge needs no check of its own.
 */
export interface PageTaste {
  words: number;
  sam: number;
  pete: number;
  sally: number;
  grade: number;
  gradeWords: number;
  talkWords: number;
  spoken: number;
  /** Daniel's Check: the narration is dimmed. */
  dim: boolean;
  /** The issue kinds whose Check is off, sorted and joined by spaces. */
  off: string;
}

export function tastePage(state: EditorState): PageTaste {
  const slips = slipsOf(issuesOf(state));
  const grade = readingGrade(docReading(state.doc));
  const talk = docTalk(state.doc);
  return {
    words: docWords(state.doc),
    sam: slips.sam,
    pete: slips.pete,
    sally: slips.sally,
    grade: grade.grade,
    gradeWords: grade.words,
    talkWords: talk.words,
    spoken: talk.spoken,
    dim: isDialogueFocus(state),
    off: [...checkedOff(state)].sort().join(' '),
  };
}

/** A grade level from a few words means nothing, so Sally waits for a paragraph or two. */
export const MIN_GRADE_WORDS = 50;

export interface Reading {
  /** Where the meter stands, as an index into its steps. */
  at: number;
  /** What the meter shows beside its level. */
  detail: string;
  /** A number that moves the remark on when the reading changes. */
  turn: number;
}

/** Where a seasoning's meter stands on the page; null while there's too little page to read. */
export function readingOf(id: SeasoningId, page: PageTaste): Reading | null {
  if (id === 'daniel') {
    if (page.talkWords === 0) return null;
    const share = Math.round((page.spoken / page.talkWords) * 100);
    // In steps of five, so typing a word or two doesn't change what he says.
    return { at: tasteOf(METERS.daniel.steps, share), detail: `${share}% dialogue · ${100 - share}% narration`, turn: Math.round(share / 5) };
  }
  if (id === 'sally') {
    if (page.gradeWords < MIN_GRADE_WORDS) return null;
    return { at: spiceOf(page.grade), detail: `Grade ${page.grade} · ${plural(page.sally, 'style note')}`, turn: page.sally * 31 + page.grade };
  }
  if (page.words === 0) return null;
  const slips = page[id];
  const per = perThousand(slips, page.words);
  return { at: tasteOf(METERS[id].steps, per), detail: `${plural(slips, id === 'sam' ? 'spelling slip' : 'grammar slip')} · ${per} per 1,000 words`, turn: slips };
}

/** Whether a seasoning's Check is on: Daniel's dims the narration, the others' show their underlines. */
export function isChecking(id: SeasoningId, page: Pick<PageTaste, 'dim' | 'off'>): boolean {
  if (id === 'daniel') return page.dim;
  return !page.off.split(' ').includes(KIND_OF[id]!);
}

/**
 * Whether a seasoning has something to say about the page: there's enough page to read and its meter is
 * off the step where it's happy (no slips for Sam and Pete, Medium for Sally, Tipsy for Daniel).
 */
export function hasSomethingToSay(id: SeasoningId, page: PageTaste): boolean {
  const read = readingOf(id, page);
  return !!read && read.at !== METERS[id].happy;
}

/**
 * How many of the picked seasonings have something to say with their Check on, for the badge beside
 * Seasonings. None while Seasonings are off.
 */
export function sayingCount(chosen: readonly SeasoningId[], paused: boolean, page: PageTaste): number {
  if (paused) return 0;
  return chosen.filter((id) => isChecking(id, page) && hasSomethingToSay(id, page)).length;
}

/** Issues on the page by the seasoning they belong to, worked out once per set of underlines. */
const slipCounts = new WeakMap<FoundIssue[], Record<SeasoningId, number>>();
function slipsOf(issues: FoundIssue[]): Record<SeasoningId, number> {
  let counts = slipCounts.get(issues);
  if (!counts) {
    counts = { sam: 0, pete: 0, daniel: 0, sally: 0 };
    for (const i of issues) counts[ownerOf(i.issue)]++;
    slipCounts.set(issues, counts);
  }
  return counts;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
