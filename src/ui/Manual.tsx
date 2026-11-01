import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS, type Chapter, SHORTCUTS_CHAPTER } from '../manual/chapters';
import { SHORTCUTS, keysFor } from '../shortcuts';

/**
 * The manual: every chapter is shipped with the app, so it reads the same
 * offline. Shortcuts are the writer's own, worked out each time it opens.
 */

const KEY = /\{key:(\w+)(?:\|([^}]*))?\}/g;

/** A chapter's text with the writer's shortcuts in it. */
export function withKeys(text: string, keyOf: (id: string) => string = keysFor): string {
  return text.replace(KEY, (_, id: string, otherwise?: string) => keyOf(id) || otherwise || '');
}

/** The shortcuts chapter, made from the shortcuts as they are set now. */
export function shortcutsChapter(keyOf: (id: string) => string = keysFor): Chapter {
  const rows = SHORTCUTS.map((s) => `| ${s.label} | ${keyOf(s.id) || 'none'} |`);
  return {
    ...SHORTCUTS_CHAPTER,
    body: `These are the shortcuts as they are set on this device. Change any of them in App Settings › Keyboard shortcuts.\n\n| Command | Shortcut |\n| --- | --- |\n${rows.join('\n')}\n\nThe page has its own too: Backspace straight after a typing shortcut undoes it, Alt+↑ and Alt+↓ move a Shelf row, and F2 renames one.`,
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const plain = (s: string) => s.replace(/\*\*|`|\|/g, '').replace(/(^|\s)\*|\*(\s|$)/g, '$1$2').replace(/^#+ |^- /gm, '');

/** Where every word of a search is in a chapter, as a short snippet around the first, or null. */
export function findIn(chapter: Chapter, query: string): string | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const text = plain(chapter.body);
  const folded = fold(`${chapter.title} ${text}`);
  if (!words.every((w) => folded.includes(w))) return null;
  const at = fold(text).indexOf(words[0]!);
  if (at < 0) return chapter.summary;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 50)) + 1);
  const end = text.indexOf(' ', Math.min(text.length, at + 90));
  return `${start > 0 ? '…' : ''}${text.slice(start, end < 0 ? undefined : end).replace(/\s+/g, ' ').trim()}${end < 0 ? '' : '…'}`;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

/** The manual's small Markdown, as blocks: headings, paragraphs, lists and tables. */
export function Blocks({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        if (lines.length === 0) return null;
        if (lines[0]!.startsWith('## ')) return <h3 key={i}>{inline(lines[0]!.slice(3))}</h3>;
        if (lines.every((l) => l.startsWith('- ')))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => l.trim().startsWith('|'))) {
          const [head, , ...rows] = lines;
          return (
            <table key={i}>
              <thead>
                <tr>
                  {cells(head!).map((c, j) => (
                    <th key={j}>{inline(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, j) => (
                  <tr key={j}>
                    {cells(r).map((c, k) => (
                      <td key={k}>{inline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </>
  );
}

interface Props {
  /** The chapter to open at; '' for the first. */
  chapter: string;
  /** When it was asked for, so asking again while it is open goes to the chapter again. */
  at: number;
  onClose: () => void;
  onLearn: () => void;
}

export function Manual({ chapter, at, onClose, onLearn }: Props) {
  const chapters = useMemo(() => [...CHAPTERS.map((c) => ({ ...c, body: withKeys(c.body) })), shortcutsChapter()], [at]);
  const [open, setOpen] = useState(chapter || chapters[0]!.id);
  const [query, setQuery] = useState('');
  const main = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setOpen(chapter || chapters[0]!.id);
  }, [chapter, at]);
  useEffect(() => {
    search.current?.focus();
  }, []);
  // Braces: scrollTo returns a promise in newer browsers, and an effect may only return a clean-up.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.menu')) return;
      e.preventDefault();
      if (query) setQuery('');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, onClose]);

  const index = chapters.findIndex((c) => c.id === open);
  const current = chapters[Math.max(0, index)]!;
  const found = query.trim() ? chapters.map((c) => ({ c, snippet: findIn(c, query) })).filter((f) => f.snippet !== null) : null;
  const go = (id: string) => {
    setQuery('');
    setOpen(id);
  };

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lib recipes manual" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div className="recipes-head">
          <h2 id="manual-title" className="panel-h">
            Manual
          </h2>
          <span className="recipes-spacer" />
          <input ref={search} type="search" className="new-input recipes-search" placeholder="Search the manual" aria-label="Search the manual" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="recipes-body">
          <nav className="recipes-nav tpl-nav manual-nav" aria-label="Chapters">
            <div className="sub-h">Contents</div>
            {chapters.map((c) => (
              <button key={c.id} type="button" className="recipes-nav-item" aria-current={!found && c.id === current.id} title={c.summary} onClick={() => go(c.id)}>
                <span className="recipes-nav-label">{c.title}</span>
              </button>
            ))}
            <p className="recipes-note">Everything here ships with Cookbook, so it works offline.</p>
          </nav>
          <div className="manual-main" ref={main}>
            {found ? (
              <div className="manual-found" aria-live="polite">
                <p className="manual-summary">{found.length === 0 ? `Nothing in the manual matches “${query.trim()}”.` : `${found.length} ${found.length === 1 ? 'chapter' : 'chapters'} for “${query.trim()}”`}</p>
                {found.map(({ c, snippet }) => (
                  <button key={c.id} type="button" className="manual-hit" onClick={() => go(c.id)}>
                    <span className="manual-hit-title">{c.title}</span>
                    <span className="manual-hit-text">{snippet}</span>
                  </button>
                ))}
              </div>
            ) : (
              <article className="manual-page">
                <h1>{current.title}</h1>
                <p className="manual-summary">{current.summary}</p>
                <Blocks text={current.body} />
                {current.id === 'welcome' && (
                  <p>
                    <button type="button" className="btn" onClick={() => (onClose(), onLearn())}>
                      Open Learn to Cook
                    </button>
                  </p>
                )}
                <div className="manual-turn">
                  {index > 0 ? (
                    <button type="button" className="text-link" onClick={() => go(chapters[index - 1]!.id)}>
                      ← {chapters[index - 1]!.title}
                    </button>
                  ) : (
                    <span />
                  )}
                  {index < chapters.length - 1 && (
                    <button type="button" className="text-link" onClick={() => go(chapters[index + 1]!.id)}>
                      {chapters[index + 1]!.title} →
                    </button>
                  )}
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
