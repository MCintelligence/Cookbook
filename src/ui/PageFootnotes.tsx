import { useEditorState, type Editor } from '@tiptap/react';
import { footnotes, selectFootnote } from '../editor/seasonings';

/** The scene's footnotes, listed under a short rule at the foot of the page. */
export function PageFootnotes({ editor }: { editor: Editor | null }) {
  const list = useEditorState({ editor, selector: ({ editor }) => (editor ? footnotes(editor.state.doc).map((f) => f.text) : []) }) ?? [];
  if (!editor || list.length === 0) return null;
  return (
    <ol className="cb-page-notes" aria-label="Footnotes">
      {list.map((text, i) => (
        <li key={i} onClick={() => selectFootnote(editor, i)}>
          {text || <span className="cb-page-notes-empty">Empty footnote</span>}
        </li>
      ))}
    </ol>
  );
}
