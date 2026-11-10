import { type CSSProperties, type DragEvent, type MouseEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parentOf } from '../storage/adapter';
import { BOOKSHELF, PANTRY_SECTIONS, childrenOf } from '../storage/book';
import { LABELS, STATUSES } from '../storage/document';
import { type PantrySection } from '../storage/pantry';
import { type MenuItem } from '../ui/Menu';
import { StatusIcon } from '../ui/StatusIcon';
import { useStore } from '../ui/store';
import { type Form, type ModeHost, type ViewProps } from './host';
import { type Group, type Item, boardRows, dropPlace, labelColor, pantryGroups, readingOrder, rowOf, shelfGroups } from './model';
import { type Spot, prefsStore, setPrefs } from './prefs';
import { Face, Pick, Seg, Synopsis, Tally, ToolButton, Zoomer, cardMenu, itemMenu, shortWhen } from './shared';
import { dragFrom, usePanZoom } from './usePanZoom';

const DRAG = 'application/x-cookbook-item';
/** A card on a free board, and the room each takes when they are laid out in rows. */
const CARD = { w: 224, h: 160, dx: 252, dy: 196, across: 6 };
const SINGULAR: Record<PantrySection, string> = { characters: 'Character', settings: 'Setting', research: 'Material' };
const sectionOfGroup = (group: string) => group.slice('pantry/'.length) as PantrySection;

/**
 * The board: the Shelf's Items (or the Pantry's) as cards. As a grid, the columns are the Groups
 * and the rows can be plotlines or statuses, and dragging a card moves the Item on the Shelf.
 * As a free board the cards lie wherever they are put, on a surface with no edges.
 */
export function Board({ host, tools, ask, pantry }: ViewProps & { pantry: boolean }) {
  const prefs = useStore(prefsStore);
  const name = pantry ? 'pboard' : 'board';
  const conf = pantry ? prefs.pboard : prefs.board;
  const set = (change: Partial<typeof prefs.board>) => setPrefs({ [name]: { ...conf, ...change } });
  const groups = useMemo(() => (pantry ? pantryGroups(host.pantryTree, host.cards) : shelfGroups(host.tree, host.cards)), [pantry, host.tree, host.pantryTree, host.cards]);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const ties = useMemo(() => {
    const count = new Map<string, number>();
    if (!pantry) return count;
    const idAt = new Map(items.map((i) => [i.path, i.card.id]));
    for (const l of host.links()) {
      const from = idAt.get(l.from);
      if (from) count.set(from, (count.get(from) ?? 0) + 1);
      count.set(l.to, (count.get(l.to) ?? 0) + 1);
    }
    return count;
  }, [pantry, items, host.indexVersion]);
  const pan = usePanZoom();

  /** Where each card lies on the free board: where it was put, or its turn in rows, a new row for each Group. */
  const spots = useMemo(() => {
    const saved = prefs.spots[name] ?? {};
    const at = new Map<string, Spot>();
    let row = 0;
    for (const g of groups) {
      g.items.forEach((item, i) => at.set(item.card.id, saved[item.card.id] ?? [(i % CARD.across) * CARD.dx, (row + Math.floor(i / CARD.across)) * CARD.dy]));
      row += Math.max(1, Math.ceil(g.items.length / CARD.across));
    }
    return at;
  }, [groups, prefs.spots, name]);
  const bounds = (): [number, number, number, number] | null => {
    const all = [...spots.values()];
    return all.length === 0 ? null : [Math.min(...all.map((s) => s[0])), Math.min(...all.map((s) => s[1])), Math.max(...all.map((s) => s[0])) + CARD.w, Math.max(...all.map((s) => s[1])) + CARD.h];
  };
  const put = (id: string, spot: Spot) => setPrefs((now) => ({ spots: { ...now.spots, [name]: { ...(now.spots[name] ?? {}), [id]: spot } } }));
  const tidy = () => setPrefs((now) => ({ spots: { ...now.spots, [name]: {} } }));

  /** The Shelf, put in the order the cards lie in on the free board, Group by Group. */
  const orderFromBoard = async () => {
    for (const g of groups) {
      const folder = g.path;
      const direct = g.items.filter((i) => parentOf(i.path) === folder);
      if (direct.length !== g.items.length || childrenOf(host.tree, BOOKSHELF, folder).length !== direct.length) continue;
      const ordered = readingOrder(direct, (i) => spots.get(i.card.id)!, CARD.dy);
      for (let n = 0; n < ordered.length; n++) if (ordered[n] !== direct[n]) await host.move(ordered[n]!.path, folder, n);
    }
    host.say('The Shelf now follows the board, Group by Group.');
  };

  const here = host.path && host.cards.get(host.path)?.kind === 'scene' ? groups.find((g) => g.items.some((i) => i.path === host.path))?.path : undefined;
  const home = here ?? groups.find((g) => g.path !== BOOKSHELF)?.path ?? BOOKSHELF;
  const newHere = (spot?: Spot): MenuItem[] => {
    const place = (id: string | null) => id && spot && put(id, spot);
    if (pantry) return PANTRY_SECTIONS.map((s) => ({ label: `New ${SINGULAR[s]}${spot ? ' here' : ''}`, onPick: () => void host.newCard(s).then(place) }));
    return [{ label: spot ? 'New Item here' : 'New Item', onPick: () => void host.newItem(home).then(place) }];
  };

  const total = items.length;
  return (
    <>
      {tools &&
        createPortal(
          <>
            <Seg
              label="Layout"
              value={conf.layout}
              options={[
                { id: 'grid', name: 'Grid' },
                { id: 'free', name: 'Free' },
              ]}
              onPick={(layout) => set({ layout })}
            />
            {conf.layout === 'grid' ? (
              <Pick
                label="Rows"
                value={conf.rows}
                options={[
                  { id: 'none', name: 'One row' },
                  { id: 'label', name: pantry ? 'Rows by label' : 'Rows by plotline' },
                  ...(pantry ? [] : [{ id: 'status' as const, name: 'Rows by status' }]),
                ]}
                onPick={(rows) => set({ rows })}
              />
            ) : (
              <>
                <Zoomer k={pan.look.k} onZoom={pan.zoomBy} onFit={() => pan.fit(bounds())} />
                <ToolButton label="Lay the cards out in rows again" onClick={tidy}>
                  Tidy up
                </ToolButton>
              </>
            )}
            <Tally>{pantry ? `${total} in the Pantry` : `${total} ${total === 1 ? 'Item' : 'Items'} · ${groups.filter((g) => g.path !== BOOKSHELF).length} Groups`}</Tally>
          </>,
          tools,
        )}
      {conf.layout === 'grid' ? (
        <GridBoard host={host} ask={ask} pantry={pantry} groups={groups} items={items} rows={conf.rows} ties={ties} newHere={newHere} />
      ) : (
        <div
          className="free-board"
          ref={pan.ref}
          onPointerDown={pan.onPointerDown}
          style={{ '--k': pan.look.k, backgroundPosition: `${-pan.look.x * pan.look.k}px ${-pan.look.y * pan.look.k}px`, backgroundSize: `${28 * pan.look.k}px ${28 * pan.look.k}px` } as CSSProperties}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            const [x, y] = pan.toBoard(e.clientX, e.clientY);
            host.menu('Board', e.clientX, e.clientY, [
              ...newHere([Math.round(x - CARD.w / 2), Math.round(y - 20)]),
              { separator: true },
              { label: 'Fit all', onPick: () => pan.fit(bounds()) },
              { label: 'Tidy up', onPick: tidy },
              ...(pantry ? [] : [{ label: 'Put the Shelf in the board’s order', onPick: () => void orderFromBoard() }]),
            ]);
          }}
        >
          <div className="free-layer" style={{ transform: `scale(${pan.look.k}) translate(${-pan.look.x}px, ${-pan.look.y}px)` }}>
            {items.map((item) => {
              const [x, y] = spots.get(item.card.id)!;
              // Only the cards in sight are drawn, so a board of thousands moves as easily as one of ten.
              const [w, h] = pan.size;
              if (x + CARD.w < pan.look.x - 80 || y + CARD.h * 2 < pan.look.y - 80 || x > pan.look.x + w / pan.look.k + 80 || y > pan.look.y + h / pan.look.k + 80) return null;
              return <FreeCard key={item.card.id} host={host} ask={ask} item={item} pantry={pantry} ties={ties} x={x} y={y} k={pan.look.k} onPut={(spot) => put(item.card.id, spot)} />;
            })}
          </div>
          {total === 0 && <p className="mode-empty">{pantry ? 'The Pantry is empty. Right-click here for a new Character, Setting or Material.' : 'Nothing on the Shelf yet. Right-click here for a new Item.'}</p>}
        </div>
      )}
    </>
  );
}

interface CardProps {
  host: ModeHost;
  ask(form: Form): void;
  item: Item;
  pantry: boolean;
  ties: Map<string, number>;
}

function menuOf({ host, ask, item, pantry }: CardProps): MenuItem[] {
  return pantry ? cardMenu(host, item) : itemMenu(host, item, ask);
}

/** What a card says: the name, the synopsis (written in place), and a line of where it stands. */
function CardFace({ host, item, pantry, ties }: CardProps) {
  const { card } = item;
  const tied = ties.get(card.id) ?? 0;
  return (
    <>
      <header>
        {pantry && <Face host={host} item={item} size={26} />}
        <h3>{card.title}</h3>
      </header>
      <Synopsis key={card.synopsis} value={card.synopsis} label={`Synopsis of ${card.title}`} placeholder={pantry ? 'Who or what, in a line' : 'What happens here?'} onSave={(text) => void host.setField(item.path, 'synopsis', text || undefined)} />
      <footer>
        {pantry ? (
          <span>{[tied > 0 ? `${tied} ${tied === 1 ? 'tie' : 'ties'}` : '', card.dates.length > 0 ? `${card.dates.length} ${card.dates.length === 1 ? 'date' : 'dates'}` : ''].filter(Boolean).join(' · ') || ' '}</span>
        ) : (
          <>
            <span className="prep-card-status">
              <StatusIcon status={card.status} decorative /> {STATUSES.find((s) => s.id === card.status)!.label}
            </span>
            <span>{card.dates[0] ? shortWhen(card.dates[0]) : `${card.words.toLocaleString('en')} words`}</span>
          </>
        )}
      </footer>
    </>
  );
}

const cardStyle = (item: Item): CSSProperties => ({ '--label': labelColor(item.card.label) ?? 'transparent' }) as CSSProperties;

function FreeCard(props: CardProps & { x: number; y: number; k: number; onPut(spot: Spot): void }) {
  const { host, item, x, y, k, onPut } = props;
  const [moved, setMoved] = useState<Spot | null>(null);
  const [px, py] = moved ?? [x, y];
  return (
    <article
      className={`prep-card free${item.path === host.path ? ' chosen' : ''}${moved ? ' lifted' : ''}`}
      style={{ ...cardStyle(item), left: px, top: py, width: CARD.w }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragFrom(
          e,
          (dx, dy) => setMoved([Math.round(x + dx / k), Math.round(y + dy / k)]),
          (did, up) => {
            setMoved(null);
            if (did) onPut([Math.round(x + (up.clientX - e.clientX) / k), Math.round(y + (up.clientY - e.clientY) / k)]);
            else if (item.path !== host.path) host.select(item.path);
          },
        );
      }}
      onDoubleClick={() => host.open(item.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        host.menu('Item', e.clientX, e.clientY, menuOf(props));
      }}
    >
      <CardFace {...props} />
    </article>
  );
}

interface GridProps {
  host: ModeHost;
  ask(form: Form): void;
  pantry: boolean;
  groups: Group[];
  items: Item[];
  rows: 'none' | 'label' | 'status';
  ties: Map<string, number>;
  newHere(): MenuItem[];
}

function GridBoard({ host, ask, pantry, groups, items, rows: by, ties }: GridProps) {
  const { plotlines } = useStore(prefsStore);
  const rows = boardRows(by, items, pantry ? {} : plotlines);
  const [over, setOver] = useState<string | null>(null);
  const field = by === 'status' ? 'status' : 'label';

  const allow = (e: DragEvent, key: string, group: string) => {
    if (!e.dataTransfer.types.includes(DRAG)) return;
    // A Pantry Item stays in its own section: a Character doesn't become a Setting by being dragged.
    if (pantry && !e.dataTransfer.types.includes(`${DRAG}+${group}`)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  };
  const drop = async (e: DragEvent, group: string, row: string, before: string | null) => {
    const from = e.dataTransfer.getData(DRAG);
    setOver(null);
    if (!from) return;
    e.preventDefault();
    e.stopPropagation();
    let path = from;
    if (!pantry && from !== before) {
      const place = dropPlace(host.tree, group, before);
      path = (await host.move(from, place.folder, place.at)) ?? from;
    }
    const card = host.cards.get(from);
    if (by !== 'none' && card && rowOf(by, card) !== row) await host.setField(path, field, row === '' || row === 'not-started' ? undefined : row);
  };

  const plotlineMenu = (e: MouseEvent, row: string) => {
    if (pantry || by !== 'label') return;
    e.preventDefault();
    e.stopPropagation();
    const spare = LABELS.filter((l) => !rows.some((r) => r.id === l.id));
    const rename = (id: string, title: string) =>
      ask({
        title,
        note: 'A plotline is a label colour with a name of your own. Items take it from the right-click menu, here or on the Shelf.',
        fields: [{ key: 'name', label: 'Name', value: plotlines[id] ?? '', placeholder: LABELS.find((l) => l.id === id)!.name, wide: true }],
        save: (v) => setPrefs((now) => ({ plotlines: { ...now.plotlines, [id]: (v.name ?? '').trim() } })),
      });
    host.menu('Plotline', e.clientX, e.clientY, [
      ...(row ? [{ label: 'Rename plotline…', onPick: () => rename(row, 'Name this plotline') }] : []),
      {
        label: 'New plotline',
        disabled: spare.length === 0,
        items: spare.map((l) => ({ label: l.name, icon: <span className="mode-dot" style={{ background: l.color }} />, onPick: () => rename(l.id, 'Name the new plotline') })),
      },
      ...(row && !items.some((i) => i.card.label === row)
        ? [
            { separator: true as const },
            {
              label: 'Remove plotline',
              onPick: () =>
                setPrefs((now) => {
                  const { [row]: _gone, ...rest } = now.plotlines;
                  return { plotlines: rest };
                }),
            },
          ]
        : []),
    ]);
  };

  if (groups.length === 0) return <p className="mode-empty">Nothing on the Shelf yet. Right-click the Shelf to add a Group, and it becomes a column here.</p>;
  return (
    <div className="grid-board-scroll">
      <div className={`grid-board${by === 'none' ? '' : ' with-rows'}`} style={{ gridTemplateColumns: `${by === 'none' ? '' : '132px '}repeat(${groups.length}, 248px)` }} role="grid" aria-label="Board">
        {by !== 'none' && <div className="grid-corner" onContextMenu={(e) => plotlineMenu(e, '')} />}
        {groups.map((g) => (
          <div key={g.path} className="grid-head" role="columnheader">
            <span>{g.title}</span>
            <span className="grid-count">{g.items.length}</span>
          </div>
        ))}
        {rows.map((row) => (
          <RowOfCells key={row.id || 'none'}>
            {by !== 'none' && (
              <div className="grid-row-head" role="rowheader" style={{ '--label': row.color ?? 'transparent' } as CSSProperties} onContextMenu={(e) => plotlineMenu(e, row.id)} onDoubleClick={(e) => row.id && plotlineMenu(e, row.id)}>
                {by === 'status' && <StatusIcon status={row.id as never} decorative />}
                <span>{row.title}</span>
              </div>
            )}
            {groups.map((g) => {
              const key = `${g.path}|${row.id}`;
              const cell = g.items.filter((i) => by === 'none' || rowOf(by, i.card) === row.id);
              const fields = by === 'none' || !row.id || row.id === 'not-started' ? undefined : { [field]: row.id };
              return (
                <div
                  key={key}
                  role="gridcell"
                  className={`grid-cell${over === key ? ' drop-into' : ''}`}
                  onDragOver={(e) => allow(e, key, g.path)}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(null)}
                  onDrop={(e) => void drop(e, g.path, row.id, null)}
                  onContextMenu={(e) => {
                    if ((e.target as HTMLElement).closest('.prep-card')) return;
                    e.preventDefault();
                    host.menu('Board', e.clientX, e.clientY, [
                      pantry
                        ? { label: `New ${SINGULAR[sectionOfGroup(g.path)]} here`, onPick: () => void host.newCard(sectionOfGroup(g.path), fields) }
                        : { label: 'New Item here', onPick: () => void host.newItem(g.path, fields) },
                      ...(pantry ? [] : [{ label: 'New Group', onPick: host.newGroup }]),
                      ...(!pantry && by === 'label' ? [{ separator: true as const }, { label: 'Plotlines…', onPick: () => plotlineMenu(e, row.id) }] : []),
                    ]);
                  }}
                >
                  {cell.map((item) => (
                    <article
                      key={item.path}
                      className={`prep-card${item.path === host.path ? ' chosen' : ''}${over === item.path ? ' drop-before' : ''}`}
                      style={cardStyle(item)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG, item.path);
                        e.dataTransfer.setData(`${DRAG}+${g.path}`, '1');
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => !pantry && allow(e, item.path, g.path)}
                      onDrop={(e) => !pantry && void drop(e, g.path, row.id, item.path)}
                      onDragEnd={() => setOver(null)}
                      onClick={() => item.path !== host.path && host.select(item.path)}
                      onDoubleClick={() => host.open(item.path)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        host.menu('Item', e.clientX, e.clientY, menuOf({ host, ask, item, pantry, ties }));
                      }}
                    >
                      <CardFace host={host} ask={ask} item={item} pantry={pantry} ties={ties} />
                    </article>
                  ))}
                </div>
              );
            })}
          </RowOfCells>
        ))}
      </div>
    </div>
  );
}

/** A row of the grid. The cells are laid out by the grid itself; this only groups them for screen readers. */
function RowOfCells({ children }: { children: React.ReactNode }) {
  return (
    <div role="row" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
