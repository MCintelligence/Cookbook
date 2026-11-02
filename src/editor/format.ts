import { type Alignment } from '../styles/styles';

/**
 * Direct formatting: what the toolbar sets on the words or paragraph in
 * front of the writer, as in Word, rather than on a style. Styles stay the
 * book-wide look; direct formatting wins over them where it is set.
 *
 * In the file it uses Pandoc's attribute syntax, which other Markdown apps
 * read (or at least leave alone):
 *
 *   [some words]{font="EB Garamond" size=14 color=#7a2e1f}
 *
 *   ::: {.letter align=center spacing=2}
 *   A Letter paragraph, centred and double spaced.
 *   :::
 */


/** Set on words. Points for size; colours are #rrggbb. */
export interface TextFormat {
  font?: string;
  size?: number;
  color?: string;
}

/** Set on paragraphs. Spacing is a multiple of the font size. */
export interface ParagraphFormat {
  align?: Alignment;
  lineSpacing?: number;
}

const ALIGNMENTS = new Set<string>(['left', 'center', 'right', 'justify']);
const HEX = /^#[0-9a-f]{6}$/i;

/** key=value and key="value" pairs, in order. Null if anything else is in there. */
function pairs(text: string): [string, string][] | null {
  const out: [string, string][] = [];
  const re = /\s*([a-z]+)=(?:"([^"\n]*)"|([^\s"{}]+))\s*/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while ((m = re.exec(text))) {
    out.push([m[1]!, m[2] ?? m[3]!]);
    at = re.lastIndex;
  }
  return at === text.length && out.length > 0 ? out : null;
}

const number = (v: string, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/** `font="EB Garamond" size=14`, or null when it isn't text formatting. */
export function parseTextFormat(text: string): TextFormat | null {
  const kv = pairs(text);
  if (!kv) return null;
  const f: TextFormat = {};
  for (const [k, v] of kv) {
    if (k === 'font' && v.trim()) f.font = v.trim();
    else if (k === 'size' && number(v, 1, 400) !== undefined) f.size = number(v, 1, 400);
    else if (k === 'color' && HEX.test(v)) f.color = v.toLowerCase();
    else return null;
  }
  return f;
}

export function writeTextFormat(f: TextFormat): string {
  const out: string[] = [];
  if (f.font) out.push(`font="${f.font.replace(/["\n{}]/g, '')}"`);
  if (f.size) out.push(`size=${f.size}`);
  if (f.color) out.push(`color=${f.color.toLowerCase()}`);
  return out.join(' ');
}

/** `align=center spacing=2`; anything it doesn't know is left out. */
export function parseParagraphFormat(text: string): ParagraphFormat {
  const f: ParagraphFormat = {};
  for (const [k, v] of pairs(text) ?? []) {
    if (k === 'align' && ALIGNMENTS.has(v)) f.align = v as Alignment;
    else if (k === 'spacing' && number(v, 0.5, 5) !== undefined) f.lineSpacing = number(v, 0.5, 5);
  }
  return f;
}

export function writeParagraphFormat(f: ParagraphFormat): string {
  const out: string[] = [];
  if (f.align) out.push(`align=${f.align}`);
  if (f.lineSpacing) out.push(`spacing=${f.lineSpacing}`);
  return out.join(' ');
}

/** Only the parts that are set, from mark or node attributes where unset ones are null. */
export function textFormatOf(from: object | undefined): TextFormat {
  const attrs = from as Record<string, unknown> | undefined;
  const f: TextFormat = {};
  if (typeof attrs?.font === 'string' && attrs.font) f.font = attrs.font;
  if (typeof attrs?.size === 'number' && attrs.size) f.size = attrs.size;
  if (typeof attrs?.color === 'string' && attrs.color) f.color = attrs.color;
  return f;
}

export function paragraphFormatOf(from: object | undefined): ParagraphFormat {
  const attrs = from as Record<string, unknown> | undefined;
  const f: ParagraphFormat = {};
  if (typeof attrs?.align === 'string' && ALIGNMENTS.has(attrs.align)) f.align = attrs.align as Alignment;
  if (typeof attrs?.lineSpacing === 'number' && attrs.lineSpacing) f.lineSpacing = attrs.lineSpacing;
  return f;
}

/**
 * Track changes on a paragraph: `change=ins` when the break before it is a
 * suggested new paragraph, `change=del` when it is suggested for joining onto
 * the one before, and `was="body align=center"` for the style and format it
 * had before a suggested restyle.
 */
export interface ParagraphChange {
  change?: 'ins' | 'del';
  was?: string;
}

export function parseParagraphChange(text: string): ParagraphChange {
  const f: ParagraphChange = {};
  for (const [k, v] of pairs(text) ?? []) {
    if (k === 'change' && (v === 'ins' || v === 'del')) f.change = v;
    else if (k === 'was' && /^[A-Za-z0-9_-]+( [a-z]+=[0-9a-z.]+)*$/.test(v)) f.was = v;
  }
  return f;
}

export function paragraphChangeOf(from: object | undefined): ParagraphChange {
  const attrs = from as Record<string, unknown> | undefined;
  const f: ParagraphChange = {};
  if (attrs?.change === 'ins' || attrs?.change === 'del') f.change = attrs.change;
  if (typeof attrs?.was === 'string' && attrs.was) f.was = attrs.was;
  return f;
}

export function writeParagraphChange(f: ParagraphChange): string {
  const out: string[] = [];
  if (f.change) out.push(`change=${f.change}`);
  if (f.was) out.push(`was="${f.was}"`);
  return out.join(' ');
}
