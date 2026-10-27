import { useEditorState, type Editor } from '@tiptap/react';
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { type Alignment, FONTS, type ParagraphStyle, type StyleSheet, darkPageColor, resolveParagraphStyle } from '../styles/styles';
import { BODY_STYLE } from '../editor/markdown';
import { paragraphFormatOf } from '../editor/format';
import { dropTakenFormat, setParagraphFormat, setTextFormat, textFormatAt } from '../editor/extensions';
import { ColourWheel } from './ColourWheel';
import { MAX_SIZE, MAX_SPACING, MIN_SIZE, MIN_SPACING, matchStyles, parseSize, parseSpacing, stepSize, stepSpacing } from './combo';

interface Props {
  editor: Editor | null;
  sheet: StyleSheet;
  onEditStyle: (id: string, changes: Partial<ParagraphStyle>) => void;
  /** Makes a new paragraph style like `basedOn`, named `name`, and returns its id. */
  onAddStyle: (name: string, basedOn: string) => string;
  onRenameStyle: (id: string, name: string) => void;
}

const SIZES = [9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const SPACINGS = [1, 1.15, 1.5, 2];
const ALIGNMENTS: { value: Alignment; label: string; lines: string }[] = [
  { value: 'left', label: 'Align left', lines: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  { value: 'center', label: 'Centre', lines: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { value: 'right', label: 'Align right', lines: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  { value: 'justify', label: 'Justify', lines: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
];

const Chevron = () => (
  <svg className="tb-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * One row of controls that work like Word's and Scrivener's. The Style box
 * applies a paragraph style. Font, size and colour change the selected words,
 * or what is typed next when nothing is selected; alignment and line spacing
 * change the paragraphs the selection touches. None of them change a style:
 * that is Settings › Styles, or "Update style to match" in the Style list.
 */
export function Toolbar({ editor, sheet, onEditStyle, onAddStyle, onRenameStyle }: Props) {
  const at =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        if (!editor) return null;
        const { $from } = editor.state.selection;
        const block = $from.parent;
        const top = block.type.name === 'paragraph' && $from.depth === 1;
        return {
          // The paragraph style, only for top-level paragraphs (lists and tables have their own look).
          style: top ? (block.attrs.style as string) || BODY_STYLE : null,
          inText: block.isTextblock,
          text: textFormatAt(editor),
          paragraph: top ? paragraphFormatOf(block.attrs) : {},
        };
      },
    }) ?? null;
  const current = at?.style ?? null;
  // Naming a new style, or renaming the current one, takes the Style menu's place.
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [open, setOpen] = useState<'colour' | 'align' | null>(null);

  // A paragraph in a style the book no longer has is edited as Body, which is how it looks.
  const styleId = current && sheet.paragraph.some((s) => s.id === current) ? current : BODY_STYLE;
  const style = resolveParagraphStyle(sheet, styleId);
  const named = sheet.paragraph.find((s) => s.id === styleId)?.name ?? 'Body';
  const disabled = !editor || current === null;
  const textDisabled = !editor || !at?.inText;
  const text = at?.text ?? { font: null, size: null, color: null };
  const paragraph = at?.paragraph ?? {};
  const font = text.font === 'mixed' ? '' : (text.font ?? style.font);
  const size = text.size === 'mixed' || text.size === null ? style.size : text.size;
  const color = text.color === 'mixed' || text.color === null ? style.color : text.color;
  const align = paragraph.align ?? style.align;
  const lineSpacing = paragraph.lineSpacing ?? style.lineSpacing;
  const onWords = 'Changes the selected words, or what you type next';
  const onParagraphs = 'Changes the selected paragraphs';
  const alignment = ALIGNMENTS.find((a) => a.value === align) ?? ALIGNMENTS[0]!;
  // Anything set by hand here, which "Update style to match" can take into the style.
  const handSet = !!(paragraph.align || paragraph.lineSpacing || (text.font && text.font !== 'mixed') || (text.size && text.size !== 'mixed') || (text.color && text.color !== 'mixed'));

  const applyStyle = (id: string) => {
    // A new style brings its own alignment and spacing, as in Word.
    editor?.chain().focus().updateAttributes('paragraph', { style: id, align: null, lineSpacing: null }).run();
  };
  const finishNaming = (name: string | null) => {
    const mode = naming;
    setNaming(null);
    if (!name || !mode) return editor?.commands.focus();
    if (mode === 'rename') onRenameStyle(styleId, name);
    else applyStyle(onAddStyle(name, styleId));
    editor?.commands.focus();
  };
  /** Makes the style look like this paragraph, then lets the paragraph follow the style again. */
  const updateStyle = () => {
    if (!editor) return;
    const changes: Partial<ParagraphStyle> = { ...paragraph };
    if (text.font && text.font !== 'mixed') changes.font = text.font;
    if (text.size && text.size !== 'mixed') changes.size = text.size;
    if (text.color && text.color !== 'mixed') changes.color = text.color;
    onEditStyle(styleId, changes);
    dropTakenFormat(editor, editor.state.selection.$from.before(1), changes);
    editor.view.focus();
  };
  const words = (changes: Parameters<typeof setTextFormat>[1], keepFocus = false) => {
    if (!editor) return;
    setTextFormat(editor, changes);
    if (!keepFocus) editor.view.focus();
  };
  const paragraphs = (changes: Parameters<typeof setParagraphFormat>[1], keepFocus = false) => {
    if (!editor) return;
    setParagraphFormat(editor, changes);
    if (!keepFocus) editor.view.focus();
  };
  const close = () => {
    setOpen(null);
    editor?.view.focus();
  };

  return (
    <div role="toolbar" aria-label="Paragraph style" className="toolbar">
      {naming ? (
        <StyleName initial={naming === 'rename' ? named : `${named} 2`} label={naming === 'rename' ? `Rename ${named}` : `New style based on ${named}`} onDone={finishNaming} />
      ) : (
        <NameBox
          tag="Style"
          label="Paragraph style"
          listLabel="Styles"
          className="tb-style"
          items={sheet.paragraph}
          current={styleId}
          disabled={disabled}
          actions={[
            ...(handSet ? [{ id: 'update', label: `Update “${named}” to match this paragraph` }] : []),
            { id: 'new', label: 'New style from this paragraph…' },
            { id: 'rename', label: `Rename “${named}”…` },
          ]}
          missing={(typed) => `No style is called “${typed}”.`}
          onPick={(id) => applyStyle(id)}
          onAction={(id) => (id === 'update' ? updateStyle() : setNaming(id === 'new' ? 'new' : 'rename'))}
          onCreate={(name) => applyStyle(onAddStyle(name, styleId))}
          onCancel={() => editor?.view.focus()}
        />
      )}
      <span className="tb-sep" />
      <NameBox
        label="Font"
        listLabel="Fonts"
        className="tb-font"
        title={onWords}
        items={FONTS.map((f) => ({ id: f, name: f }))}
        current={font}
        disabled={textDisabled}
        missing={(typed) => `Cookbook has no font called “${typed}”.`}
        onPick={(font, keepFocus) => words({ font }, keepFocus)}
        onCancel={() => editor?.view.focus()}
      />
      <NumberBox
        label="Size in points"
        listLabel="Sizes"
        className="tb-size"
        title={onWords}
        value={size}
        blank={text.size === 'mixed'}
        presets={SIZES}
        disabled={textDisabled}
        parse={parseSize}
        step={stepSize}
        invalid={`Type a size from ${MIN_SIZE} to ${MAX_SIZE} points.`}
        onValue={(size, keepFocus) => words({ size }, keepFocus)}
        onCancel={() => editor?.view.focus()}
      />
      <span className="tb-sep" />
      <Pop
        open={open === 'colour'}
        onClose={close}
        button={
          <button className="tb-select tb-button" aria-label="Text colour" aria-haspopup="dialog" aria-expanded={open === 'colour'} title={onWords} disabled={textDisabled} onClick={() => setOpen(open === 'colour' ? null : 'colour')}>
            <span className="tb-wheel" aria-hidden="true" />
            <span className="tb-ink" style={{ '--ink': color, '--ink-dark': darkPageColor(color) } as CSSProperties} aria-hidden="true" />
            <Chevron />
          </button>
        }
      >
        <div className="tb-popover tb-colour" role="dialog" aria-label="Text colour">
          <ColourWheel
            value={color}
            onPick={(color) => words({ color }, true)}
            onAutomatic={() => {
              // Back to the style's colour.
              words({ color: null }, true);
              close();
            }}
          />
        </div>
      </Pop>
      <Pop
        open={open === 'align'}
        onClose={close}
        button={
          <button className="tb-select tb-button" aria-label={`Alignment: ${alignment.label}`} aria-haspopup="menu" aria-expanded={open === 'align'} title={onParagraphs} disabled={disabled} onClick={() => setOpen(open === 'align' ? null : 'align')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d={alignment.lines} />
            </svg>
            <Chevron />
          </button>
        }
      >
        <div className="tb-popover tb-menu" role="menu" aria-label="Alignment">
          {ALIGNMENTS.map((a) => (
            <button
              key={a.value}
              role="menuitemradio"
              aria-checked={align === a.value}
              onClick={() => {
                // Picking the style's own alignment takes the paragraph's off, so it follows the style again.
                paragraphs({ align: a.value === style.align ? null : a.value });
                setOpen(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d={a.lines} />
              </svg>
              {a.label}
            </button>
          ))}
        </div>
      </Pop>
      <NumberBox
        label="Line spacing"
        listLabel="Line spacings"
        className="tb-spacing"
        title={onParagraphs}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M10 6h10M10 12h10M10 18h10M4 8l2-3 2 3M4 16l2 3 2-3" />
          </svg>
        }
        value={lineSpacing}
        presets={SPACINGS}
        disabled={disabled}
        parse={parseSpacing}
        step={stepSpacing}
        invalid={`Type a spacing from ${MIN_SPACING} to ${MAX_SPACING}.`}
        onValue={(spacing, keepFocus) => paragraphs({ lineSpacing: spacing === style.lineSpacing ? null : spacing }, keepFocus)}
        onCancel={() => editor?.view.focus()}
      />
    </div>
  );
}

/** A toolbar button with a small pop-up under it, closed by Escape or a click elsewhere. */
function Pop({ open, onClose, button, children }: { open: boolean; onClose: () => void; button: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  return (
    <div className="tb-pop" ref={box}>
      {button}
      {open && children}
    </div>
  );
}

function StyleName({ initial, label, onDone }: { initial: string; label: string; onDone: (name: string | null) => void }) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name && name.trim() ? name.trim() : null);
  };
  return (
    <label className="tb-select tb-style tb-naming">
      <span className="tb-tag">{label.startsWith('Rename') ? 'Rename' : 'New style'}</span>
      <input
        aria-label={label}
        autoFocus
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(text);
          else if (e.key === 'Escape') finish(null);
        }}
      />
    </label>
  );
}

/** The pop-up list under a typeable box. Items take the mouse without taking focus from the box. */
function ListPopup({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  // Keeps the highlighted item, or else the current one, in view as the list scrolls.
  useLayoutEffect(() => {
    const item = list.current?.querySelector('[aria-selected="true"]') ?? list.current?.querySelector('.tb-list-current');
    item?.scrollIntoView({ block: 'nearest' });
  });
  return (
    <div ref={list} id={id} className={`tb-popover tb-menu tb-list ${className}`.trim()} role="listbox" aria-label={label} onMouseDown={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

/**
 * Rolling the mouse wheel over a box steps it up or down, as in Adobe's apps.
 * React's wheel events can't stop the toolbar or page scrolling, so this is a plain listener.
 */
function useWheelSteps(onStep: (up: boolean) => void) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onStep);
  latest.current = onStep;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let travel = 0;
    const wheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || el.querySelector('input:disabled')) return;
      e.preventDefault();
      // A mouse wheel moves a notch at a time; a trackpad sends many small moves, so those add up first.
      travel += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
      if (Math.abs(travel) < 40 && Math.abs(e.deltaY) < 40) return;
      const up = travel < 0;
      travel = 0;
      latest.current(up);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  return box;
}

/** The chevron that opens a typeable box's list. It never takes focus, so typing carries on. */
function OpenList({ label, open, disabled, input, onToggle }: { label: string; open: boolean; disabled: boolean; input: React.RefObject<HTMLInputElement | null>; onToggle: (open: boolean) => void }) {
  return (
    <button
      className="tb-combo-open"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!open) input.current?.focus();
        onToggle(!open);
      }}
    >
      <Chevron />
    </button>
  );
}

interface Named {
  id: string;
  name: string;
}

type Choice = { kind: 'item'; id: string; name: string } | { kind: 'create'; name: string } | { kind: 'action'; id: string; label: string };

/**
 * A box of names, like Word's Style and Font boxes: pick from the list, or
 * type. Typing fills in the first name that starts with what was typed;
 * Enter applies it. A name that isn't there is never applied by accident:
 * the list says so (and, if `onCreate` is given, offers to make it). The
 * mouse wheel over the box moves to the name above or below.
 */
function NameBox({
  tag,
  label,
  listLabel,
  className,
  title,
  items,
  current,
  disabled,
  actions = [],
  missing,
  onPick,
  onAction,
  onCreate,
  onCancel,
}: {
  tag?: string;
  label: string;
  listLabel: string;
  className: string;
  title?: string;
  items: readonly Named[];
  current: string;
  disabled: boolean;
  /** Shown under the names while nothing has been typed. */
  actions?: { id: string; label: string }[];
  /** What the list says when nothing matches the typing. */
  missing: (typed: string) => string;
  onPick: (id: string, keepFocus: boolean) => void;
  onAction?: (id: string) => void;
  onCreate?: (name: string) => void;
  onCancel: () => void;
}) {
  const currentName = items.find((s) => s.id === current)?.name ?? current;
  const [text, setText] = useState(currentName);
  // What the person has typed, before the box filled in the rest; null when they haven't typed.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (typed === null) setText(currentName);
  }, [currentName, typed]);

  // Keeps the filled-in part of the name selected, so typing on replaces it.
  useLayoutEffect(() => {
    const el = input.current;
    if (typed === null || !el || document.activeElement !== el) return;
    el.setSelectionRange(text.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0, text.length);
  }, [typed, text]);

  const box = useWheelSteps((up) => {
    const at = items.findIndex((s) => s.id === current);
    const next = items[Math.min(items.length - 1, Math.max(0, at + (up ? -1 : 1)))];
    reset();
    if (next && next.id !== current) onPick(next.id, true);
  });

  const matches = typed === null ? items : matchStyles(items, typed);
  const choices: Choice[] = matches.map((s) => ({ kind: 'item', id: s.id, name: s.name }));
  if (onCreate && typed !== null && typed.trim() && !matches.length) choices.push({ kind: 'create', name: typed.trim() });
  if (typed === null) choices.push(...actions.map((a) => ({ kind: 'action' as const, ...a })));

  const reset = () => {
    setTyped(null);
    setText(currentName);
    setOpen(false);
    setActive(-1);
  };
  const choose = (choice: Choice) => {
    reset();
    if (choice.kind === 'item') onPick(choice.id, false);
    else if (choice.kind === 'create') onCreate?.(choice.name);
    else onAction?.(choice.id);
  };
  const type = (value: string, deleting: boolean) => {
    const found = deleting || !value ? [] : matchStyles(items, value);
    // Only a name that starts with what was typed can be filled in.
    const fill = found[0] && found[0].name.toLowerCase().startsWith(value.toLowerCase()) ? found[0] : undefined;
    setTyped(value);
    setText(fill ? fill.name : value);
    setOpen(true);
    setActive(value && matchStyles(items, value).length ? 0 : -1);
  };
  const enter = () => {
    const choice = choices[active];
    if (choice) return choose(choice);
    if (typed === null) {
      reset();
      return onCancel();
    }
    // A name that isn't there: leave it for the person to fix (or make into a style).
    setOpen(true);
  };

  return (
    <div className="tb-pop">
      <div ref={box} className={`tb-select ${className} tb-combo${open && typed !== null && !matches.length ? ' tb-invalid' : ''}`} title={title}>
        {tag && <span className="tb-tag">{tag}</span>}
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-autocomplete="both"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          value={text}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => type(e.target.value, (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false)}
          onBlur={reset}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              enter();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              reset();
              onCancel();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!open) return setOpen(true);
              const step = e.key === 'ArrowDown' ? 1 : -1;
              const next = (active + step + choices.length) % choices.length;
              setActive(next);
              const choice = choices[next];
              if (choice?.kind === 'item') setText(choice.name);
            } else if (e.key === 'Tab' && open && choices[active]?.kind === 'item') {
              // Tab accepts the filled-in name, as in Word.
              choose(choices[active]!);
            }
          }}
        />
        <OpenList label={`Show ${listLabel.toLowerCase()}`} open={open} disabled={disabled} input={input} onToggle={(show) => (show ? setOpen(true) : reset())} />
      </div>
      {open && (
        <ListPopup id={listId} label={listLabel}>
          {typed !== null && !matches.length && <div className="tb-list-note">{missing(typed.trim())}</div>}
          {choices.map((c, i) => (
            <button
              key={c.kind === 'create' ? '\u0000create' : c.id}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className={[c.kind === 'item' ? '' : 'tb-list-action', c.kind === 'action' && i === matches.length ? 'tb-list-first-action' : '', c.kind === 'item' && c.id === current ? 'tb-list-current' : ''].join(' ').trim() || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              {c.kind === 'item' ? c.name : c.kind === 'create' ? `New style called “${c.name}”` : c.label}
            </button>
          ))}
        </ListPopup>
      )}
    </div>
  );
}

/**
 * A number box, like the Size box: pick from the list, type a number, roll
 * the mouse wheel over it or press the arrow keys to step it. Anything that
 * isn't a number it can take is turned away and the box goes back.
 */
function NumberBox({
  label,
  listLabel,
  className,
  title,
  icon,
  value,
  blank = false,
  presets,
  disabled,
  parse,
  step,
  invalid,
  onValue,
  onCancel,
}: {
  label: string;
  listLabel: string;
  className: string;
  title: string;
  icon?: ReactNode;
  value: number;
  /** Shows nothing, as when the selection has more than one size; stepping starts from `value`. */
  blank?: boolean;
  presets: readonly number[];
  disabled: boolean;
  parse: (text: string) => number | null;
  step: (value: number, up: boolean) => number;
  /** What the list says when the typing isn't a number the box takes. */
  invalid: string;
  onValue: (value: number, keepFocus: boolean) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const values = presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b);

  const stepBy = (up: boolean) => {
    const next = step(parse(text ?? '') ?? value, up);
    setText(null);
    setBad(false);
    if (next !== value) onValue(next, true);
  };
  const box = useWheelSteps(stepBy);

  const reset = () => {
    setText(null);
    setOpen(false);
    setBad(false);
  };
  const commit = (typed: string) => {
    const next = parse(typed);
    if (next === null) {
      setBad(true);
      setOpen(true);
      input.current?.select();
      return;
    }
    reset();
    onValue(next, false);
  };

  return (
    <div className="tb-pop">
      <div ref={box} className={`tb-select ${className} tb-combo${bad ? ' tb-invalid' : ''}`} title={title}>
        {icon}
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={bad || undefined}
          inputMode="decimal"
          value={text ?? (blank ? '' : String(value))}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onBlur={reset}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text ?? String(value));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              reset();
              onCancel();
            } else if (e.key === 'ArrowDown' && e.altKey) {
              e.preventDefault();
              setOpen(!open);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              stepBy(e.key === 'ArrowUp');
            }
          }}
        />
        <OpenList label={`Show ${listLabel.toLowerCase()}`} open={open} disabled={disabled} input={input} onToggle={(show) => (show ? setOpen(true) : reset())} />
      </div>
      {open && (
        <ListPopup id={listId} label={listLabel} className="tb-number-list">
          {bad && <div className="tb-list-note">{invalid}</div>}
          {values.map((v) => (
            <button
              key={v}
              role="option"
              tabIndex={-1}
              aria-selected={!blank && v === value}
              className={!blank && v === value ? 'tb-list-current' : undefined}
              onClick={() => {
                reset();
                onValue(v, false);
              }}
            >
              {v}
            </button>
          ))}
        </ListPopup>
      )}
    </div>
  );
}
