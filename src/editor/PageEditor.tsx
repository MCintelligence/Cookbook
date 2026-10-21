import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { cookbookExtensions, type NextStyle } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';

interface Props {
  /** The scene's Markdown body when it was opened. Remount (key) to load another scene. */
  initialBody: string;
  nextStyle: NextStyle;
  onChange: (body: string) => void;
  onReady: (editor: Editor | null) => void;
}

export function PageEditor({ initialBody, nextStyle, onChange, onReady }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const nextStyleRef = useRef(nextStyle);
  nextStyleRef.current = nextStyle;

  const editor = useEditor({
    extensions: cookbookExtensions((style) => nextStyleRef.current(style)),
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
