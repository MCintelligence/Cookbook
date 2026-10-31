import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { checkedOff, isDialogueFocus, setDialogueFocus } from '../editor/seasonings';
import { type FoundIssue, issuesOf } from '../proofread/plugin';
import { KIND_OF, METERS, SEASONINGS, type SeasoningId, meterRemark, ownerOf, perThousand, spiceOf, tasteOf } from '../proofread/remarks';
import { readingGrade } from '../proofread/style';
import { docReading, docTalk, docWords } from '../editor/docStats';
import { Face } from './Faces';
import { type MenuItem } from './Menu';
import { BAR_ICONS, PanelBar } from './PanelBar';

interface Props {
  editor: Editor | null;
  chosen: SeasoningId[];
  onChosen: (chosen: SeasoningId[]) => void;
  /** Seasonings whose Check is off: their meter still reads, but nothing of theirs is marked on the page. */
  unchecked: SeasoningId[];
  onUnchecked: (unchecked: SeasoningId[]) => void;
  onClose: () => void;
  /** Every seasoning switched off for now, and a way to switch them back on. */
  paused: boolean;
  onPaused: (paused: boolean) => void;
  /** Shows a right-click menu. */
  onMenu: (label: string, x: number, y: number, items: MenuItem[]) => void;
}

/** A grade level from a few words means nothing, so Sally waits for a paragraph or two. */
const MIN_GRADE_WORDS = 50;
const LONG_PRESS_MS = 400;

export function Seasonings({ editor, chosen, onChosen, unchecked, onUnchecked, onClose, paused, onPaused, onMenu }: Props) {
  // A new work starts with nothing picked, so the picker shows until Done.
  const [picking, setPicking] = useState(chosen.length === 0);
  useEffect(() => {
    if (chosen.length === 0) setPicking(true);
  }, [chosen.length]);
  // The seasoning being dragged by its head, and where it would land among the others.
  const [drag, setDrag] = useState<{ id: SeasoningId; index: number | null } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // Moving a card takes it out of the page and back, which drops the keyboard; it's put back once the list is redrawn.
  const refocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const held = refocus.current;
    refocus.current = null;
    if (!held?.isConnected || document.activeElement === held) return;
    // "Move down" turns off at the bottom of the list, so the keyboard goes to the card's first button that still works.
    const to = held instanceof HTMLButtonElement && held.disabled ? held.closest('.sc')?.querySelector<HTMLElement>('.handles button:not(:disabled)') : held;
    to?.focus({ preventScroll: true });
  }, [chosen]);
  const justDragged = useRef(false);
  // Seasonings picked for the toolbar and menu, by clicking their heads.
  const [marked, setMarked] = useState<SeasoningId[]>([]);
  const picked = marked.filter((id) => chosen.includes(id));
  // Every count here is kept per paragraph or per set of underlines (see docStats and issuesOf), so a
  // cursor move costs nothing and a keystroke recounts one paragraph. Only numbers come out, so the
  // panel only draws again when one of them changes.
  const page = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const { state } = editor;
      const slips = slipsOf(issuesOf(state));
      const grade = readingGrade(docReading(state.doc));
      const talk = docTalk(state.doc);
      return {
        words: docWords(state.doc),
        sam: slips.sam,
        pete: slips.pete,
        sally: slips.sally,
        grade: grade.grade,
        gradeWords: grade.words,
        talkWords: talk.words,
        spoken: talk.spoken,
        dim: isDialogueFocus(state),
        off: [...checkedOff(state)].sort().join(' '),
      };
    },
  });
  if (!editor || !page) return null;

  const showPicker = picking;
  const move = (id: SeasoningId, to: 'top' | 'up' | 'down' | 'bottom') => {
    // The card is drawn again in its new place; the keyboard stays on the same button or card.
    const held = document.activeElement;
    if (held instanceof HTMLElement && list.current?.contains(held)) refocus.current = held;
    const rest = chosen.filter((c) => c !== id);
    const at = chosen.indexOf(id);
    const index = to === 'top' ? 0 : to === 'bottom' ? rest.length : to === 'up' ? Math.max(0, at - 1) : Math.min(rest.length, at + 1);
    onChosen([...rest.slice(0, index), id, ...rest.slice(index)]);
  };
  const remove = (id: SeasoningId) => onChosen(chosen.filter((c) => c !== id));
  const removeAll = (ids: SeasoningId[]) => {
    onChosen(chosen.filter((c) => !ids.includes(c)));
    setMarked([]);
  };
  const everything = chosen.length > 0 && picked.length === chosen.length;
  /** A click on a head picks that seasoning; with Ctrl, ⌘ or Shift it adds to or takes from the others. */
  const pick = (e: React.MouseEvent, id: SeasoningId) => {
    if (justDragged.current || (e.target as HTMLElement).closest('button')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) setMarked(picked.includes(id) ? picked.filter((m) => m !== id) : [...picked, id]);
    else setMarked(picked.length === 1 && picked[0] === id ? [] : [id]);
  };
  const turn = { label: paused ? 'Turn seasonings on' : 'Turn seasonings off', onPick: () => onPaused(!paused) };
  const cardMenu = (e: React.MouseEvent, id: SeasoningId, at: number) => {
    // The Check and Report have buttons of their own.
    if ((e.target as HTMLElement).closest('.sc-foot')) return;
    e.preventDefault();
    const who = SEASONINGS.find((s) => s.id === id)!;
    const several = picked.includes(id) && picked.length > 1;
    if (!picked.includes(id)) setMarked([id]);
    onMenu(who.name, e.clientX, e.clientY, [
      ...(several
        ? [{ heading: `${picked.length} picked` }, { label: `Remove ${picked.length} picked`, danger: true, onPick: () => removeAll(picked) }]
        : [
            { label: 'Move to top', disabled: at === 0, onPick: () => move(id, 'top') },
            { label: 'Move up', disabled: at === 0, onPick: () => move(id, 'up') },
            { label: 'Move down', disabled: at === chosen.length - 1, onPick: () => move(id, 'down') },
            { label: 'Move to bottom', disabled: at === chosen.length - 1, onPick: () => move(id, 'bottom') },
            { separator: true } as const,
            { label: `Remove ${who.name}`, danger: true, onPick: () => removeAll([id]) },
          ]),
      { separator: true },
      ...panelItems(),
    ]);
  };
  const panelItems = (): MenuItem[] => [
    { label: 'Add a seasoning…', disabled: picking, onPick: () => setPicking(true) },
    { label: 'Select all', disabled: chosen.length === 0 || everything, onPick: () => setMarked([...chosen]) },
    { label: 'Deselect all', disabled: picked.length === 0, onPick: () => setMarked([]) },
    { separator: true },
    turn,
  ];
  /** Where a drop at (x, y) would put a card, as an index into the list. */
  const target = (x: number, y: number): number | null => {
    const cards = Array.from(list.current?.querySelectorAll<HTMLElement>('.sc') ?? []);
    if (cards.length === 0) return null;
    const box = list.current!.getBoundingClientRect();
    if (x < box.left - 24 || x > box.right + 24) return null;
    const at = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return at === -1 ? cards.length : at;
  };
  const begin = (e: ReactPointerEvent, id: SeasoningId) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const touch = e.pointerType !== 'mouse';
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    // Whatever scrolls the panel, so a long list scrolls while a card is held near its edge.
    let scroller = list.current?.parentElement ?? null;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const start = () => {
      active = true;
      setDrag({ id, index: null });
      navigator.vibrate?.(10);
    };
    // On a touch screen a long press picks the card up, so a plain swipe still scrolls.
    const timer = touch ? window.setTimeout(start, LONG_PRESS_MS) : undefined;
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < (touch ? 8 : 4)) return;
        if (touch) return finish();
        start();
      }
      setDrag({ id, index: target(ev.clientX, ev.clientY) });
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (ev.clientY < box.top + 40) scroller.scrollBy(0, -12);
        else if (ev.clientY > box.bottom - 40) scroller.scrollBy(0, 12);
      }
    };
    const up = (ev: PointerEvent) => {
      const index = active ? target(ev.clientX, ev.clientY) : null;
      finish();
      if (index === null) return;
      const from = chosen.indexOf(id);
      // Dropping just above or below itself leaves it where it is.
      if (index === from || index === from + 1) return;
      const rest = chosen.filter((c) => c !== id);
      const to = index > from ? index - 1 : index;
      onChosen([...rest.slice(0, to), id, ...rest.slice(to)]);
    };
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish();
    const holdStill = (ev: TouchEvent) => active && ev.preventDefault();
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', holdStill);
      if (active) {
        // The click that ends a drag should not also pick the card.
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', holdStill, { passive: false });
  };
  // No line where a drop would leave the card where it is.
  const from = drag ? chosen.indexOf(drag.id) : -1;
  const dropAt = drag?.index != null && drag.index !== from && drag.index !== from + 1 ? drag.index : null;
  const toggle = (id: SeasoningId) => onChosen(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  const off = page.off ? page.off.split(' ') : [];
  /** Whether a seasoning's Check is on: Daniel's dims the narration, the others' show their underlines. */
  const checking = (id: SeasoningId) => (id === 'daniel' ? page.dim : !off.includes(KIND_OF[id]!));
  const setChecking = (id: SeasoningId, on: boolean) => {
    if (id === 'daniel') return setDialogueFocus(editor, on);
    onUnchecked(on ? unchecked.filter((u) => u !== id) : [...new Set([...unchecked, id])]);
  };
  /** Where each seasoning's meter stands, and what it shows beside its level; null while there's too little page to read. */
  const reading = (id: SeasoningId): { at: number; detail: string } | null => {
    if (id === 'daniel') {
      if (page.talkWords === 0) return null;
      const share = Math.round((page.spoken / page.talkWords) * 100);
      return { at: tasteOf(METERS.daniel.steps, share), detail: `${share}% dialogue · ${100 - share}% narration` };
    }
    if (id === 'sally') {
      if (page.gradeWords < MIN_GRADE_WORDS) return null;
      return { at: spiceOf(page.grade), detail: `Grade ${page.grade} · ${plural(page.sally, 'style note')}` };
    }
    if (page.words === 0) return null;
    const slips = page[id];
    const per = perThousand(slips, page.words);
    return { at: tasteOf(METERS[id].steps, per), detail: `${plural(slips, id === 'sam' ? 'spelling slip' : 'grammar slip')} · ${per} per 1,000 words` };
  };

  return (
    <aside
      className={`panel seasonings${paused ? ' is-paused' : ''}`}
      aria-label="Seasonings"
      onContextMenu={(e) => {
        if ((e.target as Element).closest('.sc, .menu, .panel-bar, .pick')) return;
        e.preventDefault();
        onMenu('Seasonings', e.clientX, e.clientY, panelItems());
      }}
    >
      <div className="panel-head">
        <h2 className="panel-h">Seasonings</h2>
        <span className="panel-tools">
          <button className="icon-btn" aria-label="Close Seasonings" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      </div>

      {showPicker ? (
        <>
          <div className="sub-h">Pick your seasonings</div>
          <div className="pick">
            {SEASONINGS.map((s) => (
              // No box: the drawing is grey until picked, then the accent colour.
              <button key={s.id} className="tile" aria-pressed={chosen.includes(s.id)} onClick={() => toggle(s.id)}>
                <Face id={s.id} size={56} />
                <span className="tile-name">{s.name}</span>
                <span className="tile-role">{s.role}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={chosen.length === 0} onClick={() => setPicking(false)}>
            Done
          </button>
        </>
      ) : paused ? (
        <p className="panel-quiet">Seasonings are off. Nothing is marked on the page.</p>
      ) : (
        <div className={`panel-list${drag ? ' is-sorting' : ''}${dropAt === chosen.length ? ' drop-end' : ''}`} ref={list}>
          {chosen.map((id, at) => {
            const who = SEASONINGS.find((s) => s.id === id)!;
            const meter = METERS[id];
            const read = reading(id);
            const cls = ['sc', drag?.id === id && 'is-dragging', dropAt === at && 'drop-before', picked.includes(id) && 'is-marked'].filter(Boolean).join(' ');
            return (
              <section
                className={cls}
                aria-label={who.name}
                key={id}
                onContextMenu={(e) => cardMenu(e, id, at)}
                // Alt+↑ and Alt+↓ move a seasoning up or down the list (Alt+Home and Alt+End to the ends), as on the Shelf.
                onKeyDown={(e) => {
                  if (!e.altKey || e.ctrlKey || e.metaKey) return;
                  const to = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'Home' ? 'top' : e.key === 'End' ? 'bottom' : null;
                  if (!to) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(id, to);
                }}
              >
                <div className="sc-head" title="Click to pick, drag to reorder" onPointerDown={(e) => begin(e, id)} onClick={(e) => pick(e, id)}>
                  <Face id={id} size={30} />
                  <span className="sub-h">{who.name}</span>
                  <span className="handles">
                    <Handle label="Move to top" disabled={at === 0} onClick={() => move(id, 'top')} d="M5 4h14M12 20V9M7 13l5-5 5 5" />
                    <Handle label="Move up" disabled={at === 0} onClick={() => move(id, 'up')} d="M12 19V6M6 11l6-6 6 6" />
                    <Handle label="Move down" disabled={at === chosen.length - 1} onClick={() => move(id, 'down')} d="M12 5v13M6 13l6 6 6-6" />
                    <Handle label="Move to bottom" disabled={at === chosen.length - 1} onClick={() => move(id, 'bottom')} d="M5 20h14M12 4v11M7 11l5 5 5-5" />
                    <Handle label={`Remove ${who.name}`} className="handle-remove" onClick={() => remove(id)} d="M6 6l12 12M18 6 6 18" />
                  </span>
                </div>

                <Remark text={read ? meterRemark(id, read.at) : meter.waiting} />
                <Gauge id={id} reading={read} />
                <div className="sc-foot">
                  <label className="sc-check">
                    <input type="checkbox" role="switch" className="switch" checked={checking(id)} onChange={(e) => setChecking(id, e.target.checked)} />
                    <span>{meter.check}</span>
                  </label>
                  {/* Each report is designed for its seasoning and comes in a later step. */}
                  <button className="btn sc-report" disabled title="Coming soon">
                    {meter.report}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <PanelBar
        label="Seasonings tools"
        status={picked.length > 1 ? `${picked.length} picked` : undefined}
        buttons={[
          { label: turn.label, icon: BAR_ICONS.power, pressed: !paused, onClick: turn.onPick },
          { label: 'Add a seasoning', icon: BAR_ICONS.add, disabled: showPicker, onClick: () => setPicking(true) },
          { label: picked.length > 1 ? `Remove ${picked.length} picked` : 'Remove picked', icon: BAR_ICONS.remove, disabled: picked.length === 0, onClick: () => removeAll(picked) },
          { label: everything ? 'Deselect all' : 'Select all', icon: BAR_ICONS.selectAll, pressed: everything, disabled: chosen.length === 0 || showPicker, onClick: () => setMarked(everything ? [] : [...chosen]) },
        ]}
      />
    </aside>
  );
}

/** Issues on the page by the seasoning they belong to, worked out once per set of underlines. */
const slipCounts = new WeakMap<FoundIssue[], Record<SeasoningId, number>>();
function slipsOf(issues: FoundIssue[]): Record<SeasoningId, number> {
  let counts = slipCounts.get(issues);
  if (!counts) {
    counts = { sam: 0, pete: 0, daniel: 0, sally: 0 };
    for (const i of issues) counts[ownerOf(i.issue)]++;
    slipCounts.set(issues, counts);
  }
  return counts;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A seasoning's meter: its level and what it read, five steps from one end to the other. */
function Gauge({ id, reading }: { id: SeasoningId; reading: { at: number; detail: string } | null }) {
  const { measure, steps, ends } = METERS[id];
  const at = reading?.at ?? -1;
  return (
    <div
      className="gauge"
      role="meter"
      aria-label={measure}
      aria-valuemin={0}
      aria-valuemax={steps.length - 1}
      aria-valuenow={Math.max(at, 0)}
      aria-valuetext={reading ? `${steps[at]!.level}, ${reading.detail}` : 'Not enough to read yet'}
    >
      <div className="gauge-row">
        <span className="gauge-level">{reading ? steps[at]!.level : '—'}</span>
        {reading && <span className="gauge-detail">{reading.detail}</span>}
      </div>
      <div className="gauge-bar" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s.level} className={`gauge-step gauge-${i}${i <= at ? ' is-on' : ''}`} />
        ))}
      </div>
      <div className="gauge-ends" aria-hidden="true">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

function Handle({ label, d, disabled = false, className, onClick }: { label: string; d: string; disabled?: boolean; className?: string; onClick: () => void }) {
  return (
    <button className={className ? `handle ${className}` : 'handle'} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}

/** The one thing a seasoning says, about where its meter stands. */
function Remark({ text }: { text: string }) {
  return (
    <div className="sc-remark" aria-live="polite">
      {text}
    </div>
  );
}
