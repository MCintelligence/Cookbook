import { type CSSProperties } from 'react';
import { type NamedCard } from '../editor/names';

interface Props {
  /** The characters and settings named in the scene, in order of appearance. */
  cast: NamedCard[];
  /** Its width, the same as the page below. */
  style?: CSSProperties;
}

/**
 * Who is in the open scene, as a strip of chips above the page, never on it.
 * Shows nothing when the scene names nobody, so the page has the space to itself.
 * Where the page is up to lives on the Shelf and in the footer, not here.
 */
export function CardDetails({ cast, style }: Props) {
  if (cast.length === 0) return null;
  return (
    <section className="card-details" aria-label="In this item" style={style}>
      <div className="card-cast">
        {cast.map((c) => (
          <button key={c.id} className={`cast-chip cast-${c.kind}`} data-peek="" data-card={c.path} title={c.kind === 'character' ? 'Character' : 'Place'}>
            {c.title}
          </button>
        ))}
      </div>
    </section>
  );
}
