import { type CSSProperties, type DragEvent, type MouseEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOKSHELF, PANTRY_SECTIONS } from '../storage/book';
import { LABELS } from '../storage/document';
import { type MenuItem } from '../ui/Menu';
import { StatusIcon } from '../ui/StatusIcon';
import { useStore } from '../ui/store';
import { CardFace, SINGULAR, cardStyle, menuOf, sectionOfGroup } from './BoardCards';
import { snap } from './diagram';
import { FreeBoard } from './FreeBoard';
import { type Form, type ModeHost, type ViewProps } from './host';
import { type Group, type Item, boardRows, dropPlace, pantryGroups, rowOf, shelfGroups } from './model';
import { type Spot, prefsStore, setPrefs } from './prefs';
import { Pick, Seg, Tally } from './shared';

const DRAG = 'application/x-cookbook-item';

/**
 * The board: the Shelf's Items (or the Pantry's) as cards. As a grid, the columns are the Groups
 * and the rows can be plotlines or statuses, and dragging a card moves the Item on the Shelf.
 * As a free board (FreeBoard.tsx) the cards lie wherever they are put, for a mindmap or a flowchart.
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
  const here = host.path && host.cards.get(host.path)?.kind === 'scene' ? groups.find((g) => g.items.some((i) => i.path === host.path))?.path : undefined;
  const home = here ?? groups.find((g) => g.path !== BOOKSHELF)?.path ?? BOOKSHELF;
  const newHere = (spot?: Spot): MenuItem[] => {
    const place = (id: string | null) => id && spot && setPrefs((now) => ({ spots: { ...now.spots, [name]: { ...(now.spots[name] ?? {}), [id]: conf.snap ? snap(spot) : spot } } }));
    if (pantry) return PANTRY_SECTIONS.map((s) => ({ label: `New ${SINGULAR[s]}${spot ? ' here' : ''}`, onPick: () => void host.newCard(s).then(place) }));
    return [{ label: spot ? 'New Item here' : 'New Item', onPick: () => void host.newItem(home).then(place) }];
  };

  const total = items.length;
  const lead = (
    <Seg
      label="Layout"
      value={conf.layout}
      options={[
        { id: 'grid', name: 'Grid' },
        { id: 'free', name: 'Free' },
      ]}
      onPick={(layout) => set({ layout })}
    />
  );
  const tally = <Tally>{pantry ? `${total} in the Pantry` : `${total} ${total === 1 ? 'Item' : 'Items'} · ${groups.filter((g) => g.path !== BOOKSHELF).length} Groups`}</Tally>;
  if (conf.layout === 'free') return <FreeBoard host={host} ask={ask} pantry={pantry} groups={groups} items={items} ties={ties} conf={conf} set={set} newHere={newHere} tools={tools} lead={lead} tally={tally} />;
  return (
    <>
      {tools &&
        createPortal(
          <>
            {lead}
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
            {tally}
          </>,
          tools,
        )}
      <GridBoard host={host} ask={ask} pantry={pantry} groups={groups} items={items} rows={conf.rows} ties={ties} newHere={newHere} />
    </>
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
