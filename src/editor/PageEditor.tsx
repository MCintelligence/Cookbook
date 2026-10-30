import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { cookbookExtensions, type NextStyle } from './extensions';
import { parseMarkdown } from './markdown';
import { type SeasoningsRequest } from './seasonings';
import { UndoRecorder, type UndoLog } from './undoLog';

interface Props {
  /** The scene's Markdown body when it was opened. Remount (key) to load another scene. */
  initialBody: string;
  /** The scene's saved undo log, replayed so undo reaches back past when it was last closed. */
  undoLog: UndoLog | null;
  onRecorder: (recorder: UndoRecorder | null) => void;
  nextStyle: NextStyle;
  /** The text changed. The body isn't serialised here: that waits until it's saved or needed. */
  onChange: (editor: Editor) => void;
  onReady: (editor: Editor | null) => void;
  /** A note or footnote was added or clicked in the text; Seasonings should show it. */
  onSeasonings: (request: SeasoningsRequest) => void;
  /** The kind of page, read once when it opens: character and place pages get brainstorming cards. */
  cardKind?: string | null;
}

export function PageEditor({ initialBody, undoLog, onRecorder, nextStyle, onChange, onReady, onSeasonings, cardKind = null }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const nextStyleRef = useRef(nextStyle);
  nextStyleRef.current = nextStyle;
  const onSeasoningsRef = useRef(onSeasonings);
  onSeasoningsRef.current = onSeasonings;
  const recorder = useRef<UndoRecorder | null>(null);
  const onRecorderRef = useRef(onRecorder);
  onRecorderRef.current = onRecorder;

  const editor = useEditor({
    extensions: cookbookExtensions(
      (style) => nextStyleRef.current(style),
      (request) => onSeasoningsRef.current(request),
      cardKind,
    ),
    content: undoLog ? undoLog.base : parseMarkdown(initialBody),
    editorProps: { attributes: { class: 'cb-prose', spellcheck: 'false', 'aria-label': 'Item text' } },
    onUpdate: ({ editor }) => {
      if (recorder.current?.isReplaying) return;
      onChangeRef.current(editor);
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Replays the saved undo log once the editor is on screen. Running twice (React's
    // development mode does) is harmless: each run starts again from the log's base.
    const r = new UndoRecorder(editor);
    recorder.current = r;
    if (undoLog) r.restore(undoLog, initialBody);
    onReady(editor);
    onRecorderRef.current(r);
    return () => {
      r.destroy();
      recorder.current = null;
      onRecorderRef.current(null);
      onReady(null);
    };
    // The log and text are only read when the scene opens; the component is remounted for another scene.
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}
