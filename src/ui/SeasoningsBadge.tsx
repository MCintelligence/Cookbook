import { useEditorState, type Editor } from '@tiptap/react';
import { type SeasoningId } from '../proofread/remarks';
import { sayingCount, tastePage } from '../proofread/tasting';

interface Props {
  editor: Editor | null;
  chosen: SeasoningId[];
  paused: boolean;
}

/**
 * The number beside Seasonings: how many picked seasonings, with their Check on, have something to say
 * about the open page. It reads the same counts as the panel's meters, kept per paragraph and per set of
 * underlines, so it runs no checks of its own; only this badge draws again, and only when the number changes.
 */
export function SeasoningsBadge({ editor, chosen, paused }: Props) {
  const count = useEditorState({
    editor,
    selector: ({ editor }) => (editor && !paused && chosen.length > 0 ? sayingCount(chosen, paused, tastePage(editor.state)) : 0),
  });
  if (!count) return null;
  const says = `${count} ${count === 1 ? 'seasoning has' : 'seasonings have'} something to say`;
  return (
    <>
      <span className="badge" aria-hidden="true" title={says}>
        {count}
      </span>
      <span className="sr-only">, {says}</span>
    </>
  );
}
