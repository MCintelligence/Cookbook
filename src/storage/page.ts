/**
 * The page a book is written and printed on: its size and margins, how the
 * editor shows it, and how far it is zoomed. Kept in book.json, so the book
 * looks the same on every device.
 */
export type PageSize = 'letter' | 'a4' | 'a5' | 'trade';
export type Margins = 'normal' | 'narrow' | 'wide';

export interface PageSettings {
  size: PageSize;
  margins: Margins;
  /** Page shows the sheet of paper; Draft is just the text, as wide as the window allows. */
  view: 'page' | 'draft';
  /** Percent; 0 fits the page to the window's width. */
  zoom: number;
}

export const PAGE_SIZES: Record<PageSize, { label: string; width: number; height: number }> = {
  letter: { label: 'US Letter', width: 8.5, height: 11 },
  a4: { label: 'A4', width: 8.27, height: 11.69 },
  a5: { label: 'A5', width: 5.83, height: 8.27 },
  trade: { label: 'Trade 6×9', width: 6, height: 9 },
};

/** Inches on every side. */
export const MARGINS: Record<Margins, { label: string; inches: number }> = {
  narrow: { label: 'Narrow', inches: 0.6 },
  normal: { label: 'Normal', inches: 1 },
  wide: { label: 'Wide', inches: 1.4 },
};

/** The steps for ⌘= and ⌘−, and the menu; the slider in the footer goes anywhere between the ends. 0 is Fit width. */
export const ZOOMS = [75, 100, 125, 150, 0] as const;
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 200;

export const DEFAULT_PAGE: PageSettings = { size: 'letter', margins: 'normal', view: 'page', zoom: 100 };

/** A book's page settings, with anything missing or not understood set to the default. */
export function pageOf(saved: unknown): PageSettings {
  const p = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof PageSettings, unknown>>;
  return {
    size: typeof p.size === 'string' && p.size in PAGE_SIZES ? (p.size as PageSize) : DEFAULT_PAGE.size,
    margins: typeof p.margins === 'string' && p.margins in MARGINS ? (p.margins as Margins) : DEFAULT_PAGE.margins,
    view: p.view === 'draft' ? 'draft' : 'page',
    zoom: typeof p.zoom === 'number' && (p.zoom === 0 || (p.zoom >= MIN_ZOOM && p.zoom <= MAX_ZOOM)) ? Math.round(p.zoom) : DEFAULT_PAGE.zoom,
  };
}

export function zoomLabel(zoom: number): string {
  return zoom === 0 ? 'Fit width' : `${zoom}%`;
}
