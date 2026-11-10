import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { STATUSES } from '../storage/document';
import { sayWhen } from '../storage/storyDate';
import { StatusIcon } from '../ui/StatusIcon';
import { useStore } from '../ui/store';
import { type ViewProps } from './host';
import { type Item, dropPlace, plotlineName, shelfGroups } from './model';
import { OUTLINE_COLUMNS, prefsStore, setPrefs } from './prefs';
import { LabelDot, Pick, Synopsis, Tally, itemMenu } from './shared';

const DRAG = 'application/x-cookbook-item';

/**
 * The outline: every Item of the Shelf as a line, under its Group, with its synopsis beside it.
 * The synopsis is written here; everything else is a click or a right-click away.
 */
export function Outline({ host, tools, ask }: ViewProps) {
  const prefs = useStore(prefsStore);
  const groups = useMemo(() => shelfGroups(host.tree, host.cards), [host.tree, host.cards]);
  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const columns = OUTLINE_COLUMNS.filter((c) => prefs.outline.columns.includes(c.id));
  const has = (id: string) => columns.some((c) => c.id === id);
  const shown = groups.filter((g) => !scope || g.path === scope).map((g) => ({ ...g, items: g.items.filter((i) => !status || i.card.status === status) }));
  const all = shown.flatMap((g) => g.items);
  const words = all.reduce((sum, i) => sum + i.card.words, 0);

  const drop = (e: React.DragEvent, group: string, before: string | null) => {
    const from = e.dataTransfer.getData(DRAG);
    setOver(null);
    if (!from || from === before) return;
    e.preventDefault();
    const place = dropPlace(host.tree, group, before);
    void host.move(from, place.folder, place.at);
  };
  const allow = (e: React.DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes(DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  };

  const columnsMenu = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    host.menu(
      'Columns',
      box.left,
      box.bottom + 4,
      OUTLINE_COLUMNS.map((c) => ({ label: c.name, checked: has(c.id), onPick: () => setPrefs({ outline: { columns: has(c.id) ? prefs.outline.columns.filter((x) => x !== c.id) : [...prefs.outline.columns, c.id] } }) })),
    );
  };

  const row = (item: Item) => (
    <tr
      key={item.path}
      className={`${item.path === host.path ? 'chosen' : ''}${over === item.path ? ' drop-before' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, item.path);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => allow(e, item.path)}
      onDrop={(e) => drop(e, item.group, item.path)}
      onClick={() => item.path !== host.path && host.select(item.path)}
      onDoubleClick={(e) => !(e.target instanceof HTMLTextAreaElement) && host.open(item.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        host.menu('Item', e.clientX, e.clientY, itemMenu(host, item, ask));
      }}
    >
      <th scope="row">
        <button className="outline-title" onKeyDown={(e) => e.key === 'Enter' && host.open(item.path)} title="Double-click to open in Cook">
          {item.card.title}
        </button>
      </th>
      {has('synopsis') && (
        <td className="outline-synopsis">
          <Synopsis key={item.card.synopsis} value={item.card.synopsis} label={`Synopsis of ${item.card.title}`} onSave={(text) => void host.setField(item.path, 'synopsis', text || undefined)} />
        </td>
      )}
      {has('label') && (
        <td className="outline-label">
          {item.card.label && (
            <>
              <LabelDot label={item.card.label} /> {plotlineName(item.card.label, prefs.plotlines)}
            </>
          )}
        </td>
      )}
      {has('status') && (
        <td className="outline-status">
          <StatusIcon status={item.card.status} decorative /> {STATUSES.find((s) => s.id === item.card.status)!.label}
        </td>
      )}
      {has('when') && <td className="outline-when">{item.card.dates[0] ? sayWhen(item.card.dates[0]) : ''}</td>}
      {has('words') && <td className="outline-words">{item.card.words.toLocaleString('en')}</td>}
    </tr>
  );

  return (
    <div className="outline">
      {tools &&
        createPortal(
          <>
            <Pick label="Show" value={scope} options={[{ id: '', name: 'Whole recipe' }, ...groups.map((g) => ({ id: g.path, name: g.title }))]} onPick={setScope} />
            <Pick label="Status" value={status} options={[{ id: '', name: 'Any status' }, ...STATUSES.map((s) => ({ id: s.id as string, name: s.label }))]} onPick={setStatus} />
            <button className="mode-btn" aria-haspopup="menu" title="Choose columns" onClick={columnsMenu}>
              Columns
            </button>
            <Tally>
              {all.length.toLocaleString('en')} {all.length === 1 ? 'Item' : 'Items'} · {words.toLocaleString('en')} words
            </Tally>
          </>,
          tools,
        )}
      {all.length === 0 && groups.length === 0 ? (
        <p className="mode-empty">Nothing on the Shelf yet. Right-click the Shelf to add a Group or an Item, and it will be listed here.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className={`outline-${c.id}`}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          {shown.map((g) => (
            <tbody key={g.path}>
              <tr
                className={`outline-group${over === g.path ? ' drop-into' : ''}`}
                onDragOver={(e) => allow(e, g.path)}
                onDrop={(e) => drop(e, g.path, null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  host.menu('Group', e.clientX, e.clientY, [
                    { label: 'New Item here', onPick: () => void host.newItem(g.path) },
                    { label: 'New Group', onPick: host.newGroup },
                  ]);
                }}
              >
                <th scope="rowgroup" colSpan={columns.length + 1}>
                  {g.title}
                  <span className="outline-count">
                    {g.items.length} · {g.items.reduce((sum, i) => sum + i.card.words, 0).toLocaleString('en')} words
                  </span>
                </th>
              </tr>
              {g.items.map(row)}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
}
