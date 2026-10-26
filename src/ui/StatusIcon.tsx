import { useEffect, useRef, useState } from 'react';
import { STATUSES, type SceneStatus } from '../storage/document';

/**
 * Where a page is up to, as a small picture: a dashed ring before it starts,
 * a flame while it simmers, a covered dish when it is served. None of them
 * is a dot or a tick, so they can't be mistaken for the footer's saved mark.
 */
export function StatusIcon({ status, decorative }: { status: SceneStatus; /** Beside its own label, so screen readers skip it. */ decorative?: boolean }) {
  const label = STATUSES.find((s) => s.id === status)!.label;
  return (
    <svg className={`status-icon status-${status}`} width="12" height="12" viewBox="0 0 16 16" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}>
      {!decorative && <title>{label}</title>}
      {status === 'not-started' && <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2" />}
      {status === 'simmering' && (
        <path d="M8 1.5c.4 2.2 1.9 3.3 3 4.6 1 1.2 1.5 2.4 1.5 3.7A4.5 4.5 0 0 1 3.5 9.8c0-1.6.8-2.9 1.9-3.9.2 1 .7 1.8 1.5 2.2C6.6 5.9 7 3.6 8 1.5Z" fill="currentColor" />
      )}
      {status === 'done' && (
        <>
          <circle cx="8" cy="3.6" r="1.3" fill="currentColor" />
          <path d="M2.6 11.4a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor" />
          <path d="M1.5 13.4h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** The open page's status in the footer, beside its zoom: a small list opens from it. */
export function StatusControl({ status, onStatus }: { status: SceneStatus; onStatus: (status: SceneStatus) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const now = STATUSES.find((s) => s.id === status)!;
  return (
    <div className="status-control" ref={box}>
      <button className="footer-link" aria-expanded={open} aria-haspopup="true" title="Where this page is up to" onClick={() => setOpen(!open)}>
        <StatusIcon status={status} decorative />
        {now.label}
      </button>
      {open && (
        <div className="status-pop" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={s.id === status}
              onClick={() => {
                onStatus(s.id);
                setOpen(false);
              }}
            >
              <StatusIcon status={s.id} decorative />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
