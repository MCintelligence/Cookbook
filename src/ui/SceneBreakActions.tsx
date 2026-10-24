import { useEditorState, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { zoomOf } from './zoom';

interface Props {
  editor: Editor | null;
  /** The title of the scene after this one in its folder, if there is one. */
  nextTitle: string | null;
  onSplit: (pos: number) => void;
  onMerge: () => void;
}

/** Shown beside a selected scene break: split the scene there, or pull the next scene in. */
export function SceneBreakActions({ editor, nextTitle, onSplit, onMerge }: Props) {
  const at = useEditorState({
    editor,
    selector: ({ editor }) => {
      const sel = editor?.state.selection;
      if (!editor || !(sel instanceof NodeSelection) || sel.node.type.name !== 'sceneBreak') return null;
      const dom = editor.view.nodeDOM(sel.from) as HTMLElement | null;
      const page = dom?.closest('.cb-page');
      if (!dom || !page) return null;
      return { pos: sel.from, top: (dom.getBoundingClientRect().top - page.getBoundingClientRect().top) / zoomOf(page) };
    },
  });
  if (!at) return null;
  return (
    <div className="break-actions" style={{ top: at.top - 14 }}>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onSplit(at.pos)}>
        Split into new page
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        disabled={!nextTitle}
        title={nextTitle ? `Add “${nextTitle}” to the end of this page` : 'This is the last page in its book'}
        onClick={onMerge}
      >
        Merge with next
      </button>
    </div>
  );
}
