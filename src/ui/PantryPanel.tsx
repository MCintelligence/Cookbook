import { type ReactNode } from 'react';
import { PANTRY_SECTIONS } from '../storage/book';
import { type SearchHit } from '../storage/index';
import { type PantrySection, SECTION_LABEL } from '../storage/pantry';
import { Snippet } from './FindBox';

interface Props {
  group: PantrySection;
  onGroup: (group: PantrySection) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Matches for the query, or null while there is none. */
  hits: SearchHit[] | null;
  selected: string | null;
  onOpen: (path: string) => void;
  onClose: () => void;
  /** A right-click on the empty part of the panel. */
  onMenu: (x: number, y: number) => void;
  /** A right-click on a search result. */
  onHitMenu: (path: string, x: number, y: number) => void;
  /** The toolbar at the foot of the panel. */
  bar: ReactNode;
  /** The group's cards and folders. */
  children: ReactNode;
}

/** The Pantry, opened from the top bar: a search, the three groups, and the names in the one picked. */
export function PantryPanel({ group, onGroup, query, onQuery, hits, selected, onOpen, onClose, onMenu, onHitMenu, bar, children }: Props) {
  return (
    <aside
      className="panel pantry-panel"
      aria-label="Pantry"
      onContextMenu={(e) => {
        // Rows, results and the search box have their own menus.
        if ((e.target as Element).closest('[data-tree-path], .pantry-results button, input, .menu, .panel-bar')) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <div className="panel-head">
        <h2 className="panel-h">Pantry</h2>
        <span className="panel-tools">
          <button className="icon-btn" aria-label="Close Pantry" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      </div>
      <label className="panel-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m19.5 19.5-4-4" />
        </svg>
        <input
          type="search"
          aria-label="Search the Pantry"
          placeholder="Search names, places, notes"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onQuery('')}
        />
      </label>
      {hits ? (
        hits.length === 0 ? (
          <p className="panel-quiet">Nothing in the Pantry matches.</p>
        ) : (
          <ul className="tree pantry-results">
            {hits.map((h) => (
              <li key={h.path} role="treeitem" aria-selected={selected === h.path}>
                <button
                  className="tree-card"
                  onClick={() => onOpen(h.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onHitMenu(h.path, e.clientX, e.clientY);
                  }}
                >
                  <span className="tree-card-top">
                    <span className="tree-card-title">{h.title}</span>
                  </span>
                  <Snippet text={h.snippet} />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="segmented" role="tablist" aria-label="Pantry groups">
            {PANTRY_SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={group === s} onClick={() => onGroup(s)}>
                {SECTION_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="panel-list">{children}</div>
        </>
      )}
      {bar}
    </aside>
  );
}
