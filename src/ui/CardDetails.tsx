import { useEffect, useRef } from 'react';
import { STATUSES, type SceneStatus } from '../storage/document';
import { type NamedCard } from '../editor/names';

interface Props {
  status: SceneStatus;
  synopsis: string;
  onStatus: (status: SceneStatus) => void;
  onSynopsis: (synopsis: string) => void;
  /** The characters and settings named in the scene, in order of appearance. */
  cast: NamedCard[];
}

/** The recipe card for the open scene: where it is up to and what happens in it. Sits above the page, never on it. */
export function CardDetails({ status, synopsis, onStatus, onSynopsis, cast }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Grow with the synopsis instead of scrolling.
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [synopsis]);

  return (
    <section className="card-details" aria-label="Item card">
      <div className="card-status" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => (
          <button key={s.id} role="radio" aria-checked={status === s.id} onClick={() => onStatus(s.id)}>
            <span className={`status-dot status-${s.id}`} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        ref={box}
        className="card-synopsis"
        aria-label="Synopsis"
        rows={1}
        placeholder="Synopsis: what happens in this item, in a line or two"
        value={synopsis}
        onChange={(e) => onSynopsis(e.target.value)}
      />
      {cast.length > 0 && (
        <div className="card-cast" aria-label="In this item">
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
