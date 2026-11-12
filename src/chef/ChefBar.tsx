import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { SEASONINGS, type SeasoningId } from '../proofread/remarks';
import { hasSomethingToSay, isChecking, tastePage } from '../proofread/tasting';
import { Face } from '../ui/Faces';
import { Icon } from '../ui/Icon';
import { type MenuItem } from '../ui/Menu';
import { type ChefLook, DEFAULT_LOOK, INKS, LINE, PAPERS, PARA, READER_FONTS, SIZE, WIDTH, inkColour, paperColour } from './look';
import { notesState } from './notes';
import './chef.css';

interface Props {
  look: ChefLook;
  onLook: (change: Partial<ChefLook>) => void;
  editor: Editor | null;
  /** The Seasonings picked for the recipe, which of their Checks are off, and whether they are all resting. */
  chosen: SeasoningId[];
  unchecked: SeasoningId[];
  paused: boolean;
  /** Turns a seasoning's Check on or off (Daniel's dims the narration). */
  onCheck: (id: SeasoningId, on: boolean) => void;
  /** Picks a seasoning for the recipe, with its Check on. */
  onPick: (id: SeasoningId) => void;
  onPaused: (paused: boolean) => void;
  onMenu: (label: string, x: number, y: number, items: MenuItem[], opener?: HTMLElement) => void;
  onAddNote: () => void;
  noteKey: string;
  onLeave: () => void;
  leaveKey: string;
}

type Pop = 'paper' | 'ink' | 'font' | 'seasonings' | null;

const round = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Chef Mode's reader bar, along the bottom like an e-book reader's: the paper and ink, one font
 * for every word, text size, line height, space between paragraphs and the column's width, then
 * the Seasonings (their faces only) and Chef notes. Folded away, it leaves a small tab.
 *
 * Everything here changes how the page is shown on this device, never the recipe.
 */
export function ChefBar({ look, onLook, editor, chosen, unchecked, paused, onCheck, onPick, onPaused, onMenu, onAddNote, noteKey, onLeave, leaveKey }: Props) {
  const [pop, setPop] = useState<Pop>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pop) return;
    const away = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setPop(null);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape closes the pop-up first; the next one leaves Chef Mode.
      e.preventDefault();
      e.stopPropagation();
      setPop(null);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [pop]);

  if (!look.bar) {
    return (
      <button className="chef-tab" aria-label="Show the reader bar" title="Show the reader bar" onClick={() => onLook({ bar: true })}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    );
  }

  const toggle = (p: Pop) => setPop(pop === p ? null : p);
  const paper = paperColour(look);
  const ink = inkColour(look);
  const font = READER_FONTS.find((f) => f.id === look.font) ?? READER_FONTS[0]!;
  const step = (label: string, icon: ReactNode, value: string, down: (() => void) | null, up: (() => void) | null, className = '') => (
    <span className={`chef-step ${className}`} role="group" aria-label={`${label}: ${value}`} title={`${label}: ${value}`}>
      <button className="chef-btn small" aria-label={`Less ${label.toLowerCase()}`} disabled={!down} onClick={() => down?.()}>
        −
      </button>
      <span className="chef-step-face" aria-hidden="true">
        {icon}
      </span>
      <button className="chef-btn small" aria-label={`More ${label.toLowerCase()}`} disabled={!up} onClick={() => up?.()}>
        +
      </button>
    </span>
  );
  const line = look.line || 0;
  const lineValue = line ? line.toFixed(1) : 'as styled';
  const para = look.para;
  const paraValue = para < 0 ? 'as styled' : `${para} em`;
  const changed = (['paper', 'ink', 'font', 'size', 'line', 'para', 'width'] as const).some((k) => look[k] !== DEFAULT_LOOK[k]);

  return (
    <div className="chef-bar" ref={bar} role="toolbar" aria-label="Reader bar">
      <div className="chef-group">
        <button className="chef-btn" aria-haspopup="true" aria-expanded={pop === 'paper'} title="Paper" onClick={() => toggle('paper')}>
          <span className={`chef-dot${paper ? '' : ' page'}`} style={paper ? { background: paper } : undefined} />
          <span className="chef-label">Paper</span>
        </button>
        <button className="chef-btn" aria-haspopup="true" aria-expanded={pop === 'ink'} title="Text colour" onClick={() => toggle('ink')}>
          <span className="chef-ink-a" style={ink ? { color: ink, background: paper ?? undefined } : undefined}>
            A
          </span>
          <span className="chef-label">Ink</span>
        </button>
        <button className="chef-btn chef-font-btn" aria-haspopup="true" aria-expanded={pop === 'font'} title="Font for every word" onClick={() => toggle('font')}>
          <span className="chef-aa" style={font.stack ? { fontFamily: font.stack } : undefined}>
            Aa
          </span>
          <span className="chef-label">{font.name}</span>
        </button>
      </div>
      <span className="chef-sep" />
      <div className="chef-group">
        <span className="chef-step" role="group" aria-label={`Text size: ${look.size}%`} title={`Text size: ${look.size}%`}>
          <button className="chef-btn small" aria-label="Smaller text" disabled={look.size <= SIZE.min} onClick={() => onLook({ size: Math.max(SIZE.min, look.size - SIZE.step) })}>
            <span className="chef-a-small">A</span>
          </button>
          <button className="chef-size" title="Back to 100%" onClick={() => onLook({ size: 100 })}>
            {look.size}%
          </button>
          <button className="chef-btn small" aria-label="Bigger text" disabled={look.size >= SIZE.max} onClick={() => onLook({ size: Math.min(SIZE.max, look.size + SIZE.step) })}>
            <span className="chef-a-big">A</span>
          </button>
        </span>
        {step(
          'Line height',
          <Icon name="lineHeight" size={18} />,
          lineValue,
          line ? () => onLook({ line: line - LINE.step < LINE.min - 0.001 ? 0 : round(line - LINE.step, 0.1) }) : null,
          line < LINE.max ? () => onLook({ line: line ? round(line + LINE.step, 0.1) : LINE.start }) : null,
        )}
        {step(
          'Paragraph spacing',
          <Icon name="paraSpace" size={18} />,
          paraValue,
          para >= 0 ? () => onLook({ para: para - PARA.step < PARA.min - 0.001 ? -1 : para - PARA.step }) : null,
          para < PARA.max ? () => onLook({ para: para < 0 ? PARA.start : para + PARA.step }) : null,
        )}
        {step(
          'Width',
          <Icon name="colWidth" size={18} />,
          `${look.width} px`,
          look.width > WIDTH.min ? () => onLook({ width: Math.max(WIDTH.min, look.width - WIDTH.step) }) : null,
          look.width < WIDTH.max ? () => onLook({ width: Math.min(WIDTH.max, look.width + WIDTH.step) }) : null,
          'chef-wide-only',
        )}
        {changed && (
          <button
            className="chef-btn chef-reset"
            title="Back to the page as styled"
            onClick={() => onLook({ paper: DEFAULT_LOOK.paper, ink: DEFAULT_LOOK.ink, font: DEFAULT_LOOK.font, size: DEFAULT_LOOK.size, line: DEFAULT_LOOK.line, para: DEFAULT_LOOK.para, width: DEFAULT_LOOK.width })}
          >
            Reset
          </button>
        )}
      </div>
      <span className="chef-sep" />
      <div className="chef-group">
        <button className="chef-btn" aria-haspopup="true" aria-expanded={pop === 'seasonings'} title="Seasonings" onClick={() => toggle('seasonings')}>
          <Icon name="seasonings" size={20} />
        </button>
        <NotesButton editor={editor} look={look} onLook={onLook} onMenu={onMenu} onAddNote={onAddNote} noteKey={noteKey} />
      </div>
      <span className="chef-sep" />
      <div className="chef-group">
        <button className="chef-btn" title={`Leave Chef Mode (${leaveKey || 'Escape'})`} aria-label="Leave Chef Mode" onClick={onLeave}>
          <Icon name="leave" size={18} />
        </button>
        <button className="chef-btn" title="Fold the reader bar away" aria-label="Fold the reader bar away" onClick={() => onLook({ bar: false })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {pop === 'paper' && (
        <div className="chef-pop" role="dialog" aria-label="Paper">
          <div className="chef-swatches">
            {PAPERS.map((p) => (
              <button
                key={p.id}
                className={`chef-swatch${p.id === 'page' ? ' page' : ''}`}
                style={p.bg ? { background: p.bg } : undefined}
                aria-label={p.name}
                title={p.name}
                aria-pressed={look.paper === p.id}
                onClick={() => onLook({ paper: p.id })}
              />
            ))}
            <OwnColour label="A paper of your own" value={paper && !PAPERS.some((p) => p.id === look.paper) ? paper : null} onPick={(c) => onLook({ paper: c })} />
          </div>
        </div>
      )}
      {pop === 'ink' && (
        <div className="chef-pop" role="dialog" aria-label="Text colour">
          <div className="chef-swatches">
            {INKS.map((i) => (
              <button
                key={i.id}
                className={`chef-swatch ink${i.id === 'auto' ? ' auto' : ''}`}
                style={{ background: paper ?? undefined, color: i.color || (paper ? (ink ?? undefined) : undefined) }}
                aria-label={i.name}
                title={i.name}
                aria-pressed={look.ink === i.id}
                onClick={() => onLook({ ink: i.id })}
              >
                A
              </button>
            ))}
            <OwnColour label="An ink of your own" value={look.ink.startsWith('#') ? look.ink : null} onPick={(c) => onLook({ ink: c })} />
          </div>
        </div>
      )}
      {pop === 'font' && (
        <div className="chef-pop chef-fonts" role="dialog" aria-label="Font">
          {READER_FONTS.map((f) => (
            <button key={f.id} className="chef-font" aria-pressed={look.font === f.id} style={f.stack ? { fontFamily: f.stack } : undefined} onClick={() => (onLook({ font: f.id }), setPop(null))}>
              {f.name}
            </button>
          ))}
        </div>
      )}
      {pop === 'seasonings' && <SeasoningFaces editor={editor} chosen={chosen} unchecked={unchecked} paused={paused} onCheck={onCheck} onPick={onPick} onPaused={onPaused} />}
    </div>
  );
}

/** A swatch that opens the system's colour picker, for a colour of the writer's own. */
function OwnColour({ label, value, onPick }: { label: string; value: string | null; onPick: (colour: string) => void }) {
  return (
    <label className={`chef-swatch own${value ? '' : ' empty'}`} style={value ? { background: value } : undefined} title={label} aria-pressed={!!value}>
      <input type="color" aria-label={label} value={value ?? '#888888'} onChange={(e) => onPick(e.currentTarget.value)} />
      {!value && <span aria-hidden="true">+</span>}
    </label>
  );
}

/**
 * The Seasonings, as their faces and nothing else. A face lit up has its Check on (its marks show on
 * the page); a dot says it has something to say. A press turns its Check on or off; a seasoning not
 * yet picked for the recipe is picked.
 */
function SeasoningFaces({ editor, chosen, unchecked, paused, onCheck, onPick, onPaused }: Pick<Props, 'editor' | 'chosen' | 'unchecked' | 'paused' | 'onCheck' | 'onPick' | 'onPaused'>) {
  // Only small strings come out, so the faces draw again only when one of them changes.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return '';
      const page = tastePage(editor.state);
      return SEASONINGS.map((s) => `${isChecking(s.id, page) ? 1 : 0}${hasSomethingToSay(s.id, page) ? 1 : 0}`).join(' ');
    },
  });
  const flags = (state ?? '').split(' ');
  return (
    <div className={`chef-pop chef-faces${paused ? ' paused' : ''}`} role="dialog" aria-label="Seasonings">
      {SEASONINGS.map((s, i) => {
        const picked = chosen.includes(s.id);
        const on = picked && !paused && (s.id === 'daniel' ? flags[i]?.[0] === '1' : !unchecked.includes(s.id));
        const says = on && flags[i]?.[1] === '1';
        const what = !picked ? 'not picked' : paused ? 'resting' : on ? 'check on' : 'check off';
        return (
          <button
            key={s.id}
            className={`chef-face${on ? ' on' : ''}${picked ? '' : ' unpicked'}`}
            aria-pressed={on}
            aria-label={`${s.name}, ${s.role}: ${what}${says ? ', has something to say' : ''}`}
            title={`${s.name} (${s.role})`}
            onClick={() => {
              if (paused) onPaused(false);
              if (!picked) onPick(s.id);
              else if (!paused) onCheck(s.id, !on);
            }}
          >
            <Face id={s.id} size={34} />
            {says && <span className="chef-face-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Chef notes: how many there are on the page, and a menu to add one or change what shows. */
function NotesButton({ editor, look, onLook, onMenu, onAddNote, noteKey }: Pick<Props, 'editor' | 'look' | 'onLook' | 'onMenu' | 'onAddNote' | 'noteKey'>) {
  const count = useEditorState({
    editor,
    selector: ({ editor }) => {
      const s = notesState(editor);
      return s ? `${s.notes.filter((n) => !n.resolved).length}/${s.notes.length}` : '0/0';
    },
  });
  const [open, all] = (count ?? '0/0').split('/').map(Number) as [number, number];
  return (
    <button
      className="chef-btn"
      title="Chef notes"
      aria-haspopup="menu"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        // Up from the bar, as its other pop-ups open.
        onMenu(
          'Chef notes',
          r.left - 60,
          r.top - 132,
          [
            { label: 'New Chef note', hint: noteKey, disabled: !editor, onPick: onAddNote },
            { separator: true },
            { label: 'Show Chef notes', checked: look.notes, onPick: () => onLook({ notes: !look.notes }) },
            { label: 'Show resolved notes', checked: look.resolved, disabled: !look.notes || all === open, onPick: () => onLook({ resolved: !look.resolved }) },
          ],
          e.currentTarget,
        );
      }}
    >
      <Icon name="chefNote" size={19} />
      {open > 0 && <span className="chef-count">{open}</span>}
    </button>
  );
}
