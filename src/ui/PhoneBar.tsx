import { useEditorState, type Editor } from '@tiptap/react';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import { memo, type ReactNode } from 'react';
import { type BasicStyle, isFormatted, toggleFormat } from '../editor/extensions';
import { type MenuItem } from './Menu';

interface Props {
  editor: Editor | null;
  /** Whether the full format row (style, font, size, colour, alignment) is showing under the top bar. */
  tools: boolean;
  onTools: () => void;
  /** Opens a sheet of choices. Each list is built when its button is pressed. */
  onMenu: (label: string, items: MenuItem[]) => void;
  styles: () => MenuItem[];
  insert: () => MenuItem[];
  /** The table's own choices, when the cursor is in one. */
  table: () => MenuItem[] | null;
}

const icon = (d: string, extra?: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
    {extra}
  </svg>
);

/**
 * The phone's writing bar. It sits on top of the on-screen keyboard while the page has the
 * cursor, where a thumb already is, and holds what a keyboard shortcut does on a computer:
 * undo and redo, bold, italic and underline, the paragraph's style, lists and inserts.
 * Pressing a button never takes the cursor out of the page, so the keyboard stays up.
 */
export const PhoneBar = memo(function PhoneBar({ editor, tools, onTools, onMenu, styles, insert, table }: Props) {
  // A few letters that only change when a button's look should, so typing doesn't redraw the bar.
  const state =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        if (!editor) return '';
        const on = (style: BasicStyle) => (isFormatted(editor, style) ? '1' : '0');
        return `${undoDepth(editor.state) > 0 ? 'u' : '-'}${redoDepth(editor.state) > 0 ? 'r' : '-'}${on('strong')}${on('emphasis')}${on('underline')}${editor.isActive('table') ? 't' : '-'}`;
      },
    }) ?? '';
  if (!editor) return null;
  const [canUndo, canRedo, bold, italic, underline, inTable] = [state[0] === 'u', state[1] === 'r', state[2] === '1', state[3] === '1', state[4] === '1', state[5] === 't'];

  const button = (label: string, art: ReactNode, run: () => void, more: { pressed?: boolean; disabled?: boolean; menu?: boolean } = {}) => (
    <button
      type="button"
      className="pb-btn"
      aria-label={label}
      aria-pressed={more.pressed}
      aria-haspopup={more.menu ? 'menu' : undefined}
      disabled={more.disabled}
      // The press mustn't take the cursor from the page, or the keyboard would drop away under the thumb.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {art}
    </button>
  );
  const format = (style: BasicStyle) => () => {
    editor.commands.focus();
    toggleFormat(editor, style);
  };

  return (
    <div className="phone-bar" role="toolbar" aria-label="Writing">
      <div className="pb-scroll">
        {button('Undo', icon('M9 14 4 9l5-5', <path d="M4 9h10a6 6 0 0 1 0 12h-3" />), () => void editor.chain().focus().undo().run(), { disabled: !canUndo })}
        {button('Redo', icon('m15 14 5-5-5-5', <path d="M20 9H10a6 6 0 0 0 0 12h3" />), () => void editor.chain().focus().redo().run(), { disabled: !canRedo })}
        <span className="pb-sep" aria-hidden="true" />
        {button('Bold', <b className="pb-letter">B</b>, format('strong'), { pressed: bold })}
        {button('Italic', <i className="pb-letter">I</i>, format('emphasis'), { pressed: italic })}
        {button('Underline', <u className="pb-letter">U</u>, format('underline'), { pressed: underline })}
        <span className="pb-sep" aria-hidden="true" />
        {button('Paragraph style', icon('M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13'), () => onMenu('Paragraph style', styles()), { menu: true })}
        {button('Insert', icon('M12 5v14M5 12h14'), () => onMenu('Insert', insert()), { menu: true })}
        {inTable && button('Table', icon('M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14'), () => onMenu('Table', table() ?? []), { menu: true })}
        {button(tools ? 'Hide fonts and spacing' : 'Fonts and spacing', <span className="pb-letter pb-aa">Aa</span>, onTools, { pressed: tools })}
      </div>
      {button(
        'Hide the keyboard',
        icon('M4 5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM7 9h.01M11 9h.01M15 9h.01M8 12h8', <path d="m9 19 3 2.5 3-2.5" />),
        () => editor.commands.blur(),
      )}
    </div>
  );
});
