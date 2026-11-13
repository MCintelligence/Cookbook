import { Extension } from '@tiptap/core';
import { AllSelection, Plugin, PluginKey, type Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Where focus can go while the page's selection should still show: menus, the menu bar and the format toolbar. */
const KEEPS = '[role=menu], .menu, .menubar, .toolbar';

const key = new PluginKey<boolean>('keptSelection');

const keeps = (el: EventTarget | null) => el instanceof Element && !!el.closest(KEEPS);

/** Selected text to keep: a stretch of text, or everything after Select all (⌘A makes a selection of its own kind). */
const spans = (sel: Selection) => (sel instanceof TextSelection || sel instanceof AllSelection) && !sel.empty;

/** The selection to paint while it is kept, or null. */
export function keptRange(state: EditorState): { from: number; to: number } | null {
  if (!key.getState(state)) return null;
  const sel = state.selection;
  return spans(sel) ? { from: sel.from, to: sel.to } : null;
}

/**
 * Keeps the selected text highlighted while a menu or the toolbar has the
 * keyboard. A right-click menu takes focus from the page, and WebKit (the Mac
 * and Linux app) then stops drawing the selection, so the text looks
 * deselected even though it is still selected. This draws it instead until
 * the keyboard comes back to the page or goes somewhere else.
 */
export const KeptSelection = Extension.create({
  name: 'keptSelection',
  addProseMirrorPlugins() {
    const set = (view: EditorView, on: boolean) => {
      if (key.getState(view.state) !== on && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, on).setMeta('addToHistory', false));
    };
    return [
      new Plugin<boolean>({
        key,
        state: {
          init: () => false,
          apply: (tr, on) => (tr.getMeta(key) as boolean | undefined) ?? on,
        },
        props: {
          decorations(state) {
            const range = keptRange(state);
            return range
              ? DecorationSet.create(state.doc, [
                  Decoration.inline(range.from, range.to, {
                    class: 'cb-kept-selection',
                  }),
                ])
              : null;
          },
          attributes: (state): Record<string, string> => (key.getState(state) ? { class: 'cb-keeps-selection' } : {}),
          handleDOMEvents: {
            focus(view) {
              set(view, false);
              return false;
            },
            blur(view, e) {
              // Switching to another app hides the selection as usual.
              if (!document.hasFocus()) return false;
              if (keeps(e.relatedTarget) || keeps(document.activeElement)) set(view, true);
              // Some engines say where the focus went only once it has arrived.
              else
                requestAnimationFrame(() => {
                  if (!view.isDestroyed && !view.hasFocus() && keeps(document.activeElement)) set(view, true);
                });
              return false;
            },
          },
        },
        view(view) {
          // Anywhere else the keyboard or a press goes, the page lets go of the highlight.
          const away = (e: Event) => {
            if (key.getState(view.state) && !keeps(e.target) && !view.dom.contains(e.target as Node)) set(view, false);
          };
          document.addEventListener('focusin', away);
          document.addEventListener('pointerdown', away, true);
          return {
            destroy() {
              document.removeEventListener('focusin', away);
              document.removeEventListener('pointerdown', away, true);
            },
          };
        },
      }),
    ];
  },
});
