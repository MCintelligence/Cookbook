import { Extension } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { parseMarkdown } from '../editor/markdown';
import { getSettings } from '../settings';

/** Plain text that has Markdown in it: headings, quotes, lists, fences, or marks such as **this**. */
const MARKDOWN = /^(?:#{1,3} |> |[-*+] |\d+[.)] |- \[[ x]\] |```|\* \* \*$)|\*\*[^*\n]+\*\*|(?:^|\s)\*[^*\s][^*\n]*\*|(?:^|\s)_[^_\s][^_\n]*_|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)/m;

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN.test(text);
}

/**
 * Chef Mode has no toolbar, so Markdown is how text is formatted there, pasted as well as typed:
 * plain text with Markdown in it comes in formatted, as if it had been typed. Text copied with its
 * own formatting (from a web page or Word) is pasted as it always is.
 */
export const ChefMarkdownPaste = Extension.create({
  name: 'chefMarkdownPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            if (!getSettings().focus || getSettings().pastePlain) return false;
            const data = event.clipboardData;
            if (!data || data.types.includes('text/html')) return false;
            const text = data.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) return false;
            const { schema } = view.state;
            let content;
            try {
              content = schema.nodeFromJSON(parseMarkdown(text)).content;
            } catch {
              return false;
            }
            view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(content)).scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
