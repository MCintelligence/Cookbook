import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type WritingHistory, netWords } from '../storage/history';
import { type HistoryRange, type PeriodBar, finishAt, fromKey, historyStats, periodOf, recentPace, streakOf, wordsADay } from '../storage/goals';
import { haptic } from '../mobile';
import { type Goals, NumberInput, useToday } from './GoalsPopup';
import { Says } from './Says';
import { danielPeriod, danielToday } from './danielCounts';

/**
 * Goals and writing history on a phone: a page of its own, not the computer's pop-up restacked.
 * Targets leads with today (a big ring, Drunk Daniel's word on it, this week's days and the streak),
 * then the goals as things a thumb can set. History shows a week, month or year at a time, each in
 * the shape that reads best (bars for a week and a year, a calendar for a month), against the same
 * point in the period before, with the records and the days underneath.
 *
 * What it borrows: a streak shown with its calendar (Duolingo), a comparison that says what it is
 * compared with (Screen Time's weak spot), a finish date at the writer's own pace (NaNoWriMo's
 * stats page), and ranges to flip between (Strava). It never scolds a day off.
 */

type Tab = 'targets' | 'history';
const fmt = (n: number) => n.toLocaleString('en');
const dateName = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });

const icon = (d: string, size = 20, width = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const FLAME = 'M12 3c.8 3.6 5 5.4 5 10.2a5 5 0 0 1-10 0c0-2.1 1-3.6 2.1-4.6.2 1.6 1 2.6 2 3.1-.2-3.1.2-5.9.9-8.7z';
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const LEFT = 'M15 5l-7 7 7 7';
const RIGHT = 'M9 5l7 7-7 7';

interface Props {
  history: WritingHistory;
  goals: Goals;
  onGoals: (changes: Partial<Goals>) => void;
  scene: { title: string; words: number; goal: number | null } | null;
  onSceneGoal: (goal: number | null) => void;
  bookWords: number;
  onExport: () => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  onClose: () => void;
}

export function PhoneGoals({ tab, onTab, onClose, ...rest }: Props) {
  return (
    <section className="goals-pop phone-goals" role="dialog" aria-label={tab === 'targets' ? 'Goals' : 'Writing history'}>
      <header className="pg-top">
        <button type="button" className="pg-icon" aria-label="Back" onClick={onClose}>
          {icon('M19 12H5M11 5l-7 7 7 7', 24, 2.2)}
        </button>
        <div className="pg-tabs" role="tablist">
          {(['targets', 'history'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => (haptic('tick'), onTab(t))}>
              {t === 'targets' ? 'Today' : 'History'}
            </button>
          ))}
        </div>
        <span className="pg-icon" />
      </header>
      <div key={tab} className="pg-scroll">
        {tab === 'targets' ? <Targets {...rest} /> : <History {...rest} />}
      </div>
    </section>
  );
}

/** Today's ring: the words in the middle, the goal under them. */
function BigRing({ words, goal }: { words: number; goal: number }) {
  const ratio = Math.min(1, words / Math.max(1, goal));
  const size = 210;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // A second lap, thinner, once the goal is passed.
  const over = Math.min(1, Math.max(0, words / Math.max(1, goal) - 1));
  return (
    <div className="pg-ring" role="img" aria-label={`${fmt(words)} of ${fmt(goal)} words today`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
        <circle className="pg-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`} opacity={ratio === 0 ? 0 : 1} style={{ ['--c' as string]: c }} />
        {over > 0 && <circle cx={size / 2} cy={size / 2} r={r - stroke - 3} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={2 * Math.PI * (r - stroke - 3)} strokeDashoffset={2 * Math.PI * (r - stroke - 3) * (1 - over)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      </svg>
      <span className="pg-ring-n">{fmt(words)}</span>
      <span className="pg-ring-of">of {fmt(goal)} words</span>
    </div>
  );
}

/** A number with − and + either side, for the daily goal. */
function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const step = (dir: 1 | -1) => {
    const by = value + dir > 1000 || (dir > 0 && value >= 1000) ? 250 : 50;
    const next = Math.max(50, Math.min(100000, Math.round((value + dir * by) / by) * by));
    haptic('tick');
    onChange(next);
  };
  return (
    <div className="pg-stepper">
      <button type="button" className="pg-step" aria-label={`Lower ${label.toLowerCase()}`} onClick={() => step(-1)}>
        {icon('M5 12h14', 24, 2.2)}
      </button>
      <NumberInput value={value} label={label} required onCommit={(v) => v && onChange(v)} />
      <button type="button" className="pg-step" aria-label={`Raise ${label.toLowerCase()}`} onClick={() => step(1)}>
        {icon('M5 12h14M12 5v14', 24, 2.2)}
      </button>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="pg-section">
      <h2>{title}</h2>
      {sub && <p className="pg-sub">{sub}</p>}
      {children}
    </section>
  );
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <span className="pg-bar" aria-hidden="true">
      <i style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }} />
    </span>
  );
}

function Targets({ history, goals, onGoals, scene, onSceneGoal, bookWords }: Omit<Props, 'tab' | 'onTab' | 'onClose' | 'onExport'>) {
  const day = useToday();
  const options = { dailyGoal: goals.dailyGoal, weekendsOff: goals.weekendsOff };
  const today = netWords(history.get(day));
  const streak = useMemo(() => streakOf(history, options), [history, goals.dailyGoal, goals.weekendsOff, day]);
  const week = useMemo(() => periodOf(history, 'week', 0, options), [history, goals.dailyGoal, day]);
  const pace = useMemo(() => recentPace(history), [history, day]);
  const left = Math.max(0, goals.dailyGoal - today);
  const target = goals.bookTarget;
  const perDay = target ? wordsADay(bookWords, target, goals.deadline) : null;
  const pastDeadline = !!goals.deadline && goals.deadline < day;
  const done = target ? finishAt(bookWords, target, pace) : null;

  return (
    <div className="pg-page">
      <div className="pg-hero">
        <BigRing words={today} goal={goals.dailyGoal} />
        <p className="pg-hero-sub">{left > 0 ? `${fmt(left)} to go today` : 'Today’s goal is met'}</p>
      </div>
      <Says who="daniel" line={danielToday(today, goals.dailyGoal, day)} />

      <section className="pg-week" aria-label="This week">
        <div className="pg-streak">
          <span className="pg-streak-icon">{icon(FLAME, 22, 1.9)}</span>
          {streak > 0 ? (
            <span>
              <b>{streak}</b> {streak === 1 ? 'day' : 'days'} in a row
            </span>
          ) : (
            <span>{left > 0 ? 'Meet today’s goal to start a run.' : 'A run starts today.'}</span>
          )}
        </div>
        <ol className="pg-days">
          {week.bars.map((b, i) => {
            const weekend = goals.weekendsOff && i >= 5;
            const state = b.future ? 'future' : b.met ? 'met' : b.words > 0 ? 'some' : weekend ? 'rest' : 'none';
            return (
              <li key={b.key} data-state={state} data-today={b.today} aria-label={`${b.name}: ${b.met ? 'goal met' : b.words > 0 ? `${fmt(b.words)} words` : b.future ? 'to come' : weekend ? 'weekend off' : 'nothing written'}`}>
                <span className="pg-day-mark">{state === 'met' ? icon(CHECK, 18, 2.6) : state === 'some' ? <i style={{ height: `${Math.max(12, Math.round((b.words / Math.max(1, goals.dailyGoal)) * 100))}%` }} /> : null}</span>
                <span className="pg-day-l">{b.label}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <Section title="Daily goal" sub="Fills the ring and keeps the run going.">
        <Stepper value={goals.dailyGoal} label="Daily goal" onChange={(v) => onGoals({ dailyGoal: v })} />
      </Section>

      <Section title={scene ? scene.title || 'Untitled' : 'This Item'} sub={scene ? (scene.goal ? `${fmt(scene.words)} of ${fmt(scene.goal)} words` : `${fmt(scene.words)} words so far`) : 'Open an Item to give it a goal of its own.'}>
        {scene && (
          <>
            {scene.goal ? <Bar ratio={scene.words / scene.goal} /> : null}
            <label className="pg-field">
              <span>Goal for this Item</span>
              <NumberInput value={scene.goal} placeholder="None" label="Item goal in words" onCommit={onSceneGoal} />
            </label>
          </>
        )}
      </Section>

      <Section title="The whole recipe">
        <div className="pg-book">
          <span className="pg-book-n">{fmt(bookWords)}</span>
          <span className="pg-sub">{target ? `of ${fmt(target)} words · ${Math.min(100, Math.floor((bookWords / target) * 100))}%` : 'words on the Shelf'}</span>
        </div>
        {target ? <Bar ratio={bookWords / target} /> : null}
        <label className="pg-field">
          <span>Target</span>
          <NumberInput value={target ?? null} placeholder="None" label="Recipe target in words" onCommit={(v) => onGoals({ bookTarget: v ?? undefined })} />
        </label>
        <label className="pg-field">
          <span>Finish by</span>
          <input className="goals-date" type="date" aria-label="Recipe deadline" value={goals.deadline ?? ''} onChange={(e) => onGoals({ deadline: e.target.value || undefined })} />
        </label>
        <ul className="pg-notes">
          {!target ? (
            <li>Set a target to see how much a day gets you there.</li>
          ) : bookWords >= target ? (
            <li>{icon(CHECK, 18, 2.4)}Target reached.</li>
          ) : (
            <>
              <li>
                {icon('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', 18, 1.8)}
                {pastDeadline
                  ? 'The finish date has passed. Pick a new one to see the words a day.'
                  : perDay !== null
                    ? `${fmt(perDay)} words a day finishes it by ${dateName(fromKey(goals.deadline!))}.`
                    : 'Pick a finish date to see the words a day.'}
              </li>
              <li>
                {icon('M3 17l6-6 4 4 8-8M15 7h6v6', 18, 1.8)}
                {done ? `At your pace lately, about ${fmt(pace)} a day, you’d finish around ${dateName(done)}.` : 'Write for a few days and your own pace shows here.'}
              </li>
            </>
          )}
        </ul>
      </Section>

      <button type="button" role="switch" aria-checked={goals.weekendsOff} className="pg-switch" onClick={() => (haptic('tick'), onGoals({ weekendsOff: !goals.weekendsOff }))}>
        <span>
          <b>Weekends off</b>
          <span className="pg-sub">Saturdays and Sundays never break the run.</span>
        </span>
        <span className="pg-switch-track" aria-hidden="true">
          <i />
        </span>
      </button>
    </div>
  );
}

/** Bars for a week (one a day, with the goal as a dashed line) or a year (one a month). */
function Bars({ bars, goal, range, picked, onPick }: { bars: PeriodBar[]; goal: number; range: HistoryRange; picked: string | null; onPick: (k: string) => void }) {
  const W = 340;
  const H = 168;
  const top = 14;
  const base = H - 22;
  const max = Math.max(1, ...bars.map((b) => b.words), range === 'week' ? goal * 1.15 : 0);
  const slot = W / bars.length;
  const bw = Math.min(30, slot * 0.58);
  const y = (v: number) => base - (v / max) * (base - top);
  return (
    <svg className="pg-chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Words by day">
      <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--line)" />
      {range === 'week' && (
        <>
          <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--muted)" strokeDasharray="3 4" strokeWidth="1" />
          <text x={W} y={y(goal) - 5} textAnchor="end" className="pg-chart-goal">
            goal
          </text>
        </>
      )}
      {bars.map((b, i) => {
        const x = slot * i + (slot - bw) / 2;
        const h = Math.max(b.words > 0 ? 3 : 0, base - y(b.words));
        const on = picked === b.key;
        return (
          <g key={b.key} className="pg-col" data-met={range === 'year' || b.met} data-on={on} onClick={() => !b.future && onPick(b.key)}>
            <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
            {h > 0 && <path className="pg-col-bar" d={`M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} style={{ animationDelay: `${i * 30}ms` }} />}
            <text x={slot * i + slot / 2} y={H - 5} textAnchor="middle" className={`pg-col-l${b.today ? ' today' : ''}${b.future ? ' future' : ''}`}>
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A month as a calendar: each day a dot as big as its share of the goal, a full one when the goal was met. */
function Calendar({ bars, start, goal, picked, onPick }: { bars: PeriodBar[]; start: string; goal: number; picked: string | null; onPick: (k: string) => void }) {
  const lead = (fromKey(start).getDay() + 6) % 7;
  return (
    <div className="pg-cal" role="grid" aria-label="Days of the month">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <span key={i} className="pg-cal-h" aria-hidden="true">
          {d}
        </span>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <span key={`x${i}`} />
      ))}
      {bars.map((b, i) => {
        const share = Math.min(1, b.words / Math.max(1, goal));
        return (
          <button
            key={b.key}
            type="button"
            role="gridcell"
            className="pg-cal-d"
            data-today={b.today}
            data-future={b.future}
            data-on={picked === b.key}
            disabled={b.future}
            aria-label={`${b.name}: ${b.words ? `${fmt(b.words)} words` : 'nothing written'}${b.met ? ', goal met' : ''}`}
            onClick={() => onPick(b.key)}
          >
            <span className="pg-cal-n">{b.label}</span>
            <span className="pg-cal-dot" data-met={b.met} data-none={b.words === 0} style={{ ['--s' as string]: b.words > 0 ? 0.3 + share * 0.7 : 0, animationDelay: `${i * 12}ms` }} />
          </button>
        );
      })}
    </div>
  );
}

function History({ history, goals, onExport }: Omit<Props, 'tab' | 'onTab' | 'onClose' | 'onGoals' | 'scene' | 'onSceneGoal' | 'bookWords'>) {
  const day = useToday();
  const options = { dailyGoal: goals.dailyGoal, weekendsOff: goals.weekendsOff };
  const [range, setRange] = useState<HistoryRange>('week');
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const period = useMemo(() => periodOf(history, range, offset, options), [history, range, offset, goals.dailyGoal, day]);
  const stats = useMemo(() => historyStats(history, options), [history, goals.dailyGoal, goals.weekendsOff, day]);
  const first = useMemo(() => [...history.keys()].sort()[0], [history]);
  // Paging back stops at the period holding the first day written.
  const earliest = !first || first >= period.start;
  useEffect(() => setPicked(null), [range, offset]);

  const change = period.before > 0 ? Math.round(((period.total - period.before) / period.before) * 100) : null;
  const compared = { week: period.current ? 'this point last week' : 'the week before', month: period.current ? 'this point last month' : 'the month before', year: period.current ? 'this time last year' : 'the year before' }[range];
  const pick = period.bars.find((b) => b.key === picked);
  const shown = [...period.bars].filter((b) => !b.future).reverse();
  const bestDay = stats.best ? fromKey(stats.best.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return (
    <div className="pg-page">
      <div className="pg-seg" role="radiogroup" aria-label="Show">
        {(['week', 'month', 'year'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => {
              haptic('tick');
              setRange(r);
              setOffset(0);
            }}
          >
            {r[0]!.toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      <div className="pg-period">
        <button type="button" className="pg-icon" aria-label="Earlier" disabled={earliest} onClick={() => (haptic('tick'), setOffset(offset - 1))}>
          {icon(LEFT, 22)}
        </button>
        <div className="pg-period-mid" aria-live="polite">
          <span className="pg-period-label">{period.label}</span>
          <span className="pg-period-n">{fmt(period.total)}</span>
          <span className="pg-sub">
            words · {fmt(period.perDay)} a day{range !== 'year' ? ` · ${period.wrote} of ${period.bars.filter((b) => !b.future).length} days written` : ''}
          </span>
        </div>
        <button type="button" className="pg-icon" aria-label="Later" disabled={offset === 0} onClick={() => (haptic('tick'), setOffset(offset + 1))}>
          {icon(RIGHT, 22)}
        </button>
      </div>

      {change !== null && period.total > 0 && (
        <p className="pg-compare">
          <span className="pg-compare-arrow" data-dir={change >= 0 ? 'up' : 'down'}>
            {icon(change >= 0 ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7', 16, 2.4)}
          </span>
          {Math.abs(change)}% {change >= 0 ? 'more' : 'fewer'} than {compared} ({fmt(period.before)})
        </p>
      )}

      {range === 'month' ? (
        <Calendar bars={period.bars} start={period.start} goal={goals.dailyGoal} picked={picked} onPick={(k) => (haptic('tick'), setPicked(picked === k ? null : k))} />
      ) : (
        <Bars bars={period.bars} goal={goals.dailyGoal} range={range} picked={picked} onPick={(k) => (haptic('tick'), setPicked(picked === k ? null : k))} />
      )}
      <p className="pg-picked" aria-live="polite">
        {pick ? (
          <>
            <b>{pick.name}</b> · {fmt(pick.words)} words{pick.met ? ' · goal met' : ''}
          </>
        ) : (
          <span className="pg-sub">Tap a {range === 'year' ? 'month' : 'day'} to see its words.</span>
        )}
      </p>

      <Says who="daniel" line={danielPeriod(period.total, period.before, range, period.current, day)} />

      <Section title="Records">
        <div className="pg-records">
          <div>
            {icon('M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4', 20, 1.8)}
            <b>{stats.best ? fmt(stats.best.words) : '–'}</b>
            <span>best day{stats.best ? `, ${bestDay}` : ''}</span>
          </div>
          <div>
            {icon(FLAME, 20, 1.8)}
            <b>{stats.longest}</b>
            <span>longest run of days</span>
          </div>
          <div>
            {icon(CHECK, 20, 2.2)}
            <b>
              {stats.metDays}
              <small> of {stats.writtenDays}</small>
            </b>
            <span>days with the goal met</span>
          </div>
          <div>
            {icon('M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h3', 20, 1.8)}
            <b>{fmt(stats.all)}</b>
            <span>words, all told</span>
          </div>
        </div>
      </Section>

      <Section title={range === 'year' ? 'Month by month' : 'Day by day'}>
        {shown.length === 0 || period.total === 0 ? (
          <p className="pg-sub">Nothing written {period.current ? 'yet' : 'then'}. Each day you write shows up here.</p>
        ) : (
          <ul className="pg-log">
            {shown.map((b) => {
              const scale = range === 'year' ? Math.max(1, ...period.bars.map((x) => x.words)) : goals.dailyGoal * 1.4;
              return (
                <li key={b.key} data-off={b.words === 0} data-today={b.today}>
                  <span className="pg-log-name">{b.today ? 'Today' : b.name}</span>
                  <Bar ratio={b.words / scale} />
                  <span className="pg-log-n">{b.words ? fmt(b.words) : '–'}</span>
                  <span className="pg-log-met" aria-label={b.met ? 'Goal met' : undefined}>
                    {b.met ? icon(CHECK, 16, 2.6) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <button type="button" className="pg-export" onClick={onExport}>
        {icon('M12 4v11M7 10l5 5 5-5M5 20h14', 20, 2)}
        Export the whole history as CSV
      </button>
    </div>
  );
}
