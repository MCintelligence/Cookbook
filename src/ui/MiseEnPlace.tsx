import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSchema } from '@tiptap/core';
import { type Editor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { undoDepth } from '@tiptap/pm/history';
import { cookbookExtensions } from '../editor/extensions';
import { type NodeJSON, parseMarkdown } from '../editor/markdown';
import { type StorageAdapter } from '../storage/adapter';
import { type TreeNode, readDocument } from '../storage/book';
import { type CardSummary } from '../storage/index';
import { IS_MAC } from '../shortcuts';
import { SceneText, footnotesOf } from './SceneText';
import { estimatedHeight, itemBeside, miseEntries, miseItems } from './mise';

interface Props {
  fs: StorageAdapter;
  /** The Group being shown. */
  group: TreeNode;
  /** The Item being written in, which has the live editor; the others are drawn as text until clicked. */
  active: string | null;
  editor: Editor | null;
  cards: Map<string, CardSummary>;
  /** The page's own classes and size, so Mise en Place looks like any other page. */
  className: string;
  style: CSSProperties;
  /** The live editor for the active Item, with its footnotes and scene-break actions. */
  renderActive: () => ReactNode;
  /** Opens an Item for writing, in place. */
  onActivate: (path: string) => Promise<void> | void;
  /**
   * The first words typed into an empty Group: makes a new Item there, calls `made` with its path
   * just before opening it, and settles with the path, or null if it couldn't.
   */
  onStartWriting: (made: (path: string) => void) => Promise<string | null>;
  /** Undo in an Item that was just started and has nothing left to undo: takes the Item away again. */
  onDiscard: (path: string) => void;
  onPageMenu: (e: ReactMouseEvent) => void;
  onItemMenu: (path: string, x: number, y: number) => void;
}

interface Loaded {
  body: NodeJSON;
  notes: string[];
}

/** Where the cursor goes once an Item's editor is on screen. */
type Landing = { path: string; dx: number; dy: number } | { path: string; at: 'start' | 'end'; fresh?: boolean };

/**
 * Mise en Place: every Item in a Group as one page, under the names of the Groups inside it.
 *
 * Only the Item being written in has an editor, so saving, undo, Seasonings and the toolbar work
 * exactly as they do on a single page. The others are drawn as text, and only once they are
 * near the screen, so a long Group opens quickly. Clicking one moves the editor there, with the
 * cursor where the click was; the arrow keys at the edge of an Item go on into the next.
 *
 * Typing re-renders the app, so nothing here grows with the Group per keystroke: the other
 * Items are memoised elements, rebuilt only when one loads or the Shelf changes; one shared
 * observer watches for Items coming near; and no text is read, parsed or serialised while typing.
 */
export function MiseEnPlace(props: Props) {
  const { fs, group, active, editor, cards, onActivate } = props;
  const schema = useMemo(() => getSchema(cookbookExtensions((s) => s)), []);
  const entries = useMemo(() => miseEntries(group), [group]);
  const items = useMemo(() => miseItems(entries), [entries]);
  const [texts, setTexts] = useState<Map<string, Loaded>>(() => new Map());
  const loading = useRef(new Set<string>());
  const activeBox = useRef<HTMLElement>(null);
  const page = useRef<HTMLElement>(null);
  const landing = useRef<Landing | null>(null);
  /** The Item the page itself opened, so it isn't scrolled to as if picked on the Shelf. */
  const opened = useRef<string | null>(null);
  /** An Item started by typing into the empty Group, which Undo can take away again. */
  const fresh = useRef<string | null>(null);

  const keep = (path: string, loaded: Loaded) => setTexts((m) => new Map(m).set(path, loaded));

  // An Item moved away, renamed or put in the trash is forgotten, so a new one made with its
  // name later is read afresh rather than shown with the old one's words.
  useEffect(() => {
    const here = new Set(items);
    setTexts((m) => {
      if ([...m.keys()].every((p) => here.has(p))) return m;
      return new Map([...m].filter(([p]) => here.has(p)));
    });
  }, [items]);

  /** Reads an Item's text the first time it comes near the screen. */
  const want = (path: string) => {
    if (texts.has(path) || loading.current.has(path)) return;
    loading.current.add(path);
    readDocument(fs, path)
      .then((d) => {
        const body = parseMarkdown(d.body);
        keep(path, { body, notes: footnotesOf(body) });
      })
      .catch(() => keep(path, { body: { type: 'doc', content: [] }, notes: [] }))
      .finally(() => loading.current.delete(path));
  };

  // As the editor leaves an Item, its text as it stands is kept to draw in its place, so nothing
  // jumps and nothing is read back from the disk. Layout effects clean up before the editor is taken down.
  useLayoutEffect(() => {
    if (!editor || !active) return;
    let dom: Element | null = null;
    try {
      dom = editor.view.dom;
    } catch {
      return;
    }
    if (!activeBox.current?.contains(dom)) return;
    const left = active;
    return () => {
      try {
        const body = editor.state.doc.toJSON() as NodeJSON;
        keep(left, { body, notes: footnotesOf(body) });
      } catch {
        setTexts((m) => {
          const next = new Map(m);
          next.delete(left);
          return next;
        });
      }
    };
  }, [editor, active]);

  // Puts the cursor where the writer asked for it, once that Item's editor is on screen.
  useEffect(() => {
    const want = landing.current;
    if (!want || !editor || want.path !== active) return;
    let dom: Element | null = null;
    try {
      dom = editor.view.dom;
    } catch {
      return;
    }
    const box = activeBox.current;
    if (!box || !box.contains(dom)) return;
    landing.current = null;
    if ('dx' in want) {
      const r = box.getBoundingClientRect();
      const at = editor.view.posAtCoords({ left: r.left + want.dx, top: r.top + want.dy });
      editor.commands.focus(at ? at.pos : 'end', { scrollIntoView: false });
    } else {
      editor.commands.focus(want.at, { scrollIntoView: true });
      if (want.fresh) {
        // The words typed into the empty Group, read only now so none typed while the Item was
        // being made are lost, and put in as one step Undo can take back.
        const text = (blank.current?.textContent ?? '').replace(/\s+/g, ' ').trimStart();
        if (text) editor.commands.insertContent({ type: 'text', text });
        setStarting(null);
      }
    }
  }, [editor, active]);

  // Undo only takes away a new Item while it is still the one being written in.
  useEffect(() => {
    if (fresh.current && fresh.current !== active && starting === null) fresh.current = null;
  }, [active]);

  // An Item picked on the Shelf, or from Search, is scrolled to; the first one leaves the Group's name in view.
  useLayoutEffect(() => {
    if (!active) return;
    if (opened.current === active) {
      opened.current = null;
      return;
    }
    const desk = page.current?.closest('.desk');
    if (active === items[0]) desk?.scrollTo({ top: 0 });
    else activeBox.current?.scrollIntoView({ block: 'start' });
  }, [active]);

  const open = (path: string, land: Landing) => {
    landing.current = land;
    opened.current = path;
    if (path === active) {
      // Already open: only the cursor moves.
      landing.current = null;
      if (editor && 'at' in land) editor.commands.focus(land.at, { scrollIntoView: true });
      return;
    }
    void onActivate(path);
  };

  /** The arrow keys at the very start or end of an Item go on into the one before or after. */
  const crossing = (e: ReactKeyboardEvent) => {
    if (!editor || !active) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && fresh.current === active && undoDepth(editor.state) === 0 && editor.isEmpty) {
      e.preventDefault();
      e.stopPropagation();
      fresh.current = null;
      props.onDiscard(active);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const { state, view } = editor;
    const sel = state.selection;
    if (!sel.empty) return;
    let dir: -1 | 1 | 0 = 0;
    try {
      if (e.key === 'ArrowRight' && sel.head === Selection.atEnd(state.doc).head) dir = 1;
      else if (e.key === 'ArrowLeft' && sel.head === Selection.atStart(state.doc).head) dir = -1;
      // In the last (or first) block before measuring the line, which only the arrow keys pay for.
      else if (e.key === 'ArrowDown' && !Selection.findFrom(state.doc.resolve(sel.$head.after()), 1, true) && view.endOfTextblock('down')) dir = 1;
      else if (e.key === 'ArrowUp' && !Selection.findFrom(state.doc.resolve(sel.$head.before()), -1, true) && view.endOfTextblock('up')) dir = -1;
    } catch {
      return;
    }
    if (!dir) return;
    const to = itemBeside(items, active, dir);
    if (!to) return;
    e.preventDefault();
    open(to, { path: to, at: dir === 1 ? 'start' : 'end' });
  };

  // The empty Group: typing here starts its first Item.
  const blank = useRef<HTMLDivElement>(null);
  const making = useRef(false);
  /**
   * The Item being made from the words typed into the empty Group. The empty page stays, still
   * taking letters, until that Item's editor is ready to take them over.
   */
  const [starting, setStarting] = useState<string | null>(null);
  useEffect(() => {
    if (items.length === 0) blank.current?.focus({ preventScroll: true });
  }, [items.length === 0, group.path]);
  const start = async () => {
    const el = blank.current;
    if (making.current || starting || !el || !(el.textContent ?? '').trim()) return;
    making.current = true;
    const made = await props
      .onStartWriting((path) => {
        fresh.current = path;
        landing.current = { path, at: 'end', fresh: true };
        opened.current = path;
        setStarting(path);
      })
      .catch(() => null);
    making.current = false;
    // It couldn't be made, or its editor never came: the words stay on the empty page.
    if (!made) setStarting(null);
  };

  // What the other Items do when used, kept current so their memoised elements never go stale.
  const hands = useRef<Hands>(null!);
  hands.current = {
    want,
    pick: (p, land) => open(p, { path: p, ...land }),
    menu: (p, x, y) => props.onItemMenu(p, x, y),
  };

  // One observer for every Item still to load, a screen or two ahead of the scroll.
  const observer = useRef<IntersectionObserver | null>(null);
  const observe = useCallback((el: HTMLElement): (() => void) => {
    const p = el.dataset.path!;
    if (typeof IntersectionObserver === 'undefined') {
      hands.current.want(p);
      return () => {};
    }
    observer.current ??= new IntersectionObserver(
      (seen) => {
        for (const s of seen) {
          if (!s.isIntersecting) continue;
          observer.current?.unobserve(s.target);
          hands.current.want((s.target as HTMLElement).dataset.path!);
        }
      },
      { root: el.closest('.desk'), rootMargin: '1500px 0px' },
    );
    observer.current.observe(el);
    return () => observer.current?.unobserve(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  // Every row but the open Item's, built when the Shelf, the open Item or a loaded text changes,
  // not on every keystroke. The open Item's place is left empty and filled in below.
  const rows = useMemo(
    () =>
      entries.map((entry) => {
        if (entry.type === 'group') {
          return (
            <h2 key={entry.path} className={`ms-folder ms-depth-${Math.min(entry.depth, 2)}`}>
              {entry.name}
            </h2>
          );
        }
        if (entry.path === active || entry.path === starting) return null;
        const card = cards.get(entry.path);
        return (
          <ItemText
            key={entry.path}
            path={entry.path}
            title={card?.title ?? entry.name}
            loaded={texts.get(entry.path) ?? null}
            height={estimatedHeight(card?.words ?? 0)}
            schema={schema}
            hands={hands}
            observe={observe}
          />
        );
      }),
    [entries, active, starting, texts, cards, schema, observe],
  );
  const activeAt = useMemo(() => (active ? entries.findIndex((e) => e.path === active) : -1), [entries, active]);
  const activeTitle = active ? (cards.get(active)?.title ?? (activeAt >= 0 ? entries[activeAt]!.name : '')) : '';

  return (
    <article className={`${props.className} mise`} style={props.style} aria-label={`Mise en Place: ${group.name}`} ref={page}>
      {activeAt < 0
        ? rows
        : [
            ...rows.slice(0, activeAt),
            <section key={active!} className="mise-item is-active" aria-label={activeTitle} ref={activeBox} onKeyDownCapture={crossing} onContextMenu={props.onPageMenu}>
              <div className="mise-item-name">{activeTitle}</div>
              {props.renderActive()}
            </section>,
            ...rows.slice(activeAt + 1),
          ]}
      {(items.length === 0 || starting !== null) && (
        <div
          ref={blank}
          className="cb-prose mise-blank"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={`Write the first item in ${group.name}`}
          data-placeholder="Start writing, and a new item begins here."
          spellCheck={false}
          onInput={(e) => !(e.nativeEvent as InputEvent).isComposing && void start()}
          onCompositionEnd={() => void start()}
        />
      )}
    </article>
  );
}

interface Hands {
  want: (path: string) => void;
  pick: (path: string, land: { dx: number; dy: number } | { at: 'start' | 'end' }) => void;
  menu: (path: string, x: number, y: number) => void;
}

/**
 * An Item that isn't being written in: its text once it comes near the screen, and a click to
 * write in it. Memoised, so typing in another Item never draws it again.
 */
const ItemText = memo(function ItemText({
  path,
  title,
  loaded,
  height,
  schema,
  hands,
  observe,
}: {
  path: string;
  title: string;
  loaded: Loaded | null;
  height: number;
  schema: ReturnType<typeof getSchema>;
  hands: { current: Hands };
  observe: (el: HTMLElement) => () => void;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || loaded) return;
    return observe(el);
  }, [!!loaded, observe]);

  return (
    <section
      ref={box}
      data-path={path}
      className="mise-item"
      aria-label={title}
      tabIndex={0}
      aria-busy={loaded ? undefined : true}
      style={loaded ? undefined : { minHeight: height }}
      onClick={(e) => {
        // A selection being made with the mouse is left alone.
        if (window.getSelection()?.isCollapsed === false) return;
        const r = e.currentTarget.getBoundingClientRect();
        hands.current.pick(path, { dx: e.clientX - r.left, dy: e.clientY - r.top });
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          hands.current.pick(path, { at: 'start' });
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          hands.current.menu(path, r.left + 24, Math.max(r.top, 0) + 24);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        hands.current.menu(path, e.clientX, e.clientY);
      }}
    >
      <div className="mise-item-name">{title}</div>
      {loaded && <SceneText schema={schema} body={loaded.body} />}
      {loaded && loaded.notes.length > 0 && (
        <ol className="cb-page-notes">
          {loaded.notes.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
      )}
    </section>
  );
});
