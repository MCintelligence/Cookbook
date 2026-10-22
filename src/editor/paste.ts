import { HEADING_STYLES, QUOTE_STYLE } from './markdown';

/**
 * Pasted HTML from Word, Google Docs, Scrivener and web pages, tidied so the
 * editor's own rules can read it:
 *
 * - Word's lists, which are paragraphs with a typed bullet or number, become real lists.
 * - Word's Title and Quote paragraphs, and any <blockquote>, get those styles.
 * - Merged table cells are split back out, since a Markdown table can't merge cells.
 *
 * Bold, italic and so on are read by the marks themselves (see formatting.ts).
 * A paste from Cookbook itself is left alone.
 */
export function cleanPastedHtml(html: string): string {
  if (html.includes('data-pm-slice')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  wordLists(doc);
  for (const p of Array.from(body.querySelectorAll<HTMLElement>('p.MsoTitle'))) p.setAttribute('data-style', HEADING_STYLES[0]);
  for (const p of Array.from(body.querySelectorAll<HTMLElement>('p.MsoSubtitle'))) p.setAttribute('data-style', HEADING_STYLES[1]);
  for (const p of Array.from(body.querySelectorAll<HTMLElement>('p.MsoQuote, p.MsoIntenseQuote'))) p.setAttribute('data-style', QUOTE_STYLE);
  for (const quote of Array.from(body.querySelectorAll('blockquote'))) quoteParagraphs(doc, quote);
  for (const table of Array.from(body.querySelectorAll('table'))) unmergeCells(doc, table);
  return body.innerHTML;
}

/** Word marks a list paragraph with mso-list in its style, and types the bullet or number in a span it hides elsewhere. */
function wordLists(doc: Document): void {
  const items = Array.from(doc.body.querySelectorAll<HTMLElement>('p[style*="mso-list"]')).filter((p) => !/mso-list:\s*(none|ignore)/i.test(p.getAttribute('style') ?? ''));
  const seen = new Set<Element>();
  for (const first of items) {
    if (seen.has(first)) continue;
    // A run of list paragraphs next to each other, with only spaces between.
    const run: HTMLElement[] = [];
    for (let el: Element | null = first; el && items.includes(el as HTMLElement); el = el.nextElementSibling) {
      run.push(el as HTMLElement);
      seen.add(el);
    }
    const root = buildList(doc, run);
    first.before(root);
    run.forEach((p) => p.remove());
  }
}

function buildList(doc: Document, run: HTMLElement[]): HTMLElement {
  const stack: { level: number; list: HTMLElement }[] = [];
  let root: HTMLElement | null = null;
  for (const p of run) {
    const level = Number(/level(\d+)/i.exec(p.getAttribute('style') ?? '')?.[1] ?? 1);
    const markerEl = p.querySelector('span[style*="mso-list"]');
    const marker = (markerEl?.textContent ?? '').replace(/ /g, ' ').trim();
    markerEl?.remove();
    const ordered = /^\(?([0-9]{1,3}|[a-z]{1,3}|[ivxlc]{1,6})[.)]$/i.test(marker);
    while (stack.length > 0 && stack[stack.length - 1]!.level > level) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.level < level) {
      const list = doc.createElement(ordered ? 'ol' : 'ul');
      if (top) (top.list.lastElementChild ?? top.list).append(list);
      else root = list;
      top = { level, list };
      stack.push(top);
    }
    const li = doc.createElement('li');
    const para = doc.createElement('p');
    para.innerHTML = p.innerHTML;
    li.append(para);
    top.list.append(li);
  }
  return root!;
}

function quoteParagraphs(doc: Document, quote: Element): void {
  // Loose text in the quote becomes a paragraph of its own.
  const loose = Array.from(quote.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE ? n.textContent!.trim() !== '' : !/^(P|DIV|UL|OL|BLOCKQUOTE|TABLE|PRE|H[1-6])$/.test((n as Element).tagName));
  if (loose.length > 0) {
    const p = doc.createElement('p');
    loose[0]!.before(p);
    loose.forEach((n) => p.append(n));
  }
  for (const p of Array.from(quote.querySelectorAll<HTMLElement>('p, div'))) if (!p.querySelector('p, div')) p.setAttribute('data-style', QUOTE_STYLE);
}

/** Every merged cell becomes one cell plus empty ones, so each row has a cell for every column. */
function unmergeCells(doc: Document, table: HTMLTableElement): void {
  const rows = Array.from(table.rows);
  const grid: (HTMLTableCellElement | null)[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of Array.from(row.cells)) {
      while (grid[r]![c] !== undefined) c++;
      const across = Math.max(1, Math.min(50, cell.colSpan || 1));
      const down = Math.max(1, Math.min(rows.length - r, cell.rowSpan || 1));
      for (let dr = 0; dr < down; dr++) for (let dc = 0; dc < across; dc++) grid[r + dr]![c + dc] = dr === 0 && dc === 0 ? cell : null;
      c += across;
    }
  });
  const width = Math.max(0, ...grid.map((g) => g.length));
  rows.forEach((row, r) => {
    const cells: HTMLTableCellElement[] = [];
    for (let c = 0; c < width; c++) {
      const cell = grid[r]![c];
      if (cell) {
        cell.removeAttribute('colspan');
        cell.removeAttribute('rowspan');
        cells.push(cell);
      } else {
        // An empty cell where a merged one used to reach; a header in a header row.
        cells.push(doc.createElement(row.querySelector('th') ? 'th' : 'td'));
      }
    }
    row.replaceChildren(...cells);
  });
}
