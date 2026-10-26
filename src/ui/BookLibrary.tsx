import { useEffect, useRef, useState } from 'react';
import {
  type BookLocation,
  type RecentBook,
  browserBooks,
  canPickFolder,
  describeLocation,
  forgetBook,
  isTauri,
  recentBooks,
  sameLocation,
} from '../storage/platform';
import { BOOK_TEMPLATES, type BookTemplateId } from '../storage/templates';
import { Menu, type MenuItem } from './Menu';

interface Props {
  current: BookLocation | null;
  /** Set when the writer picked a folder that has no book in it yet. */
  adopting: BookLocation | null;
  error: string | null;
  busy: boolean;
  onOpen: (location: BookLocation) => void;
  onOpenFolder: () => void;
  onCreate: (title: string, template: BookTemplateId, inFolder: boolean) => void;
  onAdopt: (location: BookLocation) => void;
  onCancelAdopt: () => void;
  onClose: () => void;
  /** Menu items that only work on the open book, such as backing it up. */
  openBookItems?: MenuItem[];
}

/** Every book the writer has opened, plus starting a new one or opening a folder. */
export function BookLibrary({ current, adopting, error, busy, onOpen, onOpenFolder, onCreate, onAdopt, onCancelAdopt, onClose, openBookItems = [] }: Props) {
  const [recent, setRecent] = useState<RecentBook[]>(recentBooks);
  const [inBrowser, setInBrowser] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<BookTemplateId>('novel');
  const box = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ label: string; x: number; y: number; items: MenuItem[] } | null>(null);

  useEffect(() => {
    browserBooks().then(setInBrowser, () => setInBrowser([]));
    box.current?.querySelector<HTMLElement>('button, input')?.focus();
    // Escape closes a book's menu first, and the dialog only after.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.lib .menu') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const others = inBrowser.filter((name) => !recent.some((b) => sameLocation(b.location, { kind: 'browser', name })));
  const canCreate = title.trim() !== '' && !busy;
  const folderWord = isTauri() ? 'Choose where…' : 'In a folder…';

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lib" role="dialog" aria-modal="true" aria-labelledby="lib-title" ref={box}>
        <div className="lib-head">
          <h2 id="lib-title">Your works</h2>
          <button className="lib-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {error && (
          <p role="alert" className="lib-error">
            {error}
          </p>
        )}

        {adopting ? (
          <div className="lib-adopt">
            <p>
              <strong>{describeLocation(adopting)}</strong> isn’t a Cookbook work yet. Make it one? Cookbook adds <code>book.json</code>,{' '}
              <code>bookshelf/</code>, <code>pantry/</code> and a hidden <code>.cookbook/</code> folder. Nothing already in the folder is changed.
            </p>
            <div className="lib-row">
              <button className="btn" onClick={onCancelAdopt}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => onAdopt(adopting)}>
                Make it a work
              </button>
            </div>
          </div>
        ) : (
          <>
            {(recent.length > 0 || others.length > 0) && (
              <ul className="lib-list" aria-label="Recent works">
                {recent.map((b) => {
                  const open = current !== null && sameLocation(b.location, current);
                  return (
                    <li
                      key={JSON.stringify(b.location)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const forget = () => {
                          forgetBook(b.location);
                          setRecent(recentBooks());
                        };
                        setMenu({
                          label: b.title,
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            { label: open ? 'Back to writing' : 'Open', onPick: () => (open ? onClose() : onOpen(b.location)) },
                            ...(open && openBookItems.length > 0 ? [{ separator: true } as const, ...openBookItems] : []),
                            ...(open ? [] : [{ separator: true } as const, { label: 'Remove from this list', hint: 'The work is kept', onPick: forget }]),
                          ],
                        });
                      }}
                    >
                      <button className="lib-book" aria-current={open} disabled={busy} onClick={() => (open ? onClose() : onOpen(b.location))}>
                        <span className="lib-book-title">{b.title}</span>
                        <span className="lib-book-where">{open ? 'Open now' : describeLocation(b.location)}</span>
                      </button>
                      {!open && (
                        <button
                          className="lib-forget"
                          aria-label={`Remove ${b.title} from this list`}
                          title="Remove from this list (the work itself is kept)"
                          onClick={() => {
                            forgetBook(b.location);
                            setRecent(recentBooks());
                          }}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
                {others.map((name) => (
                  <li key={`browser-${name}`}>
                    <button className="lib-book" disabled={busy} onClick={() => onOpen({ kind: 'browser', name })}>
                      <span className="lib-book-title">{name}</span>
                      <span className="lib-book-where">In this browser</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="lib-new"
              onSubmit={(e) => {
                e.preventDefault();
                if (canCreate) onCreate(title.trim(), template, false);
              }}
            >
              <label htmlFor="lib-new-title">Start a new work</label>
              <div className="lib-templates" role="radiogroup" aria-label="Kind of work">
                {BOOK_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={template === t.id} title={t.description} onClick={() => setTemplate(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
              <span className="lib-template-note">{BOOK_TEMPLATES.find((t) => t.id === template)!.description}</span>
              <div className="lib-row">
                <input id="lib-new-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <button className="btn btn-primary" type="submit" disabled={!canCreate}>
                  Create
                </button>
                {canPickFolder() && (
                  <button className="btn" type="button" disabled={!canCreate} onClick={() => onCreate(title.trim(), template, true)}>
                    {folderWord}
                  </button>
                )}
              </div>
            </form>

            {canPickFolder() && (
              <button className="lib-open-folder" disabled={busy} onClick={onOpenFolder}>
                Open a work’s folder…
              </button>
            )}
          </>
        )}
        {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}
