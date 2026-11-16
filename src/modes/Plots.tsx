import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fromTouch, haptic, menuPress, swallowClick } from '../mobile';
import { parentOf } from '../storage/adapter';
import { BOOKSHELF } from '../storage/book';
import { LABELS } from '../storage/document';
import { type StoryDate, dayNumber, daysInMonth, sayWhen, shifted } from '../storage/storyDate';
import { useStore } from '../ui/store';
import { usePhone } from '../ui/usePhone';
import { SHELF_DROP, type ShelfDrop, type ViewProps } from './host';
import { type Dated, type Item, datedOf, dayText, labelColor, pantryGroups, plotlineName, shelfGroups } from './model';
import { backSteps, fitPx, placeLane, sayStretch, stretchMarks, timeScale } from './plotTime';
import { MAX_PX, MIN_PX, prefsStore, setPrefs } from './prefs';
import { Face, Pick, Seg, Tally, ToolButton, datedMenu, whenField } from './shared';
import { dragFrom, scaleOf } from './usePanZoom';

/** The width of the lane names down the left, the height of the ruler, and of one row of a lane. */
const HEAD_WIDE = 168;
const HEAD_PHONE = 104;
const RULER = 44;
const ROW = 24;
const PAD = 7;
/** A single day's mark, and the least a stretch of days is drawn. */
const DOT = 12;
/** How long a finger rests on a mark before it lifts, and how far it can wander before that and still be resting (screen pixels). */
const LIFT_MS = 300;
const SLOP = 8;
/** How much further than what shows the ruler is drawn, and how far the view moves before it is drawn again. */
const BEYOND = 1600;
const REDRAW = 800;

interface Lane {
  id: string;
  title: string;
  color?: string;
  who?: Item;
  things: Dated[];
}

/** One thing on its lane, laid out. */
interface Spot {
  d: Dated;
  x: number;
  w: number;
  row: number;
  room: number | null;
  /** The middle of its mark's height, from the top of the sheet. */
  y: number;
}

const nameWidth = (title: string) => title.length * 6.7 + 8;

/**
 * Plots: every plotline a line through story time, with each dated Item a stop on it. It is the
 * Shelf's answer to the Pantry's Arcs: there a line for each Character across the Items, here a
 * line for each plotline across the days. Time runs left to right and, unlike the calendar's,
 * folds away where nothing happens, shows how long things last and how far apart they fall, and
 * can show the order of the telling against the order of events. Marks are dragged to other days
 * (and other plotlines) and stretched from their right edge.
 */
export function Plots({ host, tools, ask }: ViewProps) {
  const prefs = useStore(prefsStore);
  const HEAD = usePhone() ? HEAD_PHONE : HEAD_WIDE;
  const { lanes: by, px, fold, thread } = prefs.plots;
  const groups = useMemo(() => shelfGroups(host.tree, host.cards), [host.tree, host.cards]);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const dated = useMemo(() => datedOf(items, false), [items]);
  // Who is named where, read from the index when their lanes are asked for and when the writing changes: never while typing in Cook.
  const people = useMemo(() => (by === 'who' ? pantryGroups(host.pantryTree, host.cards).flatMap((g) => g.items).filter((i) => i.card.kind === 'character') : []), [by, host.pantryTree, host.cards]);
  const named = useMemo(() => new Map(people.map((p) => [p.card.id, new Set(host.mentions(p.card).map((m) => m.path))])), [people, host.indexVersion]);

  const lanes: Lane[] = useMemo(() => {
    if (by === 'group') return groups.filter((g) => g.items.length > 0).map((g) => ({ id: g.path, title: g.title, things: dated.filter((d) => d.group === g.path) }));
    if (by === 'who') return people.map((p) => ({ id: p.card.id, title: p.card.title, who: p, things: dated.filter((d) => named.get(p.card.id)?.has(d.path)) })).filter((l) => l.things.length > 0);
    const lines: Lane[] = LABELS.filter((l) => dated.some((d) => d.card.label === l.id) || prefs.plotlines[l.id] !== undefined).map((l) => ({ id: l.id, title: plotlineName(l.id, prefs.plotlines), color: l.color, things: dated.filter((d) => d.card.label === l.id) }));
    const loose = dated.filter((d) => !labelColor(d.card.label));
    return loose.length > 0 || lines.length === 0 ? [...lines, { id: '', title: 'No plotline', things: loose }] : lines;
  }, [by, groups, people, named, dated, prefs.plotlines]);

  const blank = useMemo<[number, number]>(() => {
    const now = new Date();
    const first = dayNumber({ y: now.getFullYear(), m: now.getMonth() + 1, d: 1 });
    return [first, first + daysInMonth(now.getFullYear(), now.getMonth() + 1) - 1];
  }, []);
  const spans = useMemo(() => dated.map((d): [number, number] => [d.first, d.last]), [dated]);
  const scale = useMemo(() => timeScale(spans, px, fold, blank), [spans, px, fold, blank]);

  // Each lane's rows, and where on the sheet everything lands.
  const { laid, tops, height } = useMemo(() => {
    let top = RULER;
    const tops: number[] = [];
    const laid = lanes.map((lane) => {
      const shapes = lane.things.map((d) => {
        const long = d.last > d.first;
        const w = long ? Math.max(scale.xOf(d.last + 1) - scale.xOf(d.first), DOT) : DOT;
        const x = long ? scale.xOf(d.first) : scale.xOf(d.first + 0.5) - DOT / 2;
        return { d, x, w };
      });
      const placed = placeLane(shapes.map((s) => ({ x0: s.x, x1: s.x + s.w, name: nameWidth(s.d.title) })));
      const rows = Math.max(1, ...placed.map((p) => p.row + 1));
      const spots: Spot[] = shapes.map((s, i) => ({ ...s, ...placed[i]!, y: top + PAD + placed[i]!.row * ROW + ROW / 2 }));
      tops.push(top);
      top += PAD * 2 + rows * ROW + 1;
      return spots;
    });
    return { laid, tops, height: top };
  }, [lanes, scale]);

  const main = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const now = useRef({ scale, px, tops, height, lanes, by });
  now.current = { scale, px, tops, height, lanes, by };

  /** Where a point of the window falls on the sheet's time, in its own pixels, whatever the zoom of the window. */
  const sheetX = (clientX: number) => (clientX - (sheet.current?.getBoundingClientRect().left ?? 0)) / scaleOf(main.current) - HEAD;
  const dayAt = (clientX: number) => Math.floor(now.current.scale.dayAt(sheetX(clientX)));
  const laneAt = (clientY: number): number | null => {
    const y = (clientY - (sheet.current?.getBoundingClientRect().top ?? 0)) / scaleOf(main.current);
    const { tops, height } = now.current;
    if (y < RULER || y >= height) return null;
    const after = tops.findIndex((t) => t > y);
    return (after === -1 ? tops.length : after) - 1;
  };

  // What shows, for the ruler to be drawn only round it: kept in steps, so scrolling draws nothing most of the time.
  const [view, setView] = useState({ from: 0, to: 2400 });
  useEffect(() => {
    const node = main.current;
    if (!node) return;
    const look = () => setView((v) => (Math.abs(node.scrollLeft - v.from) < REDRAW && node.scrollLeft + node.clientWidth <= v.to + REDRAW ? v : { from: node.scrollLeft, to: node.scrollLeft + node.clientWidth }));
    look();
    const watch = new ResizeObserver(look);
    watch.observe(node);
    node.addEventListener('scroll', look, { passive: true });
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Or the page behind would zoom as well.
      e.stopPropagation();
      zoomTo(now.current.px * Math.exp(-e.deltaY * 0.003), e.clientX);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      watch.disconnect();
      node.removeEventListener('scroll', look);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Closer or further keeps the day under the pointer (or in the middle) where it was.
  const keep = useRef<{ day: number; at: number } | null>(null);
  const zoomTo = (next: number, aboutClientX?: number) => {
    const node = main.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const about = aboutClientX ?? box.left + (HEAD * scaleOf(node) + box.width) / 2;
    keep.current = { day: now.current.scale.dayAt(sheetX(about)), at: (about - box.left) / scaleOf(node) };
    setPrefs((p) => ({ plots: { ...p.plots, px: Math.max(MIN_PX, Math.min(MAX_PX, next)) } }));
  };
  useLayoutEffect(() => {
    if (!keep.current || !main.current) return;
    main.current.scrollLeft = HEAD + scale.xOf(keep.current.day) - keep.current.at;
    keep.current = null;
  }, [scale]);
  const fit = () => {
    if (!main.current || spans.length === 0) return;
    setPrefs((p) => ({ plots: { ...p.plots, px: fitPx(spans, fold, main.current!.clientWidth - HEAD - 8, MIN_PX, MAX_PX) } }));
    main.current.scrollLeft = 0;
  };
  // Opens on the Item that is open, when it has a day.
  useLayoutEffect(() => {
    const node = main.current;
    const open = dated.find((d) => d.path === host.path);
    if (node && open) node.scrollLeft = Math.max(0, HEAD + scale.xOf(open.first) - node.clientWidth / 2);
  }, []);

  /**
   * A mark being moved or stretched is drawn by hand, on that mark alone: nothing else is drawn
   * again, and nothing shifts to make room, until it is set down. It keeps its borrowed place
   * until Plots is drawn with its new date (or, should that be slow to come, a moment).
   */
  const held = useRef<HTMLElement | null>(null);
  const letGo = (el: HTMLElement) => {
    el.style.transform = '';
    el.style.removeProperty('--w');
    delete el.dataset.lifted;
  };
  useLayoutEffect(() => {
    if (held.current) letGo(held.current);
    held.current = null;
  }, [dated]);

  /** Carries a mark from where the pointer took hold of it: along the days, and in plotline lanes from one line to another. */
  const carry = (el: HTMLElement, spot: Spot, lane: number, stretch: boolean, x0: number) => {
    const { d } = spot;
    const from = dayAt(x0);
    let days = 0;
    let to = lane;
    return {
      move(m: { clientX: number; clientY: number }): boolean {
        const { scale, tops, by } = now.current;
        const moved = stretch ? Math.max(dayAt(m.clientX) - from, d.first - d.last) : dayAt(m.clientX) - from;
        const over = stretch || by !== 'label' ? lane : (laneAt(m.clientY) ?? to);
        if (moved === days && over === to) return false;
        [days, to] = [moved, over];
        el.dataset.lifted = '';
        if (stretch) el.style.setProperty('--w', `${Math.max(scale.xOf(d.last + days + 1) - scale.xOf(d.first), DOT)}px`);
        else {
          const half = d.last > d.first ? 0 : 0.5;
          const dy = to === lane ? 0 : tops[to]! + PAD + ROW / 2 - spot.y;
          el.style.transform = `translate(${scale.xOf(d.first + days + half) - scale.xOf(d.first + half)}px, ${dy}px)`;
        }
        return true;
      },
      drop() {
        const line = to === lane ? undefined : now.current.lanes[to];
        if (days === 0 && !line) return letGo(el);
        held.current = el;
        window.setTimeout(() => held.current === el && (letGo(el), (held.current = null)), 1500);
        const date: StoryDate = stretch ? { ...d.date, to: d.last + days > d.first ? dayText(d.last + days) : undefined } : shifted(d.date, days);
        void (async () => {
          if (days !== 0) await host.setField(d.path, 'when', whenField(date));
          if (line) await host.setField(d.path, 'label', line.id || undefined);
        })();
      },
    };
  };

  /**
   * A finger on a mark, told apart by what it does in its first moments: a swipe is the view's (it
   * scrolls, as from anywhere else); resting LIFT_MS lifts the mark with a tap felt in the hand, to
   * be carried and set down with another; held and let go without moving opens its menu; a quick
   * tap picks it.
   */
  const touchMark = (e: React.PointerEvent<HTMLElement>, el: HTMLElement, spot: Spot, lane: number, stretch: boolean, menu: (x: number, y: number) => void) => {
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    const hand = carry(el, spot, lane, stretch, x0);
    let state: 'press' | 'lift' | 'carry' | 'done' = 'press';
    const timer = window.setTimeout(() => {
      if (state !== 'press') return;
      state = 'lift';
      haptic('lift');
      el.dataset.lifted = '';
    }, LIFT_MS);
    // Once the mark is lifted the finger carries it, and the view under it must not scroll.
    const still = (t: TouchEvent) => state !== 'press' && t.cancelable && t.preventDefault();
    const finish = () => {
      state = 'done';
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('touchmove', still);
    };
    const move = (m: PointerEvent) => {
      if (m.pointerId !== id) return;
      const far = Math.hypot(m.clientX - x0, m.clientY - y0) >= SLOP;
      // A swipe that began on a mark is the view's own scrolling.
      if (state === 'press') return void (far && finish());
      if (state === 'lift' && far) state = 'carry';
      if (state === 'carry' && hand.move(m)) haptic('tick');
    };
    const up = (u: PointerEvent) => {
      if (u.pointerId !== id) return;
      const was = state;
      finish();
      if (was !== 'press') swallowClick();
      if (was === 'carry') {
        haptic('drop');
        hand.drop();
      } else if (was === 'lift') {
        letGo(el);
        menu(u.clientX, u.clientY);
      } else if (was === 'press' && spot.d.path !== host.path) host.select(spot.d.path);
    };
    const cancel = (c: PointerEvent) => {
      if (c.pointerId !== id) return;
      const was = state;
      finish();
      if (was !== 'press') letGo(el);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('touchmove', still, { passive: false });
  };

  /** A mouse on the empty sheet drags the view about. Fingers scroll it themselves. */
  const pan = (e: React.PointerEvent<HTMLElement>) => {
    const node = main.current;
    if (!node || e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('.pl-node, .pl-head')) return;
    const [left, top, per] = [node.scrollLeft, node.scrollTop, scaleOf(node)];
    node.classList.add('panning');
    dragFrom(
      e,
      (dx, dy) => {
        node.scrollLeft = left - dx / per;
        node.scrollTop = top - dy / per;
      },
      () => node.classList.remove('panning'),
    );
  };

  // A Shelf Item let go on Plots gets the day it landed on, and the plotline it landed on if it has none.
  const landRef = useRef<(drop: ShelfDrop) => void>(() => {});
  landRef.current = ({ path, card, x, y }) => {
    if (card?.kind !== 'scene') return;
    const at = laneAt(y);
    const line = by === 'label' && at !== null && !card.label ? lanes[at]?.id : '';
    void (async () => {
      await host.setField(path, 'when', dayText(dayAt(x)));
      if (line) await host.setField(path, 'label', line);
    })();
  };
  useEffect(() => {
    const node = main.current;
    if (!node) return;
    const land = (e: Event) => landRef.current((e as CustomEvent<ShelfDrop>).detail);
    node.addEventListener(SHELF_DROP, land);
    return () => node.removeEventListener(SHELF_DROP, land);
  }, []);

  const laneMenu = (e: ReactMouseEvent, lane: Lane) => {
    if ((e.target as HTMLElement).closest('.pl-node')) return;
    e.preventDefault();
    const on = dayText(dayAt(e.clientX));
    const open = host.path && host.cards.get(host.path)?.kind === 'scene' ? parentOf(host.path) : null;
    const folder = by === 'group' ? lane.id : (open ?? groups.find((g) => g.path !== BOOKSHELF)?.path ?? BOOKSHELF);
    const line = by === 'label' && lane.id ? { label: lane.id } : {};
    const put = (path: string) =>
      void (async () => {
        await host.setField(path, 'when', on);
        if (line.label && !host.cards.get(path)?.label) await host.setField(path, 'label', line.label);
      })();
    // Or anything already on the Shelf, by its Group, put on this day.
    const fromShelf = groups.map((g) => ({ label: g.title, items: g.items.map((i) => ({ label: i.card.title, onPick: () => put(i.path) })) })).filter((g) => g.items.length > 0);
    host.menu('Plots', e.clientX, e.clientY, [
      { label: `New Item on ${sayWhen({ on })}`, onPick: () => void host.newItem(folder, { when: on, ...line }) },
      { separator: true },
      { label: 'Add from the Shelf', disabled: fromShelf.length === 0, items: fromShelf },
    ]);
  };

  const headMenu = (e: ReactMouseEvent, lane: Lane) => {
    e.preventDefault();
    e.stopPropagation();
    if (by !== 'label') return;
    const spare = LABELS.filter((l) => !lanes.some((r) => r.id === l.id));
    const rename = (id: string, title: string) =>
      ask({
        title,
        note: 'A plotline is a label colour with a name of your own. Items take it from the right-click menu, here or on the Shelf.',
        fields: [{ key: 'name', label: 'Name', value: prefs.plotlines[id] ?? '', placeholder: LABELS.find((l) => l.id === id)!.name, wide: true }],
        save: (v) => setPrefs((p) => ({ plotlines: { ...p.plotlines, [id]: (v.name ?? '').trim() } })),
      });
    host.menu('Plotline', e.clientX, e.clientY, [
      ...(lane.id ? [{ label: 'Rename plotline…', onPick: () => rename(lane.id, 'Name this plotline') }] : []),
      { label: 'New plotline', disabled: spare.length === 0, items: spare.map((l) => ({ label: l.name, icon: <span className="mode-dot" style={{ background: l.color }} />, onPick: () => rename(l.id, 'Name the new plotline') })) },
      ...(lane.id && !items.some((i) => i.card.label === lane.id)
        ? [
            { separator: true as const },
            {
              label: 'Remove plotline',
              onPick: () =>
                setPrefs((p) => {
                  const { [lane.id]: _gone, ...rest } = p.plotlines;
                  return { plotlines: rest };
                }),
            },
          ]
        : []),
    ]);
  };

  // The telling: the Items in the order the Shelf reads them, to mark each place the story steps back in time.
  const telling = useMemo(() => {
    if (by === 'who') return [];
    const at = new Map(laid.flatMap((spots) => spots.map((s) => [s.d.path, s] as const)));
    return items.flatMap((i) => (at.has(i.path) ? [at.get(i.path)!] : []));
  }, [laid, items, by]);
  const backs = useMemo(() => backSteps(items.flatMap((i) => dated.find((d) => d.path === i.path)?.first ?? [])), [items, dated]);

  const ruler = scale.stretches.map((s) => (s.folded ? null : stretchMarks(scale, s, px, view.from - BEYOND, view.to + BEYOND)));
  const hint = `Drag one in from the Shelf, or ${menuPress().toLowerCase()} a line for a new Item on that day.`;

  return (
    <div className="plots">
      {tools &&
        createPortal(
          <>
            <Pick
              label="A line for each"
              value={by}
              options={[
                { id: 'label', name: 'Plotlines' },
                { id: 'group', name: 'Groups' },
                { id: 'who', name: 'Characters' },
              ]}
              onPick={(lanes) => setPrefs({ plots: { ...prefs.plots, lanes } })}
            />
            <Seg
              label="Time"
              value={fold ? 'fold' : 'scale'}
              options={[
                { id: 'fold', name: 'Folded' },
                { id: 'scale', name: 'To scale' },
              ]}
              onPick={(id) => setPrefs({ plots: { ...prefs.plots, fold: id === 'fold' } })}
            />
            <ToolButton label="Mark each place the telling steps back in time, going by the order of the Shelf" pressed={thread && by !== 'who'} disabled={by === 'who'} onClick={() => setPrefs({ plots: { ...prefs.plots, thread: !thread } })}>
              Telling
            </ToolButton>
            <span className="mode-zoom">
              <ToolButton label="See more time" onClick={() => zoomTo(px / 1.6)}>
                −
              </ToolButton>
              <ToolButton label="See less time, closer" onClick={() => zoomTo(px * 1.6)}>
                +
              </ToolButton>
              <ToolButton label="Show every dated Item" disabled={dated.length === 0} onClick={fit}>
                Fit all
              </ToolButton>
            </span>
            <Tally>
              {dated.length} dated{thread && by !== 'who' && backs > 0 ? ` · ${backs} back in time` : ''}
            </Tally>
          </>,
          tools,
        )}
      <div className="pl-main" ref={main} onPointerDown={pan}>
        <div className="pl-sheet" ref={sheet} style={{ width: HEAD + scale.width, minHeight: height }}>
          <div className="pl-grid" style={{ left: HEAD }} aria-hidden="true">
            {scale.stretches.map((s, i) => (s.folded ? <i key={`f${s.d0}`} className="pl-fold" style={{ left: s.x0, width: s.w }} /> : ruler[i]!.majors.map((m) => <i key={m.n} className="pl-line" style={{ left: m.x }} />)))}
          </div>
          <div className="pl-ruler" style={{ height: RULER }}>
            <div className="pl-corner" style={{ width: HEAD }} />
            {scale.stretches.map((s, i) =>
              s.folded ? (
                <span key={`f${s.d0}`} className="pl-gap" style={{ left: HEAD + s.x0, width: s.w }} title={`${sayStretch(s.d1 - s.d0)} with nothing dated, folded away`}>
                  {sayStretch(s.d1 - s.d0)}
                </span>
              ) : (
                [
                  ...ruler[i]!.majors.map((m) => (
                    <span key={`M${m.n}`} className="pl-major" style={{ left: HEAD + m.x }}>
                      {m.text}
                    </span>
                  )),
                  ...ruler[i]!.minors.map((m) => (
                    <span key={`m${m.n}`} className="pl-minor" style={{ left: HEAD + m.x, width: px >= 15 ? px : undefined }}>
                      {m.text}
                    </span>
                  )),
                ]
              ),
            )}
          </div>
          {lanes.map((lane, li) => {
            const spots = laid[li]!;
            const inTime = [...spots].sort((p, q) => p.d.first - q.d.first || p.x - q.x);
            const lineY = (s: Spot) => s.y - tops[li]!;
            return (
              <div key={lane.id} className="pl-lane" style={{ height: (tops[li + 1] ?? height) - tops[li]!, '--label': lane.color ?? 'var(--muted)' } as CSSProperties} onContextMenu={(e) => laneMenu(e, lane)}>
                <div className="pl-head" style={{ width: HEAD }} onContextMenu={(e) => headMenu(e, lane)} title={by === 'label' ? `${lane.title}: ${menuPress().toLowerCase()} to name plotlines` : lane.title}>
                  {lane.who ? <Face host={host} item={lane.who} size={20} /> : by === 'label' && <span className="pl-swatch" />}
                  <span className="pl-head-name">{lane.title}</span>
                  <span className="grid-count">{lane.things.length}</span>
                </div>
                <div className="pl-track" style={{ left: HEAD }}>
                  <svg className="pl-path" width="1" height="1" aria-hidden="true">
                    {inTime.length > 1 && <polyline points={inTime.flatMap((s) => [`${s.x + DOT / 2},${lineY(s)}`, `${s.x + s.w - DOT / 2},${lineY(s)}`]).join(' ')} />}
                  </svg>
                  {spots.map((spot) => {
                    const { d } = spot;
                    const menu = (cx: number, cy: number) => host.menu('Date', cx, cy, datedMenu(host, d, ask));
                    const grab = (e: React.PointerEvent<HTMLElement>, stretch: boolean) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      const el = e.currentTarget.closest<HTMLElement>('.pl-node')!;
                      if (e.pointerType === 'touch') return touchMark(e, el, spot, li, stretch, menu);
                      const hand = carry(el, spot, li, stretch, e.clientX);
                      dragFrom(
                        e,
                        (_dx, _dy, m) => void hand.move(m),
                        (did) => (did ? hand.drop() : (letGo(el), d.path !== host.path && host.select(d.path))),
                      );
                    };
                    return (
                      <div
                        key={d.key}
                        className={`pl-node${d.last > d.first ? ' long' : ''}${d.path === host.path ? ' chosen' : ''}`}
                        style={{ left: spot.x, top: PAD + spot.row * ROW, height: ROW, '--w': `${spot.w}px`, ...(by !== 'label' ? { '--label': labelColor(d.card.label) ?? 'var(--muted)' } : {}) } as CSSProperties}
                        title={`${d.title} · ${sayWhen(d.date)}${d.card.synopsis ? `\n${d.card.synopsis}` : ''}`}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => grab(e, false)}
                        onDoubleClick={() => host.open(d.path)}
                        onKeyDown={(e) => e.key === 'Enter' && host.open(d.path)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // A finger's long press lifts the mark instead, and opens this menu itself if the mark isn't carried.
                          if (fromTouch(e)) return;
                          menu(e.clientX, e.clientY);
                        }}
                      >
                        <span className="pl-mark" />
                        <span className="pl-end" title="Drag to make it longer or shorter" onPointerDown={(e) => grab(e, true)} />
                        <span className="pl-name" style={spot.room !== null ? { maxWidth: spot.room } : undefined}>
                          {d.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {thread && telling.length > 1 && (
            <svg className="pl-thread" width="1" height="1" style={{ left: HEAD }} aria-hidden="true">
              <defs>
                <marker id="pl-back" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0.5 0.5L7.5 4L0.5 7.5z" />
                </marker>
              </defs>
              {telling.slice(1).map((to, i) => {
                const from = telling[i]!;
                // Only the steps back are drawn: forward is how time runs anyway, and a line for every step would bury the plots.
                if (to.d.first >= from.d.first) return null;
                const [x1, x2] = [from.x + DOT / 2, to.x + to.w - DOT / 2];
                const rise = Math.min(26, 10 + Math.abs(x2 - x1) / 40);
                return <path key={to.d.key} markerEnd="url(#pl-back)" d={`M${x1},${from.y - 8} Q${(x1 + x2) / 2},${Math.min(from.y, to.y) - 8 - rise} ${x2},${to.y - 9}`} />;
              })}
            </svg>
          )}
          {dated.length === 0 && <p className="mode-empty pl-empty">No Item has a story date yet. {hint}</p>}
          {dated.length > 0 && lanes.length === 0 && <p className="mode-empty pl-empty">No Character is named in an Item that has a story date.</p>}
        </div>
      </div>
    </div>
  );
}
