import { useEffect, useRef, useState } from 'react';
import { Menu, type MenuItem } from './Menu';

export interface BarMenu {
  label: string;
  /** Built when the menu opens, so it shows things as they are now. */
  items: () => MenuItem[];
}

/**
 * File, Edit, View and the rest along the top bar. A click opens a menu;
 * while one is open, pointing at another opens that one instead, and ← and →
 * step between them.
 */
export function MenuBar({ menus }: { menus: BarMenu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Pointing at another menu opens it after the same short pause as a submenu, so passing over one on the way doesn't.
  const hover = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hover.current), []);
  const go = (index: number) => {
    buttons.current[index]?.focus();
    setOpen(index);
  };
  const step = (from: number, dir: -1 | 1) => (from + dir + menus.length) % menus.length;
  const at = open === null ? null : buttons.current[open]?.getBoundingClientRect();
  return (
    <div className="menubar" role="menubar" aria-label="Menus">
      {menus.map((m, i) => (
        <button
          key={m.label}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open === i}
          className="menubar-item"
          onClick={() => {
            window.clearTimeout(hover.current);
            setOpen(open === i ? null : i);
          }}
          onPointerEnter={() => {
            window.clearTimeout(hover.current);
            if (open !== null && open !== i) hover.current = window.setTimeout(() => go(i), 150);
          }}
          onPointerLeave={() => window.clearTimeout(hover.current)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              go(i);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              buttons.current[step(i, e.key === 'ArrowRight' ? 1 : -1)]?.focus();
            }
          }}
        >
          {m.label}
        </button>
      ))}
      {open !== null && at && (
        <Menu
          key={open}
          items={menus[open]!.items()}
          label={menus[open]!.label}
          x={at.left}
          y={at.bottom + 4}
          opener={buttons.current[open]}
          onClose={() => {
            window.clearTimeout(hover.current);
            setOpen(null);
          }}
          onSide={(dir) => go(step(open, dir))}
        />
      )}
    </div>
  );
}
