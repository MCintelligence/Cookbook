import { useEditorState, type Editor } from '@tiptap/react';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { type Alignment, BODY, FONTS, type ParagraphStyle, type StyleSheet, darkPageColor, defaultStyles, resolveParagraphStyle } from '../styles/styles';
import { BODY_STYLE } from '../editor/markdown';
import { ColourWheel } from './ColourWheel';

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

  const styleId = current ?? BODY_STYLE;
  const style = resolveParagraphStyle(sheet, styleId);
  const named = sheet.paragraph.find((s) => s.id === styleId)?.name ?? 'Body';
  const disabled = !editor || current === null;
  const edits = `Changes every paragraph in the ${named} style`;
  const alignment = ALIGNMENTS.find((a) => a.value === style.align) ?? ALIGNMENTS[0]!;

  const applyStyle = (id: string) => {
    if (id === '\u0000new' || id === '\u0000rename') return setNaming(id === '\u0000new' ? 'new' : 'rename');
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
        <label className="tb-select tb-style">
          <span className="tb-tag">Style</span>
          <select value={styleId} disabled={disabled} onChange={(e) => applyStyle(e.target.value)} aria-label="Paragraph style">
            {sheet.paragraph.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option disabled>──────</option>
            <option value={'\u0000new'}>New style from this paragraph…</option>
            <option value={'\u0000rename'}>Rename “{named}”…</option>
          </select>
        </label>
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
      <label className="tb-select tb-size" title={edits}>
        <select value={style.size} disabled={disabled} onChange={(e) => edit({ size: Number(e.target.value) })} aria-label="Size in points">
          {(SIZES.includes(style.size) ? SIZES : [...SIZES, style.size].sort((a, b) => a - b)).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
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
