import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type AppSettings, getSettings, setSettings, useSettings } from '../settings';
import { ENGLISHES, type English, systemEnglish } from '../proofread/english';
import { SEASONINGS } from '../proofread/remarks';
import { WRITERS, type WriterKind, rulesFor, writerOf } from '../writers';
import { THEMES } from './Settings';
import { rememberTableSet } from './tableSet';

/**
 * Set the Table: a few questions the first time Cookbook starts, before Learn
 * to Cook. Every one can be skipped, everything is kept on this device, and
 * Cookbook Settings › General changes any of it later. Each answer is saved when
 * the writer moves past its question, so leaving halfway keeps what was said.
 */

type Step = 'welcome' | 'english' | 'writer' | 'look' | 'goal' | 'seasonings' | 'ready';
const STEPS: Step[] = ['welcome', 'english', 'writer', 'look', 'goal', 'seasonings', 'ready'];
const GOALS = [100, 250, 500, 750, 1000, 1667, 2000];
const SIZES: [AppSettings['size'], string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

export function SetTheTable({ first, onDone }: { first: boolean; onDone: () => void }) {
  const s = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(s.writerName);
  const [english, setEnglish] = useState<English>(s.english === 'auto' ? systemEnglish() : s.english);
  const [writer, setWriter] = useState<WriterKind | ''>(s.writer);
  const [goal, setGoal] = useState(s.dailyGoal);
  const [seasonings, setSeasonings] = useState<string[]>(s.newSeasonings.length ? s.newSeasonings : ['sam', 'pete']);
  const box = useRef<HTMLFormElement>(null);
  const at = STEPS.indexOf(step);

  // Each question's heading gets the keyboard, so a screen reader reads it and Tab starts on its choices.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [step]);

  const finish = () => {
    rememberTableSet();
    onDone();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), finish());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    setStep(STEPS[at + 1]!);
  };

  const first_name = s.writerName.split(/\s+/)[0];
  const body: Record<Step, { title: string; lead?: ReactNode; content?: ReactNode }> = {
    welcome: {
      title: 'Welcome to Cookbook',
      lead: 'A few quick questions to set your table before How to Cook shows you round. Skip any of them: everything stays on this device, there’s no account, and Cookbook Settings › General changes it all later.',
      content: (
        <label className="new-field">
          <span className="sub-h">
            What should Cookbook call you? <span className="new-optional">optional</span>
          </span>
          <input className="new-input" value={name} autoComplete="name" placeholder="Your name or pen name" onChange={(e) => setName(e.target.value)} />
          <span className="table-hint">It goes on the title page of the recipes you start, when you plate them.</span>
        </label>
      ),
    },
    english: {
      title: 'Which English do you write?',
      lead: 'Salty Sam spells by it and Peppery Pete follows its grammar. Each recipe can still choose its own.',
      content: (
        <div className="table-choices" role="radiogroup" aria-label="Your English">
          {ENGLISHES.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={english === e.id} className="table-choice" onClick={() => setEnglish(e.id)}>
              <span className="table-choice-name">{e.name}</span>
              <span className="table-choice-blurb">{e.sample}</span>
            </button>
          ))}
        </div>
      ),
    },
    writer: {
      title: 'What do you mostly write?',
      lead: 'Cookbook picks starting points to suit: the template a new recipe offers first, a daily goal and who proofreads.',
      content: (
        <div className="table-choices" role="radiogroup" aria-label="What you write">
          {WRITERS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={writer === w.id} className="table-choice" onClick={() => setWriter(writer === w.id ? '' : w.id)}>
              <span className="table-choice-name">{w.name}</span>
              <span className="table-choice-blurb">{w.blurb}</span>
            </button>
          ))}
        </div>
      ),
    },
    look: {
      title: 'How should the kitchen look?',
      lead: 'Changes show straight away behind this window.',
      content: (
        <>
          <div className="new-field">
            <span className="sub-h">Theme</span>
            <div className="set-themes" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" className="set-theme" aria-pressed={s.theme === t.id} aria-checked={s.theme === t.id} onClick={() => setSettings({ theme: t.id })}>
                  <span className="set-theme-pic" style={{ background: t.bg }}>
                    <span style={{ background: t.side }} />
                    <span style={{ background: t.page }} />
                  </span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="new-field">
            <span className="sub-h">Text size</span>
            <div className="set-seg" role="radiogroup" aria-label="Text size">
              {SIZES.map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={s.size === v} aria-pressed={s.size === v} onClick={() => setSettings({ size: v })}>
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
      lead: 'Your goal fills the ring in the bottom bar and keeps your streak going. Any recipe can set its own.',
      content: (
        <div className="new-field">
          <div className="set-seg table-goals" role="radiogroup" aria-label="Daily goal">
            {GOALS.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={goal === g} aria-pressed={goal === g} onClick={() => setGoal(g)}>
                {g.toLocaleString('en')}
              </button>
            ))}
          </div>
          <label className="table-own">
            Or your own:
            <input
              className="new-input table-goal-input"
              inputMode="numeric"
              aria-label="Words a day"
              value={goal ? goal.toLocaleString('en') : ''}
              onChange={(e) => setGoal(Math.min(100000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
            />
            words
          </label>
          <span className="table-hint">1,667 a day is a 50,000-word draft in a month.</span>
        </div>
      ),
    },
    seasonings: {
      title: 'Who should read over your shoulder?',
      lead: 'The Seasonings proofread on this device, each for one thing. New recipes start with the ones you pick; add or drop them any time.',
      content: (
        <div className="table-choices" role="group" aria-label="Seasonings">
          {SEASONINGS.map((x) => {
            const on = seasonings.includes(x.id);
            return (
              <button key={x.id} type="button" aria-pressed={on} className="table-choice" onClick={() => setSeasonings(on ? seasonings.filter((id) => id !== x.id) : [...seasonings, x.id])}>
                <span className="table-choice-name">{x.name}</span>
                <span className="table-choice-blurb">{SEASONING_BLURBS[x.id]}</span>
              </button>
            );
          })}
        </div>
      ),
    },
    ready: {
      title: first_name ? `Your table is set, ${first_name}` : 'Your table is set',
      lead: first ? 'Next is How to Cook: a recipe made for trying things out. Change it, or delete it from Your Recipes when you’re done.' : 'Change any of this in Cookbook Settings › General.',
      content: (
        <dl className="table-summary">
          <dt>English</dt>
          <dd>{s.english === 'auto' ? 'As your system' : ENGLISHES.find((e) => e.id === s.english)?.name}</dd>
          <dt>You write</dt>
          <dd>{writerOf(s.writer)?.name ?? 'Not said'}</dd>
          <dt>Daily goal</dt>
          <dd>{s.dailyGoal.toLocaleString('en')} words</dd>
          <dt>Seasonings</dt>
          <dd>{s.newSeasonings.length ? SEASONINGS.filter((x) => s.newSeasonings.includes(x.id)).map((x) => x.name).join(', ') : 'You’ll pick them in the Seasonings panel'}</dd>
        </dl>
      ),
    },
  };
  const { title, lead, content } = body[step];
  const skippable = step !== 'welcome' && step !== 'ready';

  return (
    <div className="lib-backdrop table-backdrop">
      <form
        ref={box}
        className="lib table"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-title"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div className="recipes-head">
          <span className="sub-h">Set the Table</span>
          <span className="recipes-spacer" />
          <span className="table-dots" aria-label={`Question ${at + 1} of ${STEPS.length}`}>
            {STEPS.map((x, i) => (
              <span key={x} className={i === at ? 'on' : i < at ? 'done' : ''} />
            ))}
          </span>
        </div>
        <div className="table-main">
          <h2 id="table-title" className="panel-h" tabIndex={-1}>
            {title}
          </h2>
          {lead && <p className="table-lead">{lead}</p>}
          {content}
        </div>
        <div className="new-foot">
          {step === 'ready' ? (
            <span />
          ) : (
            <button type="button" className="text-link" onClick={finish}>
              {step === 'welcome' ? 'Skip the questions' : 'Skip the rest'}
            </button>
          )}
          <span className="lib-row">
            {at > 0 && (
              <button type="button" className="btn" onClick={() => setStep(STEPS[at - 1]!)}>
                Back
              </button>
            )}
            {skippable && (
              <button type="button" className="btn" onClick={() => setStep(STEPS[at + 1]!)}>
                Skip
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {step === 'welcome' ? 'Let’s start' : step === 'ready' ? (first ? 'Open How to Cook' : 'Back to writing') : 'Next'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

const SEASONING_BLURBS: Record<string, string> = {
  sam: 'Spelling, in your English.',
  pete: 'Grammar and punctuation.',
  daniel: 'How much of the page is dialogue.',
  sally: 'Style: adverbs, clichés and how hard a page is to read.',
};
