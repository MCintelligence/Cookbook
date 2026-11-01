import { useEffect, useRef } from 'react';
import { type getSchema } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { applyDropCaps } from '../editor/dropCaps';
import { type NodeJSON } from '../editor/markdown';

/** The footnotes in an Item's text, in order. */
export function footnotesOf(node: NodeJSON): string[] {
  if (node.type === 'footnote') return [String(node.attrs?.text ?? '')];
  return (node.content ?? []).flatMap(footnotesOf);
}

/** An Item's text drawn with the same schema and styles as the editor, but not editable. */
export function SceneText({ schema, body }: { schema: ReturnType<typeof getSchema>; body: NodeJSON }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    try {
      const doc = PMNode.fromJSON(schema, body);
      el.replaceChildren(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
      applyDropCaps(el);
    } catch {
      el.textContent = 'This item could not be shown.';
    }
  }, [schema, body]);
  return <div className="cb-prose ms-text" ref={box} />;
}
