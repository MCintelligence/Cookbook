import { useEffect, useRef, useState } from 'react';
import { type HistorySummary } from '../storage/history';

interface Props {
  summary: HistorySummary;
  dailyGoal: number;
  /** Words in the open scene, or null when no scene is open. */
  sceneWords: number | null;
  sceneGoal: number | null;
  onDailyGoal: (goal: number) => void;
  onSceneGoal: (goal: number | null) => void;
  onExport: () => void;
}

const fmt = (n: number) => n.toLocaleString('en');

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleString('en', { month: 'short', day: 'numeric' });
}

/** Today's words against the goal, the streak, and the writing history popover. */
export function WritingFooter({ summary, dailyGoal, sceneWords, sceneGoal, onDailyGoal, onSceneGoal, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const ratio = Math.min(1, summary.today / Math.max(1, dailyGoal));
  const circumference = 2 * Math.PI * 8.5;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const tallest = Math.max(dailyGoal, ...summary.recent.map((d) => d.words), 1);
  const lastDay = summary.recent.length - 1;

  return (
    <span className="wf" ref={box}>
      <svg width="22" height="22" viewBox="0 0 22 22" role="img" aria-label={`${Math.round(ratio * 100)} percent of today's goal`}>
        <circle cx="11" cy="11" r="8.5" fill="none" stroke="var(--line-strong)" strokeWidth="3.5" />
        <circle
          cx="11"
          cy="11"
          r="8.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 11 11)"
          opacity={ratio === 0 ? 0 : 1}
        />
      </svg>
      <span className="wf-text">
        <strong>
          {fmt(summary.today)} / {fmt(dailyGoal)}
        </strong>{' '}
        words today
        {summary.streak > 1 && ` · ${summary.streak}-day streak`}
        {sceneWords !== null && (sceneGoal ? ` · Scene ${fmt(sceneWords)} / ${fmt(sceneGoal)}` : ` · ${fmt(sceneWords)} in this scene`)}
      </span>
      <button className="wf-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        History
      </button>

      {open && (
        <section className="wf-pop" aria-label="Writing history">
          <div className="wf-head">
            <span className="wf-title">Writing history</span>
            <span className="wf-sub">Last {summary.recent.length} days</span>
          </div>
          <div className="wf-bars">
            {summary.recent.map((d, i) => (
              <span
                key={d.day}
                title={`${fmt(d.words)} words on ${dayLabel(d.day)}`}
                className={i === lastDay ? 'is-today' : d.words === 0 ? 'is-empty' : ''}
                style={{ height: `${Math.max(3, (d.words / tallest) * 60)}px` }}
              />
            ))}
          </div>
          <div className="wf-axis">
            <span>{dayLabel(summary.recent[0]!.day)}</span>
            <span>Today</span>
          </div>
          <div className="wf-months">
            {summary.months.map((m) => (
              <span key={m.month}>
                <span className="wf-sub">{m.label}</span>
                <strong>{fmt(m.words)}</strong>
              </span>
            ))}
          </div>
          <span className="wf-sub">
            {summary.best ? `Best day: ${fmt(summary.best.words)} words on ${dayLabel(summary.best.day)}. ` : ''}
            Kept in the book folder as writing-history.csv.
          </span>
          <div className="wf-goals">
            <label>
              Daily goal
              <GoalInput value={dailyGoal} onCommit={(v) => v && onDailyGoal(v)} />
            </label>
            {sceneWords !== null && (
              <label>
                This scene
                <GoalInput value={sceneGoal} placeholder="No goal" onCommit={onSceneGoal} />
              </label>
            )}
          </div>
          <button className="wf-export" onClick={onExport}>
            Export CSV
          </button>
        </section>
      )}
    </span>
  );
}

/** A number field that only saves when the writer leaves it or presses Enter. */
function GoalInput({ value, placeholder, onCommit }: { value: number | null; placeholder?: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const n = Math.round(Number(text.replace(/[^\d]/g, '')));
    onCommit(Number.isFinite(n) && n > 0 ? n : null);
  };
  return (
    <input
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
