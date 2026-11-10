import { type DragEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOKSHELF } from '../storage/book';
import { eventsField } from '../storage/document';
import { MONTHS, WEEKDAYS, type Ymd, dayNumber, daysInMonth, formatDay, fromDayNumber, movedTo, parseDay, sayWhen, weekday } from '../storage/storyDate';
import { type MenuItem } from '../ui/Menu';
import { useStore } from '../ui/store';
import { type ViewProps } from './host';
import { type Dated, type Item, datedOf, labelColor, pantryGroups, readDay, shelfGroups } from './model';
import { prefsStore, setPrefs } from './prefs';
import { Seg, Tally, ToolButton, askDate, datedMenu, itemMenu, redate } from './shared';

const DRAG = 'application/x-cookbook-dated';

/** Today, for a recipe with no dates yet to open on. Story dates never come from the clock otherwise. */
function today(): Ymd {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/**
 * The calendar: a month of the story, with each dated Shelf Item on its day (or across its
 * days) and the Pantry's dated events beside them. Dragging one to another day re-dates it;
 * what has no date yet waits in a tray at the side to be dragged on.
 */
export function CalendarView({ host, side, tools, ask }: ViewProps) {
  const prefs = useStore(prefsStore);
  const showShelf = side !== 'pantry';
  const showPantry = side !== 'shelf';
  const shelf = useMemo(() => (showShelf ? shelfGroups(host.tree, host.cards).flatMap((g) => g.items) : []), [showShelf, host.tree, host.cards]);
  const pantry = useMemo(() => (showPantry ? pantryGroups(host.pantryTree, host.cards).flatMap((g) => g.items) : []), [showPantry, host.pantryTree, host.cards]);
  const dated = useMemo(() => [...datedOf(shelf, false), ...datedOf(pantry, true)].sort((a, b) => a.first - b.first || b.last - a.last || a.title.localeCompare(b.title, 'en')), [shelf, pantry]);
  const undated = shelf.filter((i) => i.card.dates.length === 0);
  // The story starts at the first dated Shelf Item; a birthday forty years before it is not where the calendar opens.
  const starts = dated.some((d) => d.event === null) ? dated.filter((d) => d.event === null) : dated;
  const start = starts.length > 0 ? fromDayNumber(Math.min(...starts.map((d) => d.first))) : null;
  const at = (prefs.calendar.at && parseDay(`${prefs.calendar.at}-01`)) || start || today();
  const [over, setOver] = useState<number | null>(null);
  const go = (y: number, m: number) => {
    const months = y * 12 + (m - 1);
    const year = Math.floor(months / 12);
    if (year >= 1 && year <= 99999) setPrefs({ calendar: { ...prefs.calendar, at: `${String(year).padStart(4, '0')}-${String((months % 12) + 1).padStart(2, '0')}` } });
  };
  const year = prefs.calendar.span === 'year';

  const addEvent = (item: Item, on: Ymd | null) =>
    askDate(ask, {
      title: `A date for ${item.card.title}`,
      date: on ? { on: formatDay(on) } : null,
      what: '',
      save: (date) => void host.setField(item.path, 'events', eventsField([...item.card.dates, date])),
    });

  const drop = (e: DragEvent, day: number) => {
    setOver(null);
    const key = e.dataTransfer.getData(DRAG);
    if (!key) return;
    e.preventDefault();
    const on = fromDayNumber(day);
    const was = dated.find((d) => d.key === key);
    if (was) return redate(host, was, movedTo(was.date, on));
    const item = undated.find((i) => i.path === key);
    if (item) void host.setField(item.path, 'when', formatDay(on));
  };

  const dayMenu = (e: React.MouseEvent, day: number) => {
    if ((e.target as HTMLElement).closest('.cal-chip')) return;
    e.preventDefault();
    const on = fromDayNumber(day);
    const open = host.path ? host.cards.get(host.path) : undefined;
    const openItem = host.path && open ? { path: host.path, card: open, group: '' } : null;
    const home = shelfGroups(host.tree, host.cards).find((g) => g.path !== BOOKSHELF)?.path ?? BOOKSHELF;
    const items: MenuItem[] = [];
    if (showShelf) {
      items.push({ label: `New Item on ${sayWhen({ on: formatDay(on) })}`, onPick: () => void host.newItem(openItem && open!.kind === 'scene' ? host.path!.slice(0, host.path!.lastIndexOf('/')) : home, { when: formatDay(on) }) });
      if (openItem && open!.kind === 'scene') items.push({ label: `Set “${open!.title}” on this day`, onPick: () => void host.setField(openItem.path, 'when', formatDay(on)) });
    }
    if (showPantry) {
      if (openItem && open!.kind !== 'scene') items.push({ label: `New date for ${open!.title}…`, onPick: () => addEvent(openItem, on) });
      const others = pantry.filter((i) => i.path !== host.path).slice(0, 24);
      if (others.length > 0) items.push({ label: 'New date for', items: others.map((i) => ({ label: i.card.title, onPick: () => addEvent(i, on) })) });
    }
    if (items.length > 0) host.menu('Day', e.clientX, e.clientY, items);
  };

  const jump = () =>
    ask({
      title: 'Go to a day',
      note: 'Any year from 1 to 99999.',
      fields: [{ key: 'day', label: 'Day', value: sayWhen({ on: formatDay({ ...at, d: 1 }) }), placeholder: '3 September 1954', wide: true }],
      check: (v) => (readDay(v.day ?? '') ? null : 'That isn’t a day Cookbook can read. Try 1954-09-03 or 3 September 1954.'),
      save: (v) => {
        const day = readDay(v.day ?? '');
        if (day) go(day.y, day.m);
      },
    });

  const chip = (d: Dated, day: number) => {
    const color = labelColor(d.card.label);
    const long = d.last > d.first;
    return (
      <button
        key={d.key}
        className={`cal-chip${d.event !== null ? ' pantry' : ''} kind-${d.card.kind}${long ? ` long${day === d.first ? ' first' : ''}${day === d.last ? ' last' : ''}` : ''}${d.path === host.path ? ' chosen' : ''}`}
        style={color ? { borderLeftColor: color } : undefined}
        title={`${d.title} · ${sayWhen(d.date)}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG, d.key);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => d.path !== host.path && host.select(d.path)}
        onDoubleClick={() => host.open(d.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          host.menu('Date', e.clientX, e.clientY, datedMenu(host, d, ask));
        }}
      >
        {!long || day === d.first || weekday(fromDayNumber(day)) === 0 ? d.title : ' '}
      </button>
    );
  };

  const month = (y: number, m: number, small: boolean) => {
    const first = dayNumber({ y, m, d: 1 });
    const lead = weekday({ y, m, d: 1 });
    const cells = Math.ceil((lead + daysInMonth(y, m)) / 7) * 7;
    return (
      <div className={`cal-month${small ? ' small' : ''}`} role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday" role="columnheader">
            {small ? w[0] : w}
          </div>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const n = first - lead + i;
          const day = fromDayNumber(n);
          const inMonth = day.m === m;
          const here = dated.filter((d) => d.first <= n && n <= d.last);
          if (small)
            return (
              <div key={n} className={`cal-day${inMonth ? '' : ' out'}${inMonth && here.length > 0 ? ' busy' : ''}`} title={inMonth && here.length > 0 ? here.map((d) => d.title).join('\n') : undefined}>
                {inMonth ? day.d : ''}
              </div>
            );
          return (
            <div
              key={n}
              role="gridcell"
              className={`cal-day${inMonth ? '' : ' out'}${over === n ? ' drop-into' : ''}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG)) return;
                e.preventDefault();
                if (over !== n) setOver(n);
              }}
              onDrop={(e) => drop(e, n)}
              onContextMenu={(e) => dayMenu(e, n)}
            >
              <span className="cal-num">{day.d === 1 ? `${day.d} ${MONTHS[day.m - 1]!.slice(0, 3)}` : day.d}</span>
              {here.map((d) => chip(d, n))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="calendar">
      {tools &&
        createPortal(
          <>
            <ToolButton label={year ? 'The year before' : 'The month before'} onClick={() => (year ? go(at.y - 1, at.m) : go(at.y, at.m - 1))}>
              ‹
            </ToolButton>
            <button className="mode-btn cal-title" title="Go to a day" onClick={jump}>
              {year ? at.y : `${MONTHS[at.m - 1]} ${at.y}`}
            </button>
            <ToolButton label={year ? 'The year after' : 'The month after'} onClick={() => (year ? go(at.y + 1, at.m) : go(at.y, at.m + 1))}>
              ›
            </ToolButton>
            <ToolButton label="Go to the first date in the story" disabled={!start} onClick={() => start && go(start.y, start.m)}>
              Story start
            </ToolButton>
            <Seg
              label="Show"
              value={prefs.calendar.span}
              options={[
                { id: 'month', name: 'Month' },
                { id: 'year', name: 'Year' },
              ]}
              onPick={(span) => setPrefs({ calendar: { ...prefs.calendar, span } })}
            />
            <Tally>{[`${dated.length} dated`, showShelf ? `${undated.length} not yet` : ''].filter(Boolean).join(' · ')}</Tally>
          </>,
          tools,
        )}
      {year ? (
        <div className="cal-year">
          {MONTHS.map((name, i) => (
            <button key={name} className="cal-year-month" onClick={() => setPrefs({ calendar: { span: 'month', at: `${String(at.y).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}` } })}>
              <span className="cal-year-name">{name}</span>
              {month(at.y, i + 1, true)}
            </button>
          ))}
        </div>
      ) : (
        month(at.y, at.m, false)
      )}
      {showShelf && (
        <aside
          className="cal-tray"
          aria-label="Not dated yet"
          onDragOver={(e) => e.dataTransfer.types.includes(DRAG) && e.preventDefault()}
          onDrop={(e) => {
            const was = dated.find((d) => d.key === e.dataTransfer.getData(DRAG));
            if (was && was.event === null) redate(host, was, null);
          }}
        >
          <h3>Not dated yet</h3>
          {undated.length === 0 ? (
            <p>Every Item has its day. Drag one back here to take its date away.</p>
          ) : (
            undated.map((i) => (
              <button
                key={i.path}
                className={`cal-chip${i.path === host.path ? ' chosen' : ''}`}
                style={labelColor(i.card.label) ? { borderLeftColor: labelColor(i.card.label) } : undefined}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG, i.path);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => i.path !== host.path && host.select(i.path)}
                onDoubleClick={() => host.open(i.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  host.menu('Item', e.clientX, e.clientY, itemMenu(host, i, ask));
                }}
              >
                {i.card.title}
              </button>
            ))
          )}
        </aside>
      )}
    </div>
  );
}
