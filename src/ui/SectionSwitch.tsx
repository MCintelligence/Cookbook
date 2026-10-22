import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type Section = 'book' | 'pantry' | 'journal';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'book', label: 'Bookshelf' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'journal', label: 'Journal' },
];

/**
 * The sidebar's section label, which is also a switch. Closed, it shows the
 * current section's name in that section's place along the row (Bookshelf on
 * the left, Pantry in the middle, Journal on the right). Clicking it shows all
 * three; picking one folds the switch back into its label. Esc or a click
 * elsewhere closes it without changing anything.
 */
export function SectionSwitch({ value, onPick }: { value: Section; onPick: (s: Section) => void }) {
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const reopen = useRef(false);

  // Pantry folders centre on the Pantry label, which sits a little off the row's middle
  // because "Bookshelf" is longer than "Journal". The offset is shared with the rows below.
  useLayoutEffect(() => {
    const el = row.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const place = () => {
      const middle = el.children[1]?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (middle && r.width > 0) host.style.setProperty('--switch-centre', `${(middle.left + middle.right) / 2 - (r.left + r.right) / 2}px`);
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    return () => watch.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const onDown = (e: PointerEvent) => row.current && !row.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  useEffect(() => {
    // After a pick, the keyboard stays on the label.
    if (!open && reopen.current) row.current?.querySelector<HTMLElement>('button:not(.sw-ghost)')?.focus();
    reopen.current = false;
  }, [open]);

  const close = (pick?: Section) => {
    reopen.current = true;
    setOpen(false);
    if (pick && pick !== value) onPick(pick);
  };

  if (!open) {
    return (
      <div className="section-switch" ref={row}>
        {SECTIONS.map((s) =>
          s.id === value ? (
            <button key={s.id} aria-expanded="false" aria-haspopup="true" title="Switch between the Bookshelf, Pantry and Journal" onClick={() => setOpen(true)}>
              {s.label}
            </button>
          ) : (
            <button key={s.id} className="sw-ghost" tabIndex={-1} aria-hidden="true">
              {s.label}
            </button>
          ),
        )}
      </div>
    );
  }
  return (
    <div
      className="section-switch is-open"
      role="group"
      aria-label="Show"
      ref={row}
      onKeyDown={(e) => {
        const buttons = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}
    >
      {SECTIONS.map((s) => (
        <button key={s.id} aria-pressed={s.id === value} onClick={() => close(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
