import { type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parentOf } from '../storage/adapter';
import { BOOKSHELF, childrenOf } from '../storage/book';
import { LABELS } from '../storage/document';
import { Icon } from '../ui/Icon';
import { type IconName } from '../ui/iconArt';
import { type MenuItem } from '../ui/Menu';
import { type Store, createStore, useStore } from '../ui/store';
import { CardFace, cardStyle, menuOf, sectionOfGroup } from './BoardCards';
import {
  ALIGNS,
  type Align,
  type Box,
  type BoardLine,
  type CardLook,
  ENDS,
  type Ends,
  ROUTES,
  type Route,
  SHAPES,
  type Shape,
  align,
  arrowHead,
  distribute,
  drawLine,
  fixedSize,
  lineId,
  radialLayout,
  snap,
  treeLayout,
} from './diagram';
import { type Form, type ModeHost } from './host';
import { type Group, type Item, readingOrder } from './model';
import { type BoardSetUp, type Spot, prefsStore, setPrefs } from './prefs';
import { Zoomer } from './shared';
import { fromTouch, menuPress } from '../mobile';
import { type Look, carryByTouch, dragFrom, scaleOf, usePanZoom } from './usePanZoom';

/** A card on a free board, and the room each takes when they are laid out in rows. */
export const CARD = { w: 224, h: 160, dx: 252, dy: 196, across: 6 };
/** The same for cards showing only their names. */
const NAME_CARD = { dx: 196, dy: 84 };
const SHAPE_ICON: Record<Shape, IconName> = { box: 'shapeBox', rounded: 'shapeRounded', oval: 'shapeOval', diamond: 'shapeDiamond' };
const ROUTE_ICON: Record<Route, IconName> = { straight: 'lineStraight', elbow: 'lineElbow', curved: 'lineCurved' };
const tintOf = (colour: string | undefined) => LABELS.find((l) => l.id === colour)?.color;
const NO_LOOKS: Record<string, CardLook> = {};
const NO_LINES: BoardLine[] = [];

/** What is chosen on the board: cards, or one line. */
interface Chosen {
  cards: string[];
  line: string | null;
}

interface Props {
  host: ModeHost;
  ask(form: Form): void;
  pantry: boolean;
  groups: Group[];
  items: Item[];
  ties: Map<string, number>;
  conf: BoardSetUp;
  set(change: Partial<BoardSetUp>): void;
  newHere(spot?: Spot): MenuItem[];
  tools: HTMLElement | null;
  /** The toolbar's first and last parts, which the grid board shows too: Grid or Free, and the count. */
  lead: ReactNode;
  tally: ReactNode;
}

/**
 * The free board: cards lie wherever they are put, on a surface with no edges. For a mindmap or
 * a flowchart, cards take shapes and colours, lines run between them, new cards grow out of the
 * chosen one, and the toolbar lays them out as a tree or a circle, or lines them up.
 *
 * The board is drawn again only when something is settled: a card let go in its new place, a
 * line drawn, a shape picked. Choosing a card, dragging one and drawing a line as it goes are
 * done straight on the page, so the board stays still under the pointer and costs nothing.
 */
export function FreeBoard({ host, ask, pantry, groups, items, ties, conf, set, newHere, tools, lead, tally }: Props) {
  const prefs = useStore(prefsStore);
  const name = pantry ? 'pboard' : 'board';
  const pan = usePanZoom();
  const looks = prefs.looks[name] ?? NO_LOOKS;
  const lines = prefs.lines[name] ?? NO_LINES;
  const byId = useMemo(() => new Map(items.map((i) => [i.card.id, i])), [items]);
  const layer = useRef<HTMLDivElement | null>(null);
  // The layer is moved and scaled by the pan itself, straight on the page, so moving the view never draws the board (usePanZoom).
  const layerRef = useCallback((n: HTMLDivElement | null) => {
    layer.current = n;
    pan.layer(n);
  }, []);
  // The board's cards use the app through this, so a change elsewhere in the app (another Item picked) doesn't redraw them.
  const hostNow = useRef(host);
  hostNow.current = host;
  const live = useMemo(() => new Proxy({} as ModeHost, { get: (_t, key) => hostNow.current[key as keyof ModeHost] }), []);

  // ---------- Where the cards lie, and how big they are ----------

  /** Where each card lies: where it was put, or its turn in rows, a new row for each Group. */
  const spots = useMemo(() => {
    const saved = prefs.spots[name] ?? {};
    const { dx, dy } = conf.cards === 'titles' ? NAME_CARD : CARD;
    const at = new Map<string, Spot>();
    let row = 0;
    for (const g of groups) {
      g.items.forEach((item, i) => at.set(item.card.id, saved[item.card.id] ?? [(i % CARD.across) * dx, (row + Math.floor(i / CARD.across)) * dy]));
      row += Math.max(1, Math.ceil(g.items.length / CARD.across));
    }
    return at;
  }, [groups, prefs.spots, name, conf.cards]);
  // Whole cards grow with their words, so each tells the board its height once it is drawn.
  const measured = useRef(new Map<string, [number, number]>());
  const [measures, setMeasures] = useState(0);
  const remeasure = useRef(0);
  useEffect(() => () => cancelAnimationFrame(remeasure.current), []);
  const shapeOf = (id: string): Shape => looks[id]?.shape ?? 'box';
  const sizeOf = (id: string): [number, number] => {
    const [w, h] = fixedSize(shapeOf(id), conf.cards);
    return [w, h ?? measured.current.get(id)?.[1] ?? CARD.h];
  };
  const boxOf = (id: string, dx = 0, dy = 0): Box => {
    const [x, y] = spots.get(id) ?? [0, 0];
    const [w, h] = sizeOf(id);
    return { x: x + dx, y: y + dy, w, h, shape: shapeOf(id) };
  };
  const bounds = (ids: string[] = items.map((i) => i.card.id)): [number, number, number, number] | null => {
    if (ids.length === 0) return null;
    const boxes = ids.map((id) => boxOf(id));
    return [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y)), Math.max(...boxes.map((b) => b.x + b.w)), Math.max(...boxes.map((b) => b.y + b.h))];
  };

  // ---------- What is chosen ----------

  const openId = host.path ? host.cards.get(host.path)?.id : undefined;
  const chosenStore = useMemo(() => createStore<Chosen>({ cards: openId && byId.has(openId) ? [openId] : [], line: null }), []);
  const choose = (cards: string[], line: string | null = null) => chosenStore.set({ cards, line });
  const chosenNow = () => chosenStore.get().cards.filter((id) => byId.has(id));
  // Picking an Item on the Shelf (or making a new one) chooses its card here too.
  useEffect(() => {
    if (openId && byId.has(openId) && !chosenStore.get().cards.includes(openId)) choose([openId]);
  }, [openId, byId]);
  /** Marks what is chosen straight on the page, without drawing the board again. */
  const paintChosen = () => {
    const el = layer.current;
    if (!el) return;
    const { cards, line } = chosenStore.get();
    const want = new Set([...cards.map((id) => `card:${id}`), ...(line ? [`line:${line}`] : [])]);
    el.querySelectorAll<HTMLElement | SVGElement>('[data-card], [data-line], [data-line-label]').forEach((n) => {
      const { card, line: l, lineLabel } = n.dataset;
      n.classList.toggle('chosen', want.has(card ? `card:${card}` : `line:${l ?? lineLabel}`));
    });
  };
  useEffect(() => chosenStore.subscribe(paintChosen), []);

  // ---------- Saving where cards go ----------

  const putMany = (moves: Map<string, Spot>) => setPrefs((now) => ({ spots: { ...now.spots, [name]: { ...(now.spots[name] ?? {}), ...Object.fromEntries(moves) } } }));
  const put = (id: string, spot: Spot) => putMany(new Map([[id, conf.snap ? snap(spot) : spot]]));
  /** Moves cards in one go, with Undo in the notice. */
  const arrange = (moves: Map<string, Spot>, said: string, fit = false) => {
    if (moves.size === 0) return;
    const before = prefsStore.get().spots[name] ?? {};
    putMany(moves);
    host.say(said, () => setPrefs((now) => ({ spots: { ...now.spots, [name]: before } })));
    if (fit) {
      const all = [...moves].map(([id, [x, y]]) => {
        const [w, h] = sizeOf(id);
        return [x, y, x + w, y + h];
      });
      pan.fit([Math.min(...all.map((b) => b[0]!)), Math.min(...all.map((b) => b[1]!)), Math.max(...all.map((b) => b[2]!)), Math.max(...all.map((b) => b[3]!))]);
    }
  };

  // ---------- Dragging, straight on the page until let go ----------

  /** Cards moved on the page during a drag, put back once the board has drawn them in their new places. */
  const settling = useRef<string[]>([]);
  const nodeOf = (sel: string) => layer.current?.querySelector<HTMLElement>(sel) ?? null;
  /** Shifts cards (and the lines touching them) by dx, dy on the page, without drawing the board. */
  const shiftOnPage = (ids: string[], dx: number, dy: number) => {
    const moving = new Set(ids);
    for (const id of ids) {
      const el = nodeOf(`[data-card="${id}"]`);
      if (!el) continue;
      el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
      el.classList.add('lifted');
    }
    for (const l of lines) {
      if (!moving.has(l.from) && !moving.has(l.to)) continue;
      const g = nodeOf(`[data-line="${l.id}"]`);
      if (!g) continue;
      const path = drawLine(moving.has(l.from) ? boxOf(l.from, dx, dy) : boxOf(l.from), moving.has(l.to) ? boxOf(l.to, dx, dy) : boxOf(l.to), l.route, conf.flow);
      g.querySelectorAll('path').forEach((p) => p.setAttribute('d', path.d));
      g.querySelector('[data-end="end"]')?.setAttribute('points', arrowHead(path.end, path.endDir));
      g.querySelector('[data-end="start"]')?.setAttribute('points', arrowHead(path.start, path.startDir));
      const label = nodeOf(`[data-line-label="${l.id}"]`);
      if (label) {
        label.style.left = `${path.mid[0]}px`;
        label.style.top = `${path.mid[1]}px`;
      }
    }
  };
  const putBackOnPage = (ids: string[]) => {
    for (const id of ids) {
      const el = nodeOf(`[data-card="${id}"]`);
      if (!el) continue;
      el.style.transform = '';
      el.classList.remove('lifted');
    }
  };

  const cardDown = (e: ReactPointerEvent<HTMLElement>, item: Item) => {
    if (e.button !== 0) return;
    const id = item.card.id;
    const chosen = chosenNow();
    if (e.shiftKey || e.metaKey || e.ctrlKey) return choose(chosen.includes(id) ? chosen.filter((s) => s !== id) : [...chosen, id]);
    const group = chosen.includes(id) && chosen.length > 1 ? chosen : [id];
    // Pointer pixels to board units: the view's zoom as it is now, and the interface's own (larger on a phone).
    const k = pan.live().k * scaleOf(e.currentTarget.closest('.free-board'));
    const [ox, oy] = spots.get(id)!;
    const delta = (dx: number, dy: number): Spot => {
      if (!conf.snap) return [Math.round(dx / k), Math.round(dy / k)];
      const [sx, sy] = snap([ox + dx / k, oy + dy / k]);
      return [sx - ox, sy - oy];
    };
    const tap = () => {
      choose([id]);
      if (item.path !== host.path) host.select(item.path);
    };
    const setDown = (mx: number, my: number) => {
      if (mx === 0 && my === 0) {
        putBackOnPage(group);
        shiftOnPage([], 0, 0);
        return;
      }
      settling.current = group;
      putMany(new Map(group.map((g) => [g, [spots.get(g)![0] + mx, spots.get(g)![1] + my]])));
    };
    /*
     * A finger is told apart by what it does first: moving at once moves the view (even from a card,
     * or from its synopsis while that isn't open for typing); resting lifts the card with a tap felt in
     * the hand, to be carried and set down; held and let go without moving opens its menu; a tap
     * picks it, or opens the synopsis for typing when it lands there.
     */
    if (e.pointerType === 'touch') {
      const field = (e.target as Element).closest('textarea, input, [contenteditable="true"]');
      if (field && field === document.activeElement) return;
      const card = e.currentTarget;
      return carryByTouch(e, pan, [0, 0], {
        onLift: (on) => card.classList.toggle('held', on),
        onMove: (at) => (at ? shiftOnPage(group, ...delta(at[0] * k, at[1] * k)) : (putBackOnPage(group), shiftOnPage([], 0, 0))),
        onDrop: (at) => setDown(...delta(at[0] * k, at[1] * k)),
        onMenu: (x, y) => menuAt(x, y, item),
        onTap: () => (field instanceof HTMLElement ? field.focus() : tap()),
      });
    }
    dragFrom(
      e,
      (dx, dy) => shiftOnPage(group, ...delta(dx, dy)),
      (did, up) => (did ? setDown(...delta(up.clientX - e.clientX, up.clientY - e.clientY)) : tap()),
    );
  };

  const ghost = useRef<SVGPathElement | null>(null);
  const handleDown = (e: ReactPointerEvent<HTMLElement>, item: Item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const id = item.card.id;
    const surface = e.currentTarget.closest('.free-board');
    dragFrom(
      e,
      (_dx, _dy, m) => {
        const [x, y] = pan.toBoard(m.clientX, m.clientY);
        surface?.classList.add('drawing-line');
        ghost.current?.setAttribute('d', drawLine(boxOf(id), { x, y, w: 0, h: 0, shape: 'box' }, 'straight').d);
      },
      (did, up) => {
        surface?.classList.remove('drawing-line');
        ghost.current?.setAttribute('d', '');
        if (!did) return;
        const over = (document.elementFromPoint(up.clientX, up.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-card]')?.dataset.card;
        if (over && over !== id) return join(id, over);
        // Let go on the bare board: a new card there, joined on.
        if (!over) {
          const [bx, by] = pan.toBoard(up.clientX, up.clientY);
          const [nw, nh] = newSize();
          grow(item, [Math.round(bx - nw / 2), Math.round(by - Math.min(nh, 60) / 2)], id);
        }
      },
    );
  };

  const marquee = useRef<HTMLDivElement | null>(null);
  const surfaceDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    if (!e.shiftKey) {
      // A click on the bare board lets go of what is chosen; a drag moves the view.
      const from = [e.clientX, e.clientY];
      const up = (u: PointerEvent) => {
        window.removeEventListener('pointerup', up);
        if (Math.hypot(u.clientX - from[0]!, u.clientY - from[1]!) < 4) choose([]);
      };
      window.addEventListener('pointerup', up);
      return pan.onPointerDown(e);
    }
    // Shift and drag draws a box, and every card it touches is chosen.
    const a = pan.toBoard(e.clientX, e.clientY);
    const before = chosenNow();
    const rect = (b: Spot) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as const;
    dragFrom(
      e,
      (_dx, _dy, m) => {
        const [l, t, r, b] = rect(pan.toBoard(m.clientX, m.clientY));
        const box = marquee.current;
        if (box) Object.assign(box.style, { display: 'block', left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
      },
      (_did, up) => {
        if (marquee.current) marquee.current.style.display = 'none';
        const [l, t, r, btm] = rect(pan.toBoard(up.clientX, up.clientY));
        const caught = items
          .map((i) => i.card.id)
          .filter((id) => {
            const x = boxOf(id);
            return x.x < r && x.x + x.w > l && x.y < btm && x.y + x.h > t;
          });
        choose([...new Set([...before, ...caught])]);
      },
    );
  };

  // ---------- Lines ----------

  const setLines = (change: (now: BoardLine[]) => BoardLine[]) => setPrefs((now) => ({ lines: { ...now.lines, [name]: change(now.lines[name] ?? []) } }));
  const join = (from: string, to: string) => {
    if (from === to) return;
    setLines((now) => (now.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from)) ? now : [...now, { id: lineId(), from, to, route: conf.route, ends: conf.ends }]));
  };
  const changeLine = (id: string, change: Partial<BoardLine>) => setLines((now) => now.map((l) => (l.id === id ? { ...l, ...change } : l)));
  const deleteLine = (id: string) => {
    const gone = lines.find((l) => l.id === id);
    if (!gone) return;
    setLines((now) => now.filter((l) => l.id !== id));
    choose([]);
    host.say('Deleted the line.', () => setLines((now) => [...now, gone]));
  };
  const labelLine = (l: BoardLine) =>
    ask({
      title: 'Label this line',
      note: 'A few words on the line, such as yes, no or leads to.',
      fields: [{ key: 'label', label: 'Label', value: l.label ?? '', placeholder: 'leads to', wide: true }],
      save: (v) => changeLine(l.id, { label: (v.label ?? '').trim() || undefined }),
    });
  /** How lines are drawn: the chosen line changes, and new lines are drawn the same way from then on. */
  const restyle = (change: { route?: Route; ends?: Ends }, target: BoardLine | null) => {
    if (target) changeLine(target.id, change);
    set(change);
  };
  const lineMenu = (target: BoardLine | null): MenuItem[] => {
    const route = target?.route ?? conf.route;
    const ends = target?.ends ?? conf.ends;
    return [
      { heading: target ? 'This line' : 'New lines' },
      ...ROUTES.map((r) => ({ label: r.name, icon: <Icon name={ROUTE_ICON[r.id]} size={15} />, checked: route === r.id, onPick: () => restyle({ route: r.id }, target) })),
      { separator: true },
      ...ENDS.map((e) => ({ label: e.name, checked: ends === e.id, onPick: () => restyle({ ends: e.id }, target) })),
      ...(target
        ? [
            { separator: true as const },
            { label: target.label ? 'Change label…' : 'Label…', onPick: () => labelLine(target) },
            { label: 'Turn around', onPick: () => changeLine(target.id, { from: target.to, to: target.from }) },
            { separator: true as const },
            { label: 'Delete line', danger: true, onPick: () => deleteLine(target.id) },
          ]
        : []),
    ];
  };
  const lineDown = (e: ReactPointerEvent<Element>, l: BoardLine) => {
    e.stopPropagation();
    if (e.button === 0) choose([], l.id);
  };
  const lineMenuAt = (e: ReactMouseEvent<Element>, l: BoardLine) => {
    e.preventDefault();
    e.stopPropagation();
    choose([], l.id);
    host.menu('Line', e.clientX, e.clientY, lineMenu(l));
  };

  // ---------- New cards that grow out of the chosen one ----------

  /** Which way a card's branches grow: down on a flowchart, across on a mindmap, or, before either, the way its own line comes in. */
  const flowsDown = (id: string) => {
    if (conf.flow !== 'auto') return conf.flow === 'down';
    const parent = lines.find((l) => l.to === id && byId.has(l.from))?.from;
    const [x, y] = spots.get(id)!;
    if (!parent) return lines.some((l) => l.from === id && byId.has(l.to) && spots.get(l.to)![1] - y > Math.abs(spots.get(l.to)![0] - x));
    const [px, py] = spots.get(parent)!;
    return y - py > Math.abs(x - px);
  };
  const newSize = (): [number, number] => {
    const [w, h] = fixedSize('box', conf.cards);
    return [w, h ?? CARD.h];
  };
  /** A new Item (or Pantry Item of the same kind) beside `from`, at `spot`, joined to `joinTo` when given. */
  const grow = (from: Item, spot: Spot, joinTo: string | null) => {
    const made = pantry ? host.newCard(sectionOfGroup(from.group)) : host.newItem(parentOf(from.path) || BOOKSHELF);
    void made.then((id) => {
      if (!id) return;
      put(id, spot);
      if (joinTo) join(joinTo, id);
      choose([id]);
    });
  };
  const kidsOf = (id: string) => lines.filter((l) => l.from === id && byId.has(l.to)).map((l) => l.to);
  const theOne = () => {
    const chosen = chosenNow();
    return chosen.length === 1 ? byId.get(chosen[0]!)! : null;
  };
  const addChild = () => {
    const one = theOne();
    if (!one) return;
    const id = one.card.id;
    const me = boxOf(id);
    const [w, h] = newSize();
    const kids = kidsOf(id).map((k) => boxOf(k));
    if (flowsDown(id)) {
      const x = kids.length ? Math.max(...kids.map((k) => k.x + k.w)) + 32 : me.x + me.w / 2 - w / 2;
      return grow(one, [Math.round(x), Math.round(me.y + me.h + 72)], id);
    }
    const y = kids.length ? Math.max(...kids.map((k) => k.y + k.h)) + 20 : me.y + me.h / 2 - h / 2;
    grow(one, [Math.round(me.x + me.w + 96), Math.round(y)], id);
  };
  const addSibling = () => {
    const one = theOne();
    if (!one) return;
    const id = one.card.id;
    const me = boxOf(id);
    const parent = lines.find((l) => l.to === id && byId.has(l.from))?.from ?? null;
    const fellows = (parent ? kidsOf(parent) : [id]).map((k) => boxOf(k));
    if (parent && flowsDown(id)) return grow(one, [Math.round(Math.max(...fellows.map((k) => k.x + k.w)) + 32), Math.round(me.y)], parent);
    grow(one, [Math.round(me.x), Math.round(Math.max(...fellows.map((k) => k.y + k.h)) + 20)], parent);
  };

  // ---------- Shapes and colours ----------

  const setLook = (ids: string[], change: CardLook) =>
    setPrefs((now) => {
      const mine = { ...(now.looks[name] ?? {}) };
      for (const id of ids) {
        const next = { ...mine[id], ...change };
        if (next.shape === 'box') delete next.shape;
        if (!next.colour) delete next.colour;
        if (next.shape || next.colour) mine[id] = next;
        else delete mine[id];
      }
      return { looks: { ...now.looks, [name]: mine } };
    });
  const shapeMenu = (ids: string[]): MenuItem[] => SHAPES.map((s) => ({ label: s.name, icon: <Icon name={SHAPE_ICON[s.id]} size={15} />, checked: ids.length > 0 && ids.every((id) => shapeOf(id) === s.id), onPick: () => setLook(ids, { shape: s.id }) }));
  const colourMenu = (ids: string[]): MenuItem[] => [
    { label: 'No colour', checked: ids.length > 0 && ids.every((id) => !looks[id]?.colour), onPick: () => setLook(ids, { colour: undefined }) },
    ...LABELS.map((l) => ({ label: l.name, icon: <span className="mode-dot" style={{ background: l.color }} />, checked: ids.length > 0 && ids.every((id) => looks[id]?.colour === l.id), onPick: () => setLook(ids, { colour: l.id }) })),
  ];
  const cardMenuAt = (e: ReactMouseEvent<HTMLElement>, item: Item) => {
    e.preventDefault();
    // A finger's long press is the card's own (cardDown): it lifts the card, and opens this menu only if it isn't carried.
    if (fromTouch(e)) return;
    menuAt(e.clientX, e.clientY, item);
  };
  const menuAt = (cx: number, cy: number, item: Item) => {
    const id = item.card.id;
    const chosen = chosenNow();
    const them = chosen.includes(id) ? chosen : [id];
    if (!chosen.includes(id)) choose([id]);
    host.menu('Item', cx, cy, menuOf({ host, ask, item, pantry, ties }, [{ label: 'Shape', items: shapeMenu(them) }, { label: 'Colour', items: colourMenu(them) }, { separator: true }]));
  };

  // ---------- Laying out ----------

  const ids = items.map((i) => i.card.id);
  const rows = () => {
    const before = prefsStore.get().spots[name] ?? {};
    setPrefs((now) => ({ spots: { ...now.spots, [name]: {} } }));
    host.say('Laid the cards out in rows.', () => setPrefs((now) => ({ spots: { ...now.spots, [name]: before } })));
  };
  const along = (how: 'across' | 'down' | 'radial') => {
    const joined = lines.some((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
    if (!joined) return host.say('Draw lines between cards first: the tree and the circle follow the lines.');
    const middle = chosenNow()[0];
    const at = (id: string) => spots.get(id) ?? ([0, 0] as Spot);
    const moves = how === 'radial' ? radialLayout(ids, lines, at, sizeOf, middle) : treeLayout(ids, lines, at, sizeOf, how === 'down', middle);
    // Cards with no lines that the new layout would cover move out of its way, into a row below it.
    const boxes = [...moves].map(([id, [x, y]]) => [x, y, x + sizeOf(id)[0], y + sizeOf(id)[1]] as const);
    const [l, t, r, b] = [Math.min(...boxes.map((x) => x[0])) - 24, Math.min(...boxes.map((x) => x[1])) - 24, Math.max(...boxes.map((x) => x[2])) + 24, Math.max(...boxes.map((x) => x[3])) + 24];
    let [nx, ny, rowH] = [l + 24, b + 48, 0];
    for (const id of ids) {
      if (moves.has(id)) continue;
      const [x, y] = at(id);
      const [w, h] = sizeOf(id);
      if (x > r || x + w < l || y > b || y + h < t) continue;
      if (nx + w > Math.max(r, l + 6 * (w + 24))) [nx, ny, rowH] = [l + 24, ny + rowH + 24, 0];
      moves.set(id, [Math.round(nx), Math.round(ny)]);
      nx += w + 24;
      rowH = Math.max(rowH, h);
    }
    set({ flow: how === 'radial' ? 'auto' : how });
    arrange(conf.snap ? new Map([...moves].map(([id, s]) => [id, snap(s)])) : moves, `Laid out ${moves.size} cards ${how === 'radial' ? 'in a circle' : 'as a tree'}.`, true);
  };
  const lineUp = (how: Align) => {
    const chosen = chosenNow();
    arrange(align(new Map(chosen.map((id) => [id, boxOf(id)])), how), `Lined up ${chosen.length} cards.`);
  };
  const spread = (down: boolean) => {
    const chosen = chosenNow();
    arrange(distribute(new Map(chosen.map((id) => [id, boxOf(id)])), down), `Spaced ${chosen.length} cards evenly.`);
  };
  /** The Shelf, put in the order the cards lie in on the free board, Group by Group. */
  const orderFromBoard = async () => {
    for (const g of groups) {
      const folder = g.path;
      const direct = g.items.filter((i) => parentOf(i.path) === folder);
      if (direct.length !== g.items.length || childrenOf(host.tree, BOOKSHELF, folder).length !== direct.length) continue;
      const ordered = readingOrder(direct, (i) => spots.get(i.card.id)!, conf.cards === 'titles' ? NAME_CARD.dy : CARD.dy);
      for (let n = 0; n < ordered.length; n++) if (ordered[n] !== direct[n]) await host.move(ordered[n]!.path, folder, n);
    }
  };
  const arrangeMenu = (): MenuItem[] => {
    const many = chosenNow().length;
    return [
      { heading: 'Along the lines' },
      { label: 'Tree, left to right', hint: 'Mindmap', onPick: () => along('across') },
      { label: 'Tree, top to bottom', hint: 'Flowchart', onPick: () => along('down') },
      { label: 'Circle around the chosen card', onPick: () => along('radial') },
      { label: 'Rows, as at first', onPick: rows },
      { separator: true },
      { label: 'Line up', disabled: many < 2, items: ALIGNS.map((a) => ({ label: a.name, onPick: () => lineUp(a.id) })) },
      { label: 'Space evenly across', disabled: many < 3, onPick: () => spread(false) },
      { label: 'Space evenly down', disabled: many < 3, onPick: () => spread(true) },
      ...(pantry ? [] : [{ separator: true as const }, { label: 'Put the Shelf in the board’s order', onPick: () => void orderFromBoard() }]),
    ];
  };
  const surfaceMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const [x, y] = pan.toBoard(e.clientX, e.clientY);
    const [w] = newSize();
    host.menu('Board', e.clientX, e.clientY, [
      ...newHere([Math.round(x - w / 2), Math.round(y - 20)]),
      { separator: true },
      { label: 'Choose all', disabled: ids.length === 0, onPick: () => choose(ids) },
      { label: 'Fit all', onPick: () => pan.fit(bounds()) },
      { label: 'Arrange', items: arrangeMenu() },
    ]);
  };

  // ---------- Keys ----------

  const onKey = (e: KeyboardEvent) => {
    const at = document.activeElement as HTMLElement | null;
    if (at && at !== document.body && !at.closest('.free-board')) return;
    if (at?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="menu"]') || e.altKey || e.metaKey || e.ctrlKey) return;
    const { line } = chosenStore.get();
    const one = theOne();
    if (e.key === 'Tab' && !e.shiftKey && one) {
      e.preventDefault();
      addChild();
    } else if (e.key === 'Enter' && !e.shiftKey && one) {
      e.preventDefault();
      addSibling();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && line) {
      e.preventDefault();
      deleteLine(line);
    } else if (e.key === 'Escape' && (chosenNow().length > 0 || line)) choose([]);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // What the drawn board calls back into. It is one object for the board's whole life, filled
  // in afresh on each render, so the drawn board never needs drawing again just to see new handlers.
  const act = useRef<Acts>(null as unknown as Acts);
  act.current = {
    cardDown,
    cardMenu: cardMenuAt,
    handleDown,
    lineDown,
    lineMenu: lineMenuAt,
    labelLine,
    surfaceDown,
    surfaceMenu,
    onSize: (id, w, h) => {
      const was = measured.current.get(id);
      if (was && was[0] === w && was[1] === h) return;
      measured.current.set(id, [w, h]);
      cancelAnimationFrame(remeasure.current);
      remeasure.current = requestAnimationFrame(() => setMeasures((n) => n + 1));
    },
    drawn: () => {
      // The board has drawn moved cards in their new places: the drag's shift can come off.
      putBackOnPage(settling.current);
      settling.current = [];
      paintChosen();
    },
  };

  const drawn = useMemo(
    () => lines.flatMap((l) => (byId.has(l.from) && byId.has(l.to) && l.from !== l.to ? [{ line: l, path: drawLine(boxOf(l.from), boxOf(l.to), l.route, conf.flow) }] : [])),
    [lines, byId, spots, looks, conf.cards, conf.flow, measures],
  );

  return (
    <>
      {tools &&
        createPortal(
          <BoardTools
            chosenStore={chosenStore}
            lead={lead}
            tally={tally}
            conf={conf}
            set={set}
            lines={lines}
            looks={looks}
            menu={(e, label, list) => {
              const box = e.currentTarget.getBoundingClientRect();
              host.menu(label, box.left, box.bottom + 4, list, e.currentTarget);
            }}
            shapeMenu={shapeMenu}
            colourMenu={colourMenu}
            lineMenu={lineMenu}
            arrangeMenu={arrangeMenu}
            addChild={addChild}
            addSibling={addSibling}
            zoom={<Zoomer k={pan.zoom} onZoom={pan.zoomStep} onFit={() => pan.fit(bounds())} />}
          />,
          tools,
        )}
      <Canvas
        act={act}
        host={live}
        ask={ask}
        pantry={pantry}
        items={items}
        ties={ties}
        spots={spots}
        looks={looks}
        drawn={drawn}
        cards={conf.cards}
        snapping={conf.snap}
        look={pan.look}
        size={pan.size}
        surface={pan.ref}
        layer={layerRef}
        ghost={ghost}
        marquee={marquee}
      />
    </>
  );
}

interface Acts {
  cardDown(e: ReactPointerEvent<HTMLElement>, item: Item): void;
  cardMenu(e: ReactMouseEvent<HTMLElement>, item: Item): void;
  handleDown(e: ReactPointerEvent<HTMLElement>, item: Item): void;
  lineDown(e: ReactPointerEvent<Element>, l: BoardLine): void;
  lineMenu(e: ReactMouseEvent<Element>, l: BoardLine): void;
  labelLine(l: BoardLine): void;
  surfaceDown(e: ReactPointerEvent<HTMLDivElement>): void;
  surfaceMenu(e: ReactMouseEvent<HTMLDivElement>): void;
  onSize(id: string, w: number, h: number): void;
  /** Called each time the board has been drawn. */
  drawn(): void;
}

interface CanvasProps {
  act: RefObject<Acts>;
  host: ModeHost;
  ask(form: Form): void;
  pantry: boolean;
  items: Item[];
  ties: Map<string, number>;
  spots: Map<string, Spot>;
  looks: Record<string, CardLook>;
  drawn: { line: BoardLine; path: ReturnType<typeof drawLine> }[];
  cards: BoardSetUp['cards'];
  snapping: boolean;
  look: Look;
  size: [number, number];
  surface(node: HTMLDivElement | null): void;
  layer(node: HTMLDivElement | null): void;
  ghost: RefObject<SVGPathElement | null>;
  marquee: RefObject<HTMLDivElement | null>;
}

/**
 * The drawn board: the surface, the lines and the cards. It is drawn again only when what it
 * shows has changed (where cards lie, their looks, the lines, the view), never because a card
 * was chosen or is being dragged, which are shown straight on the page.
 */
const Canvas = memo(function Canvas({ act, host, ask, pantry, items, ties, spots, looks, drawn, cards, snapping, look, size, surface, layer, ghost, marquee }: CanvasProps) {
  useLayoutEffect(() => act.current!.drawn());
  return (
    <div
      className={`free-board${snapping ? ' snapping' : ''}`}
      ref={surface}
      onPointerDown={(e) => act.current!.surfaceDown(e)}
      onContextMenu={(e) => act.current!.surfaceMenu(e)}
    >
      {/* Where the view is (the grid behind, the layer's transform) is written by the pan itself, so moving it draws nothing here. */}
      <div ref={layer} className="free-layer">
        <svg className="board-lines" width="1" height="1" aria-hidden="true">
          {drawn.map(({ line: l, path }) => (
            <g key={l.id} data-line={l.id} className="board-line">
              <path className="hit" d={path.d} onPointerDown={(e) => act.current!.lineDown(e, l)} onDoubleClick={() => act.current!.labelLine(l)} onContextMenu={(e) => act.current!.lineMenu(e, l)} />
              <path className="stroke" d={path.d} />
              {l.ends !== 'none' && <polygon data-end="end" points={arrowHead(path.end, path.endDir)} />}
              {l.ends === 'both' && <polygon data-end="start" points={arrowHead(path.start, path.startDir)} />}
            </g>
          ))}
          <path ref={ghost} className="board-drawing" d="" />
        </svg>
        {drawn.map(({ line: l, path }) =>
          l.label ? (
            <button
              key={l.id}
              data-line-label={l.id}
              className="board-line-label"
              style={{ left: path.mid[0], top: path.mid[1] }}
              onPointerDown={(e) => act.current!.lineDown(e, l)}
              onDoubleClick={() => act.current!.labelLine(l)}
              onContextMenu={(e) => act.current!.lineMenu(e, l)}
            >
              {l.label}
            </button>
          ) : null,
        )}
        {items.map((item) => {
          const id = item.card.id;
          const [x, y] = spots.get(id)!;
          const shape = looks[id]?.shape ?? 'box';
          const [w, fh] = fixedSize(shape, cards);
          const h = fh ?? CARD.h * 1.6;
          // Only the cards in sight are drawn, so a board of thousands moves as easily as one of ten. The board isn't drawn
          // again while the view moves, so a screen's worth on every side is drawn too, ready for a swipe or a pinch out.
          const [vw, vh] = [size[0] / look.k, size[1] / look.k];
          if (x + w < look.x - vw || y + h < look.y - vh || x > look.x + vw * 2 || y > look.y + vh * 2) return null;
          return <FreeCard key={id} act={act} host={host} ask={ask} item={item} pantry={pantry} ties={ties} x={x} y={y} shape={shape} titles={cards === 'titles'} tint={tintOf(looks[id]?.colour)} />;
        })}
        <div ref={marquee} className="board-marquee" style={{ display: 'none' }} />
      </div>
      {items.length === 0 && <p className="mode-empty">{pantry ? `The Pantry is empty. ${menuPress()} here for a new Character, Setting or Material.` : `Nothing on the Shelf yet. ${menuPress()} here for a new Item.`}</p>}
    </div>
  );
});

interface ToolsProps {
  chosenStore: Store<Chosen>;
  lead: ReactNode;
  tally: ReactNode;
  zoom: ReactNode;
  conf: BoardSetUp;
  set(change: Partial<BoardSetUp>): void;
  lines: BoardLine[];
  looks: Record<string, CardLook>;
  menu(e: ReactMouseEvent<HTMLButtonElement>, label: string, items: MenuItem[]): void;
  shapeMenu(ids: string[]): MenuItem[];
  colourMenu(ids: string[]): MenuItem[];
  lineMenu(target: BoardLine | null): MenuItem[];
  arrangeMenu(): MenuItem[];
  addChild(): void;
  addSibling(): void;
}

/** The free board's toolbar. It follows what is chosen on its own, so choosing a card redraws only the toolbar. */
function BoardTools({ chosenStore, lead, tally, zoom, conf, set, lines, looks, menu, shapeMenu, colourMenu, lineMenu, arrangeMenu, addChild, addSibling }: ToolsProps) {
  const { cards: chosen, line } = useStore(chosenStore);
  const chosenLine = lines.find((l) => l.id === line) ?? null;
  const none = chosen.length === 0;
  const one = chosen.length === 1;
  const firstShape = looks[chosen[0] ?? '']?.shape ?? 'box';
  const firstTint = chosen.length > 0 && chosen.every((id) => looks[id]?.colour === looks[chosen[0]!]?.colour) ? tintOf(looks[chosen[0]!]?.colour) : undefined;
  return (
    <>
      {lead}
      <label className="tb-select mode-pick">
        <select aria-label="Cards" title="Whole cards, or only their names" value={conf.cards} onChange={(e) => set({ cards: e.target.value as BoardSetUp['cards'] })}>
          <option value="full">Whole cards</option>
          <option value="titles">Names only</option>
        </select>
      </label>
      <span className="tb-sep" />
      <MenuButton label={none ? 'Shape (choose a card first)' : 'Shape of the chosen cards'} disabled={none} onOpen={(e) => menu(e, 'Shape', shapeMenu(chosen))}>
        <Icon name={SHAPE_ICON[firstShape]} size={17} />
      </MenuButton>
      <MenuButton label={none ? 'Colour (choose a card first)' : 'Colour of the chosen cards'} disabled={none} onOpen={(e) => menu(e, 'Colour', colourMenu(chosen))}>
        <span className={`board-swatch${firstTint ? '' : ' empty'}`} style={firstTint ? { background: firstTint } : undefined} />
      </MenuButton>
      <MenuButton label={chosenLine ? 'The chosen line' : 'How new lines are drawn'} onOpen={(e) => menu(e, 'Lines', lineMenu(chosenLine))}>
        <Icon name={ROUTE_ICON[chosenLine?.route ?? conf.route]} size={17} />
      </MenuButton>
      <span className="tb-sep" />
      <button className="mode-btn" title="Add a card joined on to the chosen one (Tab)" aria-label="Add a card joined on to the chosen one" disabled={!one} onClick={addChild}>
        <Icon name="addChild" size={17} />
      </button>
      <button className="mode-btn" title="Add a card beside the chosen one, from the same card (Enter)" aria-label="Add a card beside the chosen one" disabled={!one} onClick={addSibling}>
        <Icon name="addSibling" size={17} />
      </button>
      <MenuButton label="Arrange the cards" onOpen={(e) => menu(e, 'Arrange', arrangeMenu())}>
        <Icon name="arrange" size={17} />
      </MenuButton>
      <button className="mode-btn" title={conf.snap ? 'Snapping to the dots (click to stop)' : 'Snap cards to the dots'} aria-label="Snap to the dots" aria-pressed={conf.snap} onClick={() => set({ snap: !conf.snap })}>
        <Icon name="snap" size={17} />
      </button>
      <span className="tb-sep" />
      {zoom}
      {tally}
    </>
  );
}

/** A toolbar button that opens a menu below itself. */
function MenuButton({ label, disabled, onOpen, children }: { label: string; disabled?: boolean; onOpen(e: ReactMouseEvent<HTMLButtonElement>): void; children: ReactNode }) {
  return (
    <button className="mode-btn board-menu-btn" title={label} aria-label={label} aria-haspopup="menu" disabled={disabled} onClick={onOpen}>
      {children}
      <span className="board-caret" aria-hidden="true" />
    </button>
  );
}

interface FreeCardProps {
  act: RefObject<Acts>;
  host: ModeHost;
  ask(form: Form): void;
  item: Item;
  pantry: boolean;
  ties: Map<string, number>;
  x: number;
  y: number;
  shape: Shape;
  titles: boolean;
  tint: string | undefined;
}

const FreeCard = memo(function FreeCard(props: FreeCardProps) {
  const { act, host, item, x, y, shape, titles, tint } = props;
  const id = item.card.id;
  const [w, h] = fixedSize(shape, titles ? 'titles' : 'full');
  const el = useRef<HTMLElement | null>(null);
  // Tells the board how tall the card came out, for the lines and for laying out.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const tell = () => act.current!.onSize(id, node.offsetWidth, node.offsetHeight);
    tell();
    const watch = new ResizeObserver(tell);
    watch.observe(node);
    return () => watch.disconnect();
  }, [id]);
  const fit = shape === 'oval' || shape === 'diamond';
  return (
    <article
      ref={el}
      data-card={id}
      className={`prep-card free shape-${shape}${titles ? ' titles' : ''}${tint ? ' tinted' : ''}`}
      style={{ ...cardStyle(item), ...(tint ? { '--tint': tint } : {}), left: x, top: y, width: w, ...(h ? { height: h, minHeight: 0 } : {}) } as CSSProperties}
      onPointerDown={(e) => act.current!.cardDown(e, item)}
      onDoubleClick={() => host.open(item.path)}
      onContextMenu={(e) => act.current!.cardMenu(e, item)}
    >
      {shape === 'diamond' && (
        <svg className="card-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <CardFace host={host} ask={props.ask} item={item} pantry={props.pantry} ties={props.ties} fit={fit} titles={titles} />
      <span className="card-handle" title="Drag to another card to draw a line, or to a bare spot for a new card" onPointerDown={(e) => act.current!.handleDown(e, item)} />
    </article>
  );
});
