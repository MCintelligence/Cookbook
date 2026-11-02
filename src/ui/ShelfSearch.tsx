import { useMemo, useState, type ReactNode } from 'react';
import { type SearchHit } from '../storage/index';
import { PanelSearch, SearchResults } from './PantryPanel';

interface Props {
  /** The Shelf's Items that match, best first. */
  search: (query: string) => SearchHit[];
  selected: string | null;
  onOpen: (path: string) => void;
  onMenu: (path: string, x: number, y: number) => void;
  /** The Shelf's Groups and Items, shown while the field is empty. */
  children: ReactNode;
}

/**
 * The search under the Shelf's heading, like the Pantry's. What is typed stays in here, so a
 * keystroke redraws only the field and its results, never the app or the Shelf's tree.
 */
export function ShelfSearch({ search, selected, onOpen, onMenu, children }: Props) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => (query.trim() ? search(query) : null), [query, search]);
  return (
    <>
      <PanelSearch label="Search the Shelf" placeholder="Search names and text" query={query} onQuery={setQuery} />
      {hits ? <SearchResults hits={hits} selected={selected} empty="Nothing on the Shelf matches." onOpen={onOpen} onMenu={onMenu} /> : children}
    </>
  );
}
