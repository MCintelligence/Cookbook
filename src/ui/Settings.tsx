import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isTouch } from '../mobile';
import { Icon } from './Icon';
import { type AppSettings, MARKDOWN_RULES, type Theme, getSettings, setSettings, useSettings } from '../settings';
import { WRITERS } from '../writers';
import { SEASONINGS } from '../proofread/remarks';
import { SHORTCUTS, binding, bindingOf, keys, setBinding } from '../shortcuts';
import { type BookInfo } from '../storage/book';
import { MARGINS, PAGE_SIZES, type PageSettings, pageOf } from '../storage/page';
import { ZoomSlider } from './ZoomControl';
import { type Proofreader } from '../proofread/useProofreader';
import { RULE_GROUPS } from '../proofread/rules';
import { DIALECTS, ENGLISHES } from '../proofread/english';
import { FontOptions, lookForNewFonts, pickFont } from './FontOptions';
import { BODY, type ParagraphStyle, type StyleSheet, resolveParagraphStyle } from '../styles/styles';

export type SettingsSection = 'general' | 'appearance' | 'writing' | 'saving' | 'shortcuts' | 'updates' | 'page' | 'styles' | 'proofreader' | 'goals';

const APP_SECTIONS: [SettingsSection, string][] = [
  ['general', 'General'],
  ['appearance', 'Appearance'],
  ['writing', 'Writing'],
  ['saving', 'Saving and backups'],
  ['shortcuts', 'Keyboard shortcuts'],
  ['updates', 'Updates and privacy'],
];
const BOOK_SECTIONS: [SettingsSection, string][] = [
  ['page', 'Layout'],
  ['styles', 'Styles'],
  ['proofreader', 'Seasonings'],
  ['goals', 'Goals'],
];
const ALL_SECTIONS = [...APP_SECTIONS, ...BOOK_SECTIONS];
export const SECTION_TITLES = Object.fromEntries([...APP_SECTIONS, ...BOOK_SECTIONS]) as Record<SettingsSection, string>;

export interface BackupInfo {
  /** Where automatic backups go, as the writer reads it. */
  folder: string;
  canChoose: boolean;
  last: Date | null;
  count: number;
  /** The backup folder is on the same disk as the recipe, so one broken or lost disk would take both. */
  sameDisk: boolean;
  /** Why the last automatic backup failed, until one works again. */
  problem: string | null;
}

interface Props {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  onClose: () => void;
  book: BookInfo | null;
  onBook: (changes: Partial<BookInfo>) => void;
  sheet: StyleSheet;
  onEditStyle: (id: string, changes: Partial<ParagraphStyle>) => void;
  onAddStyle: (name: string, basedOn: string) => string;
  onRenameStyle: (id: string, name: string) => void;
  proof: Proofreader;
  onExportHistory: () => void;
  backups: BackupInfo;
  onBackUpNow: () => Promise<void>;
  onRestore: () => void;
  onChooseBackupFolder: () => void;
  newBooksFolder: string | null;
  onChooseNewBooksFolder: () => void;
  version: string;
  /** Opens Set the Table, the welcome questions. */
  onSetTable: () => void;
  onCheckUpdates: () => Promise<string>;
}

/** The search box's words: rows that don't match are hidden, in every section at once. */
const Query = createContext('');
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function matches(query: string, ...texts: (string | undefined)[]) {
  const q = fold(query.trim());
  return !q || q.split(/\s+/).every((w) => texts.some((t) => t && fold(t).includes(w)));
}

function Row({ title, help, children, words }: { title: string; help?: ReactNode; children?: ReactNode; words?: string }) {
  const query = useContext(Query);
  if (!matches(query, title, typeof help === 'string' ? help : undefined, words)) return null;
  return (
    <div className="set-row">
      <div className="set-row-text">
        <span className="set-row-title">{title}</span>
        {help && <span className="set-row-help">{help}</span>}
      </div>
      {children}
    </div>
  );
}

/** A heading and its card of rows; hidden by CSS when a search leaves it empty. */
function Group({ title, children, plain }: { title: string; children: ReactNode; plain?: boolean }) {
  return (
    <div className="set-group">
      <h3 className="set-h3">{title}</h3>
      <div className={`set-card${plain ? ' set-card-plain' : ''}`}>{children}</div>
    </div>
  );
}

function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return <button className="set-sw" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="set-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select className="set-sel" aria-label={label} value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
      {options.map(([v, text]) => (
        <option key={String(v)} value={String(v)}>
          {text}
        </option>
      ))}
    </select>
  );
}

/** A number that saves when the writer leaves the field or presses Enter. */
function NumberField({ label, value, placeholder, required, onCommit }: { label: string; value: number | undefined; placeholder?: string; required?: boolean; onCommit: (v: number | undefined) => void }) {
  const show = (v: number | undefined) => (v ? v.toLocaleString('en') : '');
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text.replace(/[^\d]/g, '')));
    const next = Number.isFinite(n) && n > 0 ? n : undefined;
    if (next === undefined && required) return setText(show(value));
    setText(show(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="set-num"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export const THEMES: { id: Theme; label: string; bg: string; side: string; page: string }[] = [
  { id: 'system', label: 'System', bg: 'linear-gradient(90deg, #f4f4f2 50%, #121212 50%)', side: '#a3a39e', page: '#fdfdfc' },
  { id: 'light', label: 'Light', bg: '#f4f4f2', side: '#f1f1ef', page: '#fdfdfc' },
  { id: 'dark', label: 'Dark', bg: '#121212', side: '#161616', page: '#fdfdfc' },
  { id: 'sepia', label: 'Sepia', bg: '#201b17', side: '#231e19', page: '#efe6d6' },
];

const CHECK_HELP: Record<string, string> = {
  spelling: 'Salty Sam: a red wavy underline.',
  name: 'Salty Sam: “Mamma Lou” when the Pantry has Mama Lou.',
  grammar: 'Peppery Pete: a blue wavy underline, while Seasonings is open.',
  'unclosed-quote': 'Peppery Pete: a blue wavy underline, while Seasonings is open.',
  'stray-capitals': 'Peppery Pete: “MOnster” or “mONSTER”, while Seasonings is open.',
  agreement: 'Peppery Pete: “the children was”, while Seasonings is open.',
  'word-mixup': 'Peppery Pete: “your going”, “less people”, while Seasonings is open.',
  'pronoun-case': 'Peppery Pete: “me and him went”, while Seasonings is open.',
  'verb-form': 'Peppery Pete: “I seen”, “was laying on the bed”, while Seasonings is open.',
  'reported-question': 'Peppery Pete: “he asked where are you going?”, while Seasonings is open.',
  'look-alike': 'Peppery Pete: “form” for “from”, “quite” for “quiet”, found from the words around them.',
  apostrophe: 'Peppery Pete: “the apple’s were ripe”, “the Smith’s came”.',
  'double-negative': 'Peppery Pete: “didn’t have no”, outside speech.',
  'run-on': 'Peppery Pete: “it was late, she was tired”. Off at first, since novels use these on purpose.',
  fragment: 'Peppery Pete: “Because the oven was cold.” standing alone. Fragments like “Half past nine.” are left alone, and so is speech.',
  dangling: 'Peppery Pete: “Running down the stairs, the bread fell”, when what comes after the comma plainly can’t do the opening’s action.',
  'tense-shift': 'Peppery Pete: “he went to the store and buys milk”, outside speech.',
  capitals: 'Peppery Pete: “monday”, “english”, or a sentence that starts in lower case.',
  usage: 'Peppery Pete: “irregardless”, and “alright” outside speech.',
  OxfordComma: 'Spicy Sally: asks for a comma in “bread, butter, and jam”. Off at first, since house styles differ.',
  'own-pattern': 'Spicy Sally: the phrases on your own list, below.',
};

/**
 * Settings, in one place. App settings stay on this device; book settings are
 * saved in the book's folder, so they travel with it. Every change saves at once.
 */
export function Settings(props: Props) {
  const { section, onSection, onClose } = props;
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const searching = query.trim() !== '';

  // Settings is one long page: the list on the left jumps to a section and follows the scroll.
  const [spied, setSpied] = useState(section);
  const jump = (id: SettingsSection, smooth = false) => {
    const el = box.current?.querySelector<HTMLElement>(`#set-${id}`);
    el?.scrollIntoView({ block: 'start', behavior: smooth && !document.documentElement.hasAttribute('data-reduce-motion') ? 'smooth' : 'auto' });
    // The section's heading gets the keyboard, so the first Tab lands in it.
    el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    setSpied(id);
  };
  useEffect(() => jump(section), [section]);
  useEffect(() => {
    const root = box.current;
    if (!root || searching) return;
    // Watched by the browser, not on every scroll event: the topmost section in view is the one marked.
    const seen = new Map<string, boolean>();
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const top = ALL_SECTIONS.find(([id]) => seen.get(`set-${id}`));
        if (top) setSpied(top[0]);
      },
      { root, rootMargin: '-64px 0px -55% 0px' },
    );
    root.querySelectorAll('.set-section').forEach((el) => watch.observe(el));
    return () => watch.disconnect();
  }, [searching]);

  // Escape is heard from anywhere, not only from inside the dialog: a click on
  // the background leaves the keyboard on the page itself, and Escape still
  // has to close Settings from there.
  const escape = useRef(() => {});
  escape.current = () => (searching ? setQuery('') : onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !(e.target instanceof Node)) return;
      const inside = box.current?.contains(e.target) ?? false;
      // Something inside that took the Escape itself (a field, the shortcut recorder) keeps it,
      // and an open menu closes first.
      if ((inside && e.defaultPrevented) || (e.target instanceof Element && e.target.closest('.set-recording')) || document.querySelector('.menu')) return;
      e.preventDefault();
      escape.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = ALL_SECTIONS.map(([id]) => id);
  const pick = (id: SettingsSection) => {
    setQuery('');
    // The page is laid out again without the search first, then scrolled.
    window.requestAnimationFrame(() => jump(id, true));
    onSection(id);
  };
  return (
    <div
      className="settings"
      role="dialog"
      aria-modal="true"
      aria-label="App Settings"
      ref={box}
      // A click on the background keeps the keyboard in Settings rather than dropping it on the page.
      tabIndex={-1}
    >
      <header className="set-top">
        <div className="set-brand">
          <span className="brand">cookbook</span>
          <span className="set-crumb">· App Settings</span>
        </div>
        <div className="set-top-actions">
          <label className="set-search">
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search settings" aria-label="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="set-btn" onClick={onClose}>
            Back to writing
          </button>
        </div>
      </header>
      <div className="set-body">
        <nav className="set-nav" aria-label="App Settings sections">
          <div className="set-scope">App Settings</div>
          {APP_SECTIONS.map(([id, label]) => (
            <NavItem key={id} id={id} label={label} current={!searching && id === spied} onPick={pick} />
          ))}
          <div className="set-scope">Recipe Settings</div>
          {BOOK_SECTIONS.map(([id, label]) => (
            <NavItem key={id} id={id} label={label} current={!searching && id === spied} onPick={pick} />
          ))}
          <p className="set-note">Recipe settings are saved in the recipe’s folder, so they travel with it. App settings stay on this device.</p>
        </nav>
        <main className="set-main">
          <Query.Provider value={query}>
            {sections.map((s) => (
              <section key={s} id={`set-${s}`} className="set-section" aria-label={SECTION_TITLES[s]}>
                <h2 className="set-h2" tabIndex={-1}>
                  {SECTION_TITLES[s]}
                </h2>
                <SectionBody id={s} {...props} />
              </section>
            ))}
            {searching && <p className="set-none">No settings match “{query.trim()}”.</p>}
          </Query.Provider>
          <p className="set-foot">Changes save as you make them.</p>
        </main>
      </div>
    </div>
  );
}

function NavItem({ id, label, current, onPick }: { id: SettingsSection; label: string; current: boolean; onPick: (s: SettingsSection) => void }) {
  return (
    <button className={`set-nav-item${current ? ' on' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => onPick(id)}>
      {label}
    </button>
  );
}

function SectionBody({ id, ...props }: Props & { id: SettingsSection }) {
  const s = useSettings();
  const query = useContext(Query);
  const set = (changes: Partial<AppSettings>) => setSettings(changes);
  switch (id) {
    case 'general':
      return (
        <>
          <Group title="About you">
            <Row title="Your name" help="Optional. New recipes put it on their title page when they’re plated." words="author">
              <input className="set-text" aria-label="Your name" placeholder="Not set" defaultValue={s.writerName} onBlur={(e) => e.target.value !== s.writerName && set({ writerName: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            </Row>
            <Row title="Your English" help="Which spelling Salty Sam checks in a recipe that hasn’t chosen its own (Recipe Settings › Seasonings)." words="language spelling dialect american british canadian australian">
              <Select label="Your English" value={s.english} options={[['auto', 'As my system'], ...ENGLISHES.map((e): [string, string] => [e.id, e.name])] as [AppSettings['english'], string][]} onChange={(english) => set({ english })} />
            </Row>
            <Row title="What you write" help="Picks the template New Recipe offers first." words="writer novelist template">
              <Select label="What you write" value={s.writer} options={[['', 'Not set'], ...WRITERS.map((w): [string, string] => [w.id, w.name])] as [AppSettings['writer'], string][]} onChange={(writer) => set({ writer })} />
            </Row>
            <Row title="Daily goal" help="Words a day, for every recipe that hasn’t set its own goal." words="words goal streak">
              <NumberField label="Daily goal" value={s.dailyGoal} required onCommit={(dailyGoal) => dailyGoal && set({ dailyGoal })} />
            </Row>
            <Row title="Seasonings for new recipes" help="Who reads a new recipe from the start. With none, the Seasonings panel asks." words="proofreader salty sam peppery pete drunk daniel spicy sally">
              <div className="set-checks" role="group" aria-label="Seasonings for new recipes">
                {SEASONINGS.map((x) => (
                  <label key={x.id} className="set-check" title={x.role}>
                    <input type="checkbox" checked={s.newSeasonings.includes(x.id)} onChange={(e) => set({ newSeasonings: e.target.checked ? SEASONINGS.map((y) => y.id).filter((id) => id === x.id || s.newSeasonings.includes(id)) : s.newSeasonings.filter((id) => id !== x.id) })} />
                    {x.name.split(' ')[1]}
                  </label>
                ))}
              </div>
            </Row>
            <Row title="Set the Table" help="Go through the welcome questions again." words="onboarding welcome questions">
              <button className="set-btn" onClick={props.onSetTable}>
                Set the Table…
              </button>
            </Row>
          </Group>
          <Group title="Starting up">
            <Row title="Reopen where I left off" help="Open the last recipe at the item you were writing when Cookbook starts.">
              <Switch label="Reopen where I left off" on={s.reopenLast} onChange={(reopenLast) => set({ reopenLast })} />
            </Row>
            <Row title="Where new recipes go" help={props.newBooksFolder ?? 'In this browser’s own storage. Use “Open a recipe’s folder…” in Your recipes to keep a recipe somewhere else.'}>
              {props.newBooksFolder !== null && (
                <button className="set-btn" onClick={props.onChooseNewBooksFolder}>
                  Choose folder…
                </button>
              )}
            </Row>
          </Group>
          <Group title="Keyboard">
            <Row title="Show shortcuts as" help="Picked from your system. Change it if you use a Mac keyboard on Windows, or the other way round.">
              <Seg
                label="Show shortcuts as"
                value={s.shortcutStyle}
                options={[
                  ['auto', 'Automatic'],
                  ['mac', '⌘ Mac'],
                  ['pc', 'Ctrl'],
                ]}
                onChange={(shortcutStyle) => set({ shortcutStyle })}
              />
            </Row>
          </Group>
        </>
      );
    case 'appearance':
      return (
        <>
          <div className="set-group">
            <h3 className="set-h3">Theme</h3>
            {matches(query, 'Theme', 'System Light Dark Sepia colour color') && (
              <div className="set-card set-card-plain set-row-host">
                <div className="set-themes set-row" role="group" aria-label="Theme">
                  {THEMES.map((t) => (
                    <button key={t.id} className="set-theme" aria-pressed={s.theme === t.id} onClick={() => set({ theme: t.id })}>
                      <span className="set-theme-pic" style={{ background: t.bg }}>
                        <span style={{ background: t.side }} />
                        <span style={{ background: t.page }} />
                      </span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                <p className="set-row-help">System follows your computer’s light or dark setting.</p>
              </div>
            )}
          </div>
          <Group title="Interface">
            <Row title="Interface size" help="Menus, sidebar and buttons. The page has its own zoom, in Layout.">
              <Seg
                label="Interface size"
                value={s.size}
                options={[
                  ['small', 'Small'],
                  ['medium', 'Medium'],
                  ['large', 'Large'],
                ]}
                onChange={(size) => set({ size })}
              />
            </Row>
            <Row title="Reduce motion" help="Turn off sliding panels and fades.">
              <Switch label="Reduce motion" on={s.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} />
            </Row>
          </Group>
        </>
      );
    case 'writing':
      return (
        <>
          <Group title="Typing shortcuts">
            <Row title="Curly quotes and apostrophes" help={'"like this" becomes “like this”.'}>
              <Switch label="Curly quotes" on={s.curlyQuotes} onChange={(curlyQuotes) => set({ curlyQuotes })} />
            </Row>
            <Row title="Two hyphens make an em dash" help="-- becomes —, and ... becomes …">
              <Switch label="Em dash" on={s.emDash} onChange={(emDash) => set({ emDash })} />
            </Row>
            <Row title="Typing @ opens the Pantry shelf" help="Not after a letter or number, so email addresses are left alone.">
              <Switch label="Typing @ opens the Pantry shelf" on={s.atShelf} onChange={(atShelf) => set({ atShelf })} />
            </Row>
            <Row title="Typing / opens the insert menu" help="At the start of a line or after a space: styles, lists, a table, a section break or a footnote.">
              <Switch label="Typing / opens the insert menu" on={s.slashMenu} onChange={(slashMenu) => set({ slashMenu })} />
            </Row>
          </Group>
          <Group title="Line breaks">
            <Row title="Hyphenate long words" help="Off, words wrap whole, as in Scrivener. On, only words of 7 letters or more break, with 3 letters either side of the hyphen." words="hyphenation hyphens line breaks">
              <Switch label="Hyphenate long words" on={s.hyphenate} onChange={(hyphenate) => set({ hyphenate })} />
            </Row>
            <Row title="Even out line endings" help="A paragraph doesn’t end on a lone word when a better break is nearby. Plate always keeps lone lines off the top and bottom of a printed page." words="widows orphans short last line wrap">
              <Switch label="Even out line endings" on={s.evenLines} onChange={(evenLines) => set({ evenLines })} />
            </Row>
          </Group>
          <Group title="Markdown">
            <Row
              title="Markdown"
              help={`Turns every rule below on or off at once. Off, typing never turns into formatting, and !Word shows as written. Formatting already on the page stays, and nothing in your text changes. ${keys('Mod-B')}, I and U still apply your character styles.`}
              words="markdown formatting shortcuts typing"
            >
              <Switch label="Markdown" on={s.markdown} onChange={(markdown) => set({ markdown })} />
            </Row>
            {MARKDOWN_RULES.map((rule) => (
              <Row key={rule.id} title={rule.label} help={rule.id === 'dropCap' ? '!Word shows its first letter as a drop cap. The file keeps the !.' : rule.example} words="markdown rule">
                <Switch
                  label={rule.label}
                  on={s.markdownRules[rule.id]}
                  disabled={!s.markdown}
                  onChange={(on) => set({ markdownRules: { ...s.markdownRules, [rule.id]: on } })}
                />
              </Row>
            ))}
          </Group>
          <Group title="While writing">
            <Row title="Oven Mode" help={`Focus mode: hides the panels and fades everything but where you are. Stove Mode is the normal view. ${keys(binding('focus'))} turns it on and off.`}>
              <Switch label="Oven Mode" on={s.focus} onChange={(focus) => set({ focus })} />
            </Row>
            <Row title="Oven Mode keeps bright" help="The rest of the page fades.">
              <Select
                label="Oven Mode keeps bright"
                value={s.fade}
                options={[
                  ['paragraph', 'The paragraph'],
                  ['sentence', 'The sentence'],
                ]}
                onChange={(fade) => set({ fade })}
              />
            </Row>
            <Row title="Typewriter scrolling" help="Keeps the line you’re typing in the middle of the window.">
              <Switch label="Typewriter scrolling" on={s.typewriter} onChange={(typewriter) => set({ typewriter })} />
            </Row>
            <Row title="Paste from Word, Scrivener and the web" help={`Keep bold, italic, headings, lists and tables, or paste plain text. ${keys('Mod-Shift-V')} always pastes plain text.`}>
              <Seg
                label="Paste"
                value={s.pastePlain ? 'plain' : 'keep'}
                options={[
                  ['keep', 'Keep formatting'],
                  ['plain', 'Plain text'],
                ]}
                onChange={(v) => set({ pastePlain: v === 'plain' })}
              />
            </Row>
          </Group>
        </>
      );
    case 'saving':
      return <Saving {...props} />;
    case 'shortcuts':
      return <Shortcuts />;
    case 'updates':
      return <Updates version={props.version} onCheck={props.onCheckUpdates} />;
    case 'page':
      return <PageView book={props.book} onBook={props.onBook} sheet={props.sheet} onEditStyle={props.onEditStyle} />;
    case 'styles':
      return <Styles sheet={props.sheet} onEditStyle={props.onEditStyle} onAddStyle={props.onAddStyle} onRenameStyle={props.onRenameStyle} />;
    case 'proofreader':
      return <Proofreading proof={props.proof} />;
    case 'goals':
      return <GoalSettings book={props.book} onBook={props.onBook} onExport={props.onExportHistory} />;
  }
}

function Saving({ backups, onBackUpNow, onRestore, onChooseBackupFolder }: Props) {
  const s = useSettings();
  const [busy, setBusy] = useState(false);
  const last = backups.last ? backups.last.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : 'None yet';
  return (
    <>
      <Group title="Saving">
        <Row title="Save" help="Cookbook always saves before closing, whichever you pick.">
          <Select
            label="Save"
            value={s.saveDelay}
            options={[
              [600, 'As I type'],
              [1000, 'After a 1 second pause'],
              [5000, 'After a 5 second pause'],
            ]}
            onChange={(saveDelay) => setSettings({ saveDelay })}
          />
        </Row>
        <Row title="Undo history" help="Undo reaches back past closing the app, item by item. It is kept in the recipe’s hidden .cookbook folder." />
      </Group>
      <Group title="Automatic backups">
        <Row
          title="Back up the recipe automatically"
          help="A zip of the whole recipe’s folder, snapshots and trash included: every half hour while you write, when you close Cookbook or open another recipe, and after Cookbook stops without closing."
        >
          <Switch label="Back up automatically" on={s.backupOnClose} onChange={(backupOnClose) => setSettings({ backupOnClose })} />
        </Row>
        <Row title="Keep" help="Besides these, one backup a day is kept for a week and one a week for a month. Older automatic backups are removed.">
          <Select
            label="Backups kept"
            value={s.keepBackups}
            options={[
              [10, 'The last 10 backups'],
              [25, 'The last 25 backups'],
              [0, 'All backups'],
            ]}
            onChange={(keepBackups) => setSettings({ keepBackups })}
          />
        </Row>
        <Row
          title="Backup folder"
          help={
            backups.sameDisk ? (
              <>
                {backups.folder}
                <span className="set-row-warn">On the same disk as this recipe, so a broken or lost computer would take both. A folder on another drive, or one a cloud service syncs, keeps them apart.</span>
              </>
            ) : (
              backups.folder
            )
          }
          words={`${backups.folder} disk drive`}
        >
          {backups.canChoose && (
            <button className="set-btn" onClick={onChooseBackupFolder}>
              Choose folder…
            </button>
          )}
        </Row>
        <Row
          title="Last backup"
          help={
            <>
              {`${last} · ${backups.count} ${backups.count === 1 ? 'backup' : 'backups'} of this recipe. Each one is opened again after it is made, to check it is complete.`}
              {backups.problem && <span className="set-row-warn">{backups.problem.replace(/ \([^]*\)$/, '')}</span>}
            </>
          }
          words="last backup check failed"
        >
          <div className="set-actions">
            <button className="set-btn" disabled={backups.count === 0} onClick={onRestore}>
              Restore…
            </button>
            <button
              className="set-btn primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onBackUpNow().finally(() => setBusy(false));
              }}
            >
              {busy ? 'Backing up…' : 'Back up now'}
            </button>
          </div>
        </Row>
      </Group>
      <Group title="Snapshots">
        <Row title="Take a snapshot before splitting, merging or replacing all" help="Compare or roll back from the item’s right-click menu on the Shelf, under Snapshots.">
          <Switch label="Automatic snapshots" on={s.autoSnapshot} onChange={(autoSnapshot) => setSettings({ autoSnapshot })} />
        </Row>
      </Group>
    </>
  );
}

function Shortcuts() {
  const s = useSettings();
  const [recording, setRecording] = useState<string | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  const query = useContext(Query);
  const shown = SHORTCUTS.filter((c) => matches(query, c.label, keys(binding(c.id)), 'keyboard shortcut'));
  return (
    <>
      <div className="set-group">
        <h3 className="set-h3">Click a shortcut to change it</h3>
        <div className="set-card">
          {shown.map((c) => {
            const mine = s.shortcuts[c.id];
            return (
              <div className="set-row" key={c.id}>
                <span className="set-row-title">{c.label}</span>
                <span className="set-actions">
                  {mine && recording !== c.id && (
                    <button className="set-link" onClick={() => setBinding(c.id, null)}>
                      Reset
                    </button>
                  )}
                  <button
                    className={`set-btn set-key${recording === c.id ? ' set-recording' : ''}`}
                    aria-label={recording === c.id ? `Press the new shortcut for ${c.label}, or Escape to keep it` : `Change shortcut for ${c.label}`}
                    onClick={() => setRecording(recording === c.id ? null : c.id)}
                    onBlur={() => recording === c.id && setRecording(null)}
                    onKeyDown={(e) => {
                      if (recording !== c.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.key === 'Escape') return setRecording(null);
                      const b = bindingOf(e.nativeEvent);
                      if (!b) return;
                      // A shortcut needs ⌘/Ctrl or Alt, or it would type a letter.
                      if (!/(^|-)(Mod|Alt|Ctrl)-/.test(b) && !/^F\d+$/.test(b)) return setClash('Use ⌘ or Ctrl (or Alt) with a key.');
                      const other = SHORTCUTS.find((o) => o.id !== c.id && binding(o.id).toLowerCase() === b.toLowerCase());
                      setClash(other ? `${keys(b)} was ${other.label}; that has no shortcut now.` : null);
                      if (other) setBinding(other.id, '');
                      setBinding(c.id, b);
                      setRecording(null);
                    }}
                  >
                    <span className="set-kbd">{recording === c.id ? 'Press keys…' : binding(c.id) ? keys(binding(c.id)) : 'None'}</span>
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {clash && (
        <p className="set-row-help" role="status">
          {clash}
        </p>
      )}
      {!query && (
        <div className="set-end">
          <button className="set-btn" disabled={Object.keys(s.shortcuts).length === 0} onClick={() => setSettings({ shortcuts: {} })}>
            Reset all shortcuts
          </button>
        </div>
      )}
    </>
  );
}

function Updates({ version, onCheck }: { version: string; onCheck: () => Promise<string> }) {
  const s = useSettings();
  const [status, setStatus] = useState<string | null>(null);
  return (
    <>
      <Group title="Updates">
        <Row title="Check for updates automatically" help="A few seconds after starting, then every few hours. Updates install only when you say so.">
          <Switch label="Check for updates automatically" on={s.checkUpdates} onChange={(checkUpdates) => setSettings({ checkUpdates })} />
        </Row>
        <Row title={`Cookbook ${version}`} help={status ?? 'Look for a newer version now.'}>
          <button
            className="set-btn"
            disabled={status === 'Checking…'}
            onClick={() => {
              setStatus('Checking…');
              void onCheck().then(setStatus, (e: unknown) => setStatus(`Couldn’t check: ${e instanceof Error ? e.message : String(e)}`));
            }}
          >
            Check now
          </button>
        </Row>
      </Group>
      <Group title="Privacy" plain>
        <Row
          title="Your writing stays on this device"
          help="Seasonings run here, and there is no account, no tracking and no crash reporting. Checking for updates is the only time Cookbook goes online."
        />
      </Group>
    </>
  );
}

function PageView({ book, onBook, sheet, onEditStyle }: Pick<Props, 'book' | 'onBook' | 'sheet' | 'onEditStyle'>) {
  const page = pageOf(book?.page);
  const set = (changes: Partial<PageSettings>) => onBook({ page: { ...page, ...changes } });
  const indent = resolveParagraphStyle(sheet, BODY).firstLineIndent;
  if (!book) return <p className="set-row-help">Open a recipe to change its layout.</p>;
  return (
    <>
      <Group title="Page">
        <Row title="Size" help="Used on screen, for printing, PDF and Word export.">
          <Select
            label="Size"
            value={page.size}
            options={Object.entries(PAGE_SIZES).map(([id, p]) => [id as PageSettings['size'], `${p.label} (${p.width} × ${p.height} in)`])}
            onChange={(size) => set({ size })}
          />
        </Row>
        <Row title="Margins" help="Top, bottom, left and right.">
          <Select label="Margins" value={page.margins} options={Object.entries(MARGINS).map(([id, m]) => [id as PageSettings['margins'], `${m.label} (${m.inches} in)`])} onChange={(margins) => set({ margins })} />
        </Row>
        <Row title="Indent first line" help="Off: every paragraph starts at the margin." words="indent paragraph">
          <Switch label="Indent first line" on={indent > 0} onChange={(on) => onEditStyle(BODY, { firstLineIndent: on ? 0.5 : 0 })} />
        </Row>
      </Group>
      <Group title="View">
        <Row title="Show pages as" help="Paper shows the sheet. Draft is a plain column of text.">
          <Seg
            label="Show pages as"
            value={page.view}
            options={[
              ['page', 'Paper'],
              ['draft', 'Draft'],
            ]}
            onChange={(view) => set({ view })}
          />
        </Row>
        <Row title="Zoom" help={`${keys('Mod-=')} and ${keys('Mod--')} also zoom the page.`}>
          <ZoomSlider zoom={page.zoom} fitted={100} onZoom={(zoom) => set({ zoom })} />
        </Row>
      </Group>
    </>
  );
}

const SIZES = [9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const SPACINGS = [1, 1.15, 1.5, 2];
const KERNING = {
  auto: { kerning: 'auto', letterSpacing: 0 },
  off: { kerning: 'none', letterSpacing: 0 },
  tight: { kerning: 'auto', letterSpacing: -1 },
  loose: { kerning: 'auto', letterSpacing: 2 },
} as const;

function Styles({ sheet, onEditStyle, onAddStyle, onRenameStyle }: Pick<Props, 'sheet' | 'onEditStyle' | 'onAddStyle' | 'onRenameStyle'>) {
  const [picked, setPicked] = useState(sheet.paragraph[0]?.id ?? 'body');
  const query = useContext(Query);
  const style = sheet.paragraph.find((p) => p.id === picked) ?? sheet.paragraph[0]!;
  const r = resolveParagraphStyle(sheet, style.id);
  const edit = (changes: Partial<ParagraphStyle>) => onEditStyle(style.id, changes);
  const shownStyles = useMemo(() => sheet.paragraph.filter((p) => matches(query, p.name, 'paragraph style font size indent spacing kerning')), [sheet, query]);
  if (query && shownStyles.length === 0 && !matches(query, 'character style strong emphasis underline')) return null;
  return (
    <>
      <div className="set-group">
        <h3 className="set-h3">Paragraph styles</h3>
        <div className="set-card set-card-plain set-row-host">
          <div className="set-styles set-row">
            <div className="set-style-list" role="listbox" aria-label="Paragraph styles">
              {shownStyles.map((p) => (
                <button key={p.id} role="option" aria-selected={p.id === style.id} className={`set-nav-item${p.id === style.id ? ' on' : ''}`} onClick={() => setPicked(p.id)}>
                  {p.name}
                </button>
              ))}
              <button className="set-btn" onClick={() => setPicked(onAddStyle(`${style.name} 2`, style.id))}>
                + New style
              </button>
            </div>
            <div className="set-style-grid">
              <label>
                <span className="set-row-help">Name</span>
                <input className="set-sel" key={style.id} defaultValue={style.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== style.name && onRenameStyle(style.id, e.target.value.trim())} />
              </label>
              <label>
                <span className="set-row-help">Font</span>
                <select className="set-sel" value={r.font} onFocus={lookForNewFonts} onChange={(e) => pickFont(e.target.value, (font) => edit({ font }))}>
                  <FontOptions current={r.font} />
                </select>
              </label>
              <label>
                <span className="set-row-help">Size</span>
                <select className="set-sel" value={r.size} onChange={(e) => edit({ size: Number(e.target.value) })}>
                  {[...new Set([...SIZES, r.size])].sort((a, b) => a - b).map((v) => (
                    <option key={v} value={v}>
                      {v} pt
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="set-row-help">Line spacing</span>
                <select className="set-sel" value={r.lineSpacing} onChange={(e) => edit({ lineSpacing: Number(e.target.value) })}>
                  {[...new Set([...SPACINGS, r.lineSpacing])].sort((a, b) => a - b).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="set-row-help">Kerning</span>
                <select
                  className="set-sel"
                  value={r.kerning === 'none' ? 'off' : r.letterSpacing < 0 ? 'tight' : r.letterSpacing > 0 ? 'loose' : 'auto'}
                  onChange={(e) => edit(KERNING[e.target.value as keyof typeof KERNING])}
                >
                  <option value="auto">Auto</option>
                  <option value="off">Off</option>
                  <option value="tight">Tight</option>
                  <option value="loose">Loose</option>
                </select>
              </label>
              <Measure label="First-line indent" unit="in" value={r.firstLineIndent} onChange={(firstLineIndent) => edit({ firstLineIndent })} />
              <Measure label="Left and right indent" unit="in" value={r.sideIndent} onChange={(sideIndent) => edit({ sideIndent })} />
              <Measure label="Space before" unit="pt" value={r.spaceBefore} onChange={(spaceBefore) => edit({ spaceBefore })} />
              <Measure label="Space after" unit="pt" value={r.spaceAfter} onChange={(spaceAfter) => edit({ spaceAfter })} />
              <label>
                <span className="set-row-help">Next paragraph</span>
                <select className="set-sel" value={style.next ?? style.id} onChange={(e) => edit({ next: e.target.value })}>
                  {sheet.paragraph.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="set-group">
        <h3 className="set-h3">Character styles</h3>
        <div className="set-card set-card-plain set-row-host">
          <div className="set-chips set-row" aria-label="Character styles">
            {sheet.character.map((c) => {
              const key = { strong: 'Mod-B', emphasis: 'Mod-I', underline: 'Mod-U' }[c.id];
              return (
                <span
                  key={c.id}
                  className="set-chip"
                  style={{ fontWeight: c.bold ? 800 : undefined, fontStyle: c.italic ? 'italic' : undefined, textDecoration: c.underline ? 'underline' : undefined, fontVariantCaps: c.smallCaps ? 'small-caps' : undefined }}
                >
                  {c.name}
                  {key ? ` · ${keys(binding(c.id) || key)}` : ''}
                </span>
              );
            })}
          </div>
          <p className="set-row-help">{isTouch() ? 'Apply them from the Format menu, or the writing bar above the keyboard.' : 'Apply them with the shortcuts, or a right-click on the page.'}</p>
        </div>
      </div>
    </>
  );
}

/** A number with its unit, saved when the field is left. */
function Measure({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(`${value} ${unit}`);
  useEffect(() => setText(`${value} ${unit}`), [value, unit]);
  return (
    <label>
      <span className="set-row-help">{label}</span>
      <input
        className="set-num set-num-wide"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number.parseFloat(text.replace(',', '.'));
          if (Number.isFinite(n) && n >= 0 && n <= (unit === 'in' ? 3 : 72)) onChange(n);
          else setText(`${value} ${unit}`);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

function Proofreading({ proof }: { proof: Proofreader }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Group title="Language">
        <Row title="Spelling" help="Saved with the recipe, so a co-author gets the same. A recipe that never chose follows your English in App Settings › General.">
          <Seg label="Spelling" value={proof.dialect} options={DIALECTS.map((d) => [d.id, d.name])} onChange={proof.setDialect} />
        </Row>
        <Row title="Your dictionary" help={`${proof.words.length} ${proof.words.length === 1 ? 'word' : 'words'}, kept with the recipe.`} words={proof.words.join(' ')}>
          <button className="set-btn" aria-expanded={editing} disabled={proof.words.length === 0} onClick={() => setEditing(!editing)}>
            Show words
          </button>
        </Row>
        {editing && (
          <div className="set-words">
            {proof.words.map((w) => (
              <span key={w} className="set-chip">
                {w}
                <button aria-label={`Remove ${w}`} onClick={() => proof.removeWord(w)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Group>
      <Group title="Checks">
        {RULE_GROUPS.flatMap((g) => g.rules).map((r) => (
          <Row key={r.id} title={r.label} help={CHECK_HELP[r.id] ?? 'Spicy Sally: 「 」 around the words, while Seasonings is open.'}>
            <Switch label={r.label} on={!proof.off.includes(r.id)} onChange={(on) => proof.setRuleOn(r.id, on)} />
          </Row>
        ))}
      </Group>
      <SallyList proof={proof} />
      <div className="set-end">
        <button className="set-btn" disabled={proof.ignoredCount === 0} onClick={proof.clearIgnored}>
          Bring back everything removed{proof.ignoredCount > 0 ? ` (${proof.ignoredCount})` : ''}
        </button>
      </div>
    </>
  );
}

/** Spicy Sally's list from the writer: phrases to mark and phrases to leave alone, saved when the box loses focus. */
function SallyList({ proof }: { proof: Proofreader }) {
  const saved = proof.list.join('\n');
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const save = () => {
    const lines = text.split('\n').map((l) => l.trimEnd());
    while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    if (lines.join('\n') !== saved) proof.setList(lines);
  };
  return (
    <Group title="Spicy Sally’s list">
      <Row
        title="Your own list"
        help="One per line, kept with the recipe. Sally marks each phrase, and “=>” gives her a fix. A line starting with - is never marked by any of her checks. {a|b} stands for either word."
        words="patterns custom words phrases exceptions style sally list"
      />
      <textarea
        className="set-list"
        aria-label="Spicy Sally’s list"
        spellCheck={false}
        rows={6}
        value={text}
        placeholder={'honestly\n{grinned|smirked} wryly\na myriad of => many\n-suddenly'}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </Group>
  );
}

function GoalSettings({ book, onBook, onExport }: Pick<Props, 'book' | 'onBook'> & { onExport: () => void }) {
  if (!book) return <p className="set-row-help">Open a recipe to set its goals.</p>;
  return (
    <>
      <Group title="Targets">
        <Row title="Words a day" help="Fills the ring in the bottom bar and keeps the streak.">
          <NumberField label="Words a day" value={book.dailyGoal ?? getSettings().dailyGoal} required onCommit={(dailyGoal) => onBook({ dailyGoal })} />
        </Row>
        <Row title="Whole recipe" help="Words on the Shelf you’re aiming for.">
          <NumberField label="Whole recipe target" value={book.bookTarget} placeholder="No target" onCommit={(bookTarget) => onBook({ bookTarget })} />
        </Row>
        <Row title="Deadline" help="Works out the words a day you need.">
          <input className="set-num set-date" type="date" aria-label="Deadline" value={book.deadline ?? ''} onChange={(e) => onBook({ deadline: e.target.value || undefined })} />
        </Row>
        <Row title="Weekends off don’t break the streak">
          <Switch label="Weekends off don’t break the streak" on={!!book.weekendsOff} onChange={(weekendsOff) => onBook({ weekendsOff })} />
        </Row>
      </Group>
      <Group title="Counting">
        <Row title="Count pasted text as written" help="Off, so pasting a chapter doesn’t fill today’s goal.">
          <Switch label="Count pasted text as written" on={!!book.countPasted} onChange={(countPasted) => onBook({ countPasted })} />
        </Row>
        <Row title="Writing history" help="writing-history.csv in the recipe’s folder.">
          <button className="set-btn" onClick={onExport}>
            Export CSV
          </button>
        </Row>
      </Group>
    </>
  );
}
