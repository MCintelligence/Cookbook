import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeAt } from './zoom';

interface Props {
  name: string;
  /** The date shown now, YYYY-MM-DD, if the folder has one. */
  date: string | null;
  pinned: boolean;
  x: number;
  y: number;
  /** A date to pin, or null to go back to the automatic one. */
  onDone: (date: string | null) => void;
  onClose: () => void;
}

/** Sets a Journal folder's date by hand, or goes back to when it last changed. */
export function DatePopover({ name, date, pinned, x, y, onDone, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(date ?? '');
  const [at, setAt] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const r = box.current!.getBoundingClientRect();
    setAt(placeAt(box.current!.parentElement, { left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) }));
    box.current!.querySelector('input')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  return (
    <div
      className="date-pop"
      role="dialog"
      aria-label="Change date"
      ref={box}
      style={at}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onDone(value);
        }}
      >
        <label>
          <span className="date-pop-label">Date for {name}</span>
          <input type="date" value={value} required onChange={(e) => setValue(e.target.value)} />
        </label>
        <p className="date-pop-note">
          {pinned ? 'Set by hand.' : 'Set automatically to the last time anything in the folder changed.'} Picking a date here pins it until you switch back.
        </p>
        <div className="date-pop-actions">
          <button type="button" disabled={!pinned} onClick={() => onDone(null)}>
            Use last modified
          </button>
          <button type="submit" className="primary" disabled={!value}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
