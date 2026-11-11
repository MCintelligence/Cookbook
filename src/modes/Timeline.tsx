import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
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
import { dragFrom } from './usePanZoom';

/** The width of the lane names down the left, and the height of one row of bars. */
const HEAD = 148;
const ROW = 30;
const PANTRY_LANE = '\u0000pantry';

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
  const [moving, setMoving] = useState<{ key: string; days: number; stretch: boolean } | null>(null);
  const main = useRef<HTMLDivElement | null>(null);
  const now = useRef({ left, px });
  now.current = { left, px };
  const setPx = (next: number, about = width / 2) => {
    const to = Math.max(MIN_PX, Math.min(MAX_PX, next));
    setLeft(now.current.left + about / now.current.px - about / to);
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
        setLeft(now.current.left + (e.deltaX || e.deltaY) / now.current.px);
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      watch.disconnect();
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
  const { majors, minors } = rulerMarks(left, right, px);
  const x = (n: number) => HEAD + (n - left) * px;
  const dayAt = (clientX: number) => Math.floor(left + (clientX - (main.current?.getBoundingClientRect().left ?? 0) - HEAD) / px);

  const fit = () => {
    if (first === null || last === null || width === 0) return;
    const to = Math.max(MIN_PX, Math.min(MAX_PX, (width - 160) / (last - first + 1)));
    setPrefs((p) => ({ timeline: { ...p.timeline, px: to } }));
    setLeft(first - 40 / to);
  };
  const pan = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tl-bar, .tl-lane-head')) return;
    const from = now.current.left;
    const node = e.currentTarget;
    node.classList.add('panning');
    dragFrom(
      e,
      (dx) => setLeft(from - dx / now.current.px),
      () => node.classList.remove('panning'),
    );
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
          <div className="tl-corner" style={{ width: HEAD }} />
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
        <div className="tl-lanes">
          {lanes.map((lane) => {
            const mine = dated.filter((d) => laneOf(d) === lane.id);
            const seen = mine.filter((d) => d.last >= left - 400 / px && d.first <= right + 40 / px);
            const shape = seen.map((d) => {
              const move = moving?.key === d.key ? moving : null;
              const a = d.first + (move && !move.stretch ? move.days : 0);
              const b = Math.max(a, d.last + (move ? move.days : 0));
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
                  host.menu('Timeline', e.clientX, e.clientY, [{ label: `New Item on ${sayWhen({ on })}`, onPick: () => void host.newItem(folder, { when: on, ...(by === 'label' && lane.id ? { label: lane.id } : {}) }) }]);
                }}
              >
                {majors.map((m) => (
                  <i key={m.n} className="tl-line" style={{ left: x(m.n) }} />
                ))}
                {shape.map(({ d, a, b, w, x: bx }, i) => {
                  const commit = (days: number, stretch: boolean) => {
                    setMoving(null);
                    if (days === 0) return;
                    const date: StoryDate = stretch ? { ...d.date, to: d.last + days > d.first ? dayText(d.last + days) : undefined } : shifted(d.date, days);
                    redate(host, d, date);
                  };
                  const grab = (e: React.PointerEvent, stretch: boolean) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    dragFrom(
                      e,
                      (dx) => setMoving({ key: d.key, days: Math.round(dx / px), stretch }),
                      (did, up) => (did ? commit(Math.round((up.clientX - e.clientX) / px), stretch) : d.path !== host.path && host.select(d.path)),
                    );
                  };
                  return (
                    <div
                      key={d.key}
                      className={`tl-bar${d.event !== null ? ' pantry' : ''}${b > a ? ' long' : ''}${b > a && w < d.title.length * 7 + 20 ? ' tight' : ''}${d.path === host.path ? ' chosen' : ''}${moving?.key === d.key ? ' lifted' : ''}`}
                      style={{ left: bx, top: 8 + rows[i]! * ROW, width: w, '--label': labelColor(d.card.label) ?? 'var(--accent)' } as CSSProperties}
                      title={`${d.title} · ${sayWhen(moving?.key === d.key ? { on: dayText(a), to: b > a ? dayText(b) : undefined } : d.date)}`}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => grab(e, false)}
                      onDoubleClick={() => host.open(d.path)}
                      onKeyDown={(e) => e.key === 'Enter' && host.open(d.path)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        host.menu('Date', e.clientX, e.clientY, datedMenu(host, d, ask));
                      }}
                    >
                      <span className="tl-bar-name">{d.title}</span>
                      <span className="tl-bar-end" title="Drag to make it longer or shorter" onPointerDown={(e) => grab(e, true)} />
                    </div>
                  );
                })}
                <div className="tl-lane-head" style={{ width: HEAD, '--label': lane.color ?? 'transparent' } as CSSProperties}>
                  <span>{lane.title}</span>
                  <span className="grid-count">{mine.length}</span>
                </div>
              </div>
            );
          })}
          {dated.length === 0 && <p className="mode-empty tl-empty">No Item has a story date yet. Drag one in from the Shelf, or right-click a lane for a new Item on that day.</p>}
        </div>
      </div>
    </div>
  );
}

