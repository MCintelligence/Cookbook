import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Editor } from '@tiptap/react';
import { type PaletteItem, rank } from './Palette';
import { placeAt } from './zoom';

interface Props {
  editor: Editor;
  /** Where the / is. */
  at: number;
  items: PaletteItem[];
  onClose: () => void;
}

/**
 * The / insert menu, as in Notion and Ulysses: type / at the start of a line
 * (or after a space), then a few letters, and Enter turns the line into a
 * style, a list, a table or a scene break. The keyboard stays on the page.
 */
export function InsertMenu({ editor, at, items, onClose }: Props) {
  const box = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const shown = useMemo(() => rank(items, query).slice(0, 12), [items, query]);
  const state = useRef({ shown, index });
  state.current = { shown, index };

  useEffect(() => {
    // What follows the / is the search; leaving the line or deleting the / closes the menu.
    const update = () => {
      const { doc, selection } = editor.state;
      const head = selection.head;
      if (!selection.empty || head <= at || at >= doc.content.size || doc.textBetween(at, at + 1) !== '/' || doc.resolve(at).parent !== selection.$head.parent) return onClose();
      const typed = doc.textBetween(at + 1, head, '');
      if (typed.length > 30 || /\s\s/.test(typed)) return onClose();
      setQuery(typed);
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    editor.on('blur', onClose);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
      editor.off('blur', onClose);
    };
  }, [editor, at]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      const { shown, index } = state.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!shown.length) return;
        e.preventDefault();
        e.stopPropagation();
        setIndex((index + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
      } else if ((e.key === 'Enter' || e.key === 'Tab') && shown[index]) {
        e.preventDefault();
        e.stopPropagation();
        pick(shown[index]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Capture, so the page's own Enter (a new paragraph) doesn't run first.
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor, at]);

  const pick = (item: PaletteItem) => {
    // The / and the letters after it go, then the item runs on the line.
    editor.chain().focus().deleteRange({ from: at, to: editor.state.selection.head }).run();
    onClose();
    item.run();
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const caret = editor.view.coordsAtPos(at);
    const r = el.getBoundingClientRect();
    const below = caret.bottom + 6 + r.height <= window.innerHeight - 8;
    setPos(placeAt(el.parentElement, { left: Math.max(8, Math.min(caret.left, window.innerWidth - r.width - 8)), top: below ? caret.bottom + 6 : Math.max(8, caret.top - 6 - r.height) }));
  }, [at, shown.length]);

  useEffect(() => {
    box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <ul className="insert-menu" role="listbox" aria-label="Insert" ref={box} style={pos ?? { left: -9999, top: 0 }}>
      {shown.length === 0 && <li className="insert-empty">Nothing called “{query}”. Esc to keep typing.</li>}
      {shown.map((item, i) => (
        <li
          key={item.id}
          role="option"
          aria-selected={i === index}
          className="insert-item"
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => i !== index && setIndex(i)}
          onClick={() => pick(item)}
        >
          <span>{item.label}</span>
          {item.hint && <span className="insert-hint">{item.hint}</span>}
        </li>
      ))}
    </ul>
  );
}
