import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeAt } from './zoom';

export type MenuItem =
  | { label: string; onPick: () => void; disabled?: boolean; danger?: boolean; hint?: string; checked?: boolean; icon?: ReactNode }
  | { label: string; items: MenuItem[]; disabled?: boolean }
  | { separator: true }
  | { heading: string };

interface Props {
  items: MenuItem[];
  /** Where the menu's top left corner goes, in window coordinates. It moves in to stay on screen. */
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  /** A submenu: it opens beside its item, and ← closes it. */
  nested?: { from: HTMLElement; onBack: () => void; restore: () => void };
  /** In the top menu bar: ← and → go to the menu beside this one. */
  onSide?: (dir: -1 | 1) => void;
}

/**
 * A small pop-up menu, for right-clicks and the book menu. Arrow keys move
 * between items, → and ← open and close submenus, Escape or a click
 * elsewhere closes it, and choosing an item closes it before the item runs.
 */
export function Menu({ items, x, y, label, onClose, nested, onSide }: Props) {
  const box = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ index: number; from: HTMLElement; focus: boolean } | null>(null);
  const hover = useRef<number | undefined>(undefined);
  // Where the keyboard was before the menu opened, to go back to when it closes.
  const before = useRef<HTMLElement | null>(nested ? null : (document.activeElement as HTMLElement | null));
  const back = () => before.current?.isConnected && before.current.focus({ preventScroll: true });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    // A submenu that doesn't fit on the right opens on the left of its menu instead.
    if (nested && left + r.width > window.innerWidth - 8) left = nested.from.getBoundingClientRect().left - r.width + 4;
    setAt(placeAt(el.parentElement, { left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) }));
    el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    if (nested) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        back();
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
  }, [onClose, nested]);

  useEffect(() => () => window.clearTimeout(hover.current), []);

  const own = () => Array.from(box.current?.querySelectorAll<HTMLButtonElement>(':scope > li > button:not(:disabled)') ?? []);

  const step = (e: React.KeyboardEvent) => {
    // Keys pressed in an open submenu are its own business.
    if (!box.current || !(e.target instanceof HTMLElement) || e.target.closest('.menu') !== box.current) return;
    const buttons = own();
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowRight') {
      const index = Number((document.activeElement as HTMLElement | null)?.dataset.menuIndex);
      const item = items[index];
      if (item && 'items' in item) {
        e.preventDefault();
        setSub({ index, from: document.activeElement as HTMLElement, focus: true });
      } else if (onSide) {
        e.preventDefault();
        onSide(1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && onSide && !nested) {
      e.preventDefault();
      return onSide(-1);
    }
    if (e.key === 'ArrowLeft' && nested) {
      e.preventDefault();
      e.stopPropagation();
      return nested.onBack();
    }
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? -1 : null;
    if (to === null || buttons.length === 0) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length]?.focus();
  };

  const openSub = (index: number, from: HTMLElement, focus: boolean) => {
    window.clearTimeout(hover.current);
    setSub({ index, from, focus });
  };

  /** Before an item runs, the keyboard goes back where it was (a submenu asks the menu it came from). */
  const restore = nested ? nested.restore : back;
  const subItem = sub ? items[sub.index] : undefined;
  // When some items can be ticked, every label leaves room for the tick, so they all line up.
  const ticks = items.some((item) => 'checked' in item && item.checked !== undefined);
  const tick = (checked: boolean | undefined) =>
    (ticks || checked !== undefined) && (
      <span className="menu-check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
    );
  return (
    <ul className="menu" role="menu" aria-label={label} ref={box} style={at} onKeyDown={step} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        'separator' in item ? (
          <li key={i} role="separator" className="menu-sep" />
        ) : 'heading' in item ? (
          <li key={i} role="presentation" className="menu-heading">
            {item.heading}
          </li>
        ) : 'items' in item ? (
          <li key={i} role="none">
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub?.index === i}
              data-menu-index={i}
              disabled={item.disabled}
              className={sub?.index === i ? 'menu-open' : undefined}
              onClick={(e) => openSub(i, e.currentTarget, true)}
              onPointerEnter={(e) => {
                const el = e.currentTarget;
                window.clearTimeout(hover.current);
                hover.current = window.setTimeout(() => setSub({ index: i, from: el, focus: false }), 150);
              }}
            >
              <span>
                {tick(undefined)}
                {item.label}
              </span>
              <span className="menu-hint" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ) : (
          <li key={i} role="none">
            <button
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              className={item.danger ? 'menu-danger' : undefined}
              disabled={item.disabled}
              data-menu-index={i}
              onPointerEnter={() => {
                window.clearTimeout(hover.current);
                hover.current = window.setTimeout(() => setSub(null), 150);
              }}
              onClick={() => {
                restore();
                onClose();
                item.onPick();
              }}
            >
              <span>
                {tick(item.checked)}
                {item.icon}
                {item.label}
              </span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          </li>
        ),
      )}
      {sub && subItem && 'items' in subItem && (
        <SubMenu
          key={sub.index}
          items={subItem.items}
          label={subItem.label}
          from={sub.from}
          focus={sub.focus}
          onClose={onClose}
          restore={restore}
          onBack={() => {
            sub.from.focus();
            setSub(null);
          }}
        />
      )}
    </ul>
  );
}

function SubMenu({
  items,
  label,
  from,
  focus,
  onClose,
  onBack,
  restore,
}: {
  items: MenuItem[];
  label: string;
  from: HTMLElement;
  focus: boolean;
  onClose: () => void;
  onBack: () => void;
  restore: () => void;
}) {
  const r = from.getBoundingClientRect();
  const keep = useRef(document.activeElement as HTMLElement | null);
  // Opened by pointing, the submenu leaves the keyboard where it was.
  useLayoutEffect(() => {
    if (!focus) keep.current?.focus();
  }, [focus]);
  return (
    <li role="none" className="menu-sub">
      <Menu items={items} label={label} x={r.right - 4} y={r.top - 5} onClose={onClose} nested={{ from, onBack, restore }} />
    </li>
  );
}
