import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { fromTouch, haptic, menuPress } from '../mobile';
import { usePhone } from '../ui/usePhone';
import { Icon } from '../ui/Icon';
import { createPortal } from 'react-dom';
import { PANTRY_SECTIONS } from '../storage/book';
import { type PantrySection, SECTION_KIND, SECTION_LABEL } from '../storage/pantry';
import { useStore } from '../ui/store';
import { type ViewProps } from './host';
import { type Item, type Tie, labelColor, layOut, pairTies, pantryGroups, tiesOf } from './model';
import { type Spot, prefsStore, setPrefs } from './prefs';
import { useBoardUndo } from './boardUndo';
import { Face, Tally, ToolButton, Zoomer, cardMenu } from './shared';
import { carryByTouch, dragFrom, scaleOf, usePanZoom } from './usePanZoom';

const SINGULAR: Record<PantrySection, string> = { characters: 'Character', settings: 'Setting', research: 'Material' };
const NODE = 56;

/**
 * The atlas: the Pantry as a map of who and what is tied to whom. Every Pantry Item is a
 * mark (round for a Character, square for a Setting, a diamond for a Material) and every
 * relationship a line with its words on it. Marks are dragged where they read best, and a
 * drag from a mark's edge to another ties the two.
 */
export function Atlas({ host, tools, ask }: ViewProps) {
  const prefs = useStore(prefsStore);
  // ⌘Z puts moved cards back. Ties are kept in the Pantry Items, not here.
  useBoardUndo('atlas', ['spots']);
  const { kinds, near } = prefs.atlas;
  const everything = useMemo(() => pantryGroups(host.pantryTree, host.cards).flatMap((g) => g.items), [host.pantryTree, host.cards]);
  const links = useMemo(() => host.links(), [host.indexVersion]);
  const byId = useMemo(() => new Map(everything.map((i) => [i.card.id, i])), [everything]);
  const pathId = useMemo(() => new Map(everything.map((i) => [i.path, i.card.id])), [everything]);
  const open = host.path ? pathId.get(host.path) : undefined;
  const allTies = useMemo(() => pairTies(links, (p) => pathId.get(p), new Set(byId.keys())), [links, byId, pathId]);
  const { items, ties } = useMemo(() => {
    let shown = everything.filter((i) => kinds.includes(i.card.kind));
    if (near && open) {
      const beside = new Set([open, ...allTies.flatMap((t) => (t.a === open ? [t.b] : t.b === open ? [t.a] : []))]);
      shown = shown.filter((i) => beside.has(i.card.id));
    }
    const ids = new Set(shown.map((i) => i.card.id));
    return { items: shown, ties: allTies.filter((t) => ids.has(t.a) && ids.has(t.b)) };
  }, [everything, kinds, near, open, allTies]);
  // Laid out with every Item in mind, so hiding a kind doesn't shuffle the rest.
  const spots = useMemo(() => layOut(everything.map((i) => i.card.id), allTies, prefs.spots.atlas ?? {}), [everything, allTies, prefs.spots.atlas]);
  const pan = usePanZoom({ x: -480, y: -320, k: 1 });
  const phone = usePhone();
  /** On a phone: the open piece's bar was put away with Done (until another piece is picked). */
  const [putAway, setPutAway] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ id: string; spot: Spot } | null>(null);
  /** The piece a finger has lifted to carry. */
  const [held, setHeld] = useState<string | null>(null);
  const [tying, setTying] = useState<{ from: string; to: Spot } | null>(null);
  const at = (id: string): Spot => (moved?.id === id ? moved.spot : spots[id]!);
  const put = (id: string, spot: Spot) => setPrefs((now) => ({ spots: { ...now.spots, atlas: { ...(now.spots.atlas ?? {}), [id]: spot } } }));
  const bounds = (): [number, number, number, number] | null =>
    items.length === 0 ? null : [Math.min(...items.map((i) => at(i.card.id)[0])) - 70, Math.min(...items.map((i) => at(i.card.id)[1])) - 50, Math.max(...items.map((i) => at(i.card.id)[0])) + 70, Math.max(...items.map((i) => at(i.card.id)[1])) + 70];
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || pan.size[0] === 0 || items.length === 0) return;
    fitted.current = true;
    pan.fit(bounds());
  }, [pan.size, items.length]);

  const saveTie = async (a: Item, b: Item, ab: string, ba: string) => {
    const write = (from: Item, to: Item, as: string) => {
      const rest = tiesOf(links, from.path).filter((r) => r.to !== to.card.id);
      const next = as.trim() ? [...rest, { to: to.card.id, as: as.trim() }] : rest;
      return host.setField(from.path, 'relationships', next.length > 0 ? next : undefined);
    };
    await write(a, b, ab);
    await write(b, a, ba);
  };
  const askTie = (a: Item, b: Item, tie: Tie | null) =>
    ask({
      title: tie ? 'Change this tie' : `Tie ${a.card.title} and ${b.card.title}`,
      note: 'Say it from either side, or both. It is kept on each Item’s own page in the Pantry.',
      fields: [
        { key: 'ab', label: `${a.card.title} is to ${b.card.title}`, value: (tie && (tie.a === a.card.id ? tie.ab : tie.ba)) ?? '', placeholder: 'Mother of', wide: true },
        { key: 'ba', label: `${b.card.title} is to ${a.card.title}`, value: (tie && (tie.a === a.card.id ? tie.ba : tie.ab)) ?? '', placeholder: 'Daughter of', wide: true },
      ],
      check: (v) => ((v.ab ?? '').trim() || (v.ba ?? '').trim() ? null : 'Say how they are tied, from at least one side.'),
      save: (v) => void saveTie(a, b, v.ab ?? '', v.ba ?? ''),
      other: tie ? { label: 'Remove tie', pick: () => void saveTie(a, b, '', '') } : undefined,
    });

  const tieMenu = (item: Item) => {
    const others = everything.filter((o) => o.card.id !== item.card.id).slice(0, 30);
    return others.map((o) => ({ label: o.card.title, onPick: () => askTie(item, o, allTies.find((t) => (t.a === item.card.id && t.b === o.card.id) || (t.b === item.card.id && t.a === o.card.id)) ?? null) }));
  };
  const centre = (): Spot => {
    const [x, y] = pan.toBoard(window.innerWidth / 2, window.innerHeight / 2);
    return [Math.round(x), Math.round(y)];
  };
  const newHere = (spot: Spot) => PANTRY_SECTIONS.map((s) => ({ label: `New ${SINGULAR[s]}`, onPick: () => void host.newCard(s).then((id) => id && put(id, spot)) }));
  const picked = phone && open && byId.has(open) && putAway !== open ? byId.get(open)! : null;
  const tap = (run: () => void) => () => {
    haptic('tick');
    run();
  };

  const toggleKind = (kind: string) => setPrefs({ atlas: { ...prefs.atlas, kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind] } });

  return (
    <>
      {tools &&
        createPortal(
          <>
            <span className="mode-seg" role="group" aria-label="Show">
              {PANTRY_SECTIONS.map((s) => (
                <button key={s} aria-pressed={kinds.includes(SECTION_KIND[s])} onClick={() => toggleKind(SECTION_KIND[s])}>
                  {SECTION_LABEL[s]}
                </button>
              ))}
            </span>
            <ToolButton label="Show only the open Item and what it is tied to" pressed={near} onClick={() => setPrefs({ atlas: { ...prefs.atlas, near: !near } })}>
              Close ties only
            </ToolButton>
            {!phone && <Zoomer k={pan.zoom} onZoom={pan.zoomStep} onFit={() => pan.fit(bounds())} />}
            <ToolButton label="Lay the atlas out afresh" onClick={() => setPrefs((now) => ({ spots: { ...now.spots, atlas: {} } }))}>
              Tidy up
            </ToolButton>
            <Tally>
              {items.length} in the Pantry · {ties.length} {ties.length === 1 ? 'tie' : 'ties'}
            </Tally>
          </>,
          tools,
        )}
      <div
        className="free-board atlas"
        ref={pan.ref}
        onPointerDown={pan.onPointerDown}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          const [x, y] = pan.toBoard(e.clientX, e.clientY);
          host.menu('Atlas', e.clientX, e.clientY, [
            ...PANTRY_SECTIONS.map((s) => ({ label: `New ${SINGULAR[s]} here`, onPick: () => void host.newCard(s).then((id) => id && put(id, [Math.round(x), Math.round(y)])) })),
            { separator: true },
            { label: 'Fit all', onPick: () => pan.fit(bounds()) },
          ]);
        }}
      >
        <div className="free-layer" ref={pan.layer}>
          <svg className="atlas-lines" width="1" height="1" aria-hidden="true">
            {ties.map((t) => {
              const [x1, y1] = at(t.a);
              const [x2, y2] = at(t.b);
              return <line key={`${t.a} ${t.b}`} x1={x1} y1={y1} x2={x2} y2={y2} className={open && (t.a === open || t.b === open) ? 'near' : ''} />;
            })}
            {tying && <line className="tying" x1={at(tying.from)[0]} y1={at(tying.from)[1]} x2={tying.to[0]} y2={tying.to[1]} />}
          </svg>
          {ties.map((t) => {
            const [x1, y1] = at(t.a);
            const [x2, y2] = at(t.b);
            const a = byId.get(t.a)!;
            const b = byId.get(t.b)!;
            // Read from the left-hand Item to the right-hand one, as the eye does.
            const words = (x1 <= x2 ? [t.ab, t.ba] : [t.ba, t.ab]).filter(Boolean).join(' · ');
            return (
              <button
                key={`${t.a} ${t.b}`}
                className="atlas-tie"
                style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
                title={[t.ab && `${a.card.title}: ${t.ab} ${b.card.title}`, t.ba && `${b.card.title}: ${t.ba} ${a.card.title}`].filter(Boolean).join('\n')}
                onClick={() => askTie(a, b, t)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  host.menu('Tie', e.clientX, e.clientY, [
                    { label: 'Change tie…', onPick: () => askTie(a, b, t) },
                    { label: 'Remove tie', danger: true, onPick: () => void saveTie(a, b, '', '') },
                  ]);
                }}
              >
                {words || 'tied'}
              </button>
            );
          })}
          {items.map((item) => {
            const id = item.card.id;
            const [x, y] = at(id);
            return (
              <div
                key={id}
                className={`atlas-node${id === open ? ' chosen' : ''}${moved?.id === id ? ' lifted' : ''}${held === id ? ' held' : ''}`}
                data-atlas={id}
                style={{ left: x, top: y, '--label': labelColor(item.card.label) ?? 'transparent' } as CSSProperties}
                role="button"
                tabIndex={0}
                title={item.card.synopsis || undefined}
                onKeyDown={(e) => e.key === 'Enter' && host.open(item.path)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const from = spots[id]!;
                  const el = e.currentTarget;
                  if (e.pointerType === 'touch')
                    return carryByTouch(e, pan, from, {
                      onLift: (on) => setHeld(on ? id : null),
                      onMove: (spot) => setMoved(spot ? { id, spot } : null),
                      onDrop: (spot) => (setMoved(null), put(id, spot)),
                      onMenu: (cx, cy) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })),
                      onTap: () => (item.path === host.path ? host.open(item.path) : host.select(item.path)),
                    });
                  const per = scaleOf(pan.node) * pan.live().k;
                  dragFrom(
                    e,
                    (dx, dy) => setMoved({ id, spot: [Math.round(from[0] + dx / per), Math.round(from[1] + dy / per)] }),
                    (did, up) => {
                      setMoved(null);
                      if (did) put(id, [Math.round(from[0] + (up.clientX - e.clientX) / per), Math.round(from[1] + (up.clientY - e.clientY) / per)]);
                      else if (item.path !== host.path) host.select(item.path);
                    },
                  );
                }}
                onDoubleClick={() => host.open(item.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // A finger's own long press lifts the piece instead (carryByTouch), which opens this menu itself if it isn't carried.
                  if (fromTouch(e) && e.nativeEvent.isTrusted) return;
                  const others = everything.filter((o) => o.card.id !== id).slice(0, 30);
                  host.menu(
                    'Pantry Item',
                    e.clientX,
                    e.clientY,
                    cardMenu(host, item, [
                      { separator: true },
                      {
                        label: 'Tie to',
                        disabled: others.length === 0,
                        items: others.map((o) => ({ label: o.card.title, onPick: () => askTie(item, o, allTies.find((t) => (t.a === id && t.b === o.card.id) || (t.b === id && t.a === o.card.id)) ?? null) })),
                      },
                    ]),
                  );
                }}
              >
                <Face host={host} item={item} size={NODE} />
                <span className="atlas-name">{item.card.title}</span>
                <span
                  className="atlas-handle"
                  title="Drag to another to tie them"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    dragFrom(
                      e,
                      (_dx, _dy, m) => setTying({ from: id, to: pan.toBoard(m.clientX, m.clientY) }),
                      (_did, up) => {
                        setTying(null);
                        const target = (document.elementFromPoint(up.clientX, up.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-atlas]')?.dataset.atlas;
                        const other = target && target !== id ? byId.get(target) : undefined;
                        if (other) askTie(item, other, allTies.find((t) => (t.a === id && t.b === target) || (t.b === id && t.a === target)) ?? null);
                      },
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
        {everything.length === 0 && <p className="mode-empty">The Pantry is empty. {menuPress()} here for a new Character, Setting or Material.</p>}
      </div>
      {phone &&
        (picked ? (
          // The open piece, with what can be done to it, on the board (as on the free board).
          <div className="canvas-dock canvas-selection" role="toolbar" aria-label={picked.card.title}>
            <div className="dock-acts">
              <button type="button" className="dock-act" onClick={tap(() => host.open(picked.path))}>
                <span className="dock-act-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                </span>
                Open
              </button>
              <button type="button" className="dock-act" disabled={everything.length < 2} onClick={(e) => (haptic('tick'), host.menu('Tie to', 0, 0, tieMenu(picked), e.currentTarget))}>
                <span className="dock-act-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="12" r="3" />
                    <path d="M9 12h6" />
                  </svg>
                </span>
                Tie to
              </button>
              <button type="button" className="dock-act" onClick={tap(() => setPrefs({ atlas: { ...prefs.atlas, near: !near } }))} aria-pressed={near}>
                <span className="dock-act-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="8" strokeDasharray={near ? '0' : '3 3'} />
                  </svg>
                </span>
                {near ? 'Show all' : 'Close ties'}
              </button>
            </div>
            <button type="button" className="dock-done" onClick={tap(() => setPutAway(open!))}>
              Done
            </button>
          </div>
        ) : (
          <div className="canvas-dock canvas-idle">
            <button type="button" className="dock-round" aria-label={`See the whole atlas (now ${Math.round(pan.zoom * 100)}%)`} onClick={tap(() => pan.fit(bounds()))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
              <span className="dock-zoom">{Math.round(pan.zoom * 100)}%</span>
            </button>
            <button type="button" className="phone-fab dock-add" aria-label="Add to the Pantry" onClick={(e) => (haptic('tick'), host.menu('New', 0, 0, newHere(centre()), e.currentTarget))}>
              <Icon name="add" size={24} />
            </button>
          </div>
        ))}
    </>
  );
}
