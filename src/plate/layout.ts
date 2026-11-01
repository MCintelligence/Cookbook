import { escapeHtml } from '../export/html';
import { type Chapter, textHtml } from './book';
import { type PlateSettings, TRIMS, defaultCopyright, numberWords } from './settings';

/** CSS pixels to the inch, the unit pages are laid out in, for the screen and for print alike. */
export const PX = 96;

/** Where the text sits on a page, in CSS pixels. The inside (gutter) margin is wider so words don't sink into the spine. */
export function geometry(s: PlateSettings) {
  const t = TRIMS[s.trim];
  const width = t.width * PX;
  const height = t.height * PX;
  const top = 0.75 * PX;
  const bottom = 0.8 * PX;
  const inside = 0.8 * PX;
  const outside = 0.6 * PX;
  return { width, height, top, bottom, inside, outside, textWidth: width - inside - outside, textHeight: height - top - bottom };
}
export type Geometry = ReturnType<typeof geometry>;

export type PageKind = 'title' | 'copyright' | 'dedication' | 'contents' | 'body' | 'matter' | 'blank';

export interface Page {
  kind: PageKind;
  /** The text block's HTML. */
  html: string;
  /** The first page of a chapter: no running header over its opener. */
  opener?: boolean;
  /** The chapter (its Shelf path) this page belongs to. */
  chapter?: string;
  /** The printed page number, for pages that show one. */
  folio?: number;
}

export interface PlateBook {
  title: string;
  chapters: Chapter[];
}

/** The book's type, shared by the preview, the printed PDF and (in part) the e-book. */
export function plateCss(s: PlateSettings, scope = '.plate-text'): string {
  const glyph = s.sceneBreak ? JSON.stringify(s.sceneBreak) : '"\\00a0"';
  const cap = (s.lineHeight * 2 + 0.95).toFixed(2);
  return `
${scope} { font-family: '${s.font}', Georgia, serif; font-size: ${s.size}pt; line-height: ${s.lineHeight}; color: #111; text-align: justify; hyphens: auto; -webkit-hyphens: auto; font-kerning: normal; font-variant-ligatures: common-ligatures; overflow-wrap: break-word; }
${scope} p { margin: 0; text-indent: 1.5em; }
${scope} p.first, ${scope} .scene-break + p, ${scope} p.cont, ${scope} .matter p:first-child { text-indent: 0; }
${scope} p.split-end { text-align-last: justify; }
${scope} p[data-style='chapter-title'], ${scope} p[data-style='heading-2'], ${scope} p[data-style='heading-3'] { text-indent: 0; text-align: center; font-variant: small-caps; letter-spacing: 0.06em; margin: ${s.lineHeight * 0.5}em 0; }
${scope} p[data-style='chapter-title'] { font-size: 1.15em; }
${scope} p[data-style='chapter-title'] + p, ${scope} p[data-style='heading-2'] + p, ${scope} p[data-style='heading-3'] + p { text-indent: 0; }
${scope} p[data-style='quote'], ${scope} p[data-style='letter'] { font-style: italic; text-indent: 0; margin: 0.4em 1.5em; }
${scope} p[data-style='epigraph'] { font-style: italic; text-indent: 0; text-align: right; margin-bottom: 1em; }
${scope} .scene-break { text-align: center; text-indent: 0; margin: ${s.lineHeight * 0.5}em 0; letter-spacing: 0.3em; }
${scope} .scene-break::before { content: ${glyph}; }
${s.dropCap ? `${scope} p.first::first-letter { float: left; font-size: ${cap}em; line-height: 0.82; padding: 0.06em 0.07em 0 0; margin-top: 0.02em; }
${scope} p.first::first-line { font-variant: small-caps; letter-spacing: 0.04em; }` : ''}
${scope} .opener { text-align: center; text-indent: 0; margin-bottom: ${s.lineHeight * 2}em; }
${scope} .opener .num { font-size: 0.85em; letter-spacing: 0.3em; text-transform: uppercase; color: #555; }
${scope} .opener .numeral { font-size: 3.4em; line-height: 1; font-weight: 400; }
${scope} .opener .orn { font-size: 1em; letter-spacing: 0.25em; color: #555; }
${scope} .opener .rule { width: 2.4em; height: 1px; background: #999; margin: 0.9em auto; }
${scope} .opener .title { font-size: 1.9em; line-height: 1.2; font-style: italic; margin-top: 0.4em; }
${scope} .opener.numeral-style { text-align: left; }
${scope} .opener.numeral-style .title { font-style: normal; font-weight: 700; font-size: 1.35em; }
${scope} .footnotes { font-size: 0.82em; text-align: left; }
${scope} .footnotes ol { padding-left: 1.2em; margin: 0.4em 0 0; }
${scope} .footnotes hr { width: 30%; margin: 0.8em 0 0.3em; border: none; border-top: 1px solid #999; }
${scope} sup.fn a { color: inherit; text-decoration: none; }
${scope} ul, ${scope} ol { margin: 0.4em 0; padding-left: 1.5em; text-align: left; }
${scope} table { border-collapse: collapse; margin: 0.6em auto; font-size: 0.9em; }
${scope} th, ${scope} td { border: 1px solid #999; padding: 0.15em 0.4em; }
${scope} pre { font-family: 'Courier Prime', monospace; font-size: 0.8em; white-space: pre-wrap; text-align: left; }
${scope} a { color: inherit; text-decoration: none; }
${scope} .matter-title { text-align: center; font-size: 1.3em; font-style: italic; margin: 0 0 1.4em; }
${scope} .tp { text-align: center; padding-top: 22%; }
${scope} .tp-title { font-size: 2.3em; line-height: 1.15; }
${scope} .tp-sub { font-size: 1.1em; font-style: italic; margin-top: 0.8em; color: #333; }
${scope} .tp-author { margin-top: 3.2em; font-size: 1em; letter-spacing: 0.22em; text-transform: uppercase; }
${scope} .copyright { font-size: 0.8em; text-align: left; line-height: 1.5; }
${scope} .copyright p { text-indent: 0; margin-bottom: 0.8em; }
${scope} .dedication { text-align: center; font-style: italic; padding-top: 30%; }
${scope} .dedication p { text-indent: 0; margin-bottom: 0.6em; }
${scope} .toc-line { display: flex; gap: 0.6em; text-indent: 0; text-align: left; margin-bottom: 0.35em; }
${scope} .toc-line span:first-child { flex: 1; }
`;
}

/** The opener set at the top of a chapter's first page. */
export function openerHtml(s: PlateSettings, n: number, title: string, xhtml = false): string {
  const t = escapeHtml(title);
  const rule = xhtml ? '<div class="rule"></div>' : '<div class="rule"></div>';
  switch (s.opener) {
    case 'words':
      return `<div class="opener"><div class="num">Chapter ${numberWords(n)}</div>${rule}<div class="title">${t}</div></div>`;
    case 'numeral':
      return `<div class="opener numeral-style"><div class="numeral">${n}</div><div class="title">${t}</div></div>`;
    case 'title':
      return `<div class="opener"><div class="title">${t}</div></div>`;
    case 'ornament':
      return `<div class="opener"><div class="orn">✿ ${n} ✿</div><div class="title">${t}</div></div>`;
  }
}

/** Marks the paragraph a chapter starts with, for its drop cap and the missing indent. */
export function markFirst(html: string): string {
  // A body paragraph, not a heading or quote the scene begins with.
  return html.replace(/<p(?![^>]*(?:class|data-style)=)(?=[\s>])/, '<p class="first"');
}

/**
 * Splits text into pages by setting it, block by block, into a box the size of
 * the page's text area inside `host`, and cutting a paragraph at the last line
 * that fits. The host must be in the document (it can be off screen) so the
 * browser lays the text out with the real fonts.
 */
export class Paginator {
  private box: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly g: Geometry,
  ) {
    this.box = document.createElement('div');
    this.box.className = 'plate-text';
    this.box.style.cssText = `width: ${g.textWidth}px; display: flow-root; position: absolute; left: 0; top: 0;`;
    host.appendChild(this.box);
  }

  dispose() {
    this.box.remove();
  }

  /** The text, as pages of HTML. A first page can be pushed down, as chapter openers are. */
  flow(html: string, firstTop = 0): string[] {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const queue: Node[] = Array.from(tpl.content.childNodes).filter((n) => n.nodeType === 1);
    const pages: string[] = [];
    const limit = this.g.textHeight;
    let top = firstTop;
    this.box.innerHTML = '';
    this.box.style.paddingTop = `${top}px`;
    const finish = () => {
      // A scene break never ends a page; it moves over to start the next one.
      const carry: Node[] = [];
      while (this.box.lastElementChild?.classList.contains('scene-break') && this.box.childElementCount > 1) carry.unshift(this.box.removeChild(this.box.lastElementChild));
      pages.push(this.box.innerHTML);
      this.box.innerHTML = '';
      top = 0;
      this.box.style.paddingTop = '0px';
      return carry;
    };
    while (queue.length > 0) {
      const el = queue.shift() as HTMLElement;
      this.box.appendChild(el);
      if (this.box.offsetHeight <= limit + 0.5) continue;
      const alone = this.box.childElementCount === 1 && top === 0;
      const rest = el.tagName === 'P' && !el.classList.contains('scene-break') ? this.split(el, this.box.getBoundingClientRect().top + limit) : null;
      if (rest) {
        const carry = finish();
        queue.unshift(...carry, rest);
      } else if (alone) {
        // Too tall for any page and can't be cut: it gets a page to itself.
        finish();
      } else {
        this.box.removeChild(el);
        const carry = finish();
        queue.unshift(...carry, el);
      }
    }
    if (this.box.childElementCount > 0 || pages.length === 0) pages.push(this.box.innerHTML);
    this.box.innerHTML = '';
    return pages;
  }

  /** Cuts a paragraph after its last line above `bottom`, returning the rest as a new paragraph, or null if no line fits. */
  private split(p: HTMLElement, bottom: number): HTMLElement | null {
    const texts: Text[] = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    const total = texts.reduce((sum, t) => sum + t.length, 0);
    if (total === 0) return null;
    const at = (k: number): [Text, number] => {
      for (const t of texts) {
        if (k <= t.length) return [t, k];
        k -= t.length;
      }
      const last = texts[texts.length - 1]!;
      return [last, last.length];
    };
    const range = document.createRange();
    const fits = (k: number) => {
      const [node, offset] = at(k);
      range.setStart(p, 0);
      range.setEnd(node, offset);
      let max = -Infinity;
      for (const r of Array.from(range.getClientRects())) if (r.width > 0) max = Math.max(max, r.bottom);
      return max <= bottom + 0.5;
    };
    let lo = 0;
    let hi = total;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    // Cut at a space, so no word is broken across pages.
    let k = lo;
    const charAt = (i: number) => {
      const [node, offset] = at(i);
      return node.data[offset] ?? '';
    };
    while (k > 0 && charAt(k) !== '' && !/\s/.test(charAt(k)) && !/\s/.test(charAt(k - 1))) k--;
    if (k <= 0 || k >= total) return null;
    const [node, offset] = at(k);
    range.setStart(node, offset);
    range.setEndAfter(p.lastChild!);
    const tail = range.extractContents();
    const rest = p.cloneNode(false) as HTMLElement;
    rest.classList.remove('first');
    rest.classList.add('cont');
    rest.appendChild(tail);
    p.classList.add('split-end');
    // The first text left over shouldn't start with the space it was cut at.
    const lead = document.createTreeWalker(rest, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
    if (lead) lead.data = lead.data.replace(/^\s+/, '');
    return rest;
  }
}

/** Whole pages for the printed book, in order, from the first (a right-hand page) to the last. */
export function paginate(host: HTMLElement, s: PlateSettings, book: PlateBook): Page[] {
  const g = geometry(s);
  const pg = new Paginator(host, g);
  try {
    const chapters = book.chapters;
    const body: Page[] = [];
    const starts = new Map<string, number>();
    const openerTop = Math.round(g.textHeight * 0.2);
    chapters.forEach((ch, i) => {
      if (s.rectoStarts && body.length % 2 === 1) body.push({ kind: 'blank', html: '' });
      starts.set(ch.path, body.length + 1);
      const pages = pg.flow(openerHtml(s, i + 1, ch.title) + markFirst(ch.html), openerTop);
      pages.forEach((html, j) => body.push({ kind: 'body', html, chapter: ch.path, ...(j === 0 && { opener: true }) }));
    });
    for (const m of s.back) {
      if (!m.on) continue;
      const text = m.id === 'about' ? s.about : s.acknowledgements;
      const title = m.id === 'about' ? 'About the Author' : 'Acknowledgements';
      for (const html of pg.flow(`<div class="matter-title">${escapeHtml(title)}</div><div class="matter">${textHtml(text) || '<p></p>'}</div>`, openerTop)) {
        body.push({ kind: 'matter', html });
      }
    }
    body.forEach((p, i) => {
      if (p.kind !== 'blank') p.folio = i + 1;
    });

    const front: Page[] = [];
    const toRecto = () => {
      if (front.length % 2 === 1) front.push({ kind: 'blank', html: '' });
    };
    for (const m of s.front) {
      if (!m.on) continue;
      if (m.id === 'title') {
        toRecto();
        front.push({
          kind: 'title',
          html: `<div class="tp"><div class="tp-title">${escapeHtml(book.title)}</div>${s.subtitle.trim() ? `<div class="tp-sub">${escapeHtml(s.subtitle)}</div>` : ''}${s.author.trim() ? `<div class="tp-author">${escapeHtml(s.author)}</div>` : ''}</div>`,
        });
      } else if (m.id === 'copyright') {
        // The copyright page backs the title page.
        if (front.length % 2 === 0) front.push({ kind: 'blank', html: '' });
        front.push({ kind: 'copyright', html: `<div class="copyright">${textHtml(s.copyright || defaultCopyright(s.author))}</div>` });
      } else if (m.id === 'dedication') {
        toRecto();
        front.push({ kind: 'dedication', html: `<div class="dedication">${textHtml(s.dedication) || '<p>For …</p>'}</div>` });
      } else {
        toRecto();
        const lines = chapters.map((ch) => `<div class="toc-line"><span>${escapeHtml(ch.title)}</span>${s.pageNumbers ? `<span>${starts.get(ch.path)}</span>` : ''}</div>`).join('');
        for (const html of pg.flow(`<div class="matter-title">Contents</div>${lines}`, openerTop)) front.push({ kind: 'contents', html });
      }
    }
    // The first chapter opens on a right-hand page.
    toRecto();
    return [...front, ...body];
  } finally {
    pg.dispose();
  }
}

/** One page, framed at its trim size, with its running header and page number. */
export function pageHtml(p: Page, index: number, s: PlateSettings, title: string): string {
  const g = geometry(s);
  const recto = index % 2 === 0;
  const left = recto ? g.inside : g.outside;
  const showHead = s.runningHeaders && (p.kind === 'body' || p.kind === 'matter') && !p.opener;
  const head = recto ? title : s.author.trim() || title;
  const cls = `pp ${recto ? 'recto' : 'verso'} pp-${p.kind}`;
  const textStyle = `left:${left}px;top:${g.top}px;width:${g.textWidth}px;height:${g.textHeight}px`;
  return `<div class="${cls}" style="width:${g.width}px;height:${g.height}px">${
    showHead ? `<div class="pp-head" style="left:${left}px;width:${g.textWidth}px;top:${g.top * 0.48}px">${escapeHtml(head)}</div>` : ''
  }<div class="pp-text plate-text" style="${textStyle}">${p.html}</div>${
    s.pageNumbers && p.folio ? `<div class="pp-folio" style="left:${left}px;width:${g.textWidth}px;bottom:${g.bottom * 0.42}px">${p.folio}</div>` : ''
  }</div>`;
}

/** Frame CSS for pages, on screen and in print. */
export function pageCss(s: PlateSettings): string {
  return `
.pp { position: relative; background: #fffefa; overflow: hidden; box-sizing: border-box; }
.pp-text { position: absolute; overflow: hidden; }
.pp-head { position: absolute; text-align: center; font-family: '${s.font}', Georgia, serif; font-size: ${Math.max(7, s.size - 2.5)}pt; letter-spacing: 0.16em; text-transform: uppercase; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-folio { position: absolute; text-align: center; font-family: '${s.font}', Georgia, serif; font-size: ${Math.max(7, s.size - 1.5)}pt; color: #333; }
.pp .footnotes a[href^='#fr'] { display: none; }
.pp-copyright .pp-text { display: flex; flex-direction: column; justify-content: flex-end; }
`;
}

/** The whole printed book as one HTML page, at its trim size, for the print dialog's Save as PDF. */
export function printBookHtml(pages: Page[], s: PlateSettings, title: string): string {
  const t = TRIMS[s.trim];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: ${t.width}in ${t.height}in; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.pp { break-after: page; background: #fff; }
.pp:last-child { break-after: auto; }
${pageCss(s)}
${plateCss(s)}
</style></head>
<body>
${pages.map((p, i) => pageHtml(p, i, s, title)).join('\n')}
</body></html>`;
}
