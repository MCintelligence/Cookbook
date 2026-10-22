import { type Editor } from '@tiptap/core';

/** The selected words, or the word under the cursor, trimmed; '' when there is none. */
export function selectedWords(editor: Editor): string {
  const { state } = editor;
  const { from, to, empty, $from } = state.selection;
  if (!empty) return state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const text = $from.parent.textContent;
  const at = $from.parentOffset;
  const before = /[\p{L}\p{N}'’-]*$/u.exec(text.slice(0, at))?.[0] ?? '';
  const after = /^[\p{L}\p{N}'’-]*/u.exec(text.slice(at))?.[0] ?? '';
  return (before + after).replace(/^['’-]+|['’-]+$/g, '');
}

/** Cut or copy from a menu, as the keyboard would. */
export function clip(editor: Editor, action: 'cut' | 'copy'): void {
  editor.view.focus();
  document.execCommand(action);
}

/**
 * Paste from a menu. Formatting comes through the same cleanup as a
 * keyboard paste; with `plain`, only the words. Returns false when the
 * clipboard can't be read this way, so the caller can suggest the keyboard.
 */
export async function pasteInto(editor: Editor, plain: boolean): Promise<boolean> {
  const { view } = editor;
  try {
    if (!plain && navigator.clipboard.read) {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) {
          view.focus();
          view.pasteHTML(await (await item.getType('text/html')).text());
          return true;
        }
      }
    }
    const text = await navigator.clipboard.readText();
    view.focus();
    if (plain) editor.chain().insertContent(text.replace(/\r\n?/g, '\n').split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run();
    else view.pasteText(text);
    return true;
  } catch {
    return false;
  }
}
