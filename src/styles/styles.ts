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
/** Paragraph styles every book has, because Markdown has its own syntax for them. */
const BUILT_IN = ['chapter-title', 'heading-2', 'heading-3', 'quote'];
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
        firstLineIndent: 0,
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
      { id: 'heading-2', name: 'Heading 2', basedOn: 'chapter-title', next: 'body-first', size: 15, spaceBefore: 12, spaceAfter: 12 },
      { id: 'heading-3', name: 'Heading 3', basedOn: 'chapter-title', next: 'body-first', size: 13, align: 'left', spaceBefore: 12, spaceAfter: 6 },
      { id: 'quote', name: 'Quote', basedOn: BODY, next: BODY, italic: true, sideIndent: 0.5, firstLineIndent: 0, spaceBefore: 6, spaceAfter: 6 },
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
  // Styles Markdown has syntax for (# headings, > quotes) are added to books made before they existed.
  for (const id of BUILT_IN) {
    if (paragraph.some((s) => s.id === id)) continue;
    const style = defaults.paragraph.find((s) => s.id === id)!;
    const before = defaults.paragraph.findIndex((s) => s.id === id) - 1;
    const after = paragraph.findIndex((s) => s.id === defaults.paragraph[before]?.id);
    paragraph.splice(after === -1 ? paragraph.length : after + 1, 0, style);
  }
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

/**
 * Adds a paragraph style that starts out looking like `basedOn` (and follows
 * it when that changes). Its id comes from the name, kept unique.
 */
export function addParagraphStyle(sheet: StyleSheet, name: string, basedOn: string): { sheet: StyleSheet; id: string } {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';
  let id = base;
  for (let n = 2; sheet.paragraph.some((s) => s.id === id) || sheet.character.some((s) => s.id === id) || id === 'ul' || id === 'note'; n++) id = `${base}-${n}`;
  const parent = paragraphStyle(sheet, basedOn);
  const style: ParagraphStyle = { id, name, basedOn: parent.id, next: parent.next === parent.id ? id : parent.next };
  const at = sheet.paragraph.findIndex((s) => s.id === parent.id);
  const paragraph = [...sheet.paragraph];
  paragraph.splice(at + 1, 0, style);
  return { sheet: { ...sheet, paragraph }, id };
}

/** Renames a style; its id, and so every paragraph using it, stays the same. */
export function renameParagraphStyle(sheet: StyleSheet, id: string, name: string): StyleSheet {
  return { ...sheet, paragraph: sheet.paragraph.map((s) => (s.id === id ? { ...s, name } : s)) };
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

/**
 * The same colour for text on the dark page: hue and saturation kept, lightness
 * mirrored so dark ink reads as light ink. Colours that aren't #rgb or #rrggbb are kept.
 */
export function darkPageColor(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= 0.6) return color;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  // Dark ink becomes light; colours already light enough to read stay as they are.
  const light = Math.max(Math.min(0.9, 1 - l), 0.7);
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + light - c / 2) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** A selector list that only applies while the page is drawn dark (see settings.ts). */
const onDarkPage = (selector: string) =>
  selector
    .split(',')
    .map((part) => `:root[data-page="dark"] ${part.trim()}`)
    .join(', ');

/** CSS for the page, scoped under `scope`. 12 pt text is 16 px at 100% zoom. */
/** `dark` adds the dark-page colours; printed and exported books leave them out. */
export function stylesToCss(sheet: StyleSheet, scope = '.cb-page', dark = true): string {
  const rules: string[] = [];
  // Text colours chosen for paper, redone for the dark page.
  const darkRules: string[] = [];
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
    darkRules.push(`${onDarkPage(selector)} { color: ${cssValue(darkPageColor(s.color))}; }`);
  }
  for (const c of sheet.character) {
    const props: string[] = [];
    if (c.font) props.push(`font-family: ${fontStack(c.font)}`);
    if (c.size) props.push(`font-size: ${c.size * PX_PER_PT}px`);
    if (c.color) {
      props.push(`color: ${cssValue(c.color)}`);
      darkRules.push(`${onDarkPage(`${scope} span[data-char~="${cssValue(c.id)}"]`)} { color: ${cssValue(darkPageColor(c.color))}; }`);
    }
    if (c.bold !== undefined) props.push(`font-weight: ${c.bold ? 700 : 400}`);
    if (c.italic !== undefined) props.push(`font-style: ${c.italic ? 'italic' : 'normal'}`);
    if (c.underline) props.push('text-decoration: underline');
    if (c.smallCaps) props.push('font-variant-caps: small-caps');
    rules.push(`${scope} span[data-char~="${cssValue(c.id)}"] { ${props.join('; ')} }`);
  }
  if (dark) rules.push(...darkRules);
  return rules.join('\n');
}
