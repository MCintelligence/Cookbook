import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fromTouch, haptic, menuPress, swallowClick } from '../mobile';
import { createPortal } from 'react-dom';
import { parentOf } from '../storage/adapter';
import { BOOKSHELF } from '../storage/book';
import { LABELS } from '../storage/document';
import { MONTHS, type StoryDate, dayNumber, fromDayNumber, sayWhen, shifted } from '../storage/storyDate';
import { useStore } from '../ui/store';
import { SHELF_DROP, type ShelfDrop, type ViewProps } from './host';
import { type Dated, datedOf, dayText, labelColor, packRows, plotlineName, shelfGroups } from './model';
import { MAX_PX, MIN_PX, prefsStore, setPrefs } from './prefs';
import { Pick, Tally, ToolButton, datedMenu, redate } from './shared';
import { dragFrom, scaleOf } from './usePanZoom';

/** The width of the lane names down the left, and the height of one row of bars. */
const HEAD = 148;
const ROW = 30;
const PANTRY_LANE = '\u0000pantry';
/** How long the timeline must be still after a scroll of the wheel before it is drawn again where it went. */
const REST = 120;
/** How long a finger rests on a bar before it lifts, and how far it can wander before that and still be resting (screen pixels). */
const LIFT_MS = 300;
const SLOP = 8;

interface Lane {
  id: string;
  title: string;
  color?: string;
}

/** The marks along the top: months or years, as closely as there is room to name them. */
function rulerMarks(left: number, right: number, px: number): { majors: { n: number; text: string }[]; minors: { n: number; text: string }[] } {
  const majors: { n: number; text: string }[] = [];
  const minors: { n: number; text: string }[] = [];
  const from = fromDayNumber(Math.floor(left));
  if (px * 30 >= 64) {
    for (let y = from.y, m = from.m, i = 0; i < 400; i++) {
      const n = dayNumber({ y, m, d: 1 });
      if (n > right) break;
      majors.push({ n, text: `${MONTHS[m - 1]} ${y}` });
      if (++m > 12) [y, m] = [y + 1, 1];
    }
    const step = px >= 15 ? 1 : px >= 4 ? 7 : 0;
    if (step > 0) {
      // Weeks are marked on their Mondays.
      let n = Math.floor(left);
      if (step === 7) n -= (((n + 3) % 7) + 7) % 7;
      for (; n <= right; n += step) minors.push({ n, text: String(fromDayNumber(n).d) });
    }
  } else {
    const room = 72 / (px * 365.2425);
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => s >= room) ?? 10000;
    for (let y = Math.max(1, Math.floor(from.y / step) * step), i = 0; i < 400 && y <= 99999; y += step, i++) {
      const n = dayNumber({ y: Math.max(1, y), m: 1, d: 1 });
      if (n > right) break;
      majors.push({ n, text: String(Math.max(1, y)) });
    }
    if (px * 30 >= 16 && step === 1) {
      for (let y = from.y, m = from.m, i = 0; i < 600; i++) {
        const n = dayNumber({ y, m, d: 1 });
        if (n > right) break;
        if (m !== 1) minors.push({ n, text: MONTHS[m - 1]!.slice(0, px * 30 >= 34 ? 3 : 1) });
        if (++m > 12) [y, m] = [y + 1, 1];
      }
    }
  }
  return { majors, minors };
}

/**
 * The timeline: story time running left to right with no ends, a lane for each Group (or each
 * plotline), and each dated Item a bar on its days. Bars are dragged to another day and
 * stretched from their right edge; the view is dragged, scrolled and zoomed from days to centuries.
 */
export function Timeline({ host, tools, ask }: ViewProps) {
  const prefs = useStore(prefsStore);
  const { lanes: by, px } = prefs.timeline;
  const groups = useMemo(() => shelfGroups(host.tree, host.cards), [host.tree, host.cards]);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const dated = useMemo(() => datedOf(items, false), [items]);
  // Fit all and Story start go by the Shelf's own dates when it has any, so one far-off birthday doesn't shrink the story to a dot.
  const story = dated.some((d) => d.event === null) ? dated.filter((d) => d.event === null) : dated;
  const first = story.length > 0 ? Math.min(...story.map((d) => d.first)) : null;
  const last = story.length > 0 ? Math.max(...story.map((d) => d.last)) : null;
  const [left, setLeft] = useState<number>(() => {
    if (first !== null) return first - HEAD / 4 / px - 2;
    const now = new Date();
    return dayNumber({ y: now.getFullYear(), m: now.getMonth() + 1, d: 1 }) - 2;
  });
  const [width, setWidth] = useState(0);
  const main = useRef<HTMLDivElement | null>(null);
  const now = useRef({ left, px });
  now.current = { left, px };
  /**
   * Where the timeline has been moved to and not yet drawn. Moving it draws nothing: the bars, the
   * lines and the ruler's marks slide together on one transform (`--tl-shift`, on `.tl-track`), and
   * the timeline is drawn again where it went only when the move ends. A screen's worth of time is
   * drawn on each side for that slide to show.
   */
  const sliding = useRef<number | null>(null);
  const rest = useRef(0);
  const leftNow = () => sliding.current ?? now.current.left;
  const slide = (to: number) => {
    sliding.current = to;
    main.current?.style.setProperty('--tl-shift', `${(now.current.left - to) * now.current.px}px`);
  };
  /**
   * A bar being moved or stretched is drawn by hand, on that bar alone: nothing else on the timeline
   * is drawn again, and no other bar shifts to make room, until it is set down on its new days.
   * It keeps its borrowed place until the timeline is drawn with its new date (`setDown`).
   */
  const held = useRef<HTMLElement | null>(null);
  const carryBar = (el: HTMLElement, d: Dated, days: number, stretch: boolean) => {
    const px = now.current.px;
    el.dataset.lifted = '';
    if (stretch) {
      const w = `${Math.max((Math.max(d.first, d.last + days) - d.first + 1) * px, 10)}px`;
      el.style.minWidth = w;
      el.style.maxWidth = w;
    } else el.style.transform = `translateX(${days * px}px)`;
  };
  const letGo = (el: HTMLElement) => {
    el.style.transform = '';
    el.style.minWidth = '';
    el.style.maxWidth = '';
    delete el.dataset.lifted;
  };
  const setDown = (el: HTMLElement, d: Dated, days: number, stretch: boolean) => {
    if (days === 0) return letGo(el);
    held.current = el;
    // Should the new date be slow to arrive, the bar goes back rather than stay lifted.
    window.setTimeout(() => held.current === el && (letGo(el), (held.current = null)), 1500);
    const date: StoryDate = stretch ? { ...d.date, to: d.last + days > d.first ? dayText(d.last + days) : undefined } : shifted(d.date, days);
    redate(host, d, date);
  };
  useLayoutEffect(() => {
    if (held.current) letGo(held.current);
    held.current = null;
  }, [dated]);
  const settle = () => {
    window.clearTimeout(rest.current);
    if (sliding.current === null) return;
    const to = sliding.current;
    sliding.current = null;
    if (to === now.current.left) main.current?.style.setProperty('--tl-shift', '0px');
    else setLeft(to);
  };
  // The new drawing and the end of the slide arrive in the same frame, so nothing jumps.
  useLayoutEffect(() => {
    if (sliding.current === null) main.current?.style.setProperty('--tl-shift', '0px');
  }, [left, px]);
  const setPx = (next: number, about = width / 2) => {
    const to = Math.max(MIN_PX, Math.min(MAX_PX, next));
    const from = leftNow();
    sliding.current = null;
    setLeft(from + about / now.current.px - about / to);
    setPrefs((p) => ({ timeline: { ...p.timeline, px: to } }));
  };

  useEffect(() => {
    const node = main.current;
    if (!node) return;
    const watch = new ResizeObserver(() => setWidth(Math.max(0, node.clientWidth - HEAD)));
    watch.observe(node);
    setWidth(Math.max(0, node.clientWidth - HEAD));
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setPx(now.current.px * Math.exp(-e.deltaY * 0.003), e.clientX - node.getBoundingClientRect().left - HEAD);
      } else if (e.deltaX || e.shiftKey) {
        e.preventDefault();
        slide(leftNow() + (e.deltaX || e.deltaY) / now.current.px);
        window.clearTimeout(rest.current);
        rest.current = window.setTimeout(settle, REST);
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      watch.disconnect();
      window.clearTimeout(rest.current);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  // A Shelf Item let go on the timeline gets the day it landed on.
  const landRef = useRef<(drop: ShelfDrop) => void>(() => {});
  landRef.current = ({ path, card, x: at }) => {
    if (card?.kind === 'scene') void host.setField(path, 'when', dayText(dayAt(at)));
  };
  useEffect(() => {
    const node = main.current;
    if (!node) return;
    const land = (e: Event) => landRef.current((e as CustomEvent<ShelfDrop>).detail);
    node.addEventListener(SHELF_DROP, land);
    return () => node.removeEventListener(SHELF_DROP, land);
  }, []);

  const right = left + width / px;
  const lanes: Lane[] = useMemo(() => {
    return by === 'group'
        ? groups.map((g) => ({ id: g.path, title: g.title }))
        : [{ id: '', title: 'No plotline' }, ...LABELS.filter((l) => items.some((i) => i.card.label === l.id) || prefs.plotlines[l.id] !== undefined).map((l) => ({ id: l.id, title: plotlineName(l.id, prefs.plotlines), color: l.color }))];
  }, [by, groups, items, prefs.plotlines]);
  const laneOf = (d: Dated) => (d.event !== null ? PANTRY_LANE : by === 'group' ? d.group : d.card.label);
  // A screen's worth either side of what shows, for the timeline to slide into before it is drawn again.
  const span = width / px;
  const { majors, minors } = rulerMarks(left - span, right + span, px);
  const x = (n: number) => HEAD + (n - left) * px;
  const dayAt = (clientX: number) => Math.floor(left + (clientX - (main.current?.getBoundingClientRect().left ?? 0) - HEAD) / px);

  const fit = () => {
    if (first === null || last === null || width === 0) return;
    const to = Math.max(MIN_PX, Math.min(MAX_PX, (width - 160) / (last - first + 1)));
    setPrefs((p) => ({ timeline: { ...p.timeline, px: to } }));
    setLeft(first - 40 / to);
  };
  /** Moves the timeline with a pointer that went down at `x0`, until it comes up. Up and down is the page's own scrolling. */
  const panFrom = (id: number, x0: number, first?: PointerEvent) => {
    const node = main.current;
    if (!node) return;
    const from = leftNow();
    const scale = scaleOf(node);
    node.classList.add('panning');
    const move = (m: PointerEvent) => m.pointerId === id && slide(from - (m.clientX - x0) / scale / now.current.px);
    const end = (u: PointerEvent) => {
      if (u.pointerId !== id) return;
      node.classList.remove('panning');
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      settle();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    if (first) move(first);
  };
  const pan = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tl-bar, .tl-lane-head')) return;
    panFrom(e.pointerId, e.clientX);
  };

  /**
   * A finger on a bar, told apart by what it does in its first moments: a swipe is the timeline's
   * (it moves, as from anywhere else); resting LIFT_MS lifts the bar with a tap felt in the hand,
   * to be carried to other days and set down with another; held and let go without moving opens
   * its menu; a quick tap picks it.
   */
  const touchBar = (e: React.PointerEvent<HTMLElement>, el: HTMLElement, d: Dated, stretch: boolean, menu: (x: number, y: number) => void) => {
    const id = e.pointerId;
    const [x0, y0] = [e.clientX, e.clientY];
    const per = scaleOf(main.current) * now.current.px;
    let state: 'press' | 'lift' | 'carry' | 'done' = 'press';
    let days = 0;
    const timer = window.setTimeout(() => {
      if (state !== 'press') return;
      state = 'lift';
      haptic('lift');
      el.dataset.lifted = '';
    }, LIFT_MS);
    // Once the bar is lifted the finger carries it, and the page under it must not scroll.
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
      if (state === 'press') {
        if (!far) return;
        finish();
        // A swipe that began on a bar: the timeline follows the finger from where it landed.
        return panFrom(id, x0, m);
      }
      if (state === 'lift' && far) state = 'carry';
      if (state !== 'carry') return;
      const to = Math.round((m.clientX - x0) / per);
      if (to !== days) {
        days = to;
        haptic('tick');
        carryBar(el, d, days, stretch);
      }
    };
    const up = (u: PointerEvent) => {
      if (u.pointerId !== id) return;
      const was = state;
      finish();
      if (was !== 'press') swallowClick();
      if (was === 'carry') {
        haptic('drop');
        setDown(el, d, days, stretch);
      } else if (was === 'lift') {
        letGo(el);
        menu(u.clientX, u.clientY);
      } else if (was === 'press' && d.path !== host.path) host.select(d.path);
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

  return (
    <div className="timeline">
      {tools &&
        createPortal(
          <>
            <Pick
              label="Lanes"
              value={by}
              options={[
                { id: 'group', name: 'Lanes by Group' },
                { id: 'label', name: 'Lanes by plotline' },
              ]}
              onPick={(lanes) => setPrefs({ timeline: { ...prefs.timeline, lanes } })}
            />
            <span className="mode-zoom">
              <ToolButton label="See more time" onClick={() => setPx(px / 1.6)}>
                −
              </ToolButton>
              <ToolButton label="See less time, closer" onClick={() => setPx(px * 1.6)}>
                +
              </ToolButton>
              <ToolButton label="Show every dated Item" disabled={first === null} onClick={fit}>
                Fit all
              </ToolButton>
            </span>
            <ToolButton label="Go to the first date in the story" disabled={first === null} onClick={() => first !== null && setLeft(first - 40 / px)}>
              Story start
            </ToolButton>
            <Tally>{dated.length} dated</Tally>
          </>,
          tools,
        )}
      <div
        className="tl-main"
        ref={main}
        onPointerDown={pan}
      >
        <div className="tl-ruler">
          <div className="tl-track">
          {majors.map((m) => (
            <span key={`M${m.n}`} className="tl-major" style={{ left: x(m.n) }}>
              {m.text}
            </span>
          ))}
          {minors.map((m) => (
            <span key={`m${m.n}`} className="tl-minor" style={{ left: x(m.n), width: px >= 15 ? px : undefined }}>
              {m.text}
            </span>
          ))}
          </div>
          <div className="tl-corner" style={{ width: HEAD }} />
        </div>
        <div className="tl-lanes">
          {lanes.map((lane) => {
            const mine = dated.filter((d) => laneOf(d) === lane.id);
            const seen = mine.filter((d) => d.last >= left - span - 400 / px && d.first <= right + span + 40 / px);
            const shape = seen.map((d) => {
              const a = d.first;
              const b = Math.max(a, d.last);
              const w = Math.max((b - a + 1) * px, 10);
              return { d, a, b, w, x: x(a) };
            });
            const rows = packRows(shape.map((s) => [s.x, s.x + Math.max(s.w, s.d.title.length * 6.8 + 22)]));
            const height = 14 + (Math.max(-1, ...rows) + 1) * ROW;
            return (
              <div
                key={lane.id}
                className="tl-lane"
                style={{ height: Math.max(height, 58) }}
                onContextMenu={(e) => {
                  if ((e.target as HTMLElement).closest('.tl-bar') || lane.id === PANTRY_LANE) return;
                  e.preventDefault();
                  const on = dayText(dayAt(e.clientX));
                  const open = host.path && host.cards.get(host.path)?.kind === 'scene' ? parentOf(host.path) : null;
                  const folder = by === 'group' ? lane.id : (open ?? groups.find((g) => g.path !== BOOKSHELF)?.path ?? BOOKSHELF);
                  // Or anything already on the Shelf, by its Group, put on this day.
                  const fromShelf = groups
                    .map((g) => ({ label: g.title, items: g.items.filter((i) => i.card.kind === 'scene').map((i) => ({ label: i.card.title, onPick: () => void host.setField(i.path, 'when', on) })) }))
                    .filter((g) => g.items.length > 0);
                  host.menu('Timeline', e.clientX, e.clientY, [
                    { label: `New Item on ${sayWhen({ on })}`, onPick: () => void host.newItem(folder, { when: on, ...(by === 'label' && lane.id ? { label: lane.id } : {}) }) },
                    { separator: true },
                    { label: 'Add from the Shelf', disabled: fromShelf.length === 0, items: fromShelf },
                  ]);
                }}
              >
                <div className="tl-track">
                {majors.map((m) => (
                  <i key={m.n} className="tl-line" style={{ left: x(m.n) }} />
                ))}
                {shape.map(({ d, a, b, w, x: bx }, i) => {
                  const menu = (cx: number, cy: number) => host.menu('Date', cx, cy, datedMenu(host, d, ask));
                  const grab = (e: React.PointerEvent<HTMLElement>, stretch: boolean) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const el = e.currentTarget.closest<HTMLElement>('.tl-bar')!;
                    if (e.pointerType === 'touch') return touchBar(e, el, d, stretch, menu);
                    const per = scaleOf(main.current) * px;
                    let days = 0;
                    dragFrom(
                      e,
                      (dx) => {
                        // Only when the day under the pointer changes, and only this bar.
                        if (Math.round(dx / per) === days) return;
                        days = Math.round(dx / per);
                        carryBar(el, d, days, stretch);
                      },
                      (did) => (did ? setDown(el, d, days, stretch) : (letGo(el), d.path !== host.path && host.select(d.path))),
                    );
                  };
                  return (
                    <div
                      key={d.key}
                      className={`tl-bar${d.event !== null ? ' pantry' : ''}${b > a ? ' long' : ''}${b > a && w < d.title.length * 7 + 20 ? ' tight' : ''}${d.path === host.path ? ' chosen' : ''}`}
                      style={{ left: bx, top: 8 + rows[i]! * ROW, width: w, '--label': labelColor(d.card.label) ?? 'var(--accent)' } as CSSProperties}
                      title={`${d.title} · ${sayWhen(d.date)}`}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => grab(e, false)}
                      onDoubleClick={() => host.open(d.path)}
                      onKeyDown={(e) => e.key === 'Enter' && host.open(d.path)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // A finger's long press lifts the bar instead, and opens this menu itself if the bar isn't carried.
                        if (fromTouch(e)) return;
                        menu(e.clientX, e.clientY);
                      }}
                    >
                      <span className="tl-bar-name">{d.title}</span>
                      <span className="tl-bar-end" title="Drag to make it longer or shorter" onPointerDown={(e) => grab(e, true)} />
                    </div>
                  );
                })}
                </div>
                <div className="tl-lane-head" style={{ width: HEAD, '--label': lane.color ?? 'transparent' } as CSSProperties}>
                  <span>{lane.title}</span>
                  <span className="grid-count">{mine.length}</span>
                </div>
              </div>
            );
          })}
          {dated.length === 0 && <p className="mode-empty tl-empty">No Item has a story date yet. Drag one in from the Shelf, or {menuPress().toLowerCase()} a lane for a new Item on that day.</p>}
        </div>
      </div>
    </div>
  );
}

