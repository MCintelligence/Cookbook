import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { label: string; onPick: () => void; disabled?: boolean; danger?: boolean; hint?: string }
  | { separator: true }
  | { heading: string };

interface Props {
  items: MenuItem[];
  /** Where the menu's top left corner goes, in window coordinates. It moves in to stay on screen. */
  x: number;
  y: number;
  label: string;
  onClose: () => void;
}

/**
 * A small pop-up menu, for right-clicks and the book menu. Arrow keys move
 * between items, Escape or a click elsewhere closes it, and choosing an
 * item closes it before the item runs.
 */
export function Menu({ items, x, y, label, onClose }: Props) {
  const box = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAt({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const step = (e: React.KeyboardEvent) => {
    const buttons = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? -1 : null;
    if (to === null || buttons.length === 0) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length]?.focus();
  };

  return (
    <ul className="menu" role="menu" aria-label={label} ref={box} style={at} onKeyDown={step} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        'separator' in item ? (
          <li key={i} role="separator" className="menu-sep" />
        ) : 'heading' in item ? (
          <li key={i} role="presentation" className="menu-heading">
            {item.heading}
          </li>
        ) : (
          <li key={i} role="none">
            <button
              role="menuitem"
              className={item.danger ? 'menu-danger' : undefined}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onPick();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
