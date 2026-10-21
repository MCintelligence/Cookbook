import { useEffect, useRef } from 'react';
import { STATUSES, type SceneStatus } from '../storage/document';

interface Props {
  status: SceneStatus;
  synopsis: string;
  onStatus: (status: SceneStatus) => void;
  onSynopsis: (synopsis: string) => void;
}

/** The recipe card for the open scene: where it is up to and what happens in it. Sits above the page, never on it. */
export function CardDetails({ status, synopsis, onStatus, onSynopsis }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Grow with the synopsis instead of scrolling.
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [synopsis]);

  return (
    <section className="card-details" aria-label="Scene card">
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
        placeholder="Synopsis: what happens in this scene, in a line or two"
        value={synopsis}
        onChange={(e) => onSynopsis(e.target.value)}
      />
    </section>
  );
}
