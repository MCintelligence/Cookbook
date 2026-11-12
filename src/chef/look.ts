import { FONTS } from '../styles/styles';

/**
 * How Chef Mode shows the page, like the settings at the bottom of an e-book reader. It is the
 * writer's own way of reading, kept on this device with the app's settings: nothing here changes
 * the recipe, its paragraph styles, or what is plated.
 */
export interface ChefLook {
  /** The reader bar at the bottom is open; closed, only a small tab shows. */
  bar: boolean;
  /** One of PAPERS, or a colour picked by hand (#rrggbb). */
  paper: string;
  /** 'auto' goes with the paper; otherwise one of INKS, or a colour picked by hand. */
  ink: string;
  /** 'page' keeps each paragraph style's own font; otherwise one font for every word. */
  font: string;
  /** Text size, in per cent of the page's own. */
  size: number;
  /** Line height, or 0 for each style's own. */
  line: number;
  /** Space after each paragraph in ems, or -1 for each style's own. */
  para: number;
  /** How wide the column of text is, in pixels at 100%. */
  width: number;
  /** Chef notes show in the margin. */
  notes: boolean;
  /** Resolved Chef notes show too, greyed. */
  resolved: boolean;
}

export const DEFAULT_LOOK: ChefLook = { bar: true, paper: 'page', ink: 'auto', font: 'page', size: 100, line: 0, para: -1, width: 680, notes: true, resolved: true };

/** Papers, each with the ink that reads best on it. "page" is the recipe's own page in the current theme. */
export const PAPERS: { id: string; name: string; bg: string; ink: string; dark?: boolean }[] = [
  { id: 'page', name: 'The page', bg: '', ink: '' },
  { id: 'white', name: 'White', bg: '#ffffff', ink: '#1c1c1b' },
  { id: 'cream', name: 'Cream', bg: '#f7f0e1', ink: '#2e2922' },
  { id: 'sepia', name: 'Sepia', bg: '#eadcc2', ink: '#3b2b1d' },
  { id: 'grey', name: 'Grey', bg: '#e4e4e1', ink: '#232322' },
  { id: 'dusk', name: 'Dusk', bg: '#2d2e33', ink: '#dcd8cf', dark: true },
  { id: 'night', name: 'Night', bg: '#151515', ink: '#c9c5bc', dark: true },
];

export const INKS: { id: string; name: string; color: string }[] = [
  { id: 'auto', name: 'To suit the paper', color: '' },
  { id: 'black', name: 'Black', color: '#1c1c1b' },
  { id: 'brown', name: 'Brown', color: '#4a3424' },
  { id: 'slate', name: 'Slate', color: '#34404f' },
  { id: 'cream', name: 'Cream', color: '#ece6da' },
  { id: 'amber', name: 'Amber', color: '#e4b877' },
];

/** Fonts for every word: the ones Cookbook carries, so they work offline, and the system's plain sans. */
export const READER_FONTS: { id: string; name: string; stack: string }[] = [
  { id: 'page', name: 'As styled', stack: '' },
  ...FONTS.map((f) => ({ id: f, name: f, stack: `'${f}', ${f === 'Courier Prime' ? 'monospace' : 'serif'}` })),
  { id: 'sans', name: 'Sans serif', stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

export const SIZE = { min: 70, max: 200, step: 10 };
export const LINE = { min: 1, max: 2.6, step: 0.1, start: 1.6 };
export const PARA = { min: 0, max: 2, step: 0.25, start: 0.75 };
export const WIDTH = { min: 440, max: 1100, step: 60 };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** What a saved look says, with anything missing or damaged put back to the default. */
export function parseLook(raw: unknown): ChefLook {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const paper = typeof r.paper === 'string' && (PAPERS.some((p) => p.id === r.paper) || HEX.test(r.paper)) ? r.paper : DEFAULT_LOOK.paper;
  const ink = typeof r.ink === 'string' && (INKS.some((i) => i.id === r.ink) || HEX.test(r.ink)) ? r.ink : DEFAULT_LOOK.ink;
  const font = typeof r.font === 'string' && READER_FONTS.some((f) => f.id === r.font) ? r.font : DEFAULT_LOOK.font;
  const line = num(r.line, 0);
  const para = num(r.para, -1);
  return {
    bar: typeof r.bar === 'boolean' ? r.bar : DEFAULT_LOOK.bar,
    paper,
    ink,
    font,
    size: clamp(Math.round(num(r.size, 100)), SIZE.min, SIZE.max),
    line: line === 0 ? 0 : clamp(line, LINE.min, LINE.max),
    para: para < 0 ? -1 : clamp(para, PARA.min, PARA.max),
    width: clamp(Math.round(num(r.width, DEFAULT_LOOK.width)), WIDTH.min, WIDTH.max),
    notes: typeof r.notes === 'boolean' ? r.notes : DEFAULT_LOOK.notes,
    resolved: typeof r.resolved === 'boolean' ? r.resolved : DEFAULT_LOOK.resolved,
  };
}

/** Whether a colour is dark, so what sits on it (marks, the cursor, controls) can go light. */
export function isDark(hex: string): boolean {
  if (!HEX.test(hex)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.45;
}

export function paperColour(look: ChefLook): string | null {
  if (HEX.test(look.paper)) return look.paper;
  return PAPERS.find((p) => p.id === look.paper)?.bg || null;
}

export function inkColour(look: ChefLook): string | null {
  if (HEX.test(look.ink)) return look.ink;
  const chosen = INKS.find((i) => i.id === look.ink)?.color;
  if (chosen) return chosen;
  // To suit the paper: the paper's own ink, or a light or dark one for a paper picked by hand.
  const preset = PAPERS.find((p) => p.id === look.paper);
  if (preset) return preset.ink || null;
  return isDark(look.paper) ? '#dcd8cf' : '#1c1c1b';
}

/**
 * The look as CSS variables and class names for the app's root. A setting left as the page's own
 * adds nothing, so the recipe's paragraph styles show through.
 */
export function lookVars(look: ChefLook): { vars: Record<string, string>; classes: string[] } {
  const vars: Record<string, string> = {
    '--chef-size': String(look.size / 100),
    '--chef-w': `${look.width}px`,
  };
  const classes: string[] = [];
  const paper = paperColour(look);
  const ink = inkColour(look);
  if (paper) {
    vars['--chef-paper'] = paper;
    classes.push('chef-paper');
    if (isDark(paper)) classes.push('chef-dark');
  }
  if (ink) {
    vars['--chef-ink'] = ink;
    classes.push('chef-ink');
  }
  const font = READER_FONTS.find((f) => f.id === look.font);
  if (font?.stack) {
    vars['--chef-font'] = font.stack;
    classes.push('chef-font');
  }
  if (look.line > 0) {
    vars['--chef-line'] = String(Math.round(look.line * 100) / 100);
    classes.push('chef-line');
  }
  if (look.para >= 0) {
    vars['--chef-para'] = `${look.para}em`;
    classes.push('chef-para');
  }
  return { vars, classes };
}
