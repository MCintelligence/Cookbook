import { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteItem {
  id: string;
  label: string;
  /** Shown on the right: a shortcut, or where a scene is. */
  hint?: string;
  group: string;
  /** More words that find it, such as the settings section it opens. */
  words?: string;
  run: () => void;
}

interface Props {
  items: PaletteItem[];
  placeholder: string;
  onClose: () => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word typed must start a word of the item (or appear in it); items whose label starts with the query come first. */
export function rank(items: PaletteItem[], query: string): PaletteItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const label = fold(item.label);
    const all = `${label} ${fold(item.words ?? '')} ${fold(item.group)}`;
    const starts = all.split(/[\s›·,()/-]+/);
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (starts.some((s) => s.startsWith(w))) continue;
      if (all.includes(w)) score += 2;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (!label.startsWith(words[0]!)) score += 1;
    scored.push({ item, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.item);
}

/**
 * The command palette (⌘K) and the quick switcher (⌘O): type a few letters of
 * any action, setting, scene, card or entry, then Enter.
 */
export function Palette({ items, placeholder, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const before = useRef(document.activeElement as HTMLElement | null);
  const shown = useMemo(() => rank(items, query).slice(0, 60), [items, query]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setAt(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const close = (back: boolean) => {
    if (back && before.current?.isConnected) before.current.focus({ preventScroll: true });
    onClose();
  };
  const pick = (item: PaletteItem | undefined) => {
    if (!item) return;
    close(true);
    item.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(true)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={placeholder}>
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown[at] ? `palette-${shown[at]!.id}` : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const n = shown.length;
              if (n) setAt((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(shown[at]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {shown.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
          {shown.map((item, i) => [
            (i === 0 || shown[i - 1]!.group !== item.group) && !query && (
              <li key={`group-${item.group}`} role="presentation" className="palette-group">
                {item.group}
              </li>
            ),
            <li
              key={item.id}
              id={`palette-${item.id}`}
              role="option"
              aria-selected={i === at}
              className="palette-item"
              onMouseMove={() => i !== at && setAt(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              <span className="palette-label">{item.label}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </li>,
          ])}
        </ul>
      </div>
    </div>
  );
}
