import { type CSSProperties, useEffect, useRef } from 'react';
import { type NamedCard } from '../editor/names';

interface Props {
  synopsis: string;
  onSynopsis: (synopsis: string) => void;
  /** The characters and settings named in the scene, in order of appearance. */
  cast: NamedCard[];
  /** Its width, the same as the page below. */
  style?: CSSProperties;
}

/**
 * The recipe card for the open scene: what happens in it and who is in it.
 * Sits above the page, never on it. Where the page is up to lives on the
 * Shelf and in the footer, not here.
 */
export function CardDetails({ synopsis, onSynopsis, cast, style }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Grow with the synopsis instead of scrolling.
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [synopsis]);

  return (
    <section className="card-details" aria-label="Page card" style={style}>
      <textarea
        ref={box}
        className="card-synopsis"
        aria-label="Synopsis"
        rows={1}
        placeholder="Synopsis: what happens on this page, in a line or two"
        value={synopsis}
        onChange={(e) => onSynopsis(e.target.value)}
      />
      {cast.length > 0 && (
        <div className="card-cast" aria-label="On this page">
          {cast.map((c) => (
            <button key={c.id} className={`cast-chip cast-${c.kind}`} data-peek="" data-card={c.path} title={c.kind === 'character' ? 'Character' : 'Place'}>
              {c.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
