import { useEffect, useMemo, useRef, useState } from 'react';
import { type CookbookDocument } from '../storage/document';
import { type SearchHit } from '../storage/index';
import { CardPreview } from './CardPreview';
import { keys } from '../shortcuts';

export interface ShelfCard {
  id: string;
  path: string;
  title: string;
  kind: 'character' | 'setting' | 'research';
  aka: string[];
}

interface Props {
  cards: ShelfCard[];
  /** Ids of the cards named in the open scene; they come first. */
  castIds: string[];
  /** Full-text search over the Pantry, for words inside cards. */
  search: (query: string) => SearchHit[];
  /** Opened by typing @: Enter inserts the name in place of the @. */
  inserting: boolean;
  /** Letters typed into the page after the @ before the shelf opened; they become the search. */
  typed?: () => string;
  canInsert: boolean;
  loadCard: (path: string) => Promise<CookbookDocument>;
  loadPicture: (path: string) => Promise<string>;
  onInsert: (name: string) => void;
  onPin: (path: string) => void;
  onOpen: (path: string) => void;
  /** `typed` is what was in the search, which goes back on the page after the @ when the shelf opened from it. */
  onClose: (typed: string) => void;
}

interface Row {
  card: ShelfCard;
  /** The name to insert: the one the writer typed towards, or the card's title. */
  name: string;
  group: 'In this item' | 'Pantry' | 'Mentioned inside';
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Which of a card's names fits the query best: starts with it, then contains it. */
export function bestName(card: ShelfCard, q: string): { name: string; score: number } | null {
  const names = [card.title, ...card.aka];
  const starts = names.find((n) => fold(n).startsWith(q) || fold(n).split(/\s+/).some((w) => w.startsWith(q)));
  if (starts) return { name: starts, score: 0 };
  const contains = names.find((n) => fold(n).includes(q));
  return contains ? { name: contains, score: 1 } : null;
}

/**
 * The Pantry shelf: a quick search over every card, from anywhere in the
 * draft (⌘J, the footer button, or typing @). Cards named in the open scene
 * come first. The highlighted card can be inserted by name, pinned beside the
 * draft, or opened.
 */
export function PantryShelf({ cards, castIds, search, inserting, typed, canInsert, loadCard, loadPicture, onInsert, onPin, onOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [preview, setPreview] = useState<CookbookDocument | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const early = typed?.();
    if (early) setQuery(early);
    input.current?.focus();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const q = fold(query.trim());
    const byTitle = [...cards].sort((a, b) => a.title.localeCompare(b.title, 'en'));
    if (!q) {
      const cast = castIds.flatMap((id) => cards.find((c) => c.id === id) ?? []);
      const rest = byTitle.filter((c) => !castIds.includes(c.id));
      return [...cast.map((card) => ({ card, name: card.title, group: 'In this item' as const })), ...rest.map((card) => ({ card, name: card.title, group: 'Pantry' as const }))];
    }
    const named = byTitle
      .map((card) => ({ card, best: bestName(card, q) }))
      .filter((r): r is { card: ShelfCard; best: { name: string; score: number } } => r.best !== null)
      .sort((a, b) => a.best.score - b.best.score || Number(!castIds.includes(a.card.id)) - Number(!castIds.includes(b.card.id)));
    const seen = new Set(named.map((r) => r.card.path));
    const inside = search(query)
      .filter((h) => !seen.has(h.path))
      .flatMap((h) => cards.find((c) => c.path === h.path) ?? []);
    return [
      ...named.map(({ card, best }) => ({ card, name: best.name, group: (castIds.includes(card.id) ? 'In this item' : 'Pantry') as Row['group'] })),
      ...inside.map((card) => ({ card, name: card.title, group: 'Mentioned inside' as const })),
    ];
  }, [cards, castIds, query, search]);

  const current = rows[Math.min(at, rows.length - 1)] ?? null;
  useEffect(() => setAt(0), [query]);
  // Read the highlighted card when the highlight moves.
  useEffect(() => {
    setPreview(null);
    if (!current) return;
    let live = true;
    loadCard(current.card.path).then((c) => live && setPreview(c), () => {});
    return () => {
      live = false;
    };
  }, [current?.card.path, loadCard]);
  useEffect(() => list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }), [at]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setAt((i) => Math.min(i + 1, rows.length - 1));
    else if (e.key === 'ArrowUp') setAt((i) => Math.max(i - 1, 0));
    else if (e.key === 'Escape') onClose(query);
    else if (e.key === 'Enter' && current) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) onOpen(current.card.path);
      else if (e.metaKey || e.ctrlKey) onPin(current.card.path);
      else if (canInsert) onInsert(current.name);
      else onOpen(current.card.path);
    } else return;
    e.preventDefault();
  };

  return (
    <div className="shelf-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(query)}>
      <div className="shelf" role="dialog" aria-modal="true" aria-label="Pantry shelf">
        <div className="shelf-search">
          {inserting && <span className="shelf-at">@</span>}
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="shelf-list"
            aria-activedescendant={current ? `shelf-${current.card.id}` : undefined}
            placeholder={inserting ? 'Name a character or setting' : 'Search the Pantry'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd>esc</kbd>
        </div>
        <div className="shelf-body">
          <ul className="shelf-list" id="shelf-list" role="listbox" ref={list}>
            {rows.length === 0 && <li className="shelf-empty">Nothing in the Pantry matches.</li>}
            {rows.map((r, i) => (
              <li key={r.card.path} className="shelf-row-wrap">
                {(i === 0 || rows[i - 1]!.group !== r.group) && <span className="shelf-group">{r.group}</span>}
                <button
                  id={`shelf-${r.card.id}`}
                  role="option"
                  aria-selected={r === current}
                  className={`shelf-row kind-${r.card.kind}`}
                  onMouseMove={() => setAt(i)}
                  onClick={() => (canInsert && inserting ? onInsert(r.name) : setAt(i))}
                >
                  <span className="shelf-title">{r.card.title}</span>
                  {r.name !== r.card.title && <span className="shelf-aka">{r.name}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="shelf-preview">
            {current && preview && (
              <>
                <CardPreview card={preview} loadPicture={loadPicture} />
                <div className="peek-actions">
                  <button className="btn btn-primary" disabled={!canInsert} title={`Insert “${current.name}” (Enter)`} onClick={() => onInsert(current.name)}>
                    Insert
                  </button>
                  <button className="btn" title={keys('Mod-Enter')} onClick={() => onPin(current.card.path)}>
                    Pin beside page
                  </button>
                  <button className="btn" title={keys('Mod-Shift-Enter')} onClick={() => onOpen(current.card.path)}>
                    Open
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
