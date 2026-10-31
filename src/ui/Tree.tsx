import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { type Editor } from '@tiptap/react';
import { type TreeNode } from '../storage/book';
import { LABELS, STATUSES, isCard } from '../storage/document';
import { type CardSummary } from '../storage/index';
import { allPaths, between } from './selection';
import { StatusIcon } from './StatusIcon';
import { LiveWords } from './LiveCounts';
import { docWords } from '../editor/docStats';
import { altMove, pasteMove, placesOf, shownPaths } from './treeKeys';
import { placeAt } from './zoom';
import { IS_MAC } from '../shortcuts';

interface Props {
  nodes: TreeNode[];
  /** The folder the tree was read from: "bookshelf" or "pantry". */
  root: string;
  selected: string | null;
  cards: Map<string, CardSummary>;
  /** The open Item, whose words are counted from the editor as they are now, ahead of the index. */
  live: { path: string; editor: Editor | null } | null;
  /** Where to remember which folders are closed. */
  collapseKey: string;
  /** Folders that stay put, with the names to show for them: they can't be dragged or renamed. */
  locked?: Map<string, string>;
  /** The folder whose name is being edited. */
  renaming: string | null;
  onSelect: (path: string) => void;
  /** Moves `from` to `index` among what `folder` holds now; may settle with where it landed. */
  onMove: (from: string, folder: string, index: number) => void | Promise<string | undefined>;
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
  /** Rows picked for the toolbar and right-click menu: Ctrl or ⌘-click adds one, Shift-click a run. */
  marked?: Set<string>;
  onMark?: (marked: Set<string>) => void;
  /**
   * Opens a Group as Mise en Place: a click on its name, Enter or Space. Without it, a click opens
   * or closes the Group, as in the Pantry. The arrow always opens and closes it.
   */
  onOpenGroup?: (path: string) => void;
  /** The Group shown as Mise en Place, highlighted like the open Item. */
  shownGroup?: string | null;
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
const wordsTitle = (label: string, total: number) => (total > 0 ? `${label}: ${fmt(total)} ${total === 1 ? 'word' : 'words'}` : undefined);

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
 * screen, press and hold first.
 *
 * From the keyboard it is one Tab stop: ↑ and ↓ go between rows, Home and End
 * to the first and last, → opens a Group (then goes into it) and ← closes it
 * (or goes up to it). Alt+↑ and Alt+↓ move the row, past the edge of its Group
 * into the next; Mod+X then Mod+V on another row moves it there.
 */
export const Tree = memo(function Tree(props: Props) {
  const { nodes, root, cards, collapseKey, onMove } = props;
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapseKey));
  const [drag, setDrag] = useState<{ path: string; label: string; x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const justDragged = useRef(false);
  /** The row the keyboard was last on, which is the tree's one Tab stop. */
  const [cursor, setCursor] = useState<string | null>(null);
  /** A row cut with Mod+X, waiting for Mod+V. */
  const [cut, setCut] = useState<string | null>(null);
  // Worked out when the tree or its open Groups change, not on every keystroke in the page.
  const places = useMemo(() => placesOf(nodes, root), [nodes, root]);
  // Where a Shift-click run starts: the row last clicked without Shift.
  const anchor = useRef<string | null>(null);

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

  const tabStop = useMemo(() => {
    const shown = shownPaths(nodes, collapsed);
    if (cursor && shown.includes(cursor)) return cursor;
    if (props.selected && shown.includes(props.selected)) return props.selected;
    return shown[0] ?? null;
  }, [nodes, collapsed, cursor, props.selected]);

  useEffect(() => {
    if (cut && !places.has(cut)) setCut(null);
  }, [places]);

  const rowEl = (p: string) => list.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(p)}"]`) ?? null;
  const rows = () => [...(list.current?.querySelectorAll<HTMLElement>('button[data-tree-path], button[data-recipe-path]') ?? [])];
  const moveTo = (node: TreeNode, to: { folder: string; index: number }) => {
    // Where the row should land; the move itself says for certain, since a name taken in the new Group gets a number.
    const guess = to.folder === places.get(node.path)?.parent ? node.path : `${to.folder}/${node.name}`;
    // A closed Group opens, so the row can still be seen where it went.
    if (collapsed.has(to.folder)) {
      const next = new Set(collapsed);
      next.delete(to.folder);
      remember(next);
    }
    // Once the tree is drawn again with the row in its new place, the keyboard follows it there.
    void Promise.resolve(onMove(node.path, to.folder, to.index)).then((landed) => requestAnimationFrame(() => rowEl(landed ?? guess)?.focus()));
  };

  /** The tree's own keys on a row; true when one was used. */
  const navigate = (e: ReactKeyboardEvent, node: TreeNode, open: boolean, fixed: boolean): boolean => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    // The letter printed on the key, or its US place on a layout without Latin letters, as shortcuts.ts does.
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
    const all = rows();
    const here = all.indexOf(e.currentTarget as HTMLElement);
    const go = (el: HTMLElement | undefined | null) => {
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    };
    if (plain && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) go(all[here + (e.key === 'ArrowDown' ? 1 : -1)]);
    else if (plain && e.key === 'Home') go(all[0]);
    else if (plain && e.key === 'End') go(all[all.length - 1]);
    else if (plain && e.key === 'ArrowRight' && node.kind === 'folder') {
      if (!open) toggle(node.path);
      else if (node.children?.length) go(rowEl(node.children[0]!.path));
    } else if (plain && e.key === 'ArrowLeft') {
      if (node.kind === 'folder' && open) toggle(node.path);
      else {
        const parent = places.get(node.path)?.parent;
        if (parent && parent !== root) go(rowEl(parent));
      }
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (fixed) return true;
      const to = altMove(node, places, root, e.key === 'ArrowUp' ? -1 : 1);
      if (to) moveTo(node, to);
    } else if (mod && !e.altKey && !e.shiftKey && letter === 'x' && !fixed) setCut(node.path);
    else if (mod && !e.altKey && !e.shiftKey && letter === 'v' && cut) {
      const moving = places.get(cut);
      const to = pasteMove(cut, node, places);
      const from = moving && moving.siblings[moving.index];
      setCut(null);
      if (to && from) moveTo(from, to);
    } else if (e.key === 'Escape' && cut) setCut(null);
    else return false;
    return true;
  };

  // Words per Item and Group as last saved. Pantry cards aren't counted. The open Item's row
  // counts its own words as they are typed, and a Group adds them in when its count is shown.
  const words = useMemo(() => {
    const totals = new Map<string, number>();
    const count = (n: TreeNode): number => {
      const w = n.kind === 'file' ? (isCard(cards.get(n.path)?.kind) ? 0 : (cards.get(n.path)?.words ?? 0)) : (n.children ?? []).reduce((sum, c) => sum + count(c), 0);
      totals.set(n.path, w);
      return w;
    };
    nodes.forEach(count);
    return totals;
  }, [nodes, cards]);

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

  /** A click with Ctrl, ⌘ or Shift only changes what is picked; a plain click picks the row and goes on to open it. */
  const mark = (e: React.MouseEvent | ReactKeyboardEvent, path: string): boolean => {
    const { marked, onMark } = props;
    if (!onMark || !marked) return false;
    if (e.shiftKey) {
      const shown = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-tree-path]') ?? []).map((el) => el.dataset.treePath!);
      onMark(new Set(between(shown, anchor.current, path)));
      return true;
    }
    anchor.current = path;
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(marked);
      if (!next.delete(path)) next.add(path);
      onMark(next);
      return true;
    }
    if (marked.size !== 1 || !marked.has(path)) onMark(new Set([path]));
    return false;
  };
  /** Ctrl or ⌘+A picks every Group and Item; Escape lets go of them. */
  const markKeys = (e: ReactKeyboardEvent) => {
    const { marked, onMark } = props;
    if (!onMark || !marked) return false;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
      onMark(new Set(allPaths(nodes)));
      return true;
    }
    if (e.key === 'Escape' && marked.size > 0) {
      onMark(new Set());
      return true;
    }
    return false;
  };

  const shared: Shared = { ...props, collapsed, toggle, words, drop, dragging: drag?.path ?? null, begin, justDragged, mark, markKeys, tabStop, cut, setCursor, navigate };
  return (
    <>
      <ul className={`tree${drop?.row === null ? ' drop-end' : ''}${(props.marked?.size ?? 0) > 1 ? ' has-many' : ''}`} role="tree" ref={list} aria-multiselectable={props.onMark ? true : undefined}>
        {nodes.map((n, i) => (
          <TreeItem key={n.path} node={n} parent={root} index={i} depth={0} {...shared} />
        ))}
      </ul>
      {drag && (
        <div className="tree-ghost" style={placeAt(list.current, { left: drag.x + 14, top: drag.y + 10 })} aria-hidden="true">
          {drag.label}
        </div>
      )}
    </>
  );
});

interface Shared extends Props {
  collapsed: Set<string>;
  toggle: (path: string) => void;
  words: Map<string, number>;
  drop: Drop | null;
  dragging: string | null;
  begin: (e: ReactPointerEvent, node: TreeNode, label: string) => void;
  justDragged: { current: boolean };
  mark: (e: React.MouseEvent | ReactKeyboardEvent, path: string) => boolean;
  markKeys: (e: ReactKeyboardEvent) => boolean;
  tabStop: string | null;
  cut: string | null;
  setCursor: (path: string) => void;
  navigate: (e: ReactKeyboardEvent, node: TreeNode, open: boolean, fixed: boolean) => boolean;
}

function TreeItem({ node, parent, index, depth, ...shared }: Shared & { node: TreeNode; parent: string; index: number; depth: number }) {
  const { selected, cards, live, collapsed, toggle, words, drop, dragging, begin, justDragged, renaming, locked, onSelect, onStartRename, onRename, onMenu, onTrash, dropTarget, recipes, loadPicture, marked, mark, markKeys, tabStop, cut, setCursor, navigate } = shared;
  const picked = marked?.has(node.path) ? ' is-marked' : '';
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
    tabIndex: tabStop === node.path ? 0 : -1,
    onFocus: () => setCursor(node.path),
    onPointerDown: (e: ReactPointerEvent) => begin(e, node, label),
    onContextMenu: (e: React.MouseEvent) => {
      if (!dragging && !onMenu) return;
      e.preventDefault();
      if (!dragging) onMenu?.(node, e.clientX, e.clientY);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (markKeys(e)) return e.preventDefault();
      // Space picks the row without opening it, as Ctrl or ⌘-click does.
      if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        return void mark(e, node.path);
      }
      if (navigate(e, node, open, fixed)) return e.preventDefault();
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
          className={`tree-card${marker}${picked}${card?.skipExport ? ' no-export' : ''}${cut === node.path ? ' is-cut' : ''}`}
          onClick={(e) => !justDragged.current && !mark(e, node.path) && onSelect(node.path)}
          onDoubleClick={() => !fixed && onStartRename(node.path)}
        >
          <span className="tree-card-top">
            {status && <StatusIcon status={status.id} />}
            {card && isCard(card.kind) && <CardIcon name={label} kind={card.kind} portrait={card.portrait} loadPicture={loadPicture} />}
            <span className="tree-card-title">{label}</span>
            {card?.skipExport && <span className="tree-flag">Not exported</span>}
            {colour && <span className="label-dot" style={{ background: colour.color }} title={`${colour.name} label`} aria-label={`${colour.name} label`} role="img" />}
            {live?.path === node.path ? <LiveWords editor={live.editor} saved={total} /> : total > 0 && <span className="tree-words">{fmt(total)}</span>}
          </span>
        </button>
        )}
        {own.length > 0 && (
          <ul className="tree tree-recipes" role="group" aria-label="Notes">
            {own.map((r) => (
              <li role="treeitem" aria-selected={selected === r.path} key={r.path}>
                {renaming === r.path ? (
                  <FolderName name={cards.get(r.path)?.title ?? r.title} onDone={(title) => onRename(r.path, title)} />
                ) : (
                  <button
                    className="tree-recipe"
                    tabIndex={-1}
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

  const shown = shared.shownGroup === node.path;
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={shared.onOpenGroup ? shown : undefined} className={dragging === node.path ? 'is-dragging' : undefined}>
      {renaming === node.path ? (
        <FolderName name={node.name} onDone={(title) => onRename(node.path, title)} />
      ) : (
        <button
          {...rowProps}
          className={`tree-folder${marker}${picked}${cut === node.path ? ' is-cut' : ''}${shown ? ' is-shown' : ''}`}
          // The Group's word count lives on hover; the end of the row is kept for the board icon.
          title={wordsTitle(label, total)}
          // The open Item's words as typed are added in as the pointer arrives, so typing never redraws the Shelf.
          onPointerEnter={(e) => {
            if (!live?.editor || !live.path.startsWith(node.path + '/')) return;
            const now = wordsTitle(label, total + docWords(live.editor.state.doc) - (words.get(live.path) ?? 0));
            if (now) e.currentTarget.title = now;
            else e.currentTarget.removeAttribute('title');
          }}
          onClick={(e) => {
            if (justDragged.current) return;
            // The arrow only opens and closes the Group, so it never takes the page away.
            if ((e.target as Element).closest('.chevron') || !shared.onOpenGroup) {
              if (!mark(e, node.path)) toggle(node.path);
              return;
            }
            if (!mark(e, node.path)) shared.onOpenGroup(node.path);
          }}
          onDoubleClick={(e) => !fixed && !(e.target as Element).closest('.chevron') && onStartRename(node.path)}
        >
          <span className="tree-folder-name">
            <span aria-hidden="true" className="chevron" title={open ? 'Close the group' : 'Open the group'}>
              {open ? '▾' : '▸'}
            </span>
            <span className="tree-card-title">{label}</span>
          </span>
        </button>
      )}
      {open && children.length > 0 && (
        <ul className="tree" role="group">
          {children.map((c, i) => (
            <TreeItem key={c.path} node={c} parent={node.path} index={i} depth={depth + 1} {...shared} />
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
