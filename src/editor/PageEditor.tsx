import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { cookbookExtensions, type NextStyle } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { type SeasoningsRequest } from './seasonings';

interface Props {
  /** The scene's Markdown body when it was opened. Remount (key) to load another scene. */
  initialBody: string;
  nextStyle: NextStyle;
  onChange: (body: string) => void;
  onReady: (editor: Editor | null) => void;
  /** A note or footnote was added or clicked in the text; Seasonings should show it. */
  onSeasonings: (request: SeasoningsRequest) => void;
}

export function PageEditor({ initialBody, nextStyle, onChange, onReady, onSeasonings }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const nextStyleRef = useRef(nextStyle);
  nextStyleRef.current = nextStyle;
  const onSeasoningsRef = useRef(onSeasonings);
  onSeasoningsRef.current = onSeasonings;

  const editor = useEditor({
    extensions: cookbookExtensions(
      (style) => nextStyleRef.current(style),
      (request) => onSeasoningsRef.current(request),
    ),
    content: parseMarkdown(initialBody),
    editorProps: { attributes: { class: 'cb-prose', spellcheck: 'true', 'aria-label': 'Scene text' } },
    onUpdate: ({ editor }) => onChangeRef.current(serializeMarkdown(editor.getJSON() as NodeJSON)),
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}
