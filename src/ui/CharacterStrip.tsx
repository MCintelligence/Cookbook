import { type SceneMention } from '../storage/index';

export interface BookPage {
  path: string;
  title: string;
  words: number;
}

interface Props {
  /** Every page on the Shelf, in order. */
  pages: BookPage[];
  /** The pages that name this card. */
  named: SceneMention[];
  onOpen: (path: string) => void;
}

const fmt = (n: number) => n.toLocaleString();

/**
 * The whole book as one thin bar, each page as wide as its words, with the
 * pages that name the card filled in. Shows at a glance where a character
 * or place is in the book, and where they go missing.
 */
export function CharacterStrip({ pages, named, onOpen }: Props) {
  const total = pages.reduce((sum, p) => sum + p.words, 0);
  if (pages.length === 0 || total === 0) return null;
  const counts = new Map(named.map((m) => [m.path, m.count]));
  const namedWords = pages.reduce((sum, p) => sum + (counts.has(p.path) ? p.words : 0), 0);
  const share = Math.round((namedWords / total) * 100);
  const onPages = pages.filter((p) => counts.has(p.path)).length;
  return (
    <div className="strip">
      <div className="strip-bar" role="list" aria-label="Where in the book">
        {pages.map((p) => {
          const n = counts.get(p.path);
          const tip = `${p.title} · ${fmt(p.words)} words${n ? ` · named ${n === 1 ? 'once' : `${n} times`}` : ''}`;
          return (
            <button
              key={p.path}
              role="listitem"
              className={n ? 'strip-page is-named' : 'strip-page'}
              style={{ flexGrow: Math.max(p.words, 1) }}
              title={tip}
              aria-label={tip}
              onClick={() => onOpen(p.path)}
            />
          );
        })}
      </div>
      <span className="pc-quiet">
        Named on {onPages} of {pages.length} pages · {share}% of the book’s words
      </span>
    </div>
  );
}
