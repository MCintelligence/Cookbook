import { type NodeJSON, BODY_STYLE } from '../editor/markdown';
import { PX_PER_PT, type StyleSheet, fontStack, stylesToCss } from '../styles/styles';
import { paragraphFormatOf, textFormatOf } from '../editor/format';
import { DEFAULT_PAGE, MARGINS, PAGE_SIZES, type PageSettings } from '../storage/page';
import { type Manuscript, charStyles } from './manuscript';
import { dropCapClass, withDropCaps } from '../editor/dropCaps';

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
        // Alignment and spacing set by hand go over the style's.
        const { align, lineSpacing } = paragraphFormatOf(n.attrs);
        const css = [align && `text-align: ${align}`, lineSpacing && `line-height: ${lineSpacing}`].filter(Boolean).join('; ');
        return `<p${attr}${css ? ` style="${css}"` : ''}>${this.inline(n.content ?? [])}</p>`;
      }
      case 'sceneBreak':
        return '<p class="scene-break">* * *</p>';
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return this.list(n);
      case 'codeBlock':
        return `<pre><code>${escapeHtml((n.content ?? []).map((t) => t.text ?? '').join(''))}</code></pre>`;
      case 'table':
        return `<table>${(n.content ?? [])
          .map(
            (row) =>
              `<tr>${(row.content ?? [])
                .map((cell) => {
                  const tag = cell.type === 'tableHeader' ? 'th' : 'td';
                  return `<${tag}>${(cell.content ?? []).map((p) => this.inline(p.content ?? [])).join(' ')}</${tag}>`;
                })
                .join('')}</tr>`,
          )
          .join('')}</table>`;
      default:
        return '';
    }
  }

  private list(n: NodeJSON): string {
    const items = (n.content ?? [])
      .map((item) => {
        const [first, ...rest] = item.content ?? [];
        const box = item.type === 'taskItem' ? `${item.attrs?.checked ? '☑' : '☐'} ` : '';
        return `<li>${box}${this.inline(first?.content ?? [])}${rest.map((l) => this.list(l)).join('')}</li>`;
      })
      .join('');
    if (n.type === 'orderedList') {
      const start = Number(n.attrs?.start ?? 1);
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>${items}</ol>`;
    }
    return `<ul${n.type === 'taskList' ? ' class="tasks"' : ''}>${items}</ul>`;
  }

  private inline(nodes: NodeJSON[]): string {
    return withDropCaps(nodes)
      .map((n) => {
        if (n.type === 'footnote') {
          this.count++;
          this.notes.push(String(n.attrs?.text ?? ''));
          return `<sup class="fn"><a id="fr${this.count}" href="#fn${this.count}">${this.count}</a></sup>`;
        }
        if (n.type === 'hardBreak') return this.xhtml ? '<br />' : '<br>';
        // Pictures aren't carried into exports yet; their description stands in.
        if (n.type === 'image') return n.attrs?.alt ? `<em class="picture">[${escapeHtml(String(n.attrs.alt))}]</em>` : '';
        if (n.type !== 'text') return '';
        let html = escapeHtml(n.text ?? '');
        if (n.dropCap) html = `<span class="${dropCapClass(n.dropCap === 'start')}">${html}</span>`;
        const styles = charStyles(n);
        // Innermost first, the same nesting the editor uses.
        for (const m of [...(n.marks ?? [])].reverse()) {
          if (m.type === 'textStyle') {
            const { font, size, color } = textFormatOf(m.attrs);
            const css = [font && `font-family: ${fontStack(font)}`, size && `font-size: ${size * PX_PER_PT}px`, color && `color: ${color}`].filter(Boolean).join('; ');
            if (css) html = `<span style="${escapeHtml(css)}">${html}</span>`;
          } else if (m.type === 'link') html = `<a href="${escapeHtml(m.attrs.href)}">${html}</a>`;
          else if (m.type in PLAIN_TAGS) html = `<${PLAIN_TAGS[m.type]}>${html}</${PLAIN_TAGS[m.type]}>`;
        }
        return styles.length > 0 ? `<span data-char="${escapeHtml(styles.join(' '))}">${html}</span>` : html;
      })
      .join('');
  }
}

const PLAIN_TAGS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };

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
${scope} table { border-collapse: collapse; margin: 1em auto; }
${scope} th, ${scope} td { border: 1px solid #999; padding: 0.25em 0.6em; text-indent: 0; text-align: left; }
${scope} pre { font-family: 'Courier Prime', monospace; font-size: 0.85em; white-space: pre-wrap; margin: 1em 0; }
${scope} code { font-family: 'Courier Prime', monospace; font-size: 0.92em; }
${scope} .cb-dropcap { font-size: 1.6em; line-height: 0; }
${scope} .cb-dropcap-start { float: left; font-size: 3.2em; line-height: 0.8; padding: 0.06em 0.08em 0 0; }
${scope} a { color: inherit; }
${scope} sup.fn a { text-decoration: none; color: inherit; }`;
}

/** The whole book as one HTML page, used for printing and Save as PDF. */
export function bookHtml(m: Manuscript, sheet: StyleSheet, page: PageSettings = DEFAULT_PAGE): string {
  const size = PAGE_SIZES[page.size];
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
@page { size: ${size.width}in ${size.height}in; margin: ${MARGINS[page.margins].inches}in; }
html, body { margin: 0; background: #fff; }
.book .new-page { break-before: page; }
.book p { orphans: 2; widows: 2; }
${bookCss(sheet, '.book')}
</style></head>
<body><main class="book">
${out.filter(Boolean).join('\n')}
</main></body></html>`;
}
