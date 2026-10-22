import { useEffect, useMemo, useRef, useState } from 'react';
import { plainText } from '../editor/markdown';
import { countWords } from '../storage/index';
import { type Snapshot, compareText } from '../storage/snapshots';

interface Props {
  title: string;
  /** The scene's text now, as Markdown. */
  current: string;
  snapshots: Snapshot[] | null;
  onTake: () => void;
  onRollBack: (s: Snapshot) => void;
  onDelete: (s: Snapshot) => void;
  onClose: () => void;
}

const when = (d: Date) => d.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

/** A scene's snapshots: pick one to see what changed since, and roll back to it if need be. */
export function SnapshotsDialog({ title, current, snapshots, onTake, onRollBack, onDelete, onClose }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(document.activeElement as HTMLElement | null);
  const chosen = snapshots?.find((s) => s.path === picked) ?? snapshots?.[0] ?? null;
  const changes = useMemo(() => (chosen ? compareText(plainText(chosen.body), plainText(current)) : []), [chosen, current]);
  const changed = changes.some((p) => p.some((c) => c.kind !== 'same'));

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      if (before.current?.isConnected) before.current.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="lib snapshots"
        role="dialog"
        aria-modal="true"
        aria-label={`Snapshots of ${title}`}
        ref={box}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="snap-head">
          <h2>Snapshots of “{title || 'Untitled'}”</h2>
          <div className="snap-actions">
            <button className="pill" onClick={onTake}>
              Take a snapshot now
            </button>
            <button className="pill" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {snapshots === null ? (
          <p className="snap-empty">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="snap-empty">No snapshots yet. Take one before a big rewrite; Cookbook also takes one before splitting, merging or replacing all.</p>
        ) : (
          <div className="snap-body">
            <ul className="snap-list" aria-label="Snapshots">
              {snapshots.map((s) => (
                <li key={s.path}>
                  <button aria-pressed={s.path === chosen?.path} onClick={() => setPicked(s.path)}>
                    <strong>{when(s.date)}</strong>
                    <span>
                      {s.reason} · {countWords(plainText(s.body)).toLocaleString('en')} words
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {chosen && (
              <section className="snap-compare" aria-label="What changed since this snapshot">
                <div className="snap-compare-head">
                  <span>
                    Since {when(chosen.date)}: <del>removed</del> and <ins>added</ins>
                  </span>
                  <span className="snap-actions">
                    <button className="pill" onClick={() => onDelete(chosen)}>
                      Delete
                    </button>
                    <button className="pill pill-accent" disabled={!changed} onClick={() => onRollBack(chosen)}>
                      Roll back to this
                    </button>
                  </span>
                </div>
                <div className="snap-text">
                  {!changed && <p className="snap-empty">Nothing has changed since this snapshot.</p>}
                  {changed &&
                    changes.map((para, i) => (
                      <p key={i} className={para.every((c) => c.kind === 'same') ? 'snap-same' : undefined}>
                        {para.map((c, j) => (c.kind === 'same' ? <span key={j}>{c.text}</span> : c.kind === 'added' ? <ins key={j}>{c.text}</ins> : <del key={j}>{c.text}</del>))}
                      </p>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
