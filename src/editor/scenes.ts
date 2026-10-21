import { type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { type NodeJSON, parseMarkdown, serializeMarkdown } from './markdown';

/**
 * Splitting a scene at a scene break, and merging the next scene into this
 * one. The editor side lives here; moving files is the app's job.
 */

/**
 * Cuts everything after the scene break at `pos` out of the editor, break
 * included, and returns it as Markdown for a new scene.
 */
export function splitAtBreak(editor: Editor, pos: number): string | null {
  const { state } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'sceneBreak') return null;
  const after = state.doc.slice(pos + node.nodeSize, state.doc.content.size).content;
  const markdown = serializeMarkdown({ type: 'doc', content: fragmentJSON(after) });
  const tr = state.tr.delete(pos, state.doc.content.size);
  // A scene always keeps at least one paragraph to type in.
  if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.paragraph!.create());
  editor.view.dispatch(tr.scrollIntoView());
  return markdown;
}

/** Adds another scene's text at the end of this one, after a scene break. */
export function appendScene(editor: Editor, markdown: string): void {
  const { state } = editor;
  const incoming = state.schema.nodeFromJSON(parseMarkdown(markdown)).content;
  let end = state.doc.content.size;
  const tr = state.tr;
  // Drop a trailing empty paragraph so the break sits right after the last words.
  const last = state.doc.lastChild;
  if (last && last.type.name === 'paragraph' && last.content.size === 0 && state.doc.childCount > 1) {
    tr.delete(end - last.nodeSize, end);
    end -= last.nodeSize;
  }
  tr.insert(end, Fragment.from(state.schema.nodes.sceneBreak!.create()).append(incoming));
  editor.view.dispatch(tr.scrollIntoView());
}

function fragmentJSON(fragment: Fragment): NodeJSON[] {
  const out: NodeJSON[] = [];
  fragment.forEach((node: PMNode) => out.push(node.toJSON() as NodeJSON));
  return out;
}

/** The ids of the notes anchored in a scene's text. */
export function noteIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  const walk = (node: NodeJSON) => {
    for (const m of node.marks ?? []) if (m.type === 'note') ids.add(m.attrs.id);
    node.content?.forEach(walk);
  };
  walk(parseMarkdown(markdown));
  return ids;
}

/** Renames note anchors in a scene's text. */
export function renameNotes(markdown: string, renames: Map<string, string>): string {
  if (renames.size === 0) return markdown;
  const walk = (node: NodeJSON): NodeJSON => ({
    ...node,
    ...(node.marks && {
      marks: node.marks.map((m) => (m.type === 'note' && renames.has(m.attrs.id) ? { type: 'note', attrs: { id: renames.get(m.attrs.id)! } } : m)),
    }),
    ...(node.content && { content: node.content.map(walk) }),
  });
  return serializeMarkdown(walk(parseMarkdown(markdown)));
}

type Notes = Record<string, string>;

/**
 * Moves the notes that belong to `moved` text out of `notes`. Returns the
 * notes that stay and the ones that go with the text.
 */
export function partitionNotes(notes: Notes, moved: string): { stay: Notes; go: Notes } {
  const ids = noteIds(moved);
  const stay: Notes = {};
  const go: Notes = {};
  for (const [id, text] of Object.entries(notes)) (ids.has(id) ? go : stay)[id] = text;
  return { stay, go };
}

/**
 * Gives the incoming scene's notes ids that do not clash with this scene's.
 * Returns its text and notes with the new ids.
 */
export function mergeNotes(ours: Notes, oursText: string, theirs: Notes, theirsText: string): { text: string; notes: Notes } {
  const taken = new Set([...Object.keys(ours), ...noteIds(oursText)]);
  const theirIds = new Set([...Object.keys(theirs), ...noteIds(theirsText)]);
  const renames = new Map<string, string>();
  let n = 1;
  for (const id of theirIds) {
    if (!taken.has(id)) {
      taken.add(id);
      continue;
    }
    while (taken.has(`n${n}`) || theirIds.has(`n${n}`)) n++;
    renames.set(id, `n${n}`);
    taken.add(`n${n}`);
  }
  const notes: Notes = { ...ours };
  for (const [id, text] of Object.entries(theirs)) notes[renames.get(id) ?? id] = text;
  return { text: renameNotes(theirsText, renames), notes };
}
