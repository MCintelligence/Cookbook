import { type StorageAdapter } from '../storage/adapter';

/**
 * Named styles live in the book folder as `styles.json`, so they travel with
 * the manuscript. Paragraph styles carry the whole look of a paragraph;
 * character styles only set what they name and otherwise inherit from the
 * paragraph they sit in (italic in a Letter stays in the Letter's font).
 */
export type Alignment = 'left' | 'center' | 'right' | 'justify';
export type Kerning = 'auto' | 'none';

export interface ParagraphStyle {
  id: string;
  name: string;
  /** Unset properties come from this style, and finally from Body. */
  basedOn?: string;
  /** The style a new paragraph gets after pressing Enter. */
  next?: string;
  font?: string;
  /** Points. */
  size?: number;
  color?: string;
  align?: Alignment;
  /** Multiple of the font size, as in Word's "Multiple". */
  lineSpacing?: number;
  /** Inches. */
  firstLineIndent?: number;
  /** Inches, applied to both sides (block quotes, letters). */
  sideIndent?: number;
  /** Points. */
  spaceBefore?: number;
  /** Points. */
  spaceAfter?: number;
  /** Percent of the font size; 0 is normal. */
  letterSpacing?: number;
  kerning?: Kerning;
  bold?: boolean;
  italic?: boolean;
}

export interface CharacterStyle {
  id: string;
  name: string;
  /** Only set when the style exists to change the font. */
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
}

export interface StyleSheet {
  format: 1;
  paragraph: ParagraphStyle[];
  character: CharacterStyle[];
}

export const STYLES_FILE = 'styles.json';
export const BODY = 'body';

export const FONTS = ['Literata', 'EB Garamond', 'Libre Baskerville', 'Courier Prime', 'Fraunces', 'Nunito'] as const;

export function defaultStyles(): StyleSheet {
  return {
    format: 1,
    paragraph: [
      {
        id: BODY,
        name: 'Body',
        next: BODY,
        font: 'Literata',
        size: 12,
        color: '#3B2A20',
        align: 'justify',
        lineSpacing: 1.5,
        firstLineIndent: 0.5,
        sideIndent: 0,
        spaceBefore: 0,
        spaceAfter: 0,
        letterSpacing: 0,
        kerning: 'auto',
        bold: false,
        italic: false,
      },
      { id: 'body-first', name: 'Body, first after break', basedOn: BODY, next: BODY, firstLineIndent: 0 },
      {
        id: 'chapter-title',
        name: 'Chapter title',
        basedOn: BODY,
        next: 'body-first',
        font: 'Fraunces',
        size: 18,
        align: 'center',
        firstLineIndent: 0,
        spaceAfter: 18,
        bold: true,
      },
      { id: 'letter', name: 'Letter', basedOn: BODY, next: 'letter', italic: true, sideIndent: 0.5, firstLineIndent: 0, spaceBefore: 9, spaceAfter: 9 },
      { id: 'epigraph', name: 'Epigraph', basedOn: BODY, next: 'body-first', size: 11, italic: true, align: 'right', firstLineIndent: 0, spaceAfter: 18 },
    ],
    character: [
      { id: 'strong', name: 'Strong', bold: true },
      { id: 'emphasis', name: 'Emphasis', italic: true },
      { id: 'underline', name: 'Underline', underline: true },
      { id: 'thought', name: 'Thought', italic: true, color: '#6B4A6E' },
      { id: 'small-caps', name: 'Small caps', smallCaps: true },
    ],
  };
}

export async function loadStyles(fs: StorageAdapter): Promise<StyleSheet> {
  if (!(await fs.exists(STYLES_FILE))) return defaultStyles();
  const sheet = JSON.parse(await fs.readText(STYLES_FILE)) as Partial<StyleSheet>;
  const defaults = defaultStyles();
  const paragraph = Array.isArray(sheet.paragraph) ? sheet.paragraph : [];
  const character = Array.isArray(sheet.character) ? sheet.character : [];
  // Body must always exist, because every other style falls back to it.
  if (!paragraph.some((s) => s.id === BODY)) paragraph.unshift(defaults.paragraph[0]!);
  return { format: 1, paragraph, character };
}

export async function saveStyles(fs: StorageAdapter, sheet: StyleSheet): Promise<void> {
  await fs.writeText(STYLES_FILE, JSON.stringify(sheet, null, 2) + '\n');
}

export function paragraphStyle(sheet: StyleSheet, id: string): ParagraphStyle {
  return sheet.paragraph.find((s) => s.id === id) ?? sheet.paragraph.find((s) => s.id === BODY)!;
}

/** Every property filled in, following basedOn chains (with a guard against loops). */
export function resolveParagraphStyle(sheet: StyleSheet, id: string): Required<Omit<ParagraphStyle, 'basedOn'>> {
  const chain: ParagraphStyle[] = [];
  const seen = new Set<string>();
  let current: ParagraphStyle | undefined = paragraphStyle(sheet, id);
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.basedOn ? sheet.paragraph.find((s) => s.id === current!.basedOn) : undefined;
  }
  const body = defaultStyles().paragraph[0]! as Required<ParagraphStyle>;
  const merged: Record<string, unknown> = { ...body };
  for (const style of chain) {
    for (const [key, value] of Object.entries(style)) if (value !== undefined) merged[key] = value;
  }
  delete merged.basedOn;
  merged.id = id;
  return merged as Required<Omit<ParagraphStyle, 'basedOn'>>;
}

/** Returns a new sheet with one paragraph style changed. */
export function updateParagraphStyle(sheet: StyleSheet, id: string, changes: Partial<ParagraphStyle>): StyleSheet {
  return {
    ...sheet,
    paragraph: sheet.paragraph.map((s) => (s.id === id ? { ...s, ...changes, id: s.id } : s)),
  };
}

const PX_PER_PT = 4 / 3;
const PX_PER_IN = 96;

function fontStack(font: string): string {
  const fallback = font === 'Courier Prime' ? 'monospace' : font === 'Nunito' ? 'sans-serif' : 'serif';
  return `'${font.replace(/'/g, '')}', ${fallback}`;
}

function cssValue(v: string): string {
  return v.replace(/[;{}<>]/g, '');
}

/** CSS for the page, scoped under `scope`. 12 pt text is 16 px at 100% zoom. */
export function stylesToCss(sheet: StyleSheet, scope = '.cb-page'): string {
  const rules: string[] = [];
  for (const { id } of sheet.paragraph) {
    const s = resolveParagraphStyle(sheet, id);
    const selector = id === BODY ? `${scope} p:not([data-style]), ${scope} p[data-style="${id}"]` : `${scope} p[data-style="${cssValue(id)}"]`;
    rules.push(
      `${selector} {` +
        ` font-family: ${fontStack(s.font)};` +
        ` font-size: ${s.size * PX_PER_PT}px;` +
        ` color: ${cssValue(s.color)};` +
        ` text-align: ${s.align};` +
        ` line-height: ${s.lineSpacing};` +
        ` text-indent: ${s.firstLineIndent * PX_PER_IN}px;` +
        ` margin: ${s.spaceBefore * PX_PER_PT}px ${s.sideIndent * PX_PER_IN}px ${s.spaceAfter * PX_PER_PT}px;` +
        ` letter-spacing: ${s.letterSpacing / 100}em;` +
        ` font-kerning: ${s.kerning === 'none' ? 'none' : 'normal'};` +
        ` font-weight: ${s.bold ? 700 : 400};` +
        ` font-style: ${s.italic ? 'italic' : 'normal'};` +
        ` }`,
    );
  }
  for (const c of sheet.character) {
    const props: string[] = [];
    if (c.font) props.push(`font-family: ${fontStack(c.font)}`);
    if (c.size) props.push(`font-size: ${c.size * PX_PER_PT}px`);
    if (c.color) props.push(`color: ${cssValue(c.color)}`);
    if (c.bold !== undefined) props.push(`font-weight: ${c.bold ? 700 : 400}`);
    if (c.italic !== undefined) props.push(`font-style: ${c.italic ? 'italic' : 'normal'}`);
    if (c.underline) props.push('text-decoration: underline');
    if (c.smallCaps) props.push('font-variant-caps: small-caps');
    rules.push(`${scope} span[data-char~="${cssValue(c.id)}"] { ${props.join('; ')} }`);
  }
  return rules.join('\n');
}
