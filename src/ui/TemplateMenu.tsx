import { useEffect, useRef, useState } from 'react';
import { type DocTemplate } from '../storage/templates';

/** The dashed "from template" button under the Bookshelf or Pantry, with its list. */
export function TemplateMenu({ label, templates, onPick }: { label: string; templates: DocTemplate[]; onPick: (t: DocTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tmpl" ref={box}>
      <button className="tmpl-button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {label}
      </button>
      {open && (
        <ul className="tmpl-menu" role="menu">
          {templates.map((t) => (
            <li key={t.id} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(t);
                }}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
