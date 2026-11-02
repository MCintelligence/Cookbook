import { acceptedJSON } from '../editor/trackChanges';
import { type StorageAdapter } from '../storage/adapter';
import { type TreeNode, readDocument } from '../storage/book';
import { includedInExport } from '../storage/document';
import { parseMarkdown, plainText } from '../editor/markdown';
import { countWords } from '../storage/index';
import { HtmlWriter, escapeHtml } from '../export/html';
import { withoutNotes } from '../export/manuscript';

/** A top-level Shelf entry, which the book sets as one chapter. */
export interface Chapter {
  path: string;
  title: string;
  /** The chapter's text as HTML: its Items in order, with a scene break between them. */
  html: string;
  words: number;
}

const BREAK = '<p class="scene-break"></p>';

/** Every top-level Group or Item on the Shelf, as chapters, leaving out Items marked not to export. */
export async function readChapters(fs: StorageAdapter, shelf: TreeNode[]): Promise<Chapter[]> {
  const out: Chapter[] = [];
  for (const node of shelf) {
    const w = new HtmlWriter(true);
    const blocks: string[] = [];
    let words = 0;
    let title = node.name;
    const walk = async (n: TreeNode) => {
      if (n.kind === 'folder') {
        for (const child of n.children ?? []) await walk(child);
        return;
      }
      if (!n.path.endsWith('.md')) return;
      const doc = await readDocument(fs, n.path);
      if (!includedInExport(doc.fields)) return;
      if (n === node) title = doc.title;
      if (blocks.length > 0) blocks.push(BREAK);
      blocks.push(w.body(withoutNotes(acceptedJSON(parseMarkdown(doc.body)))).replace(/<p class="scene-break">\* \* \*<\/p>/g, BREAK));
      words += countWords(plainText(doc.body));
    };
    await walk(node);
    if (blocks.length === 0) continue;
    out.push({ path: node.path, title, html: blocks.join('\n') + w.takeNotes(), words });
  }
  return out;
}

/** Plain text typed into a front or back matter box, as paragraphs. */
export function textHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}
