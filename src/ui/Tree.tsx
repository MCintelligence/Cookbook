import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { type TreeNode } from '../storage/book';
import { LABELS, STATUSES, isCard } from '../storage/document';
import { type CardSummary } from '../storage/index';
import { StatusIcon } from './StatusIcon';
import { placeAt } from './zoom';

interface Props {
  nodes: TreeNode[];
  /** The folder the tree was read from: "bookshelf" or "pantry". */
  root: string;
  selected: string | null;
  cards: Map<string, CardSummary>;
  /** Words in the open scene right now, ahead of the index. */
  live: { path: string; words: number } | null;
  /** Where to remember which folders are closed. */
  collapseKey: string;
  /** Folders that stay put, with the names to show for them: they can't be dragged or renamed. */
  locked?: Map<string, string>;
  /** The folder whose name is being edited. */
  renaming: string | null;
  onSelect: (path: string) => void;
  /** Moves `from` to `index` among what `folder` holds now. */
  onMove: (from: string, folder: string, index: number) => void;
  onStartRename: (path: string) => void;
  /** null when the writer cancels. */
  onRename: (path: string, title: string | null) => void;
  /** A right-click (or the menu key) on a row, with where to show the menu. */
  onMenu?: (node: TreeNode, x: number, y: number) => void;
  /** Delete or Backspace on a row. */
  onTrash?: (path: string) => void;
  /** The folder files dragged in from outside would land in. */
  dropTarget?: string | null;
  /** Recipes, by the path of the page they belong to: they are listed under it, in italics. */
  recipes?: Map<string, Recipe[]>;
  /** Shows a Pantry card's portrait beside its name. */
  loadPicture?: (path: string) => Promise<string>;
  /** Opens or closes every folder, or every one inside `under`. A new `at` asks again. */
  folding?: { open: boolean; under?: string; at: number } | null;
}

export interface Recipe {
  path: string;
  title: string;
}

type Where = 'before' | 'after' | 'inside';
interface Drop {
  /** The row the marker is drawn on, or null for the end of the list. */
  row: string | null;
  where: Where;
  folder: string;
  index: number;
}

const LONG_PRESS_MS = 400;
const fmt = (n: number) => n.toLocaleString('en');

function readCollapsed(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * The Shelf (or a Pantry group) as a compact list of pages in books. Drag a
 * page or book to reorder it or move it into another book; on a touch
 * screen, press and hold first. Alt+↑ and Alt+↓ move the focused one.
 */
export function Tree(props: Props) {
  const { nodes, root, cards, live, collapseKey, onMove } = props;
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapseKey));
  const [drag, setDrag] = useState<{ path: string; label: string; x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const justDragged = useRef(false);

  useEffect(() => setCollapsed(readCollapsed(collapseKey)), [collapseKey]);

  const remember = (next: Set<string>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(collapseKey, JSON.stringify([...next]));
    } catch {
      // Folders simply open again next time.
    }
  };
  const toggle = (path: string) => {
    const next = new Set(collapsed);
    if (!next.delete(path)) next.add(path);
    remember(next);
  };

  useEffect(() => {
    const f = props.folding;
    if (!f) return;
    const folders: string[] = [];
    const walk = (list: TreeNode[]) =>
      list.forEach((n) => {
        if (n.kind !== 'folder') return;
        if (!f.under || n.path === f.under || n.path.startsWith(f.under + '/')) folders.push(n.path);
        walk(n.children ?? []);
      });
    walk(nodes);
    const next = new Set(collapsed);
    for (const p of folders) {
      if (f.open) next.delete(p);
      // Collapsing "inside" a folder leaves that folder itself open.
      else if (p !== f.under) next.add(p);
    }
    remember(next);
  }, [props.folding?.at]);

  // Words per scene and folder, with the open scene counted as it is now. Pantry cards aren't counted.
  const words = useMemo(() => {
    const totals = new Map<string, number>();
    const count = (n: TreeNode): number => {
      const w =
        n.kind === 'file' ? (isCard(cards.get(n.path)?.kind) ? 0 : live?.path === n.path ? live.words : (cards.get(n.path)?.words ?? 0)) : (n.children ?? []).reduce((sum, c) => sum + count(c), 0);
      totals.set(n.path, w);
      return w;
    };
    nodes.forEach(count);
    return totals;
  }, [nodes, cards, live]);

  /** Where a drop at (x, y) would land, or null if nowhere sensible. */
  const target = (x: number, y: number, dragged: string): Drop | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tree-path]');
    let drop: Drop;
    if (!el || !list.current?.contains(el)) {
      const box = list.current?.getBoundingClientRect();
      if (!box || x < box.left || x > box.right || y < box.bottom - 4 || y > box.bottom + 48) return null;
      drop = { row: null, where: 'after', folder: root, index: nodes.length };
    } else {
      const { treePath: path, treeParent: parent, treeIndex, treeKind, treeCount, treeOpen } = el.dataset as Record<string, string>;
      const r = el.getBoundingClientRect();
      const f = (y - r.top) / r.height;
      const index = Number(treeIndex);
      if (treeKind === 'folder') {
        const where: Where = f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside';
        if (where === 'inside') drop = { row: path!, where, folder: path!, index: Number(treeCount) };
        // Just under an open folder's name is the top of that folder.
        else if (where === 'after' && treeOpen === 'true' && Number(treeCount) > 0) drop = { row: path!, where, folder: path!, index: 0 };
        else drop = { row: path!, where, folder: parent!, index: where === 'before' ? index : index + 1 };
      } else {
        const where: Where = f < 0.5 ? 'before' : 'after';
        drop = { row: path!, where, folder: parent!, index: where === 'before' ? index : index + 1 };
      }
    }
    if (drop.row === dragged || drop.folder === dragged || drop.folder.startsWith(dragged + '/')) return null;
    return drop;
  };

  const begin = (e: ReactPointerEvent, node: TreeNode, label: string) => {
    if (e.button !== 0 || props.renaming || props.locked?.has(node.path)) return;
    const touch = e.pointerType !== 'mouse';
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    // On a touch screen, a long press that ends without moving opens the row's menu instead of dragging.
    let moved = false;
    const scroller = list.current?.closest<HTMLElement>('.sidebar');

    const start = (x: number, y: number) => {
      active = true;
      setDrag({ path: node.path, label, x, y });
      navigator.vibrate?.(10);
    };
    const timer = touch ? window.setTimeout(() => start(x0, y0), LONG_PRESS_MS) : undefined;

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < (touch ? 8 : 4)) return;
        // On a touch screen, moving before the long press is a scroll.
        if (touch) return finish();
        start(ev.clientX, ev.clientY);
      }
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) >= 8) moved = true;
      setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY });
      setDrop(target(ev.clientX, ev.clientY, node.path));
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (ev.clientY < box.top + 40) scroller.scrollBy(0, -12);
        else if (ev.clientY > box.bottom - 40) scroller.scrollBy(0, 12);
      }
    };
    const up = (ev: PointerEvent) => {
      if (active && touch && !moved && props.onMenu) {
        finish();
        return props.onMenu(node, ev.clientX, ev.clientY);
      }
      const landed = active ? target(ev.clientX, ev.clientY, node.path) : null;
      finish();
      if (landed) onMove(node.path, landed.folder, landed.index);
    };
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish();
    const holdStill = (ev: TouchEvent) => active && ev.preventDefault();
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', holdStill);
      if (active) {
        // The click that ends a drag should not also open the scene.
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
      }
      setDrag(null);
      setDrop(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', holdStill, { passive: false });
  };

  const shared: Shared = { ...props, collapsed, toggle, words, drop, dragging: drag?.path ?? null, begin, justDragged };
  return (
    <>
      <ul className={`tree${drop?.row === null ? ' drop-end' : ''}`} role="tree" ref={list}>
        {nodes.map((n, i) => (
          <TreeItem key={n.path} node={n} parent={root} index={i} siblings={nodes.length} depth={0} {...shared} />
        ))}
      </ul>
      {drag && (
        <div className="tree-ghost" style={placeAt(list.current, { left: drag.x + 14, top: drag.y + 10 })} aria-hidden="true">
          {drag.label}
        </div>
      )}
    </>
  );
}

interface Shared extends Props {
  collapsed: Set<string>;
  toggle: (path: string) => void;
  words: Map<string, number>;
  drop: Drop | null;
  dragging: string | null;
  begin: (e: ReactPointerEvent, node: TreeNode, label: string) => void;
  justDragged: { current: boolean };
}

function TreeItem({ node, parent, index, siblings, depth, ...shared }: Shared & { node: TreeNode; parent: string; index: number; siblings: number; depth: number }) {
  const { selected, cards, collapsed, toggle, words, drop, dragging, begin, justDragged, renaming, locked, onSelect, onMove, onStartRename, onRename, onMenu, onTrash, dropTarget, recipes, loadPicture } = shared;
  const fixed = locked?.has(node.path) ?? false;
  const card = cards.get(node.path);
  const label = node.kind === 'file' ? (card?.title ?? node.name.replace(/\.md$/, '')) : (locked?.get(node.path) ?? node.name);
  const open = node.kind === 'folder' && !collapsed.has(node.path);
  const children = node.children ?? [];
  const marker = drop?.row === node.path ? ` drop-${drop.where}` : dropTarget === node.path ? ' drop-inside' : '';
  const total = words.get(node.path) ?? 0;

  const rowProps = {
    'data-tree-path': node.path,
    'data-tree-parent': parent,
    'data-tree-index': index,
    'data-tree-kind': node.kind,
    'data-tree-count': children.length,
    'data-tree-open': String(open),
    onPointerDown: (e: ReactPointerEvent) => begin(e, node, label),
    onContextMenu: (e: React.MouseEvent) => {
      if (!dragging && !onMenu) return;
      e.preventDefault();
      if (!dragging) onMenu?.(node, e.clientX, e.clientY);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
      if (plain && (e.key === 'Delete' || e.key === 'Backspace') && !fixed && onTrash) {
        e.preventDefault();
        return onTrash(node.path);
      }
      if (plain && !e.shiftKey && e.key === 'F2' && !fixed) {
        e.preventDefault();
        return onStartRename(node.path);
      }
      if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && onMenu) {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        return onMenu(node, r.left + 24, r.bottom - 4);
      }
      if (!e.altKey || fixed) return;
      if (e.key === 'ArrowUp' && index > 0) onMove(node.path, parent, index - 1);
      else if (e.key === 'ArrowDown' && index < siblings - 1) onMove(node.path, parent, index + 2);
      else return;
      e.preventDefault();
    },
  };

  if (node.kind === 'file') {
    const status = card?.kind === 'scene' ? STATUSES.find((s) => s.id === card.status)! : null;
    const colour = LABELS.find((l) => l.id === card?.label);
    const own = recipes?.get(node.path) ?? [];
    return (
      <li role="treeitem" aria-selected={selected === node.path} className={dragging === node.path ? 'is-dragging' : undefined}>
        {renaming === node.path ? (
          <FolderName name={label} onDone={(title) => onRename(node.path, title)} />
        ) : (
        <button
          {...rowProps}
          className={`tree-card${marker}${card?.skipExport ? ' no-export' : ''}`}
          onClick={() => !justDragged.current && onSelect(node.path)}
          onDoubleClick={() => !fixed && onStartRename(node.path)}
        >
          <span className="tree-card-top">
            {status && <StatusIcon status={status.id} />}
            {card && isCard(card.kind) && <CardIcon name={label} kind={card.kind} portrait={card.portrait} loadPicture={loadPicture} />}
            <span className="tree-card-title">{label}</span>
            {card?.skipExport && <span className="tree-flag">Not exported</span>}
            {colour && <span className="label-dot" style={{ background: colour.color }} title={`${colour.name} label`} aria-label={`${colour.name} label`} role="img" />}
            {total > 0 && <span className="tree-words">{fmt(total)}</span>}
          </span>
        </button>
        )}
        {own.length > 0 && (
          <ul className="tree tree-recipes" role="group" aria-label="Recipes">
            {own.map((r) => (
              <li role="treeitem" aria-selected={selected === r.path} key={r.path}>
                {renaming === r.path ? (
                  <FolderName name={cards.get(r.path)?.title ?? r.title} onDone={(title) => onRename(r.path, title)} />
                ) : (
                  <button
                    className="tree-recipe"
                    data-recipe-path={r.path}
                    onClick={() => onSelect(r.path)}
                    onDoubleClick={() => onStartRename(r.path)}
                    onContextMenu={(e) => {
                      if (!onMenu) return;
                      e.preventDefault();
                      onMenu({ name: r.title, path: r.path, kind: 'file' }, e.clientX, e.clientY);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'F2') {
                        e.preventDefault();
                        onStartRename(r.path);
                      } else if ((e.key === 'Delete' || e.key === 'Backspace') && onTrash) {
                        e.preventDefault();
                        onTrash(r.path);
                      }
                    }}
                  >
                    {cards.get(r.path)?.title ?? r.title}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li role="treeitem" aria-expanded={open} className={dragging === node.path ? 'is-dragging' : undefined}>
      {renaming === node.path ? (
        <FolderName name={node.name} onDone={(title) => onRename(node.path, title)} />
      ) : (
        <button
          {...rowProps}
          className={`tree-folder${marker}`}
          onClick={() => !justDragged.current && toggle(node.path)}
          onDoubleClick={() => !fixed && onStartRename(node.path)}
        >
          <span className="tree-folder-name">
            <span aria-hidden="true" className="chevron">
              {open ? '▾' : '▸'}
            </span>
            <span className="tree-card-title">{label}</span>
          </span>
          {total > 0 && <span className="tree-words">{fmt(total)}</span>}
        </button>
      )}
      {open && children.length > 0 && (
        <ul className="tree" role="group">
          {children.map((c, i) => (
            <TreeItem key={c.path} node={c} parent={node.path} index={i} siblings={children.length} depth={depth + 1} {...shared} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FolderName({ name, onDone }: { name: string; onDone: (title: string | null) => void }) {
  const [text, setText] = useState(name);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title && title.trim() ? title.trim() : null);
  };
  return (
    <input
      className="tree-rename"
      aria-label="Name"
      autoFocus
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(text);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}

/** A Pantry card's portrait, or its initial on a colour picked from its name: round for characters, square for the rest. */
function CardIcon({ name, kind, portrait, loadPicture }: { name: string; kind: string; portrait: string; loadPicture?: (path: string) => Promise<string> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!portrait || !loadPicture) return;
    let live = true;
    loadPicture(portrait).then(
      (u) => live && setUrl(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [portrait, loadPicture]);
  const hue = [...name].reduce((h, c) => (h * 31 + c.codePointAt(0)!) % 360, 7);
  const initial = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return (
    <span
      className={`card-icon${kind === 'character' ? '' : ' square'}`}
      style={url ? { backgroundImage: `url("${url}")` } : { background: `hsl(${hue} 38% 38%)` }}
      aria-hidden="true"
    >
      {url ? '' : initial}
    </span>
  );
}
