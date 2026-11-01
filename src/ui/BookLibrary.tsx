import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  type BookLocation,
  type RecentBook,
  browserBooks,
  bookExists,
  canPickFolder,
  describeLocation,
  forgetBook,
  putBackBook,
  recentBooks,
  sameLocation,
  updateRecent,
} from '../storage/platform';
import { type UserTemplate } from '../storage/library';
import { Menu, type MenuItem } from './Menu';
import { NewRecipe, type NewRecipeChoice, SaveTemplate } from './NewRecipe';

interface Props {
  current: BookLocation | null;
  /** Set when the writer picked a folder that has no book in it yet. */
  adopting: BookLocation | null;
  error: string | null;
  busy: boolean;
  /** Changes when the open recipe's notes in the list were brought up to date. */
  version: number;
  /** Where a new recipe goes unless the writer picks a folder. */
  defaultWhere: string;
  /** Opens straight onto New Recipe. */
  startNew?: boolean;
  onOpen: (location: BookLocation) => void;
  onOpenFolder: () => void;
  /** Opens Learn to Cook, making a fresh one if it was deleted. */
  onLearn: () => void;
  onCreate: (choice: NewRecipeChoice) => void;
  onAdopt: (location: BookLocation) => void;
  onCancelAdopt: () => void;
  onClose: () => void;
  onRename: (location: BookLocation, title: string) => Promise<void>;
  onDuplicate: (location: BookLocation, title: string) => void;
  onLocate: (location: BookLocation) => void;
  onDeleteForGood: (location: BookLocation) => Promise<void>;
  onSaveTemplate: (location: BookLocation, name: string, group: string, keepText: boolean) => Promise<UserTemplate>;
  onEditTemplate: (template: UserTemplate) => void;
  /** Menu items that only work on the open book, such as exporting it. */
  openBookItems?: MenuItem[];
}

type View = 'recent' | 'all' | 'favourites' | 'archived' | 'trash' | `series:${string}`;
type Sort = 'edited' | 'name' | 'words';
type Shown = RecentBook & { key: string };

const RECENT_COUNT = 12;
const PREFS_KEY = 'cookbook.recipesView';
const keyOf = (l: BookLocation) => JSON.stringify(l);

function loadPrefs(): { grid: boolean; sort: Sort } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { grid?: boolean; sort?: Sort };
    return { grid: p.grid !== false, sort: p.sort === 'name' || p.sort === 'words' ? p.sort : 'edited' };
  } catch {
    return { grid: true, sort: 'edited' };
  }
}

const words = (n: number) => n.toLocaleString();

/** "2 hours ago", "Yesterday", "12 Oct": short enough for a card. */
export function editedLabel(at: number | undefined, now = Date.now()): string {
  if (!at) return 'Not opened here yet';
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  const day = new Date(at);
  const today = new Date(now);
  if (hours < 24 && day.getDate() === today.getDate()) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(day.toDateString()).getTime()) / 86_400_000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(day.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
}

/** "Yesterday" inside a sentence; dates keep their own capitals. */
const inSentence = (label: string) => (label === 'Yesterday' || label === 'Just now' ? label.toLowerCase() : label);

const percent = (b: RecentBook) => (b.goal && b.words !== undefined ? Math.min(100, Math.round((b.words / b.goal) * 100)) : null);
const seriesLine = (b: RecentBook) => (b.series ? `${b.series}${b.seriesNumber ? ` · Book ${b.seriesNumber}` : ''}` : '');

const Icon = {
  recent: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3l2 1.5" strokeLinecap="round" />
    </svg>
  ),
  all: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 2.5h3.5a1 1 0 0 1 1 1v8a1 1 0 0 0-1-1H2.5zM11.5 2.5H8a1 1 0 0 0-1 1v8a1 1 0 0 1 1-1h3.5z" />
    </svg>
  ),
  star: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 1.8 1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 10l-3.2 1.7.6-3.6L1.8 5.6l3.6-.5z" />
    </svg>
  ),
  starOn: (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-label="Favourite">
      <path d="m7 1.8 1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 10l-3.2 1.7.6-3.6L1.8 5.6l3.6-.5z" />
    </svg>
  ),
  archive: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="3" rx=".6" />
      <path d="M2.5 5.5v6h9v-6M5.5 8h3" strokeLinecap="round" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3.5h10M5.5 3.5V2h3v1.5M3.2 3.5l.6 8.5h6.4l.6-8.5" />
    </svg>
  ),
  series: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="2.6" height="10" rx=".5" />
      <rect x="5.7" y="2" width="2.6" height="10" rx=".5" />
      <path d="m9.6 2.6 2.4-.6 1.6 9.4-2.4.6z" />
    </svg>
  ),
  more: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="7" r="1.25" />
      <circle cx="7" cy="7" r="1.25" />
      <circle cx="11" cy="7" r="1.25" />
    </svg>
  ),
  warn: (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 1.8 12.6 12H1.4z" />
      <path d="M7 5.6v3M7 10.2v.1" />
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  pot: (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8c0 3-2 3-2 6M24 6c0 3-2 3-2 6M30 8c0 3-2 3-2 6" />
      <path d="M8 22h32v12a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z" />
      <path d="M8 26H4M40 26h4M6 22h36" />
    </svg>
  ),
};

/** Your Recipes: every recipe the writer has opened, as cards or a list, with New Recipe and the writer's templates. */
export function BookLibrary(props: Props) {
  const { current, adopting, error, busy, version, onOpen, onOpenFolder, onLearn, onAdopt, onCancelAdopt, onClose, openBookItems = [] } = props;
  const [books, setBooks] = useState<RecentBook[]>(recentBooks);
  const [inBrowser, setInBrowser] = useState<string[]>([]);
  const [view, setView] = useState<View>('recent');
  const [{ grid, sort }, setPrefs] = useState(loadPrefs);
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ label: string; x: number; y: number; items: MenuItem[] } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [peek, setPeek] = useState<{ key: string; left: number; top: number } | null>(null);
  const [making, setMaking] = useState(!!props.startNew);
  const [savingTemplate, setSavingTemplate] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const checked = useRef(new Set<string>());
  const mounted = useRef(true);
  const hover = useRef<number | undefined>(undefined);

  const reload = () => setBooks(recentBooks());
  useEffect(reload, [version]);
  useEffect(() => {
    browserBooks().then(setInBrowser, () => setInBrowser([]));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ grid, sort }));
    } catch {
      // Only a preference.
    }
  }, [grid, sort]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!making) box.current?.querySelector<HTMLElement>('.recipes-search input')?.focus();
  }, [making]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes a menu or the window on top first, and Your Recipes only after.
      if (e.key === 'Escape' && !document.querySelector('.menu') && !making && !savingTemplate && renaming === null) onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !making) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, making, savingTemplate, renaming]);

  const all: Shown[] = useMemo(() => {
    const listed = books.map((b) => ({ ...b, key: keyOf(b.location) }));
    // Recipes in the browser's storage that were never opened from the list still show.
    const extra = inBrowser
      .filter((name) => !books.some((b) => sameLocation(b.location, { kind: 'browser', name })))
      .map((name) => ({ location: { kind: 'browser', name } as BookLocation, title: name, key: keyOf({ kind: 'browser', name }) }));
    return [...listed, ...extra];
  }, [books, inBrowser]);

  const live = all.filter((b) => !b.trashed);
  const series = [...new Set(live.map((b) => b.series).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));
  const isOpen = (b: Shown) => current !== null && sameLocation(b.location, current);

  const shown = useMemo(() => {
    let list: Shown[];
    if (view === 'trash') list = all.filter((b) => b.trashed);
    else if (view === 'recent') list = live.filter((b) => !b.archived).slice(0, RECENT_COUNT);
    else if (view === 'all') list = live;
    else if (view === 'favourites') list = live.filter((b) => b.favourite);
    else if (view === 'archived') list = live.filter((b) => b.archived);
    else list = live.filter((b) => b.series === view.slice(7)).sort((a, b) => (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((b) => `${b.title} ${b.series ?? ''}`.toLowerCase().includes(q));
    if (view.startsWith('series:') && !q) return list;
    const order = new Map(all.map((b, i) => [b.key, i]));
    const by: Record<Sort, (a: Shown, b: Shown) => number> = {
      edited: (a, b) => (b.edited ?? 0) - (a.edited ?? 0) || order.get(a.key)! - order.get(b.key)!,
      name: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
      words: (a, b) => (b.words ?? -1) - (a.words ?? -1),
    };
    return [...list].sort(by[sort]);
    // `live` is derived from `all`.
  }, [all, view, query, sort]);

  // Only the recipes on screen are checked, once each, so a long list costs nothing until it is looked at.
  useEffect(() => {
    const todo = shown.filter((b) => !checked.current.has(b.key) && !isOpen(b));
    if (todo.length === 0) return;
    for (const b of todo) checked.current.add(b.key);
    void Promise.all(todo.map(async (b) => [b.key, await bookExists(b.location)] as const)).then((results) => {
      const gone = results.filter(([, ok]) => !ok).map(([k]) => k);
      if (gone.length > 0 && mounted.current) setMissing((m) => new Set([...m, ...gone]));
    });
  }, [shown]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const change = (b: Shown, changes: Partial<RecentBook>, message?: string, undo?: Partial<RecentBook>) => {
    updateRecent(b.location, changes);
    reload();
    if (message) setToast({ text: message, undo: undo && (() => (updateRecent(b.location, undo), reload(), setToast(null))) });
  };

  const forget = (b: Shown) => {
    const kept = books.find((x) => sameLocation(x.location, b.location));
    forgetBook(b.location);
    reload();
    setToast({
      text: `“${b.title}” was taken off the list. Its folder is kept.`,
      undo: kept
        ? () => {
            putBackBook(kept);
            reload();
            setToast(null);
          }
        : undefined,
    });
  };

  const itemsFor = (b: Shown): MenuItem[] => {
    const open = isOpen(b);
    if (missing.has(b.key)) {
      return [
        { label: 'Locate…', onPick: () => props.onLocate(b.location), disabled: busy },
        { label: 'Remove from list', hint: 'Keeps the files', onPick: () => forget(b) },
      ];
    }
    if (b.trashed) {
      return [
        { label: 'Restore', onPick: () => change(b, { trashed: undefined }, `“${b.title}” is back.`) },
        { separator: true },
        {
          label: 'Delete for good',
          hint: b.location.kind === 'browser' ? 'Deletes its files' : 'The folder stays on disk',
          danger: true,
          onPick: () =>
            void props.onDeleteForGood(b.location).then(
              () => (reload(), browserBooks().then(setInBrowser, () => {}), setToast({ text: `“${b.title}” was deleted.` })),
              (e: unknown) => setToast({ text: e instanceof Error ? e.message : String(e) }),
            ),
        },
      ];
    }
    const path = b.location.kind === 'folder' ? b.location.path : null;
    return [
      { label: open ? 'Back to writing' : 'Open', hint: 'Enter', onPick: () => (open ? onClose() : onOpen(b.location)), disabled: busy && !open },
      { label: 'Rename', hint: 'F2', onPick: () => setRenaming(b.key) },
      { label: 'Duplicate', onPick: () => props.onDuplicate(b.location, b.title), disabled: busy },
      { label: b.favourite ? 'Remove from Favourites' : 'Add to Favourites', onPick: () => change(b, { favourite: !b.favourite || undefined }) },
      { label: 'Save as template…', onPick: () => setSavingTemplate(b) },
      { separator: true },
      ...(path
        ? [{ label: 'Copy folder path', onPick: () => void navigator.clipboard?.writeText(path).then(() => setToast({ text: 'Folder path copied.' }), () => {}) }]
        : []),
      ...(open ? openBookItems : []),
      b.archived
        ? { label: 'Unarchive', onPick: () => change(b, { archived: undefined }, `“${b.title}” is back in Recent.`) }
        : { label: 'Archive', onPick: () => change(b, { archived: true }, `“${b.title}” was archived.`, { archived: undefined }) },
      { separator: true },
      open
        ? { label: 'Delete', hint: 'Open another recipe first', disabled: true, onPick: () => {} }
        : { label: 'Delete', hint: 'Moves to Trash', danger: true, onPick: () => change(b, { trashed: Date.now() }, `“${b.title}” moved to Trash.`, { trashed: undefined }) },
    ];
  };

  const openMenu = (b: Shown, x: number, y: number) => {
    setPeek(null);
    setMenu({ label: b.title, x, y, items: itemsFor(b) });
  };

  const showPeek = (b: Shown, el: HTMLElement) => {
    window.clearTimeout(hover.current);
    if (!b.firstLines || !grid) return;
    hover.current = window.setTimeout(() => {
      const panel = box.current?.querySelector('.recipes-main')?.getBoundingClientRect();
      const card = el.getBoundingClientRect();
      if (!panel) return;
      setPeek({ key: b.key, left: Math.min(card.left - panel.left, panel.width - 296), top: card.bottom - panel.top + 6 });
    }, 500);
  };
  const hidePeek = () => {
    window.clearTimeout(hover.current);
    setPeek(null);
  };

  const rename = async (b: Shown, title: string) => {
    setRenaming(null);
    const next = title.trim();
    if (!next || next === b.title) return;
    try {
      await props.onRename(b.location, next);
      reload();
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : String(e) });
    }
  };

  const titleOf = (b: Shown) =>
    renaming === b.key ? (
      <input
        className="recipe-rename"
        defaultValue={b.title}
        aria-label="New title"
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') void rename(b, e.currentTarget.value);
          if (e.key === 'Escape') setRenaming(null);
        }}
        onBlur={(e) => void rename(b, e.currentTarget.value)}
      />
    ) : (
      <span className="recipe-title">{b.title}</span>
    );

  const activate = (b: Shown) => {
    if (renaming === b.key) return;
    if (missing.has(b.key) || b.trashed) return;
    if (isOpen(b)) onClose();
    else if (!busy) onOpen(b.location);
  };
  const rowKeys = (b: Shown) => (e: React.KeyboardEvent) => {
    if (renaming === b.key) return;
    if (e.key === 'Enter') activate(b);
    else if (e.key === 'F2' && !b.trashed) setRenaming(b.key);
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openMenu(b, r.left + 12, r.bottom);
    }
  };
  const moreButton = (b: Shown) => (
    <button
      className="icon-btn recipe-more"
      aria-label={`More for ${b.title}`}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        openMenu(b, r.right - 210, r.bottom + 4);
      }}
    >
      {Icon.more}
    </button>
  );
  const lost = (b: Shown) => (
    <>
      <span className="recipe-missing">{Icon.warn}Can’t find this recipe’s folder</span>
      <span className="recipe-path" title={describeLocation(b.location)}>
        {b.location.kind === 'browser' ? 'It was kept in this browser' : `Last seen in ${describeLocation(b.location)}`}
      </span>
    </>
  );

  const card = (b: Shown) => {
    const open = isOpen(b);
    const gone = missing.has(b.key);
    const p = percent(b);
    return (
      <li
        key={b.key}
        className={`recipe-card${open ? ' open' : ''}${gone ? ' missing' : ''}`}
        tabIndex={0}
        aria-current={open || undefined}
        onClick={() => activate(b)}
        onKeyDown={rowKeys(b)}
        onContextMenu={(e) => (e.preventDefault(), openMenu(b, e.clientX, e.clientY))}
        onMouseEnter={(e) => showPeek(b, e.currentTarget)}
        onMouseLeave={hidePeek}
      >
        <div className="recipe-top">
          {open && <span className="recipe-tag">Open</span>}
          {titleOf(b)}
          {b.favourite && <span className="recipe-star">{Icon.starOn}</span>}
          {moreButton(b)}
        </div>
        {gone ? (
          <>
            {lost(b)}
            <span className="recipe-actions">
              <button className="btn" onClick={(e) => (e.stopPropagation(), props.onLocate(b.location))} disabled={busy}>
                Locate…
              </button>
              <button className="text-link" onClick={(e) => (e.stopPropagation(), forget(b))}>
                Remove from list
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="recipe-series">{seriesLine(b) || ' '}</span>
            <span className="recipe-meta">
              <span>{b.trashed ? `Deleted ${inSentence(editedLabel(b.trashed))}` : b.edited ? `Edited ${inSentence(editedLabel(b.edited))}` : 'Not edited here yet'}</span>
              {b.words !== undefined && <span>{words(b.words)} words</span>}
            </span>
            {p !== null ? (
              <>
                <span className={`meter recipe-meter${p >= 100 ? ' done' : ''}`}>
                  <span style={{ width: `${p}%` }} />
                </span>
                <span className="recipe-goal">{p >= 100 ? `Goal reached · ${words(b.goal!)}` : `${p}% of ${words(b.goal!)}`}</span>
              </>
            ) : (
              <span className="recipe-goal recipe-nogoal">{b.words === undefined ? describeLocation(b.location) : 'No goal set'}</span>
            )}
          </>
        )}
      </li>
    );
  };

  const row = (b: Shown) => {
    const open = isOpen(b);
    const gone = missing.has(b.key);
    const p = percent(b);
    return (
      <tr
        key={b.key}
        className={`recipe-row${open ? ' open' : ''}${gone ? ' missing' : ''}`}
        tabIndex={0}
        aria-current={open || undefined}
        onClick={() => activate(b)}
        onKeyDown={rowKeys(b)}
        onContextMenu={(e) => (e.preventDefault(), openMenu(b, e.clientX, e.clientY))}
      >
        <td>
          <span className="recipe-row-title">
            {titleOf(b)}
            {b.favourite && <span className="recipe-star">{Icon.starOn}</span>}
            {open && <span className="recipe-tag">Open</span>}
          </span>
        </td>
        {gone ? (
          <>
            <td>
              <span className="recipe-missing">{Icon.warn}Can’t find this file</span>
            </td>
            <td colSpan={2} className="recipe-path" title={describeLocation(b.location)}>
              {describeLocation(b.location)}
            </td>
            <td>
              <button className="btn" onClick={(e) => (e.stopPropagation(), props.onLocate(b.location))} disabled={busy}>
                Locate…
              </button>
            </td>
          </>
        ) : (
          <>
            <td className="recipe-cell-series">{seriesLine(b) || '—'}</td>
            <td className="recipe-cell-muted">{b.trashed ? editedLabel(b.trashed) : editedLabel(b.edited)}</td>
            <td className="num">{b.words === undefined ? '—' : words(b.words)}</td>
            <td>
              {p === null ? (
                <span className="recipe-cell-muted">—</span>
              ) : (
                <span className="recipe-cell-goal">
                  <span className={`meter${p >= 100 ? ' done' : ''}`}>
                    <span style={{ width: `${p}%` }} />
                  </span>
                  <span>{p}%</span>
                </span>
              )}
            </td>
          </>
        )}
        <td>{moreButton(b)}</td>
      </tr>
    );
  };

  const viewName =
    view === 'recent' ? 'Recent' : view === 'all' ? 'All recipes' : view === 'favourites' ? 'Favourites' : view === 'archived' ? 'Archived' : view === 'trash' ? 'Trash' : view.slice(7);
  const navItem = (id: View, icon: ReactNode, label: string, count: number) => (
    <button key={id} className="recipes-nav-item" aria-current={view === id} onClick={() => setView(id)}>
      {icon}
      <span className="recipes-nav-label">{label}</span>
      {count > 0 && <span className="recipes-count">{count}</span>}
    </button>
  );
  const sortHead = (s: Sort, label: string, className = '') => (
    <th className={`${className}${sort === s ? ' sorted' : ''}`} aria-sort={sort === s ? (s === 'name' ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setPrefs((p) => ({ ...p, sort: s }))}>{label}</button>
    </th>
  );
  const peeked = peek && shown.find((b) => b.key === peek.key);
  const nothing = live.length === 0 && view !== 'trash';

  if (making) {
    return (
      <NewRecipe
        busy={busy}
        error={error}
        current={current}
        currentTitle={all.find(isOpen)?.title ?? null}
        defaultWhere={props.defaultWhere}
        onCreate={props.onCreate}
        onSaveTemplate={props.onSaveTemplate}
        onEditTemplate={props.onEditTemplate}
        onBack={() => (props.startNew ? onClose() : setMaking(false))}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lib recipes" role="dialog" aria-modal="true" aria-labelledby="lib-title" ref={box}>
        <div className="recipes-head">
          <h2 id="lib-title" className="panel-h">
            Your Recipes
          </h2>
          {!adopting && (
            <>
              <label className="panel-search recipes-search">
                {Icon.search}
                <input ref={search} type="search" placeholder="Search recipes" aria-label="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="tb-select recipes-sort">
                <span className="recipes-sort-label">Sort:</span>
                <select value={sort} onChange={(e) => setPrefs((p) => ({ ...p, sort: e.target.value as Sort }))} aria-label="Sort recipes">
                  <option value="edited">Last edited</option>
                  <option value="name">Name</option>
                  <option value="words">Word count</option>
                </select>
              </label>
              <div className="segmented recipes-views" role="tablist" aria-label="Show recipes as">
                <button role="tab" aria-selected={grid} onClick={() => setPrefs((p) => ({ ...p, grid: true }))}>
                  Grid
                </button>
                <button role="tab" aria-selected={!grid} onClick={() => setPrefs((p) => ({ ...p, grid: false }))}>
                  List
                </button>
              </div>
            </>
          )}
          <span className="recipes-spacer" />
          {!adopting && (
            <button className="btn btn-primary" onClick={() => setMaking(true)} disabled={busy}>
              + New Recipe
            </button>
          )}
          <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            {Icon.close}
          </button>
        </div>

        {error && (
          <p role="alert" className="lib-error recipes-error">
            {error}
          </p>
        )}

        {adopting ? (
          <div className="lib-adopt recipes-adopt">
            <p>
              <strong>{describeLocation(adopting)}</strong> isn’t a Cookbook recipe yet. Make it one? Cookbook adds <code>book.json</code>,{' '}
              <code>bookshelf/</code>, <code>pantry/</code> and a hidden <code>.cookbook/</code> folder. Nothing already in the folder is changed.
            </p>
            <div className="lib-row">
              <button className="btn" onClick={onCancelAdopt}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => onAdopt(adopting)}>
                Make it a recipe
              </button>
            </div>
          </div>
        ) : (
          <div className="recipes-body">
            <div className="recipes-main" onScroll={hidePeek}>
              {nothing ? (
                <div className="recipes-empty">
                  <span className="recipes-pot">{Icon.pot}</span>
                  <p className="recipes-empty-line">The kitchen’s ready when you are.</p>
                  <p className="recipes-empty-help">Start your first recipe from a template, or open a recipe’s folder you already have. New to Cookbook? Learn to Cook is a recipe that shows you round.</p>
                  <div className="lib-row">
                    <button className="btn btn-primary" onClick={() => setMaking(true)}>
                      New Recipe
                    </button>
                    {canPickFolder() && (
                      <button className="btn" onClick={onOpenFolder} disabled={busy}>
                        Open a recipe’s folder…
                      </button>
                    )}
                    <button className="btn" onClick={onLearn} disabled={busy}>
                      Learn to Cook
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="recipes-sub">
                    <span>
                      {viewName} · {shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}
                    </span>
                    <span>Right-click a recipe for more</span>
                  </div>
                  {shown.length === 0 ? (
                    <p className="panel-quiet">{query ? `No recipes match “${query.trim()}”.` : view === 'trash' ? 'Trash is empty.' : 'Nothing here yet.'}</p>
                  ) : grid ? (
                    <ul className="recipes-grid" aria-label={viewName}>
                      {shown.map(card)}
                    </ul>
                  ) : (
                    <table className="recipes-list" aria-label={viewName}>
                      <thead>
                        <tr>
                          {sortHead('name', 'Title')}
                          <th>Series</th>
                          {sortHead('edited', view === 'trash' ? 'Deleted' : 'Last edited')}
                          {sortHead('words', 'Words', 'num')}
                          <th>Goal</th>
                          <th aria-label="More" />
                        </tr>
                      </thead>
                      <tbody>{shown.map(row)}</tbody>
                    </table>
                  )}
                </>
              )}
              {peek && peeked?.firstLines && (
                <div className="recipes-peek" style={{ left: peek.left, top: peek.top }} role="tooltip">
                  <span className="sub-h">First lines</span>
                  <p>{peeked.firstLines}</p>
                </div>
              )}
            </div>
            <nav className="recipes-nav" aria-label="Recipe lists">
              <div className="sub-h">Recipes</div>
              {navItem('recent', Icon.recent, 'Recent', Math.min(RECENT_COUNT, live.filter((b) => !b.archived).length))}
              {navItem('all', Icon.all, 'All recipes', live.length)}
              {navItem('favourites', Icon.star, 'Favourites', live.filter((b) => b.favourite).length)}
              {navItem('archived', Icon.archive, 'Archived', live.filter((b) => b.archived).length)}
              {series.length > 0 && <div className="sub-h">Series</div>}
              {series.map((s) => navItem(`series:${s}`, Icon.series, s, live.filter((b) => b.series === s).length))}
              <div className="recipes-nav-gap" />
              {navItem('trash', Icon.trash, 'Trash', all.filter((b) => b.trashed).length)}
              {canPickFolder() && (
                <button className="text-link recipes-open-folder" onClick={onOpenFolder} disabled={busy}>
                  Open a recipe’s folder…
                </button>
              )}
              <p className="recipes-note">Trash keeps a recipe until you delete it for good. Nothing leaves this device.</p>
            </nav>
          </div>
        )}
        {toast && (
          <div className="recipes-toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button className="text-link" onClick={toast.undo}>
                Undo
              </button>
            )}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
              {Icon.close}
            </button>
          </div>
        )}
        {savingTemplate && (
          <SaveTemplate
            title={savingTemplate.title}
            onCancel={() => setSavingTemplate(null)}
            onSave={async (name, group, keepText) => {
              await props.onSaveTemplate(savingTemplate.location, name, group, keepText);
              setSavingTemplate(null);
              setToast({ text: `Saved “${name}” as a template. Find it in New Recipe.` });
            }}
          />
        )}
        {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}
