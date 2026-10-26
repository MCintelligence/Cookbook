import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { cookbookExtensions, type NextStyle } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { type SeasoningsRequest } from './seasonings';
import { UndoRecorder, type UndoLog } from './undoLog';

interface Props {
  /** The scene's Markdown body when it was opened. Remount (key) to load another scene. */
  initialBody: string;
  /** The scene's saved undo log, replayed so undo reaches back past when it was last closed. */
  undoLog: UndoLog | null;
  onRecorder: (recorder: UndoRecorder | null) => void;
  nextStyle: NextStyle;
  onChange: (body: string) => void;
  onReady: (editor: Editor | null) => void;
  /** A note or footnote was added or clicked in the text; Seasonings should show it. */
  onSeasonings: (request: SeasoningsRequest) => void;
}

export function PageEditor({ initialBody, undoLog, onRecorder, nextStyle, onChange, onReady, onSeasonings }: Props) {
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
    ),
    content: undoLog ? undoLog.base : parseMarkdown(initialBody),
    editorProps: { attributes: { class: 'cb-prose', spellcheck: 'false', 'aria-label': 'Chapter text' } },
    onUpdate: ({ editor }) => {
      if (recorder.current?.isReplaying) return;
      onChangeRef.current(serializeMarkdown(editor.getJSON() as NodeJSON));
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
