import { useLayoutEffect, useRef } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { footnoteTexts } from '../editor/docStats';
import { selectFootnote, setFootnoteText } from '../editor/seasonings';

/** Grows a footnote's box to fit its text, since footnotes are written right on the page. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0';
  el.style.height = `${el.scrollHeight}px`;
}

/** The page's footnotes, under a short rule at its foot, each written in place. */
export function PageFootnotes({ editor }: { editor: Editor | null }) {
  const list = useEditorState({ editor, selector: ({ editor }) => (editor ? footnoteTexts(editor.state.doc) : []) }) ?? [];
  const box = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    box.current?.querySelectorAll('textarea').forEach(fit);
  }, [list.join('\n')]);
  if (!editor || list.length === 0) return null;
  return (
    <ol className="cb-page-notes" aria-label="Footnotes" ref={box}>
      {list.map((text, i) => (
        <li key={i}>
          <textarea
            rows={1}
            value={text}
            placeholder="Footnote"
            aria-label={`Footnote ${i + 1}`}
            onChange={(e) => {
              setFootnoteText(editor, i, e.target.value);
              fit(e.target);
            }}
            onKeyDown={(e) => {
              // Enter or Escape goes back to the footnote's mark in the text.
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                selectFootnote(editor, i);
              }
            }}
          />
        </li>
      ))}
    </ol>
  );
}

/** Puts the cursor in a footnote at the foot of the page, once it is drawn. */
export function editFootnote(index: number) {
  requestAnimationFrame(() => {
    const el = document.querySelectorAll<HTMLTextAreaElement>('.cb-page-notes textarea')[index];
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  });
}
