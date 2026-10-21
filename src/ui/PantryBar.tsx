import { PANTRY_SECTIONS } from '../storage/book';
import { type SearchHit } from '../storage/index';
import { Snippet } from './FindBox';
import { type PantrySection, SECTION_LABEL } from '../storage/pantry';

export type PantryView = 'all' | PantrySection;

interface Props {
  view: PantryView;
  onView: (view: PantryView) => void;
  query: string;
  onQuery: (query: string) => void;
}

/** The Pantry's own search and its section filters. */
export function PantryBar({ view, onView, query, onQuery }: Props) {
  return (
    <div className="pantry-bar">
      <input
        className="pantry-search"
        type="search"
        aria-label="Search the Pantry"
        placeholder="Search the Pantry"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onQuery('')}
      />
      <div className="pantry-filters" role="radiogroup" aria-label="Show">
        {(['all', ...PANTRY_SECTIONS] as const).map((v) => (
          <button key={v} role="radio" aria-checked={view === v} onClick={() => onView(v)}>
            {v === 'all' ? 'All' : SECTION_LABEL[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Search results in place of the Pantry tree. */
export function PantryResults({ hits, selected, onOpen }: { hits: SearchHit[]; selected: string | null; onOpen: (path: string) => void }) {
  if (hits.length === 0) return <p className="pantry-empty">Nothing in the Pantry matches.</p>;
  return (
    <ul className="tree pantry-results">
      {hits.map((h) => (
        <li key={h.path} role="treeitem" aria-selected={selected === h.path}>
          <button className="tree-card" onClick={() => onOpen(h.path)}>
            <span className="tree-card-top">
              <span className="tree-card-title">{h.title}</span>
            </span>
            <span className="tree-card-synopsis">
              <Snippet text={h.snippet} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
