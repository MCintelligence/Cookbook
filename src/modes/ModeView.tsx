import { useState } from 'react';
import { useStore } from '../ui/store';
import { Arcs } from './Arcs';
import { Atlas } from './Atlas';
import { Board } from './Board';
import { CalendarView } from './CalendarView';
import { type Form, type ModeHost } from './host';
import { Outline } from './Outline';
import { MODES, VIEWS, type Mode, prefsStore, setPrefs, sideOf, viewOf } from './prefs';
import { FormBox, Pick } from './shared';
import { Timeline } from './Timeline';
import './modes.css';

interface Props {
  host: ModeHost;
  mode: Exclude<Mode, 'cook'>;
  openIsCard: boolean;
}

/**
 * Prep or Plan, in place of the page and its toolbar. The toolbar's first box, where Cook has
 * the Style box, picks the view; the rest of the toolbar belongs to the view that is showing.
 */
export default function ModeView({ host, mode, openIsCard }: Props) {
  const prefs = useStore(prefsStore);
  const side = sideOf(prefs.together, openIsCard);
  const view = viewOf(prefs, mode, side);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const name = MODES.find((m) => m.id === mode)!.name;
  const props = { host, side, tools, ask: setForm };
  return (
    <>
      <div role="toolbar" aria-label={`${name} toolbar`} className={`toolbar mode-toolbar mode-is-${mode}`}>
        <Pick lead label={`${name} view`} value={view} options={VIEWS[mode][side]} onPick={(id) => setPrefs((now) => ({ view: { ...now.view, [`${mode}:${side}`]: id } }))} />
        <span className="tb-sep" />
        <div className="mode-tools" ref={setTools} />
      </div>
      <section className={`mode-desk mode-view-${view}`} aria-label={`${name}: ${VIEWS[mode][side].find((v) => v.id === view)!.name}`}>
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
