import { useEditorState, type Editor } from '@tiptap/react';
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { type Alignment, BODY, FONTS, type ParagraphStyle, type StyleSheet, darkPageColor, defaultStyles, resolveParagraphStyle } from '../styles/styles';
import { BODY_STYLE } from '../editor/markdown';
import { ColourWheel } from './ColourWheel';
import { MAX_SIZE, MIN_SIZE, matchStyles, parseSize, stepSize } from './combo';

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
 * One row, five controls. The Style menu applies a style to the paragraph;
 * the font, size, colour, alignment and line spacing edit that style, so every
 * paragraph in it changes together. Bold, italic and underline are on the
 * keyboard and in Markdown; indents, spacing and kerning are in Settings › Styles.
 */
export function Toolbar({ editor, sheet, onEditStyle, onAddStyle, onRenameStyle }: Props) {
  const current =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        if (!editor) return null;
        const { $from } = editor.state.selection;
        const block = $from.parent;
        if (block.type.name !== 'paragraph' || $from.depth !== 1) return null;
        return (block.attrs.style as string) || BODY_STYLE;
      },
    }) ?? null;
  // Naming a new style, or renaming the current one, takes the Style menu's place.
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [open, setOpen] = useState<'colour' | 'align' | null>(null);

  // A paragraph in a style the book no longer has is edited as Body, which is how it looks.
  const styleId = current && sheet.paragraph.some((s) => s.id === current) ? current : BODY_STYLE;
  const style = resolveParagraphStyle(sheet, styleId);
  const named = sheet.paragraph.find((s) => s.id === styleId)?.name ?? 'Body';
  const disabled = !editor || current === null;
  const edits = `Changes every paragraph in the ${named} style`;
  const alignment = ALIGNMENTS.find((a) => a.value === style.align) ?? ALIGNMENTS[0]!;

  const applyStyle = (id: string) => {
    editor?.chain().focus().updateAttributes('paragraph', { style: id }).run();
  };
  const finishNaming = (name: string | null) => {
    const mode = naming;
    setNaming(null);
    if (!name || !mode) return editor?.commands.focus();
    if (mode === 'rename') onRenameStyle(styleId, name);
    else applyStyle(onAddStyle(name, styleId));
    editor?.commands.focus();
  };
  const edit = (changes: Partial<ParagraphStyle>, keepFocus = false) => {
    onEditStyle(styleId, changes);
    if (!keepFocus) editor?.commands.focus();
  };
  const close = () => {
    setOpen(null);
    editor?.commands.focus();
  };

  return (
    <div role="toolbar" aria-label="Paragraph style" className="toolbar">
      {naming ? (
        <StyleName initial={naming === 'rename' ? named : `${named} 2`} label={naming === 'rename' ? `Rename ${named}` : `New style based on ${named}`} onDone={finishNaming} />
      ) : (
        <StyleBox
          styles={sheet.paragraph}
          current={named}
          disabled={disabled}
          onApply={applyStyle}
          onNew={() => setNaming('new')}
          onRename={() => setNaming('rename')}
          onCreate={(name) => applyStyle(onAddStyle(name, styleId))}
          onCancel={() => editor?.commands.focus()}
        />
      )}
      <span className="tb-sep" />
      <label className="tb-select tb-font" title={edits}>
        <select value={style.font} disabled={disabled} onChange={(e) => edit({ font: e.target.value })} aria-label="Font">
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <SizeBox size={style.size} disabled={disabled} title={edits} onSize={(size, keepFocus) => edit({ size }, keepFocus)} onCancel={() => editor?.commands.focus()} />
      <span className="tb-sep" />
      <Pop
        open={open === 'colour'}
        onClose={close}
        button={
          <button className="tb-select tb-button" aria-label="Text colour" aria-haspopup="dialog" aria-expanded={open === 'colour'} title={edits} disabled={disabled} onClick={() => setOpen(open === 'colour' ? null : 'colour')}>
            <span className="tb-wheel" aria-hidden="true" />
            <span className="tb-ink" style={{ '--ink': style.color, '--ink-dark': darkPageColor(style.color) } as CSSProperties} aria-hidden="true" />
            <Chevron />
          </button>
        }
      >
        <div className="tb-popover tb-colour" role="dialog" aria-label={`Text colour for ${named}`}>
          <ColourWheel
            value={style.color}
            onPick={(color) => edit({ color }, true)}
            onAutomatic={() => {
              edit({ color: styleId === BODY ? defaultStyles().paragraph[0]!.color : undefined }, true);
              close();
            }}
          />
        </div>
      </Pop>
      <Pop
        open={open === 'align'}
        onClose={close}
        button={
          <button className="tb-select tb-button" aria-label={`Alignment: ${alignment.label}`} aria-haspopup="menu" aria-expanded={open === 'align'} title={edits} disabled={disabled} onClick={() => setOpen(open === 'align' ? null : 'align')}>
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
              aria-checked={style.align === a.value}
              onClick={() => {
                edit({ align: a.value });
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
      <label className="tb-select" title={edits}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M10 6h10M10 12h10M10 18h10M4 8l2-3 2 3M4 16l2 3 2-3" />
        </svg>
        <select value={style.lineSpacing} disabled={disabled} onChange={(e) => edit({ lineSpacing: Number(e.target.value) })} aria-label="Line spacing">
          {SPACINGS.includes(style.lineSpacing) ? null : <option value={style.lineSpacing}>{style.lineSpacing}</option>}
          {SPACINGS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
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

type StyleChoice = { kind: 'style'; id: string; name: string } | { kind: 'create'; name: string } | { kind: 'new' } | { kind: 'rename' };

/**
 * The Style box, like Word's: pick from the list, or type a name. Typing
 * fills in the first style that starts with what was typed; Enter applies it.
 * A name no style has is never applied by accident: the list says so and
 * offers to make it a new style.
 */
function StyleBox({
  styles,
  current,
  disabled,
  onApply,
  onNew,
  onRename,
  onCreate,
  onCancel,
}: {
  styles: ParagraphStyle[];
  current: string;
  disabled: boolean;
  onApply: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(current);
  // What the person has typed, before the box filled in the rest; null when they haven't typed.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (typed === null) setText(current);
  }, [current, typed]);

  // Keeps the filled-in part of the name selected, so typing on replaces it.
  useLayoutEffect(() => {
    const el = input.current;
    if (typed === null || !el || document.activeElement !== el) return;
    el.setSelectionRange(text.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0, text.length);
  }, [typed, text]);

  const matches = typed === null ? styles : matchStyles(styles, typed);
  const choices: StyleChoice[] = matches.map((s) => ({ kind: 'style', id: s.id, name: s.name }));
  if (typed !== null && typed.trim() && !matches.length) choices.push({ kind: 'create', name: typed.trim() });
  if (typed === null) choices.push({ kind: 'new' }, { kind: 'rename' });

  const reset = () => {
    setTyped(null);
    setText(current);
    setOpen(false);
    setActive(-1);
  };
  const choose = (choice: StyleChoice) => {
    reset();
    if (choice.kind === 'style') onApply(choice.id);
    else if (choice.kind === 'create') onCreate(choice.name);
    else if (choice.kind === 'new') onNew();
    else onRename();
  };
  const type = (value: string, deleting: boolean) => {
    const found = deleting || !value ? [] : matchStyles(styles, value);
    // Only a name that starts with what was typed can be filled in.
    const fill = found[0] && found[0].name.toLowerCase().startsWith(value.toLowerCase()) ? found[0] : undefined;
    setTyped(value);
    setText(fill ? fill.name : value);
    setOpen(true);
    setActive(value && matchStyles(styles, value).length ? 0 : -1);
  };
  const enter = () => {
    const choice = choices[active];
    if (choice) return choose(choice);
    if (typed === null) {
      reset();
      return onCancel();
    }
    // A name no style has: leave it for the person to fix or make into a style.
    setOpen(true);
  };

  return (
    <div className="tb-pop">
      <div className={`tb-select tb-style tb-combo${open && typed !== null && !matches.length ? ' tb-invalid' : ''}`}>
        <span className="tb-tag">Style</span>
        <input
          ref={input}
          role="combobox"
          aria-label="Paragraph style"
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
              if (choice?.kind === 'style') setText(choice.name);
            } else if (e.key === 'Tab' && open && choices[active]?.kind === 'style') {
              // Tab accepts the filled-in name, as in Word.
              choose(choices[active]!);
            }
          }}
        />
        <button
          className="tb-combo-open"
          tabIndex={-1}
          aria-label="Show styles"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) return reset();
            input.current?.focus();
            setOpen(true);
          }}
        >
          <Chevron />
        </button>
      </div>
      {open && (
        <ListPopup id={listId} label="Paragraph styles">
          {typed !== null && !matches.length && <div className="tb-list-note">No style is called “{typed.trim()}”.</div>}
          {choices.map((c, i) => (
            <button
              key={c.kind === 'style' ? c.id : c.kind}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className={[c.kind === 'style' ? '' : 'tb-list-action', c.kind === 'new' ? 'tb-list-first-action' : '', c.kind === 'style' && c.name === current ? 'tb-list-current' : ''].join(' ').trim() || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              {c.kind === 'style' ? c.name : c.kind === 'create' ? `New style called “${c.name}”` : c.kind === 'new' ? 'New style from this paragraph…' : `Rename “${current}”…`}
            </button>
          ))}
        </ListPopup>
      )}
    </div>
  );
}

/**
 * The Size box: pick a size, type any size from 1 to 400 points, or roll the
 * mouse wheel over it to go up and down a point at a time. Anything that isn't
 * a size is turned away and the box goes back to the size the style has.
 */
function SizeBox({
  size,
  disabled,
  title,
  onSize,
  onCancel,
}: {
  size: number;
  disabled: boolean;
  title: string;
  onSize: (size: number, keepFocus: boolean) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const sizes = SIZES.includes(size) ? SIZES : [...SIZES, size].sort((a, b) => a - b);
  // The wheel handler is added once, so it reads these through refs.
  const latest = useRef({ size, disabled, onSize });
  latest.current = { size, disabled, onSize };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let travel = 0;
    const wheel = (e: WheelEvent) => {
      const { size, disabled, onSize } = latest.current;
      if (disabled || e.deltaY === 0) return;
      // React's wheel events can't stop the toolbar or page scrolling, so this is a plain listener.
      e.preventDefault();
      // A mouse wheel moves a notch at a time; a trackpad sends many small moves, so those add up first.
      travel += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
      if (Math.abs(travel) < 40 && Math.abs(e.deltaY) < 40) return;
      const next = stepSize(size, travel < 0);
      travel = 0;
      setText(null);
      setBad(false);
      if (next !== size) onSize(next, true);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const reset = () => {
    setText(null);
    setOpen(false);
    setBad(false);
  };
  const commit = (value: string) => {
    const next = parseSize(value);
    if (next === null) {
      setBad(true);
      setOpen(true);
      input.current?.select();
      return;
    }
    reset();
    onSize(next, false);
  };
  const step = (up: boolean) => {
    const next = stepSize(parseSize(text ?? '') ?? size, up);
    setText(null);
    setBad(false);
    onSize(next, true);
  };

  return (
    <div className="tb-pop">
      <div ref={box} className={`tb-select tb-size tb-combo${bad ? ' tb-invalid' : ''}`} title={`${title}. Roll the mouse wheel here to change the size.`}>
        <input
          ref={input}
          role="combobox"
          aria-label="Size in points"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={bad || undefined}
          inputMode="decimal"
          value={text ?? String(size)}
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
              commit(text ?? String(size));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              reset();
              onCancel();
            } else if (e.key === 'ArrowDown' && e.altKey) {
              e.preventDefault();
              setOpen(!open);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              step(e.key === 'ArrowUp');
            }
          }}
        />
        <button
          className="tb-combo-open"
          tabIndex={-1}
          aria-label="Show sizes"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) return reset();
            input.current?.focus();
            setOpen(true);
          }}
        >
          <Chevron />
        </button>
      </div>
      {open && (
        <ListPopup id={listId} label="Sizes" className="tb-size-list">
          {bad && <div className="tb-list-note">Type a size from {MIN_SIZE} to {MAX_SIZE} points.</div>}
          {sizes.map((s) => (
            <button key={s} role="option" tabIndex={-1} aria-selected={s === size} className={s === size ? 'tb-list-current' : undefined} onClick={() => {
              reset();
              onSize(s, false);
            }}>
              {s}
            </button>
          ))}
        </ListPopup>
      )}
    </div>
  );
}
