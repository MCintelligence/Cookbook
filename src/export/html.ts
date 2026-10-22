import { type NodeJSON, BODY_STYLE } from '../editor/markdown';
import { type StyleSheet, stylesToCss } from '../styles/styles';
import { type Manuscript, charStyles } from './manuscript';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders scene bodies as HTML with the same data-style and data-char
 * attributes the editor uses, so the book's own style sheet applies.
 * Footnotes are numbered through each chapter and listed at its end.
 */
export class HtmlWriter {
  private notes: string[] = [];
  private count = 0;

  constructor(private readonly xhtml = false) {}

  body(doc: NodeJSON): string {
    return (doc.content ?? []).map((n) => this.block(n)).join('\n');
  }

  /** The footnotes collected since the last call, as a list, and starts a new chapter. */
  takeNotes(): string {
    if (this.notes.length === 0) return '';
    const start = this.count - this.notes.length + 1;
    const items = this.notes.map((text, i) => `<li id="fn${start + i}">${escapeHtml(text)} <a href="#fr${start + i}">↩</a></li>`).join('\n');
    this.notes = [];
    return `<section class="footnotes"><hr${this.xhtml ? ' /' : ''}>\n<ol start="${start}">\n${items}\n</ol></section>`;
  }

  private block(n: NodeJSON): string {
    switch (n.type) {
      case 'paragraph': {
        const style = String(n.attrs?.style ?? BODY_STYLE);
        const attr = style === BODY_STYLE ? '' : ` data-style="${escapeHtml(style)}"`;
        return `<p${attr}>${this.inline(n.content ?? [])}</p>`;
      }
      case 'sceneBreak':
        return '<p class="scene-break">* * *</p>';
      case 'bulletList':
        return `<ul>${(n.content ?? []).map((i) => `<li>${this.itemText(i)}</li>`).join('')}</ul>`;
      case 'taskList':
        return `<ul class="tasks">${(n.content ?? []).map((i) => `<li>${i.attrs?.checked ? '☑' : '☐'} ${this.itemText(i)}</li>`).join('')}</ul>`;
      default:
        return '';
    }
  }

  private itemText(item: NodeJSON): string {
    return (item.content ?? []).map((p) => this.inline(p.content ?? [])).join(' ');
  }

  private inline(nodes: NodeJSON[]): string {
    return nodes
      .map((n) => {
        if (n.type === 'footnote') {
          this.count++;
          this.notes.push(String(n.attrs?.text ?? ''));
          return `<sup class="fn"><a id="fr${this.count}" href="#fn${this.count}">${this.count}</a></sup>`;
        }
        if (n.type !== 'text') return '';
        const text = escapeHtml(n.text ?? '');
        const styles = charStyles(n);
        return styles.length > 0 ? `<span data-char="${escapeHtml(styles.join(' '))}">${text}</span>` : text;
      })
      .join('');
  }
}

/** Page-independent CSS for exported and printed books, on top of the book's styles. */
export function bookCss(sheet: StyleSheet, scope: string): string {
  return `${stylesToCss(sheet, scope, false)}
${scope} { color: #000; background: #fff; }
${scope} h1, ${scope} h2, ${scope} h3 { font-family: 'Literata', Georgia, serif; font-weight: 600; text-align: center; margin: 1.5em 0 1em; }
${scope} h1.book-title { font-size: 2em; margin-top: 30vh; }
${scope} .scene-break { text-align: center; text-indent: 0; margin: 1em 0; }
${scope} .footnotes { font-size: 0.85em; margin-top: 2em; }
${scope} .footnotes hr { width: 30%; margin-left: 0; }
${scope} ul.tasks { list-style: none; padding-left: 1em; }
${scope} sup.fn a { text-decoration: none; color: inherit; }`;
}

/** The whole book as one HTML page, used for printing and Save as PDF. */
export function bookHtml(m: Manuscript, sheet: StyleSheet, page: { width: string; height: string } = { width: '8.5in', height: '11in' }): string {
  const w = new HtmlWriter();
  const out: string[] = [`<h1 class="book-title">${escapeHtml(m.title)}</h1>`];
  let started = false;
  for (const part of m.parts) {
    if (part.kind === 'heading') {
      if (started) out.push(w.takeNotes());
      const level = Math.min(3, part.depth + 1);
      out.push(`<h${level} class="chapter${part.depth === 1 ? ' new-page' : ''}">${escapeHtml(part.text)}</h${level}>`);
    } else if (part.kind === 'break') out.push('<p class="scene-break">* * *</p>');
    else out.push(w.body(part.body));
    started = true;
  }
  out.push(w.takeNotes());
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title>
<style>
@page { size: ${page.width} ${page.height}; margin: 1in; }
html, body { margin: 0; background: #fff; }
.book .new-page { break-before: page; }
.book p { orphans: 2; widows: 2; }
${bookCss(sheet, '.book')}
</style></head>
<body><main class="book">
${out.filter(Boolean).join('\n')}
</main></body></html>`;
}
