import { type ReactNode, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  /** How many Items and Groups lie at the Archive's top level. */
  count: number;
  /** Something from the Shelf or the Pantry is being dragged over the Archive. */
  dropping: boolean;
  /** Where to remember whether the Archive is open. */
  openKey: string;
  onMenu: (x: number, y: number) => void;
  /** The Archive's Groups and Items, as a tree. */
  children: ReactNode;
}

function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'open';
  } catch {
    return false;
  }
}

/**
 * The Archive: a compartment at the foot of the Shelf for Shelf and Pantry Items set aside. It
 * starts closed, and opens by itself while something is dragged over it. Nothing in it shows in
 * Prep or Plan, is exported or counted; Pantry Items in it are marked as such.
 */
export function ArchiveShelf({ count, dropping, openKey, onMenu, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(openKey));
  const shown = open || dropping;
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(openKey, open ? 'closed' : 'open');
    } catch {
      // The Archive simply starts closed next time.
    }
  };
  return (
    <section
      className={`archive${shown ? ' is-open' : ''}${dropping ? ' is-drop' : ''}`}
      aria-label="Archive"
      data-tree-away=""
      onContextMenu={(e) => {
        if ((e.target as Element).closest('[data-tree-path], input')) return;
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <button className="archive-head" aria-expanded={shown} onClick={toggle} title={shown ? 'Close the Archive' : 'Open the Archive'}>
        <svg className="archive-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <Icon name="archive" size={14} />
        <span className="archive-name">Archive</span>
        {count > 0 && <span className="archive-count">{count}</span>}
      </button>
      {shown &&
        (count > 0 ? (
          <div className="archive-body">{children}</div>
        ) : (
          <p className="archive-empty">{dropping ? 'Let go to archive it.' : 'Set Items aside here: drag them in, or right-click and pick Move to Archive. They leave Prep and Plan until they are put back.'}</p>
        ))}
    </section>
  );
}
