import { useEditorState, type Editor } from '@tiptap/react';
import { undoDepth } from '@tiptap/pm/history';
import { docWords } from '../editor/docStats';
import { GoalsPopup } from './GoalsPopup';
import { type Store, useStore } from './store';

/**
 * Numbers that change as the writer types, each in a component of its own, so a
 * keystroke re-renders the word count and not the Shelf, the Pantry or the toolbar.
 */

const fmt = (n: number) => n.toLocaleString('en');

/** Words in the open Item as it is now. Only the paragraph that changed is counted again. */
export function useLiveWords(editor: Editor | null): number | null {
  return useEditorState({ editor, selector: ({ editor }) => (editor ? docWords(editor.state.doc) : null) }) ?? null;
}

/** The open Item's word count on its Shelf row. */
export function LiveWords({ editor, saved }: { editor: Editor | null; saved: number }) {
  const total = useLiveWords(editor) ?? saved;
  return total > 0 ? <span className="tree-words">{fmt(total)}</span> : null;
}

type GoalsProps = Parameters<typeof GoalsPopup>[0];

/** The Goals pop-up in the footer, with the open Item's words counted as they are now. */
export function LiveGoals({ editor, item, savedItemWords, otherWords, ...rest }: Omit<GoalsProps, 'scene' | 'bookWords'> & {
  editor: Editor | null;
  /** The open Item, when it is on the Shelf. */
  item: { title: string; goal: number | null; onShelf: boolean } | null;
  /** The open Item's words as last saved, until the editor is ready. */
  savedItemWords: number;
  /** Words on the Shelf in every Item but the open one. */
  otherWords: number;
}) {
  const live = useLiveWords(editor);
  const words = item ? (live ?? savedItemWords) : 0;
  return <GoalsPopup {...rest} scene={item ? { title: item.title, words, goal: item.goal } : null} bookWords={otherWords + (item?.onShelf ? words : 0)} />;
}

export interface SaveState {
  /** Changes are waiting to be saved. */
  dirty: boolean;
  /** The last save didn't work; it is tried again shortly. */
  failed: boolean;
}

/** Saved, Saving… or Not saved, at the end of the footer. */
export function SavedStatus({ state, editor, where }: { state: Store<SaveState>; editor: Editor | null; where: string }) {
  const { dirty, failed } = useStore(state);
  const steps = useEditorState({ editor, selector: ({ editor }) => (editor ? undoDepth(editor.state) : 0) }) ?? 0;
  const title = [where, steps > 0 ? `Undo remembers ${fmt(steps)} ${steps === 1 ? 'step' : 'steps'}, even after closing` : ''].filter(Boolean).join('\n');
  return (
    <span className={`saved${failed ? ' is-failed' : dirty ? ' is-dirty' : ''}`} tabIndex={0} title={title}>
      {failed || dirty ? (
        <span className="saved-dot" aria-hidden="true" />
      ) : (
        <svg className="saved-tick" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      )}
      {failed ? 'Not saved' : dirty ? 'Saving…' : 'Saved'}
    </span>
  );
}
