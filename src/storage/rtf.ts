import { type MarkJSON, type NodeJSON, BODY_STYLE, HEADING_STYLES, QUOTE_STYLE } from '../editor/markdown';
import { newId } from './document';

/**
 * Reads Rich Text (RTF), the format Scrivener keeps every document in, into
 * Cookbook's page content. Paragraphs, line breaks, bold, italic, underline,
 * strikethrough, links and footnotes come through; headings and quotes come
 * back from the style names Scrivener gives them. Fonts, colours and sizes
 * are left behind, so the page takes the Recipe's own look. A line holding
 * only #, * * * or similar becomes a scene break.
 *
 * Scrivener's notes in the text come through as Cookbook's own: inline
 * footnotes as footnotes, inline annotations and RTF annotations as notes to
 * self on the word before them, and linked comments (scrivcmt:// fields, whose
 * words are in content.comments) as notes to self on the words they cover.
 * Suggested changes from a word processor (\revised, \deleted) stay suggestions.
 */

interface CharState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** Raised text, such as an ordinal's ending (\\super). */
  sup: boolean;
  /** Track changes from a word processor: text suggested for adding (\\revised) or taking out (\\deleted). */
  inserted: boolean;
  deleted: boolean;
  /** Text in this group is not part of the page: a font table, a picture, a header. */
  skip: boolean;
  /** How many characters stand in for each \u character after it. */
  uc: number;
  /** Text here belongs to a footnote, a link's address or a style's name rather than the page. */
  into: 'page' | 'footnote' | 'fldinst' | 'style' | 'annot';
  link: string | null;
  /** The note to self this text is the anchor of: a Scrivener comment. */
  note: string | null;
  /** A Scrivener linked footnote, put in once the field holding its anchor ends. */
  footnoteAfter: string | null;
}

/** A Scrivener comment or linked footnote, from the document's content.comments, by its id. */
export interface LinkedNote {
  text: string;
  footnote: boolean;
}

/** A page read from RTF, with the notes to self anchored in it, keyed by the ids its note marks carry. */
export interface RtfPage {
  content: NodeJSON[];
  notes: Record<string, string>;
}

/** Destinations whose text is never part of the page. */
const SKIPPED = new Set([
  'fonttbl', 'colortbl', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore',
  'expandedcolortbl', 'atrfstart', 'atrfend', 'atnref', 'atndate', 'atnicn', 'atnparent', 'atntime', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'nonshppict', 'bkmkstart', 'bkmkend', 'atnid', 'atnauthor',
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

/**
 * Scrivener writes inline footnotes and annotations as its own markup inside the RTF,
 * {\Scrv_fn=…\end_Scrv_fn} and {\Scrv_annot \color=… \text=…\end_Scrv_annot}. They are
 * turned into groups the reader knows: a footnote, and an annotation of its own.
 */
function scrivenerMarkup(rtf: string): string {
  if (!/\\scrv_/i.test(rtf)) return rtf;
  return rtf
    .replace(/\\Scrv_fn\s*=\s*([\s\S]*?)\\end_Scrv_fn/gi, (_, t: string) => `{\\footnote ${t}}`)
    .replace(/\\Scrv_annot\b([\s\S]*?)\\end_Scrv_annot/gi, (_, inner: string) => {
      const said = /\\text\s*=\s*([\s\S]*)$/i.exec(inner)?.[1] ?? '';
      return `{\\cbannot ${said.trim().replace(/^"([\s\S]*)"$/, '$1')}}`;
    });
}

/** The words of a page, comment or note, as plain text with one line per paragraph. */
export function rtfToPlain(rtf: string): string {
  return plainOf(rtfToContent(rtf));
}

function plainOf(nodes: NodeJSON[]): string {
  return nodes
    .map((n) => (n.type === 'sceneBreak' ? '* * *' : (n.content ?? []).map((c) => (c.type === 'hardBreak' ? '\n' : (c.text ?? ''))).join('')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function rtfToContent(rtf: string): NodeJSON[] {
  return rtfToPage(rtf).content;
}

/**
 * Reads a page and the notes to self in it. Linked comments are looked up in
 * `linked`, read from the document's content.comments; one that isn't there leaves its words as plain text.
 */
export function rtfToPage(source: string, linked: ReadonlyMap<string, LinkedNote> = new Map()): RtfPage {
  const rtf = scrivenerMarkup(source);
  const content: NodeJSON[] = [];
  const notes: Record<string, string> = {};
  /** Notes whose anchor is the next word, because nothing came before them in the paragraph. */
  let pending: string[] = [];
  let annot = null as string[] | null;
  const styles = new Map<number, string>();
  let state: CharState = {
    bold: false, italic: false, underline: false, strike: false, sup: false, inserted: false, deleted: false, skip: false, uc: 1, into: 'page', link: null, note: null, footnoteAfter: null,
  };
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
    if (state.note) m.push({ type: 'note', attrs: { id: state.note } });
    if (state.link) m.push({ type: 'link', attrs: { href: state.link } });
    if (state.bold) m.push({ type: 'bold' });
    if (state.italic) m.push({ type: 'italic' });
    if (state.underline && !state.link) m.push({ type: 'underline' });
    if (state.strike) m.push({ type: 'strike' });
    if (state.sup) m.push({ type: 'superscript' });
    if (state.inserted) m.push({ type: 'insertion' });
    else if (state.deleted) m.push({ type: 'deletion' });
    return m;
  };

  const sameMarks = (a: MarkJSON[] | undefined, b: MarkJSON[]) => JSON.stringify(a ?? []) === JSON.stringify(b);
  const pushText = (t: string, m: MarkJSON[]) => {
    const prev = line[line.length - 1];
    if (prev?.type === 'text' && sameMarks(prev.marks, m)) prev.text += t;
    else line.push(text(t, m));
  };
  const withNotes = (m: MarkJSON[], ids: string[]): MarkJSON[] => [...ids.map((id): MarkJSON => ({ type: 'note', attrs: { id } })), ...m];

  /** Anchors a note on the last word in `nodes`, splitting its text node. False if there is no word there. */
  const anchorOnLastWord = (nodes: NodeJSON[], id: string): boolean => {
    for (let k = nodes.length - 1; k >= 0; k--) {
      const node = nodes[k]!;
      if (node.type !== 'text' || !/\S/.test(node.text ?? '')) continue;
      const found = /^([\s\S]*?)(\S+)(\s*)$/.exec(node.text!)!;
      const marks = node.marks ?? [];
      const parts = [
        found[1] ? text(found[1], marks) : null,
        text(found[2]!, withNotes(marks, [id])),
        found[3] ? text(found[3], marks) : null,
      ].filter((p): p is NodeJSON => p !== null);
      nodes.splice(k, 1, ...parts);
      return true;
    }
    return false;
  };

  /** A note with no anchor of its own, such as an inline annotation, goes on the word before it, or failing that the word after. */
  const anchorNote = (said: string) => {
    if (!said) return;
    const id = newId();
    notes[id] = said;
    if (!anchorOnLastWord(line, id)) pending.push(id);
  };

  const put = (t: string) => {
    if (dropping > 0) {
      const n = Math.min(dropping, t.length);
      dropping -= n;
      t = t.slice(n);
      if (!t) return;
    }
    if (state.skip) return;
    if (state.into === 'annot') annot?.push(t);
    else if (state.into === 'footnote') footnote?.push(t);
    else if (state.into === 'fldinst') fldinst?.push(t);
    else if (state.into === 'style') styleName?.words.push(t);
    else {
      const m = marks();
      const word = pending.length > 0 ? /^(\s*)(\S+)([\s\S]*)$/.exec(t) : null;
      if (!word) return pushText(t, m);
      if (word[1]) pushText(word[1], m);
      pushText(word[2]!, withNotes(m, pending));
      pending = [];
      if (word[3]) pushText(word[3], m);
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
    // An annotation: Scrivener's inline one (made into \cbannot above), or an RTF comment as Word and Scrivener 2 write them.
    if (isFirst && (name === 'cbannot' || name === 'annotation') && state.into === 'page') {
      annot = [];
      state.into = 'annot';
      return;
    }
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
        if (state.into === 'annot') annot?.push('\n');
        else if (state.into === 'footnote') footnote?.push(' ');
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
      case 'super':
        state.sup = arg !== 0;
        return;
      case 'sub':
      case 'nosupersub':
        state.sup = false;
        return;
      case 'ulnone':
        state.underline = false;
        return;
      case 'plain':
        state.bold = state.italic = state.underline = state.strike = state.sup = false;
        return;
      case 'revised':
        state.inserted = arg !== 0;
        return;
      case 'deleted':
        state.deleted = arg !== 0;
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
      if (leaving.into === 'annot' && state.into !== 'annot' && annot) {
        const said = annot.join('').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
        annot = null;
        if (state.into === 'page' && !state.skip) anchorNote(said);
      }
      // A linked footnote's number goes where the words it is anchored on end.
      if (leaving.footnoteAfter && leaving.footnoteAfter !== state.footnoteAfter && state.into === 'page' && !state.skip) {
        line.push({ type: 'footnote', attrs: { text: leaving.footnoteAfter } });
      }
      if (leaving.into === 'fldinst' && state.into !== 'fldinst' && fldinst) {
        const address = /HYPERLINK\s+"([^"]+)"/i.exec(fldinst.join(''))?.[1] ?? null;
        fldinst = null;
        // The link covers the field's result, which follows in the enclosing \field group.
        if (address && /^(https?:|mailto:)/i.test(address)) state.link = address;
        // A Scrivener comment or linked footnote: its words are in content.comments, under the id after scrivcmt://.
        const comment = address && /^scriv(?:cmt|fnt):\/\/(.+)$/i.exec(address)?.[1];
        const found = comment ? linked.get(comment.trim()) : undefined;
        if (found?.footnote && found.text) state.footnoteAfter = found.text.replace(/\s+/g, ' ');
        else if (found?.text) {
          const id = newId();
          notes[id] = found.text;
          state.note = id;
        }
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
  // Notes left with no word after them go on the last word of the page; on a page with no words, they become its words.
  for (const id of pending) {
    const last = [...content].reverse().find((n) => n.type === 'paragraph');
    if (!last?.content || !anchorOnLastWord(last.content, id)) {
      content.push({ type: 'paragraph', attrs: { style: BODY_STYLE }, content: [{ type: 'text', text: notes[id]! }] });
      delete notes[id];
    }
  }
  return { content, notes };
}

/** Reads an RTF file's bytes; RTF is 7-bit, with other characters escaped, so Latin-1 reads it safely. */
export function decodeRtf(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}
