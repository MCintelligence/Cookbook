import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BRAINSTORM_GROUPS, type BrainstormKind } from '../storage/brainstorm';
import { emptyLineAt, insertBrainstorm } from '../editor/brainstorm';
import { Menu, type MenuItem } from './Menu';
import { zoomOf } from './zoom';

interface Props {
  editor: Editor | null;
  kind: BrainstormKind;
}

/**
 * The + beside an empty line on a character or place page. It opens the
 * brainstorming cards, grouped under headings; picking one drops it into the
 * text at that line. Every card is optional.
 */
export function BrainstormPlus({ editor, kind }: Props) {
  const [menu, setMenu] = useState<{ pos: number; x: number; y: number } | null>(null);
  const at = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const pos = emptyLineAt(editor, kind);
      if (pos === null) return null;
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
      const page = dom?.closest('.cb-page');
      if (!dom || !page) return null;
      const line = dom.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      const zoom = zoomOf(page);
      return { pos, top: (line.top + line.height / 2 - box.top) / zoom, left: (line.left - box.left) / zoom };
    },
    equalityFn: (a, b) => a?.pos === b?.pos && a?.top === b?.top && a?.left === b?.left,
  });
  const shown = menu ?? (at && { pos: at.pos });
  if (!editor || !shown) return null;

  const items: MenuItem[] = BRAINSTORM_GROUPS.flatMap((g, i): MenuItem[] => {
    const cards = g.cards[kind];
    const add = (list: typeof cards) => () => {
      if (menu) insertBrainstorm(editor, menu.pos, list);
    };
    return [
      ...(i > 0 ? [{ separator: true } as const] : []),
      { heading: g.title },
      ...(g.addsAll ? [{ label: `All of ${g.title}`, hint: `${cards.length} cards`, onPick: add(cards) }] : []),
      ...cards.map((c) => ({ label: c.title, onPick: add([c]) })),
    ];
  });

  return (
    <>
      {at && (
        <button
          className="bs-plus"
          style={{ top: at.top - 11, left: Math.max(4, at.left - 30) }}
          aria-label="Add a brainstorming card"
          title="Add a brainstorming card"
          aria-haspopup="menu"
          // Keep the cursor on the line, so the cards go where it is.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ pos: at.pos, x: r.left, y: r.bottom + 4 });
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
      {menu && <Menu items={items} x={menu.x} y={menu.y} label="Brainstorming cards" onClose={() => setMenu(null)} />}
    </>
  );
}
