import { useRef, useState } from 'react';
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
  // A click on the open menu's own name closes it, rather than closing and opening it again.
  const closed = useRef<{ index: number; at: number } | null>(null);
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
            const c = closed.current;
            if (c && c.index === i && Date.now() - c.at < 400) return;
            setOpen(open === i ? null : i);
          }}
          onPointerEnter={() => open !== null && open !== i && go(i)}
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
          onClose={() => {
            closed.current = { index: open, at: Date.now() };
            setOpen(null);
          }}
          onSide={(dir) => go(step(open, dir))}
        />
      )}
    </div>
  );
}
