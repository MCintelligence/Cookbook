import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { getFind, replaceAll, replaceCurrent, setFindQuery, stepFind } from '../editor/findPlugin';
import { type SearchHit, MATCH_END, MATCH_START } from '../storage/index';

const KIND_LABEL: Record<SearchHit['kind'], string> = { scene: 'Scene', character: 'Character', setting: 'Setting', research: 'Research', journal: 'Journal' };

interface Props {
  editor: Editor | null;
  /** Searches every scene and Pantry card in the book. */
  search: (query: string) => SearchHit[];
  currentPath: string | null;
  onOpenHit: (path: string) => void;
  /** Opens the box with these words, as "Find everywhere" on a right-click does. */
  request?: { query: string; at: number } | null;
}

/**
 * The one search box in the top bar. It finds and replaces in the open scene,
 * and lists the other scenes and cards that match.
 */
export function FindBox({ editor, search, currentPath, onOpenHit, request }: Props) {
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

  const jumpOnOpen = useRef(false);
  useEffect(() => {
    if (!editor) return;
    setFindQuery(editor, query, { wholeWord, matchCase });
    // Opening a scene from the results lands on its first match.
    if (jumpOnOpen.current) {
      jumpOnOpen.current = false;
      stepFind(editor, 1);
    }
  }, [editor, query, wholeWord, matchCase]);

  const deferred = useDeferredValue(query);
  const hits = useMemo(() => (deferred.trim() ? search(deferred) : []), [deferred, search]);
  const elsewhere = hits.filter((h) => h.path !== currentPath);

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

  useEffect(() => {
    if (!request) return;
    setQuery(request.query);
    setOpen(true);
    input.current?.focus();
  }, [request?.at]);

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
          placeholder="Find in this book"
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
          {query.trim() !== '' && (
            <div className="find-results">
              <div className="find-results-label">
                <span>Elsewhere in the book</span>
                <span>{elsewhere.length === 0 ? 'Nothing else' : elsewhere.length}</span>
              </div>
              {elsewhere.length > 0 && (
                <ul>
                  {elsewhere.map((h) => (
                    <li key={h.path}>
                      <button
                        className="find-hit"
                        onClick={() => {
                          jumpOnOpen.current = true;
                          onOpenHit(h.path);
                        }}
                      >
                        <span className="find-hit-head">
                          <span className="find-hit-title">{h.title}</span>
                          <span className="find-hit-kind">{KIND_LABEL[h.kind]}</span>
                        </span>
                        <Snippet text={h.snippet} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Shows a search snippet with the matched words highlighted. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(MATCH_START);
  return (
    <span className="find-hit-snippet">
      {parts.map((part, i) => {
        if (i === 0) return <Fragment key={i}>{part}</Fragment>;
        const [match, rest] = part.split(MATCH_END);
        return (
          <Fragment key={i}>
            <mark>{match}</mark>
            {rest}
          </Fragment>
        );
      })}
    </span>
  );
}
