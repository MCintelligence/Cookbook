import { useEffect, useMemo, useState } from 'react';
import { getSchema } from '@tiptap/core';
import { cookbookExtensions } from '../editor/extensions';
import { type NodeJSON, parseMarkdown } from '../editor/markdown';
import { type CookbookDocument } from '../storage/document';
import { SceneText } from './Manuscript';

interface Props {
  path: string;
  load: (path: string) => Promise<CookbookDocument>;
  /** Changes whenever the book does, so the scene shown stays current. */
  version: number;
  /** Swaps: this scene opens for writing, and the one being written moves here. */
  onWrite: (path: string) => void;
  onClose: () => void;
}

/**
 * A second scene beside the one being written, to read while writing, like
 * Scrivener's split editor. One scene is written at a time; Swap trades them.
 */
export function Beside({ path, load, version, onWrite, onClose }: Props) {
  const [doc, setDoc] = useState<{ title: string; body: NodeJSON } | null>(null);
  const [missing, setMissing] = useState(false);
  const schema = useMemo(() => getSchema(cookbookExtensions((s) => s)), []);

  useEffect(() => {
    let live = true;
    load(path).then(
      (d) => live && (setDoc({ title: d.title, body: parseMarkdown(d.body) }), setMissing(false)),
      () => live && setMissing(true),
    );
    return () => {
      live = false;
    };
  }, [path, load, version]);

  return (
    <aside className="beside" aria-label={`Beside: ${doc?.title ?? 'scene'}`}>
      <div className="beside-bar">
        <span className="beside-title">{doc?.title || (missing ? 'Scene not found' : '…')}</span>
        <button className="pill" disabled={missing} onClick={() => onWrite(path)} title="Write in this scene, and put the other one here">
          Swap
        </button>
        <button className="notice-close beside-close" aria-label="Close the scene beside" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="cb-page beside-page">{doc && <SceneText schema={schema} body={doc.body} />}</div>
    </aside>
  );
}
