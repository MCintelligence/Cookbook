import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { getFind, replaceAll, replaceCurrent, setFindQuery, stepFind } from '../editor/findPlugin';

/** The one search box in the top bar. For now it searches the open scene. */
export function FindBox({ editor }: { editor: Editor | null }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [wholeWord, setWholeWord] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const find = useEditorState({
    editor,
    selector: ({ editor }) => {
      const f = editor ? getFind(editor.state) : null;
      return { count: f?.matches.length ?? 0, current: f?.current ?? -1 };
    },
  }) ?? { count: 0, current: -1 };

  useEffect(() => {
    if (editor) setFindQuery(editor, query, { wholeWord, matchCase });
  }, [editor, query, wholeWord, matchCase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault();
        setOpen(true);
        input.current?.select();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
    editor?.commands.focus();
  };

  return (
    <div className="find" ref={box}>
      <label className={`find-field${open ? ' is-open' : ''}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={input}
          value={query}
          placeholder="Find in this scene"
          aria-label="Find"
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && editor) stepFind(editor, e.shiftKey ? -1 : 1);
            if (e.key === 'Escape') close();
          }}
        />
        {query ? (
          <span className="find-count">{find.count === 0 ? 'No matches' : `${find.current + 1} of ${find.count}`}</span>
        ) : (
          <kbd>⌘F</kbd>
        )}
      </label>
      {open && (
        <section className="find-pop" aria-label="Find and replace">
          <div className="find-row">
            <label className="find-replace">
              <span>Replace with</span>
              <input value={replacement} onChange={(e) => setReplacement(e.target.value)} aria-label="Replace with" />
            </label>
            <button className="pill" disabled={!editor || find.count === 0} onClick={() => editor && replaceCurrent(editor, replacement)}>
              Replace
            </button>
            <button className="pill pill-accent" disabled={!editor || find.count === 0} onClick={() => editor && replaceAll(editor, replacement)}>
              All {find.count || ''}
            </button>
          </div>
          <div className="find-row">
            <button className="chip" aria-pressed={wholeWord} onClick={() => setWholeWord(!wholeWord)}>
              Whole word
            </button>
            <button className="chip" aria-pressed={matchCase} onClick={() => setMatchCase(!matchCase)}>
              Match case
            </button>
            <span className="find-hint">↵ next · ⇧↵ previous · Esc close</span>
          </div>
        </section>
      )}
    </div>
  );
}
