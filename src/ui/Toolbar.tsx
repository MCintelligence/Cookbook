import { useEditorState, type Editor } from '@tiptap/react';
import { type Alignment, FONTS, type ParagraphStyle, type StyleSheet, resolveParagraphStyle } from '../styles/styles';
import { BODY_STYLE } from '../editor/markdown';

interface Props {
  editor: Editor | null;
  sheet: StyleSheet;
  onEditStyle: (id: string, changes: Partial<ParagraphStyle>) => void;
}

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
export function Toolbar({ editor, sheet, onEditStyle }: Props) {
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
    editor?.chain().focus().updateAttributes('paragraph', { style: id }).run();
  };
  const edit = (changes: Partial<ParagraphStyle>) => {
    onEditStyle(styleId, changes);
    editor?.commands.focus();
  };

  return (
    <div role="toolbar" aria-label="Formatting" className="toolbar">
      <label className="tb-select tb-style">
        <span className="tb-tag">Style</span>
        <select value={styleId} disabled={disabled} onChange={(e) => applyStyle(e.target.value)} aria-label="Paragraph style">
          {sheet.paragraph.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
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
        <span className="swatch" style={{ background: style.color }} aria-hidden="true" />
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
    </div>
  );
}
