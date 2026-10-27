import { useEffect, useRef, useState } from 'react';
import { MAX_ZOOM, MIN_ZOOM, zoomLabel } from '../storage/page';

const STEP = 10;

/** The page's zoom in the footer: a slider that opens from it, with − and + at its ends and Fit width. */
export function ZoomControl({ zoom, fitted, label, onZoom }: { zoom: number; /** The zoom Fit width works out to now. */ fitted: number; label: string; onZoom: (zoom: number) => void }) {
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
  return (
    <div className="zoom" ref={box}>
      <button className="footer-link" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        {label} · {zoomLabel(zoom)}
        <svg className="zoom-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
      {open && (
        <div className="zoom-pop" role="dialog" aria-label="Zoom">
          <ZoomSlider zoom={zoom} fitted={fitted} onZoom={onZoom} />
        </div>
      )}
    </div>
  );
}

/** The slider itself, with − and + at its ends and Fit width; the footer and Settings share it. */
export function ZoomSlider({ zoom, fitted, onZoom }: { zoom: number; fitted: number; onZoom: (zoom: number) => void }) {
  const now = zoom === 0 ? fitted : zoom;
  const set = (z: number) => onZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z))));
  return (
    <span className="zoom-slider">
      <button className="icon-btn" aria-label="Zoom out" onClick={() => set(now - STEP)}>
        −
      </button>
      <input type="range" aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={5} value={now} onChange={(e) => set(Number(e.target.value))} />
      <button className="icon-btn" aria-label="Zoom in" onClick={() => set(now + STEP)}>
        +
      </button>
      <span className="zoom-value">{now}%</span>
      <button className="btn" aria-pressed={zoom === 0} onClick={() => onZoom(0)}>
        Fit width
      </button>
    </span>
  );
}
