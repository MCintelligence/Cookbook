import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../ui/store';
import { Arcs } from './Arcs';
import { Atlas } from './Atlas';
import { Board } from './Board';
import { CalendarView } from './CalendarView';
import { type Form, type ModeHost, SHELF_DROP, type ShelfDrop } from './host';
import { Outline } from './Outline';
import { MODES, VIEWS, type Mode, prefsStore, setPrefs, sideOf, viewOf } from './prefs';
import { FormBox, Pick } from './shared';
import { Timeline } from './Timeline';
import { usePhone } from '../ui/usePhone';
import { haptic } from '../mobile';
import './modes.css';

interface Props {
  host: Omit<ModeHost, 'remove'>;
  mode: Exclude<Mode, 'cook'>;
  openIsCard: boolean;
}

/**
 * Prep or Plan, in place of the page and its toolbar. The toolbar's first box, where Cook has
 * the Style box, picks the view; the rest of the toolbar belongs to the view that is showing.
 */
export default function ModeView({ host, mode, openIsCard }: Props) {
  const prefs = useStore(prefsStore);
  const side = sideOf(openIsCard);
  const view = viewOf(prefs, mode, side);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [desk, setDesk] = useState<HTMLElement | null>(null);
  const name = MODES.find((m) => m.id === mode)!.name;
  const phone = usePhone();
  /** On a phone: whether the view's settings sheet is up. */
  const [sheet, setSheet] = useState(false);
  // A new view or place starts with its sheet down.
  useEffect(() => setSheet(false), [view, mode]);
  // Back (or Escape) closes the sheet first; it is a dialog only while it shows, so goBack finds it.
  useEffect(() => {
    if (!sheet) return;
    const el = document.querySelector<HTMLElement>('.phone-mode-sheet');
    el?.focus({ preventScroll: true });
  }, [sheet]);
  const hidden = prefs.hidden[mode];
  // Removed Items are left out of what this mode's views are given, so every view leaves them out alike.
  const cards = useMemo(() => {
    if (hidden.length === 0) return host.cards;
    const gone = new Set(hidden);
    return new Map([...host.cards].filter(([, c]) => !gone.has(c.id)));
  }, [host.cards, hidden]);
  const remove = (path: string) => {
    const card = host.cards.get(path);
    if (!card) return;
    setPrefs((now) => ({ hidden: { ...now.hidden, [mode]: [...new Set([...now.hidden[mode], card.id])] } }));
    host.say(`Removed “${card.title}” from ${name}. Drag it in from the ${card.kind === 'scene' ? 'Shelf' : 'Pantry'} to bring it back.`);
  };
  const shown: ModeHost = { ...host, cards, remove };
  // A row dragged in from the Shelf or Pantry comes back if it was removed.
  useEffect(() => {
    if (!desk) return;
    const land = (e: Event) => {
      const id = (e as CustomEvent<ShelfDrop>).detail.card?.id;
      if (id && prefsStore.get().hidden[mode].includes(id)) setPrefs((now) => ({ hidden: { ...now.hidden, [mode]: now.hidden[mode].filter((h) => h !== id) } }));
    };
    desk.addEventListener(SHELF_DROP, land);
    return () => desk.removeEventListener(SHELF_DROP, land);
  }, [desk, mode]);
  const props = { host: shown, side, tools, ask: setForm };
  const pickView = <Pick lead label={`${name} view`} value={view} options={VIEWS[mode][side]} onPick={(id) => setPrefs((now) => ({ view: { ...now.view, [`${mode}:${side}`]: id } }))} />;
  const viewName = VIEWS[mode][side].find((v) => v.id === view)!.name;
  return (
    <>
      {phone ? (
        // A phone keeps one row: which view, and a button for the rest of its settings, which wait
        // in a sheet from the bottom. The sheet is always there (the view draws its settings into
        // it) and only shown when asked for.
        <>
          <div role="toolbar" aria-label={`${name} toolbar`} className={`toolbar mode-toolbar phone-mode-bar mode-is-${mode}`}>
            {pickView}
            <button type="button" className="phone-mode-more" aria-label={`${viewName} settings`} aria-expanded={sheet} aria-haspopup="dialog" onClick={() => (haptic('tick'), setSheet(!sheet))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </svg>
            </button>
          </div>
          <div className="phone-mode-sheet-wrap" data-open={sheet}>
            <div className="menu-sheet-shade" onClick={() => setSheet(false)} />
            <section
              className="phone-mode-sheet"
              role={sheet ? 'dialog' : undefined}
              aria-modal={sheet || undefined}
              aria-label={`${viewName} settings`}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setSheet(false))}
              tabIndex={-1}
            >
              <header className="phone-sheet-head">
                <span className="menu-sheet-grip" />
                <span className="phone-sheet-title">{viewName}</span>
                <button type="button" className="phone-sheet-done" onClick={() => setSheet(false)}>
                  Done
                </button>
              </header>
              <div className="mode-tools" ref={setTools} />
            </section>
          </div>
        </>
      ) : (
        <div role="toolbar" aria-label={`${name} toolbar`} className={`toolbar mode-toolbar mode-is-${mode}`}>
          {pickView}
          <span className="tb-sep" />
          <div className="mode-tools" ref={setTools} />
        </div>
      )}
      <section ref={setDesk} className={`mode-desk mode-view-${view}`} aria-label={`${name}: ${VIEWS[mode][side].find((v) => v.id === view)!.name}`}>
        {view === 'outline' && <Outline {...props} />}
        {view === 'board' && <Board key="shelf" {...props} pantry={false} />}
        {view === 'pboard' && <Board key="pantry" {...props} pantry />}
        {view === 'atlas' && <Atlas {...props} />}
        {(view === 'calendar' || view === 'pcalendar') && <CalendarView {...props} />}
        {view === 'timeline' && <Timeline {...props} />}
        {view === 'arcs' && <Arcs {...props} />}
      </section>
      {form && <FormBox form={form} onClose={() => setForm(null)} />}
    </>
  );
}
