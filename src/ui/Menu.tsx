import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeAt } from './zoom';
import { isPhone, isTouch } from '../mobile';

export type MenuItem =
  | {
      label: string;
      onPick: () => void;
      disabled?: boolean;
      danger?: boolean;
      hint?: string;
      checked?: boolean;
      icon?: ReactNode;
      /** The shortcut as a binding ("Mod-Shift-F"), for the Mac's own menu bar. */
      binding?: string;
      /** In the Mac's own menu bar, the system's item of this kind stands in for this one. */
      native?: 'Undo' | 'Redo' | 'Cut' | 'Copy' | 'Paste' | 'SelectAll';
    }
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
  /**
   * The button that opened the menu. A press on it is left to its own click,
   * which closes the menu, rather than closing the menu here and letting the
   * click open it again.
   */
  opener?: HTMLElement | null;
}

/**
 * A small pop-up menu, for right-clicks and the book menu. Arrow keys move
 * between items, → and ← open and close submenus, Escape or a click
 * elsewhere closes it, and choosing an item closes it before the item runs.
 *
 * On a phone it is a sheet that rises from the bottom of the screen, within
 * reach of a thumb, with rows tall enough for one; a submenu takes the
 * sheet's place, with a way back at the top.
 */
export function Menu({ items: allItems, x, y, label: ownLabel, onClose, nested, onSide, opener }: Props) {
  const box = useRef<HTMLUListElement>(null);
  // Decided as the menu opens, so turning the phone with a menu up doesn't swap one kind for the other.
  const [sheet] = useState(() => !nested && isPhone());
  /** On a phone, the submenus opened so far; the last one is what the sheet shows. */
  const [drill, setDrill] = useState<{ label: string; items: MenuItem[] }[]>([]);
  const items = drill.length > 0 ? drill[drill.length - 1]!.items : allItems;
  const label = drill.length > 0 ? drill[drill.length - 1]!.label : ownLabel;
  const [at, setAt] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ index: number; from: HTMLElement; focus: boolean } | null>(null);
  const hover = useRef<number | undefined>(undefined);
  // Where the keyboard was before the menu opened, to go back to when it closes.
  const before = useRef<HTMLElement | null>(nested ? null : (document.activeElement as HTMLElement | null));
  const back = () => before.current?.isConnected && before.current.focus({ preventScroll: true });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (sheet) return void el.querySelector<HTMLElement>('li > button:not(:disabled)')?.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    let left = x;
    // A submenu that doesn't fit on the right opens on the left of its menu instead.
    if (nested && left + r.width > window.innerWidth - 8) left = nested.from.getBoundingClientRect().left - r.width + 4;
    setAt(placeAt(el.parentElement, { left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) }));
    el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [x, y, sheet, drill.length]);

  useEffect(() => {
    if (nested) return;
    // A sheet closes on a tap of the shade behind it (below), once the finger lifts, so the tap can't land on what was under it.
    const onDown = (e: PointerEvent) => !sheet && box.current && !box.current.contains(e.target as Node) && !opener?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // On a phone, Escape (the Back button) steps out of a submenu before it closes the sheet.
        if (sheet && drillNow.current > 0) return setDrill((d) => d.slice(0, -1));
        back();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    // A touch screen's keyboard sliding away resizes the window, and the app losing focus to the
    // system (a share sheet, the notification shade) is no reason to lose the menu.
    if (isTouch()) {
      return () => {
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('keydown', onKey);
      };
    }
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, nested, opener, sheet]);

  const drillNow = useRef(0);
  drillNow.current = drill.length;

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
    const item = items[index];
    if (sheet) return void (item && 'items' in item && setDrill((d) => [...d, { label: item.label, items: item.items }]));
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
  const list = (
    <ul className={sheet ? 'menu menu-sheet' : 'menu'} role="menu" aria-label={label} ref={box} style={sheet ? undefined : at} onKeyDown={step} onContextMenu={(e) => e.preventDefault()}>
      {sheet && (
        <li role="presentation" className="menu-sheet-head">
          {drill.length > 0 ? (
            <button className="menu-sheet-back" aria-label="Back" onClick={() => setDrill((d) => d.slice(0, -1))}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          ) : (
            <span className="menu-sheet-grip" aria-hidden="true" />
          )}
          <span className="menu-sheet-title">{label}</span>
        </li>
      )}
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
                if (sheet || e.pointerType === 'touch') return;
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
              onPointerEnter={(e) => {
                if (sheet || e.pointerType === 'touch') return;
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
      {!sheet && sub && subItem && 'items' in subItem && (
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
  if (!sheet) return list;
  return (
    <div className="menu-sheet-wrap">
      <div
        className="menu-sheet-shade"
        onClick={() => {
          back();
          onClose();
        }}
      />
      {list}
    </div>
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
