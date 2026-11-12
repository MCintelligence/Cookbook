import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type AppSettings, getSettings, setSettings, useSettings } from '../settings';
import { ENGLISHES, type English, systemEnglish } from '../proofread/english';
import { SEASONINGS, type SeasoningId } from '../proofread/remarks';
import { WRITERS, type WriterKind, rulesFor, writerOf } from '../writers';
import { haptic, onBack } from '../mobile';
import { Face } from './Faces';
import { THEMES } from './Settings';
import { rememberTableSet } from './tableSet';
import {
  CATCHES,
  DANIEL_ASKS,
  JOINS,
  PETE_ASKS,
  PETE_ON,
  SALLY_ASKS_LOOK,
  SALLY_ASKS_NAME,
  SALLY_ON,
  SAM_ASKS,
  SAM_ON,
  danielOn,
  payoff,
  sallyOnName,
} from './tableVoices';

/**
 * Set the Table on a phone. Not a form: the Seasonings set the table with the writer. Each question
 * is asked by one of them, in their own voice, and they answer back when the writer picks (the
 * pattern Duolingo's owl made famous). Every choice shows what it does as it is made: the name goes
 * onto a title page, the theme and size change the screen and a sample page, the daily goal says
 * when a first draft would be done, and picking a Seasoning shows what they'd catch in a line.
 *
 * It is the whole screen, shown before the app and not over it; one question to a screen; the way on
 * is one wide button at the bottom, and Back (the arrow, or the phone's own) goes to the question
 * before. Each answer is saved as the writer moves on, so leaving halfway keeps what was said.
 */

type Step = 'welcome' | 'writer' | 'name' | 'english' | 'look' | 'goal' | 'seasonings' | 'ready';
const STEPS: Step[] = ['welcome', 'writer', 'name', 'english', 'look', 'goal', 'seasonings', 'ready'];
/** The questions proper, which the progress bar counts. */
const ASKED = STEPS.length - 2;
const GOALS = [250, 500, 1000, 1667, 2000];
const SIZES: [AppSettings['size'], number][] = [
  ['small', 15],
  ['medium', 19],
  ['large', 24],
];

const svg = (d: string, size = 24, width = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const ICONS: Record<WriterKind, string> = {
  novel: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13',
  short: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4',
  screen: 'M4 10h16v10H4zM4 10l1.6-4.6 14-1.4.4 1.8L5.6 7.4M9.6 5l1 4.4M14.6 4.5l1 4.5',
  nonfiction: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  student: 'M2 9.5l10-5 10 5-10 5zM6 11.5v4.5c3.5 2.5 8.5 2.5 12 0v-4.5M22 9.5V15',
  journal: 'M6 3h12v18H6zM9.5 3v18M13 3v6l1.5-1.2L16 9V3',
  poetry: 'M20 4C12 4 7 9 6 18M20 4c0 6-4.5 10.5-11 11M6 18l-2 2.5M10.5 14H15',
  mixed: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

/** What the title page says the book is. */
const COVER: Record<WriterKind, string> = {
  novel: 'A novel',
  short: 'A short story',
  screen: 'A script',
  nonfiction: 'Nonfiction',
  student: 'An essay',
  journal: 'A journal',
  poetry: 'Poems',
  mixed: 'A recipe',
};

/** Who asks each question. */
const HOSTS: Partial<Record<Step, SeasoningId>> = { writer: 'pete', name: 'sally', english: 'sam', look: 'sally', goal: 'daniel' };

/**
 * The table: a plate with a knife and fork, and the Seasonings seated round it. On the first screen
 * all four are there; on the last, only the ones the writer asked to stay.
 */
function TableArt({ seated, mark }: { seated: readonly string[]; mark: ReactNode }) {
  return (
    <div className="pt-table" aria-hidden="true">
      <svg className="pt-plate" viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="120" cy="120" r="70" strokeWidth="2" />
        <circle cx="120" cy="120" r="54" strokeWidth="1.2" />
        <path d="M22 86v26a8 8 0 0 0 16 0V86M30 86v68M30 112v42" strokeWidth="2" />
        <path d="M212 86c-9 6-10 28-2 36v32M210 122v32" strokeWidth="2" />
      </svg>
      <div className="pt-plate-mark">{mark}</div>
      {SEASONINGS.map((x, i) => (
        <span key={x.id} className={`pt-seat pt-seat-${i}`} data-on={seated.includes(x.id)}>
          <Face id={x.id} size={56} />
        </span>
      ))}
    </div>
  );
}

/** A Seasoning saying something: their face and a speech bubble that pops when the line changes. */
function Says({ who, line }: { who: SeasoningId; line: string }) {
  const name = SEASONINGS.find((x) => x.id === who)!.name;
  return (
    <div className="pt-says">
      <span className="pt-says-face">
        <Face id={who} size={46} />
      </span>
      <p key={line} className="pt-bubble" aria-live="polite">
        <span className="pt-bubble-who">{name}</span>
        {line}
      </p>
    </div>
  );
}

/** “color, center, realize” with the letters that differ between Englishes picked out. */
function Specimen({ sample }: { sample: string }) {
  const marks = [/(our|or)$/, /(re|er)$/, /([sz])e$/];
  return (
    <p className="pt-specimen" aria-hidden="true">
      {sample.split(', ').map((word, i) => {
        const m = word.match(marks[i] ?? /$^/);
        const at = m?.index ?? word.length;
        return (
          <span key={i}>
            {word.slice(0, at)}
            <b>{m?.[1]}</b>
            {m && word.slice(at + m[1]!.length)}
          </span>
        );
      })}
    </p>
  );
}

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
  /** Whether the writer has answered this screen yet, so the host waits to answer back. */
  const [picked, setPicked] = useState(false);
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
    setPicked(false);
    setStep(STEPS[to]!);
  };
  // The phone's Back goes to the question before; from the first, it leaves the questions.
  const back = useRef<() => boolean>(() => false);
  back.current = () => (at > 0 ? (go(at - 1), true) : (finish(), true));
  useEffect(() => onBack(() => back.current()), []);

  /** Keeps the answer to this question and goes to the next. */
  const next = () => {
    if (step === 'name') setSettings({ writerName: name.trim() });
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
    if (step === 'goal') setSettings({ dailyGoal: goal });
    if (step === 'seasonings') setSettings({ newSeasonings: SEASONINGS.map((x) => x.id).filter((id) => seasonings.includes(id)) });
    if (step === 'ready') return finish();
    haptic('tick');
    go(at + 1);
  };

  /** Runs a choice with a tick under the thumb, and lets the host answer back. */
  const choose = (pick: () => void) => () => {
    haptic('tick');
    setPicked(true);
    pick();
  };

  const firstName = (name.trim() || s.writerName).split(/\s+/)[0] ?? '';
  const kind = writerOf(writer);
  const englishOf = ENGLISHES.find((e) => e.id === english)!;
  const chosen = SEASONINGS.filter((x) => seasonings.includes(x.id));

  const lines: Partial<Record<Step, string>> = {
    writer: picked && writer ? PETE_ON[writer] : PETE_ASKS,
    name: name.trim() && picked ? sallyOnName(firstName) : SALLY_ASKS_NAME,
    english: picked ? SAM_ON[english] : SAM_ASKS,
    look: picked ? SALLY_ON[s.theme] : SALLY_ASKS_LOOK,
    goal: picked ? danielOn(goal) : DANIEL_ASKS,
  };

  const body: Record<Step, { title: string; content: ReactNode }> = {
    welcome: {
      title: 'Pull up a chair',
      content: (
        <>
          <TableArt seated={SEASONINGS.map((x) => x.id)} mark={<span className="pt-wordmark">cookbook</span>} />
          <p className="pt-lead pt-center">A kitchen for your writing. No account, and nothing leaves this phone. The Seasonings will set the table with you: six quick questions, any of them skippable.</p>
        </>
      ),
    },
    writer: {
      title: 'What’s cooking?',
      content: (
        <div className="pt-tiles" role="radiogroup" aria-label="What you write">
          {WRITERS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={writer === w.id} className="pt-tile" onClick={choose(() => setWriter(writer === w.id ? '' : w.id))}>
              <span className="pt-tile-icon">{svg(ICONS[w.id])}</span>
              <span className="pt-tile-name">{w.name}</span>
              <span className="pt-tile-blurb">{w.blurb}</span>
            </button>
          ))}
        </div>
      ),
    },
    name: {
      title: 'Whose name goes on the cover?',
      content: (
        <>
          <div className="pt-titlepage" aria-hidden="true">
            <span className="pt-tp-kind">{kind ? COVER[kind.id] : 'A recipe'}</span>
            <span className="pt-tp-title">Untitled</span>
            <span className="pt-tp-rule" />
            <span className={`pt-tp-by${name.trim() ? '' : ' pt-tp-empty'}`}>{name.trim() ? `by ${name.trim()}` : 'by …'}</span>
          </div>
          <label className="pt-field">
            <span className="pt-visually-hidden">Your name or pen name</span>
            <input
              className="pt-input"
              value={name}
              autoComplete="name"
              enterKeyHint="next"
              placeholder="Your name or pen name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setPicked(true)}
            />
            <span className="pt-hint">It goes on the title page of every recipe you start. A pen name is fine.</span>
          </label>
        </>
      ),
    },
    english: {
      title: 'Which English do you write?',
      content: (
        <>
          <Specimen sample={englishOf.sample} />
          <div className="pt-list" role="radiogroup" aria-label="Your English">
            {ENGLISHES.map((e) => (
              <button key={e.id} type="button" role="radio" aria-checked={english === e.id} className="pt-row" onClick={choose(() => setEnglish(e.id))}>
                <span className="pt-row-name">{e.name}</span>
                <span className="pt-row-blurb">{e.sample}</span>
                <span className="pt-dot">{english === e.id && svg(CHECK, 18, 2.6)}</span>
              </button>
            ))}
          </div>
        </>
      ),
    },
    look: {
      title: 'How should it look?',
      content: (
        <>
          <div className="pt-sample" aria-hidden="true">
            <span className="pt-sample-head">Chapter One</span>
            <p>The kitchen was warm before anyone woke. Somebody had left the bread to rise, and the whole house smelled of it.</p>
          </div>
          <div className="pt-swatches" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={s.theme === t.id} className="pt-swatch" onClick={choose(() => setSettings({ theme: t.id }))}>
                <span className="pt-swatch-pic" style={{ background: t.bg }}>
                  <span style={{ background: t.page }} />
                </span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-sizes" role="radiogroup" aria-label="Size of everything">
            {SIZES.map(([v, px]) => (
              <button key={v} type="button" role="radio" aria-checked={s.size === v} aria-label={v} onClick={choose(() => setSettings({ size: v }))}>
                <span style={{ fontSize: px }}>Aa</span>
              </button>
            ))}
          </div>
        </>
      ),
    },
    goal: {
      title: 'How many words a day?',
      content: (
        <>
          <div className="pt-goal">
            <button type="button" className="pt-step" aria-label="Fewer" onClick={choose(() => setGoal(Math.max(0, goal - (goal > 1000 ? 250 : 50))))}>
              {svg('M5 12h14', 26, 2.2)}
            </button>
            <label className="pt-goal-n">
              <input
                inputMode="numeric"
                aria-label="Words a day"
                value={goal ? goal.toLocaleString('en') : ''}
                placeholder="0"
                onChange={(e) => {
                  setPicked(true);
                  setGoal(Math.min(100000, Number(e.target.value.replace(/[^\d]/g, '')) || 0));
                }}
              />
              <span>words a day</span>
            </label>
            <button type="button" className="pt-step" aria-label="More" onClick={choose(() => setGoal(Math.min(100000, goal + (goal >= 1000 ? 250 : 50))))}>
              {svg('M5 12h14M12 5v14', 26, 2.2)}
            </button>
          </div>
          <div className="pt-chips" role="radiogroup" aria-label="Daily goal">
            {GOALS.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={goal === g} onClick={choose(() => setGoal(g))}>
                {g.toLocaleString('en')}
              </button>
            ))}
          </div>
          <p className="pt-payoff">
            {svg('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', 20)}
            <span>{payoff(goal, writer)}</span>
          </p>
        </>
      ),
    },
    seasonings: {
      title: 'Who reads over your shoulder?',
      content: (
        <>
          <div className="pt-demo" aria-label="What they would catch">
            <p className="pt-demo-line" aria-hidden="true">
              “<span className="pt-m" data-by="pete" data-on={seasonings.includes('pete')}>Their</span> going down to the{' '}
              <span className="pt-m" data-by="sam" data-on={seasonings.includes('sam')}>harbur</span>,” she said{' '}
              <span className="pt-m" data-by="sally" data-on={seasonings.includes('sally')}>very quietly</span>.
            </p>
            <ul className="pt-catches">
              {chosen.length ? (
                chosen.map((x) => (
                  <li key={x.id}>
                    <Face id={x.id} size={20} />
                    {CATCHES[x.id](english)}
                  </li>
                ))
              ) : (
                <li className="pt-catches-none">Nobody’s reading. The line goes out as it is.</li>
              )}
            </ul>
          </div>
          <div className="pt-list" role="group" aria-label="Seasonings">
            {SEASONINGS.map((x) => {
              const on = seasonings.includes(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="pt-row pt-cast"
                  onClick={choose(() => setSeasonings(on ? seasonings.filter((id) => id !== x.id) : [...seasonings, x.id]))}
                >
                  <span className="pt-cast-face">
                    <Face id={x.id} size={44} />
                  </span>
                  <span className="pt-row-text">
                    <span className="pt-row-name">
                      {x.name} <span className="pt-role">{x.role}</span>
                    </span>
                    <span key={String(on)} className="pt-row-blurb pt-voice">
                      {on ? JOINS[x.id] : 'Tap to ask them to the table.'}
                    </span>
                  </span>
                  <span className="pt-box">{on && svg(CHECK, 18, 2.6)}</span>
                </button>
              );
            })}
          </div>
        </>
      ),
    },
    ready: {
      title: firstName ? `The table’s set, ${firstName}` : 'The table’s set',
      content: (
        <>
          <TableArt seated={s.newSeasonings} mark={<span className="pt-done">{svg(CHECK, 56, 2)}</span>} />
          <p className="pt-lead pt-center">
            {kind ? `${kind.name} in ` : 'Writing in '}
            {ENGLISHES.find((e) => e.id === s.english)?.name ?? 'your phone’s'} English
            {s.dailyGoal > 0 ? `, ${s.dailyGoal.toLocaleString('en')} words a day` : ''}
            {s.newSeasonings.length
              ? `, with ${new Intl.ListFormat('en').format(SEASONINGS.filter((x) => s.newSeasonings.includes(x.id)).map((x) => x.name))} reading along.`
              : ', with nobody reading over your shoulder.'}
          </p>
          <p className="pt-hint pt-center">{first ? 'Next is Learn to Cook: a recipe made for trying things out. Change it, break it, delete it when you’re done.' : 'Settings changes any of this later.'}</p>
        </>
      ),
    },
  };
  const { title, content } = body[step];
  const host = HOSTS[step];
  const ends = step === 'welcome' || step === 'ready';

  return (
    <form
      className={`phone-table pt-is-${step}`}
      aria-labelledby="pt-title"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <header className="pt-top">
        {at > 0 ? (
          <button type="button" className="pt-icon" aria-label="Back" onClick={() => go(at - 1)}>
            {svg('M19 12H5M11 5l-7 7 7 7', 24, 2.2)}
          </button>
        ) : (
          <span className="pt-icon" />
        )}
        {!ends ? (
          <span className="pt-progress" role="progressbar" aria-label="Questions" aria-valuemin={1} aria-valuemax={ASKED} aria-valuenow={at}>
            {Array.from({ length: ASKED }, (_, i) => (
              <span key={i} data-done={i < at} />
            ))}
          </span>
        ) : (
          <span className="pt-progress-gap" />
        )}
        {step !== 'ready' && step !== 'welcome' ? (
          <button type="button" className="pt-skip" onClick={() => go(at + 1)}>
            Skip
          </button>
        ) : (
          <span className="pt-skip" />
        )}
      </header>

      <main key={step} className={`pt-main pt-${dir}`}>
        {host && <Says who={host} line={lines[step]!} />}
        <h1 id="pt-title" ref={heading} tabIndex={-1} className={ends ? 'pt-center' : undefined}>
          {title}
        </h1>
        {content}
      </main>

      <footer className="pt-foot">
        <button type="submit" className="pt-next">
          {step === 'welcome' ? 'Set the table' : step === 'ready' ? (first ? 'Open Learn to Cook' : 'Start cooking') : 'Continue'}
        </button>
        {step === 'welcome' && (
          <button type="button" className="pt-later" onClick={finish}>
            Skip, I’ll set it later
          </button>
        )}
      </footer>
    </form>
  );
}
