import { useEditorState, type Editor } from '@tiptap/react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { type BasicStyle, isFormatted, toggleFormat } from '../editor/extensions';
import { type Alignment, FONTS, type ParagraphStyle, type StyleSheet, darkPageColor, resolveParagraphStyle } from '../styles/styles';
import { BODY_STYLE } from '../editor/markdown';

interface Props {
  editor: Editor | null;
  sheet: StyleSheet;
  onEditStyle: (id: string, changes: Partial<ParagraphStyle>) => void;
  /** Makes a new paragraph style like `basedOn`, named `name`, and returns its id. */
  onAddStyle: (name: string, basedOn: string) => string;
  onRenameStyle: (id: string, name: string) => void;
}

const INDENTS = [0, 0.25, 0.5, 0.75, 1];
const SIDE_INDENTS = [0, 0.25, 0.5, 0.75, 1, 1.5];
const SPACES = [0, 3, 6, 9, 12, 18, 24];
const FORMATS: { style: BasicStyle; label: string; key: string; glyph: CSSProperties; letter: string }[] = [
  { style: 'strong', label: 'Bold (Strong style)', key: '⌘B', glyph: { fontWeight: 800 }, letter: 'B' },
  { style: 'emphasis', label: 'Italic (Emphasis style)', key: '⌘I', glyph: { fontStyle: 'italic', fontFamily: 'Literata, Georgia, serif' }, letter: 'I' },
  { style: 'underline', label: 'Underline (Underline style)', key: '⌘U', glyph: { textDecoration: 'underline' }, letter: 'U' },
];

const SIZES = [9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const SPACINGS = [1, 1.15, 1.5, 2];
const COLOURS = [
  { name: 'Ink', value: '#3B2A20' },
  { name: 'Black', value: '#111111' },
  { name: 'Walnut', value: '#6B4A2E' },
  { name: 'Plum', value: '#6B4A6E' },
  { name: 'Brick', value: '#A84A28' },
];
const KERNING = {
  auto: { label: 'Auto', kerning: 'auto', letterSpacing: 0 },
  off: { label: 'Off', kerning: 'none', letterSpacing: 0 },
  tight: { label: 'Tight', kerning: 'auto', letterSpacing: -1 },
  loose: { label: 'Loose', kerning: 'auto', letterSpacing: 2 },
} as const;
const ALIGNMENTS: { value: Alignment; label: string; lines: string }[] = [
  { value: 'left', label: 'Align left', lines: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  { value: 'center', label: 'Centre', lines: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { value: 'right', label: 'Align right', lines: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  { value: 'justify', label: 'Justify', lines: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
];

/**
 * One row. The Style menu applies a style to the paragraph; every other
 * control edits that style, so all paragraphs in it change together.
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

  const active =
    useEditorState({
      editor,
      selector: ({ editor }) =>
        editor
          ? {
              strong: isFormatted(editor, 'strong'),
              emphasis: isFormatted(editor, 'emphasis'),
              underline: isFormatted(editor, 'underline'),
              bullets: editor.isActive('bulletList'),
              numbers: editor.isActive('orderedList'),
              table: editor.isActive('table'),
            }
          : null,
    }) ?? null;
  // Naming a new style, or renaming the current one, takes the Style menu's place.
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [spacingOpen, setSpacingOpen] = useState(false);

  const styleId = current ?? BODY_STYLE;
  const style = resolveParagraphStyle(sheet, styleId);
  const named = sheet.paragraph.find((s) => s.id === styleId)?.name ?? 'Body';
  const disabled = !editor || current === null;
  const edits = `Changes every paragraph in the ${named} style`;
  const kerningKey =
    (Object.keys(KERNING) as (keyof typeof KERNING)[]).find(
      (k) => KERNING[k].kerning === style.kerning && KERNING[k].letterSpacing === style.letterSpacing,
    ) ?? 'auto';

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
  const noText = !editor;
  const edit = (changes: Partial<ParagraphStyle>) => {
    onEditStyle(styleId, changes);
    editor?.commands.focus();
  };

  return (
    <div role="toolbar" aria-label="Formatting" className="toolbar">
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
      <label className="tb-select" title={edits}>
        <select value={style.font} disabled={disabled} onChange={(e) => edit({ font: e.target.value })} aria-label="Font">
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="tb-select" title={edits}>
        <select value={style.size} disabled={disabled} onChange={(e) => edit({ size: Number(e.target.value) })} aria-label="Size in points">
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="tb-select" title={edits}>
        <span className="swatch" style={{ '--ink': style.color, '--ink-dark': darkPageColor(style.color) } as CSSProperties} aria-hidden="true" />
        <select value={style.color} disabled={disabled} onChange={(e) => edit({ color: e.target.value })} aria-label="Text colour">
          {COLOURS.some((c) => c.value === style.color) ? null : <option value={style.color}>Custom</option>}
          {COLOURS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <span className="tb-sep" />
      <div className="tb-align" role="group" aria-label="Bold, italic and underline">
        {FORMATS.map((f) => (
          <button
            key={f.style}
            aria-pressed={!!active?.[f.style]}
            aria-label={f.label}
            title={`${f.label}  ${f.key}`}
            disabled={noText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && toggleFormat(editor, f.style)}
          >
            <span className="tb-letter" style={f.glyph} aria-hidden="true">
              {f.letter}
            </span>
          </button>
        ))}
      </div>
      <span className="tb-sep" />
      <div role="radiogroup" aria-label="Alignment" className="tb-align" title={edits}>
        {ALIGNMENTS.map((a) => (
          <button
            key={a.value}
            role="radio"
            aria-checked={style.align === a.value}
            aria-label={a.label}
            disabled={disabled}
            onClick={() => edit({ align: a.value })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d={a.lines} />
            </svg>
          </button>
        ))}
      </div>
      <span className="tb-sep" />
      <div className="tb-align" role="group" aria-label="Lists and tables">
        <button
          aria-pressed={!!active?.bullets}
          aria-label="Bulleted list"
          title="Bulleted list  (type - and a space)"
          disabled={noText}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
            <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
          </svg>
        </button>
        <button
          aria-pressed={!!active?.numbers}
          aria-label="Numbered list"
          title="Numbered list  (type -1 and a space)"
          disabled={noText}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M3.5 9h3M3.5 14.5c.4-.7 2.8-1 2.8.6 0 1.2-2.8 2-2.8 3.4h3" />
          </svg>
        </button>
        <button
          aria-pressed={!!active?.table}
          aria-label="Insert a table"
          title="Insert a table (right-click it to add rows and columns)"
          disabled={noText || !!active?.table}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
            <path d="M3.5 10h17M3.5 14.5h17M9.5 5v14M15 5v14" />
          </svg>
        </button>
      </div>
      <span className="tb-sep" />
      <label className="tb-select" title={edits}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M10 6h10M10 12h10M10 18h10M4 8l2-3 2 3M4 16l2 3 2-3M6 5v14" />
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
      <label className="tb-select" title={edits}>
        <span className="tb-av" aria-hidden="true">AV</span>
        <select
          value={kerningKey}
          disabled={disabled}
          onChange={(e) => {
            const k = KERNING[e.target.value as keyof typeof KERNING];
            edit({ kerning: k.kerning, letterSpacing: k.letterSpacing });
          }}
          aria-label="Kerning and letter spacing"
        >
          {(Object.keys(KERNING) as (keyof typeof KERNING)[]).map((k) => (
            <option key={k} value={k}>
              {KERNING[k].label}
            </option>
          ))}
        </select>
      </label>
      <div className="tb-pop">
        <button
          className="tb-select tb-spacing"
          aria-expanded={spacingOpen}
          aria-haspopup="dialog"
          disabled={disabled}
          title={`Indents and space between paragraphs. ${edits}`}
          onClick={() => setSpacingOpen((o) => !o)}
        >
          <span aria-hidden="true">¶</span>
          <span className="tb-spacing-text">
            {fmtIn(style.firstLineIndent)} · {style.spaceBefore}/{style.spaceAfter} pt
          </span>
        </button>
        {spacingOpen && !disabled && (
          <Spacing
            style={style}
            named={named}
            onEdit={(changes) => onEditStyle(styleId, changes)}
            onClose={() => {
              setSpacingOpen(false);
              editor?.commands.focus();
            }}
          />
        )}
      </div>
    </div>
  );
}

const fmtIn = (inches: number) => (inches === 0 ? 'No indent' : `${inches}″`);

function Choice({ label, value, options, unit, onPick }: { label: string; value: number; options: number[]; unit: (v: number) => string; onPick: (v: number) => void }) {
  return (
    <label className="tb-choice">
      <span>{label}</span>
      <select value={value} onChange={(e) => onPick(Number(e.target.value))}>
        {options.includes(value) ? null : <option value={value}>{unit(value)}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {unit(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** First-line and side indents, and space above and below, for the current paragraph style. */
function Spacing({ style, named, onEdit, onClose }: { style: ReturnType<typeof resolveParagraphStyle>; named: string; onEdit: (c: Partial<ParagraphStyle>) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('select')?.focus();
    const down = (e: PointerEvent) => box.current && !box.current.parentElement!.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const inches = (v: number) => (v === 0 ? 'None' : `${v} in`);
  const points = (v: number) => (v === 0 ? 'None' : `${v} pt`);
  return (
    <div className="tb-popover" role="dialog" aria-label={`Spacing for ${named}`} ref={box}>
      <p className="tb-popover-note">Changes every paragraph in the {named} style.</p>
      <Choice label="First line" value={style.firstLineIndent} options={INDENTS} unit={inches} onPick={(v) => onEdit({ firstLineIndent: v })} />
      <Choice label="Both sides" value={style.sideIndent} options={SIDE_INDENTS} unit={inches} onPick={(v) => onEdit({ sideIndent: v })} />
      <Choice label="Space above" value={style.spaceBefore} options={SPACES} unit={points} onPick={(v) => onEdit({ spaceBefore: v })} />
      <Choice label="Space below" value={style.spaceAfter} options={SPACES} unit={points} onPick={(v) => onEdit({ spaceAfter: v })} />
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
