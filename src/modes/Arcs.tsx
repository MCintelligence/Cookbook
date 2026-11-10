import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ARC_LEVELS, type ArcBeat } from '../storage/document';
import { useStore } from '../ui/store';
import { type ViewProps } from './host';
import { type Item, pantryGroups, shelfGroups } from './model';
import { prefsStore, setPrefs } from './prefs';
import { Face, Pick, Tally, ToolButton } from './shared';

const COL = 84;
const ROW = 128;
const NAMES = 176;
const STEP = 17;
/** How things stand for someone, from the top of the chart to the bottom. */
export const LEVEL_NAMES: Record<number, string> = { 2: 'Flying', 1: 'Looking up', 0: 'Steady', [-1]: 'Slipping', [-2]: 'Rock bottom' };

interface Editing {
  who: Item;
  scene: Item;
  x: number;
  y: number;
}

/**
 * Arcs: the Shelf's Items left to right, and a line for each Character showing how things
 * stand for them as the story goes. A ring marks every Item that names them (found in the
 * writing itself); a click sets a beat, higher for better, with a word or two on why.
 */
export function Arcs({ host, tools }: ViewProps) {
  const prefs = useStore(prefsStore);
  const { kinds, quiet } = prefs.arcs;
  const groups = useMemo(() => shelfGroups(host.tree, host.cards), [host.tree, host.cards]);
  const [scope, setScope] = useState('');
  const shown = groups.filter((g) => (!scope || g.path === scope) && g.items.length > 0);
  const scenes = shown.flatMap((g) => g.items);
  const people = useMemo(() => pantryGroups(host.pantryTree, host.cards).flatMap((g) => g.items).filter((i) => kinds.includes(i.card.kind)), [host.pantryTree, host.cards, kinds]);
  // Who is named where, read from the index when Arcs opens and when the writing changes: never while typing in Cook.
  const named = useMemo(() => new Map(people.map((p) => [p.card.id, new Map(host.mentions(p.card).map((m) => [m.path, m.count]))])), [people, host.indexVersion]);
  const rows = quiet ? people.filter((p) => Object.keys(p.card.arc).length > 0 || scenes.some((s) => named.get(p.card.id)?.has(s.path))) : people;
  const beats = rows.reduce((sum, p) => sum + scenes.filter((s) => p.card.arc[s.card.id]).length, 0);
  const [editing, setEditing] = useState<Editing | null>(null);

  const setBeat = (who: Item, scene: Item, beat: ArcBeat | null) => {
    const { [scene.card.id]: _old, ...rest } = who.card.arc;
    const next = beat ? { ...rest, [scene.card.id]: beat } : rest;
    void host.setField(who.path, 'arc', Object.keys(next).length > 0 ? next : undefined);
  };
  const width = scenes.length * COL;
  const mid = ROW / 2;
  const yOf = (level: number) => mid - level * STEP;
  const kindChoice = kinds.includes('research') ? 'all' : kinds.includes('setting') ? 'places' : 'people';

  return (
    <div className="arcs">
      {tools &&
        createPortal(
          <>
            <Pick
              label="Whose arcs"
              value={kindChoice}
              options={[
                { id: 'people', name: 'Characters' },
                { id: 'places', name: 'Characters and Settings' },
                { id: 'all', name: 'The whole Pantry' },
              ]}
              onPick={(c) => setPrefs({ arcs: { ...prefs.arcs, kinds: c === 'all' ? ['character', 'setting', 'research'] : c === 'places' ? ['character', 'setting'] : ['character'] } })}
            />
            <Pick label="Across" value={scope} options={[{ id: '', name: 'Whole recipe' }, ...groups.map((g) => ({ id: g.path, name: g.title }))]} onPick={setScope} />
            <ToolButton label="Leave out anyone who isn’t named or given a beat here" pressed={quiet} onClick={() => setPrefs({ arcs: { ...prefs.arcs, quiet: !quiet } })}>
              Only who appears
            </ToolButton>
            <Tally>
              {rows.length} {rows.length === 1 ? 'arc' : 'arcs'} · {beats} {beats === 1 ? 'beat' : 'beats'}
            </Tally>
          </>,
          tools,
        )}
      {people.length === 0 || scenes.length === 0 ? (
        <p className="mode-empty">{people.length === 0 ? 'No one in the Pantry yet. Add a Character there, and their arc can be drawn here.' : 'Nothing on the Shelf yet for an arc to run through.'}</p>
      ) : (
        <div className="arcs-grid" style={{ gridTemplateColumns: `${NAMES}px ${width}px` }}>
          <div className="arcs-corner" />
          <div className="arcs-head">
            <div className="arcs-groups">
              {shown.map((g) => (
                <span key={g.path} style={{ width: g.items.length * COL }} title={g.title}>
                  {g.title}
                </span>
              ))}
            </div>
            <div className="arcs-items">
              {scenes.map((s) => (
                <button key={s.path} style={{ width: COL }} className={s.path === host.path ? 'chosen' : ''} title={`${s.card.title}${s.card.synopsis ? `\n${s.card.synopsis}` : ''}`} onClick={() => host.select(s.path)} onDoubleClick={() => host.open(s.path)}>
                  {s.card.title}
                </button>
              ))}
            </div>
          </div>
          {rows.map((who) => {
            const seen = named.get(who.card.id);
            const points = scenes.flatMap((s, i) => (who.card.arc[s.card.id] ? [{ x: i * COL + COL / 2, y: yOf(who.card.arc[s.card.id]!.level), beat: who.card.arc[s.card.id]!, s }] : []));
            return (
              <div key={who.path} className="arcs-row" style={{ display: 'contents' }}>
                <button className={`arcs-name${who.path === host.path ? ' chosen' : ''}`} onClick={() => who.path !== host.path && host.select(who.path)} onDoubleClick={() => host.open(who.path)} title="Double-click to open in Cook">
                  <Face host={host} item={who} size={30} />
                  <span>{who.card.title}</span>
                </button>
                <div className="arcs-line" style={{ height: ROW }}>
                  <svg width={width} height={ROW} aria-hidden="true">
                    <line className="arcs-mid" x1="0" x2={width} y1={mid} y2={mid} />
                    {scenes.map((s, i) => seen?.has(s.path) && !who.card.arc[s.card.id] && <circle key={s.path} className="arcs-seen" cx={i * COL + COL / 2} cy={mid} r="3.5" />)}
                    {points.length > 1 && <polyline className="arcs-path" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />}
                    {points.map((p) => (
                      <g key={p.s.path}>
                        <circle className="arcs-beat" cx={p.x} cy={p.y} r="5.5" />
                        {p.beat.note && (
                          <text className="arcs-note" x={p.x} y={p.beat.level >= 0 ? p.y - 11 : p.y + 19} textAnchor="middle">
                            {p.beat.note.length > 13 ? `${p.beat.note.slice(0, 12)}…` : p.beat.note}
                          </text>
                        )}
                      </g>
                    ))}
                  </svg>
                  {scenes.map((s, i) => {
                    const beat = who.card.arc[s.card.id];
                    const count = seen?.get(s.path) ?? 0;
                    return (
                      <button
                        key={s.path}
                        className="arcs-cell"
                        style={{ left: i * COL, width: COL } as CSSProperties}
                        aria-label={`${who.card.title} in ${s.card.title}: ${beat ? `${LEVEL_NAMES[beat.level]}${beat.note ? `, ${beat.note}` : ''}` : count > 0 ? 'named, no beat' : 'no beat'}`}
                        title={`${who.card.title} in “${s.card.title}”${count > 0 ? ` · named ${count} ${count === 1 ? 'time' : 'times'}` : ''}${beat ? `\n${LEVEL_NAMES[beat.level]}${beat.note ? `: ${beat.note}` : ''}` : '\nClick to set a beat'}`}
                        onClick={(e) => setEditing({ who, scene: s, x: e.clientX, y: e.clientY })}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          host.menu('Beat', e.clientX, e.clientY, [
                            ...ARC_LEVELS.map((level) => ({ label: LEVEL_NAMES[level]!, checked: beat?.level === level, onPick: () => setBeat(who, s, { level, note: beat?.note ?? '' }) })),
                            { separator: true },
                            { label: 'Open the Item in Cook', onPick: () => host.open(s.path) },
                            { label: 'Clear beat', danger: true, disabled: !beat, onPick: () => setBeat(who, s, null) },
                          ]);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <BeatBox key={`${editing.who.path}|${editing.scene.path}`} editing={editing} beat={host.cards.get(editing.who.path)?.arc[editing.scene.card.id] ?? null} onBeat={(beat) => setBeat({ ...editing.who, card: host.cards.get(editing.who.path) ?? editing.who.card }, editing.scene, beat)} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The small box a click on the chart opens: five rungs to pick from, and a few words on why. */
function BeatBox({ editing, beat, onBeat, onClose }: { editing: Editing; beat: ArcBeat | null; onBeat(beat: ArcBeat | null): void; onClose(): void }) {
  const [note, setNote] = useState(beat?.note ?? '');
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, []);
  const saveNote = () => beat && note.trim() !== beat.note && onBeat({ ...beat, note: note.trim() });
  return (
    <div
      ref={box}
      className="beat-box"
      role="dialog"
      aria-label={`${editing.who.card.title} in ${editing.scene.card.title}`}
      style={{ left: Math.min(editing.x + 8, window.innerWidth - 248), top: Math.min(editing.y + 8, window.innerHeight - 300) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h3>
        {editing.who.card.title} <span>in “{editing.scene.card.title}”</span>
      </h3>
      <div className="beat-levels" role="radiogroup" aria-label="How things stand">
        {ARC_LEVELS.map((level) => (
          <button key={level} role="radio" aria-checked={beat?.level === level} autoFocus={beat ? beat.level === level : level === 0} onClick={() => onBeat({ level, note: note.trim() })}>
            <i data-level={level} />
            {LEVEL_NAMES[level]}
          </button>
        ))}
      </div>
      <input
        aria-label="Why, in a word or two"
        placeholder="Why, in a word or two"
        value={note}
        maxLength={60}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (beat) saveNote();
          else onBeat({ level: 0, note: note.trim() });
          onClose();
        }}
      />
      <div className="beat-end">
        <button disabled={!beat} onClick={() => { onBeat(null); onClose(); }}>
          Clear beat
        </button>
        <button className="primary" onClick={() => { saveNote(); onClose(); }}>
          Done
        </button>
      </div>
    </div>
  );
}
