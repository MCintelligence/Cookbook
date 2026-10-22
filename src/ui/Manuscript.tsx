import { useEffect, useMemo, useRef, useState } from 'react';
import { getSchema } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { cookbookExtensions } from '../editor/extensions';
import { type NodeJSON, parseMarkdown, plainText } from '../editor/markdown';
import { type StorageAdapter } from '../storage/adapter';
import { type TreeNode, readDocument } from '../storage/book';
import { countWords } from '../storage/index';

interface Props {
  fs: StorageAdapter;
  /** The Bookshelf, in order. */
  tree: TreeNode[];
  /** Opens a scene for writing. */
  onOpen: (path: string) => void;
  /** A right-click on a scene. */
  onMenu?: (path: string, x: number, y: number) => void;
  onClose: () => void;
}

type Item =
  | { type: 'folder'; path: string; name: string; depth: number }
  | { type: 'scene'; path: string; title: string; body: NodeJSON; footnotes: string[]; words: number };

/** Words a minute for a reader of fiction. */
const READING_SPEED = 250;

/** Folders and scenes in reading order. Folders with no scenes anywhere inside are left out. */
function flatten(nodes: TreeNode[], depth = 0): ({ folder: TreeNode; depth: number } | { file: TreeNode })[] {
  return nodes.flatMap((n) => {
    if (n.kind !== 'folder') return [{ file: n }];
    const inside = flatten(n.children ?? [], depth + 1);
    return inside.some((i) => 'file' in i) ? [{ folder: n, depth }, ...inside] : [];
  });
}

function footnotesOf(node: NodeJSON): string[] {
  if (node.type === 'footnote') return [String(node.attrs?.text ?? '')];
  return (node.content ?? []).flatMap(footnotesOf);
}

export function readingTime(words: number): string {
  const minutes = Math.max(1, Math.round(words / READING_SPEED));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Bookread: the whole manuscript as one document to read, every scene in
 * Bookshelf order under its chapter headings. Click a scene's title to write in it.
 */
export function Manuscript({ fs, tree, onOpen, onClose, onMenu }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const schema = useMemo(() => getSchema(cookbookExtensions((s) => s)), []);

  useEffect(() => {
    let live = true;
    Promise.all(
      flatten(tree).map(async (entry): Promise<Item> => {
        if ('folder' in entry) return { type: 'folder', path: entry.folder.path, name: entry.folder.name, depth: entry.depth };
        const doc = await readDocument(fs, entry.file.path);
        const body = parseMarkdown(doc.body);
        return { type: 'scene', path: entry.file.path, title: doc.title, body, footnotes: footnotesOf(body), words: countWords(plainText(doc.body)) };
      }),
    ).then((all) => live && setItems(all));
    return () => {
      live = false;
    };
  }, [fs, tree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!items) return <p className="empty">Gathering every scene…</p>;
  const scenes = items.filter((i) => i.type === 'scene');
  const words = scenes.reduce((sum, s) => sum + s.words, 0);

  return (
    <>
      <div className="ms-bar">
        <span>
          <strong>Bookread</strong> · {scenes.length.toLocaleString('en')} {scenes.length === 1 ? 'scene' : 'scenes'} · {words.toLocaleString('en')} words · about{' '}
          {readingTime(words)} to read
        </span>
        <button className="pill" onClick={onClose}>
          Back to writing
        </button>
      </div>
      <article className="cb-page manuscript" aria-label="Bookread">
        {scenes.length === 0 && <p className="empty">The Bookshelf has no scenes yet.</p>}
        {items.map((item) =>
          item.type === 'folder' ? (
            <h2 key={item.path} className={`ms-folder ms-depth-${Math.min(item.depth, 2)}`}>
              {item.name}
            </h2>
          ) : (
            <section
              key={item.path}
              className="ms-scene"
              onContextMenu={(e) => {
                if (!onMenu) return;
                e.preventDefault();
                onMenu(item.path, e.clientX, e.clientY);
              }}
            >
              <button className="scene-title ms-scene-title" title="Write in this scene" onClick={() => onOpen(item.path)}>
                {item.title}
              </button>
              <SceneText schema={schema} body={item.body} />
              {item.footnotes.length > 0 && (
                <ol className="cb-page-notes">
                  {item.footnotes.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ol>
              )}
            </section>
          ),
        )}
      </article>
    </>
  );
}

/** A scene's text drawn with the same schema and styles as the editor, but not editable. */
function SceneText({ schema, body }: { schema: ReturnType<typeof getSchema>; body: NodeJSON }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    try {
      const doc = PMNode.fromJSON(schema, body);
      el.replaceChildren(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
    } catch {
      el.textContent = 'This scene could not be shown.';
    }
  }, [schema, body]);
  return <div className="cb-prose ms-text" ref={box} />;
}
