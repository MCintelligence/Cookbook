import { type ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { type IconName } from './iconArt';

interface Props {
  /** Its name, as the header shows it: Research or Archive. */
  name: string;
  icon: IconName;
  /** A class of its own, for the drag and drop that finds it. */
  className: string;
  /** How many Items and Groups lie at its top level. */
  count: number;
  /** Something is being dragged over it that it would take. */
  dropping: boolean;
  /** Where to remember whether it is open. */
  openKey: string;
  /** What it says while empty, and while something is held over it empty. */
  empty: string;
  emptyDrop: string;
  onMenu: (x: number, y: number) => void;
  /** Its Groups and Items, as a tree. */
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
 * A compartment at the foot of the Shelf, kept beside the book rather than in it: Research and the
 * Archive. It starts closed, opens by itself while something is dragged over it, and remembers
 * whether the writer left it open. Nothing in it shows in Prep or Plan, is exported or counted.
 */
export function Compartment({ name, icon, className, count, dropping, openKey, empty, emptyDrop, onMenu, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(openKey));
  const shown = open || dropping;
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(openKey, open ? 'closed' : 'open');
    } catch {
      // It simply starts closed next time.
    }
  };
  return (
    <section
      className={`compartment ${className}${shown ? ' is-open' : ''}${dropping ? ' is-drop' : ''}`}
      aria-label={name}
      data-tree-away=""
      onContextMenu={(e) => {
        if ((e.target as Element).closest('[data-tree-path], input')) return;
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <button className="compartment-head" aria-expanded={shown} onClick={toggle} title={shown ? `Close ${name}` : `Open ${name}`}>
        <svg className="compartment-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <Icon name={icon} size={14} />
        <span className="compartment-name">{name}</span>
        {count > 0 && <span className="compartment-count">{count}</span>}
      </button>
      {shown && (count > 0 ? <div className="compartment-body">{children}</div> : <p className="compartment-empty">{dropping ? emptyDrop : empty}</p>)}
    </section>
  );
}
