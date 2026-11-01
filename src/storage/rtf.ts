import { type MarkJSON, type NodeJSON, BODY_STYLE, HEADING_STYLES, QUOTE_STYLE } from '../editor/markdown';

/**
 * Reads Rich Text (RTF), the format Scrivener keeps every document in, into
 * Cookbook's page content. Paragraphs, line breaks, bold, italic, underline,
 * strikethrough, links and footnotes come through; headings and quotes come
 * back from the style names Scrivener gives them. Fonts, colours and sizes
 * are left behind, so the page takes the Recipe's own look. A line holding
 * only #, * * * or similar becomes a scene break.
 */

interface CharState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** Text in this group is not part of the page: a font table, a picture, a header. */
  skip: boolean;
  /** How many characters stand in for each \u character after it. */
  uc: number;
  /** Text here belongs to a footnote, a link's address or a style's name rather than the page. */
  into: 'page' | 'footnote' | 'fldinst' | 'style';
  link: string | null;
}

/** Destinations whose text is never part of the page. */
const SKIPPED = new Set([
  'fonttbl', 'colortbl', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore',
  'expandedcolortbl', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'nonshppict', 'bkmkstart', 'bkmkend', 'annotation', 'atnid', 'atnauthor',
]);

const SYMBOLS: Record<string, string> = {
  emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', qmspace: ' ',
};

// Windows-1252 between 0x80 and 0x9f; every other byte is its own Latin-1 character.
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const byteChar = (b: number) => (b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80]! : String.fromCharCode(b));

const text = (t: string, marks: MarkJSON[]): NodeJSON => (marks.length > 0 ? { type: 'text', text: t, marks } : { type: 'text', text: t });

function styleFor(name: string): string {
  const n = name.trim().toLowerCase();
  if (/^(title|heading ?1|chapter( title| heading)?)$/.test(n)) return HEADING_STYLES[0];
  if (/^(subtitle|heading ?2)$/.test(n)) return HEADING_STYLES[1];
  if (/^heading ?[3-9]$/.test(n)) return HEADING_STYLES[2];
  if (/quot/.test(n)) return QUOTE_STYLE;
  return BODY_STYLE;
}

export function rtfToContent(rtf: string): NodeJSON[] {
  const content: NodeJSON[] = [];
  const styles = new Map<number, string>();
  let state: CharState = { bold: false, italic: false, underline: false, strike: false, skip: false, uc: 1, into: 'page', link: null };
  const stack: CharState[] = [];
  /** Inline nodes of the paragraph being read, and its style number. */
  let line: NodeJSON[] = [];
  let paraStyle = 0;
  let footnote = null as string[] | null;
  let fldinst = null as string[] | null;
  let styleName = null as { number: number; words: string[] } | null;
  /** Characters still to drop after a \u, standing in for it in older readers. */
  let dropping = 0;
  /** Whether the last control word was \*, marking the next as one to skip if unknown. */
  let starred = false;
  /** The first control word of the current group, which names a destination. */
  let first = false;

  const marks = (): MarkJSON[] => {
    const m: MarkJSON[] = [];
    if (state.link) m.push({ type: 'link', attrs: { href: state.link } });
    if (state.bold) m.push({ type: 'bold' });
    if (state.italic) m.push({ type: 'italic' });
    if (state.underline && !state.link) m.push({ type: 'underline' });
    if (state.strike) m.push({ type: 'strike' });
    return m;
  };

  const put = (t: string) => {
    if (dropping > 0) {
      const n = Math.min(dropping, t.length);
      dropping -= n;
      t = t.slice(n);
      if (!t) return;
    }
    if (state.skip) return;
    if (state.into === 'footnote') footnote?.push(t);
    else if (state.into === 'fldinst') fldinst?.push(t);
    else if (state.into === 'style') styleName?.words.push(t);
    else {
      const m = marks();
      const prev = line[line.length - 1];
      if (prev?.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(m)) prev.text += t;
      else line.push(text(t, m));
    }
  };

  const endParagraph = () => {
    const nodes = line;
    line = [];
    while (nodes[0]?.type === 'hardBreak') nodes.shift();
    while (nodes[nodes.length - 1]?.type === 'hardBreak') nodes.pop();
    const head = nodes[0];
    if (head?.type === 'text') head.text = head.text!.replace(/^\s+/, '');
    const tail = nodes[nodes.length - 1];
    if (tail?.type === 'text') tail.text = tail.text!.replace(/\s+$/, '');
    const kept = nodes.filter((n) => n.type !== 'text' || n.text !== '');
    if (kept.length === 0) return;
    const plain = kept.map((n) => n.text ?? '').join('').trim();
    if (kept.every((n) => n.type === 'text') && /^(#|\*(\s*\*){2,}|~|-\s*-\s*-)$/.test(plain)) {
      content.push({ type: 'sceneBreak' });
      return;
    }
    content.push({ type: 'paragraph', attrs: { style: styleFor(styles.get(paraStyle) ?? '') }, content: kept });
  };

  const word = (name: string, arg: number | null) => {
    const isFirst = first;
    first = false;
    const star = starred;
    starred = false;
    if (state.skip && name !== 'u') return;
    // Scrivener's own groups (Scrv_annot for inline notes, among others) are its markup, not the page.
    if (isFirst && (SKIPPED.has(name) || name.startsWith('Scrv'))) return void (state.skip = true);
    if (isFirst && name === 'stylesheet') return void (state.into = 'style');
    if (isFirst && name === 'footnote') {
      footnote = [];
      state.into = 'footnote';
      return;
    }
    if (isFirst && name === 'fldinst') {
      fldinst = [];
      state.into = 'fldinst';
      return;
    }
    if (state.into === 'style') {
      if ((name === 's' || name === 'cs' || name === 'ds' || name === 'ts') && styleName === null) styleName = { number: name === 's' ? (arg ?? 0) : -1, words: [] };
      return;
    }
    switch (name) {
      case 'par':
      case 'row':
        if (state.into === 'footnote') footnote?.push(' ');
        else if (state.into === 'page') endParagraph();
        return;
      case 'sect':
      case 'page':
        if (state.into === 'page') endParagraph();
        return;
      case 'line':
        if (state.into === 'page' && !state.skip) line.push({ type: 'hardBreak' });
        else put(' ');
        return;
      case 'tab':
      case 'cell':
        return put(' ');
      case 'u': {
        if (state.skip) return void (dropping = state.uc);
        const code = (arg ?? 0) < 0 ? (arg ?? 0) + 65536 : (arg ?? 0);
        put(String.fromCharCode(code));
        dropping = state.uc;
        return;
      }
      case 'uc':
        state.uc = Math.max(0, arg ?? 1);
        return;
      case 'b':
        state.bold = arg !== 0;
        return;
      case 'i':
        state.italic = arg !== 0;
        return;
      case 'strike':
      case 'striked':
        state.strike = arg !== 0;
        return;
      case 'ul':
      case 'uld':
      case 'uldb':
      case 'ulw':
      case 'ulth':
      case 'uldash':
        state.underline = arg !== 0;
        return;
      case 'ulnone':
        state.underline = false;
        return;
      case 'plain':
        state.bold = state.italic = state.underline = state.strike = false;
        return;
      // A footnote's own paragraphs don't change the style of the one it sits in.
      case 'pard':
        if (state.into === 'page') paraStyle = 0;
        return;
      case 's':
        if (state.into === 'page') paraStyle = arg ?? 0;
        return;
      case 'chftn':
        return;
      default:
        if (SYMBOLS[name]) return put(SYMBOLS[name]!);
        // An unknown destination marked with \* is skipped whole, as RTF asks.
        if (isFirst && star) state.skip = true;
    }
  };

  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const c = rtf[i]!;
    if (c === '{') {
      stack.push(state);
      state = { ...state };
      first = true;
      starred = false;
      i++;
    } else if (c === '}') {
      const leaving = state;
      state = stack.pop() ?? state;
      if (leaving.into === 'footnote' && state.into !== 'footnote' && footnote) {
        const note = footnote.join('').replace(/\s+/g, ' ').trim();
        footnote = null;
        if (note && state.into === 'page' && !state.skip) line.push({ type: 'footnote', attrs: { text: note } });
      }
      if (leaving.into === 'fldinst' && state.into !== 'fldinst' && fldinst) {
        const address = /HYPERLINK\s+"([^"]+)"/i.exec(fldinst.join(''))?.[1] ?? null;
        fldinst = null;
        // The link covers the field's result, which follows in the enclosing \field group.
        if (address && /^(https?:|mailto:)/i.test(address)) state.link = address;
      }
      if (leaving.into === 'style' && state.into === 'style' && styleName) {
        const name = styleName.words.join('').replace(/;\s*$/, '').trim();
        if (styleName.number >= 0) styles.set(styleName.number, name);
        styleName = null;
      }
      first = false;
      i++;
    } else if (c === '\\') {
      const next = rtf[i + 1] ?? '';
      if (/[a-zA-Z]/.test(next)) {
        let j = i + 1;
        while (j < n && /[a-zA-Z]/.test(rtf[j]!)) j++;
        const name = rtf.slice(i + 1, j);
        let k = j;
        if (rtf[k] === '-' || /[0-9]/.test(rtf[k] ?? '')) {
          k++;
          while (k < n && /[0-9]/.test(rtf[k]!)) k++;
        }
        const arg = k > j ? Number(rtf.slice(j, k)) : null;
        if (rtf[k] === ' ') k++;
        i = k;
        // Bytes after \bin are raw data, never text.
        if (name === 'bin') {
          i += Math.max(0, arg ?? 0);
          continue;
        }
        word(name, arg);
      } else {
        i += 2;
        if (next === "'") {
          const hex = rtf.slice(i, i + 2);
          i += 2;
          first = false;
          if (dropping > 0) dropping--;
          else put(byteChar(parseInt(hex, 16) || 0));
        } else if (next === '*') {
          starred = true;
        } else if (next === '\n' || next === '\r') {
          first = false;
          word('par', null);
        } else {
          first = false;
          if (next === '~') put(' ');
          else if (next === '_') put('‑');
          else if (next === '-') {
            // An optional hyphen is only there for breaking lines.
          } else if (next === '\\' || next === '{' || next === '}') put(next);
        }
      }
    } else if (c === '\n' || c === '\r') {
      i++;
    } else {
      // A run of plain text up to the next control character.
      let j = i;
      while (j < n && !'{}\\\n\r'.includes(rtf[j]!)) j++;
      first = false;
      put(rtf.slice(i, j));
      i = j;
    }
  }
  endParagraph();
  return content;
}

/** Reads an RTF file's bytes; RTF is 7-bit, with other characters escaped, so Latin-1 reads it safely. */
export function decodeRtf(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}
