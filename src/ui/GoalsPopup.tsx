import { useEffect, useMemo, useRef, useState } from 'react';
import { type WritingHistory, dayKey, netWords } from '../storage/history';
import { type HistoryView, historyRows, historyStats, streakOf, wordsADay } from '../storage/goals';

export interface Goals {
  dailyGoal: number;
  bookTarget?: number;
  deadline?: string;
  weekendsOff: boolean;
}

interface Props {
  history: WritingHistory;
  goals: Goals;
  onGoals: (changes: Partial<Goals>) => void;
  /** The open scene, if one is open. */
  scene: { title: string; words: number; goal: number | null } | null;
  onSceneGoal: (goal: number | null) => void;
  /** Words on the Bookshelf now. */
  bookWords: number;
  onExport: () => void;
  /** Set to open the pop-up from elsewhere (the command palette, Settings). */
  request?: { tab: Tab; at: number } | null;
}

type Tab = 'targets' | 'history';
const fmt = (n: number) => n.toLocaleString('en');

function Ring({ ratio, size, stroke, label }: { ratio: number; size: number; stroke: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-track)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        opacity={ratio === 0 ? 0 : 1}
      />
      {size > 40 && (
        <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text)" fontFamily="Nunito, sans-serif">
          {Math.round(ratio * 100)}%
        </text>
      )}
    </svg>
  );
}

/**
 * The goal ring and today's words in the bottom bar, and the pop-up they
 * open: targets for the day, the scene and the book, and the whole writing
 * history. Both tabs are the same size, so switching never moves anything.
 */
export function GoalsPopup({ history, goals, onGoals, scene, onSceneGoal, bookWords, onExport, request }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('targets');
  const [view, setView] = useState<HistoryView>('days');
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = { dailyGoal: goals.dailyGoal, weekendsOff: goals.weekendsOff };
  const today = netWords(history.get(dayKey(new Date())));
  const streak = useMemo(() => streakOf(history, options), [history, goals.dailyGoal, goals.weekendsOff]);
  const ratio = Math.min(1, today / Math.max(1, goals.dailyGoal));

  useEffect(() => {
    if (!request) return;
    setTab(request.tab);
    setOpen(true);
  }, [request]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const streakText = streak > 0 ? ` · ${streak}-day streak` : '';
  return (
    <span className="goals" ref={box}>
      <button
        ref={button}
        className="goals-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Goals and writing history"
        onClick={() => {
          if (!open) setTab('targets');
          setOpen(!open);
        }}
      >
        <Ring ratio={ratio} size={22} stroke={3.5} label={`${Math.round(ratio * 100)} percent of today's goal`} />
        <span>
          <strong>
            {fmt(today)} / {fmt(goals.dailyGoal)}
          </strong>{' '}
          words today{streakText}
          {scene && (scene.goal ? ` · Page ${fmt(scene.words)} / ${fmt(scene.goal)}` : '')}
        </span>
      </button>
      {open && (
        <section className="goals-pop" role="dialog" aria-label="Writing goals">
          <div className="goals-tabs" role="tablist">
            {(['targets', 'history'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const other = t === 'targets' ? 'history' : 'targets';
                  setTab(other);
                  (e.currentTarget.parentElement?.querySelector(`[data-tab="${other}"]`) as HTMLElement | null)?.focus();
                }}
                data-tab={t}
              >
                {t === 'targets' ? 'Targets' : 'History'}
              </button>
            ))}
          </div>
          {tab === 'targets' ? (
            <Targets goals={goals} onGoals={onGoals} today={today} ratio={ratio} streak={streak} scene={scene} onSceneGoal={onSceneGoal} bookWords={bookWords} />
          ) : (
            <History history={history} options={options} view={view} onView={setView} onExport={onExport} />
          )}
        </section>
      )}
    </span>
  );
}

function Targets({
  goals,
  onGoals,
  today,
  ratio,
  streak,
  scene,
  onSceneGoal,
  bookWords,
}: Pick<Props, 'goals' | 'onGoals' | 'scene' | 'onSceneGoal' | 'bookWords'> & { today: number; ratio: number; streak: number }) {
  const left = Math.max(0, goals.dailyGoal - today);
  const perDay = goals.bookTarget ? wordsADay(bookWords, goals.bookTarget, goals.deadline) : null;
  const pastDeadline = !!goals.deadline && goals.deadline < dayKey(new Date());
  return (
    <div className="goals-panel" role="tabpanel" aria-label="Targets">
      <div className="goals-today">
        <Ring ratio={ratio} size={60} stroke={7} label={`${Math.round(ratio * 100)} percent of today's goal`} />
        <div>
          <div className="goals-big">
            {fmt(today)} of {fmt(goals.dailyGoal)} words
          </div>
          <div className="goals-sub">
            today · {left > 0 ? `${fmt(left)} to go` : 'goal met'}
            {streak > 0 ? ` · ${streak}-day streak` : ''}
          </div>
        </div>
      </div>
      <div className="goals-row">
        <span className="goals-t">
          <b>Daily goal</b>
          <span className="goals-sub">Fills the ring and keeps the streak</span>
        </span>
        <NumberInput value={goals.dailyGoal} label="Daily goal in words" required onCommit={(v) => v && onGoals({ dailyGoal: v })} />
      </div>
      <div className="goals-row">
        <span className="goals-t">
          <b>This page</b>
          <span className="goals-sub">{scene ? `${scene.title || 'Untitled'} · ${fmt(scene.words)} words so far` : 'Open a page to give it a goal'}</span>
        </span>
        <NumberInput value={scene?.goal ?? null} placeholder="No goal" label="Page goal in words" disabled={!scene} onCommit={onSceneGoal} />
      </div>
      <div className="goals-row goals-book">
        <div className="goals-line">
          <span className="goals-t">
            <b>Book target</b>
            <span className="goals-sub">{goals.bookTarget ? `${fmt(bookWords)} of ${fmt(goals.bookTarget)} words` : `${fmt(bookWords)} words on the Shelf`}</span>
          </span>
          <NumberInput value={goals.bookTarget ?? null} placeholder="No target" label="Book target in words" onCommit={(v) => onGoals({ bookTarget: v ?? undefined })} />
        </div>
        <div className="goals-meter" aria-hidden="true">
          <i style={{ width: `${goals.bookTarget ? Math.min(100, (bookWords / goals.bookTarget) * 100) : 0}%` }} />
        </div>
        <div className="goals-line">
          <span className="goals-sub">Finish by</span>
          <input className="goals-date" type="date" aria-label="Book deadline" value={goals.deadline ?? ''} onChange={(e) => onGoals({ deadline: e.target.value || undefined })} />
        </div>
        <span className="goals-sub">
          {!goals.bookTarget
            ? 'Set a target to see how much a day gets you there.'
            : bookWords >= goals.bookTarget
              ? 'Target reached.'
              : pastDeadline
                ? 'The finish date has passed. Pick a new one to see the words a day.'
                : perDay !== null
                  ? `About ${fmt(perDay)} words a day gets you there on time.`
                  : 'Pick a finish date to see the words a day.'}
        </span>
      </div>
      <label className="goals-check">
        <input type="checkbox" checked={goals.weekendsOff} onChange={(e) => onGoals({ weekendsOff: e.target.checked })} />
        Weekends off don’t break the streak
      </label>
    </div>
  );
}

function History({
  history,
  options,
  view,
  onView,
  onExport,
}: {
  history: WritingHistory;
  options: { dailyGoal: number; weekendsOff: boolean };
  view: HistoryView;
  onView: (v: HistoryView) => void;
  onExport: () => void;
}) {
  const stats = useMemo(() => historyStats(history, options), [history, options.dailyGoal, options.weekendsOff]);
  const rows = useMemo(() => historyRows(history, view, options), [history, view, options.dailyGoal, options.weekendsOff]);
  const bestDay = stats.best ? new Date(stats.best.day + 'T12:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
  return (
    <div className="goals-panel goals-hist" role="tabpanel" aria-label="History">
      <div className="goals-sum">
        <div>
          <span className="goals-sub">This week</span>
          <b>{fmt(stats.week)}</b>
        </div>
        <div>
          <span className="goals-sub">This month</span>
          <b>{fmt(stats.month)}</b>
        </div>
        <div>
          <span className="goals-sub">All time</span>
          <b>{fmt(stats.all)}</b>
        </div>
      </div>
      <div className="goals-sub goals-facts">
        {stats.best ? `Best day ${fmt(stats.best.words)} on ${bestDay} · ` : ''}longest streak {stats.longest} {stats.longest === 1 ? 'day' : 'days'} · goal met on {stats.metDays} of {stats.writtenDays}{' '}
        {stats.writtenDays === 1 ? 'day' : 'days'}
      </div>
      <div className="goals-hbar">
        <div className="goals-seg" role="group" aria-label="Group by">
          {(['days', 'weeks', 'months'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => onView(v)}>
              {v[0]!.toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button className="goals-link" onClick={onExport}>
          Export CSV
        </button>
      </div>
      <div className="goals-list" tabIndex={0} aria-label="Complete writing history">
        {rows.length === 0 && <p className="goals-sub goals-empty">Nothing written yet. Each day you write shows up here.</p>}
        {rows.map((r) => (
          <div key={r.key} className={`goals-hr${r.heading ? ' mh' : ''}${r.met ? ' met' : ''}${!r.heading && r.words === 0 ? ' off' : ''}${r.today ? ' today' : ''}`}>
            <span className="hl">
              {r.label}
              {r.sub && <span className="goals-sub">{r.sub}</span>}
            </span>
            <span className="mini">
              <i style={{ width: `${Math.round(r.fill * 100)}%` }} />
            </span>
            <span className="hw">{r.words || r.heading ? fmt(r.words) : '–'}</span>
            <span className="hm" aria-label={r.met ? 'Goal met' : undefined}>
              {r.met ? '✓' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A number field that only saves when the writer leaves it or presses Enter. */
function NumberInput({
  value,
  placeholder,
  label,
  disabled,
  required,
  onCommit,
}: {
  value: number | null;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  /** Emptying the field puts the old number back rather than clearing it. */
  required?: boolean;
  onCommit: (v: number | null) => void;
}) {
  const show = (v: number | null) => (v ? fmt(v) : '');
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text.replace(/[^\d]/g, '')));
    const next = Number.isFinite(n) && n > 0 ? n : null;
    if (next === null && required) return setText(show(value));
    setText(show(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="goals-num"
      inputMode="numeric"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
