import { type Editor } from '@tiptap/core';
import { isTauri } from '../storage/platform';

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

/** What the clipboard holds as text and as formatted HTML; either may be missing. */
export interface ClipboardContents {
  text: string | null;
  html: string | null;
}

/**
 * Reads the clipboard for a menu paste. The desktop app reads it natively, since
 * the webview's own clipboard API asks the writer's permission first (and, on
 * Windows, never pastes again once that's refused). A browser asks as usual.
 */
async function readClipboard(): Promise<ClipboardContents> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ClipboardContents>('read_clipboard');
    } catch {
      // The phone apps have no native reader; the webview's own is next.
    }
  }
  let html: string | null = null;
  if (navigator.clipboard.read) {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      }
    } catch {
      // Some browsers only allow plain text.
    }
  }
  const text = await navigator.clipboard.readText();
  return { text, html };
}

/**
 * Paste from a menu. Formatting comes through the same cleanup as a
 * keyboard paste; with `plain`, only the words. Says 'empty' when the
 * clipboard holds no words (a picture, say), and 'unreadable' when it can't
 * be read this way, so the caller can suggest the keyboard.
 */
export async function pasteInto(editor: Editor, plain: boolean): Promise<{ pasted: string } | 'empty' | 'unreadable'> {
  const { view } = editor;
  let clip: ClipboardContents;
  try {
    clip = await readClipboard();
  } catch {
    return 'unreadable';
  }
  const text = clip.text ?? '';
  const html = plain || editor.isActive('codeBlock') ? null : clip.html;
  if (!html && !text) return 'empty';
  view.focus();
  if (html) view.pasteHTML(html);
  else if (plain) editor.chain().insertContent(text.replace(/\r\n?/g, '\n').split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run();
  else view.pasteText(text);
  return { pasted: text };
}
