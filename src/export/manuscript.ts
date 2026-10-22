import { type StorageAdapter } from '../storage/adapter';
import { type TreeNode, readDocument } from '../storage/book';
import { type NodeJSON, parseMarkdown } from '../editor/markdown';

/**
 * A book (or one folder or scene of it) laid out for export, in reading order:
 * each folder becomes a heading, each scene its paragraphs, and scenes that
 * follow each other in the same folder are separated by a scene break.
 */
export type Part =
  | { kind: 'heading'; text: string; depth: number }
  | { kind: 'scene'; title: string; body: NodeJSON }
  | { kind: 'break' };

export interface Manuscript {
  title: string;
  parts: Part[];
}

export async function collect(fs: StorageAdapter, title: string, nodes: TreeNode[]): Promise<Manuscript> {
  const parts: Part[] = [];
  const walk = async (list: TreeNode[], depth: number) => {
    let lastWasScene = false;
    for (const node of list) {
      if (node.kind === 'folder') {
        parts.push({ kind: 'heading', text: node.name, depth });
        await walk(node.children ?? [], depth + 1);
        lastWasScene = false;
      } else if (node.path.endsWith('.md')) {
        const doc = await readDocument(fs, node.path);
        if (lastWasScene) parts.push({ kind: 'break' });
        parts.push({ kind: 'scene', title: doc.title, body: withoutNotes(parseMarkdown(doc.body)) });
        lastWasScene = true;
      }
    }
  };
  await walk(nodes, 1);
  return { title, parts };
}

/** Footnotes in a scene, in order, so each format can number them. */
export function footnotesOf(body: NodeJSON): string[] {
  const out: string[] = [];
  const visit = (n: NodeJSON) => {
    if (n.type === 'footnote') out.push(String(n.attrs?.text ?? ''));
    n.content?.forEach(visit);
  };
  visit(body);
  return out;
}

/** Character styles on a text node, leaving out notes to self, which never leave the app. */
export function charStyles(node: NodeJSON): string[] {
  return (node.marks ?? []).flatMap((m) => (m.type === 'charStyle' ? [m.attrs.style] : []));
}

/** The scene with its notes to self taken off; the words they were attached to stay. */
export function withoutNotes(node: NodeJSON): NodeJSON {
  const marks = node.marks?.filter((m) => m.type !== 'note');
  const out: NodeJSON = { ...node, ...(node.content && { content: node.content.map(withoutNotes) }) };
  if (node.marks) {
    if (marks && marks.length > 0) out.marks = marks;
    else delete out.marks;
  }
  return out;
}
