import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type AppSettings, getSettings, setSettings, useSettings } from '../settings';
import { ENGLISHES, type English, systemEnglish } from '../proofread/english';
import { SEASONINGS, type SeasoningId } from '../proofread/remarks';
import { WRITERS, type WriterKind, rulesFor, writerOf } from '../writers';
import { haptic, onBack } from '../mobile';
import { Face } from './Faces';
import { SEASONING_BLURBS } from './SetTheTable';
import { THEMES } from './Settings';
import { rememberTableSet } from './tableSet';

/**
 * Set the Table on a phone: the same questions as SetTheTable asks on a computer, as a run of
 * screens made for one hand. It is the whole screen, shown before the app and not over it; one
 * question to a screen; every choice is a row a thumb can hit; the way on is one wide button at
 * the bottom, and Back (the arrow, or the phone's own) goes to the question before.
 * Each answer is saved as the writer moves on, so leaving halfway keeps what was said.
 */

type Step = 'welcome' | 'english' | 'writer' | 'look' | 'goal' | 'seasonings' | 'ready';
const STEPS: Step[] = ['welcome', 'english', 'writer', 'look', 'goal', 'seasonings', 'ready'];
const GOALS = [250, 500, 750, 1000, 1667, 2000];
const SIZES: [AppSettings['size'], string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

const Check = () => (
  <svg className="pt-check" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export function PhoneTable({ first, onDone }: { first: boolean; onDone: () => void }) {
  const s = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  /** Which way the screens are moving, for the slide between them. */
  const [dir, setDir] = useState<'on' | 'back'>('on');
  const [name, setName] = useState(s.writerName);
  const [english, setEnglish] = useState<English>(s.english === 'auto' ? systemEnglish() : s.english);
  const [writer, setWriter] = useState<WriterKind | ''>(s.writer);
  const [goal, setGoal] = useState(s.dailyGoal);
  const [seasonings, setSeasonings] = useState<string[]>(s.newSeasonings.length ? s.newSeasonings : ['sam', 'pete']);
  const at = STEPS.indexOf(step);
  const heading = useRef<HTMLHeadingElement>(null);

  // A screen reader hears each question as it arrives.
  useEffect(() => heading.current?.focus({ preventScroll: true }), [step]);

  const finish = () => {
    rememberTableSet();
    onDone();
  };
  const go = (to: number) => {
    setDir(to > at ? 'on' : 'back');
    setStep(STEPS[to]!);
  };
  // The phone's Back goes to the question before; from the first, it leaves the questions.
  const back = useRef<() => boolean>(() => false);
  back.current = () => (at > 0 ? (go(at - 1), true) : (finish(), true));
  useEffect(() => onBack(() => back.current()), []);

  /** Keeps the answer to this question and goes to the next. */
  const next = () => {
    if (step === 'welcome') setSettings({ writerName: name.trim() });
    if (step === 'english') setSettings({ english });
    if (step === 'writer' && writer) {
      const w = writerOf(writer)!;
      setSettings({ writer, markdownRules: rulesFor(writer, getSettings().markdownRules) });
      // The next questions start from what suits this kind of writing.
      if (writer !== s.writer) {
        setGoal(w.dailyGoal);
        setSeasonings(w.seasonings);
      }
    }
    if (step === 'goal' && goal > 0) setSettings({ dailyGoal: goal });
    if (step === 'seasonings') setSettings({ newSeasonings: SEASONINGS.map((x) => x.id).filter((id) => seasonings.includes(id)) });
    if (step === 'ready') return finish();
    go(at + 1);
  };

  /** One choice in a list: its name, a line about it, and a tick when it is the one. */
  const row = (key: string, on: boolean, pick: () => void, title: string, blurb: ReactNode, lead?: ReactNode, many = false) => (
    <button
      key={key}
      type="button"
      role={many ? 'checkbox' : 'radio'}
      aria-checked={on}
      className="pt-row"
      onClick={() => {
        haptic('tick');
        pick();
      }}
    >
      {lead}
      <span className="pt-row-text">
        <span className="pt-row-name">{title}</span>
        <span className="pt-row-blurb">{blurb}</span>
      </span>
      <span className={many ? 'pt-box' : 'pt-dot'}>{on && <Check />}</span>
    </button>
  );

  const firstName = s.writerName.split(/\s+/)[0];
  const body: Record<Step, { title: string; lead: ReactNode; content: ReactNode }> = {
    welcome: {
      title: 'Welcome to Cookbook',
      lead: 'A place to write, on this phone. No account, nothing sent anywhere. A few quick questions first, and you can skip any of them.',
      content: (
        <label className="pt-field">
          <span className="pt-label">What should Cookbook call you?</span>
          <input className="pt-input" value={name} autoComplete="name" enterKeyHint="next" placeholder="Your name or pen name (optional)" onChange={(e) => setName(e.target.value)} />
          <span className="pt-hint">It goes on the title page of the recipes you start.</span>
        </label>
      ),
    },
    english: {
      title: 'Which English do you write?',
      lead: 'Salty Sam spells by it and Peppery Pete follows its grammar.',
      content: (
        <div className="pt-list" role="radiogroup" aria-label="Your English">
          {ENGLISHES.map((e) => row(e.id, english === e.id, () => setEnglish(e.id), e.name, e.sample))}
        </div>
      ),
    },
    writer: {
      title: 'What do you mostly write?',
      lead: 'Cookbook picks starting points to suit: a template, a daily goal and who proofreads.',
      content: (
        <div className="pt-list" role="radiogroup" aria-label="What you write">
          {WRITERS.map((w) => row(w.id, writer === w.id, () => setWriter(writer === w.id ? '' : w.id), w.name, w.blurb))}
        </div>
      ),
    },
    look: {
      title: 'How should it look?',
      lead: 'Pick one and this screen changes with it.',
      content: (
        <>
          <div className="pt-themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={s.theme === t.id}
                className="pt-theme"
                onClick={() => {
                  haptic('tick');
                  setSettings({ theme: t.id });
                }}
              >
                <span className="pt-theme-pic" style={{ background: t.bg }}>
                  <span style={{ background: t.page }} />
                </span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-field">
            <span className="pt-label">Size of everything</span>
            <div className="pt-seg" role="radiogroup" aria-label="Size">
              {SIZES.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={s.size === v}
                  onClick={() => {
                    haptic('tick');
                    setSettings({ size: v });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      ),
    },
    goal: {
      title: 'How many words a day?',
      lead: 'A goal to fill each day. Any recipe can set its own.',
      content: (
        <>
          <label className="pt-goal">
            <input
              inputMode="numeric"
              aria-label="Words a day"
              value={goal ? goal.toLocaleString('en') : ''}
              placeholder="0"
              onChange={(e) => setGoal(Math.min(100000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
            />
            <span>words a day</span>
          </label>
          <div className="pt-chips" role="radiogroup" aria-label="Daily goal">
            {GOALS.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={goal === g}
                onClick={() => {
                  haptic('tick');
                  setGoal(g);
                }}
              >
                {g.toLocaleString('en')}
              </button>
            ))}
          </div>
          <span className="pt-hint">1,667 a day is a 50,000-word draft in a month.</span>
        </>
      ),
    },
    seasonings: {
      title: 'Who reads over your shoulder?',
      lead: 'The Seasonings proofread on this phone, each for one thing. Add or drop them any time.',
      content: (
        <div className="pt-list" role="group" aria-label="Seasonings">
          {SEASONINGS.map((x) => {
            const on = seasonings.includes(x.id);
            return row(x.id, on, () => setSeasonings(on ? seasonings.filter((id) => id !== x.id) : [...seasonings, x.id]), x.name, SEASONING_BLURBS[x.id], (
              <span className="pt-face">
                <Face id={x.id as SeasoningId} size={40} />
              </span>
            ), true);
          })}
        </div>
      ),
    },
    ready: {
      title: firstName ? `Your table is set, ${firstName}` : 'Your table is set',
      lead: first ? 'Next is Learn to Cook: a recipe made for trying things out. Change it, break it, delete it when you’re done.' : 'Settings changes any of this later.',
      content: (
        <dl className="pt-summary">
          <div>
            <dt>English</dt>
            <dd>{s.english === 'auto' ? 'As your phone' : ENGLISHES.find((e) => e.id === s.english)?.name}</dd>
          </div>
          <div>
            <dt>You write</dt>
            <dd>{writerOf(s.writer)?.name ?? 'Not said'}</dd>
          </div>
          <div>
            <dt>Daily goal</dt>
            <dd>{s.dailyGoal.toLocaleString('en')} words</dd>
          </div>
          <div>
            <dt>Seasonings</dt>
            <dd>
              {s.newSeasonings.length
                ? SEASONINGS.filter((x) => s.newSeasonings.includes(x.id))
                    .map((x) => x.name)
                    .join(', ')
                : 'You’ll pick them later'}
            </dd>
          </div>
        </dl>
      ),
    },
  };
  const { title, lead, content } = body[step];

  return (
    <form
      className="phone-table"
      aria-labelledby="pt-title"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <header className="pt-top">
        {at > 0 ? (
          <button type="button" className="pt-icon" aria-label="Back" onClick={() => go(at - 1)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 5l-7 7 7 7" />
            </svg>
          </button>
        ) : (
          <span className="pt-icon" />
        )}
        <span className="pt-progress" role="progressbar" aria-label="Questions" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={at + 1}>
          <span style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} />
        </span>
        {step !== 'ready' ? (
          <button type="button" className="pt-skip" onClick={step === 'welcome' ? finish : () => go(at + 1)}>
            {step === 'welcome' ? 'Skip all' : 'Skip'}
          </button>
        ) : (
          <span className="pt-skip" />
        )}
      </header>

      <main key={step} className={`pt-main pt-${dir}`}>
        {step === 'welcome' && <span className="pt-brand">cookbook</span>}
        <h1 id="pt-title" ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="pt-lead">{lead}</p>
        {content}
      </main>

      <footer className="pt-foot">
        <button type="submit" className="pt-next">
          {step === 'welcome' ? 'Get started' : step === 'ready' ? (first ? 'Open Learn to Cook' : 'Done') : 'Next'}
        </button>
      </footer>
    </form>
  );
}
