/**
 * Plate mode: how the finished book is set, saved in book.json as `plate`.
 * Nothing here changes the writing itself; leaving a chapter out or moving it
 * only changes the book that is served.
 */

export type TemplateId = 'classic' | 'modern' | 'literary' | 'cozy';
export type TrimId = '5x8' | '5.5x8.5' | '6x9';
export type OpenerId = 'words' | 'numeral' | 'title' | 'ornament';
export type FrontId = 'title' | 'copyright' | 'dedication' | 'contents';
export type BackId = 'acknowledgements' | 'about';

export interface Matter<T extends string> {
  id: T;
  on: boolean;
}

export interface PlateSettings {
  template: TemplateId;
  trim: TrimId;
  font: string;
  /** Body text size in points. */
  size: number;
  lineHeight: number;
  opener: OpenerId;
  dropCap: boolean;
  sceneBreak: string;
  runningHeaders: boolean;
  pageNumbers: boolean;
  /** Chapters start on a right-hand page, leaving a blank page before when needed. */
  rectoStarts: boolean;
  author: string;
  subtitle: string;
  copyright: string;
  dedication: string;
  acknowledgements: string;
  about: string;
  front: Matter<FrontId>[];
  back: Matter<BackId>[];
  /** Chapter paths in the order the book uses; any not listed follow in Shelf order. */
  chapterOrder: string[];
  /** Chapter paths left out of the book. */
  skipped: string[];
}

export const TRIMS: Record<TrimId, { label: string; width: number; height: number }> = {
  '5x8': { label: '5 × 8', width: 5, height: 8 },
  '5.5x8.5': { label: '5.5 × 8.5', width: 5.5, height: 8.5 },
  '6x9': { label: '6 × 9', width: 6, height: 9 },
};

export const PLATE_FONTS = ['EB Garamond', 'Libre Baskerville', 'Literata'] as const;

export const OPENERS: Record<OpenerId, string> = {
  words: 'Chapter One, then the title',
  numeral: 'Large number, then the title',
  title: 'Title only',
  ornament: 'Ornament and number',
};

export const SCENE_BREAKS: { glyph: string; label: string }[] = [
  { glyph: '❧', label: '❧ Fleuron' },
  { glyph: '* * *', label: '* * * Asterisks' },
  { glyph: '⁂', label: '⁂ Asterism' },
  { glyph: '✿ ✿ ✿', label: '✿ ✿ ✿ Flowers' },
  { glyph: '', label: 'Blank line' },
];

export const FRONT_LABELS: Record<FrontId, string> = { title: 'Title page', copyright: 'Copyright', dedication: 'Dedication', contents: 'Contents' };
export const BACK_LABELS: Record<BackId, string> = { acknowledgements: 'Acknowledgements', about: 'About the author' };

/** What each template sets; the controls can change any of it afterwards. */
export const TEMPLATES: Record<TemplateId, { label: string; set: Pick<PlateSettings, 'font' | 'size' | 'lineHeight' | 'opener' | 'dropCap' | 'sceneBreak'> }> = {
  classic: { label: 'Classic', set: { font: 'EB Garamond', size: 11.5, lineHeight: 1.4, opener: 'words', dropCap: true, sceneBreak: '❧' } },
  modern: { label: 'Modern', set: { font: 'Literata', size: 10, lineHeight: 1.5, opener: 'numeral', dropCap: false, sceneBreak: '* * *' } },
  literary: { label: 'Literary', set: { font: 'Libre Baskerville', size: 9.5, lineHeight: 1.55, opener: 'title', dropCap: false, sceneBreak: '' } },
  cozy: { label: 'Cozy', set: { font: 'EB Garamond', size: 12, lineHeight: 1.45, opener: 'ornament', dropCap: true, sceneBreak: '✿ ✿ ✿' } },
};

export const DEFAULT_PLATE: PlateSettings = {
  template: 'classic',
  trim: '5.5x8.5',
  ...TEMPLATES.classic.set,
  runningHeaders: true,
  pageNumbers: true,
  rectoStarts: true,
  author: '',
  subtitle: '',
  copyright: '',
  dedication: '',
  acknowledgements: '',
  about: '',
  front: [
    { id: 'title', on: true },
    { id: 'copyright', on: true },
    { id: 'dedication', on: false },
    { id: 'contents', on: true },
  ],
  back: [
    { id: 'acknowledgements', on: false },
    { id: 'about', on: false },
  ],
  chapterOrder: [],
  skipped: [],
};

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function matter<T extends string>(v: unknown, fallback: Matter<T>[]): Matter<T>[] {
  if (!Array.isArray(v)) return fallback;
  const known = new Set(fallback.map((m) => m.id));
  const seen = new Set<T>();
  const out: Matter<T>[] = [];
  for (const m of v as { id?: unknown; on?: unknown }[]) {
    if (m && known.has(m.id as T) && !seen.has(m.id as T)) {
      seen.add(m.id as T);
      out.push({ id: m.id as T, on: m.on === true });
    }
  }
  // Parts added by a later version, or missing from a hand-edited file, come back at the end.
  for (const m of fallback) if (!seen.has(m.id)) out.push(m);
  return out;
}

/** Reads saved settings, falling back part by part to the defaults. */
export function plateOf(raw: unknown): PlateSettings {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PLATE;
  const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && v >= min && v <= max ? v : fallback);
  return {
    template: typeof p.template === 'string' && p.template in TEMPLATES ? (p.template as TemplateId) : d.template,
    trim: typeof p.trim === 'string' && p.trim in TRIMS ? (p.trim as TrimId) : d.trim,
    font: typeof p.font === 'string' && (PLATE_FONTS as readonly string[]).includes(p.font) ? p.font : d.font,
    size: num(p.size, d.size, 8, 16),
    lineHeight: num(p.lineHeight, d.lineHeight, 1.1, 2),
    opener: typeof p.opener === 'string' && p.opener in OPENERS ? (p.opener as OpenerId) : d.opener,
    dropCap: bool(p.dropCap, d.dropCap),
    sceneBreak: typeof p.sceneBreak === 'string' && SCENE_BREAKS.some((b) => b.glyph === p.sceneBreak) ? p.sceneBreak : d.sceneBreak,
    runningHeaders: bool(p.runningHeaders, d.runningHeaders),
    pageNumbers: bool(p.pageNumbers, d.pageNumbers),
    rectoStarts: bool(p.rectoStarts, d.rectoStarts),
    author: str(p.author, d.author),
    subtitle: str(p.subtitle, d.subtitle),
    copyright: str(p.copyright, d.copyright),
    dedication: str(p.dedication, d.dedication),
    acknowledgements: str(p.acknowledgements, d.acknowledgements),
    about: str(p.about, d.about),
    front: matter(p.front, d.front),
    back: matter(p.back, d.back),
    chapterOrder: strings(p.chapterOrder),
    skipped: strings(p.skipped),
  };
}

/** Picking a template sets the look it stands for and keeps everything else. */
export function withTemplate(s: PlateSettings, template: TemplateId): PlateSettings {
  return { ...s, template, ...TEMPLATES[template].set };
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 1 → "One", 42 → "Forty-Two", 120 → "One Hundred Twenty", as chapter openers spell them. */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  return String(n);
}

/** The copyright line used when the writer hasn't written one. */
export function defaultCopyright(author: string, year = new Date().getFullYear()): string {
  return `Copyright © ${year}${author.trim() ? ` ${author.trim()}` : ''}\nAll rights reserved.`;
}

/** Chapters in the book's order: the saved order first, then any new ones in Shelf order. */
export function orderChapters<T extends { path: string }>(chapters: T[], order: string[]): T[] {
  const at = new Map(order.map((p, i) => [p, i]));
  const known = chapters.filter((c) => at.has(c.path)).sort((a, b) => at.get(a.path)! - at.get(b.path)!);
  return [...known, ...chapters.filter((c) => !at.has(c.path))];
}
