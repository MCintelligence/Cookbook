import { useEffect, useRef, useState } from 'react';
import { type TrashItem } from '../storage/trash';

interface Props {
  items: TrashItem[] | null;
  busy: boolean;
  onRestore: (name: string) => void;
  onDelete: (name: string) => void;
  onEmpty: () => void;
  onClose: () => void;
}

const when = (iso: string) => {
  if (!iso) return 'Some time ago';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  if (days < 1 && new Date().getDate() === d.getDate()) return `Today, ${time}`;
  if (days < 2) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

const titleOf = (item: TrashItem) => item.from.slice(item.from.lastIndexOf('/') + 1).replace(/\.md$/, '');
const placeOf = (item: TrashItem) => {
  const folders = item.from.split('/').slice(0, -1);
  return folders.map((f, i) => (i === 0 ? f[0]!.toUpperCase() + f.slice(1) : f)).join(' › ');
};

/** What was deleted, newest first. Each item can go back where it was or be deleted for good. */
export function TrashDialog({ items, busy, onRestore, onDelete, onEmpty, onClose }: Props) {
  // Deleting for good takes a second click on the same button.
  const [sure, setSure] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lib trash" role="dialog" aria-modal="true" aria-labelledby="trash-title" ref={box}>
        <div className="lib-head">
          <h2 id="trash-title">Trash</h2>
          <button className="lib-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {items === null ? (
          <p className="trash-empty">Looking…</p>
        ) : items.length === 0 ? (
          <p className="trash-empty">Nothing in the trash. Scenes and folders you delete wait here until you put them back or empty it.</p>
        ) : (
          <>
            <ul className="lib-list trash-list" aria-label="Deleted scenes and folders">
              {items.map((item) => (
                <li key={item.name}>
                  <div className="trash-item">
                    <span className="lib-book-title">
                      {item.kind === 'folder' && <span aria-hidden="true">▸ </span>}
                      {titleOf(item)}
                    </span>
                    <span className="lib-book-where">
                      {placeOf(item)} · {when(item.at)}
                    </span>
                  </div>
                  <button className="pill" disabled={busy} onClick={() => onRestore(item.name)}>
                    Put back
                  </button>
                  <button
                    className={`pill trash-forever${sure === item.name ? ' sure' : ''}`}
                    disabled={busy}
                    onBlur={() => setSure(null)}
                    onClick={() => (sure === item.name ? onDelete(item.name) : setSure(item.name))}
                  >
                    {sure === item.name ? 'Delete for good' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="lib-row">
              <button
                className={`pill trash-forever${sure === '*' ? ' sure' : ''}`}
                disabled={busy}
                onBlur={() => setSure(null)}
                onClick={() => (sure === '*' ? onEmpty() : setSure('*'))}
              >
                {sure === '*' ? `Delete all ${items.length} for good` : 'Empty trash'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
